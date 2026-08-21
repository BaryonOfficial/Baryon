import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "../../core/modalBudgets.js";
import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";
import { deriveCavityModalFieldCacheBandwidth } from "../../core/raymarch/fieldCachePassband.js";
import {
  countActiveSlots,
  projectModalStack,
  projectSpectralMomentStack,
} from "./modalStack.js";
import { createModalExcitationState } from "./modalExcitationState.js";
import {
  buildModalExcitationAtlas,
  MODAL_EXCITATION_RESONANT_MIN_HZ,
  resolveModalExcitationApparatus,
} from "./modalExcitationAtlas.js";
import {
  createSpectralMomentBasis,
  deriveSpectralSeedDirection,
  resolveSpectralResponseFrequency,
} from "./spectralPhase.js";
import {
  analyzeModalDrive,
  measureModalDriveResponse,
} from "./modalDriveAnalysis.js";
import { deriveCurrentResonantTopologySignal } from "./modalTopologySignal.js";
import {
  advancePhaseAnchorState,
  computePhaseAnchorAngularVelocityRadPerSec,
  normalizePhaseRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";
import {
  getModalObserverProfile,
  updateObservedSourceAmplitude,
} from "./modalObservedState.js";
import { buildModalCandidateState } from "./modalCandidateProjection.js";
import { buildModalEnergyLedger } from "./modalEnergyLedger.js";
import {
  measureModalProjection,
  mergeModalProjectionDiagnostics,
} from "./modalProjectionDiagnostics.js";
import {
  advanceModalObservationResponseFrame,
  isModalExcitationHardSilentFrame,
} from "./modalObservationResponseFrame.js";
import { clamp01, smoothstep } from "../math.js";

// Temporal coherence is a signal property, so it must not vary with the
// spatial source overlap. This preserves the prior product calibration
// independently of the physical coupling term.
const MODAL_COHERENCE_REFERENCE_PRIOR = 0.075;
const MODAL_OBSERVATION_COHERENCE_START = 0.12;
const MODAL_OBSERVATION_COHERENCE_FULL = 0.58;
const MODAL_OBSERVATION_RESPONSE_START = 0.0005;
const MODAL_OBSERVATION_RESPONSE_FULL = 0.012;
const MODAL_OBSERVATION_TRANSIENT_START = 0.018;
const MODAL_OBSERVATION_TRANSIENT_FULL = 0.16;
const MODAL_OBSERVATION_TRANSIENT_WEIGHT = 0.32;
function deriveModalObservationCoherence({
  preparedInputs,
  modalObserverMetrics,
  modeCoherence,
}) {
  const rawCoherence = Math.max(
    clamp01(modeCoherence ?? 0),
    clamp01(modalObserverMetrics?.resonantObservedCoherence ?? 0),
    clamp01(modalObserverMetrics?.sourceCoupledObservedCoherence ?? 0),
    clamp01(modalObserverMetrics?.modalPhaseAuthority ?? 0) * 0.5,
    clamp01(modalObserverMetrics?.resonantRingSupport ?? 0) * 0.45,
  );
  const deterministicSource =
    preparedInputs?.sourceKind === AUDIO_SOURCE_KINDS.file ||
    preparedInputs?.resolvedAuditSettings?.injectTestTone === true;
  if (
    deterministicSource &&
    (modalObserverMetrics?.observedModalModeCount ?? 0) > 0
  ) {
    return Math.max(rawCoherence, 0.72);
  }

  return rawCoherence;
}

function deriveModalObservationConfidence({
  modalObservationCoherence,
  modalResponseEnergy,
  modalPresence,
  transientEnergy,
}) {
  const coherenceGate = smoothstep(
    MODAL_OBSERVATION_COHERENCE_START,
    MODAL_OBSERVATION_COHERENCE_FULL,
    modalObservationCoherence,
  );
  const modalPresenceGate = smoothstep(
    MODAL_OBSERVATION_RESPONSE_START,
    MODAL_OBSERVATION_RESPONSE_FULL,
    Number.isFinite(modalPresence) ? modalPresence : modalResponseEnergy,
  );
  const transientPresence =
    MODAL_OBSERVATION_TRANSIENT_WEIGHT *
    smoothstep(
      MODAL_OBSERVATION_TRANSIENT_START,
      MODAL_OBSERVATION_TRANSIENT_FULL,
      transientEnergy,
    );

  return clamp01(
    coherenceGate * Math.max(modalPresenceGate, transientPresence),
  );
}

function clearLayerBuffers(layerBuffer) {
  layerBuffer.slots.fill(0);
  layerBuffer.referenceSlots.fill(0);
  layerBuffer.spectralMomentSlots.fill(0);
  layerBuffer.phaseSlots?.fill(0);
}

function scaleSlotAmplitudes(slots, scale) {
  if (!(slots instanceof Float32Array) || scale >= 1) {
    return;
  }

  for (let index = 3; index < slots.length; index += 4) {
    slots[index] = (slots[index] ?? 0) * scale;
  }
}

function remapReferenceToBlendedOrder(
  blendedSlots,
  rawReferenceSlots,
  capacity,
  output,
) {
  output.fill(0);

  const blendedLimit = Math.min(
    capacity,
    Math.floor((blendedSlots?.length ?? 0) / 4),
  );
  const rawLimit = Math.min(
    capacity,
    Math.floor((rawReferenceSlots?.length ?? 0) / 4),
  );

  for (let index = 0; index < blendedLimit; index += 1) {
    const offset = index * 4;
    const blendedAmplitude = blendedSlots[offset + 3] ?? 0;
    if (blendedAmplitude <= 0) {
      continue;
    }

    const u = blendedSlots[offset];
    const v = blendedSlots[offset + 1];
    const w = blendedSlots[offset + 2];
    output[offset] = u;
    output[offset + 1] = v;
    output[offset + 2] = w;

    for (
      let referenceIndex = 0;
      referenceIndex < rawLimit;
      referenceIndex += 1
    ) {
      const referenceOffset = referenceIndex * 4;
      const referenceAmplitude = rawReferenceSlots[referenceOffset + 3] ?? 0;
      if (
        referenceAmplitude > 0 &&
        rawReferenceSlots[referenceOffset] === u &&
        rawReferenceSlots[referenceOffset + 1] === v &&
        rawReferenceSlots[referenceOffset + 2] === w
      ) {
        output[offset + 3] = referenceAmplitude;
        break;
      }
    }
  }
}

function writeLayerEntry(
  layerBuffer,
  index,
  entry,
  referenceAmplitude,
) {
  const offset = index * 4;
  layerBuffer.slots[offset] = entry.u;
  layerBuffer.slots[offset + 1] = entry.v;
  layerBuffer.slots[offset + 2] = entry.w;
  layerBuffer.slots[offset + 3] = referenceAmplitude;
  layerBuffer.referenceSlots[offset] = entry.u;
  layerBuffer.referenceSlots[offset + 1] = entry.v;
  layerBuffer.referenceSlots[offset + 2] = entry.w;
  layerBuffer.referenceSlots[offset + 3] = referenceAmplitude;
  const frequencyHz = resolveSpectralResponseFrequency(entry);
  const basis = createSpectralMomentBasis({ frequencyHz });
  layerBuffer.spectralMomentSlots.set(basis, offset);
}

function writeShortlistedEntries(
  layerBuffer,
  entries,
  capacity,
  selectReference,
) {
  // The shortlist is already term-based: one shortlisted entry writes one slot,
  // and capacity is enforced in slot units rather than family units.
  const slotLimit = Math.min(
    capacity,
    entries.length,
    Math.floor((layerBuffer?.slots?.length ?? 0) / 4),
  );
  for (let index = 0; index < slotLimit; index += 1) {
    const entry = entries[index];
    writeLayerEntry(layerBuffer, index, entry, selectReference(entry));
  }
  return slotLimit;
}

function buildHarmonicSupport(entries, dominantFrequencyHz) {
  const support = new Float32Array(6);
  if (!dominantFrequencyHz || entries.length === 0) {
    return support;
  }

  for (let harmonic = 1; harmonic <= support.length; harmonic += 1) {
    const targetFrequency = dominantFrequencyHz * harmonic;
    let best = 0;
    for (const entry of entries) {
      const relativeError =
        Math.abs(entry.naturalFrequencyHz - targetFrequency) /
        Math.max(targetFrequency, 1);
      const match =
        clamp01(1 - relativeError * 10) * entry.amplitude * entry.coherence;
      best = Math.max(best, match);
    }
    support[harmonic - 1] = clamp01(best);
  }

  return support;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function getDisplayAmplitude(entry) {
  return clamp01(
    entry?.displayProjectionAmplitude ??
      entry?.modalResponseDisplayAmplitude ??
      entry?.amplitude ??
      0,
  );
}

function hasFreshSignalAuthority({
  modalResponseDisplayAmplitude = 0,
  modalResponseEnergy = 0,
  modalResponseDrive = 0,
  freshCouplingEvidence = false,
}) {
  if (freshCouplingEvidence !== true) {
    return false;
  }

  return (
    clamp01(modalResponseDisplayAmplitude ?? 0) > 0 &&
    clamp01(modalResponseEnergy ?? 0) > 0 &&
    clamp01(modalResponseDrive ?? 0) > 0
  );
}

function hasModalResponseProjectionEvidence(entry) {
  // The oscillator coefficient is continuous physical state. Admission is a
  // ranked capacity decision downstream, so an observer calibration threshold
  // must not erase low-amplitude modal detail here.
  // Stored oscillator energy is sufficient during ring-down; current forcing
  // must not become a second lifetime gate.
  return clamp01(entry?.modalResponseDisplayAmplitude ?? 0) > 0;
}

function buildProjectionShortlists({
  entries,
  sourceCoupledCapacity,
  resonantCapacity,
}) {
  const groups = new Map();
  for (const entry of entries) {
    if (!hasModalResponseProjectionEvidence(entry)) {
      continue;
    }
    const key = entry.responseModeKey ?? entry.modeKey;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const rankedGroups = Array.from(groups, ([key, members]) => ({
    key,
    members: members.sort(
      (left, right) =>
        (left.u ?? 0) - (right.u ?? 0) ||
        (left.v ?? 0) - (right.v ?? 0) ||
        (left.w ?? 0) - (right.w ?? 0),
    ),
    layer: members[0]?.layer,
    amplitude: Math.sqrt(
      members.reduce(
        (total, member) =>
          total +
          (member.modalResponseDisplayAmplitude ?? member.amplitude ?? 0) ** 2,
        0,
      ),
    ),
    naturalFrequencyHz: members[0]?.naturalFrequencyHz ?? 0,
  })).sort(
    (left, right) =>
      right.amplitude - left.amplitude ||
      left.naturalFrequencyHz - right.naturalFrequencyHz ||
      left.key.localeCompare(right.key),
  );

  const sourceCoupled = [];
  const resonant = [];
  for (const group of rankedGroups) {
    const target = group.layer === "resonant" ? resonant : sourceCoupled;
    const layerCapacity =
      group.layer === "resonant" ? resonantCapacity : sourceCoupledCapacity;
    if (target.length + group.members.length > layerCapacity) {
      continue;
    }
    for (const entry of group.members) {
      target.push({
        ...entry,
        displayProjectionAmplitude: clamp01(entry.amplitude ?? 0),
      });
    }
  }

  return { sourceCoupled, resonant };
}

function buildModalProjection({
  sourceCoupledEntries,
  resonantEntries,
  modalObserverMetrics,
}) {
  const {
    entries: projectedSourceCoupledEntries,
    metrics: sourceCoupledProjectionDiagnostics,
  } = measureModalProjection({
    entries: sourceCoupledEntries,
    layer: "source-coupled",
    modalObserverMetrics,
    resolveDisplayAmplitude: getDisplayAmplitude,
  });
  const {
    entries: projectedResonantEntries,
    metrics: resonantProjectionDiagnostics,
  } = measureModalProjection({
    entries: resonantEntries,
    layer: "resonant",
    modalObserverMetrics,
    resolveDisplayAmplitude: getDisplayAmplitude,
  });

  const projectionDiagnostics = mergeModalProjectionDiagnostics(
    sourceCoupledProjectionDiagnostics,
    resonantProjectionDiagnostics,
  );
  return {
    projectedSourceCoupledEntries,
    projectedResonantEntries,
    projectionDiagnostics,
  };
}

function updateModalProjectionBlends(context) {
  const {
    state,
    renderSourceCoupledCapacity,
    renderResonantCapacity,
  } = context;
  projectSpectralMomentStack(
    state.blendSourceCoupled,
    state.sourceCoupledProposal.slots,
    state.sourceCoupledProposal.spectralMomentSlots,
    renderSourceCoupledCapacity,
  );
  projectSpectralMomentStack(
    state.blendResonant,
    state.resonantProposal.slots,
    state.resonantProposal.spectralMomentSlots,
    renderResonantCapacity,
  );
  projectModalStack(
    state.blendSourceCoupled,
    state.sourceCoupledProposal.slots,
    renderSourceCoupledCapacity,
  );
  projectModalStack(
    state.blendResonant,
    state.resonantProposal.slots,
    renderResonantCapacity,
  );
}

function writeModalProjectionFieldState(context) {
  const {
    state,
    sourceCoupledCapacity,
    resonantCapacity,
    renderSourceCoupledCapacity,
    renderResonantCapacity,
  } = context;

  remapReferenceToBlendedOrder(
    state.blendSourceCoupled.slots,
    state.sourceCoupledProposal.referenceSlots,
    renderSourceCoupledCapacity,
    state.remappedSourceCoupledRef,
  );
  remapReferenceToBlendedOrder(
    state.blendResonant.slots,
    state.resonantProposal.referenceSlots,
    renderResonantCapacity,
    state.remappedResonantRef,
  );
  remapReferenceToBlendedOrder(
    state.sourceCoupledProposal.slots,
    state.previousSignalSourceCoupledSlots,
    sourceCoupledCapacity,
    state.remappedSignalSourceCoupledRef,
  );
  remapReferenceToBlendedOrder(
    state.resonantProposal.slots,
    state.previousSignalResonantSlots,
    resonantCapacity,
    state.remappedSignalResonantRef,
  );

  // The projected modes share one physical medium, so all relative phase rates
  // must use the same rotating frame rather than a layer-local anchor.
  const phaseAnchorAngularVelocityRadPerSec =
    computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        {
          visibleSlots: state.blendSourceCoupled.slots,
          capacity: renderSourceCoupledCapacity,
        },
        {
          visibleSlots: state.blendResonant.slots,
          capacity: renderResonantCapacity,
        },
      ],
      activeModes: state.activeModes,
    });
  const phaseObservedAtSec = context.preparedInputs.currentFrameAtMs / 1000;
  const phaseAnchorState = advancePhaseAnchorState({
    previous: state.phaseAnchorState,
    angularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    observedAtSec: phaseObservedAtSec,
  });
  state.phaseAnchorState = phaseAnchorState;
  writePhaseSlotsForVisibleModes({
    target: state.sourceCoupledProposal.phaseSlots,
    visibleSlots: state.sourceCoupledProposal.slots,
    capacity: sourceCoupledCapacity,
    activeModes: state.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });
  writePhaseSlotsForVisibleModes({
    target: state.resonantProposal.phaseSlots,
    visibleSlots: state.resonantProposal.slots,
    capacity: resonantCapacity,
    activeModes: state.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });
  const sourceCoupledPhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendSourceCoupled.phaseSlots,
    visibleSlots: state.blendSourceCoupled.slots,
    capacity: renderSourceCoupledCapacity,
    activeModes: state.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });
  const resonantPhaseModeCount = writePhaseSlotsForVisibleModes({
    target: state.blendResonant.phaseSlots,
    visibleSlots: state.blendResonant.slots,
    capacity: renderResonantCapacity,
    activeModes: state.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });

  return { sourceCoupledPhaseModeCount, resonantPhaseModeCount };
}

