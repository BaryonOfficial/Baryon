import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import {
  MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_RESOLUTION,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "../modalBudgets.js";
import { getBoundaryModeFromValue } from "../modeFamily.js";
import { hasRenderAuthority } from "../renderAuthorityContract.js";
import {
  buildModalBasisAuditDiagnostics,
  buildRaymarchModalBasisCacheDescriptor,
  advanceRaymarchCacheGeneration,
  clearQueuedRaymarchCacheRebuild,
  commitRaymarchModalBasisCachePendingDescriptor,
  computeRaymarchLiveFieldProjectionCache,
  discardRaymarchModalBasisCachePendingDescriptor,
  disposeRaymarchLiveFieldProjectionCache,
  disposeRaymarchModalBasisCache,
  enqueueRaymarchModalBasisCacheRebuild,
  getRaymarchModalBasisCacheDescriptorStaleReason,
  isRaymarchModalBasisCachePendingReadyForDescriptor,
  isRaymarchModalBasisCacheReadyForDescriptor,
  deriveStructuralProjectionDrive,
  resolveRaymarchModalBasisCacheDescriptorBlockedReason,
  resolveRaymarchModalBasisCacheDrawableAuthority,
  shouldRebuildRaymarchModalBasisCache,
  sumLiveSynthesisRepresentableUploadWeight,
  RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
} from "./fieldCache.js";
import {
  buildRaymarchPhaseSlotSignature,
  copyCanonicalRaymarchStructuralCoefficients,
  copyCanonicalRaymarchPhaseSlots,
} from "./phaseSlotSemantics.js";
import {
  deriveLiveSynthesisCancellationSuppression,
  deriveMaterialRadianceTransfer,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
} from "./fieldShaping.js";
import {
  deriveObservationTransfer,
  deriveObservationVisibilityDrive,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import { deriveRaymarchDiagnosticVisibility } from "./diagnosticVisibility.js";
import {
  RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
  RAYMARCH_MATERIAL_TRANSFER_LANES,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_RENDER_QUANTITY_LANES,
} from "./quantityLedger.js";
import {
  buildRaymarchPerformanceGovernor,
  copyModalField,
  deriveFieldExcitation,
  inferModalFieldCapacity,
} from "./performanceGovernor.js";
import {
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  setRaymarchSpectralLightEvaluationMode,
  setRaymarchCavityGeometry,
} from "./material.js";
import { resolveIdleOverlayVisible } from "../idleLogoVisibility.js";
const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 3.6;
const RESPONSE_IDLE_RELEASE = 5.5;
const RHYTHMIC_RELEASE_RATE_GAIN = 2.5;
const DECAY_RELEASE_ENERGY_END = 0.22;
const DECAY_RELEASE_CHANGE_END = 0.12;
const DECAY_RELEASE_STRUCTURE_END = 0.42;
const DECAY_RELEASE_TARGET_REDUCTION = 0.55;
const DECAY_RELEASE_RATE_GAIN = 1.9;
const ACCENT_ATTACK = 15;
const ACCENT_RELEASE = 11;
const DENSITY_RESPONSE_AMOUNT = 0.08;
const THRESHOLD_RESPONSE_REDUCTION = 0.42;
const BLOOM_STRENGTH_RESPONSE_GAIN = 0.18;
const BLOOM_RADIUS_RESPONSE_GAIN = 0.16;
const BLOOM_THRESHOLD_RESPONSE_GAIN = 0.08;
const STRUCTURAL_BODY_BLOOM_STRENGTH_SUPPRESSION_MAX = 0.55;
const STRUCTURAL_BODY_BLOOM_THRESHOLD_LIFT_MAX = 0.08;
// Smoothing for the loudness-aware visibility drive that feeds the observation
// transfer's exposure compensation. Slow enough that the gate does not pump on
// beats, fast enough to follow quiet/loud passages.
const VISIBILITY_DRIVE_DAMP_LAMBDA = 3;
const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const HASH_FLOAT_VIEW = new Float32Array(1);
const HASH_UINT_VIEW = new Uint32Array(HASH_FLOAT_VIEW.buffer);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}

function deriveDecayReleaseMask({
  fieldState,
  gatedStructureSignal,
  gatedEnergySignal,
  gatedChangeSignal,
}) {
  if (fieldState !== "decay") {
    return 0;
  }

  const lowEnergyMask = clamp01(
    (DECAY_RELEASE_ENERGY_END - gatedEnergySignal) / DECAY_RELEASE_ENERGY_END,
  );
  const lowChangeMask = clamp01(
    (DECAY_RELEASE_CHANGE_END - gatedChangeSignal) / DECAY_RELEASE_CHANGE_END,
  );
  const lowStructureMask = clamp01(
    (DECAY_RELEASE_STRUCTURE_END - gatedStructureSignal) /
      DECAY_RELEASE_STRUCTURE_END,
  );

  return clamp01(Math.min(lowEnergyMask, lowChangeMask) * lowStructureMask);
}

function estimateAverageModeAmplitude(modeSlots) {
  if (!modeSlots?.length) return 0;

  let total = 0;
  let count = 0;
  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3] ?? 0;
    if (amplitude <= 0) continue;
    total += amplitude;
    count += 1;
  }

  return count > 0 ? total / count : 0;
}

function setIfChanged(uniformNode, value) {
  if (!uniformNode) return;
  if (uniformNode.value !== value) uniformNode.value = value;
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readUniformColorRgb(uniformNode, fallback) {
  const value = uniformNode?.value ?? uniformNode;
  if (
    Number.isFinite(value?.r) &&
    Number.isFinite(value?.g) &&
    Number.isFinite(value?.b)
  ) {
    return [value.r, value.g, value.b];
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return [
      readFiniteNumber(value[0], fallback[0]),
      readFiniteNumber(value[1], fallback[1]),
      readFiniteNumber(value[2], fallback[2]),
    ];
  }
  return fallback;
}

function computeLinearLuminance(rgb) {
  return (
    readFiniteNumber(rgb?.[0], 0) * 0.2126 +
    readFiniteNumber(rgb?.[1], 0) * 0.7152 +
    readFiniteNumber(rgb?.[2], 0) * 0.0722
  );
}

function hasModalResponseDiagnosticComponents(featureFrame) {
  return (
    Number.isFinite(featureFrame?.modalResponseRenderSourceCoupledEnergy) ||
    Number.isFinite(featureFrame?.modalResponseRenderResonantEnergy)
  );
}

function readModalResponseEvidenceDiagnostics(featureFrame) {
  return {
    hasComponents: hasModalResponseDiagnosticComponents(featureFrame),
    sourceCoupledDiagnosticEnergy: clamp01(
      readFiniteNumber(featureFrame?.modalResponseRenderSourceCoupledEnergy, 0),
    ),
    resonantDiagnosticEnergy: clamp01(
      readFiniteNumber(featureFrame?.modalResponseRenderResonantEnergy, 0),
    ),
  };
}

function deriveModalStructuralDetailAuthority(runtimeState, activeCount) {
  const slots = runtimeState?.modalFieldModeBuffer?.value?.array;
  const slotCount = Math.min(
    Math.max(0, Math.floor(activeCount ?? 0)),
    Math.floor((slots?.length ?? 0) / 4),
  );
  if (!slots || slotCount <= 0) {
    return 1;
  }

  const maxRepresentableModeOrder = Math.max(
    1,
    getModalBasisCacheMaxRepresentableModeIndex(
      runtimeState?.modalBasisCache?.resolution ?? MODAL_BASIS_CACHE_RESOLUTION,
    ),
  );
  let structuralEnergy = 0;
  let weightedDetail = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }
    const u = readFiniteNumber(slots[offset], 0);
    const v = readFiniteNumber(slots[offset + 1], 0);
    const w = readFiniteNumber(slots[offset + 2], 0);
    if (
      Math.max(Math.abs(u), Math.abs(v), Math.abs(w)) >
      maxRepresentableModeOrder
    ) {
      continue;
    }
    const modalEnergy = amplitude * amplitude;
    const modalBandwidth = clamp01(
      Math.hypot(u, v, w) / maxRepresentableModeOrder,
    );
    structuralEnergy += modalEnergy;
    weightedDetail += modalEnergy * modalBandwidth;
  }

  return structuralEnergy > 1e-9
    ? clamp01(weightedDetail / structuralEnergy)
    : 1;
}

