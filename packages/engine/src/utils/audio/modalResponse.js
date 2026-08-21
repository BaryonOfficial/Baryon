import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import { getModalResponseModeKey } from "../../core/modalShell.js";
import { binIndexToFrequencyHz } from "./binFrequency.js";
import {
  buildModalDrivePhaseContext,
  measureModalComplexDrive,
  resolveCredibleSourceDriveComponents,
  resolveHarmonicDrivePhaseLocks,
} from "./modalDrivePhase.js";
import { normalizePhaseRad } from "./modalPhaseSlots.js";
import { clamp01, smoothstep } from "../math.js";
import {
  computeForcedModalTransfer,
  computeForcedModalTransferEnergy,
  distributeForcedModalTransfer,
} from "./modalTransfer.js";
import { requireModalQualityFactor } from "./modalDamping.js";

const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

const DEFAULT_MODAL_RESPONSE_BUDGET = 1;
const UNITY_MODAL_APPARATUS_TRANSFER = 1;
const DEFAULT_STORED_ENERGY_TAU_MS = 320;
const MODAL_SPECTRAL_RESPONSE_CACHE = new Map();
const MODAL_SPECTRAL_RESPONSE_CACHE_MAX_SIZE = 512;
const DRIVE_PHASE_MEASUREMENT_GATE = 0.003;
const DRIVE_PHASE_MEASUREMENT_MODE_LIMIT = 48;
const DRIVE_LOCK_PLV_ATTACK = 0.2;
const DRIVE_LOCK_PLV_RELEASE = 0.85;
const ENVELOPE_MAGNITUDE_EPSILON = 1e-6;
// `normalizedRms` is a calibrated sensor amplitude, not an energy. This
// reference maps the normal operating level to a unit modal drive while
// preserving pressure-squared dynamics below it.
const MODAL_INPUT_REFERENCE_NORMALIZED_AMPLITUDE = 0.07;

function readPreviousModalOscillatorState(previousState) {
  if (previousState == null) {
    return {
      energy: 0,
      rotationRad: 0,
      envelopeRe: 0,
      envelopeIm: 0,
      driveLockRe: 0,
      driveLockIm: 0,
    };
  }
  if (typeof previousState !== "object") {
    throw new TypeError("Previous modal oscillator state must be an object");
  }

  const hasEnvelopeState =
    Number.isFinite(previousState.modalOscillatorEnvelopeRe) &&
    Number.isFinite(previousState.modalOscillatorEnvelopeIm) &&
    Number.isFinite(previousState.modalOscillatorRotationRad);
  if (hasEnvelopeState) {
    const energy = clamp01(
      previousState.modalOscillatorEnvelopeRe ** 2 +
        previousState.modalOscillatorEnvelopeIm ** 2,
    );
    return {
      energy,
      rotationRad: normalizePhaseRad(previousState.modalOscillatorRotationRad),
      envelopeRe: previousState.modalOscillatorEnvelopeRe,
      envelopeIm: previousState.modalOscillatorEnvelopeIm,
      driveLockRe: Number.isFinite(previousState.modalOscillatorDriveLockRe)
        ? previousState.modalOscillatorDriveLockRe
        : 0,
      driveLockIm: Number.isFinite(previousState.modalOscillatorDriveLockIm)
        ? previousState.modalOscillatorDriveLockIm
        : 0,
    };
  }

  if (!Number.isFinite(previousState.modalResponseEnergy)) {
    throw new TypeError(
      "Previous modal oscillator state must declare modalResponseEnergy or a complex envelope",
    );
  }
  const energy = clamp01(previousState.modalResponseEnergy);

  // A state without its complex envelope can still preserve the published
  // lab-frame phase while rebuilding the envelope along the real axis.
  return {
    energy,
    rotationRad: normalizePhaseRad(previousState.oscillatorPhaseRad ?? 0),
    envelopeRe: Math.sqrt(energy),
    envelopeIm: 0,
    driveLockRe: 0,
    driveLockIm: 0,
  };
}

function computeModeOrder(mode) {
  if (Number.isFinite(mode?.order)) {
    return Math.max(0, mode.order);
  }

  const u = Number.isFinite(mode?.u) ? mode.u : 0;
  const v = Number.isFinite(mode?.v) ? mode.v : 0;
  const w = Number.isFinite(mode?.w) ? mode.w : 0;
  return Math.sqrt(u * u + v * v + w * w);
}

function resolveModeQualityFactor(mode) {
  return requireModalQualityFactor(
    mode?.qualityFactor,
    `Modal mode ${String(mode?.modeKey ?? "<unknown>")}`,
  );
}

function resolveModeLayer(mode) {
  if (mode?.layer === "source-coupled" || mode?.layer === "resonant") {
    return mode.layer;
  }

  throw new TypeError(
    `Modal mode ${String(mode?.modeKey ?? "<unknown>")} must declare a physical layer`,
  );
}

function updateDriveLockCoherenceVector({ previousState, driveLock }) {
  if (!driveLock) {
    return {
      driveLockRe: previousState.driveLockRe * DRIVE_LOCK_PLV_RELEASE,
      driveLockIm: previousState.driveLockIm * DRIVE_LOCK_PLV_RELEASE,
    };
  }
  const blend = DRIVE_LOCK_PLV_ATTACK;
  return {
    driveLockRe:
      previousState.driveLockRe * (1 - blend) +
      Math.cos(driveLock.lockedPhaseRad) * blend,
    driveLockIm:
      previousState.driveLockIm * (1 - blend) +
      Math.sin(driveLock.lockedPhaseRad) * blend,
  };
}

