import { getCavityModeFrequency } from "../cavityModes.js";
import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import { getModalResponseModeKey } from "../../core/modalShell.js";
import { updateModalResponseFrame } from "./modalResponse.js";
import {
  advancePhaseAnchorState,
  computePhaseAnchorAngularVelocityRadPerSec,
  normalizePhaseRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";
import { buildModalEnergyLedger } from "./modalEnergyLedger.js";
import { clamp01 } from "../math.js";
import {
  computeLoadedModalQualityFactor,
  requireModalQualityFactor,
  resolveModalDampingApparatus,
} from "./modalDamping.js";

function modeKeyFromSlots(slots, offset) {
  return buildModalTopologyModeKey(
    slots?.[offset],
    slots?.[offset + 1],
    slots?.[offset + 2],
  );
}

function readProjectedModeState(state, modeKey) {
  return (
    state?.activeModes?.get?.(modeKey) ??
    state?.modalCandidateState?.get?.(modeKey) ??
    null
  );
}

// Physical projected state owns current forcing. Observer state is only a
// last-resort source of immutable atlas metadata for a committed identity.
function readCommittedModeDescriptor(state, modeKey) {
  return (
    state?.activeModes?.get?.(modeKey) ??
    state?.modalCandidateState?.get?.(modeKey) ??
    state?.observedModes?.get?.(modeKey) ??
    null
  );
}

const FAST_MODAL_OSCILLATOR_FIELDS = Object.freeze([
  "displayAmplitude",
  "modalResponseEnergy",
  "modalResponseBudgetScale",
  "oscillatorPhaseRad",
  "oscillatorAngularVelocityRadPerSec",
  "signedModalCoefficient",
  "modalOscillatorRotationRad",
  "modalOscillatorEnvelopeRe",
  "modalOscillatorEnvelopeIm",
  "modalOscillatorDriveLockRe",
  "modalOscillatorDriveLockIm",
  "modalOscillatorDriveLockPlv",
  "modalOscillatorDrivePhaseLocked",
  "modalOscillatorHarmonicOrder",
  "modalOscillatorPhaseRad",
  "modalOscillatorPhaseOffsetRad",
  "modalOscillatorAngularVelocityRadPerSec",
  "modalOscillatorPhaseObservedAtSec",
  "modalOscillatorPhaseAuthority",
  "modalOscillatorPhaseCoherence",
]);

function copyFastModalOscillatorFields(entry) {
  const snapshot = {};
  for (const key of FAST_MODAL_OSCILLATOR_FIELDS) {
    if (entry?.[key] !== undefined) {
      snapshot[key] = entry[key];
    }
  }
  return snapshot;
}

export function captureFastModalOscillatorState(modalExcitationState) {
  const snapshot = new Map();
  for (const [
    modeKey,
    entry,
  ] of modalExcitationState?.modalOscillatorStates?.entries?.() ?? []) {
    if (entry?.fastModalOscillatorOwned === true) {
      snapshot.set(modeKey, copyFastModalOscillatorFields(entry));
    }
  }
  return snapshot;
}

export function restoreFastModalOscillatorState({
  modalExcitationState,
  committedModes,
  previousOscillatorState,
}) {
  if (!modalExcitationState) {
    return;
  }
  for (const mode of committedModes ?? []) {
    const responseModeKey = getModalResponseModeKey(mode);
    const currentResponseState =
      modalExcitationState.modalOscillatorStates.get(responseModeKey) ?? mode;
    const previous = previousOscillatorState?.get?.(responseModeKey) ?? null;
    const restoredResponseState = {
      ...currentResponseState,
      displayAmplitude: 0,
      modalResponseDrive: 0,
      modalResponseEnergy: 0,
      modalOscillatorEnvelopeRe: 0,
      modalOscillatorEnvelopeIm: 0,
      modalOscillatorDriveLockRe: 0,
      modalOscillatorDriveLockIm: 0,
      modalOscillatorPhaseAuthority: 0,
      modalOscillatorPhaseCoherence: 0,
      ...(previous ?? {}),
      fastModalOscillatorOwned: true,
    };
    modalExcitationState.modalOscillatorStates.set(
      responseModeKey,
      restoredResponseState,
    );

    const current =
      readProjectedModeState(modalExcitationState, mode.modeKey) ?? mode;
    const restored = {
      ...current,
      ...restoredResponseState,
      amplitude: restoredResponseState.displayAmplitude,
      forcingEnergy: 0,
      currentDriveEnergy: 0,
      driveEnergy: 0,
      modalResponseDisplayAmplitude: restoredResponseState.displayAmplitude,
    };
    modalExcitationState.activeModes.set(mode.modeKey, restored);
    modalExcitationState.modalCandidateState.set(mode.modeKey, restored);
  }
}

function readPhysicalTransfer(entry) {
  if (Number.isFinite(entry?.physicalTransfer)) {
    return clamp01(entry.physicalTransfer);
  }
  return clamp01(
    (entry?.couplingStrength ?? 1) * (entry?.dampingEnvelope ?? 1),
  );
}

function readPositiveFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function readFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function resolveBoundedSlotModeCount(slots, requestedCount) {
  const availableCount = Math.floor((slots?.length ?? 0) / 4);
  const count = Number.isFinite(requestedCount)
    ? Math.max(0, Math.floor(requestedCount))
    : availableCount;
  return Math.min(availableCount, count);
}

/**
 * Natural frequency of one committed mode.
 *
 * Carried metadata is preferred because it records what the analysis actually
 * measured, but the frequency is not an optional annotation: f = c|n| / 2L is
 * fixed by the mode indices and the cavity scale. When a packet arrives
 * without metadata — a fresh topology whose excitation state was cleared, for
 * instance — the frequency is recomputed from the geometry rather than left at
 * zero, which would otherwise present a real mode as an unmeasurable one.
 *
 * @param {{ u: number, v: number, w: number, cavity: any, carried: number[] }} args
 */
function resolveModeNaturalFrequencyHz({ u, v, w, cavity, carried }) {
  const measured = readPositiveFinite(...carried);
  if (measured > 0) {
    return measured;
  }
  return getCavityModeFrequency(u, v, w, cavity);
}

function resolveCommittedModeQualityFactor({
  modeKey,
  naturalFrequencyHz,
  cavity,
  carried,
}) {
  const explicitQualityFactor = readPositiveFinite(...carried);
  if (explicitQualityFactor > 0) {
    return requireModalQualityFactor(
      explicitQualityFactor,
      `Committed mode ${modeKey}`,
    );
  }
  return computeLoadedModalQualityFactor({
    naturalFrequencyHz,
    ...resolveModalDampingApparatus(cavity),
  });
}

function buildFastLayerMode({ slots, offset, layer, state, cavity }) {
  const modeKey = modeKeyFromSlots(slots, offset);
  const previous = readCommittedModeDescriptor(state, modeKey) ?? {};
  const u = readFinite(slots[offset], previous.u);
  const v = readFinite(slots[offset + 1], previous.v);
  const w = readFinite(slots[offset + 2], previous.w);
  const naturalFrequencyHz = resolveModeNaturalFrequencyHz({
    u,
    v,
    w,
    cavity,
    carried: [previous.naturalFrequencyHz, previous.frequencyHz],
  });
  return {
    modeKey,
    u,
    v,
    w,
    layer: previous.layer ?? layer,
    renderLayer: previous.renderLayer ?? layer,
    naturalFrequencyHz,
    targetEnergy: clamp01(
      readFinite(
        previous.forcingEnergy,
        previous.currentDriveEnergy,
        previous.modalResponseDrive,
      ),
    ),
    physicalTransfer: readPhysicalTransfer(previous),
    qualityFactor: resolveCommittedModeQualityFactor({
      modeKey,
      naturalFrequencyHz,
      cavity,
      carried: [previous.qualityFactor],
    }),
    apparatusTransfer: previous.apparatusTransfer,
    responseModeKey: previous.responseModeKey ?? modeKey,
    shellMemberCount: previous.shellMemberCount,
    sourceProjectionWeight: previous.sourceProjectionWeight,
    sourceCouplingEnergy: previous.sourceCouplingEnergy,
  };
}

function collectLayerModes({
  slots,
  activeModeCount,
  layer,
  state,
  seen,
  modes,
  cavity,
}) {
  const count = resolveBoundedSlotModeCount(slots, activeModeCount);
  for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
    const offset = slotIndex * 4;
    const modeKey = modeKeyFromSlots(slots, offset);
    if (seen.has(modeKey)) {
      continue;
    }
    seen.add(modeKey);
    modes.push(buildFastLayerMode({ slots, offset, layer, state, cavity }));
  }
}

