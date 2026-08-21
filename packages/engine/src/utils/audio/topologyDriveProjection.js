import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import {
  computePhaseAnchorAngularVelocityRadPerSec,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";

/**
 * Own the worker-side projection from committed modal identities into the
 * visible source/resonant slot, phase, reference, and energy views.
 */
export function createTopologyDriveProjection(
  topologyPacket,
  committedModes,
  previousProjection = null,
) {
  const committedModeCount = committedModes.length;
  const visibleModeCount = Math.min(
    committedModeCount,
    Math.max(0, Math.floor(topologyPacket.activeModeCount ?? 0)),
  );
  const sourceCommittedIndices = Uint16Array.from(
    committedModes
      .map((mode, index) =>
        index < visibleModeCount && mode.layer !== "resonant" ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  const resonantCommittedIndices = Uint16Array.from(
    committedModes
      .map((mode, index) =>
        index < visibleModeCount && mode.layer === "resonant" ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  const sourceSlots = new Float32Array(sourceCommittedIndices.length * 4);
  const resonantSlots = new Float32Array(resonantCommittedIndices.length * 4);
  const sourcePhaseSlots = new Float32Array(sourceSlots.length);
  const resonantPhaseSlots = new Float32Array(resonantSlots.length);
  const committedDisplaySlots = new Float32Array(committedModeCount * 4);
  const committedSignalSlots = new Float32Array(committedModeCount * 4);
  const committedDisplayReferenceSlots = new Float32Array(
    committedModeCount * 4,
  );
  const committedSignalReferenceSlots = new Float32Array(
    committedModeCount * 4,
  );
  const committedPhaseSlots = new Float32Array(committedModeCount * 4);
  const committedAmplitudeScales = Float32Array.from(committedModes, (mode) =>
    Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(mode?.projectionAmplitudeScale)
          ? mode.projectionAmplitudeScale
          : 1,
      ),
    ),
  );
  const previousDisplayAmplitudeByModeKey = new Map();
  const previousSignalAmplitudeByModeKey = new Map();
  for (
    let index = 0;
    index < (previousProjection?.committedModeCount ?? 0);
    index += 1
  ) {
    const offset = index * 4;
    const modeKey = buildModalTopologyModeKey(
      previousProjection.committedDisplaySlots[offset],
      previousProjection.committedDisplaySlots[offset + 1],
      previousProjection.committedDisplaySlots[offset + 2],
    );
    previousDisplayAmplitudeByModeKey.set(
      modeKey,
      previousProjection.committedDisplaySlots[offset + 3],
    );
    previousSignalAmplitudeByModeKey.set(
      modeKey,
      previousProjection.committedSignalSlots[offset + 3],
    );
  }
  for (let index = 0; index < committedModeCount; index += 1) {
    const mode = committedModes[index];
    const offset = index * 4;
    for (let component = 0; component < 3; component += 1) {
      const identity =
        component === 0 ? mode.u : component === 1 ? mode.v : mode.w;
      committedDisplaySlots[offset + component] = identity;
      committedSignalSlots[offset + component] = identity;
      committedDisplayReferenceSlots[offset + component] = identity;
      committedSignalReferenceSlots[offset + component] = identity;
    }
    committedDisplayReferenceSlots[offset + 3] =
      previousDisplayAmplitudeByModeKey.get(mode.modeKey) ?? 0;
    committedSignalReferenceSlots[offset + 3] =
      previousSignalAmplitudeByModeKey.get(mode.modeKey) ?? 0;
  }
  const initializeLayerIdentities = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      const committedOffset = committedIndices[layerIndex] * 4;
      const layerOffset = layerIndex * 4;
      for (let component = 0; component < 3; component += 1) {
        target[layerOffset + component] =
          committedDisplaySlots[committedOffset + component];
      }
    }
  };
  initializeLayerIdentities(sourceSlots, sourceCommittedIndices);
  initializeLayerIdentities(resonantSlots, resonantCommittedIndices);
  return {
    sourceSlots,
    resonantSlots,
    sourcePhaseSlots,
    resonantPhaseSlots,
    sourceCommittedIndices,
    resonantCommittedIndices,
    committedDisplaySlots,
    committedSignalSlots,
    committedDisplayReferenceSlots,
    committedSignalReferenceSlots,
    committedPhaseSlots,
    committedAmplitudeScales,
    visibleDisplaySlots: committedDisplaySlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    visibleSignalSlots: committedSignalSlots.subarray(0, visibleModeCount * 4),
    visibleDisplayReferenceSlots: committedDisplayReferenceSlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    visibleSignalReferenceSlots: committedSignalReferenceSlots.subarray(
      0,
      visibleModeCount * 4,
    ),
    activeSourceCoupledModeCount: sourceCommittedIndices.length,
    activeResonantModeCount: resonantCommittedIndices.length,
    activeModeCount: visibleModeCount,
    visibleModeCount,
    committedModeCount,
  };
}

// Only oscillator-owned state may supply a field coefficient. Observer state
// is finite-window confidence and remains available separately to topology and
// phase diagnostics, but it is never a display-amplitude fallback.
function readPhysicalTopologyEntry(modalExcitationState, slots, offset) {
  const modeKey = buildModalTopologyModeKey(
    slots[offset],
    slots[offset + 1],
    slots[offset + 2],
  );
  return (
    modalExcitationState?.activeModes?.get?.(modeKey) ??
    modalExcitationState?.modalCandidateState?.get?.(modeKey) ??
    null
  );
}

export function refreshTopologyDriveProjection(state) {
  const projection = state.topologyDriveProjection;
  const modalExcitationState =
    state.featureState?.analysis?.modalExcitationState;
  if (!projection || !modalExcitationState) {
    return;
  }
  for (
    let offset = 0;
    offset < projection.committedDisplaySlots.length;
    offset += 4
  ) {
    const committedIndex = offset / 4;
    const amplitudeScale = Math.max(
      0,
      Math.min(1, projection.committedAmplitudeScales?.[committedIndex] ?? 1),
    );
    projection.committedDisplayReferenceSlots[offset + 3] =
      projection.committedDisplaySlots[offset + 3];
    projection.committedSignalReferenceSlots[offset + 3] =
      projection.committedSignalSlots[offset + 3];
    const entry = readPhysicalTopologyEntry(
      modalExcitationState,
      projection.committedDisplaySlots,
      offset,
    );
    projection.committedDisplaySlots[offset + 3] =
      amplitudeScale *
      Math.max(
        0,
        entry?.displayAmplitude ??
          entry?.amplitude ??
          Math.sqrt(Math.max(0, entry?.modalResponseEnergy ?? 0)),
      );
    projection.committedSignalSlots[offset + 3] =
      amplitudeScale *
      Math.sqrt(
        Math.max(
          0,
          Math.min(
            entry?.modalResponseEnergy ?? 0,
            entry?.modalResponseDrive ?? 0,
          ),
        ),
      );
  }
  const copyLayerCoefficients = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      target[layerIndex * 4 + 3] =
        projection.committedDisplaySlots[committedIndices[layerIndex] * 4 + 3];
    }
  };
  copyLayerCoefficients(
    projection.sourceSlots,
    projection.sourceCommittedIndices,
  );
  copyLayerCoefficients(
    projection.resonantSlots,
    projection.resonantCommittedIndices,
  );
  const phaseAnchorAngularVelocityRadPerSec =
    modalExcitationState.phaseAnchorState?.angularVelocityRadPerSec ??
    computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        {
          visibleSlots: projection.visibleDisplaySlots,
          capacity: projection.visibleModeCount,
        },
      ],
      activeModes: modalExcitationState.activeModes,
    });
  writePhaseSlotsForVisibleModes({
    target: projection.committedPhaseSlots,
    visibleSlots: projection.committedDisplaySlots,
    capacity: projection.committedModeCount,
    activeModes: modalExcitationState.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: modalExcitationState.phaseAnchorState?.phaseRad,
    phaseObservedAtSec: modalExcitationState.phaseAnchorState?.observedAtSec,
  });
  const copyLayerPhases = (target, committedIndices) => {
    for (
      let layerIndex = 0;
      layerIndex < committedIndices.length;
      layerIndex += 1
    ) {
      const committedOffset = committedIndices[layerIndex] * 4;
      const layerOffset = layerIndex * 4;
      for (let component = 0; component < 4; component += 1) {
        target[layerOffset + component] =
          projection.committedPhaseSlots[committedOffset + component];
      }
    }
  };
  copyLayerPhases(
    projection.sourcePhaseSlots,
    projection.sourceCommittedIndices,
  );
  copyLayerPhases(
    projection.resonantPhaseSlots,
    projection.resonantCommittedIndices,
  );
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function measureVisibleModalProjection(
  state,
  projection,
  modalExcitationState,
) {
  const totals = {
    sourceEnergy: 0,
    resonantEnergy: 0,
    sourceCurrentSignalEnergy: 0,
    resonantCurrentSignalEnergy: 0,
    rawEnergy: 0,
    modalDriveEnergy: 0,
    dampingEnvelope: 0,
    couplingStrength: 0,
    phaseConfidence: 0,
    persistence: 0,
    entryCount: 0,
  };
  for (let index = 0; index < projection.visibleModeCount; index += 1) {
    const offset = index * 4;
    const mode = state.committedModes[index];
    const entry = readPhysicalTopologyEntry(
      modalExcitationState,
      projection.committedDisplaySlots,
      offset,
    );
    const retainedEnergy = clampUnit(
      (projection.committedDisplaySlots[offset + 3] ?? 0) ** 2,
    );
    const currentSignalEnergy = clampUnit(
      (projection.committedSignalSlots[offset + 3] ?? 0) ** 2,
    );
    if (mode?.layer === "resonant") {
      totals.resonantEnergy += retainedEnergy;
      totals.resonantCurrentSignalEnergy += currentSignalEnergy;
    } else {
      totals.sourceEnergy += retainedEnergy;
      totals.sourceCurrentSignalEnergy += currentSignalEnergy;
    }
    totals.rawEnergy += clampUnit(
      entry?.modalResponseRawEnergy ?? entry?.modalResponseEnergy ?? 0,
    );
    totals.modalDriveEnergy += clampUnit(entry?.modalResponseDrive ?? 0);
    totals.dampingEnvelope += clampUnit(entry?.dampingEnvelope ?? 0);
    totals.couplingStrength += clampUnit(entry?.couplingStrength ?? 0);
    totals.phaseConfidence += clampUnit(entry?.phaseConfidence ?? 0);
    totals.persistence += clampUnit(entry?.persistence ?? 0);
    totals.entryCount += 1;
  }
  return totals;
}

