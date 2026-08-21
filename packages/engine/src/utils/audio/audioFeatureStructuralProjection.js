import {
  combineModalLayers,
  copyFloatArray,
  countActiveSlots,
} from "./modalStack.js";
import { mergeModalCandidateSources } from "./modalFieldDescriptorSource.js";

function roundStructuralSignature(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
}

function computeSlotSignature(slots, capacity) {
  const slotLimit = Math.min(capacity, Math.floor((slots?.length ?? 0) / 4));
  let signature = 0;

  for (let index = 0; index < slotLimit; index += 1) {
    const amplitude = slots[index * 4 + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }

    signature +=
      (index + 1) *
      (((slots[index * 4] ?? 0) * 3.17 +
        (slots[index * 4 + 1] ?? 0) * 5.11 +
        (slots[index * 4 + 2] ?? 0) * 7.13 +
        amplitude * 11.19) *
        amplitude);
  }

  return roundStructuralSignature(signature);
}

function computeSpectralMomentSignature(momentSlots, capacity) {
  const slotLimit = Math.min(capacity, Math.floor((momentSlots?.length ?? 0) / 4));
  let signature = 0;

  for (let index = 0; index < slotLimit; index += 1) {
    signature +=
      (index + 1) *
      ((momentSlots[index * 4] ?? 0) * 2.73 +
        (momentSlots[index * 4 + 1] ?? 0) * 4.87 +
        (momentSlots[index * 4 + 2] ?? 0) * 6.41 +
        (momentSlots[index * 4 + 3] ?? 0) * 9.97);
  }

  return roundStructuralSignature(signature);
}

function clearFrozenProjection(auditState) {
  auditState.frozenProjectionCaptured = false;
  auditState.frozenSourceCoupledSlots.fill(0);
  auditState.frozenResonantSlots.fill(0);
  auditState.frozenSourceCoupledPhaseSlots.fill(0);
  auditState.frozenResonantPhaseSlots.fill(0);
  auditState.frozenReferenceSourceCoupledSlots.fill(0);
  auditState.frozenReferenceResonantSlots.fill(0);
  auditState.frozenModeSlots.fill(0);
  auditState.frozenSourceCoupledSpectralMoment.fill(0);
  auditState.frozenResonantSpectralMoment.fill(0);
  auditState.frozenModalFieldSpectralSeedDirection.set([1, 0]);
}

function hasFrozenProjection(auditState) {
  return auditState?.frozenProjectionCaptured === true;
}

function captureFrozenProjection(auditState, projection) {
  auditState.frozenSourceCoupledSlots.set(projection.candidateForcingSlots);
  auditState.frozenResonantSlots.set(projection.candidateResponseSlots);
  auditState.frozenSourceCoupledPhaseSlots.set(
    projection.sourceCoupledPhaseSlots,
  );
  auditState.frozenResonantPhaseSlots.set(projection.resonantPhaseSlots);
  auditState.frozenReferenceSourceCoupledSlots.set(
    projection.referenceSourceCoupledSlots,
  );
  auditState.frozenReferenceResonantSlots.set(
    projection.referenceResonantSlots,
  );
  auditState.frozenModeSlots.set(projection.modeSlots);
  auditState.frozenSourceCoupledSpectralMoment.set(
    projection.sourceCoupledSpectralMoment,
  );
  auditState.frozenResonantSpectralMoment.set(
    projection.resonantSpectralMoment,
  );
  auditState.frozenModalFieldSpectralSeedDirection.set(
    projection.modalFieldSpectralSeedDirection,
  );
  auditState.frozenProjectionCaptured = true;
}

function readFrozenProjection(auditState, projection) {
  return {
    ...projection,
    candidateForcingSlots: auditState.frozenSourceCoupledSlots,
    candidateResponseSlots: auditState.frozenResonantSlots,
    sourceCoupledPhaseSlots: auditState.frozenSourceCoupledPhaseSlots,
    resonantPhaseSlots: auditState.frozenResonantPhaseSlots,
    modeSlots: auditState.frozenModeSlots,
    sourceCoupledSpectralMoment:
      auditState.frozenSourceCoupledSpectralMoment,
    resonantSpectralMoment: auditState.frozenResonantSpectralMoment,
    modalFieldSpectralSeedDirection:
      auditState.frozenModalFieldSpectralSeedDirection,
  };
}

function firstDefined(primary, secondary, fallback) {
  return primary ?? secondary ?? fallback;
}