/**
 * Exact one-frame update of the per-mode driven-oscillator envelope.
 *
 * For the underdamped mode q̈ + 2ζωq̇ + ω²q = F(t), writing q = Re[Z·e^{iθ}]
 * with slowly varying complex envelope Z gives Ż = −ζωZ + F̃/(2iω), whose
 * exact solution over a frame with constant drive is
 * Z' = Z_ss + (Z − Z_ss)·e^{−ζωΔt}. The amplitude time constant is
 * 1/(ζω) = 2Q/ω on both sides. The slowly varying complex envelope has one
 * decay rate, so ring-up and ring-down cannot be tuned independently.
 * |Z_ss| = √targetEnergy preserves the calibrated steady-state levels; its
 * phase is drive-locked when a harmonic lock is available — −π/2 behind at
 * resonance, with an optional mode-specific forced-response detuning offset —
 * and otherwise the envelope keeps its current direction.
 *
 * Supplying |G(ω)|² for the steady level and integrating toward it here is the
 * correct decomposition of one resonator, not a double application of it: G
 * fixes where the envelope is heading, this fixes how fast it gets there. The
 * two are the frequency-domain and time-domain halves of the same pole.
 *
 * The alternative — snapping up when the forced envelope exceeds the retained
 * one and decaying otherwise — is a peak-hold. It rectifies modulated forcing
 * and flattens the troughs between hits; the regression below protects the
 * linear envelope from that asymmetric recurrence.
 *
 * Once the apparatus loss channels choose Q, the mode's amplitude lifetime is
 * 2Q/ω and its power-response linewidth is f/Q. Shortening the tail therefore
 * broadens the resonance by the same factor.
 */
function updateDrivenOscillatorState({
  modeFrequencyHz,
  qualityFactor,
  targetEnergy,
  spectralDrive,
  previousState,
  storedEnergyTauMs,
  deltaMs,
  driveLock = null,
}) {
  const frequencyHz = Number.isFinite(modeFrequencyHz)
    ? Math.max(0, modeFrequencyHz)
    : 0;
  const naturalAngularVelocityRadPerSec = TWO_PI * frequencyHz;
  // A locked mode oscillates at the drive frequency (n × the reference
  // fundamental), not its detuned natural frequency.
  const angularVelocityRadPerSec =
    driveLock &&
    Number.isFinite(driveLock.drivenAngularVelocityRadPerSec) &&
    driveLock.drivenAngularVelocityRadPerSec > 0
      ? driveLock.drivenAngularVelocityRadPerSec
      : naturalAngularVelocityRadPerSec;
  const deltaSeconds = Math.max(0, deltaMs) / 1000;
  const rotationRad = normalizePhaseRad(
    previousState.rotationRad + angularVelocityRadPerSec * deltaSeconds,
  );

  const amplitudeDecay = Math.exp(
    -Math.max(0, deltaMs) / (2 * Math.max(1, storedEnergyTauMs)),
  );
  const steadyAmplitude = Math.sqrt(clamp01(targetEnergy));
  const previousMagnitude = Math.hypot(
    previousState.envelopeRe,
    previousState.envelopeIm,
  );
  const steadyPhaseRad = driveLock
    ? normalizePhaseRad(
        driveLock.lockedPhaseRad -
          Math.PI / 2 +
          (driveLock.responsePhaseOffsetRad ?? 0),
      )
    : previousMagnitude > ENVELOPE_MAGNITUDE_EPSILON
      ? Math.atan2(previousState.envelopeIm, previousState.envelopeRe)
      : 0;
  const steadyRe = steadyAmplitude * Math.cos(steadyPhaseRad);
  const steadyIm = steadyAmplitude * Math.sin(steadyPhaseRad);
  const quality = requireModalQualityFactor(qualityFactor, "Modal oscillator");
  const dampedNaturalAngularVelocityRadPerSec =
    naturalAngularVelocityRadPerSec *
    Math.sqrt(Math.max(0, 1 - 1 / (4 * quality * quality)));
  const residualRotationRad =
    (dampedNaturalAngularVelocityRadPerSec - angularVelocityRadPerSec) *
    deltaSeconds;
  const residualCosine = Math.cos(residualRotationRad);
  const residualSine = Math.sin(residualRotationRad);
  const residualRe = previousState.envelopeRe - steadyRe;
  const residualIm = previousState.envelopeIm - steadyIm;
  const envelopeRe =
    steadyRe +
    amplitudeDecay * (residualRe * residualCosine - residualIm * residualSine);
  const envelopeIm =
    steadyIm +
    amplitudeDecay * (residualRe * residualSine + residualIm * residualCosine);
  const retainedEnergy = clamp01(
    envelopeRe * envelopeRe + envelopeIm * envelopeIm,
  );
  const envelopePhaseRad =
    retainedEnergy > 0 ? Math.atan2(envelopeIm, envelopeRe) : 0;
  const phaseRad = normalizePhaseRad(rotationRad + envelopePhaseRad);

  const lockVector = updateDriveLockCoherenceVector({
    previousState,
    driveLock,
  });
  const driveLockPlv = clamp01(
    Math.hypot(lockVector.driveLockRe, lockVector.driveLockIm),
  );
  const phaseAuthority = clamp01(
    Math.max(spectralDrive, retainedEnergy) * (frequencyHz > 0 ? 1 : 0),
  );
  const baseCoherence = clamp01(
    smoothstep(0.0005, 0.04, retainedEnergy) *
      smoothstep(0.0005, 0.08, Math.max(spectralDrive, retainedEnergy)),
  );

  return {
    retainedEnergy,
    modalResponseMemoryCoefficient: amplitudeDecay,
    oscillatorPhaseRad: phaseRad,
    oscillatorAngularVelocityRadPerSec: angularVelocityRadPerSec,
    oscillatorPhaseAuthority: phaseAuthority,
    // A harmonic lock's phase-locking value scales coherence: an unstable
    // lock must not authorize confident signed cancellation.
    oscillatorPhaseCoherence: driveLock
      ? clamp01(
          baseCoherence *
            driveLockPlv *
            clamp01(driveLock.temporalDominance ?? 1),
        )
      : baseCoherence,
    signedModalCoefficient: Math.sqrt(retainedEnergy) * Math.cos(phaseRad),
    modalOscillatorRotationRad: rotationRad,
    modalOscillatorEnvelopeRe: envelopeRe,
    modalOscillatorEnvelopeIm: envelopeIm,
    modalOscillatorDriveLockRe: lockVector.driveLockRe,
    modalOscillatorDriveLockIm: lockVector.driveLockIm,
    modalOscillatorDriveLockPlv: driveLockPlv,
    modalOscillatorDrivePhaseLocked: Boolean(driveLock),
    modalOscillatorHarmonicOrder: driveLock?.harmonicOrder ?? 0,
    modalResponseDriveFrequencyHz:
      angularVelocityRadPerSec > 0 ? angularVelocityRadPerSec / TWO_PI : 0,
    modalResponseTemporalDominance: driveLock
      ? clamp01(driveLock.temporalDominance ?? 1)
      : 0,
  };
}