function deriveStructuralBodyBloomControls(runtimeState, transientEnergy = 0) {
  const activeModeCount = Math.max(
    0,
    Math.floor(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    activeModeCount,
  );
  const modalStructuralDetailAuthority = deriveModalStructuralDetailAuthority(
    runtimeState,
    activeModeCount,
  );
  const transientRelief = 1 - smoothstep(0.04, 0.32, clamp01(transientEnergy));
  const structuralBodyBloomSuppression = clamp01(
    structuralProjection.projectionEnergyDrive *
      (1 - modalStructuralDetailAuthority) *
      transientRelief,
  );

  return {
    modalStructuralDetailAuthority,
    structuralBodyBloomSuppression,
    bloomStrengthScale:
      1 -
      structuralBodyBloomSuppression *
        STRUCTURAL_BODY_BLOOM_STRENGTH_SUPPRESSION_MAX,
    bloomThresholdLift:
      structuralBodyBloomSuppression * STRUCTURAL_BODY_BLOOM_THRESHOLD_LIFT_MAX,
  };
}

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashFloat32(value, hash) {
  HASH_FLOAT_VIEW[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return hashUint32(HASH_UINT_VIEW[0], hash);
}

function hashSlot4(values, offset, hash) {
  let nextHash = hash;
  nextHash = hashFloat32(values?.[offset] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[offset + 1] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[offset + 2] ?? 0, nextHash);
  return hashFloat32(values?.[offset + 3] ?? 0, nextHash);
}

function resetRaymarchUploadState(runtimeState) {
  if (runtimeState) {
    runtimeState.raymarchUploadState = null;
  }
}

function clearBufferNode(bufferNode) {
  const array = bufferNode?.value?.array;
  if (!array?.fill) {
    return;
  }

  let hasNonZero = false;
  for (let index = 0; index < array.length; index += 1) {
    if (array[index] !== 0) {
      hasNonZero = true;
      break;
    }
  }
  if (!hasNonZero) {
    return;
  }

  array.fill(0);
  bufferNode.value.needsUpdate = true;
}

function snapshotBufferArray(bufferNode) {
  const array = bufferNode?.value?.array;
  return array ? new Float32Array(array) : null;
}

function restoreBufferArray(bufferNode, snapshot) {
  const array = bufferNode?.value?.array;
  if (!array?.fill) {
    return;
  }

  array.fill(0);
  if (snapshot) {
    array.set(snapshot.subarray(0, Math.min(array.length, snapshot.length)), 0);
  }
  bufferNode.value.needsUpdate = true;
}

function resetCacheActivity(cache) {
  if (!cache) {
    return;
  }

  cache.active = false;
  cache.ready = false;
  cache.rebuildPending = false;
  cache.activeDescriptor = null;
  cache.pendingDescriptor = null;
  cache.pendingReady = false;
  cache.pendingCacheBuiltAtSec = null;
  cache.pendingRebuildReason = null;
  cache.activePhaseSampleTimeSec = null;
  cache.pendingPhaseSampleTimeSec = null;
  cache.activeCacheBuiltAtSec = null;
  if (cache.backend === "unavailable") {
    cache.backend = "compute";
    cache.lastError = null;
    cache.lastRebuildReason = null;
  }
  advanceRaymarchCacheGeneration(cache);
  clearQueuedRaymarchCacheRebuild(cache);
}

function resetModalBasisCacheRuntimeDiagnostics(modalBasisCache) {
  if (!modalBasisCache) {
    return;
  }

  modalBasisCache.activeBasisPageModeCount = 0;
  modalBasisCache.modalBasisCachePhaseAuthority = 0;
  modalBasisCache.contributingBasisPageModeCount = 0;
  modalBasisCache.zeroAmplitudeSkippedModeCount = 0;
  modalBasisCache.contributingRawModalEnergy = 0;
  modalBasisCache.bandwidthRejectedModeCount = 0;
  modalBasisCache.bandwidthRejectedRawModalEnergy = 0;
  modalBasisCache.contributingStructuralModalEnergy = 0;
  modalBasisCache.bandwidthRejectedStructuralModalEnergy = 0;
  modalBasisCache.liveSynthesisResolvedRawModalEnergyRatio = 1;
  modalBasisCache.liveSynthesisResolvedStructuralModalEnergyRatio = 1;
  modalBasisCache.liveSynthesisRawGradientEnvelope = 0;
  modalBasisCache.liveSynthesisStructuralGradientEnvelope = 0;
  modalBasisCache.liveSynthesisUnsignedSupportMean = 0;
  modalBasisCache.liveSynthesisCancellationRatioMean = 0;
  modalBasisCache.liveSynthesisCancellationRatioMax = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSampleCount = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticCoverage = 0;
  modalBasisCache.lastAuditDiagnostics = null;
}

function applyModalBasisAuditDiagnostics(runtimeState, auditDiagnostics) {
  if (!runtimeState) {
    return;
  }

  // Support telemetry is a live per-frame measurement decoupled from the
  // atlas-rebuild lifecycle, so it is owned by the runtime rather than the
  // cache (which may be absent on observation-only paths).
  runtimeState.lastModalBasisAuditDiagnostics = auditDiagnostics ?? null;

  const modalBasisCache = runtimeState.modalBasisCache;
  if (!modalBasisCache) {
    return;
  }

  modalBasisCache.lastAuditDiagnostics = auditDiagnostics ?? null;
  modalBasisCache.liveSynthesisUnsignedSupportMean =
    auditDiagnostics?.liveSynthesisUnsignedSupportMean ?? 0;
  modalBasisCache.liveSynthesisCancellationRatioMean =
    auditDiagnostics?.liveSynthesisCancellationRatioMean ?? 0;
  modalBasisCache.liveSynthesisCancellationRatioMax =
    auditDiagnostics?.liveSynthesisCancellationRatioMax ?? 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSampleCount =
    auditDiagnostics?.liveSynthesisSupportDiagnosticSampleCount ?? 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount =
    auditDiagnostics?.liveSynthesisSupportDiagnosticSupportedSampleCount ?? 0;
  modalBasisCache.liveSynthesisSupportDiagnosticCoverage =
    auditDiagnostics?.liveSynthesisSupportDiagnosticCoverage ?? 0;
}

function setModalBasisCacheDrawableAuthority(runtimeState, authority) {
  const normalizedAuthority = authority ?? {
    drawable: false,
    state: "modal-basis-cache-absent",
    blockedReason: "cache-unavailable",
    staleReason: null,
  };
  runtimeState.modalBasisCacheDrawableAuthority = normalizedAuthority;
  const cache = runtimeState.modalBasisCache;
  if (cache) {
    cache.modalBasisCacheDrawable = normalizedAuthority.drawable === true;
    cache.modalBasisCacheDrawableState = normalizedAuthority.state;
    cache.modalBasisCacheDrawableBlockedReason =
      normalizedAuthority.blockedReason ?? null;
    cache.modalBasisCacheDrawableStaleReason =
      normalizedAuthority.staleReason ?? null;
  }
  return normalizedAuthority;
}

function blockModalBasisCacheForDescriptor(modalBasisCache, reason) {
  if (!modalBasisCache) {
    return;
  }

  advanceRaymarchCacheGeneration(modalBasisCache);
  modalBasisCache.ready = false;
  modalBasisCache.rebuildPending = false;
  modalBasisCache.activeDescriptor = null;
  modalBasisCache.pendingDescriptor = null;
  modalBasisCache.pendingReady = false;
  modalBasisCache.pendingCacheBuiltAtSec = null;
  modalBasisCache.pendingRebuildReason = null;
  modalBasisCache.activePhaseSampleTimeSec = null;
  modalBasisCache.pendingPhaseSampleTimeSec = null;
  modalBasisCache.activeCacheBuiltAtSec = null;
  clearQueuedRaymarchCacheRebuild(modalBasisCache);
  modalBasisCache.lastError = null;
  modalBasisCache.lastRebuildReason = reason ?? "blocked";
}

function deactivateLiveFieldProjectionCache(runtimeState, reason = "inactive") {
  const liveFieldProjectionCache = runtimeState?.liveFieldProjectionCache;
  if (liveFieldProjectionCache) {
    liveFieldProjectionCache.active = false;
    liveFieldProjectionCache.lastComputeReason = reason;
  }
  setIfChanged(runtimeState?.uniforms?.uLiveFieldCacheActive, 0);
}

const LIVE_FIELD_PROJECTION_STALE_RETAINED_REASON =
  "modal-basis-cache-stale-retained";
const LIVE_FIELD_PROJECTION_STALE_WITHOUT_COMMITTED_REASON =
  "modal-basis-cache-stale-without-live-field";
const MODAL_BASIS_DISPLAY_LIVE_FIELD_INACTIVE_REASON =
  "modal-basis-cache-live-field-inactive";

function hasCommittedLiveFieldProjectionCache(runtimeState) {
  const liveFieldProjectionCache = runtimeState?.liveFieldProjectionCache;
  const volumeUserData = runtimeState?.volumeMesh?.userData;
  return Boolean(
    liveFieldProjectionCache?.active === true &&
    liveFieldProjectionCache?.ready === true &&
    volumeUserData?.raymarchModalLiveFieldTexture &&
    volumeUserData?.raymarchModalLiveSupportTexture,
  );
}

function retainCommittedLiveFieldProjectionCache(runtimeState) {
  if (!hasCommittedLiveFieldProjectionCache(runtimeState)) {
    return false;
  }
  const liveFieldProjectionCache = runtimeState.liveFieldProjectionCache;
  liveFieldProjectionCache.lastComputeReason =
    LIVE_FIELD_PROJECTION_STALE_RETAINED_REASON;
  setIfChanged(runtimeState?.uniforms?.uLiveFieldCacheActive, 1);
  return true;
}

function resolveRaymarchModalBasisDisplayAuthority(
  runtimeState,
  drawableAuthority = runtimeState?.modalBasisCacheDrawableAuthority,
) {
  if (drawableAuthority?.drawable !== true) {
    return {
      coherent: false,
      failedClosed: true,
      blockedReason:
        drawableAuthority?.blockedReason ??
        drawableAuthority?.staleReason ??
        drawableAuthority?.state ??
        "modal-basis-cache-not-drawable",
    };
  }
  if (drawableAuthority.staleWhileRebuilding !== true) {
    return {
      coherent: true,
      failedClosed: false,
      blockedReason: null,
    };
  }
  if (!hasCommittedLiveFieldProjectionCache(runtimeState)) {
    return {
      coherent: false,
      failedClosed: true,
      blockedReason: LIVE_FIELD_PROJECTION_STALE_WITHOUT_COMMITTED_REASON,
    };
  }
  if ((runtimeState?.uniforms?.uLiveFieldCacheActive?.value ?? 0) <= 0.5) {
    return {
      coherent: false,
      failedClosed: true,
      blockedReason: MODAL_BASIS_DISPLAY_LIVE_FIELD_INACTIVE_REASON,
    };
  }
  return {
    coherent: true,
    failedClosed: false,
    blockedReason: null,
  };
}

function isRaymarchModalBasisDisplayCoherent(runtimeState) {
  return resolveRaymarchModalBasisDisplayAuthority(runtimeState).coherent;
}

function resetRenderAuthorityState(runtimeState) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldSpectralBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  runtimeState.performanceGovernor = null;
  runtimeState.effectiveRenderScale = 1;
  runtimeState.raymarchBloomAdaptationActive = false;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.visibilityDriveEnvelope = 0;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.currentModalDescriptor = null;
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.modalBasisCacheDrawableAuthority = null;
  runtimeState.activeModalRenderPacket = null;
  runtimeState.modalRenderPacketRetained = null;
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.modalBasisCache);
  resetCacheActivity(runtimeState.liveFieldProjectionCache);
  resetModalBasisCacheRuntimeDiagnostics(runtimeState.modalBasisCache);
  deactivateLiveFieldProjectionCache(runtimeState, "render-authority-reset");
  runtimeState.renderAuthorityResetApplied = true;
}

function readRuntimeFieldNoiseFloor(runtimeState) {
  const modalBasisCache = runtimeState?.modalBasisCache;
  return readFiniteNumber(
    modalBasisCache?.densityNoiseFloor ??
      modalBasisCache?.fieldNoiseFloor ??
      modalBasisCache?.debug?.fieldNoiseFloor,
    0,
  );
}

function deriveRuntimeObservationTransferParameters(runtimeState) {
  return deriveObservationTransferParameters({
    opacityGain: runtimeState?.uniforms?.uOpacityGain?.value,
    stepCompensation: runtimeState?.bloomTuning?.stepCompensation,
    contourSharpness: runtimeState?.uniforms?.uContourSharpness?.value,
    fieldNoiseFloor: readRuntimeFieldNoiseFloor(runtimeState),
    visibilityDrive: runtimeState?.visibilityDriveEnvelope ?? 1,
  });
}

function syncObservationTransferUniforms(runtimeState, visibilityDrive = 1) {
  const uniforms = runtimeState?.uniforms ?? {};
  const opacityGain = uniforms.uOpacityGain?.value;
  const stepCompensation = runtimeState?.bloomTuning?.stepCompensation;
  const contourSharpness = uniforms.uContourSharpness?.value;
  const fieldNoiseFloor = readRuntimeFieldNoiseFloor(runtimeState);
  // Quantize so a steady drive keeps the cache warm; only ~0.5% changes recompute.
  const quantizedVisibilityDrive =
    Math.round((Number.isFinite(visibilityDrive) ? visibilityDrive : 1) * 200) /
    200;
  const inputCache =
    runtimeState.observationTransferInputCache ??
    (runtimeState.observationTransferInputCache = {});

  if (
    runtimeState.observationTransferParameters &&
    inputCache.opacityGain === opacityGain &&
    inputCache.stepCompensation === stepCompensation &&
    inputCache.contourSharpness === contourSharpness &&
    inputCache.fieldNoiseFloor === fieldNoiseFloor &&
    inputCache.visibilityDrive === quantizedVisibilityDrive
  ) {
    return runtimeState.observationTransferParameters;
  }

  inputCache.opacityGain = opacityGain;
  inputCache.stepCompensation = stepCompensation;
  inputCache.contourSharpness = contourSharpness;
  inputCache.fieldNoiseFloor = fieldNoiseFloor;
  inputCache.visibilityDrive = quantizedVisibilityDrive;

  const parameters = deriveObservationTransferParameters({
    opacityGain,
    stepCompensation,
    contourSharpness,
    fieldNoiseFloor,
    visibilityDrive: quantizedVisibilityDrive,
  });
  setIfChanged(
    uniforms.uObservationDensityFadeStart,
    parameters.densityFadeStart,
  );
  setIfChanged(uniforms.uObservationDensityFadeEnd, parameters.densityFadeEnd);
  setIfChanged(uniforms.uObservationTransferGain, parameters.transferGain);
  setIfChanged(uniforms.uObservationDensityFloor, parameters.densityFloor);
  setIfChanged(
    uniforms.uObservationContourSupportScale,
    parameters.contourSupportScale,
  );
  runtimeState.observationTransferParameters = parameters;
  return parameters;
}

export function sumUploadedModalFieldAmplitude(modeSlots, activeCount) {
  return sumLiveSynthesisRepresentableUploadWeight({
    modalFieldSlots: modeSlots,
    activeCount,
    resolution: RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  });
}

export function resolveRaymarchTotalSlotAmplitude(runtimeState, activeCount) {
  const resolution =
    runtimeState?.modalBasisCache?.resolution ??
    RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  const clampedActiveCount = Math.max(0, Math.floor(activeCount ?? 0));
  const uploadedFromBuffer = sumLiveSynthesisRepresentableUploadWeight({
    modalFieldSlots: runtimeState?.modalFieldModeBuffer?.value?.array,
    activeCount: clampedActiveCount,
    resolution,
  });
  return uploadedFromBuffer;
}

export function resolveRaymarchStructuralProjectionDrive(
  runtimeState,
  activeCount,
) {
  const resolution =
    runtimeState?.modalBasisCache?.resolution ??
    RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  return deriveStructuralProjectionDrive({
    modalFieldSlots: runtimeState?.modalFieldModeBuffer?.value?.array,
    activeCount: Math.max(0, Math.floor(activeCount ?? 0)),
    resolution,
  });
}

function setRaymarchStructuralProjectionUniforms(uniforms, projectionDrive) {
  setIfChanged(
    uniforms.uStructuralProjectionDrive,
    projectionDrive?.projectionEnergyDrive ?? 0,
  );
  setIfChanged(
    uniforms.uStructuralProjectionConcentration,
    projectionDrive?.structuralConcentration ?? 0,
  );
}

function estimateModalFieldAmplitude(featureFrame) {
  return estimateAverageModeAmplitude(
    featureFrame?.modalDescriptor?.slotViews?.modalFieldSlots ??
      featureFrame?.modalFieldSlots,
  );
}

function summarizeRenderedLayer(modeSlots, colorSlots, count) {
  const slotCount = Math.max(0, Math.floor(count ?? 0));
  let amplitudeTotal = 0;
  let colorWeightMax = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    amplitudeTotal += modeSlots?.[offset + 3] ?? 0;
    colorWeightMax = Math.max(colorWeightMax, colorSlots?.[offset + 3] ?? 0);
  }
  return {
    count: slotCount,
    amplitudeTotal,
    colorWeightMax,
  };
}

function maxModalFieldAmplitude(modalDescriptor, activeCount = null) {
  const slots = modalDescriptor?.slotViews?.modalFieldSlots;
  const count = Math.min(
    Number.isFinite(activeCount) && activeCount > 0
      ? Math.floor(activeCount)
      : (modalDescriptor?.counts?.modalFieldModeCount ?? 0),
    Math.floor((slots?.length ?? 0) / 4),
  );
  let max = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    max = Math.max(max, slots?.[offset + 3] ?? 0);
  }
  return max;
}

function deriveLightAsymmetry(primaryIntensity, secondaryIntensity) {
  const strongest = Math.max(primaryIntensity, secondaryIntensity, 1e-4);
  return Math.abs(primaryIntensity - secondaryIntensity) / strongest;
}

function getRuntimeBoundaryMode(runtimeState) {
  return getBoundaryModeFromValue(
    runtimeState.uniforms.uBoundaryMode?.value ?? 1,
  );
}

function getRuntimeEffectiveCavityGeometry(runtimeState) {
  return normalizeCavityGeometry(
    runtimeState?.effectiveCavityGeometry ??
      runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
      DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  );
}

function resolveProductBasisAtlasPageCapacity(runtimeState) {
  return Math.max(
    1,
    Math.round(
      runtimeState.modalBasisCache?.basisCapacity ??
        MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    ),
  );
}

function buildRuntimeModalDescriptor(
  runtimeState,
  featureFrame,
  { modalFieldCapacity },
) {
  const sourceDescriptor = featureFrame?.modalDescriptor ?? null;
  const slotViews = sourceDescriptor?.slotViews ?? {};
  const basisAtlasPageCapacity =
    resolveProductBasisAtlasPageCapacity(runtimeState);
  if (slotViews.modalFieldSlots) {
    if (
      sourceDescriptor?.diagnostics?.basisAtlasPageCapacity ===
      basisAtlasPageCapacity
    ) {
      return sourceDescriptor;
    }
  }

  return buildCanonicalFullModalDescriptor({
    generation:
      sourceDescriptor?.generation ??
      runtimeState.modalDescriptorGeneration ??
      0,
    maxTotalModes: modalFieldCapacity,
    basisAtlasPageCapacity,
    basisCacheResolution:
      runtimeState.modalBasisCache?.resolution ?? MODAL_BASIS_CACHE_RESOLUTION,
    modalFieldSlots: featureFrame?.modalFieldSlots,
    modalFieldPhaseSlots: featureFrame?.modalFieldPhaseSlots,
    modalFieldColorSlots: featureFrame?.modalFieldColorSlots,
    modalFieldSpectralSlots: featureFrame?.modalFieldSpectralSlots,
    modalFieldMetadataSlots: featureFrame?.modalFieldMetadataSlots,
    activeModalFieldModeCount:
      sourceDescriptor?.counts?.validModeCount ?? featureFrame?.activeModeCount,
    observerCandidateModeCount:
      sourceDescriptor?.diagnostics?.observerCandidateModeCount ??
      featureFrame?.debug?.excitedModeCount ??
      featureFrame?.debug?.structuralMetrics?.excitedModeCount,
    observedModalModeCount:
      sourceDescriptor?.diagnostics?.observedModalModeCount ??
      featureFrame?.debug?.observedModalModeCount ??
      featureFrame?.debug?.structuralMetrics?.observedModalModeCount,
    phaseAuthorityModeCount:
      sourceDescriptor?.diagnostics?.phaseAuthorityModeCount ??
      featureFrame?.debug?.modalPhaseCoherentFieldModeCount ??
      featureFrame?.debug?.structuralMetrics?.modalPhaseCoherentFieldModeCount,
    modeIdentityRetentionRatio:
      sourceDescriptor?.diagnostics?.modeIdentityRetentionRatio ??
      featureFrame?.debug?.modalPersistence ??
      featureFrame?.debug?.structuralMetrics?.modalPersistence,
  });
}

