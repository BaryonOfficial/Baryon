import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";
import { buildModalTopologyModeKey } from "../../core/modalTopology.js";

/** @type {number} */
export const MAX_STACK_SLOTS = AUDIO_SLOT_CAPACITY;

export function clearModalStack(state) {
  if (!state) return;

  state.slots?.fill(0);
  state.referenceSlots?.fill(0);
  state.spectralMomentSlots?.fill(0);
  state.referenceSpectralMomentSlots?.fill(0);
  state.phaseSlots?.fill(0);
  state.harmonicSupport?.fill(0);
  state.fundamental = 0;
  state.fundamentalConfidence = 0;
  state.analysisEngine = "none";
  state.uniqueModeCount = 0;
  state.lastStableAt = 0;
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
  if ("candidateHarmonicSupport" in state) state.candidateHarmonicSupport = 0;
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

export function sumModalSlotAmplitudes(modeSlots, capacity = undefined) {
  if (!(modeSlots instanceof Float32Array) || modeSlots.length === 0) return 0;
  const slotCount = Math.min(
    Math.floor(modeSlots.length / 4),
    Number.isFinite(capacity)
      ? Math.max(0, Math.floor(capacity))
      : modeSlots.length / 4,
  );
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += Math.max(0, modeSlots[index * 4 + 3] ?? 0);
  }
  return total;
}

export function projectModalStack(state, targetSlots, capacity) {
  if (!state?.slots || !state?.referenceSlots) return;
  const valueCount = Math.min(
    state.slots.length,
    state.referenceSlots.length,
    targetSlots?.length ?? 0,
    Math.max(0, Math.floor(capacity ?? 0)) * 4,
  );
  state.slots.fill(0);
  state.referenceSlots.fill(0);
  if (valueCount <= 0) return;
  const projection = targetSlots.subarray(0, valueCount);
  state.slots.set(projection);
  state.referenceSlots.set(projection);
}

/** Keep circular evidence in coefficient-slot order without color smoothing. */
export function projectSpectralMomentStack(
  state,
  targetSlots,
  targetSpectralMomentSlots,
  capacity,
) {
  if (!state?.spectralMomentSlots || !targetSpectralMomentSlots) return;
  state.spectralMomentSlots.fill(0);
  state.referenceSpectralMomentSlots.fill(0);
  const valueCount = Math.min(
    state.spectralMomentSlots.length,
    targetSpectralMomentSlots.length,
    targetSlots?.length ?? 0,
    Math.max(0, Math.floor(capacity ?? 0)) * 4,
  );
  if (valueCount <= 0) return;
  const projection = targetSpectralMomentSlots.subarray(0, valueCount);
  state.spectralMomentSlots.set(projection);
  state.referenceSpectralMomentSlots.set(projection);
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
      const key = buildModalTopologyModeKey(u, v, w);
      const existing = combined.get(key);
      if (existing) existing.amplitude += amplitude;
      else combined.set(key, { u, v, w, amplitude });
    }
  }

  const survivors = Array.from(combined.values())
    .sort((a, b) => b.amplitude - a.amplitude)
    .slice(0, capacity);
  target.fill(0);
  for (let i = 0; i < survivors.length; i += 1) {
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
    if (modeSlots[i + 3] > 0) count += 1;
  }
  return count;
}