export function buildFastCommittedModes(
  structuralState,
  modalExcitationState,
  cavity,
) {
  const modes = [];
  const seen = new Set();
  collectLayerModes({
    slots: structuralState?.candidateForcingSlotsSource,
    activeModeCount: structuralState?.activeSourceCoupledModeCount,
    layer: "source-coupled",
    state: modalExcitationState,
    seen,
    modes,
    cavity,
  });
  collectLayerModes({
    slots: structuralState?.candidateResponseSlotsSource,
    activeModeCount: structuralState?.activeResonantModeCount,
    layer: "resonant",
    state: modalExcitationState,
    seen,
    modes,
    cavity,
  });
  return modes;
}

function collectModeKeySet(slots, activeModeCount) {
  const keys = new Set();
  const count = resolveBoundedSlotModeCount(slots, activeModeCount);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    if ((slots?.[offset + 3] ?? 0) > 0) {
      keys.add(modeKeyFromSlots(slots, offset));
    }
  }
  return keys;
}

function buildFastTopologyMode({
  slots,
  metadataSlots,
  offset,
  sourceModeKeys,
  modalExcitationState,
  cavity,
}) {
  const modeKey = modeKeyFromSlots(slots, offset);
  const previous =
    readCommittedModeDescriptor(modalExcitationState, modeKey) ?? {};
  const layer =
    previous.layer ??
    previous.renderLayer ??
    (sourceModeKeys.has(modeKey) ? "source-coupled" : "resonant");
  const u = readFinite(slots[offset], previous.u);
  const v = readFinite(slots[offset + 1], previous.v);
  const w = readFinite(slots[offset + 2], previous.w);
  const naturalFrequencyHz = resolveModeNaturalFrequencyHz({
    u,
    v,
    w,
    cavity,
    carried: [
      metadataSlots?.[offset],
      previous.naturalFrequencyHz,
      previous.frequencyHz,
    ],
  });
  const projectedAmplitude = Math.max(0, slots[offset + 3] ?? 0);
  const physicalAmplitude = readPositiveFinite(
    previous.modalResponseDisplayAmplitude,
    previous.displayAmplitude,
    previous.amplitude,
    Math.sqrt(Math.max(0, previous.modalResponseEnergy ?? 0)),
  );
  return {
    modeKey,
    u,
    v,
    w,
    layer,
    renderLayer: previous.renderLayer ?? layer,
    naturalFrequencyHz,
    targetEnergy: clamp01(
      readFinite(
        previous.forcingEnergy,
        previous.currentDriveEnergy,
        previous.modalResponseDrive,
        readFinite(slots[offset + 3]) ** 2,
      ),
    ),
    physicalTransfer: readPhysicalTransfer(previous),
    qualityFactor: resolveCommittedModeQualityFactor({
      modeKey,
      naturalFrequencyHz,
      cavity,
      carried: [metadataSlots?.[offset + 1], previous.qualityFactor],
    }),
    apparatusTransfer: previous.apparatusTransfer,
    responseModeKey: previous.responseModeKey ?? modeKey,
    shellMemberCount: previous.shellMemberCount,
    sourceProjectionWeight: previous.sourceProjectionWeight,
    sourceCouplingEnergy: previous.sourceCouplingEnergy,
    // Modal-field continuity owns only the topology handoff envelope. Keep it
    // separate from the oscillator coefficient so every fast refresh can
    // advance the physical response without bypassing the active crossfade.
    projectionAmplitudeScale:
      physicalAmplitude > 0
        ? clamp01(projectedAmplitude / physicalAmplitude)
        : projectedAmplitude > 0
          ? 1
          : 0,
  };
}

