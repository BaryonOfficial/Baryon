import { createBlendableLayerState } from "./blendState.js";

function createLayerBuffer(slotCount) {
  return {
    slots: new Float32Array(slotCount * 4),
    referenceSlots: new Float32Array(slotCount * 4),
    colorSlots: new Float32Array(slotCount * 4),
  };
}

export function createModalExcitationState(capacity = 16) {
  const layerCapacity = Math.min(capacity, 8);
  return {
    capacity,
    activeModes: new Map(),
    atlasCacheKey: null,
    atlasEntries: [],
    backbone: createLayerBuffer(layerCapacity),
    detail: createLayerBuffer(layerCapacity),
    displayBackbone: createLayerBuffer(layerCapacity),
    displayDetail: createLayerBuffer(layerCapacity),
    blendBackbone: createBlendableLayerState(layerCapacity),
    blendDetail: createBlendableLayerState(layerCapacity),
    remappedBackboneRef: new Float32Array(layerCapacity * 4),
    remappedDetailRef: new Float32Array(layerCapacity * 4),
    remappedSignalBackboneRef: new Float32Array(layerCapacity * 4),
    remappedSignalDetailRef: new Float32Array(layerCapacity * 4),
    previousSignalBackboneSlots: new Float32Array(layerCapacity * 4),
    previousSignalDetailSlots: new Float32Array(layerCapacity * 4),
    previousShouldBuildSpectralLight: false,
    detailMaturity: new Map(),
    detailCouplingFrequencyHz: 0,
    detailTailPresence: 0,
    coherentBackboneTailMemory: 0,
    coherentBackboneTailSeeded: false,
    coherentBackboneTailModes: new Map(),
    coherentDetailTailMemory: 0,
    coherentDetailTailSeeded: false,
    coherentDetailTailModes: new Map(),
    highQDetailModes: new Map(),
    diagnostics: {
      excitedModeCount: 0,
      distributedExcitation: 0,
      lowOrderModalEnergy: 0,
      highOrderModalEnergy: 0,
      highQDetailModeCount: 0,
      highQDetailEnergy: 0,
      highQRingSupport: 0,
      modalPersistence: 0,
      modalDriveEnergy: 0,
      modeCoherence: 0,
      driveSource: "spectral-fallback",
    },
  };
}