function updateModalExcitationProjection(context) {
  const {
    state,
    excitedEntries,
    sourceCoupledCapacity,
    resonantCapacity,
    renderSourceCoupledCapacity,
    renderResonantCapacity,
    modalObserverMetrics,
  } = context;
  const projectionShortlists = buildProjectionShortlists({
    entries: excitedEntries,
    sourceCoupledCapacity,
    resonantCapacity,
  });
  const projectionSourceCoupledEntries = projectionShortlists.sourceCoupled;
  const projectionResonantEntries = projectionShortlists.resonant;
  // Hard silence ends forcing at the oscillator owner. It must not erase a
  // still-positive damped response here; the source/render boundary remains
  // the sole authority for absent or muted output.
  const signalSourceCoupledEntries = projectionSourceCoupledEntries;
  const signalResonantEntries = projectionResonantEntries;

  writeShortlistedEntries(
    state.sourceCoupledProposal,
    signalSourceCoupledEntries,
    sourceCoupledCapacity,
    (entry) => entry.displayProjectionAmplitude,
  );
  writeShortlistedEntries(
    state.resonantProposal,
    signalResonantEntries,
    resonantCapacity,
    (entry) => entry.displayProjectionAmplitude,
  );
  const projection = buildModalProjection({
    sourceCoupledEntries: signalSourceCoupledEntries,
    resonantEntries: signalResonantEntries,
    modalObserverMetrics,
  });
  const {
    projectedSourceCoupledEntries,
    projectedResonantEntries,
    projectionDiagnostics,
  } = projection;

  updateModalProjectionBlends(context);

  const { sourceCoupledPhaseModeCount, resonantPhaseModeCount } =
    writeModalProjectionFieldState(context);

  let blendedSourceCoupledCount = countActiveSlots(
    state.blendSourceCoupled.slots,
    renderSourceCoupledCapacity,
  );
  let blendedResonantCount = countActiveSlots(
    state.blendResonant.slots,
    renderResonantCapacity,
  );
  return {
    projectedSourceCoupledEntries,
    projectedResonantEntries,
    projectionDiagnostics,
    sourceCoupledPhaseModeCount,
    resonantPhaseModeCount,
    blendedSourceCoupledCount,
    blendedResonantCount,
  };
}