/**
 * Off-resonance forcing that the per-mode measurement cannot see.
 *
 * The exact drive is probed at each mode's own frequency, which captures a
 * component sitting on a mode but not one falling between them — and in a
 * cavity whose low modes are far apart, most bass notes fall between them.
 * Replacing that measurement with a transfer was tried and is wrong: the
 * transfer is smooth where the measurement is sharp, so the render stopped
 * following the music and the patterns vibrated in place. This ADDS to it
 * instead.
 *
 * What gets added has to vanish at both ends. A component's strongest modal
 * transfer, `peak`, is how well it lines up with any mode at all: one at
 * resonance, small between modes. `1 - peak` is then the share no probe could
 * have measured, so a component sitting on a mode adds nothing here and is
 * never counted twice. But the cavity also barely answers a drive that is far
 * from every mode, so the same `peak` scales how much of that missed share
 * actually couples. The product is largest for a drive NEAR a mode without
 * sitting on it — between the low modes, or under the acoustic floor where the
 * response is stiffness-controlled rather than absent — and goes to zero both
 * on resonance and out in the gaps, which is what keeps near-silent input from
 * being handed a full share of drive.
 *
 * @returns {Float64Array | null} per-mode coupling to add to the measured drive
 */
function computeForcedOffResonanceCoupling({ components, modes, inputEnergy }) {
  const modeCount = modes?.length ?? 0;
  if (!components?.length || modeCount === 0 || !(inputEnergy > EPSILON)) {
    return null;
  }

  const modeFrequenciesHz = new Float64Array(modeCount);
  const modeQualityFactors = new Float64Array(modeCount);
  for (let modeIndex = 0; modeIndex < modeCount; modeIndex += 1) {
    const mode = modes[modeIndex];
    modeFrequenciesHz[modeIndex] =
      mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
    modeQualityFactors[modeIndex] = resolveModeQualityFactor(mode);
  }

  const coupling = new Float64Array(modeCount);
  const weights = new Float64Array(modeCount);
  let coupledAny = false;
  for (const component of components) {
    const componentEnergy = Math.max(0, component?.sourceEnergy ?? 0);
    if (!(componentEnergy > 0)) {
      continue;
    }
    const peakTransfer = distributeForcedModalTransfer({
      driveHz: component.frequencyHz,
      modeFrequenciesHz,
      modeQualityFactors,
      modeCount,
      out: weights,
    });
    const uncaptured = clamp01(1 - peakTransfer);
    if (!(peakTransfer > 0) || !(uncaptured > 0)) {
      continue;
    }
    const couplingEnergy =
      (componentEnergy * peakTransfer * uncaptured) / inputEnergy;
    for (let modeIndex = 0; modeIndex < modeCount; modeIndex += 1) {
      coupling[modeIndex] += couplingEnergy * weights[modeIndex];
    }
    coupledAny = true;
  }
  return coupledAny ? coupling : null;
}

function getModeProfile(mode) {
  const qualityFactor = resolveModeQualityFactor(mode);
  const modeFrequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
  const explicitApparatusTransfer = mode?.apparatusTransfer;
  const apparatusTransfer = clamp01(
    Number.isFinite(explicitApparatusTransfer)
      ? explicitApparatusTransfer
      : UNITY_MODAL_APPARATUS_TRANSFER,
  );
  const storedEnergyTauMs = computeStoredEnergyTimeConstantMs({
    modeFrequencyHz,
    qualityFactor,
  });
  return {
    qualityFactor,
    apparatusTransfer,
    dampingRatio: 1 / (2 * qualityFactor),
    storedEnergyTauMs,
  };
}

function computePhysicalModalTransfer({ mode, apparatusTransfer }) {
  const order = computeModeOrder(mode);
  const couplingStrength = clamp01(mode?.sourceCouplingEnergy ?? 1);
  const phaseConfidence = clamp01(
    mode?.phaseConfidence ??
      mode?.phaseAuthority ??
      mode?.phaseCoherence ??
      mode?.coherence ??
      1,
  );
  const persistence = clamp01(mode?.persistence ?? mode?.modalPersistence ?? 1);
  // Persistence is observer/admission telemetry. It is published for
  // diagnostics but cannot attenuate physical forcing or create another
  // temporal envelope beside the oscillator.
  // This packet field is the apparatus transmission term consumed by the
  // modal-response boundary. Unity is the canonical transmission when no
  // measured per-mode loss is declared; frequency and order cannot invent an
  // additional attenuation channel.
  const dampingEnvelope = clamp01(apparatusTransfer);

  return {
    modalOrder: order,
    couplingStrength,
    phaseConfidence,
    persistence,
    dampingEnvelope,
    // Source overlap and apparatus transmission set modal forcing. Phase
    // confidence is observer telemetry; multiplying diagonal shell energy by
    // it would make broadband music physically quieter than a tone with the
    // same measured energy.
    physicalTransfer: clamp01(couplingStrength * dampingEnvelope),
  };
}

