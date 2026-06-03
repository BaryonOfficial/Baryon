import {
  AUDIT_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  BEAT_DEFAULTS,
} from "../../defaults.js";
import { createModalFieldContinuityState } from "../../core/modalFieldContinuity.js";
import { createBlendableLayerState } from "./blendState.js";
import { createModalExcitationState } from "./modalExcitationState.js";

/** @type {number} */
export const MAX_STACK_SLOTS = AUDIO_SLOT_CAPACITY;
export const BAND_BUCKET_COUNT = 4;
const BEAT_HISTORY_SIZE = 8;
const HARMONIC_SUPPORT_COUNT = 6;
const COLOR_SLOT_STRIDE = 4;

function createColorSlotArray(capacity) {
  return new Float32Array(capacity * COLOR_SLOT_STRIDE);
}

function createZeroTargetArray(capacity) {
  return new Float32Array(capacity * 4);
}

export function createModalTargetBuild(capacity) {
  return {
    slots: createZeroTargetArray(capacity),
    referenceSlots: createZeroTargetArray(capacity),
    colorSlots: createColorSlotArray(capacity),
    spectralSlots: createColorSlotArray(capacity),
    harmonicSupport: new Float32Array(HARMONIC_SUPPORT_COUNT),
    uniqueModeCount: 0,
    peaks: [],
    components: [],
    _mergeScratch: new Map(),
  };
}

function createModalLayerState(capacity) {
  return {
    ...createBlendableLayerState(capacity),
    harmonicSupport: new Float32Array(HARMONIC_SUPPORT_COUNT),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: "none",
    uniqueModeCount: 0,
    lastStableAt: 0,
    spectralLightComponents: [],
    latchedFundamentalHz: 0,
    latchedFundamentalConfidence: 0,
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
    driverFrequency: 0,
    candidateFrequency: 0,
    candidateConfidence: 0,
    candidateFrames: 0,
    candidatePeriodicity: 0,
    candidateHarmonicSupport: 0,
    candidateDirectSupport: 0,
    candidateLowEnergy: false,
    voicingActive: false,
    highCandidateRejected: false,
    rejectionReason: "none",
    slotAgeFrames: new Uint16Array(capacity),
    slotConfidence: new Float32Array(capacity),
    slotDisagreementCounts: new Uint8Array(capacity),
    slotLastConfirmedFrames: new Uint32Array(capacity),
    _slotMetricMap: new Map(),
  };
}

function createBandState() {
  return {
    bandEnergies: new Float32Array(BAND_BUCKET_COUNT),
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    previousRms: 0,
    lowBandEnergy: 0,
    lowBandEnergyEma: 0,
    previousLowBandEnergy: 0,
    onsetDriver: 0,
    onsetThresholdEma: 0,
    previousBeatAtMs: Number.NEGATIVE_INFINITY,
    previousFrameAtMs: 0,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    beatTimestamps: new Float64Array(BEAT_HISTORY_SIZE),
    beatTimestampWriteIdx: 0,
    beatTimestampCount: 0,
    estimatedTempo: 0,
    tempoEma: 0,
    tempoConfidence: 0,
    beatPhase: 0,
    onsetDensityEma: 0,
    beatSensitivity: BEAT_DEFAULTS.beatSensitivity,
    liveInputMode: "idle",
    liveInputPolicy: "ambient",
    liveInputGateState: "closed",
    liveInputCalibrationActive: false,
    liveInputCalibrationStartedAtMs: Number.NEGATIVE_INFINITY,
    liveInputCalibrationVersion: 0,
    liveInputCalibrationInvalid: false,
    liveInputCalibrationInvalidReason: "none",
    liveInputPreviousFrameAtMs: 0,
    liveInputBaselineRms: 0,
    liveInputBaselinePeak: 0,
    liveInputBaselineCentroid: 0,
    liveInputBaselineLowBandEnergy: 0,
    liveInputOpenFrames: 0,
    liveInputQuietFrames: 0,
  };
}

function createChromaState() {
  return {
    smoothedChroma: new Float32Array(12),
    keyTonic: 0, // pitch class 0-11
    keyMode: "major", // "major" | "minor"
    keyConfidence: 0, // 0-1
    keyTonicHue: 0, // pitchClassToHue(keyTonic)
  };
}