function reconcileModalProjectionEnergy({
  state,
  modalResponse,
  resolvedSourceEvidence,
  projectionState,
  driveEnergyTotal,
  driveEnergySampleCount,
  currentSignalAuthorityEnergyTotal,
  renderSourceCoupledCapacity,
  renderResonantCapacity,
}) {
  let { blendedSourceCoupledCount, blendedResonantCount } = projectionState;
  const modalDriveEnergy = driveEnergySampleCount
    ? clamp01(driveEnergyTotal / driveEnergySampleCount)
    : 0;
  const currentSignalEnergy = clamp01(currentSignalAuthorityEnergyTotal);
  const currentSignalAmplitude = Math.sqrt(currentSignalEnergy);
  const modalResponseCurrentSignalEnergy = clamp01(
    (modalResponse.modalResponseSourceCoupledCurrentSignalEnergy ?? 0) +
      (modalResponse.modalResponseResonantCurrentSignalEnergy ?? 0),
  );
  const renderBoundaryState =
    resolvedSourceEvidence.renderBoundaryState ??
    resolvedSourceEvidence.sourceBoundaryState;
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy: resolvedSourceEvidence.sourceEnergy,
    renderBoundaryState,
    modalResponse,
    candidateForcingSlots: state.blendSourceCoupled.slots,
    candidateResponseSlots: state.blendResonant.slots,
    capacity: renderSourceCoupledCapacity + renderResonantCapacity,
    currentSignalEnergy,
    currentSignalAmplitude,
  });
  const renderSuppressedByEnergy = energyLedger.renderAuthority !== true;
  const projectedEnergyScale = energyLedger.projectedEnergyScale;
  if (projectedEnergyScale < 1) {
    scaleSlotAmplitudes(state.blendSourceCoupled.slots, projectedEnergyScale);
    scaleSlotAmplitudes(state.blendResonant.slots, projectedEnergyScale);
    blendedSourceCoupledCount = countActiveSlots(
      state.blendSourceCoupled.slots,
      renderSourceCoupledCapacity,
    );
    blendedResonantCount = countActiveSlots(
      state.blendResonant.slots,
      renderResonantCapacity,
    );
  }
  const usedDecay =
    !renderSuppressedByEnergy &&
    energyLedger.projectedRenderEnergy > energyLedger.renderEnergyEpsilon &&
    currentSignalEnergy <= energyLedger.renderEnergyEpsilon;
  const renderEnergyMetrics = {
    modalResponseRenderPreviewLedger: energyLedger,
    modalResponseRenderPreviewEnergy: energyLedger.projectedRenderEnergy,
    modalResponseRenderEnergy: energyLedger.projectedRenderEnergy,
    modalResponseRenderPreviewSourceCoupledEnergy:
      energyLedger.projectedSourceCoupledEnergy,
    modalResponseRenderPreviewResonantEnergy:
      energyLedger.projectedResonantEnergy,
    modalResponseRenderSourceCoupledEnergy:
      energyLedger.projectedSourceCoupledEnergy,
    modalResponseRenderResonantEnergy: energyLedger.projectedResonantEnergy,
    modalResponseRenderPreviewRawEnergy: energyLedger.projectedRenderEnergy,
    modalResponseRenderRawEnergy: energyLedger.projectedRenderEnergy,
  };

  return {
    blendedSourceCoupledCount,
    blendedResonantCount,
    modalDriveEnergy,
    currentSignalAmplitude,
    currentSignalEnergy,
    modalResponseCurrentSignalEnergy,
    renderEnergyMetrics,
    renderSuppressedByEnergy,
    usedDecay,
  };
}

