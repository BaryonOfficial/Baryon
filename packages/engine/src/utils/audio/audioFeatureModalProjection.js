import { AUDIO_DEFAULTS } from "../../defaults.js";
import { buildCanonicalFullModalDescriptor } from "../../core/modalDescriptor.js";
import {
  hasVisibleModalFieldContinuityPayload,
  updateModalFieldContinuity,
} from "../../core/modalFieldContinuity.js";
import { getModalGeometryBackend } from "../../core/modalGeometryBackend.js";
import {
  buildModalCandidateMetadataSlots,
  buildModalFieldDescriptorSource,
} from "./modalFieldDescriptorSource.js";
import { resolveModalFieldContinuityCandidates } from "./audioFeatureStructuralProjection.js";
import { deriveFieldState } from "./fieldState.js";
import { FIELD_STATES } from "./types.js";
import { resolveContinuityDeltaMs } from "./analysisTiming.js";
import { sumModalSlotAmplitudes } from "./modalStack.js";
import {
  DEFAULT_RENDER_ENERGY_EPSILON,
  buildModalEnergyLedger,
  hasProjectedRenderAuthority,
  sumProjectedSlotEnergy,
} from "./modalEnergyLedger.js";
import { resolveAudioRenderBoundary } from "./audioSourceEvidence.js";
import { clamp01 } from "../math.js";

const LIVE_SOURCE_MODAL_CONTINUITY_RELEASE_SECONDS = 0.75;

function deriveModalObservationEnergy(
  modalCoefficientEnergy,
  modalResponseEnergy,
) {
  return clamp01(Math.max(modalCoefficientEnergy, modalResponseEnergy));
}

function resolveModalObservationCoherence(structuralMetrics) {
  if (Number.isFinite(structuralMetrics?.modalObservationCoherence)) {
    return clamp01(structuralMetrics.modalObservationCoherence);
  }
  return 1;
}

function resolveModalObservationConfidence(structuralMetrics) {
  if (Number.isFinite(structuralMetrics?.modalObservationConfidence)) {
    return clamp01(structuralMetrics.modalObservationConfidence);
  }
  return 1;
}

function hasFeatureFrameRenderAuthority({
  fieldState,
  hasModalField,
  modalCoefficientEnergy,
  observationEnergy,
}) {
  if (fieldState === FIELD_STATES.test) {
    return true;
  }

  return (
    hasModalField &&
    (modalCoefficientEnergy > DEFAULT_RENDER_ENERGY_EPSILON ||
      observationEnergy > DEFAULT_RENDER_ENERGY_EPSILON)
  );
}

function sumModalSlotCoefficientEnergy(modeSlots, capacity) {
  const slotCount = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const coefficient = modeSlots?.[index * 4 + 3] ?? 0;
    if (coefficient > 0) {
      total += coefficient * coefficient;
    }
  }
  return total;
}