function getInputEnergy(fftLinearAmplitudes) {
  if (
    !(fftLinearAmplitudes instanceof Float32Array) ||
    fftLinearAmplitudes.length === 0
  ) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < fftLinearAmplitudes.length; index += 1) {
    const amplitude = Math.max(0, fftLinearAmplitudes[index] ?? 0);
    total += amplitude * amplitude;
  }
  return total;
}

const EMPTY_SPECTRAL_DRIVE_CONTEXT = Object.freeze({
  binIndices: new Int32Array(0),
  binCount: 0,
  inputEnergy: 0,
});

// Scratch buffers reused across frames to avoid allocating thousands of
// per-bin objects every analysis tick. Analysis is single-threaded and each
// context is consumed synchronously within the frame that built it.
let spectralDriveScratchIndices = new Int32Array(0);

function buildSpectralDriveContext(fftLinearAmplitudes) {
  if (
    !(fftLinearAmplitudes instanceof Float32Array) ||
    fftLinearAmplitudes.length === 0
  ) {
    return EMPTY_SPECTRAL_DRIVE_CONTEXT;
  }

  if (spectralDriveScratchIndices.length < fftLinearAmplitudes.length) {
    spectralDriveScratchIndices = new Int32Array(fftLinearAmplitudes.length);
  }
  let binCount = 0;
  let inputEnergy = 0;
  for (let index = 1; index < fftLinearAmplitudes.length; index += 1) {
    const amplitude = fftLinearAmplitudes[index] ?? 0;
    if (!(amplitude > 0)) {
      continue;
    }

    const binEnergy = amplitude * amplitude;
    inputEnergy += binEnergy;
    spectralDriveScratchIndices[binCount] = index;
    binCount += 1;
  }

  return {
    binIndices: spectralDriveScratchIndices,
    binCount,
    inputEnergy,
  };
}

function computeInputEnergyScale({ inputRms, normalizedInputAmplitude }) {
  const normalizedAmplitude = Number.isFinite(normalizedInputAmplitude)
    ? clamp01(
        normalizedInputAmplitude / MODAL_INPUT_REFERENCE_NORMALIZED_AMPLITUDE,
      )
    : smoothstep(0.0007, 0.008, inputRms);
  // Modal target energy follows acoustic pressure squared. Source
  // normalization calibrates the sensor; squaring its amplitude preserves
  // actual loudness dynamics instead of turning any audible input into a
  // unit-energy excitation.
  return normalizedAmplitude * normalizedAmplitude;
}

export function computeModalInputEnergyScale({
  inputRms = 0,
  normalizedInputAmplitude,
}) {
  return computeInputEnergyScale({ inputRms, normalizedInputAmplitude });
}

export function computeModalFrequencyResponse({
  binFrequencyHz,
  modeFrequencyHz,
  qualityFactor,
}) {
  return clamp01(
    computeForcedModalTransferEnergy({
      driveHz: binFrequencyHz,
      modeHz: modeFrequencyHz,
      qualityFactor,
    }),
  );
}

function computeModalForcedResponsePhaseOffsetRad({
  driveFrequencyHz,
  modeFrequencyHz,
  qualityFactor,
}) {
  const transfer = computeForcedModalTransfer({
    driveHz: driveFrequencyHz,
    modeHz: modeFrequencyHz,
    qualityFactor,
  });
  // The oscillator owner historically stores phase relative to the resonant
  // -π/2 quadrature. Derive that offset from the same complex pole that owns
  // magnitude rather than maintaining a second detuning formula.
  return normalizePhaseRad(transfer.phaseRad + Math.PI / 2);
}

function getModalSpectralResponseWeights({
  binCount,
  sampleRate,
  modeFrequencyHz,
  qualityFactor,
}) {
  const key = [binCount, sampleRate, modeFrequencyHz, qualityFactor].join(":");
  const cached = MODAL_SPECTRAL_RESPONSE_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const weights = new Float64Array(Math.max(0, binCount ?? 0));
  for (let index = 1; index < weights.length; index += 1) {
    weights[index] = computeModalFrequencyResponse({
      binFrequencyHz: binIndexToFrequencyHz(index, weights.length, sampleRate),
      modeFrequencyHz,
      qualityFactor,
    });
  }

  MODAL_SPECTRAL_RESPONSE_CACHE.set(key, weights);
  if (
    MODAL_SPECTRAL_RESPONSE_CACHE.size > MODAL_SPECTRAL_RESPONSE_CACHE_MAX_SIZE
  ) {
    const oldestKey = MODAL_SPECTRAL_RESPONSE_CACHE.keys().next().value;
    MODAL_SPECTRAL_RESPONSE_CACHE.delete(oldestKey);
  }
  return weights;
}