function createLayerStateSummary(
  entries,
  periodicity,
  tonalness,
  layer,
) {
  const dominant = entries[0] ?? null;
  const harmonicSupport = buildHarmonicSupport(
    entries,
    layer === "source-coupled" ? (dominant?.naturalFrequencyHz ?? 0) : 0,
  );
  return {
    uniqueModeCount: entries.length,
    harmonicSupport,
    fundamental: dominant?.naturalFrequencyHz ?? 0,
    fundamentalConfidence: dominant?.coherence ?? 0,
    analysisEngine: "modal-excitation",
    driverFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateFrequency: dominant?.naturalFrequencyHz ?? 0,
    candidateConfidence: dominant?.coherence ?? 0,
    candidateFrames: Math.round((dominant?.ageMs ?? 0) / 33),
    candidatePeriodicity: periodicity,
    candidateHarmonicSupport: average(Array.from(harmonicSupport)),
    candidateDirectSupport: dominant?.driveEnergy ?? 0,
    candidateLowEnergy: (dominant?.amplitude ?? 0) < 0.08,
    voicingActive: periodicity > 0.25 && tonalness > 0.2,
    highCandidateRejected: false,
    rejectionReason: "none",
    latchHoldFrames: 0,
    latchLowSupportFrames: 0,
  };
}

function resolveModalResponseState(atlasEntry, context) {
  const { state, observationByMode, modalResponseByMode } = context;
  const observedMeasurement = observationByMode?.get(atlasEntry.modeKey);
  const modalResponseEntry = modalResponseByMode.get(atlasEntry.modeKey);
  const previousPhysicalMode = state.activeModes.get(atlasEntry.modeKey);
  const hasPhysicalModalResponseIdentity =
    modalResponseEntry != null ||
    previousPhysicalMode?.hasPhysicalModalResponseIdentity === true ||
    (previousPhysicalMode?.modalResponseEnergy ?? 0) > 0;
  if (!hasPhysicalModalResponseIdentity) {
    return null;
  }

  return {
    observedMeasurement,
    modalResponseEntry,
    hasPhysicalModalResponseIdentity,
    modalResponseEnergy: clamp01(modalResponseEntry?.modalResponseEnergy ?? 0),
    modalResponseDrive: clamp01(modalResponseEntry?.modalResponseDrive ?? 0),
    modalResponseDisplayAmplitude: clamp01(
      modalResponseEntry?.displayAmplitude ?? 0,
    ),
  };
}

function measureModalPhaseEvidence(atlasEntry, context, responseState) {
  return (
    responseState.observedMeasurement?.modalDriveResponse ??
    measureModalDriveResponse(
      context.driveAnalysis.driveBuffer,
      context.preparedInputs.sampleRate,
      atlasEntry.naturalFrequencyHz,
    )
  );
}

function resolveModalExcitationDrive(atlasEntry, context) {
  const responseState = resolveModalResponseState(atlasEntry, context);
  if (!responseState) {
    return null;
  }

  const modalDriveResponse = measureModalPhaseEvidence(
    atlasEntry,
    context,
    responseState,
  );
  // `modalResponseDrive` is the source forcing already resolved for this
  // physical mode. Projection may rank or omit a mode, but it must not invent
  // a second drive model after the oscillator owner has published it.
  const driveEnergy = responseState.modalResponseDrive;
  const { drivePeak, periodicity, tonalness, distributedExcitation } =
    context.driveAnalysis;
  const {
    modalResponseEntry,
    modalResponseEnergy,
    modalResponseDrive,
    modalResponseDisplayAmplitude,
    hasPhysicalModalResponseIdentity,
  } = responseState;
  const coherenceTarget = clamp01(
    tonalness * 0.45 +
      periodicity * 0.4 -
      distributedExcitation * 0.24 +
      modalResponseDrive * 0.12 +
      MODAL_COHERENCE_REFERENCE_PRIOR,
  );

  return {
    hasPhysicalModalResponseIdentity,
    modalResponseEntry,
    modalResponseEnergy,
    modalResponseDrive,
    modalResponseDisplayAmplitude,
    modalDriveResponse,
    drivePeak,
    driveEnergy,
    coherenceTarget,
  };
}