function resolveSpectralSources(primary, secondary, fallback) {
  return {
    spectralMomentSlots: firstDefined(
      primary.spectralMomentSlots,
      secondary.spectralMomentSlots,
      fallback.spectralMomentSlots,
    ),
  };
}

function createStructuralLayer({
  capacity,
  slots,
  phaseSlots,
  referenceSlots,
  visualSources,
}) {
  return {
    referenceSlots,
    candidates: {
      slots,
      phaseSlots,
      ...visualSources,
      activeModeCount: countActiveSlots(slots, capacity),
    },
  };
}

function resolveProjectionLayer({
  capacity,
  frozenProjectionActive,
  frozen,
  current,
  fallback,
}) {
  const projection = frozenProjectionActive ? frozen : current;
  const projectionFallback = frozenProjectionActive ? frozen : fallback;

  return createStructuralLayer({
    capacity,
    slots: projection.slots ?? projectionFallback.slots,
    phaseSlots: projection.phaseSlots ?? projectionFallback.phaseSlots,
    referenceSlots:
      projection.referenceSlots ?? projectionFallback.referenceSlots,
    visualSources: resolveSpectralSources(
      projection,
      projectionFallback,
      projectionFallback,
    ),
  });
}

function resolveProposalLayer({
  capacity,
  proposal,
  current,
  fallback,
}) {
  return createStructuralLayer({
    capacity,
    slots: firstDefined(proposal.slots, current.slots, fallback.slots),
    phaseSlots: firstDefined(
      proposal.phaseSlots,
      current.phaseSlots,
      fallback.phaseSlots,
    ),
    referenceSlots: firstDefined(
      proposal.referenceSlots,
      current.referenceSlots,
      fallback.referenceSlots,
    ),
    visualSources: resolveSpectralSources(
      proposal,
      current,
      fallback,
    ),
  });
}

function readStructuralLayerSources(preparedInputs, structuralState) {
  const state = structuralState ?? {};
  const frozenState = preparedInputs.auditState ?? {};

  return {
    freezeModeSlots: state.freezeModeSlots,
    sourceCoupled: {
      frozen: {
        slots: frozenState.frozenSourceCoupledSlots,
        phaseSlots: frozenState.frozenSourceCoupledPhaseSlots,
        referenceSlots: frozenState.frozenReferenceSourceCoupledSlots,
        spectralMomentSlots: frozenState.frozenSourceCoupledSpectralMoment,
      },
      proposal: {
        slots: state.proposalSourceCoupledSlotsSource,
        phaseSlots: state.proposalSourceCoupledPhaseSlotsSource,
        referenceSlots: state.proposalReferenceSourceCoupledSlotsSource,
        spectralMomentSlots:
          state.proposalSourceCoupledSpectralMomentSource,
      },
      current: {
        slots: state.candidateForcingSlotsSource,
        phaseSlots: state.sourceCoupledPhaseSlotsSource,
        referenceSlots: state.referenceSourceCoupledSlotsSource,
        spectralMomentSlots: state.sourceCoupledSpectralMomentSource,
      },
      fallback: {
        slots: preparedInputs.sourceCoupledState.slots,
        phaseSlots: preparedInputs.sourceCoupledPhaseSlots,
        referenceSlots: preparedInputs.sourceCoupledState.referenceSlots,
        spectralMomentSlots:
          preparedInputs.sourceCoupledState.spectralMomentSlots,
      },
    },
    resonant: {
      frozen: {
        slots: frozenState.frozenResonantSlots,
        phaseSlots: frozenState.frozenResonantPhaseSlots,
        referenceSlots: frozenState.frozenReferenceResonantSlots,
        spectralMomentSlots: frozenState.frozenResonantSpectralMoment,
      },
      proposal: {
        slots: state.proposalResonantSlotsSource,
        phaseSlots: state.proposalResonantPhaseSlotsSource,
        referenceSlots: state.proposalReferenceResonantSlotsSource,
        spectralMomentSlots: state.proposalResonantSpectralMomentSource,
      },
      current: {
        slots: state.candidateResponseSlotsSource,
        phaseSlots: state.resonantPhaseSlotsSource,
        referenceSlots: state.referenceResonantSlotsSource,
        spectralMomentSlots: state.resonantSpectralMomentSource,
      },
      fallback: {
        slots: preparedInputs.resonantState.slots,
        phaseSlots: preparedInputs.resonantPhaseSlots,
        referenceSlots: preparedInputs.resonantState.referenceSlots,
        spectralMomentSlots: preparedInputs.resonantState.spectralMomentSlots,
      },
    },
  };
}

