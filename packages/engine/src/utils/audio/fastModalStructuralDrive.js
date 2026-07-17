import { updateModalResponseFrame } from "./modalResponse.js";
import {
  computePhaseAnchorAngularVelocityRadPerSec,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";
import { buildModalEnergyLedger } from "./modalEnergyLedger.js";
import { clamp01 } from "../math.js";

function modeKeyFromSlots(slots, offset) {
  return `${slots?.[offset] ?? 0}:${slots?.[offset + 1] ?? 0}:${slots?.[offset + 2] ?? 0}`;
}

function readEntry(state, modeKey) {
  return (
    state?.activeModes?.get?.(modeKey) ??
    state?.observedModes?.get?.(modeKey) ??
    state?.modalCandidateState?.get?.(modeKey) ??
    null
  );
}

const FAST_MODAL_OSCILLATOR_FIELDS = Object.freeze([
  "amplitude",
  "displayAmplitude",
  "modalResponseEnergy",
  "modalResponseDisplayAmplitude",
  "modalResponseBudgetScale",
  "modalResponseInputEnergy",
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
  for (const entries of [
    modalExcitationState?.activeModes,
    modalExcitationState?.observedModes,
    modalExcitationState?.modalCandidateState,
  ]) {
    for (const [modeKey, entry] of entries?.entries?.() ?? []) {
      if (snapshot.has(modeKey) || entry?.fastModalOscillatorOwned !== true) {
        continue;
      }
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
    const current = readEntry(modalExcitationState, mode.modeKey) ?? mode;
    const previous = previousOscillatorState?.get?.(mode.modeKey) ?? null;
    const restored = {
      ...current,
      amplitude: 0,
      displayAmplitude: 0,
      forcingEnergy: 0,
      currentDriveEnergy: 0,
      driveEnergy: 0,
      modalResponseDrive: 0,
      modalResponseEnergy: 0,
      modalResponseDisplayAmplitude: 0,
      modalOscillatorEnvelopeRe: 0,
      modalOscillatorEnvelopeIm: 0,
      modalOscillatorDriveLockRe: 0,
      modalOscillatorDriveLockIm: 0,
      modalOscillatorPhaseAuthority: 0,
      modalOscillatorPhaseCoherence: 0,
      ...(previous ?? {}),
      fastModalOscillatorOwned: true,
    };
    modalExcitationState.activeModes.set(mode.modeKey, restored);
    modalExcitationState.modalCandidateState.set(mode.modeKey, restored);
    if (modalExcitationState.observedModes.has(mode.modeKey)) {
      modalExcitationState.observedModes.set(mode.modeKey, restored);
    }
  }
}

function readPhysicalTransfer(entry) {
  if (Number.isFinite(entry?.physicalTransfer)) {
    return clamp01(entry.physicalTransfer);
  }
  return clamp01(
    (entry?.couplingStrength ?? 1) *
      (entry?.phaseConfidence ?? entry?.phaseAuthority ?? 1) *
      (entry?.dampingEnvelope ?? 1) *
      (0.35 + (entry?.persistence ?? 1) * 0.65),
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

function collectLayerModes({
  slots,
  activeModeCount,
  layer,
  state,
  seen,
  modes,
}) {
  const count = Math.max(0, Math.floor(activeModeCount ?? 0));
  for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
    const offset = slotIndex * 4;
    const modeKey = modeKeyFromSlots(slots, offset);
    if (seen.has(modeKey)) {
      continue;
    }
    seen.add(modeKey);
    const previous = readEntry(state, modeKey);
    modes.push({
      modeKey,
      u: slots?.[offset] ?? previous?.u ?? 0,
      v: slots?.[offset + 1] ?? previous?.v ?? 0,
      w: slots?.[offset + 2] ?? previous?.w ?? 0,
      layer: previous?.layer ?? layer,
      renderLayer: previous?.renderLayer ?? layer,
      naturalFrequencyHz:
        previous?.naturalFrequencyHz ?? previous?.frequencyHz ?? 0,
      targetEnergy: clamp01(
        previous?.forcingEnergy ??
          previous?.currentDriveEnergy ??
          previous?.modalResponseDrive ??
          0,
      ),
      physicalTransfer: readPhysicalTransfer(previous),
      qualityFactor: previous?.qualityFactor,
      modalResponseProfile: previous?.modalResponseProfile,
    });
  }
}

export function buildFastCommittedModes(structuralState, modalExcitationState) {
  const modes = [];
  const seen = new Set();
  collectLayerModes({
    slots: structuralState?.candidateForcingSlotsSource,
    activeModeCount: structuralState?.activeSourceCoupledModeCount,
    layer: "source-coupled",
    state: modalExcitationState,
    seen,
    modes,
  });
  collectLayerModes({
    slots: structuralState?.candidateResponseSlotsSource,
    activeModeCount: structuralState?.activeResonantModeCount,
    layer: "resonant",
    state: modalExcitationState,
    seen,
    modes,
  });
  return modes;
}

function collectModeKeySet(slots, activeModeCount) {
  const keys = new Set();
  const count = Math.min(
    Math.floor((slots?.length ?? 0) / 4),
    Number.isFinite(activeModeCount)
      ? Math.max(0, Math.floor(activeModeCount))
      : Math.floor((slots?.length ?? 0) / 4),
  );
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    if ((slots?.[offset + 3] ?? 0) > 0) {
      keys.add(modeKeyFromSlots(slots, offset));
    }
  }
  return keys;
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
) {
  const slots = topologyFrame?.modalFieldSlots;
  const metadataSlots = topologyFrame?.modalFieldMetadataSlots;
  const activeModeCount = Math.min(
    Math.max(0, Math.floor(topologyFrame?.activeModalFieldModeCount ?? 0)),
    Math.floor((slots?.length ?? 0) / 4),
  );
  const sourceModeKeys = collectModeKeySet(
    structuralState?.proposalSourceCoupledSlotsSource ??
      structuralState?.candidateForcingSlotsSource,
    structuralState?.proposalSourceCoupledSlotsSource
      ? undefined
      : structuralState?.activeSourceCoupledModeCount,
  );
  const resonantModeKeys = collectModeKeySet(
    structuralState?.proposalResonantSlotsSource ??
      structuralState?.candidateResponseSlotsSource,
    structuralState?.proposalResonantSlotsSource
      ? undefined
      : structuralState?.activeResonantModeCount,
  );
  const modes = [];
  const committedModeKeys = new Set();
  for (let index = 0; index < activeModeCount; index += 1) {
    const offset = index * 4;
    const modeKey = modeKeyFromSlots(slots, offset);
    const previous = readEntry(modalExcitationState, modeKey);
    const layer =
      previous?.layer ??
      previous?.renderLayer ??
      (sourceModeKeys.has(modeKey)
        ? "source-coupled"
        : resonantModeKeys.has(modeKey)
          ? "resonant"
          : "resonant");
    modes.push({
      modeKey,
      u: slots[offset] ?? previous?.u ?? 0,
      v: slots[offset + 1] ?? previous?.v ?? 0,
      w: slots[offset + 2] ?? previous?.w ?? 0,
      layer,
      renderLayer: previous?.renderLayer ?? layer,
      naturalFrequencyHz: readPositiveFinite(
        metadataSlots?.[offset],
        previous?.naturalFrequencyHz,
        previous?.frequencyHz,
      ),
      targetEnergy: clamp01(
        previous?.forcingEnergy ??
          previous?.currentDriveEnergy ??
          previous?.modalResponseDrive ??
          (slots[offset + 3] ?? 0) ** 2,
      ),
      physicalTransfer: readPhysicalTransfer(previous),
      qualityFactor: readPositiveFinite(
        metadataSlots?.[offset + 1],
        previous?.qualityFactor,
      ),
      modalResponseProfile: previous?.modalResponseProfile,
    });
    committedModeKeys.add(modeKey);
  }
  for (const mode of buildFastCommittedModes(
    structuralState,
    modalExcitationState,
  )) {
    if (!committedModeKeys.has(mode.modeKey)) {
      modes.push(mode);
      committedModeKeys.add(mode.modeKey);
    }
  }
  return modes;
}

function buildPreviousResponseState(state, committedModes) {
  const previous = new Map();
  for (const mode of committedModes) {
    const entry = readEntry(state, mode.modeKey) ?? mode;
    previous.set(mode.modeKey, entry);
  }
  return previous;
}

function mergeResponseEntries(
  state,
  committedModes,
  responseEntries,
  observedAtMs,
) {
  const byModeKey = new Map();
  for (const response of responseEntries) {
    const previous = readEntry(state, response.modeKey) ?? {};
    const merged = {
      ...previous,
      ...response,
      amplitude: response.displayAmplitude,
      forcingEnergy: response.modalResponseDrive,
      currentDriveEnergy: response.modalResponseDrive,
      driveEnergy: response.modalResponseDrive,
      modalOscillatorPhaseRad: response.oscillatorPhaseRad,
      modalOscillatorPhaseOffsetRad: response.oscillatorPhaseRad,
      modalOscillatorAngularVelocityRadPerSec:
        response.oscillatorAngularVelocityRadPerSec,
      modalOscillatorPhaseObservedAtSec: observedAtMs / 1000,
      modalOscillatorPhaseAuthority: response.oscillatorPhaseAuthority,
      modalOscillatorPhaseCoherence: response.oscillatorPhaseCoherence,
      fastModalOscillatorOwned: true,
    };
    state.activeModes.set(response.modeKey, merged);
    if (state.observedModes.has(response.modeKey)) {
      state.observedModes.set(response.modeKey, merged);
    }
    state.modalCandidateState.set(response.modeKey, merged);
    byModeKey.set(response.modeKey, merged);
  }
  for (const mode of committedModes) {
    if (byModeKey.has(mode.modeKey)) {
      continue;
    }
    const previous = readEntry(state, mode.modeKey) ?? mode;
    const decayed = {
      ...previous,
      amplitude: 0,
      forcingEnergy: 0,
      currentDriveEnergy: 0,
      modalResponseDrive: 0,
      modalResponseEnergy: 0,
      modalOscillatorEnvelopeRe: 0,
      modalOscillatorEnvelopeIm: 0,
      modalOscillatorPhaseAuthority: 0,
      modalOscillatorPhaseCoherence: 0,
      fastModalOscillatorOwned: true,
    };
    state.activeModes.set(mode.modeKey, decayed);
    if (state.observedModes.has(mode.modeKey)) {
      state.observedModes.set(mode.modeKey, decayed);
    }
    state.modalCandidateState.set(mode.modeKey, decayed);
    byModeKey.set(mode.modeKey, decayed);
  }
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
  metrics.modalResponseRenderCapEnergy = hardSilence ? 0 : undefined;
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
    previousEnergies: buildPreviousResponseState(
      modalExcitationState,
      committedModes,
    ),
    deltaMs,
    inputRms,
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
    sourceCount,
    responseByModeKey,
    readCurrentSignalAmplitude,
  );
  applyResponseToSlots(
    structuralState.proposalResonantSlotsSource,
    resonantCount,
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
      observedModes: modalExcitationState.observedModes,
    });
  writePhaseSlotsForVisibleModes({
    target: structuralState.sourceCoupledPhaseSlotsSource,
    visibleSlots: structuralState.candidateForcingSlotsSource,
    capacity: sourceCount,
    activeModes: modalExcitationState.activeModes,
    observedModes: modalExcitationState.observedModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
  });
  writePhaseSlotsForVisibleModes({
    target: structuralState.resonantPhaseSlotsSource,
    visibleSlots: structuralState.candidateResponseSlotsSource,
    capacity: resonantCount,
    activeModes: modalExcitationState.activeModes,
    observedModes: modalExcitationState.observedModes,
    anchorAngularVelocityRadPerSec: phaseAnchorAngularVelocityRadPerSec,
  });
  updateStructuralMetrics({
    structuralState,
    response,
    inputRms,
    hardSilence,
  });
  return response;
}