function scaleSlotAmplitudes(modeSlots, capacity, scale) {
  if (!(modeSlots instanceof Float32Array) || scale >= 1) {
    return;
  }

  const slotCount = Math.min(
    capacity,
    Math.floor((modeSlots?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4 + 3;
    modeSlots[offset] = (modeSlots[offset] ?? 0) * scale;
  }
}

function resolveModalRenderSources({
  preparedInputs,
  analysisResult,
  renderAuthority,
  continuityHold,
  projectedEnergyScale,
}) {
  const sourceCoupled = {
    slots: analysisResult.candidateForcingSlots,
    phaseSlots: analysisResult.sourceCoupledPhaseSlots,
    spectralMomentSlots: analysisResult.sourceCoupledSpectralMoment,
    activeModeCount: analysisResult.activeSourceCoupledModeCount,
  };
  const resonant = {
    slots: analysisResult.candidateResponseSlots,
    phaseSlots: analysisResult.resonantPhaseSlots,
    spectralMomentSlots: analysisResult.resonantSpectralMoment,
    activeModeCount: analysisResult.activeResonantModeCount,
  };

  if (
    renderAuthority &&
    projectedEnergyScale < 1 &&
    analysisResult.structuralState?.freezeModeSlots !== true
  ) {
    scaleSlotAmplitudes(
      sourceCoupled.slots,
      preparedInputs.capacity,
      projectedEnergyScale,
    );
    scaleSlotAmplitudes(
      resonant.slots,
      preparedInputs.capacity,
      projectedEnergyScale,
    );
    scaleSlotAmplitudes(
      analysisResult.modeSlots,
      preparedInputs.capacity,
      projectedEnergyScale,
    );
  }

  if (renderAuthority || continuityHold) {
    return {
      sourceCoupled,
      resonant,
      modeSlots: analysisResult.modeSlots,
      referenceModeSlots: analysisResult.referenceModeSlots,
      bandEnergies: analysisResult.bandEnergies,
    };
  }

  preparedInputs.modeSlots.fill(0);
  preparedInputs.referenceModeSlots.fill(0);
  preparedInputs.sourceCoupledSpectralMoment.fill(0);
  preparedInputs.resonantSpectralMoment.fill(0);
  preparedInputs.bandEnergies.fill(0);

  return {
    sourceCoupled: {
      slots: preparedInputs.zeroSourceCoupledTargetSlots,
      phaseSlots: preparedInputs.zeroSourceCoupledTargetSlots,
      spectralMomentSlots: preparedInputs.zeroSourceCoupledTargetSlots,
      activeModeCount: 0,
    },
    resonant: {
      slots: preparedInputs.zeroResonantTargetSlots,
      phaseSlots: preparedInputs.zeroResonantTargetSlots,
      spectralMomentSlots: preparedInputs.zeroResonantTargetSlots,
      activeModeCount: 0,
    },
    modeSlots: preparedInputs.modeSlots,
    referenceModeSlots: preparedInputs.referenceModeSlots,
    bandEnergies: preparedInputs.bandEnergies,
  };
}

function resolveHeldContinuityProjection(descriptorSource, energyLedger) {
  const projectedRenderEnergy = sumProjectedSlotEnergy(
    descriptorSource.modalFieldSlots,
    descriptorSource.activeModalFieldModeCount,
  );
  if (projectedRenderEnergy <= energyLedger.renderEnergyEpsilon) {
    return null;
  }

  const storedSourceCoupledEnergy = clamp01(
    energyLedger.storedModalSourceCoupledEnergy ?? 0,
  );
  const storedResonantEnergy = clamp01(
    energyLedger.storedModalResonantEnergy ?? 0,
  );
  const storedLayerEnergy = storedSourceCoupledEnergy + storedResonantEnergy;

  return {
    projectedRenderEnergy,
    sourceCoupledEnergy:
      projectedRenderEnergy *
      (storedLayerEnergy > 0
        ? storedSourceCoupledEnergy / storedLayerEnergy
        : 1),
    resonantEnergy:
      projectedRenderEnergy *
      (storedLayerEnergy > 0 ? storedResonantEnergy / storedLayerEnergy : 0),
  };
}

function attachModalCandidateMetadata(candidates, capacity, candidateState) {
  return {
    ...candidates,
    metadataSlots: buildModalCandidateMetadataSlots({
      slots: candidates.slots,
      activeModeCount: candidates.activeModeCount,
      capacity,
      candidateState,
    }),
  };
}

function buildContinuityDescriptorProjection({
  preparedInputs,
  analysisResult,
  renderSources,
  renderAuthority,
  continuityHold,
  modalObservationConfidence,
  energyLedger,
}) {
  const structuralState = analysisResult.structuralState ?? {};
  const continuityCandidates = resolveModalFieldContinuityCandidates({
    preparedInputs,
    structuralState,
    renderCandidates: {
      sourceCoupled: renderSources.sourceCoupled,
      resonant: renderSources.resonant,
    },
    scale: renderAuthority ? energyLedger.projectedEnergyScale : 1,
    allowProposalCandidates:
      (renderAuthority || continuityHold) &&
      structuralState.freezeModeSlots !== true,
  });
  const candidateState = structuralState.modalCandidateState;
  const descriptorSource = buildModalFieldDescriptorSource({
    sourceCoupledCandidates: attachModalCandidateMetadata(
      continuityCandidates.sourceCoupled,
      preparedInputs.capacity,
      candidateState,
    ),
    resonantCandidates: attachModalCandidateMetadata(
      continuityCandidates.resonant,
      preparedInputs.capacity,
      candidateState,
    ),
    radius: preparedInputs.radius,
    cavityAcousticScale: preparedInputs.cavityAcousticScale,
    boundaryMode: preparedInputs.boundaryMode,
    modalObservationConfidence,
  });

  return { continuityCandidates, descriptorSource };
}

function updateProjectedModalContinuity({
  preparedInputs,
  descriptorSource,
  renderAuthority,
  continuityHold,
}) {
  const previousFrameAtMs =
    preparedInputs.analysisMemory.lastModalFieldContinuityFrameAtMs;
  const resetToken = `${preparedInputs.analysisSessionKey}|${preparedInputs.analysisInputsSignature}`;
  const deltaMs = resolveContinuityDeltaMs(
    previousFrameAtMs,
    preparedInputs.currentFrameAtMs,
  );
  preparedInputs.analysisMemory.lastModalFieldContinuityFrameAtMs =
    preparedInputs.currentFrameAtMs;

  return updateModalFieldContinuity(preparedInputs.modalFieldContinuityState, {
    descriptorSource,
    deltaTimeSec: deltaMs / 1000,
    resetToken,
    renderAuthority: renderAuthority || continuityHold,
    maxVisibleModeCount: preparedInputs.capacity,
    releaseSeconds: continuityHold
      ? LIVE_SOURCE_MODAL_CONTINUITY_RELEASE_SECONDS
      : undefined,
    normalizeCandidateEvidence: true,
    cavityGeometry: preparedInputs.effectiveCavityGeometry,
  });
}

function resolveProjectedModalDescriptor({
  preparedInputs,
  analysisResult,
  topologyFrame,
  renderSources,
  renderAuthority,
  continuityHold,
  modalObservationCoherence,
  modalObservationConfidence,
  energyLedger,
}) {
  if (topologyFrame?.modalDescriptor) {
    return {
      modalDescriptor: topologyFrame.modalDescriptor,
      continuityDiagnostics: topologyFrame.modalFieldContinuity ?? null,
      heldContinuityProjection: null,
      continuityExpired: false,
    };
  }
  const structuralMetrics = analysisResult.structuralMetrics ?? {};
  const { continuityCandidates, descriptorSource } =
    buildContinuityDescriptorProjection({
      preparedInputs,
      analysisResult,
      renderSources,
      renderAuthority,
      continuityHold,
      modalObservationConfidence,
      energyLedger,
    });
  const modalGeometryBackend = getModalGeometryBackend(
    preparedInputs.effectiveCavityGeometry,
  );
  const upstreamSourceCoupledTopology =
    modalGeometryBackend.summarizeModalSlotTopologyRange(
      continuityCandidates.sourceCoupled.slots,
      { count: continuityCandidates.sourceCoupled.activeModeCount },
    );
  const upstreamResonantTopology =
    modalGeometryBackend.summarizeModalSlotTopologyRange(
      continuityCandidates.resonant.slots,
      { count: continuityCandidates.resonant.activeModeCount },
    );
  const upstreamCandidateTopology =
    modalGeometryBackend.summarizeModalSlotTopologyRange(
      descriptorSource.modalFieldSlots,
      { count: descriptorSource.activeModalFieldModeCount },
    );
  const upstreamSourceCoupledModalEnergy = sumModalSlotCoefficientEnergy(
    continuityCandidates.sourceCoupled.slots,
    continuityCandidates.sourceCoupled.activeModeCount,
  );
  const upstreamResonantModalEnergy = sumModalSlotCoefficientEnergy(
    continuityCandidates.resonant.slots,
    continuityCandidates.resonant.activeModeCount,
  );
  const continuityResult = updateProjectedModalContinuity({
    preparedInputs,
    descriptorSource,
    renderAuthority,
    continuityHold,
  });
  const continuityDescriptorSource = continuityResult.descriptorSource;
  const continuityDiagnostics = continuityResult.diagnostics;
  const heldContinuityProjection = continuityHold
    ? resolveHeldContinuityProjection(continuityDescriptorSource, energyLedger)
    : null;
  const modalDescriptor = buildCanonicalFullModalDescriptor({
    generation: preparedInputs.auditState?.frame ?? 0,
    maxTotalModes: Math.min(
      preparedInputs.capacity,
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    ),
    modalFieldSlots: continuityDescriptorSource.modalFieldSlots,
    modalFieldPhaseSlots: continuityDescriptorSource.modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots:
      continuityDescriptorSource.modalFieldSpectralMomentSlots,
    modalFieldMetadataSlots: continuityDescriptorSource.modalFieldMetadataSlots,
    activeModalFieldModeCount:
      continuityDescriptorSource.activeModalFieldModeCount,
    observerCandidateModeCount: structuralMetrics.excitedModeCount,
    observedModalModeCount: structuralMetrics.observedModalModeCount,
    phaseAuthorityModeCount: structuralMetrics.modalPhaseCoherentFieldModeCount,
    rawCandidateModeCount: continuityDiagnostics.rawCandidateModeCount,
    confidenceQualifiedCandidateModeCount:
      continuityDiagnostics.confidenceQualifiedCandidateModeCount,
    lowConfidenceCandidateModeCount:
      continuityDiagnostics.lowConfidenceCandidateModeCount,
    rawCandidateModalEnergy: continuityDiagnostics.rawCandidateModalEnergy,
    confidenceWeightedCandidateEnergy:
      continuityDiagnostics.confidenceWeightedCandidateEnergy,
    modalObservationCoherence,
    modalObservationConfidence,
    upstreamSourceCoupledModeCount:
      continuityCandidates.sourceCoupled.activeModeCount,
    upstreamResonantModeCount: continuityCandidates.resonant.activeModeCount,
    upstreamCandidateModeCount: descriptorSource.activeModalFieldModeCount,
    upstreamSourceCoupledShellCount: upstreamSourceCoupledTopology.shellCount,
    upstreamResonantShellCount: upstreamResonantTopology.shellCount,
    upstreamCandidateShellCount: upstreamCandidateTopology.shellCount,
    upstreamSourceCoupledModalEnergy,
    upstreamResonantModalEnergy,
    upstreamCandidateModalEnergy:
      upstreamSourceCoupledModalEnergy + upstreamResonantModalEnergy,
    cavityGeometry: preparedInputs.effectiveCavityGeometry,
    modeIdentityRetentionRatio:
      continuityDiagnostics.modeIdentityRetentionRatio,
    previousFieldAuthority:
      preparedInputs.modalDescriptorAuthorityState?.previousFieldAuthority,
  });

  if (preparedInputs.modalDescriptorAuthorityState) {
    preparedInputs.modalDescriptorAuthorityState.previousFieldAuthority =
      modalDescriptor.fieldAuthority;
  }

  return {
    modalDescriptor,
    continuityDiagnostics,
    heldContinuityProjection,
    continuityExpired: continuityHold && heldContinuityProjection === null,
  };
}

function resolveModalEnergyProjection({ preparedInputs, analysisResult }) {
  const structuralMetrics = analysisResult.structuralMetrics;
  const retainedModalCoefficientEnergy = clamp01(
    sumModalSlotAmplitudes(analysisResult.modeSlots, preparedInputs.capacity),
  );
  const sourceModalCoefficientEnergy = clamp01(
    sumModalSlotAmplitudes(
      analysisResult.signalModeSlots ?? analysisResult.modeSlots,
      preparedInputs.capacity,
    ),
  );
  const sourceCoupledResponseEnergy = clamp01(
    structuralMetrics?.modalResponseRenderSourceCoupledEnergy ??
      structuralMetrics?.modalResponseSourceCoupledEnergy ??
      0,
  );
  const resonantResponseEnergy = clamp01(
    structuralMetrics?.modalResponseRenderResonantEnergy ??
      structuralMetrics?.modalResponseResonantEnergy ??
      0,
  );
  const modalResponseEnergy = clamp01(
    Math.max(
      structuralMetrics?.modalResponseEnergy ?? 0,
      sourceCoupledResponseEnergy,
      resonantResponseEnergy,
    ),
  );
  const sourceEvidence = resolveAudioRenderBoundary({
    sourceEvidence: preparedInputs.sourceEvidence,
    modalResponse: structuralMetrics,
  });
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: sourceEvidence.sourceEnergy,
    renderBoundaryState:
      sourceEvidence.renderBoundaryState ?? sourceEvidence.sourceBoundaryState,
    modalResponse: structuralMetrics,
    candidateForcingSlots: analysisResult.candidateForcingSlots,
    candidateResponseSlots: analysisResult.candidateResponseSlots,
    capacity: preparedInputs.capacity,
    currentSignalEnergy: structuralMetrics?.currentSignalEnergy,
    currentSignalAmplitude: structuralMetrics?.currentSignalAmplitude,
    renderEnergyEpsilon: structuralMetrics?.renderEnergyEpsilon,
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
  });
  const projectedRenderAuthority = hasProjectedRenderAuthority(energyLedger);
  const projectedModalRenderEnergy = projectedRenderAuthority
    ? energyLedger.projectedRenderEnergy
    : 0;

  return {
    retainedModalCoefficientEnergy,
    sourceModalCoefficientEnergy,
    sourceEvidence,
    energyLedger,
    projectedRenderAuthority,
    projectedModalRenderEnergy,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy: projectedRenderAuthority
      ? energyLedger.projectedSourceCoupledEnergy
      : 0,
    modalResponseResonantEnergy: projectedRenderAuthority
      ? energyLedger.projectedResonantEnergy
      : 0,
    observationEnergy: projectedRenderAuthority
      ? deriveModalObservationEnergy(
          projectedModalRenderEnergy,
          modalResponseEnergy,
        )
      : 0,
  };
}