function blockOverflowedModalDescriptor(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldSpectralBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  runtimeState.performanceGovernor = null;
  runtimeState.effectiveRenderScale = 1;
  runtimeState.raymarchBloomAdaptationActive = false;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.visibilityDriveEnvelope = 0;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.activeModalRenderPacket = null;
  runtimeState.modalRenderPacketRetained = null;
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.modalBasisCache);
  resetCacheActivity(runtimeState.liveFieldProjectionCache);
  resetModalBasisCacheRuntimeDiagnostics(runtimeState.modalBasisCache);
  deactivateLiveFieldProjectionCache(runtimeState, "descriptor-overflow");
  setIfChanged(runtimeState.uniforms.uModalFieldModeCount, 0);
  setIfChanged(runtimeState.uniforms.uTotalSlotAmplitude, 0);
  setRaymarchStructuralProjectionUniforms(runtimeState.uniforms, null);
  runtimeState.volumeMesh.visible = false;
  runtimeState.idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
}

function publishAuditSnapshot(snapshot) {
  if (typeof window === "undefined") {
    return;
  }

  if (snapshot == null) {
    delete (/** @type {any} */ (window).__baryonAuditSnapshot);
    return;
  }

  /** @type {any} */ (window).__baryonAuditSnapshot = snapshot;
}

function publishRaymarchRuntimeAuditSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  const shouldBuildRenderProbe =
    runtimeState.auditEnabled || runtimeState.renderProbeEnabled;

  if (shouldBuildRenderProbe) {
    const raymarchDebug = buildRaymarchDebugSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    runtimeState.debugSnapshot = featureFrame?.debug
      ? { ...featureFrame.debug, raymarchDebug, ...raymarchDebug }
      : raymarchDebug;
    if (runtimeState.auditEnabled) {
      publishAuditSnapshot(runtimeState.debugSnapshot);
    } else {
      publishAuditSnapshot(null);
    }
  } else {
    runtimeState.debugSnapshot = null;
    publishAuditSnapshot(null);
  }
}

/**
 * Resolve the {@link BasisIdentity} topology block for the debug snapshot,
 * preferring the cache's committed values and falling back to the in-flight
 * descriptor. Pure read: it never mutates the cache and never influences
 * rebuild decisions (those key only on the descriptor identity hashes in
 * fieldCache, see resolveModalBasisCacheRebuildReason).
 *
 * @param {object|null} modalBasisCache
 * @param {object|null} descriptor
 * @returns {{resolution: number, basisAtlasDepth: number, liveSynthesisModeCount: number, modeIdentityRetentionRatio: number}}
 */
function readModalBasisIdentity(modalBasisCache, descriptor) {
  return {
    resolution:
      modalBasisCache?.resolution ?? RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
    basisAtlasDepth:
      modalBasisCache?.basisAtlasDepth ?? descriptor?.basisAtlasDepth ?? 0,
    liveSynthesisModeCount:
      modalBasisCache?.liveSynthesisModeCount ??
      descriptor?.liveSynthesisModeCount ??
      0,
    modeIdentityRetentionRatio:
      modalBasisCache?.modeIdentityRetentionRatio ??
      descriptor?.modeIdentityRetentionRatio ??
      1,
  };
}

function buildRaymarchDebugSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  const modalDescriptor =
    runtimeState.currentModalDescriptor ??
    featureFrame?.modalDescriptor ??
    null;
  const avgAmplitude = estimateModalFieldAmplitude(featureFrame);
  const activeModeCount =
    runtimeState.uniforms.uModalFieldModeCount?.value ?? 0;
  const peakModalFieldAmplitude = maxModalFieldAmplitude(
    modalDescriptor,
    activeModeCount,
  );
  const fieldExcitation = deriveFieldExcitation(featureFrame);
  const performanceGovernor = runtimeState.performanceGovernor ?? null;
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const absorption = runtimeState.uniforms.uAbsorption.value;
  const opacityGain = runtimeState.uniforms.uOpacityGain?.value ?? 1;
  const stepBudget = Math.round(runtimeState.volumeMesh.material.steps);
  const rimBloomBias = runtimeState.uniforms.uRimBloomBias?.value ?? 0;
  const rimCompression = runtimeState.uniforms.uRimCompression?.value ?? 0;
  const holographicIntensity =
    runtimeState.uniforms.uHolographicIntensity?.value ?? 0;
  const holographicShift = runtimeState.uniforms.uHolographicShift?.value ?? 0;
  const holographicFresnelPower =
    runtimeState.uniforms.uHolographicFresnelPower?.value ?? 0;
  const bloomResponseBias = runtimeState.bloomTuning?.bloomResponseBias ?? 0;
  const stepReference = runtimeState.bloomTuning?.stepReference ?? stepBudget;
  const stepCompensation = runtimeState.bloomTuning?.stepCompensation ?? 1;
  const lowStepBloomGuard = runtimeState.bloomTuning?.lowStepBloomGuard ?? 0;
  const effectiveBloomStrength =
    runtimeState.bloomTuning?.effectiveStrength ?? 0;
  const effectiveBloomRadius = runtimeState.bloomTuning?.effectiveRadius ?? 0;
  const effectiveBloomThreshold =
    runtimeState.bloomTuning?.effectiveThreshold ?? 0;
  const transientEnergy = featureFrame?.transientEnergy ?? 0;
  const spectralFlux = featureFrame?.spectralFlux ?? 0;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const energySignal = featureFrame?.energySignal ?? 0;
  const changeSignal = featureFrame?.changeSignal ?? 0;
  const changeBreakdown =
    featureFrame?.debug?.changeBreakdown ??
    featureFrame?.changeBreakdown ??
    null;
  const pulseSignal = featureFrame?.pulseSignal ?? 0;
  const totalSlotAmplitude = resolveRaymarchTotalSlotAmplitude(
    runtimeState,
    activeModeCount,
  );
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    activeModeCount,
  );
  const modalCoefficientEnergy = renderAuthority
    ? clamp01(structuralProjection.projectionEnergyDrive)
    : 0;
  const modalResponseEnergy = renderAuthority
    ? clamp01(
        featureFrame?.modalResponseEnergy ??
          featureFrame?.modalResponseRenderEnergy ??
          featureFrame?.debug?.modalResponseEnergy ??
          0,
      )
    : 0;
  const modalResponseEvidenceDiagnostics = renderAuthority
    ? readModalResponseEvidenceDiagnostics(featureFrame)
    : { sourceCoupledDiagnosticEnergy: 0, resonantDiagnosticEnergy: 0 };
  const structuralBodyBloomControls = renderAuthority
    ? deriveStructuralBodyBloomControls(runtimeState, transientEnergy)
    : {
        modalStructuralDetailAuthority: 0,
        structuralBodyBloomSuppression: 0,
      };
  const modalPhaseAuthority = renderAuthority
    ? (featureFrame?.modalPhaseAuthority ?? 0)
    : 0;
  const projectedRenderEnergy = readFiniteNumber(
    featureFrame?.energyLedger?.projectedRenderEnergy,
    0,
  );
  const renderEnergyEpsilon = readFiniteNumber(
    featureFrame?.energyLedger?.renderEnergyEpsilon,
    1e-6,
  );
  const observationHardSilence =
    !renderAuthority && projectedRenderEnergy <= renderEnergyEpsilon;
  const observationParameters =
    runtimeState.observationTransferParameters ??
    deriveRuntimeObservationTransferParameters(runtimeState);
  const observationTransferDebug = deriveObservationTransfer({
    density: 0,
    modalStructureAnchor: 1,
    ridgeAnchor: 1,
    modalCoefficientEnergy,
    modalResponseEnergy,
    parameters: observationParameters,
  });
  const rawDiagnosticDensity = Math.min(
    1,
    avgAmplitude * densityGain * absorption * (0.75 + transientEnergy * 0.2),
  );
  const {
    avgRaySegmentLength = 0,
    missRatio = 0,
    avgSilhouetteSuppression = 0,
  } = runtimeState.stabilityStats ?? {};
  const primaryLightIntensity =
    runtimeState.sceneLighting?.primary?.intensity ?? 0;
  const secondaryLightIntensity =
    runtimeState.sceneLighting?.secondary?.intensity ?? 0;
  const { holographicFresnel } = deriveHolographicFresnel({
    normalViewDot: 0.35,
    holographicIntensity,
    holographicFresnelPower,
  });
  const { colorMix: holographicColorMix, emissiveLift } =
    deriveHolographicColorMix({
      baseColor: [0.34, 0.62, 0.9],
      surfaceColor: [0.66, 0.86, 1.0],
      holographicShift,
      holographicFresnel,
    });
  const holographicReferenceStrength =
    holographicFresnel * (0.7 + holographicColorMix * 0.3) + emissiveLift * 0.2;
  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const requestedCavityGeometry = normalizeCavityGeometry(
    runtimeState?.requestedCavityGeometry,
  );
  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const modalBasisCache = runtimeState.modalBasisCache ?? null;
  const liveFieldProjectionCache =
    runtimeState.liveFieldProjectionCache ?? null;
  const modalBasisCacheDescriptor =
    runtimeState.currentModalBasisCacheDescriptor ?? null;
  const basisIdentity = readModalBasisIdentity(
    modalBasisCache,
    modalBasisCacheDescriptor,
  );
  const modalBasisCacheDiagnosticDescriptor =
    modalBasisCache?.ready && modalBasisCache?.activeDescriptor
      ? modalBasisCache.activeDescriptor
      : modalBasisCacheDescriptor;
  const modalBasisCacheDescriptorFresh =
    isRaymarchModalBasisCacheReadyForDescriptor(
      modalBasisCache,
      modalBasisCacheDescriptor,
    );
  const modalBasisCacheDescriptorStaleReason =
    getRaymarchModalBasisCacheDescriptorStaleReason({
      descriptorFresh: modalBasisCacheDescriptorFresh,
      rebuildPending: modalBasisCache?.rebuildPending,
      queuedDescriptor: modalBasisCache?.queuedDescriptor,
      activeDescriptor: modalBasisCache?.activeDescriptor,
      nextDescriptor: modalBasisCacheDescriptor,
    });
  const modalBasisCacheQueuedDescriptorAgeMs =
    modalBasisCache?.queuedDescriptor &&
    Number.isFinite(modalBasisCache?.queuedDescriptorAtSec)
      ? Math.max(
          0,
          ((runtimeState.uniforms.uTime?.value ?? 0) -
            modalBasisCache.queuedDescriptorAtSec) *
            1000,
        )
      : null;
  const modalBasisCacheAgeMs =
    Number.isFinite(modalBasisCache?.activeCacheBuiltAtSec) &&
    Number.isFinite(runtimeState.uniforms.uTime?.value)
      ? Math.max(
          0,
          ((runtimeState.uniforms.uTime?.value ?? 0) -
            modalBasisCache.activeCacheBuiltAtSec) *
            1000,
        )
      : null;
  const modalBasisCacheModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingBasisPageModeCount ??
      modalBasisCache?.activeBasisPageModeCount,
    0,
  );
  const modalBasisPhaseAuthorityModeCount = readFiniteNumber(
    modalBasisCacheDescriptor?.phaseModeCount ??
      runtimeState.modalBasisPhaseAuthorityModeCount,
    0,
  );
  const modalBasisCacheSemantic =
    modalBasisCache?.semantic ?? "modal-basis-cache";
  const modalBasisCacheSupportSemantic = "coefficient-invariant-basis-support";
  const modalBasisCacheSupportReady = Boolean(modalBasisCache?.ready);
  const modalBasisCachePhaseAuthority = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.phaseAuthority ??
      modalBasisCache?.modalBasisCachePhaseAuthority,
    0,
  );
  const modalBasisCacheMaxRepresentableModeIndex = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.modalBasisCacheMaxRepresentableModeIndex ??
      modalBasisCache?.modalBasisCacheMaxRepresentableModeIndex,
    0,
  );
  const modalBasisCacheContributingModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingBasisPageModeCount ??
      modalBasisCache?.contributingBasisPageModeCount,
    0,
  );
  const modalBasisCacheZeroAmplitudeSkippedModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.zeroAmplitudeSkippedModeCount ??
      modalBasisCache?.zeroAmplitudeSkippedModeCount,
    0,
  );
  const modalBasisCacheContributingRawModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingRawModalEnergy ??
      modalBasisCache?.contributingRawModalEnergy,
    0,
  );
  const modalBasisCacheBandwidthRejectedModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedModeCount ??
      modalBasisCache?.bandwidthRejectedModeCount,
    0,
  );
  const modalBasisCacheBandwidthRejectedRawModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedRawModalEnergy ??
      modalBasisCache?.bandwidthRejectedRawModalEnergy,
    0,
  );
  const modalBasisCacheContributingStructuralModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingStructuralModalEnergy ??
      modalBasisCache?.contributingStructuralModalEnergy,
    0,
  );
  const modalBasisCacheBandwidthRejectedStructuralModalEnergy =
    readFiniteNumber(
      modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedStructuralModalEnergy ??
        modalBasisCache?.bandwidthRejectedStructuralModalEnergy,
      0,
    );
  const liveSynthesisResolvedRawModalEnergyRatio = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisResolvedRawModalEnergyRatio ??
      modalBasisCache?.liveSynthesisResolvedRawModalEnergyRatio,
    1,
  );
  const liveSynthesisResolvedStructuralModalEnergyRatio = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisResolvedStructuralModalEnergyRatio ??
      modalBasisCache?.liveSynthesisResolvedStructuralModalEnergyRatio,
    1,
  );
  const liveSynthesisRawGradientEnvelope = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisRawGradientEnvelope ??
      modalBasisCache?.liveSynthesisRawGradientEnvelope,
    0,
  );
  const liveSynthesisStructuralGradientEnvelope = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisStructuralGradientEnvelope ??
      modalBasisCache?.liveSynthesisStructuralGradientEnvelope,
    0,
  );
  const liveSynthesisSupportDiagnostics =
    runtimeState?.lastModalBasisAuditDiagnostics ??
    modalBasisCache?.lastAuditDiagnostics ??
    null;
  const liveSynthesisUnsignedSupportMean = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisUnsignedSupportMean,
    0,
  );
  const liveSynthesisCancellationRatioMean = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisCancellationRatioMean,
    0,
  );
  const liveSynthesisCancellationRatioMax = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisCancellationRatioMax,
    0,
  );
  const liveSynthesisSupportDiagnosticSampleCount = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisSupportDiagnosticSampleCount,
    0,
  );
  const liveSynthesisSupportDiagnosticSupportedSampleCount = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisSupportDiagnosticSupportedSampleCount,
    0,
  );
  const liveSynthesisSupportDiagnosticCoverage = readFiniteNumber(
    liveSynthesisSupportDiagnostics?.liveSynthesisSupportDiagnosticCoverage,
    0,
  );
  const hasLiveSynthesisSupportMetrics =
    renderAuthority &&
    liveSynthesisSupportDiagnosticSampleCount > 0 &&
    liveSynthesisSupportDiagnosticCoverage > 0;
  const sampledObservationAnchor = hasLiveSynthesisSupportMetrics
    ? clamp01(liveSynthesisUnsignedSupportMean)
    : 0;
  const sampledObservationSignedAuthority = hasLiveSynthesisSupportMetrics
    ? deriveLiveSynthesisCancellationSuppression({
        effectiveCancellationRatio: liveSynthesisCancellationRatioMean,
        effectiveUnsignedSupport: sampledObservationAnchor,
      })
    : 0;
  const sampledObservationTransferDebug = deriveObservationTransfer({
    density: 0,
    modalStructureAnchor: sampledObservationAnchor,
    ridgeAnchor: sampledObservationAnchor,
    signedRadianceAuthority: sampledObservationSignedAuthority,
    modalCoefficientEnergy,
    modalResponseEnergy,
    parameters: observationParameters,
  });
  const diagnosticUsesSampledSupport = hasLiveSynthesisSupportMetrics;
  const diagnosticObservationAnchor = diagnosticUsesSampledSupport
    ? sampledObservationAnchor
    : observationTransferDebug.observationAnchor;
  const diagnosticSignedRadianceAuthority = diagnosticUsesSampledSupport
    ? sampledObservationSignedAuthority
    : 1;
  const diagnosticVisibility = deriveRaymarchDiagnosticVisibility({
    rawDensityEstimate: rawDiagnosticDensity,
    observationAnchor: diagnosticObservationAnchor,
    ridgeAnchor: diagnosticObservationAnchor,
    signedRadianceAuthority: diagnosticSignedRadianceAuthority,
    modalCoefficientEnergy,
    modalResponseEnergy,
    opacityGain,
    stepBudget,
    spectralFlux,
    parameters: observationParameters,
  });
  const avgDensity = diagnosticVisibility.avgDensity;
  const avgOpacity = diagnosticVisibility.avgOpacity;
  const earlyExitRatio = Math.min(1, avgOpacity * 0.72);
  const bloomRisk = Math.min(
    1,
    avgDensity *
      (1 + rimBloomBias * 0.22) *
      (1 - rimCompression * 0.12) *
      (0.7 + effectiveBloomStrength * 1.6) *
      (1.1 - effectiveBloomThreshold * 0.4) *
      (1 - bloomResponseBias * 0.18),
  );
  const materialProbePhysicalDensity = clamp01(
    diagnosticVisibility.supportedPhysicalDensity,
  );
  const materialProbeCausticVisibleDensity = clamp01(
    diagnosticVisibility.observationTransfer?.physicalVisibleDensity,
  );
  const materialProbeObservationDensity = clamp01(
    diagnosticVisibility.observationTransfer?.observationDensity ?? avgDensity,
  );
  const materialProbeTransfer = deriveMaterialRadianceTransfer({
    stabilizedDensity: materialProbeObservationDensity,
    causticVisibleDensity: materialProbeCausticVisibleDensity,
    volumeColor: readUniformColorRgb(
      runtimeState.uniforms.uColor,
      [0.34, 0.62, 0.9],
    ),
    surfaceColor: readUniformColorRgb(
      runtimeState.uniforms.uSurfaceColor,
      [0.66, 0.86, 1.0],
    ),
    structureAwareEmissionGain: 1,
  });
  const materialProbePreBloomRadiance = computeLinearLuminance(
    materialProbeTransfer.finalRadiance,
  );
  const materialProbeBloomAmplification =
    1 + bloomRisk * Math.max(0, effectiveBloomStrength);
  const materialProbePostBloomRisk =
    materialProbePreBloomRadiance * materialProbeBloomAmplification;
  const modalBasisCacheDrawableAuthority =
    runtimeState.modalBasisCacheDrawableAuthority ??
    resolveRaymarchModalBasisCacheDrawableAuthority(
      modalBasisCache,
      modalBasisCacheDescriptor,
    );
  const modalBasisCacheDrawable =
    modalBasisCacheDrawableAuthority.drawable === true;
  const modalBasisDisplayAuthority = resolveRaymarchModalBasisDisplayAuthority(
    runtimeState,
    modalBasisCacheDrawableAuthority,
  );
  const renderedModalField = summarizeRenderedLayer(
    runtimeState.modalFieldModeBuffer?.value?.array,
    runtimeState.modalFieldColorBuffer?.value?.array,
    activeModeCount,
  );
  const activeModalRenderPacket = runtimeState.activeModalRenderPacket ?? null;
  const retainedModalRenderPacket = runtimeState.modalRenderPacketRetained;

  return {
    fieldState,
    renderAuthority,
    projectedRenderEnergy,
    renderEnergyEpsilon,
    sourceBoundaryState:
      featureFrame?.energyLedger?.sourceBoundaryState ?? null,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      performanceGovernor?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      performanceGovernor?.uploadedModeCount ?? activeModeCount,
    modalFieldModeCount: activeModeCount,
    renderedModalFieldModeCount: renderedModalField.count,
    renderedModalFieldColorWeightMax: renderedModalField.colorWeightMax,
    renderedModalFieldAmplitudeTotal: renderedModalField.amplitudeTotal,
    structuralProjectionAmplitudeSum: structuralProjection.amplitudeSum,
    structuralProjectionEnergy: structuralProjection.structuralEnergy,
    structuralProjectionEffectiveModeCount:
      structuralProjection.effectiveModeCount,
    structuralProjectionRmsAmplitude:
      structuralProjection.rmsStructuralAmplitude,
    structuralProjectionDrive: structuralProjection.projectionEnergyDrive,
    structuralProjectionConcentration:
      structuralProjection.structuralConcentration,
    structuralProjectionReferenceEnergy: structuralProjection.referenceEnergy,
    modalDescriptorFieldAuthority:
      modalDescriptor?.fieldAuthority ?? "unavailable",
    modalDescriptorOverflow:
      modalDescriptor?.diagnostics?.descriptorOverflow === true,
    modalDescriptorMaxTotalModes:
      modalDescriptor?.capacity?.maxTotalModes ?? activeModeCount,
    modalDescriptorValidModeCount:
      modalDescriptor?.counts?.validModeCount ?? activeModeCount,
    modalDescriptorOverflowModeCount:
      modalDescriptor?.counts?.overflowModeCount ?? 0,
    modalDescriptorPhaseAuthorityModeCount:
      modalDescriptor?.diagnostics?.phaseAuthorityModeCount ??
      modalBasisPhaseAuthorityModeCount,
    modalVarietyAudit: modalDescriptor?.diagnostics?.modalVarietyAudit ?? null,
    renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
    renderQuantityOwnershipLanes: RAYMARCH_RENDER_QUANTITY_LANES,
    renderMaterialTransferLanes: RAYMARCH_MATERIAL_TRANSFER_LANES,
    renderQuantityForbiddenConsumers: RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
    modalRenderPacketStatus: retainedModalRenderPacket
      ? "active-retained-pending"
      : activeModalRenderPacket
        ? "active"
        : "none",
    modalRenderPacketActiveGeneration:
      activeModalRenderPacket?.generationId ?? null,
    modalRenderPacketActiveIdentityPageAssignmentHash:
      activeModalRenderPacket?.identityPageAssignmentHash ?? null,
    modalRenderPacketActiveDescriptorIdentityHash:
      activeModalRenderPacket?.descriptorIdentityHash ?? null,
    modalRenderPacketPendingIdentityPageAssignmentHash:
      retainedModalRenderPacket?.pendingIdentityPageAssignmentHash ?? null,
    modalRenderPacketPendingDescriptorIdentityHash:
      retainedModalRenderPacket?.pendingDescriptorIdentityHash ?? null,
    modalRenderPacketRetainedAtSec:
      retainedModalRenderPacket?.retainedAtSec ?? null,
    dominantFrequency:
      featureFrame?.debug?.dominantFrequency ??
      featureFrame?.debug?.fundamentalFrequency ??
      0,
    fieldExcitation,
    complexityScore: performanceGovernor?.complexityScore ?? 0,
    complexityExcitation: performanceGovernor?.excitation ?? fieldExcitation,
    complexityWeightedPermutationLoad:
      performanceGovernor?.weightedPermutationLoad ?? 0,
    complexityCountLoad: performanceGovernor?.countLoad ?? 0,
    proactiveStepBudget: performanceGovernor?.proactiveStepBudget ?? stepBudget,
    proactiveRenderScale: performanceGovernor?.proactiveRenderScale ?? 1,
    bloomStrengthGuard: performanceGovernor?.bloomStrengthScale ?? 1,
    bloomThresholdGuard: performanceGovernor?.bloomThresholdOffset ?? 0,
    bloomGuardAllowed: performanceGovernor?.bloomAllowed ?? true,
    peakModalFieldAmplitude,
    avgOpacity,
    avgDensity,
    materialProbePhysicalDensity,
    materialProbeCausticVisibleDensity,
    materialProbeSupportVisibleDensity:
      materialProbeTransfer.supportVisibleDensity,
    materialProbePreBloomRadiance,
    materialProbePostBloomRisk,
    materialProbeBloomAmplification,
    opacityGain,
    earlyExitEnabled: true,
    earlyExitThreshold: EARLY_EXIT_TRANSMITTANCE_EPSILON,
    earlyExitRatio,
    stepBudget,
    transientEnergy,
    spectralCentroid: featureFrame?.spectralCentroid ?? 0,
    spectralFlux,
    beatDetected: featureFrame?.beatDetected ?? false,
    beatPulseId: featureFrame?.beatPulseId ?? 0,
    beatStrength: featureFrame?.beatStrength ?? 0,
    beatConfidence: featureFrame?.beatConfidence ?? 0,
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    modalCoefficientEnergy,
    modalResponseEnergy,
    modalResponseDiagnosticSourceCoupledEnergy:
      modalResponseEvidenceDiagnostics.sourceCoupledDiagnosticEnergy,
    modalResponseDiagnosticResonantEnergy:
      modalResponseEvidenceDiagnostics.resonantDiagnosticEnergy,
    modalStructuralDetailAuthority:
      structuralBodyBloomControls.modalStructuralDetailAuthority,
    structuralBodyBloomSuppression:
      structuralBodyBloomControls.structuralBodyBloomSuppression,
    observationEnergy: observationTransferDebug.observationEnergy,
    observationReferenceAnchor: observationTransferDebug.observationAnchor,
    observationReferenceSupport: observationTransferDebug.observationSupport,
    observationReferenceDensityFloor:
      observationTransferDebug.observedDensityFloor,
    observationReferenceContourSupport:
      observationTransferDebug.observedContourSupport,
    observationSampledAnchor: sampledObservationTransferDebug.observationAnchor,
    observationSampledSignedAuthority: sampledObservationSignedAuthority,
    observationSampledSupport:
      sampledObservationTransferDebug.observationSupport,
    observationSampledDensityFloor:
      sampledObservationTransferDebug.observedDensityFloor,
    observationSampledContourSupport:
      sampledObservationTransferDebug.observedContourSupport,
    observationDensityFadeStart: observationParameters.densityFadeStart,
    observationDensityFadeEnd: observationParameters.densityFadeEnd,
    observationTransferGain: observationParameters.transferGain,
    observationDensityFloor: observationParameters.densityFloor,
    observationContourSupportScale: observationParameters.contourSupportScale,
    observationExposureScale: observationParameters.exposureScale,
    observationFieldNoiseFloor: observationParameters.fieldNoiseFloor,
    observationHardSilence,
    modalPhaseAuthority,
    projectionEnergyBudgetSourceCoupled:
      featureFrame?.debug?.projectionEnergyBudgetSourceCoupled ?? 0,
    projectionEnergyBudgetResonant:
      featureFrame?.debug?.projectionEnergyBudgetResonant ?? 0,
    projectionEnergyUsedSourceCoupled:
      featureFrame?.debug?.projectionEnergyUsedSourceCoupled ?? 0,
    projectionEnergyUsedResonant:
      featureFrame?.debug?.projectionEnergyUsedResonant ?? 0,
    projectionRawEnergySourceCoupled:
      featureFrame?.debug?.projectionRawEnergySourceCoupled ?? 0,
    projectionRawEnergyResonant:
      featureFrame?.debug?.projectionRawEnergyResonant ?? 0,
    projectionAllocatedEnergySourceCoupled:
      featureFrame?.debug?.projectionAllocatedEnergySourceCoupled ?? 0,
    projectionAllocatedEnergyResonant:
      featureFrame?.debug?.projectionAllocatedEnergyResonant ?? 0,
    projectionEnergyScaleSourceCoupled:
      featureFrame?.debug?.projectionEnergyScaleSourceCoupled ?? 0,
    projectionEnergyScaleResonant:
      featureFrame?.debug?.projectionEnergyScaleResonant ?? 0,
    projectionOverlapPressureSourceCoupled:
      featureFrame?.debug?.projectionOverlapPressureSourceCoupled ?? 0,
    projectionOverlapPressureResonant:
      featureFrame?.debug?.projectionOverlapPressureResonant ?? 0,
    projectionCompetitionReduction:
      featureFrame?.debug?.projectionCompetitionReduction ?? 0,
    projectionLoad: featureFrame?.debug?.projectionLoad ?? 0,
    projectionHighQProtection:
      featureFrame?.debug?.projectionHighQProtection ?? 0,
    projectionEnergyNormalizationApplied:
      featureFrame?.debug?.projectionEnergyNormalizationApplied === true,
    highQPhaseAuthority: featureFrame?.debug?.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: featureFrame?.debug?.lowQPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      featureFrame?.debug?.modalPhaseCoherentFieldModeCount ?? 0,
    modeCoherence: featureFrame?.modeCoherence ?? 0,
    trebleTonalEnergy: featureFrame?.trebleTonalEnergy ?? 0,
    trebleBroadbandEnergy: featureFrame?.trebleBroadbandEnergy ?? 0,
    totalSlotAmplitude,
    spectralBandEnergies: featureFrame?.spectralBandEnergies
      ? Array.from(featureFrame.spectralBandEnergies)
      : null,
    responseEnvelope: runtimeState.responseEnvelope ?? 0,
    motionSignal: runtimeState.motionSignal ?? 0,
    scaleSignal: runtimeState.scaleSignal ?? 0,
    bloomResponseSignal: runtimeState.bloomResponseSignal ?? 0,
    visualScale: runtimeState.visualRoot?.scale?.x ?? 1,
    stepReference,
    stepCompensation,
    lowStepBloomGuard,
    rimBloomBias,
    rimCompression,
    holographicIntensity,
    holographicShift,
    holographicFresnelPower,
    bloomResponseBias,
    effectiveBloomStrength,
    effectiveBloomRadius,
    effectiveBloomThreshold,
    bloomRisk,
    effectiveThreshold: runtimeState.uniforms.uThreshold?.value ?? 0,
    effectiveContourSharpness:
      runtimeState.uniforms.uContourSharpness?.value ?? 0,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    boundaryMaterialMode:
      runtimeState.volumeMesh?.userData?.raymarchBoundaryMode ?? boundaryMode,
    materialCavityGeometry:
      runtimeState.volumeMesh?.userData?.raymarchCavityGeometry ??
      effectiveCavityGeometry,
    spectralLightEvaluationMode:
      runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ??
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    spectralLightImplementationState: "pending-lane-architecture",
    modalBasisCacheActive: modalBasisCache?.active ?? false,
    modalBasisCacheResolution: basisIdentity.resolution,
    modalBasisCacheRebuildCount: modalBasisCache?.rebuildCount ?? 0,
    modalBasisCacheRebuildReason:
      modalBasisCache?.lastRebuildReason ?? "uninitialized",
    modalBasisCacheGeneration: modalBasisCache?.generation ?? 0,
    modalBasisCacheMode: modalBasisCache?.mode ?? "off",
    modalBasisCacheAgeMs,
    modalBasisCacheDiagnosticReason:
      modalBasisCacheDescriptorStaleReason ??
      modalBasisCache?.lastRebuildReason ??
      "uninitialized",
    modalBasisAtlasDepth: basisIdentity.basisAtlasDepth,
    liveSynthesisModeCount: basisIdentity.liveSynthesisModeCount,
    liveModalFrameAgeMs: null,
    liveFieldProjectionCacheActive: liveFieldProjectionCache?.active ?? false,
    liveFieldProjectionCacheReady: liveFieldProjectionCache?.ready ?? false,
    liveFieldProjectionCacheBackend:
      liveFieldProjectionCache?.backend ?? "compute",
    liveFieldProjectionCacheResolution:
      liveFieldProjectionCache?.resolution ?? null,
    liveFieldProjectionCacheLastError:
      liveFieldProjectionCache?.lastError ?? null,
    liveFieldProjectionCacheLastComputeReason:
      liveFieldProjectionCache?.lastComputeReason ?? "uninitialized",
    liveFieldProjectionCacheComputedAtSec:
      liveFieldProjectionCache?.lastComputedAtSec ?? null,
    modalBasisCacheDescriptorFresh,
    modalBasisCacheDescriptorStaleReason,
    modalBasisCacheQueuedDescriptorPending: Boolean(
      modalBasisCache?.queuedDescriptor,
    ),
    modalBasisCacheQueuedDescriptorAgeMs,
    modalBasisCacheBackend: modalBasisCache?.backend ?? "compute",
    modalBasisCacheReady: modalBasisCache?.ready ?? false,
    modalBasisCacheRebuildPending: modalBasisCache?.rebuildPending ?? false,
    modalBasisCacheFailedClosed: modalBasisDisplayAuthority.failedClosed,
    modalBasisCacheLastError: modalBasisCache?.lastError ?? null,
    modalBasisCacheDrawable,
    modalBasisCacheDrawableState:
      modalBasisCacheDrawableAuthority.state ?? "modal-basis-cache-absent",
    modalBasisCacheDrawableBlockedReason:
      modalBasisCacheDrawableAuthority.blockedReason ?? null,
    modalBasisCacheDrawableStaleReason:
      modalBasisCacheDrawableAuthority.staleReason ?? null,
    modalBasisDisplayCoherent: modalBasisDisplayAuthority.coherent,
    modalBasisDisplayFailedClosed: modalBasisDisplayAuthority.failedClosed,
    modalBasisDisplayBlockedReason: modalBasisDisplayAuthority.blockedReason,
    modalBasisCacheStaleWhileRebuilding:
      modalBasisCacheDrawableAuthority.staleWhileRebuilding === true,
    modalBasisCacheModeCount,
    modalBasisCacheSemantic,
    modalBasisCacheSupportReady,
    modalBasisCacheSupportSemantic,
    modalBasisCachePhaseAuthority,
    modalBasisCacheModeIdentityRetentionRatio:
      basisIdentity.modeIdentityRetentionRatio,
    modalBasisCacheMaxRepresentableModeIndex,
    modalBasisCacheContributingModeCount,
    modalBasisCacheZeroAmplitudeSkippedModeCount,
    modalBasisCacheContributingRawModalEnergy,
    modalBasisCacheBandwidthRejectedModeCount,
    modalBasisCacheBandwidthRejectedRawModalEnergy,
    modalBasisCacheContributingStructuralModalEnergy,
    modalBasisCacheBandwidthRejectedStructuralModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio,
    liveSynthesisResolvedStructuralModalEnergyRatio,
    liveSynthesisRawGradientEnvelope,
    liveSynthesisStructuralGradientEnvelope,
    liveSynthesisUnsignedSupportMean,
    liveSynthesisCancellationRatioMean,
    liveSynthesisCancellationRatioMax,
    liveSynthesisSupportDiagnosticSampleCount,
    liveSynthesisSupportDiagnosticSupportedSampleCount,
    liveSynthesisSupportDiagnosticCoverage,
    spectralMix: runtimeState.uniforms.uSpectralMix?.value ?? 0,
    holographicReferenceStrength,
    avgRaySegmentLength,
    missRatio,
    avgSilhouetteSuppression,
    primaryLightIntensity,
    secondaryLightIntensity,
    sceneLightAsymmetry: deriveLightAsymmetry(
      primaryLightIntensity,
      secondaryLightIntensity,
    ),
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
    idleLogoSuppressedForLive: runtimeState.idleLogoSuppressedForLive === true,
  };
}