function tryEvolveModalExcitationModeState(atlasEntry, context, modeState) {
  const { state, driveAnalysis } = context;
  const {
    driveEnergy,
    coherenceTarget,
    modalResponseEntry,
    modalResponseDisplayAmplitude,
  } = modeState;
  const amplitude = clamp01(modalResponseDisplayAmplitude);
  if (amplitude <= 0) {
    return false;
  }
  const coherence = clamp01(
    Math.max(
      modalResponseEntry?.oscillatorPhaseCoherence ?? 0,
      modalResponseEntry?.oscillatorPhaseAuthority ?? 0,
      coherenceTarget,
    ),
  );
  // Persistence here describes coherence in the current source observation,
  // not how much oscillator state survives one integration step. Using the
  // Q-derived memory coefficient made observer authority disappear whenever
  // the declared apparatus loading shortened the physical response.
  const persistence = clamp01(
    Math.max(
      driveAnalysis?.periodicity ?? 0,
      (driveAnalysis?.tonalness ?? 0) * 0.85,
    ),
  );

  modeState.previous = state.activeModes.get(atlasEntry.modeKey) ?? null;
  modeState.amplitude = amplitude;
  modeState.smoothedDriveEnergy = driveEnergy;
  modeState.coherence = coherence;
  modeState.persistence = persistence;
  return true;
}

function resolveModalOscillatorProjection(context, modeState) {
  const { preparedInputs } = context;
  const {
    modalResponseEntry,
    modalResponseEnergy,
    modalResponseDrive,
    modalDriveResponse,
    coherence,
  } = modeState;
  const modalOscillatorAngularVelocityRadPerSec =
    modalResponseEntry?.oscillatorAngularVelocityRadPerSec;
  const modalOscillatorPhaseRad = Number.isFinite(
    modalResponseEntry?.oscillatorPhaseRad,
  )
    ? modalResponseEntry.oscillatorPhaseRad
    : modalDriveResponse.phase;
  const frameAtSec = preparedInputs.currentFrameAtMs / 1000;
  const modalOscillatorPhaseOffsetRad = Number.isFinite(
    modalOscillatorAngularVelocityRadPerSec,
  )
    ? normalizePhaseRad(
        modalOscillatorPhaseRad -
          modalOscillatorAngularVelocityRadPerSec * frameAtSec,
      )
    : undefined;
  const modalOscillatorPhaseAuthority = clamp01(
    modalResponseEntry?.oscillatorPhaseAuthority ?? modalResponseEnergy,
  );
  const modalOscillatorPhaseCoherence = clamp01(
    modalResponseEntry?.oscillatorPhaseCoherence ??
      Math.max(coherence, modalResponseDrive),
  );

  return {
    oscillatorPhaseRad: modalResponseEntry?.oscillatorPhaseRad,
    oscillatorAngularVelocityRadPerSec: modalOscillatorAngularVelocityRadPerSec,
    signedModalCoefficient: modalResponseEntry?.signedModalCoefficient,
    modalOscillatorRotationRad: modalResponseEntry?.modalOscillatorRotationRad,
    modalOscillatorEnvelopeRe: modalResponseEntry?.modalOscillatorEnvelopeRe,
    modalOscillatorEnvelopeIm: modalResponseEntry?.modalOscillatorEnvelopeIm,
    modalOscillatorDriveLockRe: modalResponseEntry?.modalOscillatorDriveLockRe,
    modalOscillatorDriveLockIm: modalResponseEntry?.modalOscillatorDriveLockIm,
    modalOscillatorDriveLockPlv:
      modalResponseEntry?.modalOscillatorDriveLockPlv,
    modalOscillatorDrivePhaseLocked:
      modalResponseEntry?.modalOscillatorDrivePhaseLocked,
    modalOscillatorHarmonicOrder:
      modalResponseEntry?.modalOscillatorHarmonicOrder,
    modalOscillatorPhaseRad,
    modalOscillatorPhaseOffsetRad,
    modalOscillatorAngularVelocityRadPerSec,
    modalOscillatorPhaseObservedAtSec: frameAtSec,
    modalOscillatorPhaseAuthority,
    modalOscillatorPhaseCoherence,
  };
}

function resolveModalModeLifecycle(context, modeState) {
  const { preparedInputs, strictHardSilentFrame, deltaMs } = context;
  const { previous, drivePeak, driveEnergy } = modeState;

  return {
    hardSilentFrame: strictHardSilentFrame,
    sourceAmplitude: updateObservedSourceAmplitude(previous, drivePeak),
    lastExcitedAtMs:
      driveEnergy > 0
        ? preparedInputs.currentFrameAtMs
        : (previous?.lastExcitedAtMs ?? preparedInputs.currentFrameAtMs),
    ageMs: (previous?.ageMs ?? 0) + deltaMs,
  };
}

function buildModalExcitationModeEntry(atlasEntry, context, modeState) {
  const { modalResponse } = context;
  const {
    hasPhysicalModalResponseIdentity,
    modalResponseEntry,
    modalResponseEnergy,
    modalResponseDrive,
    modalResponseDisplayAmplitude,
    driveEnergy,
    amplitude,
    smoothedDriveEnergy,
    coherence,
    persistence,
  } = modeState;
  const oscillatorProjection = resolveModalOscillatorProjection(
    context,
    modeState,
  );
  const lifecycle = resolveModalModeLifecycle(context, modeState);

  return {
    ...atlasEntry,
    amplitude,
    currentDriveEnergy: driveEnergy,
    driveEnergy: smoothedDriveEnergy,
    phase: oscillatorProjection.modalOscillatorPhaseRad,
    modalResponseDrive,
    modalResponseEnergy,
    modalResponseDisplayAmplitude,
    hasPhysicalModalResponseIdentity,
    modalResponseBudgetScale:
      modalResponseEntry?.modalResponseBudgetScale ??
      modalResponse.modalResponseBudgetScale ??
      1,
    modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
    modalResponseInputEnergyScale: modalResponse.modalResponseInputEnergyScale,
    ...oscillatorProjection,
    ...lifecycle,
    coherence,
    persistence,
  };
}

function evaluateModalExcitationMode(atlasEntry, context) {
  const modeState = resolveModalExcitationDrive(atlasEntry, context);
  if (!modeState) {
    return null;
  }
  if (!tryEvolveModalExcitationModeState(atlasEntry, context, modeState)) {
    return null;
  }
  return buildModalExcitationModeEntry(atlasEntry, context, modeState);
}