function resolveInitialModalFieldState({
  preparedInputs,
  analysisResult,
  topologyFrame,
  energyProjection,
}) {
  const {
    sourceEvidence,
    sourceModalCoefficientEnergy,
    energyLedger,
    projectedRenderAuthority,
    projectedModalRenderEnergy,
    observationEnergy,
  } = energyProjection;
  const sourceBoundaryModalForcingAbsent =
    sourceEvidence.currentSourceEvidence !== true &&
    (analysisResult.usedDecay ||
      sourceModalCoefficientEnergy <= DEFAULT_RENDER_ENERGY_EPSILON);
  const observerAuthorizedActiveField =
    (analysisResult.activeModeCount ?? 0) > 0 &&
    !sourceBoundaryModalForcingAbsent &&
    (preparedInputs.analysisInputMode === "live" ||
      projectedModalRenderEnergy > 0.02 ||
      (!analysisResult.usedDecay &&
        projectedModalRenderEnergy > energyLedger.renderEnergyEpsilon));
  const derivedField = deriveFieldState({
    injectTestTone: preparedInputs.resolvedAuditSettings.injectTestTone,
    activeModeCount: projectedRenderAuthority
      ? analysisResult.activeModeCount
      : 0,
    usedDecay:
      projectedRenderAuthority &&
      analysisResult.usedDecay &&
      !observerAuthorizedActiveField,
  });
  let fieldState = projectedRenderAuthority
    ? derivedField.fieldState
    : FIELD_STATES.idle;
  let hasModalField = projectedRenderAuthority
    ? derivedField.hasModalField
    : false;
  const renderAuthority =
    projectedRenderAuthority &&
    hasFeatureFrameRenderAuthority({
      fieldState,
      hasModalField,
      modalCoefficientEnergy: projectedModalRenderEnergy,
      observationEnergy,
    });
  const continuityHold =
    !topologyFrame &&
    !renderAuthority &&
    sourceEvidence.currentSourceEvidence === true &&
    energyLedger.renderBoundaryState === "live" &&
    energyLedger.storedModalEnergy > energyLedger.renderEnergyEpsilon &&
    hasVisibleModalFieldContinuityPayload(
      preparedInputs.modalFieldContinuityState,
    );

  if (continuityHold) {
    fieldState = FIELD_STATES.decay;
    hasModalField = true;
  }

  return {
    fieldState,
    hasModalField,
    renderAuthority,
    continuityHold,
    allowsFeatureSignals: projectedRenderAuthority,
    sourceMode:
      fieldState === FIELD_STATES.idle &&
      !preparedInputs.resolvedAuditSettings.injectTestTone
        ? "silent"
        : analysisResult.sourceMode,
    modalPhaseAuthority: renderAuthority
      ? clamp01(analysisResult.structuralMetrics?.modalPhaseAuthority ?? 0)
      : 0,
  };
}