function updateReactiveResponse(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
  deltaTime,
) {
  const rt = runtimeState.reactivityTuning;
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const uploadedModeCount = Math.max(
    0,
    Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    uploadedModeCount,
  );
  const modalResponseEnergy = clamp01(
    Math.max(
      featureFrame?.modalResponseEnergy ??
        featureFrame?.modalResponseRenderEnergy ??
        featureFrame?.debug?.modalResponseEnergy ??
        0,
      structuralProjection.projectionEnergyDrive,
    ),
  );
  const reactivity = Math.max(
    0,
    rt?.reactivity ?? REACTIVITY_DEFAULTS.reactivity,
  );
  if (!renderAuthority) {
    runtimeState.responseEnvelope = 0;
    runtimeState.accentEnvelope = 0;
    runtimeState.motionSignal = 0;
    runtimeState.scaleSignal = 0;
    runtimeState.bloomResponseSignal = 0;
    runtimeState.visibilityDriveEnvelope = 0;
    runtimeState.visualRoot?.scale?.setScalar?.(1);
    return;
  }

  const presentationSignalScale = 1;
  const rhythmicDensity = clamp01(featureFrame?.rhythmicDensity ?? 0);
  const gatedStructureSignal = clamp01(
    structureSignal * reactivity * presentationSignalScale,
  );
  const gatedEnergySignal = clamp01(
    energySignal * reactivity * presentationSignalScale,
  );
  const gatedChangeSignal = clamp01(
    changeSignal * reactivity * presentationSignalScale,
  );
  const gatedPulseSignal = clamp01(
    pulseSignal * reactivity * presentationSignalScale,
  );
  const gatedModalResponseEnergy = clamp01(
    modalResponseEnergy * reactivity * presentationSignalScale,
  );
  const decayReleaseMask = deriveDecayReleaseMask({
    fieldState,
    gatedStructureSignal,
    gatedEnergySignal,
    gatedChangeSignal,
  });
  const envelopeTarget = renderAuthority
    ? clamp01(
        gatedStructureSignal *
          0.34 *
          (1 - decayReleaseMask * DECAY_RELEASE_TARGET_REDUCTION) +
          gatedEnergySignal * 0.38 +
          gatedChangeSignal * 0.23 +
          gatedModalResponseEnergy * 0.48,
      )
    : 0;
  const responseEnvelope = damp(
    runtimeState.responseEnvelope ?? 0,
    envelopeTarget,
    envelopeTarget > (runtimeState.responseEnvelope ?? 0)
      ? RESPONSE_ATTACK
      : renderAuthority
        ? RESPONSE_RELEASE *
          (1 +
            rhythmicDensity * RHYTHMIC_RELEASE_RATE_GAIN +
            decayReleaseMask * DECAY_RELEASE_RATE_GAIN)
        : RESPONSE_IDLE_RELEASE,
    deltaTime,
  );
  const accentTarget = renderAuthority
    ? clamp01(gatedChangeSignal * 0.74 + gatedPulseSignal * 0.42)
    : 0;
  const accentEnvelope = damp(
    runtimeState.accentEnvelope ?? 0,
    accentTarget,
    accentTarget > (runtimeState.accentEnvelope ?? 0)
      ? ACCENT_ATTACK
      : ACCENT_RELEASE,
    deltaTime,
  );
  const scaleSignal = clamp01(
    responseEnvelope * 0.56 +
      gatedEnergySignal * 0.24 +
      accentEnvelope * 0.14 +
      gatedStructureSignal * 0.06 +
      gatedModalResponseEnergy * 0.08,
  );
  const bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      gatedStructureSignal * 0.2 +
      gatedModalResponseEnergy * 0.08,
  );

  runtimeState.responseEnvelope = responseEnvelope;
  runtimeState.accentEnvelope = accentEnvelope;
  runtimeState.motionSignal = clamp01(
    gatedChangeSignal * 0.62 + accentEnvelope * 0.22 + gatedEnergySignal * 0.16,
  );
  runtimeState.scaleSignal = scaleSignal;
  runtimeState.bloomResponseSignal = bloomResponseSignal;
  runtimeState.visualRoot?.scale?.setScalar?.(1);
}