export function createAudioFeatureState(capacity = AUDIO_SLOT_CAPACITY) {
  return {
    capacity,
    analysis: {
      frameId: 0,
      candidateForcingSlots: new Float32Array(capacity * 4),
      candidateResponseSlots: new Float32Array(capacity * 4),
      sourceCoupledPhaseSlots: new Float32Array(capacity * 4),
      resonantPhaseSlots: new Float32Array(capacity * 4),
      modeSlots: new Float32Array(capacity * 4),
      sourceCoupledColorSlots: createColorSlotArray(capacity),
      resonantColorSlots: createColorSlotArray(capacity),
      referenceSourceCoupledSlots: new Float32Array(capacity * 4),
      referenceResonantSlots: new Float32Array(capacity * 4),
      referenceModeSlots: new Float32Array(capacity * 4),
      bandEnergies: new Float32Array(BAND_BUCKET_COUNT),
      fftMagnitudes: new Float32Array(0),
      sourceCoupledState: createModalLayerState(capacity),
      resonantState: createModalLayerState(capacity),
      bandState: createBandState(),
      chromaState: createChromaState(),
      previousSpectrum: new Float32Array(0),
      zeroSourceCoupledTargetSlots: createZeroTargetArray(capacity),
      zeroResonantTargetSlots: createZeroTargetArray(capacity),
      nonAcousticSourceCoupledTarget: createModalTargetBuild(capacity),
      nonAcousticResonantTarget: createModalTargetBuild(capacity),
      nonAcousticPeakDriverScratch: createModalTargetBuild(capacity),
      acousticSourceCoupledTarget: createModalTargetBuild(capacity),
      acousticResonantTarget: createModalTargetBuild(capacity),
      modalExcitationState: createModalExcitationState(capacity),
      modalFieldContinuityState: createModalFieldContinuityState(),
    },
    audit: {
      frame: 0,
      frozenSourceCoupledSlots: new Float32Array(capacity * 4),
      frozenResonantSlots: new Float32Array(capacity * 4),
      frozenModeSlots: new Float32Array(capacity * 4),
      frozenSourceCoupledColorSlots: createColorSlotArray(capacity),
      frozenResonantColorSlots: createColorSlotArray(capacity),
      frozenSourceCoupledSpectralSlots: createColorSlotArray(capacity),
      frozenResonantSpectralSlots: createColorSlotArray(capacity),
      lastSnapshot: null,
      settings: { ...AUDIT_DEFAULTS },
    },
    frameId: 0,
  };
}

export function clearModalStack(state) {
  if (!state) return;

  state.slots?.fill(0);
  state.referenceSlots?.fill(0);
  state.colorSlots?.fill(0);
  state.referenceColorSlots?.fill(0);
  state.spectralSlots?.fill(0);
  state.referenceSpectralSlots?.fill(0);
  state.phaseSlots?.fill(0);
  state.harmonicSupport?.fill(0);
  state.fundamental = 0;
  state.fundamentalConfidence = 0;
  state.analysisEngine = "none";
  state.uniqueModeCount = 0;
  state.lastStableAt = 0;
  state.spectralLightComponents = [];
  if ("latchedFundamentalHz" in state) state.latchedFundamentalHz = 0;
  if ("latchedFundamentalConfidence" in state) {
    state.latchedFundamentalConfidence = 0;
  }
  if ("latchHoldFrames" in state) state.latchHoldFrames = 0;
  if ("latchLowSupportFrames" in state) state.latchLowSupportFrames = 0;
  if ("driverFrequency" in state) state.driverFrequency = 0;
  if ("candidateFrequency" in state) state.candidateFrequency = 0;
  if ("candidateConfidence" in state) state.candidateConfidence = 0;
  if ("candidateFrames" in state) state.candidateFrames = 0;
  if ("candidatePeriodicity" in state) state.candidatePeriodicity = 0;
  if ("candidateHarmonicSupport" in state) {
    state.candidateHarmonicSupport = 0;
  }
  if ("candidateDirectSupport" in state) state.candidateDirectSupport = 0;
  if ("candidateLowEnergy" in state) state.candidateLowEnergy = false;
  if ("voicingActive" in state) state.voicingActive = false;
  if ("highCandidateRejected" in state) state.highCandidateRejected = false;
  if ("rejectionReason" in state) state.rejectionReason = "none";
  state.slotAgeFrames?.fill(0);
  state.slotConfidence?.fill(0);
  state.slotDisagreementCounts?.fill(0);
  state.slotLastConfirmedFrames?.fill(0);
  state._slotMetricMap?.clear?.();
}

export function writeSlot(target, index, mode, amplitude) {
  const offset = index * 4;
  target[offset] = mode.u;
  target[offset + 1] = mode.v;
  target[offset + 2] = mode.w;
  target[offset + 3] = amplitude;
}

export function copyFloatArray(target, source) {
  target.fill(0);
  if (!source?.length) return;
  target.set(source.subarray(0, target.length));
}