function resolveStructuralProjectionSources(preparedInputs, structuralState) {
  const {
    auditState,
    capacity,
    resolvedAuditSettings,
  } = preparedInputs;
  const layerSources = readStructuralLayerSources(
    preparedInputs,
    structuralState,
  );
  const freezeModeSlots = Boolean(
    layerSources.freezeModeSlots ?? resolvedAuditSettings?.freezeModeSlots,
  );
  const frozenProjectionActive =
    freezeModeSlots && hasFrozenProjection(auditState);
  const sourceCoupled = resolveProjectionLayer({
    capacity,
    frozenProjectionActive,
    ...layerSources.sourceCoupled,
  });
  const resonant = resolveProjectionLayer({
    capacity,
    frozenProjectionActive,
    ...layerSources.resonant,
  });

  return {
    freezeModeSlots,
    frozenProjectionActive,
    sourceCoupled,
    resonant,
    activeModeCount:
      sourceCoupled.candidates.activeModeCount +
      resonant.candidates.activeModeCount,
  };
}

function resolveStructuralProposalLayers(preparedInputs, structuralState) {
  const { capacity } = preparedInputs;
  const layerSources = readStructuralLayerSources(
    preparedInputs,
    structuralState,
  );

  return {
    sourceCoupled: resolveProposalLayer({
      capacity,
      ...layerSources.sourceCoupled,
    }),
    resonant: resolveProposalLayer({
      capacity,
      ...layerSources.resonant,
    }),
  };
}

export function resolveModalFieldContinuityCandidates({
  preparedInputs,
  structuralState,
  renderCandidates,
  scale,
  allowProposalCandidates = true,
}) {
  if (!allowProposalCandidates) {
    return renderCandidates;
  }

  const proposalLayers = resolveStructuralProposalLayers(
    preparedInputs,
    structuralState,
  );
  const hasProposalCandidates =
    proposalLayers.sourceCoupled.candidates.activeModeCount +
      proposalLayers.resonant.candidates.activeModeCount >
    0;
  const proposalDiffersFromRender =
    proposalLayers.sourceCoupled.candidates.slots !==
      renderCandidates.sourceCoupled.slots ||
    proposalLayers.resonant.candidates.slots !==
      renderCandidates.resonant.slots;

  if (!hasProposalCandidates || !proposalDiffersFromRender) {
    return renderCandidates;
  }

  const sourceCoupled = mergeModalCandidateSources({
    renderCandidates: renderCandidates.sourceCoupled,
    proposalCandidates: proposalLayers.sourceCoupled.candidates,
    capacity: preparedInputs.capacity,
    proposalScale:
      proposalLayers.sourceCoupled.candidates.slots ===
      renderCandidates.sourceCoupled.slots
        ? 1
        : scale < 1
          ? scale
          : 1,
  });
  const resonant = mergeModalCandidateSources({
    renderCandidates: renderCandidates.resonant,
    proposalCandidates: proposalLayers.resonant.candidates,
    capacity: preparedInputs.capacity,
    proposalScale:
      proposalLayers.resonant.candidates.slots ===
      renderCandidates.resonant.slots
        ? 1
        : scale < 1
          ? scale
          : 1,
  });

  return { sourceCoupled, resonant };
}

export function buildAudioFeatureStructuralFingerprint({
  preparedInputs,
  structuralState,
  activeSourceCoupledModeCount,
  activeResonantModeCount,
  activeModeCount,
}) {
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );
  const sourceCoupled = projectionSources.sourceCoupled;
  const resonant = projectionSources.resonant;

  return {
    activeSourceCoupledModeCount,
    activeResonantModeCount,
    activeModeCount,
    dominantFrequency: structuralState?.dominantFrequency ?? 0,
    dominantAmplitude: structuralState?.dominantAmplitude ?? 0,
    analysisEngine: structuralState?.analysisEngine ?? "none",
    pitchSource: structuralState?.pitchSource ?? "none",
    usedDecay: Boolean(structuralState?.usedDecay),
    sourceMode: structuralState?.sourceMode ?? preparedInputs.sourceMode,
    sourceCoupledSignature: computeSlotSignature(
      sourceCoupled.candidates.slots,
      preparedInputs.capacity,
    ),
    resonantSignature: computeSlotSignature(
      resonant.candidates.slots,
      preparedInputs.capacity,
    ),
    referenceSourceCoupledSignature: computeSlotSignature(
      sourceCoupled.referenceSlots,
      preparedInputs.capacity,
    ),
    referenceResonantSignature: computeSlotSignature(
      resonant.referenceSlots,
      preparedInputs.capacity,
    ),
    sourceCoupledSpectralMomentSignature: sourceCoupled.candidates
      .spectralMomentSlots
      ? computeSpectralMomentSignature(
          sourceCoupled.candidates.spectralMomentSlots,
          preparedInputs.capacity,
        )
      : 0,
    resonantSpectralMomentSignature: resonant.candidates.spectralMomentSlots
      ? computeSpectralMomentSignature(
          resonant.candidates.spectralMomentSlots,
          preparedInputs.capacity,
        )
      : 0,
  };
}