function appendUniqueCommittedModes(modes, additions, committedModeKeys) {
  for (const mode of additions) {
    if (committedModeKeys.has(mode.modeKey)) {
      continue;
    }
    modes.push(mode);
    committedModeKeys.add(mode.modeKey);
  }
}

/**
 * Makes the canonical topology order the exact-drive identity owner. Modal
 * continuity may admit proposal identities that are not present in the
 * current render candidates; those modes must still receive exact forcing or
 * physical decay instead of becoming permanently zero topology slots.
 */
export function buildFastCommittedModesFromTopology(
  topologyFrame,
  structuralState,
  modalExcitationState,
  cavity,
) {
  const slots = topologyFrame?.modalFieldSlots;
  const metadataSlots = topologyFrame?.modalFieldMetadataSlots;
  const activeModeCount = resolveBoundedSlotModeCount(
    slots,
    topologyFrame?.activeModalFieldModeCount,
  );
  const sourceModeKeys = collectModeKeySet(
    structuralState?.proposalSourceCoupledSlotsSource ??
      structuralState?.candidateForcingSlotsSource,
    structuralState?.proposalSourceCoupledSlotsSource
      ? undefined
      : structuralState?.activeSourceCoupledModeCount,
  );
  const modes = [];
  const committedModeKeys = new Set();
  for (let index = 0; index < activeModeCount; index += 1) {
    const offset = index * 4;
    const mode = buildFastTopologyMode({
      slots,
      metadataSlots,
      offset,
      sourceModeKeys,
      modalExcitationState,
      cavity,
    });
    modes.push(mode);
    committedModeKeys.add(mode.modeKey);
  }
  appendUniqueCommittedModes(
    modes,
    buildFastCommittedModes(structuralState, modalExcitationState, cavity),
    committedModeKeys,
  );
  return modes;
}