function computeModalSpectralDrive({
  fftLinearAmplitudes,
  sampleRate,
  modeFrequencyHz,
  qualityFactor,
  inputEnergy = getInputEnergy(fftLinearAmplitudes),
  spectralDriveContext = null,
}) {
  if (sampleRate <= 0 || modeFrequencyHz <= 0 || inputEnergy <= EPSILON) {
    return 0;
  }

  // The context must be built from the same magnitude buffer so its bin
  // indices stay inside the response-weight table.
  const context =
    spectralDriveContext ?? buildSpectralDriveContext(fftLinearAmplitudes);
  if (context.binCount === 0) {
    return 0;
  }
  const responseWeights = getModalSpectralResponseWeights({
    binCount: fftLinearAmplitudes?.length ?? 0,
    sampleRate,
    modeFrequencyHz,
    qualityFactor,
  });

  let weightedEnergy = 0;
  for (let bin = 0; bin < context.binCount; bin += 1) {
    const binIndex = context.binIndices[bin];
    const binAmplitude = Math.max(0, fftLinearAmplitudes[binIndex] ?? 0);
    const weightedBinEnergy =
      binAmplitude * binAmplitude * (responseWeights[binIndex] ?? 0);
    weightedEnergy += weightedBinEnergy;
  }

  return clamp01(weightedEnergy / Math.max(EPSILON, inputEnergy));
}

function computeStoredEnergyTimeConstantMs({ modeFrequencyHz, qualityFactor }) {
  const frequencyHz = Number.isFinite(modeFrequencyHz)
    ? Math.max(0, modeFrequencyHz)
    : 0;
  const q = requireModalQualityFactor(
    qualityFactor,
    "Modal stored-energy response",
  );
  if (frequencyHz <= 0) {
    return DEFAULT_STORED_ENERGY_TAU_MS;
  }
  return Math.max(1, (q / (TWO_PI * frequencyHz)) * 1000);
}

function normalizeModalResponseBudget(entries, budget) {
  const rawEnergy = entries.reduce(
    (total, entry) => total + entry.modalResponseEnergy,
    0,
  );
  if (rawEnergy <= 0) {
    return {
      energy: 0,
      scale: 1,
      rawEnergy: 0,
    };
  }

  const scale =
    rawEnergy > budget
      ? (budget / Math.max(EPSILON, rawEnergy)) * (1 - 4 * Number.EPSILON)
      : 1;
  const amplitudeScale = Math.sqrt(scale);
  for (const entry of entries) {
    entry.modalResponseRawEnergy = entry.modalResponseEnergy;
    entry.modalResponseBudgetScale = scale;
    entry.modalResponseEnergy = clamp01(entry.modalResponseEnergy * scale);
    entry.displayAmplitude = Math.sqrt(entry.modalResponseEnergy);
    entry.signedModalCoefficient *= amplitudeScale;
    // This budget belongs to the projected representation. The oscillator
    // envelope remains the pre-projection physical state that rings down on
    // the next frame.
  }
  return {
    energy: entries.reduce(
      (total, entry) => total + entry.modalResponseEnergy,
      0,
    ),
    scale,
    rawEnergy,
  };
}

function sumModalEnergyByLayer(entries, layer) {
  return entries.reduce(
    (total, entry) =>
      entry.layer === layer ? total + (entry.modalResponseEnergy ?? 0) : total,
    0,
  );
}

// Energy explained by the present drive. A driven oscillator at or below
// steady state has E = D·exposure·transfer ≤ D, so min(E, D) ≈ E; a ringing
// tail has D ≈ 0, so its stored energy contributes nothing. Consumers use
// this to separate current-signal authority from stored/decay energy.
function sumModalCurrentSignalEnergyByLayer(entries, layer) {
  return entries.reduce(
    (total, entry) =>
      entry.layer === layer
        ? total +
          Math.min(
            entry.modalResponseEnergy ?? 0,
            entry.modalResponseDrive ?? 0,
          )
        : total,
    0,
  );
}

function averageEntryMetric(entries, key) {
  if (entries.length === 0) {
    return 0;
  }
  return (
    entries.reduce((total, entry) => total + clamp01(entry?.[key] ?? 0), 0) /
    entries.length
  );
}

function buildModalResponseCandidates({
  modes,
  fftLinearAmplitudes,
  sampleRate,
  previousOscillatorStates,
  hasInput,
  inputEnergy,
  inputEnergyScale,
  spectralDriveContext,
  exactDriveResult = null,
  offResonanceCoupling = null,
}) {
  const candidates = [];
  for (let modeIndex = 0; modeIndex < (modes?.length ?? 0); modeIndex += 1) {
    const mode = modes[modeIndex];
    const modeKey =
      mode?.modeKey ?? buildModalTopologyModeKey(mode?.u, mode?.v, mode?.w);
    const layer = resolveModeLayer(mode);
    const profile = getModeProfile(mode);
    const modeFrequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
    const previousState = readPreviousModalOscillatorState(
      previousOscillatorStates?.get?.(modeKey),
    );
    const estimatorDrive = exactDriveResult
      ? clamp01(exactDriveResult.responseEnergyByMode?.[modeIndex] ?? 0)
      : hasInput
        ? computeModalSpectralDrive({
            fftLinearAmplitudes,
            sampleRate,
            modeFrequencyHz,
            qualityFactor: profile.qualityFactor,
            inputEnergy,
            spectralDriveContext,
          })
        : 0;
    const spectralDrive = offResonanceCoupling
      ? clamp01(estimatorDrive + (offResonanceCoupling[modeIndex] ?? 0))
      : estimatorDrive;
    const physicalTransfer = computePhysicalModalTransfer({
      mode,
      apparatusTransfer: profile.apparatusTransfer,
    });
    candidates.push({
      mode,
      modeKey,
      layer,
      profile,
      modeFrequencyHz,
      previousState,
      spectralDrive,
      physicalTransfer,
      // Recomputed rather than read from the estimator's own target, which
      // knows only the measured part of the drive.
      targetEnergy:
        spectralDrive * inputEnergyScale * physicalTransfer.physicalTransfer,
    });
  }
  return candidates;
}

