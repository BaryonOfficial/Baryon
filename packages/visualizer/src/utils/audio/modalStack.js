import { AUDIT_DEFAULTS, AUDIO_DEFAULTS } from "../../defaults.js";

export const MAX_STACK_SLOTS = 4;
export const DECAY_PER_FRAME = 0.9;
const HARMONIC_SUPPORT_COUNT = 4;

function createModalStackState(capacity) {
  return {
    slots: new Float32Array(capacity * 4),
    referenceSlots: new Float32Array(capacity * 4),
    harmonicSupport: new Float32Array(HARMONIC_SUPPORT_COUNT),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: "none",
    uniqueModeCount: 0,
    lastStableAt: 0,
  };
}

export function createAudioFeatureState(capacity = AUDIO_DEFAULTS.capacity) {
  return {
    capacity,
    analysis: {
      frameId: 0,
      modeSlots: new Float32Array(capacity * 4),
      referenceModeSlots: new Float32Array(capacity * 4),
      fftMagnitudes: new Float32Array(0),
      modalStackState: createModalStackState(capacity),
    },
    audit: {
      frame: 0,
      frozenModeSlots: new Float32Array(capacity * 4),
      lastSnapshot: null,
      settings: { ...AUDIT_DEFAULTS },
    },
    frameId: 0,
  };
}

export function clearModalStack(state) {
  state.slots.fill(0);
  state.referenceSlots.fill(0);
  state.harmonicSupport.fill(0);
  state.fundamental = 0;
  state.fundamentalConfidence = 0;
  state.analysisEngine = "none";
  state.uniqueModeCount = 0;
}

export function decayModalStack(state) {
  for (let i = 0; i < state.slots.length; i += 4) {
    state.slots[i + 3] *= DECAY_PER_FRAME;
    state.referenceSlots[i + 3] *= DECAY_PER_FRAME;
  }
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
  target.set(source.subarray(0, target.length));
}

export function countActiveSlots(modeSlots, capacity) {
  let count = 0;
  const limit = Math.min(modeSlots.length, capacity * 4);
  for (let i = 0; i < limit; i += 4) {
    if (modeSlots[i + 3] > 0) count++;
  }
  return count;
}