function buildPreviousOscillatorStates(state, committedModes) {
  const previousOscillatorStates = new Map();
  for (const mode of committedModes) {
    const responseModeKey = getModalResponseModeKey(mode);
    const entry = state.modalOscillatorStates.get(responseModeKey);
    if (entry) {
      previousOscillatorStates.set(responseModeKey, entry);
    }
  }
  return previousOscillatorStates;
}

function mergeResponseEntries(
  state,
  committedModes,
  responseEntries,
  oscillatorStates,
  observedAtMs,
) {
  const byModeKey = new Map();
  const modalOscillatorStates = new Map(state.modalOscillatorStates);
  for (const mode of committedModes) {
    modalOscillatorStates.delete(getModalResponseModeKey(mode));
  }
  for (const entry of oscillatorStates) {
    modalOscillatorStates.set(entry.modeKey, {
      ...entry,
      fastModalOscillatorOwned: true,
    });
  }
  for (const response of responseEntries) {
    const previous = readProjectedModeState(state, response.modeKey) ?? {};
    const observedAtSec = observedAtMs / 1000;
    const modalOscillatorPhaseOffsetRad =
      Number.isFinite(response.oscillatorPhaseRad) &&
      Number.isFinite(response.oscillatorAngularVelocityRadPerSec)
        ? normalizePhaseRad(
            response.oscillatorPhaseRad -
              response.oscillatorAngularVelocityRadPerSec * observedAtSec,
          )
        : undefined;
    const merged = {
      ...previous,
      ...response,
      amplitude: response.displayAmplitude,
      forcingEnergy: response.modalResponseDrive,
      currentDriveEnergy: response.modalResponseDrive,
      driveEnergy: response.modalResponseDrive,
      modalOscillatorPhaseRad: response.oscillatorPhaseRad,
      modalOscillatorPhaseOffsetRad,
      modalOscillatorAngularVelocityRadPerSec:
        response.oscillatorAngularVelocityRadPerSec,
      modalOscillatorPhaseObservedAtSec: observedAtSec,
      modalOscillatorPhaseAuthority: response.oscillatorPhaseAuthority,
      modalOscillatorPhaseCoherence: response.oscillatorPhaseCoherence,
      fastModalOscillatorOwned: true,
    };
    state.activeModes.set(response.modeKey, merged);
    state.modalCandidateState.set(response.modeKey, merged);
    byModeKey.set(response.modeKey, merged);
  }
  for (const mode of committedModes) {
    if (byModeKey.has(mode.modeKey)) {
      continue;
    }
    const previous = readProjectedModeState(state, mode.modeKey) ?? mode;
    const responseModeKey = getModalResponseModeKey(mode);
    if (!modalOscillatorStates.has(responseModeKey)) {
      modalOscillatorStates.set(responseModeKey, {
        ...mode,
        modeKey: responseModeKey,
        responseModeKey,
        modalResponseEnergy: 0,
        modalOscillatorEnvelopeRe: 0,
        modalOscillatorEnvelopeIm: 0,
        modalOscillatorDriveLockRe: 0,
        modalOscillatorDriveLockIm: 0,
        oscillatorPhaseAuthority: 0,
        oscillatorPhaseCoherence: 0,
        fastModalOscillatorOwned: true,
      });
    }
    const decayed = {
      ...previous,
      amplitude: 0,
      displayAmplitude: 0,
      forcingEnergy: 0,
      currentDriveEnergy: 0,
      modalResponseDrive: 0,
      modalResponseEnergy: 0,
      modalOscillatorEnvelopeRe: 0,
      modalOscillatorEnvelopeIm: 0,
      modalOscillatorPhaseAuthority: 0,
      modalOscillatorPhaseCoherence: 0,
    };
    state.activeModes.set(mode.modeKey, decayed);
    state.modalCandidateState.set(mode.modeKey, decayed);
    byModeKey.set(mode.modeKey, decayed);
  }
  state.modalOscillatorStates = modalOscillatorStates;
  return byModeKey;
}