export function writeColorSlot(target, index, color, weight) {
  const offset = index * COLOR_SLOT_STRIDE;
  target[offset] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
  target[offset + 3] = weight;
}

export const BLEND_ATTACK = 0.18;
export const BLEND_TRACKING = 0.28;
export const BLEND_RELEASE = 0.94;
export const BLEND_DROP_THRESHOLD = 1e-4;
export const BLEND_FRESH_ADMISSION_UNLIMITED = 0;

function modeKey(u, v, w) {
  return `${u}:${v}:${w}`;
}

export function blendModalStack(state, targetSlots, capacity, options = {}) {
  const attack = options.attack ?? BLEND_ATTACK;
  const tracking = options.tracking ?? BLEND_TRACKING;
  const release = options.release ?? BLEND_RELEASE;
  const trackingOverrides = options.trackingOverrides ?? null;
  const releaseOverrides = options.releaseOverrides ?? null;
  const freshCap = options.freshCap ?? BLEND_FRESH_ADMISSION_UNLIMITED;
  const dropThreshold = options.dropThreshold ?? BLEND_DROP_THRESHOLD;
  const emptyTargetRelease = options.emptyTargetRelease;
  const lowSignalReleaseThreshold = options.lowSignalReleaseThreshold ?? 0;
  const lowSignalRelease = options.lowSignalRelease;
  const retainReleased = options.retainReleased ?? true;
  const slotLimit = Math.min(state.slots.length / 4, capacity);

  const currentMap = state._poolCurrentMap ?? new Map();
  currentMap.clear();
  for (let i = 0; i < slotLimit; i++) {
    const offset = i * 4;
    const amp = state.slots[offset + 3];
    if (amp > 0) {
      const u = state.slots[offset];
      const v = state.slots[offset + 1];
      const w = state.slots[offset + 2];
      currentMap.set(modeKey(u, v, w), { u, v, w, amplitude: amp });
    }
  }

  const targetLimit = Math.min(targetSlots.length / 4, capacity);
  const targetMap = state._poolTargetMap ?? new Map();
  targetMap.clear();
  for (let i = 0; i < targetLimit; i++) {
    const offset = i * 4;
    const amp = targetSlots[offset + 3];
    if (amp > 0) {
      const u = targetSlots[offset];
      const v = targetSlots[offset + 1];
      const w = targetSlots[offset + 2];
      targetMap.set(modeKey(u, v, w), { u, v, w, amplitude: amp });
    }
  }

  let freshAdmitted = 0;
  const admittedTargetKeys = state._poolAdmittedKeys ?? new Set();
  admittedTargetKeys.clear();
  for (const key of targetMap.keys()) {
    if (currentMap.has(key)) {
      admittedTargetKeys.add(key);
    }
  }
  for (const key of targetMap.keys()) {
    if (!currentMap.has(key)) {
      if (freshCap <= 0 || freshAdmitted < freshCap) {
        admittedTargetKeys.add(key);
        freshAdmitted++;
      }
    }
  }

  const blended = state._poolBlendedMap ?? new Map();
  blended.clear();
  for (const key of admittedTargetKeys) {
    const target = targetMap.get(key);
    const current = currentMap.get(key);
    const trackingFactor = trackingOverrides?.get?.(key) ?? tracking;
    const newAmp = current
      ? current.amplitude +
        (target.amplitude - current.amplitude) * trackingFactor
      : target.amplitude * attack;
    if (newAmp >= dropThreshold) {
      blended.set(key, {
        u: target.u,
        v: target.v,
        w: target.w,
        amplitude: newAmp,
      });
    }
  }

  for (const [key, entry] of currentMap.entries()) {
    if (!admittedTargetKeys.has(key)) {
      if (!retainReleased && targetMap.size === 0) {
        continue;
      }
      let releaseFactor = releaseOverrides?.get?.(key) ?? release;
      if (Number.isFinite(emptyTargetRelease) && targetMap.size === 0) {
        releaseFactor = Math.min(releaseFactor, emptyTargetRelease);
      }
      if (
        Number.isFinite(lowSignalRelease) &&
        lowSignalReleaseThreshold > 0 &&
        entry.amplitude <= lowSignalReleaseThreshold
      ) {
        releaseFactor = Math.min(releaseFactor, lowSignalRelease);
      }
      const newAmp = entry.amplitude * releaseFactor;
      if (newAmp >= dropThreshold) {
        blended.set(key, {
          u: entry.u,
          v: entry.v,
          w: entry.w,
          amplitude: newAmp,
        });
      }
    }
  }

  const survivors = Array.from(blended.values()).sort(
    (a, b) => b.amplitude - a.amplitude,
  );
  const kept = survivors.slice(0, capacity);

  state.slots.fill(0);
  for (let i = 0; i < kept.length; i++) {
    const offset = i * 4;
    const entry = kept[i];
    state.slots[offset] = entry.u;
    state.slots[offset + 1] = entry.v;
    state.slots[offset + 2] = entry.w;
    state.slots[offset + 3] = entry.amplitude;
  }

  state.referenceSlots.fill(0);
  state.referenceSlots.set(
    targetSlots.subarray(
      0,
      Math.min(state.referenceSlots.length, capacity * 4),
    ),
  );
}

