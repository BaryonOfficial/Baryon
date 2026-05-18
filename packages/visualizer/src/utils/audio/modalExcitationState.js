import { createBlendableLayerState } from "./blendState.js";

function createLayerBuffer(slotCount) {
  return {
    slots: new Float32Array(slotCount * 4),
    referenceSlots: new Float32Array(slotCount * 4),
    colorSlots: new Float32Array(slotCount * 4),
    phaseSlots: new Float32Array(slotCount * 4),
  };
}

export function createModalExcitationState(capacity = 16) {
  const layerCapacity = Math.min(capacity, 8);
  return {
    capacity,
    activeModes: new Map(),
    atlasCacheKey: null,
    atlasEntries: [],
    backboneProposal: createLayerBuffer(layerCapacity),
    detailProposal: createLayerBuffer(layerCapacity),
    displayBackbone: createLayerBuffer(layerCapacity),
    displayDetail: createLayerBuffer(layerCapacity),
    detailProjection: createLayerBuffer(layerCapacity),
    blendBackbone: createBlendableLayerState(layerCapacity),
    blendDetail: createBlendableLayerState(layerCapacity),
    remappedBackboneRef: new Float32Array(layerCapacity * 4),
    remappedDetailRef: new Float32Array(layerCapacity * 4),
    remappedSignalBackboneRef: new Float32Array(layerCapacity * 4),
    remappedSignalDetailRef: new Float32Array(layerCapacity * 4),
    previousSignalBackboneSlots: new Float32Array(layerCapacity * 4),
    previousSignalDetailSlots: new Float32Array(layerCapacity * 4),
    previousShouldBuildSpectralLight: false,
    backboneCouplingFrequencyHz: 0,
    backboneProjectionSwitchFrames: 0,
    backboneProjectionSuppressedKeys: new Set(),
    detailMaturity: new Map(),
    detailCouplingFrequencyHz: 0,
    detailDisplayContinuityPresence: 0,
    observedModes: new Map(),
    observedHardSilenceStartedAtMs: null,
    observedHardSilenceGraceActive: false,
    observedHardSilenceAgeMs: 0,
    diagnostics: {
      excitedModeCount: 0,
      distributedExcitation: 0,
      lowOrderModalEnergy: 0,
      highOrderModalEnergy: 0,
      observedModalModeCount: 0,
      lowQBackboneModeCount: 0,
      lowQBackboneEnergy: 0,
      lowQObservedDrive: 0,
      lowQObservedSnr: 0,
      lowQObservedCoherence: 0,
      highQDetailModeCount: 0,
      highQDetailEnergy: 0,
      highQRingSupport: 0,
      modalPhaseAuthority: 0,
      highQPhaseAuthority: 0,
      lowQPhaseAuthority: 0,
      modalPhaseOverlayModeCount: 0,
      modalPersistence: 0,
      modalDriveEnergy: 0,
      modeCoherence: 0,
      driveSource: "spectral-fallback",
    },
  };
}