function applyResponseToSlots(
  slots,
  activeModeCount,
  responseByModeKey,
  readAmplitude = (entry) => entry?.displayAmplitude ?? 0,
) {
  const count = Math.max(0, Math.floor(activeModeCount ?? 0));
  for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
    const offset = slotIndex * 4;
    const entry = responseByModeKey.get(modeKeyFromSlots(slots, offset));
    slots[offset + 3] = readAmplitude(entry);
  }
}

function getSlotModeCapacity(slots) {
  return Math.floor((slots?.length ?? 0) / 4);
}

function updateStructuralMetrics({
  structuralState,
  response,
  inputRms,
  hardSilence,
}) {
  const metrics = structuralState?.structuralMetrics;
  if (!metrics) {
    return;
  }
  const modalDriveEnergy = clamp01(
    response.entries.reduce(
      (total, entry) => total + (entry.modalResponseDrive ?? 0),
      0,
    ) / Math.max(1, response.entries.length),
  );
  const modalResponseSourceCoupledCurrentSignalEnergy = clamp01(
    response.modalResponseSourceCoupledCurrentSignalEnergy ?? 0,
  );
  const modalResponseResonantCurrentSignalEnergy = clamp01(
    response.modalResponseResonantCurrentSignalEnergy ?? 0,
  );
  const modalResponseCurrentSignalEnergy = clamp01(
    modalResponseSourceCoupledCurrentSignalEnergy +
      modalResponseResonantCurrentSignalEnergy,
  );
  const currentSignalEnergy = hardSilence
    ? 0
    : modalResponseCurrentSignalEnergy;
  const currentSignalAmplitude = Math.sqrt(currentSignalEnergy);
  const sourceEnergy = hardSilence
    ? 0
    : clamp01(Math.max(0, inputRms ?? 0) ** 2);
  const renderBoundaryState = hardSilence
    ? "muted"
    : sourceEnergy > 0 || currentSignalAmplitude > 0
      ? "live"
      : "zero";
  const energyLedger = buildModalEnergyLedger({
    sourceEnergy,
    renderBoundaryState,
    modalResponse: response,
    candidateForcingSlots: structuralState.candidateForcingSlotsSource,
    candidateResponseSlots: structuralState.candidateResponseSlotsSource,
    capacity:
      (structuralState.activeSourceCoupledModeCount ?? 0) +
      (structuralState.activeResonantModeCount ?? 0),
    currentSignalEnergy,
    currentSignalAmplitude,
  });

  metrics.modalDriveEnergy = modalDriveEnergy;
  metrics.currentSignalEnergy = currentSignalEnergy;
  metrics.currentSignalAmplitude = currentSignalAmplitude;
  metrics.modalResponseCurrentSignalEnergy = modalResponseCurrentSignalEnergy;
  metrics.modalResponseSourceCoupledCurrentSignalEnergy =
    modalResponseSourceCoupledCurrentSignalEnergy;
  metrics.modalResponseResonantCurrentSignalEnergy =
    modalResponseResonantCurrentSignalEnergy;
  metrics.modalResponseInputEnergy = response.modalResponseInputEnergy;
  metrics.modalResponseEnergy = response.modalResponseEnergy;
  metrics.modalResponseSourceCoupledEnergy =
    response.modalResponseSourceCoupledEnergy;
  metrics.modalResponseResonantEnergy = response.modalResponseResonantEnergy;
  metrics.modalResponseModeCount = response.modalResponseModeCount;
  metrics.modalResponseBudgetScale = response.modalResponseBudgetScale;
  metrics.modalResponseBudgetScaleSourceCoupled =
    response.modalResponseBudgetScaleSourceCoupled;
  metrics.modalResponseBudgetScaleResonant =
    response.modalResponseBudgetScaleResonant;
  metrics.modalResponseRawEnergy = response.modalResponseRawEnergy;
  metrics.modalResponseAverageDampingEnvelope =
    response.modalResponseAverageDampingEnvelope;
  metrics.modalResponseAverageCouplingStrength =
    response.modalResponseAverageCouplingStrength;
  metrics.modalResponseAveragePhaseConfidence =
    response.modalResponseAveragePhaseConfidence;
  metrics.modalResponseAveragePersistence =
    response.modalResponseAveragePersistence;
  delete metrics.modalResponseRenderCapEnergy;
  metrics.modalResponseCurrentRenderSourceEvidence = currentSignalAmplitude > 0;
  metrics.modalResponseFreshCouplingEvidence = currentSignalAmplitude > 0;
  metrics.modalResponseRenderPreviewLedger = energyLedger;
  metrics.modalResponseRenderPreviewEnergy = energyLedger.projectedRenderEnergy;
  metrics.modalResponseRenderEnergy = energyLedger.projectedRenderEnergy;
  metrics.modalResponseRenderPreviewSourceCoupledEnergy =
    energyLedger.projectedSourceCoupledEnergy;
  metrics.modalResponseRenderPreviewResonantEnergy =
    energyLedger.projectedResonantEnergy;
  metrics.modalResponseRenderSourceCoupledEnergy =
    energyLedger.projectedSourceCoupledEnergy;
  metrics.modalResponseRenderResonantEnergy =
    energyLedger.projectedResonantEnergy;
  metrics.modalResponseRenderPreviewRawEnergy =
    energyLedger.projectedRenderEnergy;
  metrics.modalResponseRenderRawEnergy = energyLedger.projectedRenderEnergy;
  metrics.energyLedger = energyLedger;
}