function resolveFinalModalProjectionState({
  initialState,
  heldContinuityProjection,
  continuityExpired,
  structuralMetrics,
}) {
  let state = initialState;

  if (heldContinuityProjection) {
    const projectedModalRenderEnergy =
      heldContinuityProjection.projectedRenderEnergy;
    const modalResponseSourceCoupledEnergy =
      heldContinuityProjection.sourceCoupledEnergy;
    const modalResponseResonantEnergy = heldContinuityProjection.resonantEnergy;
    state = {
      ...state,
      projectedModalRenderEnergy,
      modalResponseSourceCoupledEnergy,
      modalResponseResonantEnergy,
      observationEnergy: deriveModalObservationEnergy(
        projectedModalRenderEnergy,
        state.modalResponseEnergy,
      ),
      renderAuthority: true,
      fieldState: FIELD_STATES.decay,
      hasModalField: true,
      modalPhaseAuthority: Math.max(
        state.modalPhaseAuthority,
        clamp01(structuralMetrics?.modalPhaseAuthority ?? 0),
      ),
      energyLedger: {
        ...state.energyLedger,
        projectedRenderEnergy: projectedModalRenderEnergy,
        rawProjectedRenderEnergy: Math.max(
          state.energyLedger.rawProjectedRenderEnergy ?? 0,
          projectedModalRenderEnergy,
        ),
        projectedSourceCoupledEnergy: modalResponseSourceCoupledEnergy,
        projectedResonantEnergy: modalResponseResonantEnergy,
        projectedEnergyScale: 1,
        renderAuthority: true,
      },
    };
  } else if (continuityExpired) {
    state = {
      ...state,
      fieldState: FIELD_STATES.idle,
      hasModalField: false,
      renderAuthority: false,
    };
  }

  return state;
}