function collapseExactDriveResultToShells(
  exactDriveResult,
  { familyShellIndices, familyKeyEntries, shellKeys },
  shellCount,
) {
  if (!exactDriveResult) {
    return null;
  }
  const responseEnergyByMode = new Float32Array(shellCount);
  const targetEnergyByMode = new Float32Array(shellCount);
  for (
    let familyIndex = 0;
    familyIndex < familyShellIndices.length;
    familyIndex += 1
  ) {
    const shellIndex = familyShellIndices[familyIndex];
    responseEnergyByMode[shellIndex] = Math.max(
      responseEnergyByMode[shellIndex],
      Math.max(0, exactDriveResult.responseEnergyByMode?.[familyIndex] ?? 0),
    );
    targetEnergyByMode[shellIndex] = Math.max(
      targetEnergyByMode[shellIndex],
      Math.max(0, exactDriveResult.targetEnergyByMode?.[familyIndex] ?? 0),
    );
  }
  for (let shellIndex = 0; shellIndex < shellCount; shellIndex += 1) {
    responseEnergyByMode[shellIndex] = clamp01(
      responseEnergyByMode[shellIndex],
    );
    targetEnergyByMode[shellIndex] = clamp01(targetEnergyByMode[shellIndex]);
  }

  const shellIndexByFamilyKey = new Map();
  for (const [familyKey, shellIndex] of familyKeyEntries) {
    shellIndexByFamilyKey.set(familyKey, shellIndex);
  }
  const measurementByShell = new Map();
  for (const measurement of exactDriveResult.measurements ?? []) {
    const shellIndex = shellIndexByFamilyKey.get(measurement?.modeKey);
    if (!Number.isFinite(shellIndex)) {
      continue;
    }
    const existing = measurementByShell.get(shellIndex);
    if (
      !existing ||
      (measurement?.driveWeight ?? 0) > (existing?.driveWeight ?? 0)
    ) {
      measurementByShell.set(shellIndex, {
        ...measurement,
        modeKey: shellKeys[shellIndex],
      });
    }
  }

  return {
    ...exactDriveResult,
    responseEnergyByMode,
    targetEnergyByMode,
    measurements: Array.from(measurementByShell.values()),
  };
}

function buildModalResponseShellRepresentation({
  modes,
  previousOscillatorStates,
  exactDriveResult,
}) {
  const shells = [];
  const shellIndexByKey = new Map();
  const familyShellIndices = [];
  const familyKeyEntries = [];
  const shellKeys = [];

  for (
    let familyIndex = 0;
    familyIndex < (modes?.length ?? 0);
    familyIndex += 1
  ) {
    const family = modes[familyIndex];
    const responseModeKey = getModalResponseModeKey(family);
    let shellIndex = shellIndexByKey.get(responseModeKey);
    if (!Number.isFinite(shellIndex)) {
      shellIndex = shells.length;
      shellIndexByKey.set(responseModeKey, shellIndex);
      shellKeys.push(responseModeKey);
      shells.push({
        mode: {
          ...family,
          modeKey: responseModeKey,
          responseModeKey,
        },
        families: [],
      });
    }
    shells[shellIndex].families.push(family);
    familyShellIndices[familyIndex] = shellIndex;
    familyKeyEntries.push([family?.modeKey, shellIndex]);
  }

  const shellModes = shells.map((shell) => shell.mode);
  const shellPreviousStates = new Map();
  for (const shell of shells) {
    const responseModeKey = shell.mode.modeKey;
    const previous =
      previousOscillatorStates?.get?.(responseModeKey) ??
      shell.families
        .map((family) => previousOscillatorStates?.get?.(family?.modeKey))
        .find(Boolean);
    if (previous) {
      shellPreviousStates.set(responseModeKey, previous);
    }
  }

  return {
    shells,
    shellModes,
    previousOscillatorStates: shellPreviousStates,
    exactDriveResult: collapseExactDriveResultToShells(
      exactDriveResult,
      { familyShellIndices, familyKeyEntries, shellKeys },
      shells.length,
    ),
  };
}

function expandShellResponseEntries(shellEntries, shells) {
  const shellEntryByKey = new Map(
    shellEntries.map((entry) => [entry.modeKey, entry]),
  );
  const familyEntries = [];
  for (const shell of shells) {
    const shellEntry = shellEntryByKey.get(shell.mode.modeKey);
    if (!shellEntry) {
      continue;
    }
    for (const family of shell.families) {
      const sourceProjectionWeight = Number.isFinite(
        family?.sourceProjectionWeight,
      )
        ? family.sourceProjectionWeight
        : 1;
      const projectionMagnitude = Math.abs(sourceProjectionWeight);
      const projectionEnergy = projectionMagnitude * projectionMagnitude;
      familyEntries.push({
        ...shellEntry,
        ...family,
        modeKey: family.modeKey,
        responseModeKey: shell.mode.modeKey,
        sourceProjectionWeight,
        modalResponseDrive: shellEntry.modalResponseDrive * projectionEnergy,
        modalResponseDriveShare:
          shellEntry.modalResponseDriveShare * projectionEnergy,
        modalResponseEnergy: shellEntry.modalResponseEnergy * projectionEnergy,
        modalResponseRawEnergy:
          (shellEntry.modalResponseRawEnergy ??
            shellEntry.modalResponseEnergy) * projectionEnergy,
        displayAmplitude: shellEntry.displayAmplitude * projectionMagnitude,
        signedModalCoefficient:
          shellEntry.signedModalCoefficient * sourceProjectionWeight,
      });
    }
  }
  return familyEntries;
}

