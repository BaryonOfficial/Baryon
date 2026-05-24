const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

export const DEFAULT_MODAL_RESPONSE_PROFILES = Object.freeze({
  "low-q": Object.freeze({
    qualityFactor: 4,
    attackMs: 48,
    releaseMs: 140,
  }),
  "mid-q": Object.freeze({
    qualityFactor: 10,
    attackMs: 64,
    releaseMs: 320,
  }),
  "high-q": Object.freeze({
    qualityFactor: 32,
    attackMs: 92,
    releaseMs: 940,
  }),
});

const DEFAULT_MODAL_RESPONSE_BUDGET = 1;
const MIN_RELATIVE_PHYSICAL_MODAL_ENERGY = 0.035;
const FRESH_RESPONSE_SEED_THRESHOLD = 0.02;
const FREQUENCY_DAMPING_REFERENCE_HZ = 4800;
const ORDER_DAMPING_REFERENCE = 42;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizePhaseRad(phase) {
  if (!Number.isFinite(phase)) {
    return 0;
  }
  let normalized = phase;
  while (normalized > Math.PI) normalized -= TWO_PI;
  while (normalized < -Math.PI) normalized += TWO_PI;
  return normalized;
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function readPreviousModalResponseState(previous) {
  if (typeof previous === "number") {
    return {
      energy: clamp01(previous),
      phaseRad: 0,
    };
  }
  if (!previous || typeof previous !== "object") {
    return {
      energy: 0,
      phaseRad: 0,
    };
  }
  return {
    energy: clamp01(
      previous.modalResponseEnergy ??
        previous.retainedEnergy ??
        previous.energy ??
        previous.amplitude ??
        0,
    ),
    phaseRad: normalizePhaseRad(
      previous.oscillatorPhaseRad ??
        previous.modalOscillatorPhaseRad ??
        previous.phase ??
        0,
    ),
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

function resolveModeQProfile(mode) {
  if (
    mode?.qProfile === "low-q" ||
    mode?.qProfile === "mid-q" ||
    mode?.qProfile === "high-q"
  ) {
    return mode.qProfile;
  }

  if (Number.isFinite(mode?.qualityFactor)) {
    if (mode.qualityFactor >= 18) return "high-q";
    if (mode.qualityFactor >= 7) return "mid-q";
    return "low-q";
  }

  const frequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
  const order = computeModeOrder(mode);
  if (frequencyHz >= 1800 || order >= 26) {
    return "high-q";
  }
  if (frequencyHz >= 520 || order >= 13) {
    return "mid-q";
  }
  return "low-q";
}

function resolveDiagnosticLayer(mode, qProfile) {
  return mode?.layer ?? (qProfile === "high-q" ? "resonant" : "source-coupled");
}

function updateModalOscillatorState({
  modeFrequencyHz,
  retainedEnergy,
  spectralDrive,
  previousState,
  deltaMs,
}) {
  const frequencyHz = Number.isFinite(modeFrequencyHz)
    ? Math.max(0, modeFrequencyHz)
    : 0;
  const angularVelocityRadPerSec = TWO_PI * frequencyHz;
  const deltaSeconds = Math.max(0, deltaMs) / 1000;
  const phaseRad = normalizePhaseRad(
    (previousState?.phaseRad ?? 0) + angularVelocityRadPerSec * deltaSeconds,
  );
  const amplitude = Math.sqrt(clamp01(retainedEnergy));
  const phaseAuthority = clamp01(
    Math.max(spectralDrive, retainedEnergy) * (frequencyHz > 0 ? 1 : 0),
  );
  const phaseCoherence = clamp01(
    smoothstep(0.0005, 0.04, retainedEnergy) *
      smoothstep(0.0005, 0.08, Math.max(spectralDrive, retainedEnergy)),
  );

  return {
    oscillatorPhaseRad: phaseRad,
    oscillatorAngularVelocityRadPerSec: angularVelocityRadPerSec,
    oscillatorPhaseAuthority: phaseAuthority,
    oscillatorPhaseCoherence: phaseCoherence,
    signedModalCoefficient: amplitude * Math.cos(phaseRad),
  };
}

function getModeProfile(mode) {
  const qProfile = resolveModeQProfile(mode);
  if (mode?.modalResponseProfile) {
    return {
      ...DEFAULT_MODAL_RESPONSE_PROFILES[qProfile],
      ...mode.modalResponseProfile,
    };
  }

  if (mode?.qualityFactor || mode?.attackMs || mode?.releaseMs) {
    const baseProfile =
      DEFAULT_MODAL_RESPONSE_PROFILES[qProfile] ??
      DEFAULT_MODAL_RESPONSE_PROFILES["mid-q"];
    return {
      ...baseProfile,
      qualityFactor: mode.qualityFactor ?? baseProfile.qualityFactor,
      attackMs: mode.attackMs ?? baseProfile.attackMs,
      releaseMs: mode.releaseMs ?? baseProfile.releaseMs,
    };
  }

  return (
    DEFAULT_MODAL_RESPONSE_PROFILES[qProfile] ??
    DEFAULT_MODAL_RESPONSE_PROFILES["mid-q"]
  );
}

function computePhysicalModalTransfer({
  mode,
  modeFrequencyHz,
  qualityFactor,
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
  const frequencyDamping =
    modeFrequencyHz > 0
      ? 1 /
        (1 +
          Math.pow(
            modeFrequencyHz / FREQUENCY_DAMPING_REFERENCE_HZ,
            1.35,
          ))
      : 1;
  const orderDamping =
    order > 0
      ? 1 /
        (1 + Math.pow(order / ORDER_DAMPING_REFERENCE, 1.55))
      : 1;
  const qDamping =
    qualityFactor > 12
      ? 1 / (1 + Math.pow((qualityFactor - 12) / 72, 1.2))
      : 1;
  const dampingEnvelope = clamp01(frequencyDamping * orderDamping * qDamping);
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

function getBinFrequencyHz(index, binCount, sampleRate) {
  return (index / Math.max(1, binCount)) * sampleRate * 0.5;
}

function getInputEnergy(fftMagnitudes) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = Math.max(0, fftMagnitudes[index] ?? 0);
    total += amplitude * amplitude;
  }
  return total;
}

function buildSpectralDriveContext(fftMagnitudes, sampleRate) {
  if (!(fftMagnitudes instanceof Float32Array) || fftMagnitudes.length === 0) {
    return {
      bins: [],
      inputEnergy: 0,
    };
  }

  const bins = [];
  let inputEnergy = 0;
  for (let index = 1; index < fftMagnitudes.length; index += 1) {
    const amplitude = Math.max(0, fftMagnitudes[index] ?? 0);
    if (amplitude <= 0) {
      continue;
    }

    const binEnergy = amplitude * amplitude;
    inputEnergy += binEnergy;
    bins.push({
      binEnergy,
      frequencyHz: getBinFrequencyHz(index, fftMagnitudes.length, sampleRate),
    });
  }

  return {
    bins,
    inputEnergy,
  };
}

function computeInputExposure({ inputEnergy, inputRms }) {
  const rmsExposure = smoothstep(0.0007, 0.008, inputRms);
  const spectralExposure = smoothstep(0.0008, 0.018, Math.sqrt(inputEnergy));
  return clamp01(Math.max(rmsExposure, spectralExposure));
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

export function computeModalSpectralDrive({
  fftMagnitudes,
  sampleRate,
  modeFrequencyHz,
  qualityFactor,
  inputEnergy = getInputEnergy(fftMagnitudes),
  spectralBins = null,
}) {
  if (
    sampleRate <= 0 ||
    modeFrequencyHz <= 0 ||
    inputEnergy <= EPSILON
  ) {
    return 0;
  }

  const bins = Array.isArray(spectralBins)
    ? spectralBins
    : buildSpectralDriveContext(fftMagnitudes, sampleRate).bins;
  if (bins.length === 0) {
    return 0;
  }

  let weightedEnergy = 0;
  let peakWeightedEnergy = 0;
  for (const bin of bins) {
    const weightedBinEnergy =
      bin.binEnergy *
      computeModalFrequencyResponse({
        binFrequencyHz: bin.frequencyHz,
        modeFrequencyHz,
        qualityFactor,
      });
    weightedEnergy += weightedBinEnergy;
    peakWeightedEnergy = Math.max(peakWeightedEnergy, weightedBinEnergy);
  }

  const baseDrive = weightedEnergy / Math.max(EPSILON, inputEnergy);
  if (qualityFactor < 16 || weightedEnergy <= EPSILON) {
    return clamp01(baseDrive);
  }

  const peakConcentration = peakWeightedEnergy / Math.max(EPSILON, weightedEnergy);
  const coherentPeakGate = smoothstep(0.08, 0.35, peakConcentration);
  return clamp01(baseDrive * coherentPeakGate);
}

function updateRetainedEnergy({
  targetEnergy,
  previousEnergy,
  attackMs,
  releaseMs,
  deltaMs,
}) {
  const target = clamp01(targetEnergy);
  const previous = clamp01(previousEnergy);
  if (previous <= 0 && target >= FRESH_RESPONSE_SEED_THRESHOLD) {
    return target;
  }

  const timeConstantMs =
    target >= previous ? Math.max(1, attackMs) : Math.max(1, releaseMs);
  const alpha = 1 - Math.exp(-Math.max(0, deltaMs) / timeConstantMs);
  return clamp01(previous + (target - previous) * alpha);
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
    };
  }

  const scale = rawEnergy > budget ? budget / Math.max(EPSILON, rawEnergy) : 1;
  for (const entry of entries) {
    entry.modalResponseRawEnergy = entry.modalResponseEnergy;
    entry.modalResponseBudgetScale = scale;
    entry.modalResponseEnergy = clamp01(entry.modalResponseEnergy * scale);
    entry.displayAmplitude = Math.sqrt(entry.modalResponseEnergy);
    entry.signedModalCoefficient *= Math.sqrt(scale);
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

function retainSignificantPhysicalEntries(entries) {
  if (entries.length === 0) {
    return entries;
  }

  const peakEnergy = entries.reduce(
    (peak, entry) => Math.max(peak, entry.modalResponseEnergy),
    0,
  );
  const relativeFloor = MIN_RELATIVE_PHYSICAL_MODAL_ENERGY * peakEnergy;
  if (relativeFloor <= 0) {
    return entries;
  }

  return entries.filter((entry) => entry.modalResponseEnergy >= relativeFloor);
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

/**
 * @param {{
 *   modes?: Array<any>,
 *   fftMagnitudes?: Float32Array,
 *   sampleRate?: number,
 *   previousEnergies?: Map<string, number>,
 *   deltaMs?: number,
 *   inputRms?: number,
 *   hardSilence?: boolean,
 *   coherence?: number,
 *   responseBudget?: number,
 *   minimumEnergy?: number,
 * }} [options]
 */
export function updateModalResponseFrame({
  modes,
  fftMagnitudes,
  sampleRate,
  previousEnergies = new Map(),
  deltaMs = 16,
  inputRms = 0,
  hardSilence = false,
  coherence = 1,
  responseBudget = DEFAULT_MODAL_RESPONSE_BUDGET,
  minimumEnergy = 0.0001,
} = {}) {
  const sourceHardSilent = hardSilence === true;
  const spectralDriveContext = sourceHardSilent
    ? {
        bins: [],
        inputEnergy: 0,
      }
    : buildSpectralDriveContext(fftMagnitudes, sampleRate);
  const inputEnergy = spectralDriveContext.inputEnergy;
  const effectiveInputRms = sourceHardSilent ? 0 : inputRms;
  const hasInput =
    !sourceHardSilent && (inputEnergy > EPSILON || effectiveInputRms > 0);
  const inputExposure = hasInput
    ? computeInputExposure({ inputEnergy, inputRms: effectiveInputRms })
    : 0;
  const entries = [];

  for (const mode of modes ?? []) {
    const modeKey =
      mode?.modeKey ?? `${mode?.u ?? 0}:${mode?.v ?? 0}:${mode?.w ?? 0}`;
    const profile = getModeProfile(mode);
    const qProfile = resolveModeQProfile(mode);
    const modeFrequencyHz = mode?.naturalFrequencyHz ?? mode?.frequencyHz ?? 0;
    const previousState = readPreviousModalResponseState(
      previousEnergies?.get?.(modeKey) ?? mode,
    );
    const previousEnergy = previousState.energy;
    const spectralDrive = hasInput
      ? computeModalSpectralDrive({
          fftMagnitudes,
          sampleRate,
          modeFrequencyHz,
          qualityFactor: profile.qualityFactor,
          inputEnergy,
          spectralBins: spectralDriveContext.bins,
        })
      : 0;
    const physicalTransfer = computePhysicalModalTransfer({
      mode,
      modeFrequencyHz,
      qualityFactor: profile.qualityFactor,
      coherence,
      previousEnergy,
    });
    const targetEnergy =
      spectralDrive * inputExposure * physicalTransfer.physicalTransfer;
    const retainedEnergy = updateRetainedEnergy({
      targetEnergy,
      previousEnergy,
      attackMs: profile.attackMs,
      releaseMs: profile.releaseMs,
      deltaMs,
    });
    const oscillator = updateModalOscillatorState({
      modeFrequencyHz,
      retainedEnergy,
      spectralDrive,
      previousState,
      deltaMs,
    });

    if (retainedEnergy < minimumEnergy) {
      continue;
    }

    const layer = resolveDiagnosticLayer(mode, qProfile);
    entries.push({
      ...mode,
      modeKey,
      layer,
      qProfile,
      qualityFactor: profile.qualityFactor,
      modalResponseDrive: spectralDrive,
      modalResponseEnergy: retainedEnergy,
      ...physicalTransfer,
      ...oscillator,
      displayAmplitude: Math.sqrt(retainedEnergy),
    });
  }

  const significantEntries = retainSignificantPhysicalEntries(entries);

  const modalBudget = Number.isFinite(responseBudget)
    ? Math.max(0, responseBudget)
    : DEFAULT_MODAL_RESPONSE_BUDGET;
  const budgetResult = normalizeModalResponseBudget(
    significantEntries,
    modalBudget,
  );
  const modalResponseEnergy = budgetResult.energy;
  const modalResponseSourceCoupledEnergy = sumModalEnergyByLayer(
    significantEntries,
    "source-coupled",
  );
  const modalResponseResonantEnergy = sumModalEnergyByLayer(
    significantEntries,
    "resonant",
  );

  return {
    entries: significantEntries,
    modalResponseInputEnergy: inputEnergy,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy,
    modalResponseModeCount: significantEntries.length,
    modalResponseBudgetScale: budgetResult.scale,
    modalResponseBudgetScaleSourceCoupled: budgetResult.scale,
    modalResponseBudgetScaleResonant: budgetResult.scale,
    modalResponseRawEnergy: budgetResult.rawEnergy ?? modalResponseEnergy,
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
