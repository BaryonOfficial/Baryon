import { binIndexToFrequencyHz } from "./binFrequency.js";
import {
  buildModalDrivePhaseContext,
  measureModalComplexDrive,
  resolveHarmonicDrivePhaseLocks,
} from "./modalDrivePhase.js";
import { normalizePhaseRad } from "./modalPhaseSlots.js";
import { clamp01, smoothstep } from "../math.js";

const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

// Fixed reference apparatus profile used when a mode has no measured response
// metadata. Q=10 is a declared calibration value, not physical ground truth
// for every cavity, material, frequency, or mode order.
export const DEFAULT_MODAL_RESPONSE_REFERENCE = Object.freeze({
  qualityFactor: 10,
  apparatusTransfer: 1,
});

const DEFAULT_MODAL_RESPONSE_BUDGET = 1;
const SOURCE_COUPLED_RESPONSE_BUDGET_SHARE = 0.82;
const MIN_RELATIVE_PHYSICAL_MODAL_ENERGY = 0.035;
const MIN_MODAL_QUALITY_FACTOR = 0.5;
const MAX_MODAL_QUALITY_FACTOR = 50000;
const DEFAULT_STORED_ENERGY_TAU_MS = 320;
const MODAL_SPECTRAL_RESPONSE_CACHE = new Map();
const MODAL_SPECTRAL_RESPONSE_CACHE_MAX_SIZE = 512;
const DRIVE_PHASE_MEASUREMENT_GATE = 0.003;
const DRIVE_PHASE_MEASUREMENT_MODE_LIMIT = 48;
const DRIVE_LOCK_PLV_ATTACK = 0.2;
const DRIVE_LOCK_PLV_RELEASE = 0.85;
const ENVELOPE_MAGNITUDE_EPSILON = 1e-6;