function resolveModalDrivePhaseLocks({
  candidates,
  timeDomainData,
  sampleRate,
  hasInput,
}) {
  if (!hasInput) {
    return new Map();
  }
  const drivePhaseContext = buildModalDrivePhaseContext({
    timeDomainData,
    sampleRate,
  });
  if (!drivePhaseContext) {
    return new Map();
  }

  const drivenCandidates = candidates
    .filter(
      (candidate) => candidate.spectralDrive > DRIVE_PHASE_MEASUREMENT_GATE,
    )
    .sort((left, right) => right.spectralDrive - left.spectralDrive)
    .slice(0, DRIVE_PHASE_MEASUREMENT_MODE_LIMIT);
  const measurements = [];
  for (const candidate of drivenCandidates) {
    const measurement = measureModalComplexDrive(
      drivePhaseContext,
      candidate.modeFrequencyHz,
    );
    if (!measurement) {
      continue;
    }
    measurements.push({
      modeKey: candidate.modeKey,
      frequencyHz: candidate.modeFrequencyHz,
      driveWeight: candidate.spectralDrive,
      magnitude: measurement.magnitude,
      phaseRad: measurement.phaseRad,
    });
  }
  return resolveHarmonicDrivePhaseLocks(measurements);
}

function resolveSourceComponentDrivePhaseLocks({
  candidates,
  sourceComponents,
}) {
  const locks = new Map();
  if (!sourceComponents?.length) {
    return locks;
  }

  for (const candidate of candidates) {
    if (
      !(candidate.targetEnergy > EPSILON) &&
      !(candidate.previousState.energy > EPSILON)
    ) {
      continue;
    }
    let totalDrivenEnergy = 0;
    let dominantDrivenEnergy = 0;
    let dominantComponent = null;
    for (const component of sourceComponents) {
      const drivenEnergy =
        component.sourceEnergy *
        computeModalFrequencyResponse({
          binFrequencyHz: component.frequencyHz,
          modeFrequencyHz: candidate.modeFrequencyHz,
          qualityFactor: candidate.profile.qualityFactor,
        });
      totalDrivenEnergy += drivenEnergy;
      if (
        drivenEnergy > dominantDrivenEnergy ||
        (drivenEnergy === dominantDrivenEnergy &&
          component.frequencyHz <
            (dominantComponent?.frequencyHz ?? Number.POSITIVE_INFINITY))
      ) {
        dominantDrivenEnergy = drivenEnergy;
        dominantComponent = component;
      }
    }
    if (!dominantComponent || !(dominantDrivenEnergy > 0)) {
      continue;
    }

    locks.set(candidate.modeKey, {
      harmonicOrder: dominantComponent.harmonicOrder,
      lockedPhaseRad: dominantComponent.lockedPhaseRad,
      referenceFrequencyHz: dominantComponent.referenceFrequencyHz,
      drivenAngularVelocityRadPerSec:
        dominantComponent.drivenAngularVelocityRadPerSec,
      temporalDominance: clamp01(
        dominantDrivenEnergy / Math.max(EPSILON, totalDrivenEnergy),
      ),
      responsePhaseOffsetRad: computeModalForcedResponsePhaseOffsetRad({
        driveFrequencyHz: dominantComponent.frequencyHz,
        modeFrequencyHz: candidate.modeFrequencyHz,
        qualityFactor: candidate.profile.qualityFactor,
      }),
    });
  }

  return locks;
}

/**
 * @param {{
 *   modes?: Array<any>,
 *   fftLinearAmplitudes?: Float32Array,
 *   timeDomainData?: Float32Array | null,
 *   sampleRate?: number,
 *   previousOscillatorStates?: Map<string, object>,
 *   deltaMs?: number,
 *   inputRms?: number,
 *   normalizedInputAmplitude?: number,
 *   hardSilence?: boolean,
 *   coherence?: number,
 *   responseBudget?: number,
 *   minimumEnergy?: number,
 *   exactDriveResult?: any,
 * }} [options]
 */