function publishModalEnergyOverride(structuralMetrics, projectionState) {
  if (!structuralMetrics) {
    return;
  }

  structuralMetrics.energyLedger = projectionState.energyLedger;
  structuralMetrics.modalResponseRenderEnergy =
    projectionState.projectedModalRenderEnergy;
  structuralMetrics.modalResponseRenderSourceCoupledEnergy =
    projectionState.modalResponseSourceCoupledEnergy;
  structuralMetrics.modalResponseRenderResonantEnergy =
    projectionState.modalResponseResonantEnergy;
}

export function projectAudioFeatureModalField({
  preparedInputs,
  analysisResult,
  topologyFrame = null,
  topologyOnly = false,
}) {
  const energyProjection = resolveModalEnergyProjection({
    preparedInputs,
    analysisResult,
  });
  const { sourceEvidence, energyLedger: initialEnergyLedger } =
    energyProjection;
  if (!topologyOnly) {
    analysisResult.sourceEvidence = sourceEvidence;
    if (analysisResult.structuralMetrics) {
      analysisResult.structuralMetrics.energyLedger = initialEnergyLedger;
      analysisResult.structuralMetrics.sourceEvidence = sourceEvidence;
    }
  }

  const initialModalFieldState = resolveInitialModalFieldState({
    preparedInputs,
    analysisResult,
    topologyFrame,
    energyProjection,
  });
  const modalObservationCoherence = resolveModalObservationCoherence(
    analysisResult.structuralMetrics,
  );
  const modalObservationConfidence = resolveModalObservationConfidence(
    analysisResult.structuralMetrics,
  );
  if (analysisResult.structuralMetrics) {
    analysisResult.structuralMetrics.modalObservationCoherence =
      modalObservationCoherence;
    analysisResult.structuralMetrics.modalObservationConfidence =
      modalObservationConfidence;
  }

  const renderSources = resolveModalRenderSources({
    preparedInputs,
    analysisResult,
    renderAuthority: initialModalFieldState.renderAuthority,
    continuityHold: initialModalFieldState.continuityHold,
    projectedEnergyScale: initialEnergyLedger.projectedEnergyScale,
  });
  const {
    modalDescriptor,
    continuityDiagnostics: modalFieldContinuityDiagnostics,
    heldContinuityProjection,
    continuityExpired,
  } = resolveProjectedModalDescriptor({
    preparedInputs,
    analysisResult,
    topologyFrame,
    renderSources,
    renderAuthority: initialModalFieldState.renderAuthority,
    continuityHold: initialModalFieldState.continuityHold,
    modalObservationCoherence,
    modalObservationConfidence,
    energyLedger: initialEnergyLedger,
  });

  const projectionState = resolveFinalModalProjectionState({
    initialState: { ...energyProjection, ...initialModalFieldState },
    heldContinuityProjection,
    continuityExpired,
    structuralMetrics: analysisResult.structuralMetrics,
  });

  if (projectionState.energyLedger !== initialEnergyLedger) {
    publishModalEnergyOverride(
      analysisResult.structuralMetrics,
      projectionState,
    );
  }

  const projectedTopologyFrame = {
    activeModeCount: modalDescriptor.counts.modalFieldModeCount,
    activeModalFieldModeCount: modalDescriptor.counts.modalFieldModeCount,
    modalFieldContinuity: modalFieldContinuityDiagnostics,
    modalDescriptor,
    modalFieldSlots: modalDescriptor.slotViews.modalFieldSlots,
    modalFieldPhaseSlots: modalDescriptor.slotViews.modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots:
      modalDescriptor.slotViews.modalFieldSpectralMomentSlots,
    modalFieldSpectralSeedDirection:
      analysisResult.modalFieldSpectralSeedDirection,
    modalFieldMetadataSlots: modalDescriptor.slotViews.modalFieldMetadataSlots,
  };

  return {
    fieldState: projectionState.fieldState,
    hasModalField: projectionState.hasModalField,
    renderAuthority: projectionState.renderAuthority,
    allowsFeatureSignals: projectionState.allowsFeatureSignals,
    energyLedger: projectionState.energyLedger,
    sourceEvidence,
    projectedModalRenderEnergy: projectionState.projectedModalRenderEnergy,
    retainedModalCoefficientEnergy:
      projectionState.retainedModalCoefficientEnergy,
    modalResponseEnergy: projectionState.modalResponseEnergy,
    modalResponseSourceCoupledEnergy:
      projectionState.modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy: projectionState.modalResponseResonantEnergy,
    observationEnergy: projectionState.observationEnergy,
    modalPhaseAuthority: projectionState.modalPhaseAuthority,
    // Per-mode phase velocity is stored relative to this shared rotating
    // frame. Transporting the anchor makes absolute oscillator frequency
    // observable without changing modalDescriptor render semantics.
    modalPhaseAnchorAngularVelocityRadPerSec:
      preparedInputs.featureState?.analysis?.modalExcitationState
        ?.phaseAnchorState?.angularVelocityRadPerSec ?? 0,
    modalObservationCoherence,
    modalObservationConfidence,
    modalFieldContinuityDiagnostics,
    modalDescriptor,
    sourceMode: projectionState.sourceMode,
    topologyFrame: projectedTopologyFrame,
    renderSources: {
      candidateForcingSlots: renderSources.sourceCoupled.slots,
      candidateResponseSlots: renderSources.resonant.slots,
      sourceCoupledSpectralMoment:
        renderSources.sourceCoupled.spectralMomentSlots,
      resonantSpectralMoment: renderSources.resonant.spectralMomentSlots,
      modeSlots: renderSources.modeSlots,
      referenceModeSlots: renderSources.referenceModeSlots,
      bandEnergies: renderSources.bandEnergies,
    },
  };
}