function advanceModalExcitationModes(context) {
  const activeModes = new Map();
  const excitedEntries = [];
  let sourceCoupledModalEnergy = 0;
  let resonantModalEnergy = 0;
  let driveEnergyTotal = 0;
  let driveEnergySampleCount = 0;
  let persistenceTotal = 0;
  let coherenceTotal = 0;
  let currentSignalAuthorityEnergyTotal = 0;

  for (const atlasEntry of context.atlas) {
    const entry = evaluateModalExcitationMode(atlasEntry, context);
    if (!entry) {
      continue;
    }

    activeModes.set(entry.modeKey, entry);
    excitedEntries.push(entry);
    if (
      hasFreshSignalAuthority({
        modalResponseDisplayAmplitude: entry.modalResponseDisplayAmplitude,
        modalResponseEnergy: entry.modalResponseEnergy,
        modalResponseDrive: entry.modalResponseDrive,
        freshCouplingEvidence: context.freshCouplingEvidence,
      })
    ) {
      currentSignalAuthorityEnergyTotal += Math.min(
        clamp01(entry.modalResponseEnergy ?? 0),
        clamp01(entry.modalResponseDrive ?? 0),
      );
    }
    driveEnergyTotal += entry.driveEnergy;
    driveEnergySampleCount += 1;
    persistenceTotal += entry.persistence;
    coherenceTotal += entry.coherence;
    if (entry.layer === "source-coupled") {
      sourceCoupledModalEnergy += Math.max(
        entry.amplitude,
        entry.modalResponseEnergy,
      );
    } else {
      resonantModalEnergy += Math.max(
        entry.amplitude,
        entry.modalResponseEnergy,
      );
    }
  }

  excitedEntries.sort(
    (left, right) =>
      right.amplitude * Math.max(0.15, right.coherence) -
      left.amplitude * Math.max(0.15, left.coherence),
  );

  return {
    activeModes,
    excitedEntries,
    sourceCoupledModalEnergy,
    resonantModalEnergy,
    driveEnergyTotal,
    driveEnergySampleCount,
    persistenceTotal,
    coherenceTotal,
    currentSignalAuthorityEnergyTotal,
  };
}

function buildModalExcitationDiagnostics({
  preparedInputs,
  fastSignalState,
  driveAnalysis,
  modalEvolution,
  modalObserverMetrics,
  modalResponse,
  projectionState,
  projectionEnergyState,
  resolvedSourceEvidence,
  resonantTopologySignal,
  freshCouplingEvidence,
  lineFeedProgramActive,
}) {
  const { distributedExcitation, driveSource } = driveAnalysis;
  const {
    excitedEntries,
    sourceCoupledModalEnergy,
    resonantModalEnergy,
    persistenceTotal,
    coherenceTotal,
  } = modalEvolution;
  const {
    projectionDiagnostics,
    sourceCoupledPhaseModeCount,
    resonantPhaseModeCount,
  } = projectionState;
  const {
    modalDriveEnergy,
    currentSignalAmplitude,
    currentSignalEnergy,
    modalResponseCurrentSignalEnergy,
    renderEnergyMetrics,
    renderSuppressedByEnergy,
  } = projectionEnergyState;

  const modalPersistence = excitedEntries.length
    ? clamp01(persistenceTotal / excitedEntries.length)
    : 0;
  const modeCoherence = excitedEntries.length
    ? clamp01(coherenceTotal / excitedEntries.length)
    : 0;
  const modalObservationCoherence = deriveModalObservationCoherence({
    preparedInputs,
    modalObserverMetrics,
    modeCoherence,
  });
  const modalObservationPresence = Math.max(
    modalResponse.modalResponseEnergy ?? 0,
    modalObserverMetrics.resonantObservationConfidence ?? 0,
    modalObserverMetrics.sourceCoupledObservationConfidence ?? 0,
    (modalObserverMetrics.resonantRingSupport ?? 0) * 0.5,
    currentSignalEnergy,
    modalDriveEnergy * 0.6,
  );
  const modalObservationConfidence = deriveModalObservationConfidence({
    modalObservationCoherence,
    modalResponseEnergy: modalResponse.modalResponseEnergy,
    modalPresence: modalObservationPresence,
    transientEnergy: fastSignalState.transientEnergy,
  });

  return {
    excitedModeCount: excitedEntries.length,
    distributedExcitation,
    sourceCoupledModalEnergy,
    resonantModalEnergy,
    observedModalModeCount: modalObserverMetrics.observedModalModeCount,
    sourceCoupledObservedModeCount:
      modalObserverMetrics.sourceCoupledObservedModeCount,
    sourceCoupledObservationConfidence:
      modalObserverMetrics.sourceCoupledObservationConfidence,
    sourceCoupledObservedDrive: modalObserverMetrics.sourceCoupledObservedDrive,
    sourceCoupledObservedSnr: modalObserverMetrics.sourceCoupledObservedSnr,
    sourceCoupledObservedCoherence:
      modalObserverMetrics.sourceCoupledObservedCoherence,
    resonantObservedModeCount: modalObserverMetrics.resonantObservedModeCount,
    resonantObservationConfidence:
      modalObserverMetrics.resonantObservationConfidence,
    resonantRingSupport: modalObserverMetrics.resonantRingSupport,
    resonantObservedDrive: modalObserverMetrics.resonantObservedDrive,
    resonantObservedSnr: modalObserverMetrics.resonantObservedSnr,
    resonantObservedCoherence: modalObserverMetrics.resonantObservedCoherence,
    resonantObservedNoiseFloor: modalObserverMetrics.resonantObservedNoiseFloor,
    resonantSparseEvidence: modalObserverMetrics.resonantSparseEvidence,
    resonantProjectionLoad: modalObserverMetrics.resonantProjectionLoad,
    sourceCoupledPhaseAuthority:
      modalObserverMetrics.sourceCoupledPhaseAuthority,
    resonantPhaseAuthority: modalObserverMetrics.resonantPhaseAuthority,
    modalPhaseAuthority: modalObserverMetrics.modalPhaseAuthority,
    modalPhaseCoherentFieldModeCount: renderSuppressedByEnergy
      ? 0
      : sourceCoupledPhaseModeCount + resonantPhaseModeCount,
    resonantTopologySignal,
    modalPersistence,
    modalDriveEnergy,
    currentSignalEnergy,
    currentSignalAmplitude,
    modeCoherence,
    modalObservationCoherence,
    modalObservationConfidence,
    driveSource,
    waterAcousticNonlinearityActive:
      preparedInputs.waterAcousticDrive?.active === true,
    waterAcousticGeneratedEnergyFraction:
      preparedInputs.waterAcousticDrive?.generatedEnergyFraction ?? 0,
    waterAcousticIncidentPeakPressurePascal:
      preparedInputs.waterAcousticDrive?.incidentPeakPressurePascalAtFullScale ??
      0,
    waterAcousticFullScaleCharacteristicDistortion:
      preparedInputs.waterAcousticDrive?.fullScaleCharacteristicDistortion ?? 0,
    modalResponseEnergy: modalResponse.modalResponseEnergy,
    modalResponseCurrentSignalEnergy,
    modalResponseSourceCoupledCurrentSignalEnergy:
      modalResponse.modalResponseSourceCoupledCurrentSignalEnergy ?? 0,
    modalResponseResonantCurrentSignalEnergy:
      modalResponse.modalResponseResonantCurrentSignalEnergy ?? 0,
    modalResponseInputEnergy: modalResponse.modalResponseInputEnergy,
    modalResponseInputEnergyScale: modalResponse.modalResponseInputEnergyScale,
    lineFeedProgramActive,
    lineFeedProgramExcitation: preparedInputs?.lineFeedProgramExcitation ?? 0,
    modalResponseCurrentRenderSourceEvidence:
      resolvedSourceEvidence.currentSourceEvidence === true,
    modalResponseFreshCouplingEvidence: freshCouplingEvidence,
    sourceEvidence: resolvedSourceEvidence,
    ...renderEnergyMetrics,
    modalResponseSourceCoupledEnergy:
      modalResponse.modalResponseSourceCoupledEnergy,
    modalResponseResonantEnergy: modalResponse.modalResponseResonantEnergy,
    modalResponseModeCount: modalResponse.modalResponseModeCount,
    modalResponseBudgetScale: modalResponse.modalResponseBudgetScale,
    modalResponseRawEnergy: modalResponse.modalResponseRawEnergy,
    modalResponseAverageDampingEnvelope:
      modalResponse.modalResponseAverageDampingEnvelope,
    modalResponseAverageCouplingStrength:
      modalResponse.modalResponseAverageCouplingStrength,
    modalResponseAveragePhaseConfidence:
      modalResponse.modalResponseAveragePhaseConfidence,
    modalResponseAveragePersistence:
      modalResponse.modalResponseAveragePersistence,
    modalResponseBudgetScaleSourceCoupled:
      modalResponse.modalResponseBudgetScaleSourceCoupled,
    modalResponseBudgetScaleResonant:
      modalResponse.modalResponseBudgetScaleResonant,
    ...projectionDiagnostics,
  };
}