function updateLaserResponse(runtimeState, featureFrame) {
  const uniforms = runtimeState.uniforms;
  const baseThreshold =
    runtimeState.baseThreshold ?? uniforms.uThreshold?.value ?? 0.001;
  const baseContourSharpness =
    runtimeState.baseContourSharpness ?? uniforms.uContourSharpness?.value ?? 1;
  const baseBloomStrength =
    runtimeState.bloomTuning?.baseStrength ??
    runtimeState.bloomTuning?.effectiveStrength ??
    0;
  const baseBloomRadius =
    runtimeState.bloomTuning?.baseRadius ??
    runtimeState.bloomTuning?.effectiveRadius ??
    0;
  const baseBloomThreshold =
    runtimeState.bloomTuning?.baseThreshold ??
    runtimeState.bloomTuning?.effectiveThreshold ??
    0;
  const reactiveGate = clamp01(runtimeState.reactivityTuning?.reactivity ?? 1);
  const transientEnergy =
    clamp01(featureFrame?.transientEnergy ?? 0) * reactiveGate;
  const rawChangeSignal =
    clamp01(featureFrame?.changeSignal ?? 0) * reactiveGate;
  const rawPulseSignal = clamp01(featureFrame?.pulseSignal ?? 0) * reactiveGate;
  const responseEnvelope = clamp01(runtimeState.responseEnvelope ?? 0);
  const accentEnvelope = clamp01(runtimeState.accentEnvelope ?? 0);
  const bloomResponseSignal = clamp01(runtimeState.bloomResponseSignal ?? 0);
  const thresholdResponse = clamp01(
    responseEnvelope * 0.24 +
      accentEnvelope * 0.58 +
      bloomResponseSignal * 0.22 +
      transientEnergy * 0.18,
  );
  const bloomStrengthPulse = clamp01(
    accentEnvelope * 0.84 + transientEnergy * 0.4,
  );
  const bloomThresholdPulse = clamp01(
    accentEnvelope * 0.2 +
      rawChangeSignal * 0.34 +
      rawPulseSignal * 0.24 +
      transientEnergy * 0.18 +
      bloomResponseSignal * 0.04,
  );
  const bloomStrengthTransientGate = 0.94 + transientEnergy * 0.06;
  const structuralBodyBloomControls = deriveStructuralBodyBloomControls(
    runtimeState,
    transientEnergy,
  );

  setIfChanged(
    uniforms.uThreshold,
    Math.max(
      0.001,
      baseThreshold * (1 - thresholdResponse * THRESHOLD_RESPONSE_REDUCTION),
    ),
  );
  setIfChanged(uniforms.uContourSharpness, clamp(baseContourSharpness, 1, 8));
  const bt = runtimeState.bloomTuning;
  const performanceGovernor = runtimeState.performanceGovernor ?? null;
  const bloomStrengthScale = performanceGovernor?.bloomStrengthScale ?? 1;
  const bloomThresholdOffset = performanceGovernor?.bloomThresholdOffset ?? 0;
  const bloomAllowed = performanceGovernor?.bloomAllowed ?? true;
  bt.effectiveStrength =
    baseBloomStrength *
    (1 + bloomStrengthPulse * BLOOM_STRENGTH_RESPONSE_GAIN) *
    bloomStrengthScale *
    bloomStrengthTransientGate *
    structuralBodyBloomControls.bloomStrengthScale;
  bt.effectiveRadius = Math.max(
    0,
    baseBloomRadius * (1 - bloomStrengthPulse * BLOOM_RADIUS_RESPONSE_GAIN),
  );
  bt.effectiveThreshold = clamp(
    baseBloomThreshold +
      bloomThresholdPulse * BLOOM_THRESHOLD_RESPONSE_GAIN +
      bloomThresholdOffset +
      structuralBodyBloomControls.bloomThresholdLift,
    0,
    1,
  );
  bt.bloomAllowed = bloomAllowed;
  bt.modalStructuralDetailAuthority =
    structuralBodyBloomControls.modalStructuralDetailAuthority;
  bt.structuralBodyBloomSuppression =
    structuralBodyBloomControls.structuralBodyBloomSuppression;
}

function getRaymarchUploadState(runtimeState) {
  if (!runtimeState.raymarchUploadState) {
    runtimeState.raymarchUploadState = {
      modalField: null,
      modalFieldPhase: null,
      modalFieldCoefficient: null,
      modalFieldSpectral: null,
      modalFieldRole: null,
    };
  }

  return runtimeState.raymarchUploadState;
}

function buildLayerUploadSignature({
  slots,
  colorSlots,
  spectralSlots,
  layer,
  includeColors,
  includeSpectral,
}) {
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const activeCount = Math.min(
    Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
    capacity,
  );
  let slotHash = FNV_OFFSET_BASIS;
  let colorHash = includeColors ? FNV_OFFSET_BASIS : 0;
  let spectralHash = includeSpectral ? FNV_OFFSET_BASIS : 0;

  for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    slotHash = hashUint32(slotIndex, slotHash);
    slotHash = hashSlot4(slots, sourceOffset, slotHash);
    if (includeColors) {
      colorHash = hashUint32(slotIndex, colorHash);
      colorHash = hashSlot4(colorSlots, sourceOffset, colorHash);
    }
    if (includeSpectral) {
      spectralHash = hashUint32(slotIndex, spectralHash);
      spectralHash = hashSlot4(spectralSlots, sourceOffset, spectralHash);
    }
  }

  return {
    capacity,
    activeCount,
    includeColors: Boolean(includeColors),
    includeSpectral: Boolean(includeSpectral),
    slotHash: slotHash >>> 0,
    colorHash: colorHash >>> 0,
    spectralHash: spectralHash >>> 0,
  };
}

function layerModeUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.slotHash !== next.slotHash
  );
}

function layerColorUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.includeColors !== next.includeColors ||
    previous.colorHash !== next.colorHash
  );
}

function layerSpectralUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.includeSpectral !== next.includeSpectral ||
    previous.spectralHash !== next.spectralHash
  );
}

function applyLayerUploadIfChanged({
  uploadState,
  key,
  slots,
  colorSlots,
  spectralSlots,
  targetSlots,
  targetColorSlots,
  targetSpectralSlots,
  modeBufferNode,
  colorBufferNode,
  spectralBufferNode,
  layer,
  includeColors,
  includeSpectral,
}) {
  const signature = buildLayerUploadSignature({
    slots,
    colorSlots,
    spectralSlots,
    layer,
    includeColors,
    includeSpectral,
  });
  const previous = uploadState[key]?.signature ?? null;
  const modeChanged = layerModeUploadSignatureChanged(previous, signature);
  const colorChanged = layerColorUploadSignatureChanged(previous, signature);
  const spectralChanged = layerSpectralUploadSignatureChanged(
    previous,
    signature,
  );

  if (modeChanged || colorChanged || spectralChanged) {
    copyLayerUpload({
      slots,
      colorSlots,
      targetSlots,
      targetColorSlots,
      layer,
      includeColors,
    });
    copyLayerSpectralUpload({
      spectralSlots,
      targetSpectralSlots,
      layer,
      includeSpectral,
    });
    if (modeChanged) {
      modeBufferNode.value.needsUpdate = true;
    }
    if (
      includeColors &&
      colorBufferNode?.value &&
      (colorChanged || modeChanged)
    ) {
      colorBufferNode.value.needsUpdate = true;
    }
    if (
      includeSpectral &&
      spectralBufferNode?.value &&
      (spectralChanged || modeChanged)
    ) {
      spectralBufferNode.value.needsUpdate = true;
    }
    uploadState[key] = { signature };
  }

  return signature;
}

function buildPhaseUploadSignature({ phaseSlots, layer, capacity }) {
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  const activeCount = Math.min(
    Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
    resolvedCapacity,
  );
  const phaseSignature = buildRaymarchPhaseSlotSignature({
    phaseSlots,
    activeCount,
    includeSlotIndex: true,
  });

  return {
    capacity: resolvedCapacity,
    activeCount,
    activePhaseCount: phaseSignature.activePhaseCount,
    slotHash: phaseSignature.slotHash,
  };
}

function phaseUploadSignatureEquals(previous, next) {
  return Boolean(
    previous &&
    previous.capacity === next.capacity &&
    previous.activeCount === next.activeCount &&
    previous.activePhaseCount === next.activePhaseCount &&
    previous.slotHash === next.slotHash,
  );
}

function applyLayerPhaseUploadIfChanged({
  uploadState,
  key,
  phaseSlots,
  targetPhaseSlots,
  phaseBufferNode,
  layer,
  capacity,
}) {
  if (!targetPhaseSlots || !layer) {
    uploadState[key] = null;
    return 0;
  }

  const signature = buildPhaseUploadSignature({
    phaseSlots,
    layer,
    capacity,
  });
  const previous = uploadState[key]?.signature ?? null;
  if (phaseUploadSignatureEquals(previous, signature)) {
    return uploadState[key]?.activeCount ?? 0;
  }

  const activeCount = copyLayerPhaseUpload({
    phaseSlots,
    targetPhaseSlots,
    layer,
    capacity,
  });
  if (phaseBufferNode?.value) {
    phaseBufferNode.value.needsUpdate = activeCount > 0;
  }
  uploadState[key] = {
    signature,
    activeCount,
  };
  return activeCount;
}

function copyLayerUpload({
  slots,
  colorSlots,
  targetSlots,
  targetColorSlots,
  layer,
  includeColors,
}) {
  copyModalField({
    sourceSlots: slots,
    sourceColorSlots: colorSlots,
    targetSlots,
    targetColorSlots,
    capacity: layer.capacity,
    includeColors,
  });
}

function copyLayerSpectralUpload({
  spectralSlots,
  targetSpectralSlots,
  layer,
  includeSpectral,
}) {
  if (!targetSpectralSlots) {
    return;
  }
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const targetLength = capacity * 4;
  targetSpectralSlots.fill(0, 0, targetLength);
  if (!includeSpectral) {
    return;
  }
  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    targetSpectralSlots[offset] = spectralSlots?.[offset] ?? 0;
    targetSpectralSlots[offset + 1] = spectralSlots?.[offset + 1] ?? 0;
    targetSpectralSlots[offset + 2] = spectralSlots?.[offset + 2] ?? 0;
    targetSpectralSlots[offset + 3] = spectralSlots?.[offset + 3] ?? 0;
  }
}

function copyLayerPhaseUpload({
  phaseSlots,
  targetPhaseSlots,
  layer,
  capacity,
}) {
  if (!targetPhaseSlots || !layer) {
    return 0;
  }
  return copyCanonicalRaymarchPhaseSlots({
    sourceSlots: phaseSlots,
    targetSlots: targetPhaseSlots,
    capacity,
  });
}

function applyLayerCoefficientUpload({
  modeSlots,
  targetCoefficientSlots,
  coefficientBufferNode,
  layer,
  capacity,
}) {
  if (!targetCoefficientSlots || !layer) {
    return 0;
  }

  const activeCount = copyCanonicalRaymarchStructuralCoefficients({
    modeSlots,
    targetSlots: targetCoefficientSlots,
    capacity,
    activeCount: layer.uploadedActiveCount,
  });
  if (coefficientBufferNode?.value) {
    coefficientBufferNode.value.needsUpdate = activeCount > 0;
  }
  return activeCount;
}

function resolveRequestedRaymarchStepBudget(runtimeState, volumeMesh) {
  return (
    runtimeState.effectiveRaymarchSteps ??
    runtimeState.requestedRaymarchSteps ??
    volumeMesh.material.steps
  );
}

function updateModalBasisCache(
  runtimeState,
  renderer,
  { modalFieldCapacity, schedulerTimeSec = null },
  { modalBasisCacheDescriptor },
) {
  const modalBasisCache = runtimeState.modalBasisCache;
  if (!runtimeState.volumeMesh) {
    setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return "unavailable";
  }

  if (!modalBasisCache) {
    setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return "unavailable";
  }

  modalBasisCache.active = true;
  modalBasisCache.mode = "modal-basis-cached";

  const descriptorBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(
      modalBasisCacheDescriptor,
    );
  if (descriptorBlockedReason) {
    blockModalBasisCacheForDescriptor(modalBasisCache, descriptorBlockedReason);
    const drawableAuthority = setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return drawableAuthority.drawable ? "modal-basis-cached" : "unavailable";
  }

  const { needsRebuild, reason } = shouldRebuildRaymarchModalBasisCache(
    modalBasisCache,
    modalBasisCacheDescriptor,
  );

  if (needsRebuild) {
    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      modalBasisCacheDescriptor,
      reason,
      {
        modalFieldModeBuffer: runtimeState.modalFieldModeBuffer,
        modalFieldPhaseBuffer: runtimeState.modalFieldPhaseBuffer,
        modalFieldCapacity,
        uniforms: runtimeState.uniforms,
        schedulerTimeSec,
      },
    );
  }

  const drawableAuthority = setModalBasisCacheDrawableAuthority(
    runtimeState,
    resolveRaymarchModalBasisCacheDrawableAuthority(
      modalBasisCache,
      modalBasisCacheDescriptor,
    ),
  );

  if (drawableAuthority.drawable) {
    return "modal-basis-cached";
  }
  return "unavailable";
}

function resolveCacheTextureCopyRegion(cache) {
  const sourceData =
    cache?.pendingTexture?.source?.data ?? cache?.pendingTexture?.image ?? {};
  const width = Math.max(
    1,
    Math.round(sourceData.width ?? cache?.resolution ?? 1),
  );
  const height = Math.max(
    1,
    Math.round(sourceData.height ?? cache?.resolution ?? width),
  );
  const depth = Math.max(
    1,
    Math.round(sourceData.depth ?? cache?.depth ?? cache?.resolution ?? width),
  );
  return new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(width, height, depth),
  );
}

function copyPendingCacheTextureToActive(renderer, cache) {
  const texturePairs = [
    ["pendingTexture", "texture"],
    ...(cache?.pendingCausticTexture || cache?.causticTexture
      ? [["pendingCausticTexture", "causticTexture"]]
      : []),
  ];
  if (!cache || texturePairs.length <= 0) {
    return false;
  }
  if (typeof renderer?.copyTextureToTexture !== "function") {
    cache.lastError = "renderer-copy-unavailable";
    cache.lastRebuildReason = "copy-unavailable";
    return false;
  }

  for (const [pendingKey, activeKey] of texturePairs) {
    const pendingTexture = cache[pendingKey];
    const activeTexture = cache[activeKey];
    if (!pendingTexture || !activeTexture) {
      cache.lastError = "cache-texture-missing";
      cache.lastRebuildReason = "texture-missing";
      return false;
    }
    if (pendingTexture === activeTexture) {
      cache.lastError = "cache-texture-alias";
      cache.lastRebuildReason = "texture-alias";
      return false;
    }
  }

  const copyRegion = resolveCacheTextureCopyRegion(cache);
  for (const [pendingKey, activeKey] of texturePairs) {
    renderer.copyTextureToTexture(
      cache[pendingKey],
      cache[activeKey],
      copyRegion,
      new THREE.Vector3(0, 0, 0),
      0,
      0,
    );
  }
  return true;
}

function resolveSpectralLightEvaluationMode(
  runtimeState,
  { spectralLightEnabled },
) {
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
}

function updateRaymarchEvaluationModes(
  runtimeState,
  renderer,
  capacities,
  { spectralLightEnabled, modalBasisCacheDescriptor },
) {
  if (!runtimeState.volumeMesh) {
    return;
  }

  updateModalBasisCache(runtimeState, renderer, capacities, {
    modalBasisCacheDescriptor,
  });
  reconcileReadyModalBasisRenderPacket(
    runtimeState,
    renderer,
    modalBasisCacheDescriptor,
  );

  const spectralLightEvaluationMode = resolveSpectralLightEvaluationMode(
    runtimeState,
    { spectralLightEnabled },
  );
  setRaymarchSpectralLightEvaluationMode(
    runtimeState.volumeMesh,
    spectralLightEvaluationMode,
  );
}

