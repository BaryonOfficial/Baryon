import { buildModalTopologyModeKey } from "../../core/modalTopology.js";
import { getCavityModeFrequency } from "../cavityModes.js";
import { clamp, clamp01 } from "../math.js";
import {
  computeLoadedModalQualityFactor,
  MAX_MODAL_QUALITY_FACTOR,
  MIN_MODAL_QUALITY_FACTOR,
  resolveModalDampingApparatus,
} from "./modalDamping.js";

function buildModalFieldFrequencyOptions({
  radius,
  cavityAcousticScale,
  boundaryMode,
}) {
  const acousticScale =
    cavityAcousticScale && typeof cavityAcousticScale === "object"
      ? cavityAcousticScale
      : { sideLengthMeters: radius };
  return {
    acousticScale,
    boundaryMode,
    dampingApparatus: resolveModalDampingApparatus(acousticScale),
  };
}

function buildModalSlotModeKey(sourceSlots, sourceOffset) {
  return buildModalTopologyModeKey(
    sourceSlots?.[sourceOffset],
    sourceSlots?.[sourceOffset + 1],
    sourceSlots?.[sourceOffset + 2],
  );
}

function normalizeActiveModeCount(value) {
  return Math.max(0, Math.floor(value ?? 0));
}

function cloneCandidateQuad(source, offset) {
  return [
    source?.[offset] ?? 0,
    source?.[offset + 1] ?? 0,
    source?.[offset + 2] ?? 0,
    source?.[offset + 3] ?? 0,
  ];
}

function candidatePhaseWeight(quad) {
  return Math.max(0, quad?.[2] ?? 0) * Math.max(0, quad?.[3] ?? 0);
}

function chooseStrongerQuad(existing, incoming, weight) {
  return weight(incoming) > weight(existing) ? incoming : existing;
}

function blendSpectralMoment(
  existing,
  incoming,
  existingWeight,
  incomingWeight,
) {
  const totalWeight = existingWeight + incomingWeight;
  if (!(totalWeight > 0)) return [0, 0, 0, 0];
  return existing.map(
    (value, index) =>
      (value * existingWeight + (incoming?.[index] ?? 0) * incomingWeight) /
      totalWeight,
  );
}

function readCandidateEntry(source, offset, coefficientScale) {
  const coefficient =
    Math.max(0, source?.slots?.[offset + 3] ?? 0) * coefficientScale;
  if (!(coefficient > 0)) {
    return null;
  }

  const slot = cloneCandidateQuad(source.slots, offset);
  slot[3] = coefficient;
  return {
    key: buildModalTopologyModeKey(slot[0], slot[1], slot[2]),
    slot,
    phase: cloneCandidateQuad(source.phaseSlots, offset),
    spectralMoment: cloneCandidateQuad(source.spectralMomentSlots, offset),
    spectralMomentWeight: coefficient,
  };
}

function mergeCandidateEntry(entries, entryByModeKey, incoming) {
  if (!incoming) {
    return;
  }

  const existing = entryByModeKey.get(incoming.key);
  if (!existing) {
    entries.push(incoming);
    entryByModeKey.set(incoming.key, incoming);
    return;
  }

  if ((incoming.slot?.[3] ?? 0) > (existing.slot?.[3] ?? 0)) {
    existing.slot = incoming.slot;
  }
  existing.phase = chooseStrongerQuad(
    existing.phase,
    incoming.phase,
    candidatePhaseWeight,
  );
  existing.spectralMoment = blendSpectralMoment(
    existing.spectralMoment,
    incoming.spectralMoment,
    existing.spectralMomentWeight,
    incoming.spectralMomentWeight,
  );
  existing.spectralMomentWeight += incoming.spectralMomentWeight;
}

function appendCandidateEntries({
  entries,
  entryByModeKey,
  source,
  capacity,
  coefficientScale,
}) {
  const slotLimit = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor((source?.slots?.length ?? 0) / 4),
  );
  const activeModeLimit = normalizeActiveModeCount(source?.activeModeCount);
  let seen = 0;

  for (
    let sourceIndex = 0;
    sourceIndex < slotLimit && seen < activeModeLimit;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    if (!((source?.slots?.[sourceOffset + 3] ?? 0) > 0)) {
      continue;
    }
    seen += 1;
    mergeCandidateEntry(
      entries,
      entryByModeKey,
      readCandidateEntry(source, sourceOffset, coefficientScale),
    );
  }
}

function writeMergedCandidateSource(entries) {
  const length = entries.length * 4;
  const merged = {
    slots: new Float32Array(length),
    phaseSlots: new Float32Array(length),
    spectralMomentSlots: new Float32Array(length),
    activeModeCount: entries.length,
  };

  entries.forEach((entry, index) => {
    const offset = index * 4;
    merged.slots.set(entry.slot, offset);
    merged.phaseSlots.set(entry.phase, offset);
    merged.spectralMomentSlots.set(entry.spectralMoment, offset);
  });

  return merged;
}

