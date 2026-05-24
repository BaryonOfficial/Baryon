const EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

export const DEFAULT_MODAL_RESPONSE_PROFILES = Object.freeze({
  "low-q": Object.freeze({
    qualityFactor: 4,
    attackMs: 48,
    releaseMs: 140,
    displayWeight: 1,
  }),
  "mid-q": Object.freeze({
    qualityFactor: 10,
    attackMs: 64,
    releaseMs: 320,
    displayWeight: 0.92,
  }),
  "high-q": Object.freeze({
    qualityFactor: 32,
    attackMs: 92,
    releaseMs: 940,
    displayWeight: 0.84,
  }),
});

const DEFAULT_LAYER_BUDGETS = Object.freeze({
  backbone: 0.7,
  detail: 0.56,
});

const MIN_RELATIVE_DISPLAY_AMPLITUDE_BY_LAYER = Object.freeze({
  backbone: 0.04,
  detail: 0.18,
});
const FRESH_RESPONSE_SEED_THRESHOLD = 0.02;

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
  if (mode?.modalResponseProfile) {
    return {
      ...DEFAULT_MODAL_RESPONSE_PROFILES[
        mode.qProfile ?? (mode.layer === "detail" ? "high-q" : "low-q")
      ],
      ...mode.modalResponseProfile,
    };
  }

  if (mode?.qualityFactor || mode?.attackMs || mode?.releaseMs) {
    const baseProfile =
      DEFAULT_MODAL_RESPONSE_PROFILES[
        mode.qProfile ?? (mode.layer === "detail" ? "high-q" : "low-q")
      ] ?? DEFAULT_MODAL_RESPONSE_PROFILES["mid-q"];
    return {
      ...baseProfile,
      qualityFactor: mode.qualityFactor ?? baseProfile.qualityFactor,
      attackMs: mode.attackMs ?? baseProfile.attackMs,
      releaseMs: mode.releaseMs ?? baseProfile.releaseMs,
      displayWeight: mode.displayWeight ?? baseProfile.displayWeight,
    };
  }

  return (
    DEFAULT_MODAL_RESPONSE_PROFILES[
      mode?.qProfile ?? (mode?.layer === "detail" ? "high-q" : "low-q")
    ] ?? DEFAULT_MODAL_RESPONSE_PROFILES["mid-q"]
  );
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

function normalizeLayerBudget(entries, layer, budget) {
  const layerEntries = entries.filter((entry) => entry.layer === layer);
  const rawEnergy = layerEntries.reduce(
    (total, entry) => total + entry.displayAmplitude,
    0,
  );
  if (rawEnergy <= 0) {
    return {
      energy: 0,
      scale: 1,
    };
  }

  const scale = rawEnergy > budget ? budget / Math.max(EPSILON, rawEnergy) : 1;
  for (const entry of layerEntries) {
    entry.displayAmplitude = clamp01(entry.displayAmplitude * scale);
  }
  return {
    energy: Math.min(rawEnergy, budget),
    scale,
  };
}

function retainSignificantLayerEntries(entries, layer) {
  const layerEntries = entries.filter((entry) => entry.layer === layer);
  if (layerEntries.length === 0) {
    return entries;
  }

  const peakAmplitude = layerEntries.reduce(
    (peak, entry) => Math.max(peak, entry.displayAmplitude),
    0,
  );
  const relativeFloor =
    (MIN_RELATIVE_DISPLAY_AMPLITUDE_BY_LAYER[layer] ?? 0) * peakAmplitude;
  if (relativeFloor <= 0) {
    return entries;
  }

  return entries.filter(
    (entry) => entry.layer !== layer || entry.displayAmplitude >= relativeFloor,
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
 *   layerBudgets?: {backbone?: number, detail?: number},
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
  layerBudgets = DEFAULT_LAYER_BUDGETS,
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
    const coherenceScale = 0.85 + 0.15 * clamp01(coherence);
    const targetEnergy = spectralDrive * coherenceScale * inputExposure;
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

    const layer = mode?.layer ?? (mode?.qProfile === "high-q" ? "detail" : "backbone");
    entries.push({
      ...mode,
      modeKey,
      layer,
      qProfile:
        mode?.qProfile ?? (layer === "detail" ? "high-q" : "low-q"),
      qualityFactor: profile.qualityFactor,
      modalResponseDrive: spectralDrive,
      modalResponseEnergy: retainedEnergy,
      ...oscillator,
      displayAmplitude: clamp01(
        Math.sqrt(retainedEnergy) * (mode?.displayWeight ?? profile.displayWeight),
      ),
    });
  }

  const significantEntries = retainSignificantLayerEntries(
    retainSignificantLayerEntries(entries, "backbone"),
    "detail",
  );

  const backboneBudget = Number.isFinite(layerBudgets.backbone)
    ? Math.max(0, layerBudgets.backbone)
    : DEFAULT_LAYER_BUDGETS.backbone;
  const detailBudget = Number.isFinite(layerBudgets.detail)
    ? Math.max(0, layerBudgets.detail)
    : DEFAULT_LAYER_BUDGETS.detail;
  const backboneBudgetResult = normalizeLayerBudget(
    significantEntries,
    "backbone",
    backboneBudget,
  );
  const detailBudgetResult = normalizeLayerBudget(
    significantEntries,
    "detail",
    detailBudget,
  );
  const modalResponseEnergy =
    backboneBudgetResult.energy + detailBudgetResult.energy;

  return {
    entries: significantEntries,
    modalResponseInputEnergy: inputEnergy,
    modalResponseEnergy,
    modalResponseBackboneEnergy: backboneBudgetResult.energy,
    modalResponseDetailEnergy: detailBudgetResult.energy,
    modalResponseModeCount: significantEntries.length,
    modalResponseBudgetScaleBackbone: backboneBudgetResult.scale,
    modalResponseBudgetScaleDetail: detailBudgetResult.scale,
  };
}