function buildVisibleStructuralMetrics(state, baseMetrics) {
  const projection = state.topologyDriveProjection;
  const modalExcitationState =
    state.featureState?.analysis?.modalExcitationState;
  if (!projection || !baseMetrics) {
    return baseMetrics;
  }

  const totals = measureVisibleModalProjection(
    state,
    projection,
    modalExcitationState,
  );

  const sourceEnergy = clampUnit(totals.sourceEnergy);
  const resonantEnergy = clampUnit(totals.resonantEnergy);
  const modalResponseEnergy = clampUnit(sourceEnergy + resonantEnergy);
  const sourceCurrentSignalEnergy = clampUnit(totals.sourceCurrentSignalEnergy);
  const resonantCurrentSignalEnergy = clampUnit(
    totals.resonantCurrentSignalEnergy,
  );
  const currentSignalEnergy = clampUnit(
    sourceCurrentSignalEnergy + resonantCurrentSignalEnergy,
  );
  const average = (value) =>
    totals.entryCount > 0 ? value / totals.entryCount : 0;

  return {
    ...baseMetrics,
    modalDriveEnergy: clampUnit(average(totals.modalDriveEnergy)),
    currentSignalEnergy,
    currentSignalAmplitude: Math.sqrt(currentSignalEnergy),
    modalResponseCurrentSignalEnergy: currentSignalEnergy,
    modalResponseSourceCoupledCurrentSignalEnergy: sourceCurrentSignalEnergy,
    modalResponseResonantCurrentSignalEnergy: resonantCurrentSignalEnergy,
    modalResponseEnergy,
    modalResponseSourceCoupledEnergy: sourceEnergy,
    modalResponseResonantEnergy: resonantEnergy,
    modalResponseModeCount: totals.entryCount,
    modalResponseRawEnergy: clampUnit(totals.rawEnergy),
    modalResponseAverageDampingEnvelope: clampUnit(
      average(totals.dampingEnvelope),
    ),
    modalResponseAverageCouplingStrength: clampUnit(
      average(totals.couplingStrength),
    ),
    modalResponseAveragePhaseConfidence: clampUnit(
      average(totals.phaseConfidence),
    ),
    modalResponseAveragePersistence: clampUnit(average(totals.persistence)),
    modalResponseCurrentRenderSourceEvidence: currentSignalEnergy > 0,
    modalResponseFreshCouplingEvidence: currentSignalEnergy > 0,
    modalResponseRenderPreviewEnergy: modalResponseEnergy,
    modalResponseRenderEnergy: modalResponseEnergy,
    modalResponseRenderPreviewSourceCoupledEnergy: sourceEnergy,
    modalResponseRenderPreviewResonantEnergy: resonantEnergy,
    modalResponseRenderSourceCoupledEnergy: sourceEnergy,
    modalResponseRenderResonantEnergy: resonantEnergy,
    modalResponseRenderPreviewRawEnergy: clampUnit(totals.rawEnergy),
    modalResponseRenderRawEnergy: clampUnit(totals.rawEnergy),
  };
}