export function materializeAudioFeatureStructuralSnapshot(
  preparedInputs,
  structuralState,
) {
  const {
    capacity,
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    sourceCoupledSpectralMoment,
    resonantSpectralMoment,
    modalFieldSpectralSeedDirection,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    auditState,
  } = preparedInputs;
  const projectionSources = resolveStructuralProjectionSources(
    preparedInputs,
    structuralState,
  );
  const sourceCoupled = projectionSources.sourceCoupled;
  const resonant = projectionSources.resonant;

  copyFloatArray(candidateForcingSlots, sourceCoupled.candidates.slots);
  copyFloatArray(candidateResponseSlots, resonant.candidates.slots);
  copyFloatArray(sourceCoupledPhaseSlots, sourceCoupled.candidates.phaseSlots);
  copyFloatArray(resonantPhaseSlots, resonant.candidates.phaseSlots);
  copyFloatArray(referenceSourceCoupledSlots, sourceCoupled.referenceSlots);
  copyFloatArray(referenceResonantSlots, resonant.referenceSlots);
  combineModalLayers(
    modeSlots,
    [
      { slots: candidateForcingSlots, weight: 1 },
      { slots: candidateResponseSlots, weight: 1 },
    ],
    capacity,
  );
  combineModalLayers(
    referenceModeSlots,
    [
      { slots: referenceSourceCoupledSlots, weight: 1 },
      { slots: referenceResonantSlots, weight: 1 },
    ],
    capacity,
  );

  if (sourceCoupled.candidates.spectralMomentSlots) {
    copyFloatArray(
      sourceCoupledSpectralMoment,
      sourceCoupled.candidates.spectralMomentSlots,
    );
    copyFloatArray(
      resonantSpectralMoment,
      resonant.candidates.spectralMomentSlots,
    );
  } else {
    sourceCoupledSpectralMoment.fill(0);
    resonantSpectralMoment.fill(0);
  }
  modalFieldSpectralSeedDirection.set(
    structuralState?.modalFieldSpectralSeedDirection ?? [1, 0],
  );

  const projection = {
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    sourceCoupledSpectralMoment,
    resonantSpectralMoment,
    modalFieldSpectralSeedDirection,
    activeSourceCoupledModeCount: sourceCoupled.candidates.activeModeCount,
    activeResonantModeCount: resonant.candidates.activeModeCount,
    activeModeCount: projectionSources.activeModeCount,
  };

  if (projectionSources.freezeModeSlots && auditState) {
    if (!projectionSources.frozenProjectionActive) {
      captureFrozenProjection(auditState, projection);
    }
    return readFrozenProjection(auditState, projection);
  }
  if (auditState) {
    clearFrozenProjection(auditState);
  }
  return projection;
}

export function materializeAudioFeatureProposalSnapshot(
  preparedInputs,
  structuralState,
) {
  const { capacity, signalModeSlots, signalReferenceModeSlots } =
    preparedInputs;
  const proposalLayers = resolveStructuralProposalLayers(
    preparedInputs,
    structuralState,
  );
  combineModalLayers(
    signalModeSlots,
    [
      {
        slots: proposalLayers.sourceCoupled.candidates.slots,
        weight: 1,
      },
      {
        slots: proposalLayers.resonant.candidates.slots,
        weight: 1,
      },
    ],
    capacity,
  );
  combineModalLayers(
    signalReferenceModeSlots,
    [
      {
        slots: proposalLayers.sourceCoupled.referenceSlots,
        weight: 1,
      },
      {
        slots: proposalLayers.resonant.referenceSlots,
        weight: 1,
      },
    ],
    capacity,
  );

  return {
    signalModeSlots,
    signalReferenceModeSlots,
  };
}