function readPreviousModalResponseState(previous) {
  if (typeof previous === "number") {
    const energy = clamp01(previous);
    return {
      energy,
      rotationRad: 0,
      envelopeRe: Math.sqrt(energy),
      envelopeIm: 0,
      driveLockRe: 0,
      driveLockIm: 0,
    };
  }
  if (!previous || typeof previous !== "object") {
    return {
      energy: 0,
      rotationRad: 0,
      envelopeRe: 0,
      envelopeIm: 0,
      driveLockRe: 0,
      driveLockIm: 0,
    };
  }

  const hasEnvelopeState =
    Number.isFinite(previous.modalOscillatorEnvelopeRe) &&
    Number.isFinite(previous.modalOscillatorEnvelopeIm) &&
    Number.isFinite(previous.modalOscillatorRotationRad);
  if (hasEnvelopeState) {
    const energy = clamp01(
      previous.modalOscillatorEnvelopeRe ** 2 +
        previous.modalOscillatorEnvelopeIm ** 2,
    );
    return {
      energy,
      rotationRad: normalizePhaseRad(previous.modalOscillatorRotationRad),
      envelopeRe: previous.modalOscillatorEnvelopeRe,
      envelopeIm: previous.modalOscillatorEnvelopeIm,
      driveLockRe: Number.isFinite(previous.modalOscillatorDriveLockRe)
        ? previous.modalOscillatorDriveLockRe
        : 0,
      driveLockIm: Number.isFinite(previous.modalOscillatorDriveLockIm)
        ? previous.modalOscillatorDriveLockIm
        : 0,
    };
  }

  const explicitEnergy =
    previous.modalResponseEnergy ?? previous.retainedEnergy ?? previous.energy;
  const legacyAmplitude = Number.isFinite(previous.amplitude)
    ? previous.amplitude
    : 0;
  const energy = clamp01(explicitEnergy ?? legacyAmplitude * legacyAmplitude);

  // Legacy state carries only a lab-frame phase: fold it into the rotation
  // accumulator so the published phase stays continuous, with the envelope
  // along the real axis.
  return {
    energy,
    rotationRad: normalizePhaseRad(
      previous.oscillatorPhaseRad ??
        previous.modalOscillatorPhaseRad ??
        previous.phase ??
        0,
    ),
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
  if (Number.isFinite(mode?.qualityFactor)) {
    return Math.min(
      MAX_MODAL_QUALITY_FACTOR,
      Math.max(MIN_MODAL_QUALITY_FACTOR, mode.qualityFactor),
    );
  }
  if (Number.isFinite(mode?.modalResponseProfile?.qualityFactor)) {
    return Math.min(
      MAX_MODAL_QUALITY_FACTOR,
      Math.max(
        MIN_MODAL_QUALITY_FACTOR,
        mode.modalResponseProfile.qualityFactor,
      ),
    );
  }
  return DEFAULT_MODAL_RESPONSE_REFERENCE.qualityFactor;
}

function resolveDiagnosticLayer(mode, qualityFactor) {
  return mode?.layer ?? (qualityFactor >= 18 ? "resonant" : "source-coupled");
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
 * with slowly varying complex envelope Z gives ż = −ζωZ + F̃/(2iω), whose
 * exact solution over a frame with constant drive is
 * Z' = Z_ss + (Z − Z_ss)·e^{−ζωΔt}. The amplitude time constant is
 * 1/(ζω) = 2Q/ω, so stored energy keeps the physical Q/ω constant on both
 * attack and release — ring-up is no longer a shortened product envelope.
 * |Z_ss| = √targetEnergy preserves the calibrated steady-state levels; its
 * phase is drive-locked (−π/2 behind resonant drive) when a harmonic lock is
 * available, else the envelope keeps its current direction.
 */
function updateDrivenOscillatorState({
  modeFrequencyHz,
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
  const targetAmplitude = Math.sqrt(clamp01(targetEnergy));
  const previousMagnitude = Math.hypot(
    previousState.envelopeRe,
    previousState.envelopeIm,
  );
  const steadyPhaseRad = driveLock
    ? normalizePhaseRad(driveLock.lockedPhaseRad - Math.PI / 2)
    : previousMagnitude > ENVELOPE_MAGNITUDE_EPSILON
      ? Math.atan2(previousState.envelopeIm, previousState.envelopeRe)
      : 0;
  const steadyRe = targetAmplitude * Math.cos(steadyPhaseRad);
  const steadyIm = targetAmplitude * Math.sin(steadyPhaseRad);
  const envelopeRe =
    steadyRe + (previousState.envelopeRe - steadyRe) * amplitudeDecay;
  const envelopeIm =
    steadyIm + (previousState.envelopeIm - steadyIm) * amplitudeDecay;
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
    oscillatorPhaseRad: phaseRad,
    oscillatorAngularVelocityRadPerSec: angularVelocityRadPerSec,
    oscillatorPhaseAuthority: phaseAuthority,
    // A harmonic lock's phase-locking value scales coherence: an unstable
    // lock must not authorize confident signed cancellation.
    oscillatorPhaseCoherence: driveLock
      ? clamp01(baseCoherence * driveLockPlv)
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
  };
}

function getModeProfile(mode) {
  const qualityFactor = resolveModeQualityFactor(mode);
  const modeFrequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
  const explicitApparatusTransfer =
    mode?.modalResponseProfile?.apparatusTransfer;
  const apparatusTransfer = clamp01(
    Number.isFinite(explicitApparatusTransfer)
      ? explicitApparatusTransfer
      : DEFAULT_MODAL_RESPONSE_REFERENCE.apparatusTransfer,
  );
  const storedEnergyTauMs = computeStoredEnergyTimeConstantMs({
    modeFrequencyHz,
    qualityFactor,
  });
  return {
    ...DEFAULT_MODAL_RESPONSE_REFERENCE,
    ...mode?.modalResponseProfile,
    qualityFactor,
    apparatusTransfer,
    dampingRatio: 1 / (2 * qualityFactor),
    storedEnergyTauMs,
  };
}

function computePhysicalModalTransfer({
  mode,
  apparatusTransfer,
  coherence,
  previousEnergy,
}) {
  const order = computeModeOrder(mode);
  const couplingStrength = clamp01(
    mode?.couplingStrength ??
      mode?.modalCoupling ??
      mode?.driveWeight ??
      mode?.sourceSupport ??
      1,
  );
  const phaseConfidence = clamp01(
    mode?.phaseConfidence ??
      mode?.phaseAuthority ??
      mode?.phaseCoherence ??
      mode?.coherence ??
      coherence ??
      1,
  );
  const persistence = clamp01(
    mode?.persistence ??
      mode?.modalPersistence ??
      (previousEnergy > 0 ? 0.72 : 1),
  );
  // This packet field is the apparatus transmission term consumed by the
  // existing modal-response boundary. It is measured per mode when supplied,
  // otherwise fixed by the declared reference profile; frequency and order
  // cannot invent additional attenuation.
  const dampingEnvelope = clamp01(apparatusTransfer);
  const persistenceEnvelope = clamp01(0.35 + persistence * 0.65);

  return {
    modalOrder: order,
    couplingStrength,
    phaseConfidence,
    persistence,
    dampingEnvelope,
    physicalTransfer: clamp01(
      couplingStrength *
        phaseConfidence *
        dampingEnvelope *
        persistenceEnvelope,
    ),
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

function computeInputExposure({ inputRms }) {
  return smoothstep(0.0007, 0.008, inputRms);
}

export function computeModalInputExposure({ inputRms = 0 }) {
  return computeInputExposure({ inputRms });
}

export function computeModalFrequencyResponse({
  binFrequencyHz,
  modeFrequencyHz,
  qualityFactor,
}) {
  const binFrequency = Number.isFinite(binFrequencyHz) ? binFrequencyHz : 0;
  const modeFrequency = Number.isFinite(modeFrequencyHz) ? modeFrequencyHz : 0;
  const q = Math.max(0.1, Number.isFinite(qualityFactor) ? qualityFactor : 1);

  if (binFrequency <= 0 || modeFrequency <= 0) {
    return 0;
  }

  const detuning = binFrequency / modeFrequency - modeFrequency / binFrequency;
  return clamp01(1 / (1 + q * q * detuning * detuning));
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
  let peakWeightedEnergy = 0;
  for (let bin = 0; bin < context.binCount; bin += 1) {
    const binIndex = context.binIndices[bin];
    const binAmplitude = Math.max(0, fftLinearAmplitudes[binIndex] ?? 0);
    const weightedBinEnergy =
      binAmplitude * binAmplitude * (responseWeights[binIndex] ?? 0);
    weightedEnergy += weightedBinEnergy;
    if (weightedBinEnergy > peakWeightedEnergy) {
      peakWeightedEnergy = weightedBinEnergy;
    }
  }

  const baseDrive = weightedEnergy / Math.max(EPSILON, inputEnergy);
  if (qualityFactor < 16 || weightedEnergy <= EPSILON) {
    return clamp01(baseDrive);
  }

  const peakConcentration =
    peakWeightedEnergy / Math.max(EPSILON, weightedEnergy);
  const coherentPeakGate = smoothstep(0.08, 0.35, peakConcentration);
  return clamp01(baseDrive * coherentPeakGate);
}

function computeStoredEnergyTimeConstantMs({ modeFrequencyHz, qualityFactor }) {
  const frequencyHz = Number.isFinite(modeFrequencyHz)
    ? Math.max(0, modeFrequencyHz)
    : 0;
  const q = Number.isFinite(qualityFactor)
    ? Math.max(MIN_MODAL_QUALITY_FACTOR, qualityFactor)
    : DEFAULT_MODAL_RESPONSE_REFERENCE.qualityFactor;
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

  const scale = rawEnergy > budget ? budget / Math.max(EPSILON, rawEnergy) : 1;
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

function allocateModalResponseLayerBudgets({
  sourceCoupledRawEnergy,
  resonantRawEnergy,
  budget,
}) {
  const modalBudget = Math.max(0, Number.isFinite(budget) ? budget : 0);
  const sourceRaw = Math.max(
    0,
    Number.isFinite(sourceCoupledRawEnergy) ? sourceCoupledRawEnergy : 0,
  );
  const resonantRaw = Math.max(
    0,
    Number.isFinite(resonantRawEnergy) ? resonantRawEnergy : 0,
  );
  if (modalBudget <= 0) {
    return {
      sourceCoupledBudget: 0,
      resonantBudget: 0,
    };
  }
  if (sourceRaw <= 0 && resonantRaw <= 0) {
    return {
      sourceCoupledBudget: 0,
      resonantBudget: 0,
    };
  }
  if (sourceRaw <= 0) {
    return {
      sourceCoupledBudget: 0,
      resonantBudget: modalBudget,
    };
  }
  if (resonantRaw <= 0) {
    return {
      sourceCoupledBudget: modalBudget,
      resonantBudget: 0,
    };
  }

  const sourceReserve = modalBudget * SOURCE_COUPLED_RESPONSE_BUDGET_SHARE;
  const resonantReserve = modalBudget - sourceReserve;
  let sourceCoupledBudget = Math.min(sourceRaw, sourceReserve);
  let resonantBudget = Math.min(resonantRaw, resonantReserve);
  const unusedBudget = Math.max(
    0,
    modalBudget - sourceCoupledBudget - resonantBudget,
  );
  const sourceExcess = Math.max(0, sourceRaw - sourceCoupledBudget);
  const resonantExcess = Math.max(0, resonantRaw - resonantBudget);
  const totalExcess = sourceExcess + resonantExcess;

  if (unusedBudget > 0 && totalExcess > 0) {
    sourceCoupledBudget += unusedBudget * (sourceExcess / totalExcess);
    resonantBudget += unusedBudget * (resonantExcess / totalExcess);
  }

  return {
    sourceCoupledBudget,
    resonantBudget,
  };
}

function retainSignificantPhysicalEntries(entries) {
  if (entries.length === 0) {
    return entries;
  }

  const peakEnergyByLayer = new Map();
  for (const entry of entries) {
    const layer = entry.layer ?? "source-coupled";
    peakEnergyByLayer.set(
      layer,
      Math.max(
        peakEnergyByLayer.get(layer) ?? 0,
        entry.modalResponseEnergy ?? 0,
      ),
    );
  }

  return entries.filter((entry) => {
    const layerPeakEnergy =
      peakEnergyByLayer.get(entry.layer ?? "source-coupled") ?? 0;
    const relativeFloor = MIN_RELATIVE_PHYSICAL_MODAL_ENERGY * layerPeakEnergy;
    return relativeFloor <= 0 || entry.modalResponseEnergy >= relativeFloor;
  });
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
  previousEnergies,
  hasInput,
  inputEnergy,
  inputExposure,
  spectralDriveContext,
  coherence,
  exactDriveResult = null,
}) {
  const candidates = [];
  for (let modeIndex = 0; modeIndex < (modes?.length ?? 0); modeIndex += 1) {
    const mode = modes[modeIndex];
    const modeKey =
      mode?.modeKey ?? `${mode?.u ?? 0}:${mode?.v ?? 0}:${mode?.w ?? 0}`;
    const profile = getModeProfile(mode);
    const modeFrequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
    const previousState = readPreviousModalResponseState(
      previousEnergies?.get?.(modeKey) ?? mode,
    );
    const spectralDrive = exactDriveResult
      ? clamp01(exactDriveResult.energyShareByMode?.[modeIndex] ?? 0)
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
    const physicalTransfer = computePhysicalModalTransfer({
      mode,
      apparatusTransfer: profile.apparatusTransfer,
      coherence,
      previousEnergy: previousState.energy,
    });
    candidates.push({
      mode,
      modeKey,
      profile,
      modeFrequencyHz,
      previousState,
      spectralDrive,
      physicalTransfer,
      targetEnergy: exactDriveResult
        ? clamp01(exactDriveResult.targetEnergyByMode?.[modeIndex] ?? 0)
        : spectralDrive * inputExposure * physicalTransfer.physicalTransfer,
    });
  }
  return candidates;
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

/**
 * @param {{
 *   modes?: Array<any>,
 *   fftLinearAmplitudes?: Float32Array,
 *   timeDomainData?: Float32Array | null,
 *   sampleRate?: number,
 *   previousEnergies?: Map<string, number>,
 *   deltaMs?: number,
 *   inputRms?: number,
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
  previousEnergies = new Map(),
  deltaMs = 16,
  inputRms = 0,
  hardSilence = false,
  coherence = 1,
  responseBudget = DEFAULT_MODAL_RESPONSE_BUDGET,
  minimumEnergy = 0.0001,
  exactDriveResult = null,
} = {}) {
  const sourceHardSilent = hardSilence === true;
  const spectralDriveContext = sourceHardSilent
    ? EMPTY_SPECTRAL_DRIVE_CONTEXT
    : buildSpectralDriveContext(fftLinearAmplitudes);
  const inputEnergy = spectralDriveContext.inputEnergy;
  const effectiveInputRms = sourceHardSilent ? 0 : inputRms;
  const hasInput =
    !sourceHardSilent && (inputEnergy > EPSILON || effectiveInputRms > 0);
  const inputExposure = hasInput
    ? computeInputExposure({ inputRms: effectiveInputRms })
    : 0;
  const candidates = buildModalResponseCandidates({
    modes,
    fftLinearAmplitudes,
    sampleRate,
    previousEnergies,
    hasInput,
    inputEnergy,
    inputExposure,
    spectralDriveContext,
    coherence,
    exactDriveResult,
  });
  const drivePhaseLocks = exactDriveResult
    ? resolveHarmonicDrivePhaseLocks(exactDriveResult.measurements)
    : resolveModalDrivePhaseLocks({
        candidates,
        timeDomainData,
        sampleRate,
        hasInput,
      });
  const entries = [];

  for (const candidate of candidates) {
    const { retainedEnergy, ...oscillator } = updateDrivenOscillatorState({
      modeFrequencyHz: candidate.modeFrequencyHz,
      targetEnergy: candidate.targetEnergy,
      spectralDrive: candidate.spectralDrive,
      previousState: candidate.previousState,
      storedEnergyTauMs: candidate.profile.storedEnergyTauMs,
      deltaMs,
      driveLock: drivePhaseLocks.get(candidate.modeKey) ?? null,
    });

    if (retainedEnergy < minimumEnergy) {
      continue;
    }

    const layer = resolveDiagnosticLayer(
      candidate.mode,
      candidate.profile.qualityFactor,
    );
    entries.push({
      ...candidate.mode,
      modeKey: candidate.modeKey,
      layer,
      qualityFactor: candidate.profile.qualityFactor,
      dampingRatio: candidate.profile.dampingRatio,
      modalResponseStoredEnergyTauMs: candidate.profile.storedEnergyTauMs,
      modalResponseDrive: candidate.spectralDrive,
      modalResponseEnergy: retainedEnergy,
      ...candidate.physicalTransfer,
      ...oscillator,
      displayAmplitude: Math.sqrt(retainedEnergy),
    });
  }

  const significantEntries = retainSignificantPhysicalEntries(entries);

  const modalBudget = Number.isFinite(responseBudget)
    ? Math.max(0, responseBudget)
    : DEFAULT_MODAL_RESPONSE_BUDGET;
  const sourceCoupledEntries = significantEntries.filter(
    (entry) => entry.layer === "source-coupled",
  );
  const resonantEntries = significantEntries.filter(
    (entry) => entry.layer === "resonant",
  );
  const rawSourceCoupledEnergy = sumModalEnergyByLayer(
    significantEntries,
    "source-coupled",
  );
  const rawResonantEnergy = sumModalEnergyByLayer(
    significantEntries,
    "resonant",
  );
  const { sourceCoupledBudget, resonantBudget } =
    allocateModalResponseLayerBudgets({
      sourceCoupledRawEnergy: rawSourceCoupledEnergy,
      resonantRawEnergy: rawResonantEnergy,
      budget: modalBudget,
    });
  const sourceCoupledBudgetResult = normalizeModalResponseBudget(
    sourceCoupledEntries,
    sourceCoupledBudget,
  );
  const resonantBudgetResult = normalizeModalResponseBudget(
    resonantEntries,
    resonantBudget,
  );
  const modalResponseEnergy =
    sourceCoupledBudgetResult.energy + resonantBudgetResult.energy;
  const modalResponseSourceCoupledEnergy = sumModalEnergyByLayer(
    significantEntries,
    "source-coupled",
  );
  const modalResponseResonantEnergy = sumModalEnergyByLayer(
    significantEntries,
    "resonant",
  );
  const modalResponseSourceCoupledCurrentSignalEnergy =
    sumModalCurrentSignalEnergyByLayer(significantEntries, "source-coupled");
  const modalResponseResonantCurrentSignalEnergy =
    sumModalCurrentSignalEnergyByLayer(significantEntries, "resonant");
  const modalResponseBudgetScale = Math.min(
    sourceCoupledBudgetResult.scale,
    resonantBudgetResult.scale,
  );
  const modalResponseRawEnergy =
    sourceCoupledBudgetResult.rawEnergy + resonantBudgetResult.rawEnergy;

  return {
    entries: significantEntries,
    modalResponseInputEnergy: inputEnergy,
    modalResponseInputExposure: inputExposure,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    modalResponseSourceCoupledCurrentSignalEnergy,
    modalResponseResonantCurrentSignalEnergy,
    modalResponseModeCount: significantEntries.length,
    modalResponseBudgetScale,
    modalResponseBudgetScaleSourceCoupled: sourceCoupledBudgetResult.scale,
    modalResponseBudgetScaleResonant: resonantBudgetResult.scale,
    modalResponseRawEnergy,
    modalResponseAverageDampingEnvelope: averageEntryMetric(
      significantEntries,
      "dampingEnvelope",
    ),
    modalResponseAverageCouplingStrength: averageEntryMetric(
      significantEntries,
      "couplingStrength",
    ),
    modalResponseAveragePhaseConfidence: averageEntryMetric(
      significantEntries,
      "phaseConfidence",
    ),
    modalResponseAveragePersistence: averageEntryMetric(
      significantEntries,
      "persistence",
    ),
  };
}
