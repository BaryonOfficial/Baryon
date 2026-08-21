import { AUDIO_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
} from "../../core/cavityGeometry.js";
import { buildCanonicalFullModalDescriptor } from "../../core/modalDescriptor.js";
import { createModalFieldContinuityState } from "../../core/modalFieldContinuity.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../../core/modalBudgets.js";
import { buildZeroAudioFeatureDebugSnapshot } from "./audioFeatureDebug.js";
import { buildModalEnergyLedger } from "./modalEnergyLedger.js";
import { MAX_STACK_SLOTS, clearModalStack } from "./modalStack.js";
import { FIELD_STATES } from "./types.js";

/** @typedef {import("../../core/cavityGeometry.js").CavityGeometry} CavityGeometry */

/**
 * @param {{
 *   generation?: number,
 *   maxTotalModes?: number,
 *   modalFieldSlots?: Float32Array | number[],
 *   modalFieldPhaseSlots?: Float32Array | number[],
 *   modalFieldSpectralMomentSlots?: Float32Array | number[],
 *   modalFieldMetadataSlots?: Float32Array | number[],
 * }} [options]
 */
function buildEmptyModalFieldDescriptor({
  generation = 0,
  maxTotalModes = AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldSpectralMomentSlots,
  modalFieldMetadataSlots,
} = {}) {
  const slotLength = Math.max(
    modalFieldSlots?.length ?? 0,
    modalFieldPhaseSlots?.length ?? 0,
    modalFieldSpectralMomentSlots?.length ?? 0,
    modalFieldMetadataSlots?.length ?? 0,
  );
  const emptySlots = new Float32Array(slotLength);

  return buildCanonicalFullModalDescriptor({
    generation,
    maxTotalModes,
    directOpticalModeCapacity: MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
    modalFieldSlots: modalFieldSlots ?? emptySlots,
    modalFieldPhaseSlots: modalFieldPhaseSlots ?? emptySlots,
    modalFieldSpectralMomentSlots:
      modalFieldSpectralMomentSlots ?? emptySlots,
    modalFieldMetadataSlots: modalFieldMetadataSlots ?? emptySlots,
    activeModalFieldModeCount: 0,
    observerCandidateModeCount: 0,
    observedModalModeCount: 0,
    phaseAuthorityModeCount: 0,
    rawCandidateModeCount: 0,
    confidenceQualifiedCandidateModeCount: 0,
    lowConfidenceCandidateModeCount: 0,
    rawCandidateModalEnergy: 0,
    confidenceWeightedCandidateEnergy: 0,
    modalObservationCoherence: 0,
    modalObservationConfidence: 0,
    modeIdentityRetentionRatio: 0,
  });
}