function updateLiveFieldProjectionCache(
  runtimeState,
  renderer,
  { modalFieldCapacity, time },
) {
  const liveFieldProjectionCache = runtimeState.liveFieldProjectionCache;
  const modalBasisCache = runtimeState.modalBasisCache;
  const modalBasisCacheDrawableAuthority =
    runtimeState.modalBasisCacheDrawableAuthority;
  const modalBasisCacheDrawable =
    modalBasisCacheDrawableAuthority?.drawable === true;
  if (modalBasisCacheDrawableAuthority?.staleWhileRebuilding === true) {
    const retained = retainCommittedLiveFieldProjectionCache(runtimeState);
    if (retained) {
      return {
        computed: false,
        reason: LIVE_FIELD_PROJECTION_STALE_RETAINED_REASON,
        retained: true,
      };
    }
    deactivateLiveFieldProjectionCache(
      runtimeState,
      LIVE_FIELD_PROJECTION_STALE_WITHOUT_COMMITTED_REASON,
    );
    return {
      computed: false,
      reason: LIVE_FIELD_PROJECTION_STALE_WITHOUT_COMMITTED_REASON,
      retained: false,
    };
  }
  if (
    !liveFieldProjectionCache ||
    !modalBasisCacheDrawable ||
    modalBasisCache?.ready !== true ||
    !runtimeState.volumeMesh?.userData?.raymarchModalBasisAtlasTexture ||
    !runtimeState.modalFieldCoefficientBuffer
  ) {
    deactivateLiveFieldProjectionCache(
      runtimeState,
      modalBasisCacheDrawable ? "modal-basis-cache-not-ready" : "not-drawable",
    );
    return { computed: false, reason: "not-ready" };
  }

  const result = computeRaymarchLiveFieldProjectionCache(
    liveFieldProjectionCache,
    renderer,
    {
      modalBasisAtlasTexture:
        runtimeState.volumeMesh.userData.raymarchModalBasisAtlasTexture,
      modalFieldCoefficientBuffer: runtimeState.modalFieldCoefficientBuffer,
      modalFieldPhaseBuffer: runtimeState.modalFieldPhaseBuffer,
      modalFieldCapacity,
      uniforms: runtimeState.uniforms,
      schedulerTimeSec: time,
    },
  );
  setIfChanged(
    runtimeState.uniforms.uLiveFieldCacheActive,
    result.computed ? 1 : 0,
  );
  return result;
}

function readModalResponseEnergy(featureFrame) {
  return (
    featureFrame?.modalResponseEnergy ??
    featureFrame?.modalResponseRenderEnergy ??
    featureFrame?.debug?.modalResponseEnergy ??
    0
  );
}