export function mergeModalCandidateSources({
  renderCandidates,
  proposalCandidates,
  capacity,
  proposalScale = 1,
}) {
  if (
    proposalCandidates?.slots === renderCandidates?.slots ||
    !(proposalCandidates?.activeModeCount > 0)
  ) {
    return renderCandidates;
  }

  const entries = [];
  const entryByModeKey = new Map();
  appendCandidateEntries({
    entries,
    entryByModeKey,
    source: renderCandidates,
    capacity,
    coefficientScale: 1,
  });
  appendCandidateEntries({
    entries,
    entryByModeKey,
    source: proposalCandidates,
    capacity,
    coefficientScale: Number.isFinite(proposalScale)
      ? Math.max(0, proposalScale)
      : 1,
  });

  return writeMergedCandidateSource(entries);
}

export function buildModalCandidateMetadataSlots({
  slots,
  activeModeCount,
  capacity,
  candidateState,
}) {
  if (!candidateState || typeof candidateState.get !== "function") {
    return null;
  }
  if (candidateState.size === 0) {
    return null;
  }

  const slotLength = slots?.length ?? 0;
  const slotLimit = Math.min(
    Math.max(0, Math.floor(capacity ?? 0)),
    Math.floor(slotLength / 4),
  );
  const validLimit = Math.max(0, Math.floor(activeModeCount ?? 0));
  const metadataSlots = new Float32Array(slotLength);
  metadataSlots.fill(Number.NaN);
  let seen = 0;
  let wroteMetadata = false;

  for (
    let sourceIndex = 0;
    sourceIndex < slotLimit && seen < validLimit;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    if (!((slots?.[sourceOffset + 3] ?? 0) > 0)) {
      continue;
    }
    seen += 1;

    const candidate = candidateState.get(
      buildModalSlotModeKey(slots, sourceOffset),
    );
    if (!candidate) {
      continue;
    }

    if (Number.isFinite(candidate.naturalFrequencyHz)) {
      metadataSlots[sourceOffset] = candidate.naturalFrequencyHz;
      wroteMetadata = true;
    }
    if (Number.isFinite(candidate.qualityFactor)) {
      metadataSlots[sourceOffset + 1] = candidate.qualityFactor;
      wroteMetadata = true;
    }
    const responseFrequencyHz =
      candidate.modalResponseDriveFrequencyHz ??
      candidate.responseFrequencyHz ??
      candidate.naturalFrequencyHz;
    if (Number.isFinite(responseFrequencyHz) && responseFrequencyHz > 0) {
      metadataSlots[sourceOffset + 2] = responseFrequencyHz;
      wroteMetadata = true;
    }
    if (Number.isFinite(candidate.observedSupport)) {
      metadataSlots[sourceOffset + 3] = clamp01(candidate.observedSupport);
      wroteMetadata = true;
    }
  }

  return wroteMetadata ? metadataSlots : null;
}

function copyModalQuad(source, sourceOffset, target, targetOffset) {
  target[targetOffset] = source?.[sourceOffset] ?? 0;
  target[targetOffset + 1] = source?.[sourceOffset + 1] ?? 0;
  target[targetOffset + 2] = source?.[sourceOffset + 2] ?? 0;
  target[targetOffset + 3] = source?.[sourceOffset + 3] ?? 0;
}

function buildModalFieldMetadataSlot({
  source,
  sourceOffset,
  frequencyOptions,
  modalObservationConfidence = 1,
  defaultCandidateSupport = 1,
}) {
  const u = source?.slots?.[sourceOffset] ?? 0;
  const v = source?.slots?.[sourceOffset + 1] ?? 0;
  const w = source?.slots?.[sourceOffset + 2] ?? 0;
  const explicitFrequency = source?.metadataSlots?.[sourceOffset];
  const naturalFrequencyHz =
    Number.isFinite(explicitFrequency) && explicitFrequency > 0
      ? explicitFrequency
      : getCavityModeFrequency(u, v, w, frequencyOptions);
  const explicitQualityFactor = source?.metadataSlots?.[sourceOffset + 1];
  const qualityFactor =
    Number.isFinite(explicitQualityFactor) && explicitQualityFactor > 0
      ? clamp(
          explicitQualityFactor,
          MIN_MODAL_QUALITY_FACTOR,
          MAX_MODAL_QUALITY_FACTOR,
        )
      : computeLoadedModalQualityFactor({
          naturalFrequencyHz,
          ...frequencyOptions.dampingApparatus,
        });
  const explicitResponseFrequencyHz = source?.metadataSlots?.[sourceOffset + 2];
  const responseFrequencyHz =
    Number.isFinite(explicitResponseFrequencyHz) &&
    explicitResponseFrequencyHz > 0
      ? explicitResponseFrequencyHz
      : naturalFrequencyHz;
  const phaseEvidence =
    clamp01(source?.phaseSlots?.[sourceOffset + 2] ?? 0) *
    clamp01(source?.phaseSlots?.[sourceOffset + 3] ?? 0);
  const explicitObservedSupport = source?.metadataSlots?.[sourceOffset + 3];
  const baseSupport = Number.isFinite(explicitObservedSupport)
    ? clamp01(explicitObservedSupport)
    : Math.max(phaseEvidence, clamp01(defaultCandidateSupport));
  const observedSupport = clamp01(
    baseSupport * clamp01(modalObservationConfidence),
  );

  return {
    naturalFrequencyHz,
    qualityFactor,
    responseFrequencyHz,
    observedSupport,
  };
}

