import { createBlendableLayerState } from "./blendState.js";
import { createModalDriveAnalysisScratch } from "./modalDriveAnalysis.js";
import { createWaterAcousticDriveScratch } from "./waterAcousticNonlinearity.js";

function createLayerBuffer(slotCount) {
  return {
    slots: new Float32Array(slotCount * 4),
    referenceSlots: new Float32Array(slotCount * 4),
    spectralMomentSlots: new Float32Array(slotCount * 4),
    phaseSlots: new Float32Array(slotCount * 4),
  };
}

export function createModalExcitationState(capacity = 16) {
  const layerCapacity = Math.max(1, Math.floor(capacity));
  return {
    capacity,
    activeModes: new Map(),
    modalOscillatorStates: new Map(),
    modalCandidateState: new Map(),
    sourceCoupledProposal: createLayerBuffer(layerCapacity),
    resonantProposal: createLayerBuffer(layerCapacity),
    blendSourceCoupled: createBlendableLayerState(layerCapacity),
    blendResonant: createBlendableLayerState(layerCapacity),
    remappedSourceCoupledRef: new Float32Array(layerCapacity * 4),
    remappedResonantRef: new Float32Array(layerCapacity * 4),
    remappedSignalSourceCoupledRef: new Float32Array(layerCapacity * 4),
    remappedSignalResonantRef: new Float32Array(layerCapacity * 4),
    previousSignalSourceCoupledSlots: new Float32Array(layerCapacity * 4),
    previousSignalResonantSlots: new Float32Array(layerCapacity * 4),
    driveAnalysisScratch: createModalDriveAnalysisScratch(),
    waterAcousticDriveScratch: createWaterAcousticDriveScratch(),
    phaseAnchorState: null,
    observedModes: new Map(),
  };
}
