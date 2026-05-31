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
  const layerCapacity = Math.max(1, Math.floor(capacity));
  return {
    capacity,
    activeModes: new Map(),
    modalCandidates: [],
    modalCandidateState: new Map(),
    atlasCacheKey: null,
    atlasEntries: [],
    sourceCoupledProposal: createLayerBuffer(layerCapacity),
    resonantProposal: createLayerBuffer(layerCapacity),
    displaySourceCoupled: createLayerBuffer(layerCapacity),
    displayResonant: createLayerBuffer(layerCapacity),
    resonantProjection: createLayerBuffer(layerCapacity),
    blendSourceCoupled: createBlendableLayerState(layerCapacity),
    blendResonant: createBlendableLayerState(layerCapacity),
    remappedSourceCoupledRef: new Float32Array(layerCapacity * 4),
    remappedResonantRef: new Float32Array(layerCapacity * 4),
    remappedSignalSourceCoupledRef: new Float32Array(layerCapacity * 4),
    remappedSignalResonantRef: new Float32Array(layerCapacity * 4),
    previousSignalSourceCoupledSlots: new Float32Array(layerCapacity * 4),
    previousSignalResonantSlots: new Float32Array(layerCapacity * 4),
    previousShouldBuildSpectralLight: false,
    sourceCoupledCouplingFrequencyHz: 0,
    sourceCoupledProjectionSwitchFrames: 0,
    sourceCoupledProjectionSuppressedKeys: new Set(),
    resonantMaturity: new Map(),
    resonantCouplingFrequencyHz: 0,
    resonantDisplayContinuityPresence: 0,
    observedModes: new Map(),
    diagnostics: {
      excitedModeCount: 0,
      distributedExcitation: 0,
      lowOrderModalEnergy: 0,
      highOrderModalEnergy: 0,
      observedModalModeCount: 0,
      lowQSourceCoupledModeCount: 0,
      lowQSourceCoupledEnergy: 0,
      lowQObservedDrive: 0,
      lowQObservedSnr: 0,
      lowQObservedCoherence: 0,
      highQResonantModeCount: 0,
      highQResonantEnergy: 0,
      highQRingSupport: 0,
      modalPhaseAuthority: 0,
      highQPhaseAuthority: 0,
      lowQPhaseAuthority: 0,
      modalPhaseCoherentFieldModeCount: 0,
      modalPersistence: 0,
      modalDriveEnergy: 0,
      modeCoherence: 0,
      driveSource: "spectral-fallback",
    },
  };
}