function selectModalRenderLayerSources({
  renderSuppressedByEnergy,
  zeroSlots,
  blendState,
  referenceSlots,
  modeCount,
}) {
  if (renderSuppressedByEnergy) {
    return {
      slots: zeroSlots,
      phaseSlots: zeroSlots,
      referenceSlots: zeroSlots,
      spectralMomentSlots: zeroSlots,
      modeCount: 0,
    };
  }

  return {
    slots: blendState.slots,
    phaseSlots: blendState.phaseSlots,
    referenceSlots,
    spectralMomentSlots: blendState.spectralMomentSlots,
    modeCount,
  };
}

function buildModalExcitationStructuralResult({
  state,
  preparedInputs,
  diagnostics,
  sourceCoupledStateSource,
  resonantStateSource,
  renderSuppressedByEnergy,
  blendedSourceCoupledCount,
  blendedResonantCount,
  dominantEntry,
  spectralSeedDirection,
  usedDecay,
  performanceNow,
  startedAt,
}) {
  const sourceCoupledRenderSources = selectModalRenderLayerSources({
    renderSuppressedByEnergy,
    zeroSlots: preparedInputs.zeroSourceCoupledTargetSlots,
    blendState: state.blendSourceCoupled,
    referenceSlots: state.remappedSourceCoupledRef,
    modeCount: blendedSourceCoupledCount,
  });
  const resonantRenderSources = selectModalRenderLayerSources({
    renderSuppressedByEnergy,
    zeroSlots: preparedInputs.zeroResonantTargetSlots,
    blendState: state.blendResonant,
    referenceSlots: state.remappedResonantRef,
    modeCount: blendedResonantCount,
  });

  return {
    sourceMode: preparedInputs.sourceMode,
    modalCandidateState: state.modalCandidateState,
    candidateForcingSlotsSource: sourceCoupledRenderSources.slots,
    candidateResponseSlotsSource: resonantRenderSources.slots,
    sourceCoupledPhaseSlotsSource: sourceCoupledRenderSources.phaseSlots,
    resonantPhaseSlotsSource: resonantRenderSources.phaseSlots,
    referenceSourceCoupledSlotsSource:
      sourceCoupledRenderSources.referenceSlots,
    referenceResonantSlotsSource: resonantRenderSources.referenceSlots,
    proposalSourceCoupledSlotsSource: state.sourceCoupledProposal.slots,
    proposalResonantSlotsSource: state.resonantProposal.slots,
    proposalSourceCoupledPhaseSlotsSource:
      state.sourceCoupledProposal.phaseSlots,
    proposalResonantPhaseSlotsSource: state.resonantProposal.phaseSlots,
    proposalReferenceSourceCoupledSlotsSource:
      state.remappedSignalSourceCoupledRef,
    proposalReferenceResonantSlotsSource: state.remappedSignalResonantRef,
    proposalSourceCoupledSpectralMomentSource:
      state.sourceCoupledProposal.spectralMomentSlots,
    proposalResonantSpectralMomentSource:
      state.resonantProposal.spectralMomentSlots,
    sourceCoupledSpectralMomentSource:
      sourceCoupledRenderSources.spectralMomentSlots,
    resonantSpectralMomentSource: resonantRenderSources.spectralMomentSlots,
    modalFieldSpectralSeedDirection: spectralSeedDirection,
    sourceCoupledStateSource,
    resonantStateSource,
    freezeModeSlots: Boolean(
      preparedInputs.resolvedAuditSettings.freezeModeSlots,
    ),
    activeSourceCoupledModeCount: sourceCoupledRenderSources.modeCount,
    activeResonantModeCount: resonantRenderSources.modeCount,
    activeModeCount:
      sourceCoupledRenderSources.modeCount + resonantRenderSources.modeCount,
    dominantFrequency: renderSuppressedByEnergy
      ? 0
      : (dominantEntry?.naturalFrequencyHz ?? 0),
    dominantAmplitude: renderSuppressedByEnergy
      ? 0
      : (dominantEntry?.amplitude ?? 0),
    analysisEngine: "modal-excitation",
    pitchSource: "resonator-bank",
    spectralCandidates: [],
    usedDecay,
    structuralPerf: {
      peakScanMs: 0,
      modalResolveMs: Math.max(0, performanceNow() - startedAt),
      projectionMs: 0,
    },
    structuralMetrics: diagnostics,
  };
}

function copyModalProposalSlots(target, proposalSlots) {
  target.fill(0);
  target.set(proposalSlots.subarray(0, target.length));
}

export { createModalExcitationState };