function snapshotActiveModalRenderPacket(runtimeState, featureFrame) {
  const activeModeCount = Math.max(
    0,
    Math.floor(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  return {
    generationId:
      (runtimeState?.activeModalRenderPacket?.generationId ?? 0) + 1,
    descriptor: runtimeState.currentModalBasisCacheDescriptor ?? null,
    spectralLightDescriptor:
      runtimeState.currentSpectralLightDescriptor ?? null,
    descriptorIdentityHash:
      runtimeState.currentModalBasisCacheDescriptor?.identitySetHash ?? null,
    identityPageAssignmentHash:
      runtimeState.currentModalBasisCacheDescriptor
        ?.identityPageAssignmentHash ?? null,
    modalFieldModeBuffer: snapshotBufferArray(
      runtimeState.modalFieldModeBuffer,
    ),
    modalFieldColorBuffer: snapshotBufferArray(
      runtimeState.modalFieldColorBuffer,
    ),
    modalFieldPhaseBuffer: snapshotBufferArray(
      runtimeState.modalFieldPhaseBuffer,
    ),
    modalFieldCoefficientBuffer: snapshotBufferArray(
      runtimeState.modalFieldCoefficientBuffer,
    ),
    modalFieldModeCount: activeModeCount,
    modalBasisPhaseAuthorityModeCount:
      runtimeState.modalBasisPhaseAuthorityModeCount ?? 0,
    totalSlotAmplitude: runtimeState.uniforms?.uTotalSlotAmplitude?.value ?? 0,
    structuralProjectionDrive:
      runtimeState.uniforms?.uStructuralProjectionDrive?.value ?? 0,
    structuralProjectionConcentration:
      runtimeState.uniforms?.uStructuralProjectionConcentration?.value ?? 0,
    modalResponseEnergy: readModalResponseEnergy(featureFrame),
    performanceGovernor: runtimeState.performanceGovernor ?? null,
    spectralLightBuffersUploaded:
      runtimeState.spectralLightBuffersUploaded === true,
    auditDiagnostics: runtimeState.lastModalBasisAuditDiagnostics ?? null,
    status: "active",
    committedAtSec: runtimeState.uniforms?.uTime?.value ?? null,
  };
}

function restoreActiveModalRenderPacket(runtimeState, packet) {
  if (!runtimeState || !packet) {
    return false;
  }

  restoreBufferArray(
    runtimeState.modalFieldModeBuffer,
    packet.modalFieldModeBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldColorBuffer,
    packet.modalFieldColorBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldPhaseBuffer,
    packet.modalFieldPhaseBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldCoefficientBuffer,
    packet.modalFieldCoefficientBuffer,
  );
  runtimeState.performanceGovernor = packet.performanceGovernor ?? null;
  runtimeState.modalBasisPhaseAuthorityModeCount =
    packet.modalBasisPhaseAuthorityModeCount ?? 0;
  runtimeState.currentSpectralLightDescriptor =
    packet.spectralLightDescriptor ?? null;
  runtimeState.spectralLightBuffersUploaded =
    packet.spectralLightBuffersUploaded === true;
  applyModalBasisAuditDiagnostics(
    runtimeState,
    packet.auditDiagnostics ?? null,
  );
  setIfChanged(
    runtimeState.uniforms.uModalFieldModeCount,
    packet.modalFieldModeCount ?? 0,
  );
  setIfChanged(
    runtimeState.uniforms.uTotalSlotAmplitude,
    packet.totalSlotAmplitude ?? 0,
  );
  setIfChanged(
    runtimeState.uniforms.uStructuralProjectionDrive,
    packet.structuralProjectionDrive ?? 0,
  );
  setIfChanged(
    runtimeState.uniforms.uStructuralProjectionConcentration,
    packet.structuralProjectionConcentration ?? 0,
  );
  setIfChanged(
    runtimeState.uniforms.uModalResponseEnergy,
    packet.modalResponseEnergy ?? 0,
  );
  resetRaymarchUploadState(runtimeState);
  runtimeState.modalRenderPacketRetained = {
    activeGenerationId: packet.generationId,
    pendingDescriptorIdentityHash:
      runtimeState.currentModalBasisCacheDescriptor?.identitySetHash ?? null,
    pendingIdentityPageAssignmentHash:
      runtimeState.currentModalBasisCacheDescriptor
        ?.identityPageAssignmentHash ?? null,
    retainedAtSec: runtimeState.uniforms?.uTime?.value ?? null,
  };
  return true;
}

function syncModalRenderPacketState(runtimeState, featureFrame) {
  const drawableAuthority = runtimeState.modalBasisCacheDrawableAuthority;
  const displayAuthority = resolveRaymarchModalBasisDisplayAuthority(
    runtimeState,
    drawableAuthority,
  );
  if (
    drawableAuthority?.staleWhileRebuilding === true &&
    displayAuthority.coherent &&
    runtimeState.activeModalRenderPacket
  ) {
    restoreActiveModalRenderPacket(
      runtimeState,
      runtimeState.activeModalRenderPacket,
    );
    return;
  }

  runtimeState.modalRenderPacketRetained = null;
  if (
    displayAuthority.coherent &&
    drawableAuthority?.staleWhileRebuilding !== true &&
    hasCommittedLiveFieldProjectionCache(runtimeState)
  ) {
    runtimeState.activeModalRenderPacket = snapshotActiveModalRenderPacket(
      runtimeState,
      featureFrame,
    );
  }
}

function reconcileReadyModalBasisRenderPacket(
  runtimeState,
  renderer,
  descriptor,
) {
  const modalBasisCache = runtimeState?.modalBasisCache;
  if (!modalBasisCache?.pendingReady) {
    return false;
  }
  if (
    !isRaymarchModalBasisCachePendingReadyForDescriptor(
      modalBasisCache,
      descriptor,
    )
  ) {
    const queuedRenderer = modalBasisCache.queuedRequest?.renderer;
    if (
      modalBasisCache.queuedDescriptor &&
      typeof queuedRenderer?.computeAsync === "function"
    ) {
      discardRaymarchModalBasisCachePendingDescriptor(modalBasisCache);
      setModalBasisCacheDrawableAuthority(
        runtimeState,
        resolveRaymarchModalBasisCacheDrawableAuthority(
          modalBasisCache,
          descriptor,
        ),
      );
    }
    return false;
  }

  if (!copyPendingCacheTextureToActive(renderer, modalBasisCache)) {
    return false;
  }
  const result =
    commitRaymarchModalBasisCachePendingDescriptor(modalBasisCache);
  if (result.committed !== true) {
    return false;
  }

  setModalBasisCacheDrawableAuthority(
    runtimeState,
    resolveRaymarchModalBasisCacheDrawableAuthority(
      modalBasisCache,
      descriptor,
    ),
  );
  return true;
}

function applyRaymarchRuntimeUploadAuthority({
  runtimeState,
  featureFrame,
  renderer,
  time,
  uniforms,
  volumeMesh,
  modalDescriptor,
  modalFieldCapacity,
  modalFieldPhaseCapacity,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldSpectralBuffer,
  modalFieldPhaseBuffer,
  modalFieldCoefficientBuffer,
  spectralLightEnabled,
  effectiveCavityGeometry,
}) {
  const descriptorSlots = modalDescriptor.slotViews;
  const requestedStepBudget = resolveRequestedRaymarchStepBudget(
    runtimeState,
    volumeMesh,
  );
  const requestedRenderScale = 1;
  const productBasisAtlasPageCapacity =
    resolveProductBasisAtlasPageCapacity(runtimeState);
  const productUploadCapacity = Math.min(
    modalFieldCapacity,
    productBasisAtlasPageCapacity,
  );
  // The render loop is the integrator: it owns step/scale and publishes its
  // committed budget onto runtimeState. Build the governor inline from that
  // budget — step/scale adaptation off (requestedStepBudget is already the
  // effective budget, so re-reducing would double-dip) and the bloom guard fed
  // the effective step/scale the loop committed. Defaults are safe for
  // headless/OSR ticks that never ran the loop (bloom off, scale 1).
  const performanceGovernor = buildRaymarchPerformanceGovernor({
    modalFieldSlots: descriptorSlots.modalFieldSlots,
    modalFieldCapacity: productUploadCapacity,
    featureFrame,
    cavityGeometry: effectiveCavityGeometry,
    requestedStepBudget,
    requestedRenderScale,
    stepScaleAdaptationEnabled: false,
    bloomAdaptationEnabled: runtimeState.raymarchBloomAdaptationActive === true,
    effectiveStepBudget: requestedStepBudget,
    effectiveRenderScale: runtimeState.effectiveRenderScale ?? 1,
  });
  const modalFieldLayer = performanceGovernor.modalField;
  runtimeState.performanceGovernor = performanceGovernor;

  const uploadState = getRaymarchUploadState(runtimeState);
  applyLayerUploadIfChanged({
    uploadState,
    key: "modalField",
    slots: descriptorSlots.modalFieldSlots,
    colorSlots: descriptorSlots.modalFieldColorSlots,
    spectralSlots: descriptorSlots.modalFieldSpectralSlots,
    targetSlots: modalFieldModeBuffer.value.array,
    targetColorSlots: modalFieldColorBuffer.value.array,
    targetSpectralSlots: modalFieldSpectralBuffer?.value?.array ?? null,
    modeBufferNode: modalFieldModeBuffer,
    colorBufferNode: modalFieldColorBuffer,
    spectralBufferNode: modalFieldSpectralBuffer,
    layer: modalFieldLayer,
    includeColors: spectralLightEnabled,
    includeSpectral: spectralLightEnabled,
  });

  const modalFieldPhaseAuthorityModeCount = applyLayerPhaseUploadIfChanged({
    uploadState,
    key: "modalFieldPhase",
    phaseSlots: descriptorSlots.modalFieldPhaseSlots,
    targetPhaseSlots: modalFieldPhaseBuffer?.value?.array ?? null,
    phaseBufferNode: modalFieldPhaseBuffer,
    layer: modalFieldLayer,
    capacity: Math.min(modalFieldPhaseCapacity, productUploadCapacity),
  });
  runtimeState.modalBasisPhaseAuthorityModeCount =
    modalFieldPhaseAuthorityModeCount;
  applyLayerCoefficientUpload({
    modeSlots: modalFieldModeBuffer?.value?.array,
    targetCoefficientSlots: modalFieldCoefficientBuffer?.value?.array ?? null,
    coefficientBufferNode: modalFieldCoefficientBuffer,
    layer: modalFieldLayer,
    capacity: productUploadCapacity,
  });

  const modalFieldModeCount = modalFieldLayer.uploadedActiveCount;
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    modalFieldModeCount,
  );
  setIfChanged(uniforms.uModalFieldModeCount, modalFieldModeCount);
  setIfChanged(uniforms.uTotalSlotAmplitude, structuralProjection.amplitudeSum);
  setRaymarchStructuralProjectionUniforms(uniforms, structuralProjection);

  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const descriptorRadius = runtimeState.uniforms.uRadius?.value ?? 1;
  const modalBasisCacheDescriptor = buildRaymarchModalBasisCacheDescriptor({
    modalFieldSlots: modalFieldModeBuffer?.value?.array,
    modalFieldPhaseSlots: modalFieldPhaseBuffer?.value?.array,
    modalFieldCount: modalFieldModeCount,
    boundaryMode,
    cavityGeometry: effectiveCavityGeometry,
    radius: descriptorRadius,
    time,
    phaseModeCount: runtimeState.modalBasisPhaseAuthorityModeCount,
    phaseAuthority: featureFrame?.modalPhaseAuthority ?? 0,
    descriptorOverflow: modalDescriptor.diagnostics.descriptorOverflow,
    modeIdentityRetentionRatio:
      modalDescriptor.diagnostics.modeIdentityRetentionRatio,
    resolution:
      runtimeState.modalBasisCache?.resolution ??
      RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
    basisCapacity: runtimeState.modalBasisCache?.basisCapacity,
    basisPacking: runtimeState.modalBasisCache?.basisPacking,
  });

  applyModalBasisAuditDiagnostics(
    runtimeState,
    runtimeState.auditEnabled
      ? buildModalBasisAuditDiagnostics({
          modalFieldSlots: modalFieldModeBuffer?.value?.array,
          modalFieldPhaseSlots: modalFieldPhaseBuffer?.value?.array,
          modalFieldCount: modalFieldModeCount,
          boundaryMode,
          cavityGeometry: effectiveCavityGeometry,
          radius: descriptorRadius,
          resolution:
            runtimeState.modalBasisCache?.resolution ??
            RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
        })
      : null,
  );

  runtimeState.currentModalBasisCacheDescriptor = modalBasisCacheDescriptor;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  const normalizedCavityGeometry = normalizeCavityGeometry(
    effectiveCavityGeometry,
  );
  if (
    runtimeState.volumeMesh?.userData?.raymarchCavityGeometry !==
    normalizedCavityGeometry
  ) {
    setRaymarchCavityGeometry(
      runtimeState.volumeMesh,
      normalizedCavityGeometry,
    );
  }
  updateRaymarchEvaluationModes(
    runtimeState,
    renderer,
    {
      modalFieldCapacity,
      schedulerTimeSec: time,
    },
    {
      spectralLightEnabled,
      modalBasisCacheDescriptor,
    },
  );
  updateLiveFieldProjectionCache(runtimeState, renderer, {
    modalFieldCapacity: productUploadCapacity,
    time,
  });
  syncModalRenderPacketState(runtimeState, featureFrame);
}

export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
) {
  const { uniforms, volumeMesh, idleOverlay } = runtimeState;
  const modalFieldModeBuffer = runtimeState.modalFieldModeBuffer;
  const modalFieldColorBuffer = runtimeState.modalFieldColorBuffer;
  const modalFieldSpectralBuffer = runtimeState.modalFieldSpectralBuffer;
  const modalFieldPhaseBuffer = runtimeState.modalFieldPhaseBuffer;
  const modalFieldCoefficientBuffer = runtimeState.modalFieldCoefficientBuffer;
  const modalFieldCapacity = inferModalFieldCapacity(
    runtimeState.modalFieldCapacity,
    modalFieldModeBuffer.value.array,
  );
  const modalFieldPhaseCapacity = inferModalFieldCapacity(
    runtimeState.modalFieldPhaseCapacity ?? runtimeState.modalFieldCapacity,
    modalFieldPhaseBuffer?.value?.array,
  );

  uniforms.uTime.value = time;
  const fieldState = featureFrame?.fieldState ?? "idle";
  const renderAuthority = hasRenderAuthority(featureFrame);
  if (!renderAuthority) {
    updateReactiveResponse(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      deltaTime,
    );
  }
  setIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  if (!renderAuthority) {
    if (runtimeState.renderAuthorityResetApplied !== true) {
      resetRenderAuthorityState(runtimeState);
    }
    setIfChanged(uniforms.uModalFieldModeCount, 0);
    setIfChanged(uniforms.uAverageAmplitude, 0);
    setIfChanged(uniforms.uTransientEnergy, 0);
    setIfChanged(uniforms.uSpectralCentroid, 0);
    setIfChanged(uniforms.uSpectralFlux, 0);
    setIfChanged(uniforms.uStructureSignal, 0);
    setIfChanged(uniforms.uEnergySignal, 0);
    setIfChanged(uniforms.uChangeSignal, 0);
    setIfChanged(uniforms.uBassSalience, 0);
    setIfChanged(uniforms.uTimbreSpread, 0);
    setIfChanged(uniforms.uSpectralNovelty, 0);
    setIfChanged(uniforms.uBeatPulse, 0);
    setIfChanged(uniforms.uBeatPhase, 0);
    setIfChanged(uniforms.uTempoNorm, 0);
    setIfChanged(uniforms.uRhythmicDensity, 0);
    setIfChanged(uniforms.uTrebleBroadbandEnergy, 0);
    setIfChanged(uniforms.uModeCoherence, 0);
    setIfChanged(uniforms.uTotalSlotAmplitude, 0);
    setRaymarchStructuralProjectionUniforms(uniforms, null);
    setIfChanged(uniforms.uModalResponseEnergy, 0);
    setIfChanged(uniforms.uKeyTintStrength, 0);
    setIfChanged(uniforms.uKeyMode, 0);
    const idleBandEnergies = uniforms.uBandEnergies.value;
    if (
      idleBandEnergies.x !== 0 ||
      idleBandEnergies.y !== 0 ||
      idleBandEnergies.z !== 0 ||
      idleBandEnergies.w !== 0
    ) {
      idleBandEnergies.set(0, 0, 0, 0);
    }
    const idleDensityGain =
      runtimeState.baseDensityGain ?? uniforms.uDensityGain.value;
    setIfChanged(uniforms.uDensityGain, idleDensityGain);
    setIfChanged(
      uniforms.uDensityAbsorption,
      idleDensityGain * uniforms.uAbsorption.value,
    );
    syncObservationTransferUniforms(
      runtimeState,
      runtimeState.visibilityDriveEnvelope,
    );
    volumeMesh.visible = false;
    idleOverlay.visible = resolveIdleOverlayVisible(
      runtimeState,
      featureFrame,
      renderAuthority,
    );
    publishRaymarchRuntimeAuditSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  runtimeState.renderAuthorityResetApplied = false;

  const spectralLightEnabled = (uniforms.uSpectralMix?.value ?? 0) > 0;
  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const modalDescriptor = buildRuntimeModalDescriptor(
    runtimeState,
    featureFrame,
    {
      modalFieldCapacity,
    },
  );
  runtimeState.currentModalDescriptor = modalDescriptor;
  if (modalDescriptor.diagnostics.descriptorOverflow) {
    blockOverflowedModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  applyRaymarchRuntimeUploadAuthority({
    runtimeState,
    featureFrame,
    renderer,
    time,
    uniforms,
    volumeMesh,
    modalDescriptor,
    modalFieldCapacity,
    modalFieldPhaseCapacity,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldSpectralBuffer,
    modalFieldPhaseBuffer,
    modalFieldCoefficientBuffer,
    spectralLightEnabled,
    effectiveCavityGeometry,
  });
  updateReactiveResponse(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
    deltaTime,
  );
  setIfChanged(uniforms.uAverageAmplitude, featureFrame?.averageAmplitude ?? 0);
  setIfChanged(uniforms.uTransientEnergy, featureFrame?.transientEnergy ?? 0);
  setIfChanged(uniforms.uSpectralCentroid, featureFrame?.spectralCentroid ?? 0);
  setIfChanged(uniforms.uSpectralFlux, featureFrame?.spectralFlux ?? 0);
  setIfChanged(uniforms.uStructureSignal, featureFrame?.structureSignal ?? 0);
  setIfChanged(uniforms.uEnergySignal, featureFrame?.energySignal ?? 0);
  setIfChanged(uniforms.uChangeSignal, featureFrame?.changeSignal ?? 0);
  setIfChanged(uniforms.uBassSalience, featureFrame?.bassSalience ?? 0);
  setIfChanged(uniforms.uTimbreSpread, featureFrame?.timbreSpread ?? 0);
  setIfChanged(uniforms.uSpectralNovelty, featureFrame?.spectralNovelty ?? 0);
  const beatTarget =
    featureFrame?.beatDetected && (featureFrame?.beatStrength ?? 0) > 0.3
      ? clamp01(
          (featureFrame.beatStrength ?? 0) * 0.8 +
            (featureFrame.beatConfidence ?? 0) * 0.2,
        )
      : 0;
  runtimeState.beatPulseEnvelope = damp(
    runtimeState.beatPulseEnvelope ?? 0,
    beatTarget,
    beatTarget > (runtimeState.beatPulseEnvelope ?? 0) ? 25 : 8,
    deltaTime,
  );
  setIfChanged(uniforms.uBeatPulse, runtimeState.beatPulseEnvelope);
  setIfChanged(uniforms.uBeatPhase, featureFrame?.beatPhase ?? 0);
  setIfChanged(
    uniforms.uTempoNorm,
    clamp01(((featureFrame?.estimatedTempo ?? 0) - 40) / 200),
  );
  setIfChanged(uniforms.uRhythmicDensity, featureFrame?.rhythmicDensity ?? 0);
  setIfChanged(
    uniforms.uTrebleBroadbandEnergy,
    featureFrame?.trebleBroadbandEnergy ?? 0,
  );
  setIfChanged(uniforms.uModeCoherence, featureFrame?.modeCoherence ?? 0);
  const activeModalFieldModeCount = uniforms.uModalFieldModeCount?.value ?? 0;
  const structuralProjection = resolveRaymarchStructuralProjectionDrive(
    runtimeState,
    activeModalFieldModeCount,
  );
  setIfChanged(uniforms.uTotalSlotAmplitude, structuralProjection.amplitudeSum);
  setRaymarchStructuralProjectionUniforms(uniforms, structuralProjection);
  const retainedModalResponseEnergy =
    runtimeState.modalRenderPacketRetained &&
    runtimeState.activeModalRenderPacket
      ? runtimeState.activeModalRenderPacket.modalResponseEnergy
      : null;
  setIfChanged(
    uniforms.uModalResponseEnergy,
    retainedModalResponseEnergy ?? readModalResponseEnergy(featureFrame),
  );

  // Key tonic hue — EMA with circular shortest-path wrapping
  const rawKeyHue = featureFrame?.keyTonicHue ?? runtimeState.keyHue;
  const keyConf = featureFrame?.keyConfidence ?? 0;
  if (keyConf > 0.35) {
    let hueDelta = rawKeyHue - runtimeState.keyHue;
    if (hueDelta > 0.5) hueDelta -= 1;
    if (hueDelta < -0.5) hueDelta += 1;
    runtimeState.keyHue = (runtimeState.keyHue + hueDelta * 0.01 + 1) % 1;
  }
  runtimeState.keyModeSmooth = damp(
    runtimeState.keyModeSmooth,
    featureFrame?.keyMode === "minor" ? 1 : 0,
    2.0,
    deltaTime,
  );
  uniforms.uKeyTint.value.setHSL(runtimeState.keyHue, 0.68, 0.6);
  setIfChanged(uniforms.uKeyTintStrength, clamp01(keyConf * 1.4));
  setIfChanged(uniforms.uKeyMode, runtimeState.keyModeSmooth);

  updateLaserResponse(runtimeState, featureFrame);
  runtimeState.visibilityDriveEnvelope = damp(
    runtimeState.visibilityDriveEnvelope ?? 0,
    deriveObservationVisibilityDrive(featureFrame),
    VISIBILITY_DRIVE_DAMP_LAMBDA,
    deltaTime,
  );
  syncObservationTransferUniforms(
    runtimeState,
    runtimeState.visibilityDriveEnvelope,
  );
  const nextDensityGain =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.scaleSignal ?? 0) * DENSITY_RESPONSE_AMOUNT);
  setIfChanged(uniforms.uDensityGain, nextDensityGain);
  setIfChanged(
    uniforms.uDensityAbsorption,
    nextDensityGain * uniforms.uAbsorption.value,
  );
  const bandEnergies = featureFrame?.bandEnergies ?? EMPTY_BAND_ENERGIES;
  const bandEnergyValues = uniforms.uBandEnergies.value;
  const nextBandEnergy0 = bandEnergies[0] ?? 0;
  const nextBandEnergy1 = bandEnergies[1] ?? 0;
  const nextBandEnergy2 = bandEnergies[2] ?? 0;
  const nextBandEnergy3 = bandEnergies[3] ?? 0;
  if (
    bandEnergyValues.x !== nextBandEnergy0 ||
    bandEnergyValues.y !== nextBandEnergy1 ||
    bandEnergyValues.z !== nextBandEnergy2 ||
    bandEnergyValues.w !== nextBandEnergy3
  ) {
    bandEnergyValues.set(
      nextBandEnergy0,
      nextBandEnergy1,
      nextBandEnergy2,
      nextBandEnergy3,
    );
  }

  const modalBasisCacheDrawable =
    runtimeState.modalBasisCacheDrawableAuthority?.drawable === true;
  const modalBasisDisplayCoherent =
    modalBasisCacheDrawable &&
    isRaymarchModalBasisDisplayCoherent(runtimeState);
  const spectralLightLaneDrawable = !spectralLightEnabled;
  volumeMesh.visible =
    renderAuthority && modalBasisDisplayCoherent && spectralLightLaneDrawable;
  idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
}

export function disposeRaymarchRuntime(runtimeState) {
  disposeRaymarchModalBasisCache(runtimeState?.modalBasisCache);
  disposeRaymarchLiveFieldProjectionCache(
    runtimeState?.liveFieldProjectionCache,
  );
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materialCache = child.userData?.raymarchMaterialCache;
    if (materialCache) {
      Object.values(materialCache).forEach((boundaryMaterials) => {
        Object.values(boundaryMaterials).forEach((material) => {
          material?.dispose?.();
        });
      });
    } else {
      child.material?.dispose?.();
    }
    if (child.isLight && child.shadow?.map) {
      child.shadow.map.dispose?.();
    }
  });
}

export function createRaymarchSceneRoot({ volumeMesh, idleOverlay, radius }) {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  visualRoot.add(volumeMesh);
  visualRoot.add(idleOverlay);
  root.add(visualRoot);

  // Keep the orb primarily self-emissive, but retain a very weak symmetric fill
  // rig so the volume stays readable across backends that expect direct lights.
  const primaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  primaryLight.position.set(radius * 1.15, radius * 0.85, radius * 1.8);
  primaryLight.castShadow = false;
  root.add(primaryLight);

  const secondaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  secondaryLight.position.set(-radius * 1.15, radius * 0.85, radius * 1.8);
  secondaryLight.castShadow = false;
  root.add(secondaryLight);

  return {
    root,
    visualRoot,
    sceneLighting: {
      primary: primaryLight,
      secondary: secondaryLight,
    },
  };
}