export function blendColorStack(
  state,
  targetSlots,
  targetColorSlots,
  targetSpectralSlotsOrCapacity,
  capacityOrOptions,
  optionsMaybe = {},
) {
  if (!state?.slots || !state?.colorSlots || !targetColorSlots) return;

  const hasExplicitSpectralArgument = arguments.length >= 6;
  const targetSpectralSlots = hasExplicitSpectralArgument
    ? targetSpectralSlotsOrCapacity
    : null;
  const trackSpectralOwner = Boolean(targetSpectralSlots);
  const capacity = hasExplicitSpectralArgument
    ? capacityOrOptions
    : targetSpectralSlotsOrCapacity;
  const options = hasExplicitSpectralArgument
    ? optionsMaybe
    : (capacityOrOptions ?? {});
  const attack = options.attack ?? BLEND_ATTACK;
  const tracking = options.tracking ?? BLEND_TRACKING;
  const release = options.release ?? BLEND_RELEASE;
  const maxActiveSlots = options.maxActiveSlots ?? capacity;
  const slotLimit = Math.min(state.slots.length / 4, capacity);
  const currentColorMap = state._poolCurrentColorMap ?? new Map();
  currentColorMap.clear();

  for (let i = 0; i < slotLimit; i++) {
    const offset = i * 4;
    const amplitude = state.slots[offset + 3] ?? 0;
    const colorWeight = state.colorSlots[offset + 3] ?? 0;
    if (amplitude <= 0 && colorWeight <= 0) continue;
    currentColorMap.set(
      modeKey(
        state.slots[offset],
        state.slots[offset + 1],
        state.slots[offset + 2],
      ),
      {
        r: state.colorSlots[offset],
        g: state.colorSlots[offset + 1],
        b: state.colorSlots[offset + 2],
        weight: colorWeight,
        phase: state.spectralSlots?.[offset] ?? 0,
        wavelength: state.spectralSlots?.[offset + 1] ?? 0,
        harmonicConfidence: state.spectralSlots?.[offset + 2] ?? 0,
        accentEnergy: state.spectralSlots?.[offset + 3] ?? 0,
      },
    );
  }

  const targetColorMap = state._poolTargetColorMap ?? new Map();
  targetColorMap.clear();
  const targetLimit = Math.min(
    targetSlots.length / 4,
    targetColorSlots.length / 4,
    capacity,
  );
  for (let i = 0; i < targetLimit; i++) {
    const offset = i * 4;
    const amplitude = targetSlots[offset + 3] ?? 0;
    const weight = targetColorSlots[offset + 3] ?? 0;
    if (amplitude <= 0 && weight <= 0) continue;
    targetColorMap.set(
      modeKey(
        targetSlots[offset],
        targetSlots[offset + 1],
        targetSlots[offset + 2],
      ),
      {
        r: targetColorSlots[offset],
        g: targetColorSlots[offset + 1],
        b: targetColorSlots[offset + 2],
        weight,
        phase: targetSpectralSlots?.[offset] ?? 0,
        wavelength: targetSpectralSlots?.[offset + 1] ?? 0,
        harmonicConfidence: targetSpectralSlots?.[offset + 2] ?? 0,
        accentEnergy: targetSpectralSlots?.[offset + 3] ?? 0,
      },
    );
  }

  const survivors = [];
  for (let i = 0; i < slotLimit; i++) {
    const offset = i * 4;
    const amplitude = state.slots[offset + 3] ?? 0;
    if (amplitude <= 0) continue;

    const key = modeKey(
      state.slots[offset],
      state.slots[offset + 1],
      state.slots[offset + 2],
    );
    const current = currentColorMap.get(key);
    const target = targetColorMap.get(key);
    const blendFactor = current && target ? tracking : attack;
    const base = current ?? { r: 0, g: 0, b: 0, weight: 0 };
    const nextWeight = target
      ? base.weight + (target.weight - base.weight) * blendFactor
      : base.weight * release;
    const next = target
      ? {
          r: trackSpectralOwner
            ? target.r
            : base.r + (target.r - base.r) * blendFactor,
          g: trackSpectralOwner
            ? target.g
            : base.g + (target.g - base.g) * blendFactor,
          b: trackSpectralOwner
            ? target.b
            : base.b + (target.b - base.b) * blendFactor,
          weight: nextWeight,
          phase: target.phase,
          wavelength: target.wavelength,
          harmonicConfidence: target.harmonicConfidence,
          accentEnergy: target.accentEnergy,
        }
      : trackSpectralOwner
        ? {
            r: 0,
            g: 0,
            b: 0,
            weight: 0,
            phase: 0,
            wavelength: 0,
            harmonicConfidence: 0,
            accentEnergy: 0,
          }
        : {
            r: base.r,
            g: base.g,
            b: base.b,
            weight: nextWeight,
            phase: base.phase,
            wavelength: base.wavelength,
            harmonicConfidence: base.harmonicConfidence,
            accentEnergy: base.accentEnergy,
          };

    survivors.push({
      offset,
      amplitude,
      ...next,
      contribution: amplitude * Math.max(0, next.weight),
    });
  }

  if (survivors.length > maxActiveSlots) {
    survivors.sort((left, right) => right.contribution - left.contribution);
    for (let i = maxActiveSlots; i < survivors.length; i++) {
      survivors[i].weight = 0;
    }
  }
  survivors.sort((left, right) => left.offset - right.offset);

  state.colorSlots.fill(0);
  state.spectralSlots?.fill(0);
  for (const survivor of survivors) {
    state.colorSlots[survivor.offset] = survivor.r;
    state.colorSlots[survivor.offset + 1] = survivor.g;
    state.colorSlots[survivor.offset + 2] = survivor.b;
    state.colorSlots[survivor.offset + 3] = survivor.weight;
    if (state.spectralSlots) {
      state.spectralSlots[survivor.offset] = survivor.phase;
      state.spectralSlots[survivor.offset + 1] = survivor.wavelength;
      state.spectralSlots[survivor.offset + 2] = survivor.harmonicConfidence;
      state.spectralSlots[survivor.offset + 3] = survivor.accentEnergy;
    }
  }

  state.referenceColorSlots.fill(0);
  state.referenceSpectralSlots?.fill(0);
  for (let i = 0; i < slotLimit; i++) {
    const offset = i * 4;
    const key = modeKey(
      state.slots[offset],
      state.slots[offset + 1],
      state.slots[offset + 2],
    );
    const target = targetColorMap.get(key);
    if (!target) continue;
    state.referenceColorSlots[offset] = target.r;
    state.referenceColorSlots[offset + 1] = target.g;
    state.referenceColorSlots[offset + 2] = target.b;
    state.referenceColorSlots[offset + 3] = target.weight;
    if (state.referenceSpectralSlots) {
      state.referenceSpectralSlots[offset] = target.phase;
      state.referenceSpectralSlots[offset + 1] = target.wavelength;
      state.referenceSpectralSlots[offset + 2] = target.harmonicConfidence;
      state.referenceSpectralSlots[offset + 3] = target.accentEnergy;
    }
  }
}