function writeModalFieldCandidates({
  target,
  source,
  writeIndex,
  frequencyOptions,
  modalObservationConfidence,
  defaultCandidateSupport,
}) {
  const slotCount = Math.floor((source?.slots?.length ?? 0) / 4);
  const targetCount = Math.floor(target.modalFieldSlots.length / 4);
  const validLimit = normalizeActiveModeCount(source?.activeModeCount);
  let written = writeIndex;
  let seen = 0;

  for (
    let sourceIndex = 0;
    sourceIndex < slotCount && seen < validLimit && written < targetCount;
    sourceIndex += 1
  ) {
    const sourceOffset = sourceIndex * 4;
    const coefficient = source?.slots?.[sourceOffset + 3] ?? 0;
    if (!(coefficient > 0)) {
      continue;
    }

    seen += 1;
    const targetOffset = written * 4;
    copyModalQuad(
      source?.slots,
      sourceOffset,
      target.modalFieldSlots,
      targetOffset,
    );
    copyModalQuad(
      source?.phaseSlots,
      sourceOffset,
      target.modalFieldPhaseSlots,
      targetOffset,
    );
    copyModalQuad(
      source?.spectralMomentSlots,
      sourceOffset,
      target.modalFieldSpectralMomentSlots,
      targetOffset,
    );

    const metadata = buildModalFieldMetadataSlot({
      source,
      sourceOffset,
      frequencyOptions,
      modalObservationConfidence,
      defaultCandidateSupport,
    });
    target.modalFieldMetadataSlots[targetOffset] = metadata.naturalFrequencyHz;
    target.modalFieldMetadataSlots[targetOffset + 1] = metadata.qualityFactor;
    target.modalFieldMetadataSlots[targetOffset + 2] =
      metadata.responseFrequencyHz;
    target.modalFieldMetadataSlots[targetOffset + 3] = metadata.observedSupport;
    written += 1;
  }

  return written;
}

function createModalFieldDescriptorBuffers(candidateCount) {
  const slotLength = candidateCount * 4;
  return {
    modalFieldSlots: new Float32Array(slotLength),
    modalFieldPhaseSlots: new Float32Array(slotLength),
    modalFieldSpectralMomentSlots: new Float32Array(slotLength),
    modalFieldMetadataSlots: new Float32Array(slotLength),
  };
}

export function buildModalFieldDescriptorSource({
  sourceCoupledCandidates,
  resonantCandidates,
  radius,
  cavityAcousticScale,
  boundaryMode,
  modalObservationConfidence = 1,
  defaultCandidateSupport = 1,
}) {
  const candidateCount =
    normalizeActiveModeCount(sourceCoupledCandidates?.activeModeCount) +
    normalizeActiveModeCount(resonantCandidates?.activeModeCount);
  const descriptorSource = createModalFieldDescriptorBuffers(candidateCount);
  const frequencyOptions = buildModalFieldFrequencyOptions({
    radius,
    cavityAcousticScale,
    boundaryMode,
  });
  let activeModalFieldModeCount = 0;

  activeModalFieldModeCount = writeModalFieldCandidates({
    target: descriptorSource,
    source: sourceCoupledCandidates,
    writeIndex: activeModalFieldModeCount,
    frequencyOptions,
    modalObservationConfidence,
    defaultCandidateSupport,
  });
  activeModalFieldModeCount = writeModalFieldCandidates({
    target: descriptorSource,
    source: resonantCandidates,
    writeIndex: activeModalFieldModeCount,
    frequencyOptions,
    modalObservationConfidence,
    defaultCandidateSupport,
  });

  return {
    ...descriptorSource,
    activeModalFieldModeCount,
  };
}