export function buildSilentAudioFeatureFrame({
  featureState,
  sourceKind,
  analysisInputMode,
  soundActive,
  micActive,
  isLiveInputActive,
  sourceEvidence = null,
  candidateForcingSlots,
  candidateResponseSlots,
  sourceCoupledPhaseSlots,
  resonantPhaseSlots,
  modeSlots,
  referenceModeSlots,
  sourceCoupledSpectralMoment,
  resonantSpectralMoment,
  modalFieldSpectralSeedDirection,
  bandEnergies,
  sourceCoupledState,
  resonantState,
  fftSize,
  auditSettings,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
}) {
  candidateForcingSlots.fill(0);
  candidateResponseSlots.fill(0);
  sourceCoupledPhaseSlots.fill(0);
  resonantPhaseSlots.fill(0);
  modeSlots.fill(0);
  referenceModeSlots.fill(0);
  sourceCoupledSpectralMoment.fill(0);
  resonantSpectralMoment.fill(0);
  modalFieldSpectralSeedDirection?.set([1, 0]);
  bandEnergies.fill(0);
  clearModalStack(sourceCoupledState);
  clearModalStack(resonantState);
  if (featureState?.analysis) {
    featureState.analysis.modalFieldContinuityState =
      createModalFieldContinuityState();
    featureState.analysis.lastModalFieldContinuityFrameAtMs = undefined;
  }

  let silentFft = featureState?.analysis?.fftLinearAmplitudes;
  if (!silentFft?.length) {
    silentFft = new Float32Array((fftSize ?? 0) / 2);
  }
  silentFft.fill(0);

  if (featureState?.analysis) {
    featureState.analysis.fftLinearAmplitudes = silentFft;
  }

  const modalDescriptor = buildEmptyModalFieldDescriptor({
    generation: featureState?.audit?.frame ?? 0,
    maxTotalModes: Math.min(
      MAX_STACK_SLOTS,
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    ),
    modalFieldSlots: modeSlots,
    modalFieldPhaseSlots: sourceCoupledPhaseSlots,
    modalFieldSpectralMomentSlots: sourceCoupledSpectralMoment,
    modalFieldMetadataSlots: new Float32Array(modeSlots.length),
  });
  if (featureState?.analysis?.modalDescriptorAuthorityState) {
    featureState.analysis.modalDescriptorAuthorityState.previousFieldAuthority =
      modalDescriptor.fieldAuthority;
  }
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: sourceEvidence?.sourceEnergy ?? 0,
    renderBoundaryState:
      sourceEvidence?.renderBoundaryState ??
      sourceEvidence?.sourceBoundaryState ??
      (soundActive || micActive || isLiveInputActive ? "zero" : "absent"),
    modalResponse: null,
    candidateForcingSlots,
    candidateResponseSlots,
    capacity: MAX_STACK_SLOTS,
  });

  return {
    fieldState: FIELD_STATES.idle,
    hasModalField: false,
    renderAuthority: false,
    energyLedger,
    projectedRenderEnergy: energyLedger.projectedRenderEnergy,
    sourceEvidence,
    isLiveInputActive,
    soundActive,
    micActive,
    averageAmplitude: 0,
    fftLinearAmplitudes: silentFft,
    activeModeCount: 0,
    activeModalFieldModeCount: 0,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots:
      modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
    modalFieldSpectralSeedDirection,
    modalFieldMetadataSlots: modalDescriptor.slotViews.modalFieldMetadataSlots,
    bandEnergies,
    transientEnergy: 0,
    spectralCentroid: 0,
    spectralFlux: 0,
    structureSignal: 0,
    energySignal: 0,
    modalCoefficientEnergy: 0,
    retainedModalCoefficientEnergy: 0,
    modalResponseEnergy: 0,
    modalResponseRenderEnergy: 0,
    modalResponseRenderRawEnergy: 0,
    modalResponseCurrentRenderSourceEvidence: false,
    observationEnergy: 0,
    modalVisibilityEnergy: 0,
    modalObserverVisibilityEnergy: 0,
    modalPhaseAuthority: 0,
    changeSignal: 0,
    pulseSignal: 0,
    beatDetected: false,
    beatPulseId: 0,
    beatStrength: 0,
    beatConfidence: 0,
    estimatedTempo: 0,
    tempoConfidence: 0,
    beatPhase: 0,
    rhythmicDensity: 0,
    keyTonic: 0,
    keyMode: "major",
    keyConfidence: 0,
    keyTonicHue: 0,
    bassSalience: 0,
    timbreSpread: 0,
    spectralNovelty: 0,
    referenceModeSlots,
    sourceMode: "silent",
    debug: buildZeroAudioFeatureDebugSnapshot({
      sourceKind,
      analysisInputMode,
      soundActive,
      micActive,
      referenceModeSlots,
      bandEnergies,
      candidateForcingSlots,
      candidateResponseSlots,
      modeSlots,
      sourceCoupledSpectralMoment,
      resonantSpectralMoment,
      structuralMetrics: { energyLedger },
      auditSettings,
      requestedCavityGeometry,
      effectiveCavityGeometry,
    }),
  };
}