export function applyTopologyDriveProjection(state, analysisResult) {
  const projection = state.topologyDriveProjection;
  if (!projection) {
    return analysisResult;
  }
  analysisResult.candidateForcingSlots = projection.sourceSlots;
  analysisResult.candidateResponseSlots = projection.resonantSlots;
  analysisResult.sourceCoupledPhaseSlots = projection.sourcePhaseSlots;
  analysisResult.resonantPhaseSlots = projection.resonantPhaseSlots;
  // Hidden committed modes remain in the oscillator state and full-width
  // drive packet, but only the topology's visible prefix may own render
  // signals, energy-ledger authority, or field state.
  analysisResult.modeSlots = projection.visibleDisplaySlots;
  analysisResult.signalModeSlots = projection.visibleSignalSlots;
  analysisResult.referenceModeSlots = projection.visibleDisplayReferenceSlots;
  analysisResult.signalReferenceModeSlots =
    projection.visibleSignalReferenceSlots;
  analysisResult.activeSourceCoupledModeCount =
    projection.activeSourceCoupledModeCount;
  analysisResult.activeResonantModeCount = projection.activeResonantModeCount;
  analysisResult.activeModeCount = projection.activeModeCount;
  analysisResult.structuralMetrics = buildVisibleStructuralMetrics(
    state,
    analysisResult.structuralMetrics,
  );
  return analysisResult;
}