/**
 * Advances only the committed modal response. Structural identity and every
 * topology-owned array remain unchanged; unselected modes receive a zero
 * target from the exact estimator and decay through the existing Q integrator.
 */
export function applyFastModalDriveToStructuralState({
  structuralState,
  modalExcitationState,
  committedModes,
  exactDriveResult,
  fftLinearAmplitudes,
  timeDomainData,
  sampleRate,
  deltaMs,
  inputRms,
  normalizedInputAmplitude,
  hardSilence,
  coherence,
  frameTimeMs,
}) {
  if (!structuralState || !modalExcitationState || !exactDriveResult) {
    return null;
  }
  const response = updateModalResponseFrame({
    modes: committedModes,
    fftLinearAmplitudes,
    timeDomainData,
    sampleRate,
    previousOscillatorStates: buildPreviousOscillatorStates(
      modalExcitationState,
      committedModes,
    ),
    deltaMs,
    inputRms,
    normalizedInputAmplitude,
    hardSilence,
    coherence,
    exactDriveResult,
    // Keep sub-display-threshold oscillator envelopes so high-Q modes can
    // accumulate across fast ticks instead of restarting from zero forever.
    minimumEnergy: 0,
  });
  const responseByModeKey = mergeResponseEntries(
    modalExcitationState,
    committedModes,
    response.entries,
    response.oscillatorStates,
    frameTimeMs,
  );
  const sourceCount = structuralState.activeSourceCoupledModeCount;
  const resonantCount = structuralState.activeResonantModeCount;
  for (const slots of [structuralState.candidateForcingSlotsSource]) {
    applyResponseToSlots(slots, sourceCount, responseByModeKey);
  }
  for (const slots of [structuralState.candidateResponseSlotsSource]) {
    applyResponseToSlots(slots, resonantCount, responseByModeKey);
  }
  const readCurrentSignalAmplitude = (entry) =>
    Math.sqrt(
      Math.max(
        0,
        Math.min(
          entry?.modalResponseEnergy ?? 0,
          entry?.modalResponseDrive ?? 0,
        ),
      ),
    );
  applyResponseToSlots(
    structuralState.proposalSourceCoupledSlotsSource,
    getSlotModeCapacity(structuralState.proposalSourceCoupledSlotsSource),
    responseByModeKey,
    readCurrentSignalAmplitude,
  );
  applyResponseToSlots(
    structuralState.proposalResonantSlotsSource,
    getSlotModeCapacity(structuralState.proposalResonantSlotsSource),
    responseByModeKey,
    readCurrentSignalAmplitude,
  );

  const phaseAnchorAngularVelocityRadPerSec =
    computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        {
          visibleSlots: structuralState.candidateForcingSlotsSource,
          capacity: sourceCount,
        },
        {
          visibleSlots: structuralState.candidateResponseSlotsSource,
          capacity: resonantCount,
        },
      ],
      activeModes: modalExcitationState.activeModes,
    });
  const phaseObservedAtSec = frameTimeMs / 1000;
  const phaseAnchorState = advancePhaseAnchorState({
    previous: modalExcitationState.phaseAnchorState,
    angularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    observedAtSec: phaseObservedAtSec,
  });
  modalExcitationState.phaseAnchorState = phaseAnchorState;
  writePhaseSlotsForVisibleModes({
    target: structuralState.sourceCoupledPhaseSlotsSource,
    visibleSlots: structuralState.candidateForcingSlotsSource,
    capacity: sourceCount,
    activeModes: modalExcitationState.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });
  writePhaseSlotsForVisibleModes({
    target: structuralState.resonantPhaseSlotsSource,
    visibleSlots: structuralState.candidateResponseSlotsSource,
    capacity: resonantCount,
    activeModes: modalExcitationState.activeModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
    anchorPhaseRadAtObserved: phaseAnchorState.phaseRad,
    phaseObservedAtSec,
  });
  updateStructuralMetrics({
    structuralState,
    response,
    inputRms,
    hardSilence,
  });
  return response;
}