export function buildModalExcitationStructuralState({
  preparedInputs,
  fastSignalState,
  existingState,
  performanceNow = () => 0,
}) {
  const state =
    existingState && existingState.capacity === preparedInputs.capacity
      ? existingState
      : createModalExcitationState(preparedInputs.capacity);
  const atlas = buildModalExcitationAtlas({
    radius: preparedInputs.radius,
    cavityGeometry: preparedInputs.effectiveCavityGeometry,
    cavityAcousticScale: preparedInputs.cavityAcousticScale,
    boundaryMode: preparedInputs.boundaryMode,
  });
  const apparatus = resolveModalExcitationApparatus({
    radius: preparedInputs.radius,
    cavityAcousticScale: preparedInputs.cavityAcousticScale,
    boundaryMode: preparedInputs.boundaryMode,
  });
  const observationBand = deriveCavityModalFieldCacheBandwidth({
    sideLengthMeters: apparatus.sideLengthMeters,
    soundSpeedMetersPerSecond: apparatus.soundSpeedMetersPerSecond,
    boundaryMode: apparatus.boundaryMode,
  });
  clearLayerBuffers(state.sourceCoupledProposal);
  clearLayerBuffers(state.resonantProposal);

  const startedAt = performanceNow();
  const driveAnalysis = analyzeModalDrive({
    timeData:
      preparedInputs.waterAcousticDrive?.timeDomainData ??
      preparedInputs.snapshot?.timeData,
    fftLinearAmplitudes:
      preparedInputs.waterAcousticDrive?.fftLinearAmplitudes ??
      fastSignalState.fftLinearAmplitudes,
    sampleRate: preparedInputs.sampleRate,
    trebleBroadbandEnergy: fastSignalState.trebleBroadbandEnergy,
    resonantMinHz: MODAL_EXCITATION_RESONANT_MIN_HZ,
    resonantMaxHz: observationBand.tailMaxFrequencyHz,
    scratch: state.driveAnalysisScratch,
  });
  const { periodicity, tonalness } = driveAnalysis;
  const strictHardSilentFrame =
    isModalExcitationHardSilentFrame(preparedInputs);
  const allowBassHarmonicDriver =
    !preparedInputs.bandState?.liveInputCalibrationActive;
  const deltaMs = Math.max(
    16,
    preparedInputs.currentFrameAtMs -
      (state.lastFrameAtMs ?? preparedInputs.currentFrameAtMs - 16),
  );
  state.lastFrameAtMs = preparedInputs.currentFrameAtMs;
  const sourceCoupledCapacity = state.sourceCoupledProposal.slots.length / 4;
  const resonantCapacity = state.resonantProposal.slots.length / 4;
  const renderSourceCoupledCapacity = Math.min(
    sourceCoupledCapacity,
    MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  );
  const renderResonantCapacity = Math.min(
    resonantCapacity,
    MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  );
  const resonantObserverProfile = getModalObserverProfile("resonant");
  const observationResponseFrame = advanceModalObservationResponseFrame({
    state,
    atlas,
    preparedInputs,
    fastSignalState,
    driveAnalysis,
    deltaMs,
    sourceCoupledCapacity,
    resonantCapacity,
    allowBassHarmonicDriver,
    strictHardSilentFrame,
  });
  const preEvolutionModalObserverMetrics =
    observationResponseFrame.modalObserverMetrics;
  const {
    observationByMode,
    modalResponse,
    modalResponseByMode,
    freshCouplingEvidence,
    resolvedSourceEvidence,
    lineFeedProgramActive,
  } = observationResponseFrame;
  const modalEvolution = advanceModalExcitationModes({
    atlas,
    state,
    preparedInputs,
    fastSignalState,
    driveAnalysis,
    modalObserverMetrics: preEvolutionModalObserverMetrics,
    observationByMode,
    modalResponse,
    modalResponseByMode,
    strictHardSilentFrame,
    deltaMs,
    freshCouplingEvidence,
  });
  const {
    excitedEntries,
    driveEnergyTotal,
    driveEnergySampleCount,
    currentSignalAuthorityEnergyTotal,
  } = modalEvolution;
  state.activeModes = modalEvolution.activeModes;
  const modalObserverMetrics = preEvolutionModalObserverMetrics;
  const resonantTopologySignal = deriveCurrentResonantTopologySignal({
    state,
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    modalObserverMetrics,
    resonantObserverProfile,
  });

  const projectionState = updateModalExcitationProjection({
    state,
    preparedInputs,
    excitedEntries,
    sourceCoupledCapacity,
    resonantCapacity,
    renderSourceCoupledCapacity,
    renderResonantCapacity,
    modalObserverMetrics,
  });
  const { projectedSourceCoupledEntries, projectedResonantEntries } =
    projectionState;
  const projectionEnergyState = reconcileModalProjectionEnergy({
    state,
    modalResponse,
    resolvedSourceEvidence,
    projectionState,
    driveEnergyTotal,
    driveEnergySampleCount,
    currentSignalAuthorityEnergyTotal,
    renderSourceCoupledCapacity,
    renderResonantCapacity,
  });
  const {
    blendedSourceCoupledCount,
    blendedResonantCount,
    renderSuppressedByEnergy,
    usedDecay,
  } = projectionEnergyState;

  copyModalProposalSlots(
    state.previousSignalSourceCoupledSlots,
    state.sourceCoupledProposal.slots,
  );
  copyModalProposalSlots(
    state.previousSignalResonantSlots,
    state.resonantProposal.slots,
  );

  const dominantEntry = excitedEntries[0] ?? null;
  const sourceCoupledStateSource = createLayerStateSummary(
    projectedSourceCoupledEntries,
    periodicity,
    tonalness,
    "source-coupled",
  );
  const resonantStateSource = createLayerStateSummary(
    projectedResonantEntries,
    periodicity,
    tonalness,
    "resonant",
  );
  const diagnostics = buildModalExcitationDiagnostics({
    preparedInputs,
    fastSignalState,
    driveAnalysis,
    modalEvolution,
    modalObserverMetrics,
    modalResponse,
    projectionState,
    projectionEnergyState,
    resolvedSourceEvidence,
    resonantTopologySignal,
    freshCouplingEvidence,
    lineFeedProgramActive,
  });
  state.modalCandidateState = buildModalCandidateState(
    projectedSourceCoupledEntries,
    projectedResonantEntries,
  );

  return buildModalExcitationStructuralResult({
    state,
    preparedInputs,
    diagnostics,
    sourceCoupledStateSource,
    resonantStateSource,
    renderSuppressedByEnergy,
    blendedSourceCoupledCount,
    blendedResonantCount,
    dominantEntry,
    spectralSeedDirection: deriveSpectralSeedDirection(excitedEntries),
    usedDecay,
    performanceNow,
    startedAt,
  });
}