export function combineModalLayers(target, layers, capacity) {
  const combined = new Map();
  for (const layer of layers) {
    if (!layer?.slots?.length) continue;
    const weight = layer.weight ?? 1;
    for (let i = 0; i < layer.slots.length; i += 4) {
      const amplitude = (layer.slots[i + 3] ?? 0) * weight;
      if (amplitude <= 0) continue;
      const u = layer.slots[i];
      const v = layer.slots[i + 1];
      const w = layer.slots[i + 2];
      const key = modeKey(u, v, w);
      const existing = combined.get(key);
      if (existing) {
        existing.amplitude += amplitude;
      } else {
        combined.set(key, { u, v, w, amplitude });
      }
    }
  }

  const survivors = Array.from(combined.values())
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, capacity);

  target.fill(0);
  for (let i = 0; i < survivors.length; i++) {
    const entry = survivors[i];
    const offset = i * 4;
    target[offset] = entry.u;
    target[offset + 1] = entry.v;
    target[offset + 2] = entry.w;
    target[offset + 3] = entry.amplitude;
  }

  return survivors.length;
}

export function countActiveSlots(modeSlots, capacity) {
  let count = 0;
  const limit = Math.min(modeSlots.length, capacity * 4);
  for (let i = 0; i < limit; i += 4) {
    if (modeSlots[i + 3] > 0) count++;
  }
  return count;
}