export function updateModalResponseFrame({
  modes,
  fftLinearAmplitudes,
  timeDomainData = null,
  sampleRate,
  previousOscillatorStates = new Map(),
  deltaMs = 16,
  inputRms = 0,
  normalizedInputAmplitude,
  hardSilence = false,
  responseBudget = DEFAULT_MODAL_RESPONSE_BUDGET,
  minimumEnergy = 0,
  exactDriveResult = null,
} = {}) {
  const shellRepresentation = buildModalResponseShellRepresentation({
    modes,
    previousOscillatorStates,
    exactDriveResult,
  });
  const responseModes = shellRepresentation.shellModes;
  const responsePreviousOscillatorStates =
    shellRepresentation.previousOscillatorStates;
  const responseExactDriveResult = shellRepresentation.exactDriveResult;
  const sourceHardSilent = hardSilence === true;
  const spectralDriveContext = sourceHardSilent
    ? EMPTY_SPECTRAL_DRIVE_CONTEXT
    : buildSpectralDriveContext(fftLinearAmplitudes);
  const inputEnergy = spectralDriveContext.inputEnergy;
  const effectiveInputRms = sourceHardSilent ? 0 : inputRms;
  const hasInput =
    !sourceHardSilent && (inputEnergy > EPSILON || effectiveInputRms > 0);
  const inputEnergyScale = hasInput
    ? computeInputEnergyScale({
        inputRms: effectiveInputRms,
        normalizedInputAmplitude,
      })
    : 0;
  // Resolved once: the drive coupling and the phase locks are two readings of
  // the same measurement.
  const sourceComponents = hasInput
    ? resolveCredibleSourceDriveComponents({
        fftLinearAmplitudes,
        timeDomainData,
        sampleRate,
      })
    : [];
  // The fast estimator has already distributed its fitted source components
  // through every committed mode's forced-response transfer. Applying the
  // spectral fallback to the same explained signal would count that transfer
  // twice. The fallback belongs only to the FFT-only path, where no exact
  // modal distribution exists.
  const offResonanceCoupling = responseExactDriveResult
    ? null
    : computeForcedOffResonanceCoupling({
        components: sourceComponents,
        modes: responseModes,
        inputEnergy,
      });
  const candidates = buildModalResponseCandidates({
    modes: responseModes,
    fftLinearAmplitudes,
    sampleRate,
    previousOscillatorStates: responsePreviousOscillatorStates,
    hasInput,
    inputEnergy,
    inputEnergyScale,
    spectralDriveContext,
    exactDriveResult: responseExactDriveResult,
    offResonanceCoupling,
  });
  const sourceComponentDrivePhaseLocks = resolveSourceComponentDrivePhaseLocks({
    candidates,
    sourceComponents,
  });
  const drivePhaseLocks =
    sourceComponentDrivePhaseLocks.size > 0
      ? sourceComponentDrivePhaseLocks
      : responseExactDriveResult
        ? resolveHarmonicDrivePhaseLocks(responseExactDriveResult.measurements)
        : resolveModalDrivePhaseLocks({
            candidates,
            timeDomainData,
            sampleRate,
            hasInput,
          });
  const oscillatorStates = [];
  const shellEntries = [];

  for (const candidate of candidates) {
    const driveLock = drivePhaseLocks.get(candidate.modeKey) ?? null;
    const { retainedEnergy, ...oscillator } = updateDrivenOscillatorState({
      modeFrequencyHz: candidate.modeFrequencyHz,
      qualityFactor: candidate.profile.qualityFactor,
      targetEnergy: candidate.targetEnergy,
      spectralDrive: candidate.targetEnergy,
      previousState: candidate.previousState,
      storedEnergyTauMs: candidate.profile.storedEnergyTauMs,
      deltaMs,
      driveLock,
    });

    const oscillatorState = {
      ...candidate.mode,
      modeKey: candidate.modeKey,
      layer: candidate.layer,
      qualityFactor: candidate.profile.qualityFactor,
      dampingRatio: candidate.profile.dampingRatio,
      modalResponseStoredEnergyTauMs: candidate.profile.storedEnergyTauMs,
      modalResponseDrive: candidate.targetEnergy,
      modalResponseDriveShare: candidate.spectralDrive,
      modalResponseEnergy: retainedEnergy,
      ...candidate.physicalTransfer,
      ...oscillator,
      displayAmplitude: Math.sqrt(retainedEnergy),
    };
    if (retainedEnergy > 0) {
      oscillatorStates.push(oscillatorState);
    }
    // Zero-energy modes carry no physical state. Any positive coefficient is
    // retained here; optical capacity and topology evidence own projection,
    // so the oscillator bank must not impose a categorical relative-energy
    // cutoff that erases real low-amplitude spatial detail.
    if (retainedEnergy <= Math.max(0, minimumEnergy)) {
      continue;
    }

    // Projection budgeting mutates published entries. Keep the oscillator
    // snapshot separate so render normalization cannot alter next-frame state.
    shellEntries.push({ ...oscillatorState });
  }

  const modalBudget = Number.isFinite(responseBudget)
    ? Math.max(0, responseBudget)
    : DEFAULT_MODAL_RESPONSE_BUDGET;
  // Every mode belongs to the same physical field. A single global scale may
  // bound that field for the renderer, but layer labels may not redistribute
  // energy or alter the relative oscillator coefficients.
  const budgetResult = normalizeModalResponseBudget(shellEntries, modalBudget);
  const entries = expandShellResponseEntries(
    shellEntries,
    shellRepresentation.shells,
  );
  const modalResponseEnergy = budgetResult.energy;
  const modalResponseSourceCoupledEnergy = sumModalEnergyByLayer(
    shellEntries,
    "source-coupled",
  );
  const modalResponseResonantEnergy = sumModalEnergyByLayer(
    shellEntries,
    "resonant",
  );
  const modalResponseSourceCoupledCurrentSignalEnergy =
    sumModalCurrentSignalEnergyByLayer(shellEntries, "source-coupled");
  const modalResponseResonantCurrentSignalEnergy =
    sumModalCurrentSignalEnergyByLayer(shellEntries, "resonant");
  const modalResponseBudgetScale = budgetResult.scale;
  const modalResponseRawEnergy = budgetResult.rawEnergy;

  return {
    entries,
    oscillatorStates,
    modalResponseInputEnergy: inputEnergy,
    modalResponseInputEnergyScale: inputEnergyScale,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    modalResponseSourceCoupledCurrentSignalEnergy,
    modalResponseResonantCurrentSignalEnergy,
    modalResponseModeCount: shellEntries.length,
    modalResponseBasisTermCount: entries.length,
    modalResponseBudgetScale,
    modalResponseBudgetScaleSourceCoupled: budgetResult.scale,
    modalResponseBudgetScaleResonant: budgetResult.scale,
    modalResponseRawEnergy,
    modalResponseAverageDampingEnvelope: averageEntryMetric(
      shellEntries,
      "dampingEnvelope",
    ),
    modalResponseAverageCouplingStrength: averageEntryMetric(
      shellEntries,
      "couplingStrength",
    ),
    modalResponseAveragePhaseConfidence: averageEntryMetric(
      shellEntries,
      "phaseConfidence",
    ),
    modalResponseAveragePersistence: averageEntryMetric(
      shellEntries,
      "persistence",
    ),
  };
}
