import * as THREE from "three";
import { AUDIO_RESPONSE_GAIN, RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import {
  MODAL_BASIS_CACHE_PAGE_CAPACITY,
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
  computeRaymarchSpectralLaneCache,
  discardRaymarchModalBasisCachePendingDescriptor,
  disposeRaymarchLiveFieldProjectionCache,
  disposeRaymarchModalBasisCache,
  disposeRaymarchSpectralLaneCache,
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
  RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
  RAYMARCH_PRESSURE_RADIATION_SEMANTIC,
} from "./fieldCache.js";
import {
  computeRaymarchLaserTransportCache,
  deactivateRaymarchLaserTransportCache,
  disposeRaymarchLaserTransportCache,
} from "./laserTransport.js";
import {
  buildRaymarchPhaseSlotSignature,
  copyCanonicalRaymarchStructuralCoefficients,
  copyCanonicalRaymarchPhaseSlots,
} from "./phaseSlotSemantics.js";
import {
  CYMATIC_CARRIER_REFERENCE_PROFILE,
  deriveLiveSynthesisCancellationSuppression,
  deriveHolographicFresnel,
} from "./fieldShaping.js";
import {
  REFERENCE_ABSORPTION_COEFFICIENT,
  REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  REFERENCE_SCATTERING_COEFFICIENT,
  deriveAcousticEnergyMaterialTransfer,
  deriveCarrierColumnDensityScale,
  deriveObservationTransfer,
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
  buildRaymarchFieldAnalysis,
  copyModalField,
  deriveFieldExcitation,
  inferModalFieldCapacity,
} from "./fieldAnalysis.js";
import {
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  setRaymarchModalBasisAtlasTexture,
  setRaymarchSpectralLightEvaluationMode,
  setRaymarchCavityGeometry,
} from "./material.js";
import { resolveIdleOverlayVisible } from "../idleLogoVisibility.js";
import { clamp, clamp01, smoothstep } from "../../utils/math.js";
const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 3.6;
const RESPONSE_IDLE_RELEASE = 5.5;
const DECAY_RELEASE_ENERGY_END = 0.22;
const DECAY_RELEASE_CHANGE_END = 0.12;
const DECAY_RELEASE_STRUCTURE_END = 0.42;
const DECAY_RELEASE_TARGET_REDUCTION = 0.55;
const DECAY_RELEASE_RATE_GAIN = 1.9;
const ACCENT_ATTACK = 15;
const ACCENT_RELEASE = 11;
const STRUCTURAL_BODY_BLOOM_STRENGTH_SUPPRESSION_MAX = 0.55;
const STRUCTURAL_BODY_BLOOM_THRESHOLD_LIFT_MAX = 0.08;
const BEAT_PHASE_CORRECTION_RATE_CYCLES_PER_SEC = 2.4;
const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;
const MATERIAL_OUTPUT_VISIBLE_EPSILON = 1e-5;
const RENDER_AUTHORITY_DISPLAY_HOLD_SEC = 0.12;
const PHASE_EVALUATION_CLOCK_REBASE_INTERVAL_SEC = 30;
const STATIC_OUTPUT_CHROMATICITY_SEMANTIC =
  "derived-from-static-uColor-linear-rgb;expected-not-gpu-readback";
const SPECTRAL_OUTPUT_CHROMATICITY_SEMANTIC =
  "spectral-lane-spatial-rgb;not-derivable-without-gpu-readback";
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const HASH_FLOAT_VIEW = new Float32Array(1);
const HASH_UINT_VIEW = new Uint32Array(HASH_FLOAT_VIEW.buffer);

function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}

function wrapUnitPhase(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function signedUnitPhaseDelta(from, to) {
  const delta = wrapUnitPhase(to) - wrapUnitPhase(from);
  if (delta > 0.5) {
    return delta - 1;
  }
  if (delta < -0.5) {
    return delta + 1;
  }
  return delta;
}

function deriveBeatPhaseAuthority(featureFrame) {
  const tempoAuthority = clamp01(featureFrame?.tempoConfidence ?? 0);
  const beatAuthority =
    featureFrame?.beatDetected === true
      ? clamp01(
          (featureFrame?.beatStrength ?? 0) * 0.7 +
            (featureFrame?.beatConfidence ?? 0) * 0.3,
        )
      : 0;

  return Math.max(tempoAuthority, beatAuthority);
}

function resolveShaderBeatPhase(runtimeState, featureFrame, deltaTime) {
  const rawPhase = clamp01(readFiniteNumber(featureFrame?.beatPhase, 0));
  const previousPhase = runtimeState.shaderBeatPhase;

  if (!Number.isFinite(previousPhase)) {
    runtimeState.shaderBeatPhase = rawPhase;
    return rawPhase;
  }

  const safeDeltaTime = Math.max(0, readFiniteNumber(deltaTime, 0));
  const estimatedTempo = Math.max(
    0,
    readFiniteNumber(featureFrame?.estimatedTempo, 0),
  );
  const predictedPhase = wrapUnitPhase(
    previousPhase + (estimatedTempo / 60) * safeDeltaTime,
  );
  const correctionAuthority = deriveBeatPhaseAuthority(featureFrame);
  const maxCorrection =
    BEAT_PHASE_CORRECTION_RATE_CYCLES_PER_SEC *
    correctionAuthority *
    safeDeltaTime;
  const phaseCorrection = clamp(
    signedUnitPhaseDelta(predictedPhase, rawPhase),
    -maxCorrection,
    maxCorrection,
  );
  const shaderBeatPhase = wrapUnitPhase(predictedPhase + phaseCorrection);

  runtimeState.shaderBeatPhase = shaderBeatPhase;
  return shaderBeatPhase;
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

function normalizeLinearRgbChromaticity(rgb) {
  const nonnegativeRgb = [
    Math.max(0, readFiniteNumber(rgb?.[0], 0)),
    Math.max(0, readFiniteNumber(rgb?.[1], 0)),
    Math.max(0, readFiniteNumber(rgb?.[2], 0)),
  ];
  const luminance = Math.max(computeLinearLuminance(nonnegativeRgb), 1e-6);
  return nonnegativeRgb.map((channel) => channel / luminance);
}

function readFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
}

function readRuntimeTimeSec(time) {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function isExplicitStoppedTransport(featureFrame) {
  return (
    featureFrame?.sourceEvidence?.transport?.playbackEndReason === "stopped"
  );
}

function resolveRenderAuthorityDisplayHold(runtimeState, featureFrame, time) {
  if (
    featureFrame?.renderAuthorityRevoked === true ||
    isExplicitStoppedTransport(featureFrame)
  ) {
    runtimeState.renderAuthorityLastVisibleAtSec = null;
    clearRenderAuthorityDisplayHold(runtimeState);
    return false;
  }

  const lastVisibleAtSec = runtimeState.renderAuthorityLastVisibleAtSec;
  if (
    runtimeState.volumeMesh?.visible !== true ||
    !Number.isFinite(lastVisibleAtSec)
  ) {
    runtimeState.renderAuthorityDisplayHoldActive = false;
    runtimeState.renderAuthorityDisplayHoldAgeSec = null;
    return false;
  }

  const holdAgeSec = Math.max(0, readRuntimeTimeSec(time) - lastVisibleAtSec);
  const displayHoldActive = holdAgeSec <= RENDER_AUTHORITY_DISPLAY_HOLD_SEC;
  runtimeState.renderAuthorityDisplayHoldActive = displayHoldActive;
  runtimeState.renderAuthorityDisplayHoldAgeSec = holdAgeSec;
  return displayHoldActive;
}

function clearRenderAuthorityDisplayHold(runtimeState) {
  runtimeState.renderAuthorityDisplayHoldActive = false;
  runtimeState.renderAuthorityDisplayHoldAgeSec = null;
}

function deriveRaymarchVisibilityGate({
  renderAuthority,
  renderAuthorityDisplayHold,
  sourceBoundaryState,
  modalBasisCacheDrawableAuthority,
  modalBasisDisplayAuthority,
  spectralLightEnabled,
  spectralLightEvaluationMode,
  spectralLightLaneDrawable,
  spectralLaneCache,
  volumeVisible,
  materialProbeExtinction,
  materialProbePreBloomRadiance,
  materialProbePostBloomRisk,
}) {
  const materialOutputVisible =
    Math.max(
      readFiniteNumber(materialProbeExtinction, 0),
      readFiniteNumber(materialProbePreBloomRadiance, 0),
      readFiniteNumber(materialProbePostBloomRisk, 0),
    ) > MATERIAL_OUTPUT_VISIBLE_EPSILON;

  if (!renderAuthority) {
    if (renderAuthorityDisplayHold) {
      return {
        state: "render-authority-display-hold",
        blockedReason: readFirstString(
          sourceBoundaryState,
          "render-authority-display-continuity",
        ),
        materialOutputVisible,
      };
    }
    return {
      state: "render-authority-off",
      blockedReason: readFirstString(sourceBoundaryState, "render-authority"),
      materialOutputVisible,
    };
  }

  if (modalBasisCacheDrawableAuthority?.drawable !== true) {
    return {
      state: "modal-basis-not-drawable",
      blockedReason: readFirstString(
        modalBasisCacheDrawableAuthority?.blockedReason,
        modalBasisCacheDrawableAuthority?.staleReason,
        modalBasisCacheDrawableAuthority?.state,
        "modal-basis-cache-not-drawable",
      ),
      materialOutputVisible,
    };
  }

  if (modalBasisDisplayAuthority?.coherent !== true) {
    return {
      state: "modal-basis-display-incoherent",
      blockedReason: readFirstString(
        modalBasisDisplayAuthority?.blockedReason,
        "modal-basis-display-incoherent",
      ),
      materialOutputVisible,
    };
  }

  if (spectralLightEnabled && spectralLightLaneDrawable !== true) {
    return {
      state: "spectral-lane-not-drawable",
      blockedReason: readFirstString(
        spectralLaneCache?.lastError,
        spectralLaneCache?.lastComputeReason,
        spectralLightEvaluationMode,
        "spectral-lane-cache-unavailable",
      ),
      materialOutputVisible,
    };
  }

  if (volumeVisible !== true) {
    return {
      state: "volume-hidden",
      blockedReason: "hard-gate-hidden",
      materialOutputVisible,
    };
  }

  if (!materialOutputVisible) {
    return {
      state: "material-output-near-black",
      blockedReason: "material-transfer-low-output",
      materialOutputVisible,
    };
  }

  return {
    state: "visible",
    blockedReason: null,
    materialOutputVisible,
  };
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

// Reuses the displaced packet's snapshot storage when shapes match: the
// active render packet is re-snapshotted every coherent tick, and fresh
// clones of seven mode buffers per frame are measurable GC churn.
function snapshotBufferArray(bufferNode, reusableSnapshot = null) {
  const array = bufferNode?.value?.array;
  if (!array) {
    return null;
  }
  if (
    reusableSnapshot instanceof Float32Array &&
    reusableSnapshot.length === array.length
  ) {
    reusableSnapshot.set(array);
    return reusableSnapshot;
  }
  return new Float32Array(array);
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

function suspendModalBasisCacheRebuilds(modalBasisCache, reason) {
  if (!modalBasisCache) {
    return;
  }

  // Cancel in-flight and queued rebuild work but retain the committed atlas.
  // Basis pages are coefficient-invariant — cache freshness is semantic
  // topology — so silence, source cuts, and momentarily blocked descriptors
  // do not invalidate them. Fail-closed visibility is owned by drawable and
  // display authority; discarding the atlas here only forced a multi-frame
  // rebuild gap (dropped frames) when the same topology returned.
  advanceRaymarchCacheGeneration(modalBasisCache);
  modalBasisCache.ready = Boolean(modalBasisCache.activeDescriptor);
  modalBasisCache.rebuildPending = false;
  modalBasisCache.pendingDescriptor = null;
  modalBasisCache.pendingReady = false;
  modalBasisCache.pendingCacheBuiltAtSec = null;
  modalBasisCache.pendingRebuildReason = null;
  modalBasisCache.pendingPhaseSampleTimeSec = null;
  clearQueuedRaymarchCacheRebuild(modalBasisCache);
  if (modalBasisCache.backend === "unavailable") {
    // Allow a compute retry after the suspension instead of staying blocked.
    modalBasisCache.backend = "compute";
  }
  modalBasisCache.lastError = null;
  modalBasisCache.lastRebuildReason = reason ?? "suspended";
}

function deactivateRuntimeLaserTransportCache(
  runtimeState,
  reason = "inactive",
) {
  if (runtimeState) {
    runtimeState.raymarchLaserTransportInputPacket = null;
  }
  deactivateRaymarchLaserTransportCache(
    runtimeState?.laserTransportCache,
    reason,
  );
  setIfChanged(runtimeState?.uniforms?.uLaserCausticActive, 0);
}

function deactivateLiveFieldProjectionCache(runtimeState, reason = "inactive") {
  const liveFieldProjectionCache = runtimeState?.liveFieldProjectionCache;
  if (liveFieldProjectionCache) {
    liveFieldProjectionCache.active = false;
    liveFieldProjectionCache.lastComputeReason = reason;
  }
  setIfChanged(runtimeState?.uniforms?.uLiveFieldCacheActive, 0);
  // Laser transport is valid only while its authoritative pressure-field
  // packet remains drawable; it fails closed with the providing cache.
  deactivateRuntimeLaserTransportCache(runtimeState, reason);
}

const LIVE_FIELD_PROJECTION_STALE_RETAINED_REASON =
  "modal-basis-cache-stale-retained";
const LIVE_FIELD_PROJECTION_STALE_WITHOUT_COMMITTED_REASON =
  "modal-basis-cache-stale-without-live-field";
const MODAL_BASIS_DISPLAY_LIVE_FIELD_INACTIVE_REASON =
  "modal-basis-cache-live-field-inactive";
const SPECTRAL_LANE_CACHE_CURRENT_RETAINED_REASON =
  "spectral-lane-cache-current-retained";
const SPECTRAL_LANE_EMPTY_PACKET_RETAINED_REASON =
  "spectral-lane-empty-packet-retained";
const SPECTRAL_LANE_CACHE_UNAVAILABLE_RETAINED_REASON =
  "spectral-lane-cache-unavailable-retained";

function hasCommittedLiveFieldProjectionCache(runtimeState) {
  const liveFieldProjectionCache = runtimeState?.liveFieldProjectionCache;
  const volumeUserData = runtimeState?.volumeMesh?.userData;
  return Boolean(
    liveFieldProjectionCache?.active === true &&
    liveFieldProjectionCache?.ready === true &&
    volumeUserData?.raymarchModalLiveFieldTexture &&
    volumeUserData?.raymarchModalLiveSupportTexture &&
    volumeUserData?.raymarchModalPressureRadiationTexture,
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
  clearBufferNode(runtimeState.modalFieldSpectralLaneABuffer);
  clearBufferNode(runtimeState.modalFieldSpectralLaneBBuffer);
  clearBufferNode(runtimeState.modalFieldSpectralMetaBuffer);
  clearBufferNode(runtimeState.modalFieldMetadataBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  runtimeState.raymarchFieldAnalysis = null;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.shaderBeatPhase = null;
  runtimeState.renderAuthorityLastVisibleAtSec = null;
  clearRenderAuthorityDisplayHold(runtimeState);
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.modalPhaseEvaluationEpochSec = null;
  setIfChanged(runtimeState.uniforms.uPhaseEvaluationTime, 0);
  runtimeState.currentModalDescriptor = null;
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.modalBasisCacheDrawableAuthority = null;
  runtimeState.activeModalRenderPacket = null;
  runtimeState.modalRenderPacketRetained = null;
  resetRaymarchUploadState(runtimeState);
  suspendModalBasisCacheRebuilds(
    runtimeState.modalBasisCache,
    "render-authority-reset",
  );
  if (runtimeState.modalBasisCache) {
    runtimeState.modalBasisCache.active = false;
  }
  resetCacheActivity(runtimeState.liveFieldProjectionCache);
  resetCacheActivity(runtimeState.spectralLaneCache);
  if (runtimeState.spectralLaneCache) {
    runtimeState.spectralLaneCache.descriptor = null;
    runtimeState.spectralLaneCache.activeDescriptor = null;
  }
  deactivateLiveFieldProjectionCache(runtimeState, "render-authority-reset");
  setRaymarchSpectralLightEvaluationMode(
    runtimeState.volumeMesh,
    RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
  );
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
    stepCompensation: runtimeState?.bloomTuning?.stepCompensation,
    contourSharpness: runtimeState?.uniforms?.uContourSharpness?.value,
    fieldNoiseFloor: readRuntimeFieldNoiseFloor(runtimeState),
  });
}

function syncObservationTransferUniforms(runtimeState) {
  const uniforms = runtimeState?.uniforms ?? {};
  const stepCompensation = runtimeState?.bloomTuning?.stepCompensation;
  const contourSharpness = uniforms.uContourSharpness?.value;
  const fieldNoiseFloor = readRuntimeFieldNoiseFloor(runtimeState);
  const inputCache =
    runtimeState.observationTransferInputCache ??
    (runtimeState.observationTransferInputCache = {});

  if (
    runtimeState.observationTransferParameters &&
    inputCache.stepCompensation === stepCompensation &&
    inputCache.contourSharpness === contourSharpness &&
    inputCache.fieldNoiseFloor === fieldNoiseFloor
  ) {
    return runtimeState.observationTransferParameters;
  }

  inputCache.stepCompensation = stepCompensation;
  inputCache.contourSharpness = contourSharpness;
  inputCache.fieldNoiseFloor = fieldNoiseFloor;

  const parameters = deriveObservationTransferParameters({
    stepCompensation,
    contourSharpness,
    fieldNoiseFloor,
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

function resolveRaymarchStructuralProjectionDrive(runtimeState, activeCount) {
  const resolution =
    runtimeState?.modalBasisCache?.resolution ??
    RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  return deriveStructuralProjectionDrive({
    modalFieldSlots:
      runtimeState?.rendererFeatureModalSlots ??
      runtimeState?.modalFieldModeBuffer?.value?.array,
    activeCount: Math.max(0, Math.floor(activeCount ?? 0)),
    resolution,
  });
}

function setRaymarchStructuralProjectionUniforms(uniforms, projectionDrive) {
  setIfChanged(
    uniforms.uModalEnergyAmplitude,
    Math.sqrt(Math.max(0, projectionDrive?.structuralEnergy ?? 0)),
  );
  setIfChanged(
    uniforms.uStructuralProjectionDrive,
    projectionDrive?.projectionEnergyDrive ?? 0,
  );
  setIfChanged(
    uniforms.uStructuralProjectionConcentration,
    projectionDrive?.structuralConcentration ?? 0,
  );
  setIfChanged(
    uniforms.uCarrierColumnDensityScale,
    deriveCarrierColumnDensityScale(projectionDrive?.rmsSpatialWavenumber),
  );
}

function estimateModalFieldAmplitude(featureFrame) {
  if (featureFrame?.modalCoefficientSlots) {
    const count = Math.max(
      0,
      Math.min(
        featureFrame.activeModalFieldModeCount ??
          featureFrame.activeModeCount ??
          featureFrame.modalCoefficientSlots.length,
        featureFrame.modalCoefficientSlots.length,
      ),
    );
    if (count === 0) {
      return 0;
    }
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      total += Math.max(0, featureFrame.modalCoefficientSlots[index] ?? 0);
    }
    return total / count;
  }
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
        MODAL_BASIS_CACHE_PAGE_CAPACITY,
    ),
  );
}

function buildRuntimeModalDescriptor(
  runtimeState,
  featureFrame,
  { modalFieldCapacity },
) {
  const sourceDescriptor = featureFrame?.modalDescriptor ?? null;
  if (!sourceDescriptor) {
    return null;
  }
  const slotViews = sourceDescriptor?.slotViews ?? {};
  if (slotViews.modalFieldSlots) {
    return sourceDescriptor;
  }

  let modalFieldSlots = featureFrame?.modalFieldSlots;
  if (featureFrame?.modalIdentitySlots && featureFrame?.modalCoefficientSlots) {
    const capacity = Math.max(0, Math.floor(modalFieldCapacity ?? 0));
    const slotLength = capacity * 4;
    if (runtimeState.rendererFeatureModalSlots?.length !== slotLength) {
      runtimeState.rendererFeatureModalSlots = new Float32Array(slotLength);
      runtimeState.rendererFeatureTopologyRevision = null;
    }
    const joinedSlots = runtimeState.rendererFeatureModalSlots;
    const activeModeCount = Math.min(
      capacity,
      Math.max(
        0,
        Math.floor(
          featureFrame.activeModalFieldModeCount ??
            featureFrame.activeModeCount ??
            0,
        ),
      ),
      Math.floor(featureFrame.modalIdentitySlots.length / 3),
      featureFrame.modalCoefficientSlots.length,
    );
    if (
      runtimeState.rendererFeatureTopologyRevision !==
      featureFrame.topologyRevision
    ) {
      joinedSlots.fill(0);
      for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
        const identityOffset = modeIndex * 3;
        const slotOffset = modeIndex * 4;
        joinedSlots[slotOffset] =
          featureFrame.modalIdentitySlots[identityOffset] ?? 0;
        joinedSlots[slotOffset + 1] =
          featureFrame.modalIdentitySlots[identityOffset + 1] ?? 0;
        joinedSlots[slotOffset + 2] =
          featureFrame.modalIdentitySlots[identityOffset + 2] ?? 0;
      }
      runtimeState.rendererFeatureTopologyRevision =
        featureFrame.topologyRevision;
    }
    for (let modeIndex = 0; modeIndex < activeModeCount; modeIndex += 1) {
      joinedSlots[modeIndex * 4 + 3] =
        featureFrame.modalCoefficientSlots[modeIndex] ?? 0;
    }
    for (
      let modeIndex = activeModeCount;
      modeIndex < capacity;
      modeIndex += 1
    ) {
      joinedSlots[modeIndex * 4 + 3] = 0;
    }
    modalFieldSlots = joinedSlots;

    // Packet topology is the canonical semantic descriptor. The renderer only
    // rejoins its static identities with live coefficients and phase for GPU
    // upload; rebuilding the descriptor here would rerun bandwidth authority
    // without the worker's retained-projection history and can falsely turn a
    // complete descriptor into a fatal bandwidth-limited one.
    return {
      ...sourceDescriptor,
      slotViews: {
        modalFieldSlots,
        modalFieldPhaseSlots: featureFrame?.modalFieldPhaseSlots,
        modalFieldColorSlots: featureFrame?.modalFieldColorSlots,
        modalFieldSpectralLaneA: featureFrame?.modalFieldSpectralLaneA,
        modalFieldSpectralLaneB: featureFrame?.modalFieldSpectralLaneB,
        modalFieldSpectralMeta: featureFrame?.modalFieldSpectralMeta,
        modalFieldMetadataSlots: featureFrame?.modalFieldMetadataSlots,
      },
    };
  }

  return null;
}

function resolveFatalModalDescriptorBlockReason(fieldAuthority) {
  if (
    !fieldAuthority ||
    fieldAuthority === "complete" ||
    fieldAuthority === "capacity-limited"
  ) {
    return null;
  }

  return fieldAuthority === "bandwidth-limited"
    ? "bandwidth-limited"
    : "descriptor-blocked";
}

function blockNonAuthoritativeModalDescriptor(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
  reason,
) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldCoefficientBuffer);
  runtimeState.raymarchFieldAnalysis = null;
  if (runtimeState.bloomTuning) {
    runtimeState.bloomTuning.bloomAllowed = false;
  }
  runtimeState.renderAuthorityLastVisibleAtSec = null;
  clearRenderAuthorityDisplayHold(runtimeState);
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.modalPhaseEvaluationEpochSec = null;
  setIfChanged(runtimeState.uniforms.uPhaseEvaluationTime, 0);
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.activeModalRenderPacket = null;
  runtimeState.modalRenderPacketRetained = null;
  resetRaymarchUploadState(runtimeState);
  suspendModalBasisCacheRebuilds(runtimeState.modalBasisCache, reason);
  if (runtimeState.modalBasisCache) {
    runtimeState.modalBasisCache.active = false;
  }
  resetCacheActivity(runtimeState.liveFieldProjectionCache);
  resetCacheActivity(runtimeState.spectralLaneCache);
  deactivateLiveFieldProjectionCache(runtimeState, reason);
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
  const raymarchFieldAnalysis = runtimeState.raymarchFieldAnalysis ?? null;
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const stepBudget = Math.round(runtimeState.volumeMesh.material.steps);
  const holographicIntensity =
    runtimeState.uniforms.uHolographicIntensity?.value ?? 0;
  const holographicFresnelPower =
    runtimeState.uniforms.uHolographicFresnelPower?.value ?? 0;
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
    ? clamp01(readRuntimeModalResponseEnergy(runtimeState, featureFrame))
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
  const sourceBoundaryState =
    featureFrame?.energyLedger?.sourceBoundaryState ?? null;
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
    parameters: observationParameters,
  });
  const rawDiagnosticDensity = Math.min(
    1,
    avgAmplitude *
      (densityGain / RAYMARCH_DEFAULTS.densityGain) *
      (0.75 + transientEnergy * 0.2),
  );
  const { avgRaySegmentLength = 0, missRatio = 0 } =
    runtimeState.stabilityStats ?? {};
  const primaryLightIntensity =
    runtimeState.sceneLighting?.primary?.intensity ?? 0;
  const secondaryLightIntensity =
    runtimeState.sceneLighting?.secondary?.intensity ?? 0;
  const { holographicFresnel } = deriveHolographicFresnel({
    normalViewDot: 0.35,
    holographicIntensity,
    holographicFresnelPower,
  });
  const holographicReferenceStrength = holographicFresnel;
  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const requestedCavityGeometry = normalizeCavityGeometry(
    runtimeState?.requestedCavityGeometry,
  );
  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const modalBasisCache = runtimeState.modalBasisCache ?? null;
  const liveFieldProjectionCache =
    runtimeState.liveFieldProjectionCache ?? null;
  const spectralLaneCache = runtimeState.spectralLaneCache ?? null;
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
  const modalBasisCacheMinSamplesPerCycle = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.modalBasisCacheMinSamplesPerCycle ??
      modalBasisCache?.modalBasisCacheMinSamplesPerCycle,
    RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
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
  const liveFieldPressureRadiationReady = Boolean(
    liveFieldProjectionCache?.ready === true &&
    liveFieldProjectionCache?.pressureRadiationTexture,
  );
  const liveFieldPressureRadiationSemantic =
    liveFieldProjectionCache?.pressureRadiationSemantic ??
    RAYMARCH_PRESSURE_RADIATION_SEMANTIC;
  const radiationMaterialContrast =
    liveFieldProjectionCache?.radiationMaterialContrast ?? null;
  const radiationMaterialContrastSemantic =
    typeof radiationMaterialContrast?.semantic === "string"
      ? radiationMaterialContrast.semantic
      : "unavailable-no-material-contrast";
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
      (0.7 + effectiveBloomStrength * 1.6) *
      (1.1 - effectiveBloomThreshold * 0.4),
  );
  const materialProbeCarrierDensity = clamp01(
    diagnosticVisibility.supportedPhysicalDensity,
  );
  const materialProbeCarrierEnergyWeight =
    CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight +
    CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight;
  const materialProbeCoreDensity =
    materialProbeCarrierDensity *
    (CYMATIC_CARRIER_REFERENCE_PROFILE.coreEnergyWeight /
      materialProbeCarrierEnergyWeight);
  const materialProbeSheathDensity =
    materialProbeCarrierDensity *
    (CYMATIC_CARRIER_REFERENCE_PROFILE.sheathEnergyWeight /
      materialProbeCarrierEnergyWeight);
  const materialProbeDetectorIntegratedEnergy = Math.max(
    0,
    modalCoefficientEnergy,
  );
  const materialProbeLaserTransportReady = Boolean(
    runtimeState.laserTransportCache?.active === true &&
    runtimeState.laserTransportCache?.ready === true,
  );
  const materialProbeCarrierColumnDensityScale = clamp01(
    readFiniteNumber(
      runtimeState.uniforms.uCarrierColumnDensityScale?.value,
      1,
    ),
  );
  const materialProbeHolographicBaseRadianceGain = Math.max(
    0,
    readFiniteNumber(
      runtimeState.uniforms.uHolographicBaseRadianceGain?.value,
      0,
    ),
  );
  const materialAbsorptionCoefficient = Math.max(
    0,
    readFiniteNumber(
      runtimeState.uniforms.uMaterialAbsorptionCoefficient?.value,
      REFERENCE_ABSORPTION_COEFFICIENT,
    ),
  );
  const staticMaterialColorLinearRgb = readUniformColorRgb(
    runtimeState.uniforms.uColor,
    [0.34, 0.62, 0.9],
  );
  const staticSurfaceColorLinearRgb = readUniformColorRgb(
    runtimeState.uniforms.uSurfaceColor,
    [0.36, 0.89, 0.96],
  );
  const configuredColorMode =
    runtimeState.spectralLight?.colorMode === "spectral" ||
    (runtimeState.spectralLight?.colorMode !== "static" &&
      (runtimeState.uniforms.uSpectralMix?.value ?? 0) > 0)
      ? "spectral"
      : "static";
  const staticColorActive = configuredColorMode === "static";
  const expectedOutputChromaticityLinearRgb = staticColorActive
    ? normalizeLinearRgbChromaticity(staticMaterialColorLinearRgb)
    : null;
  const outputChromaticitySemantic = staticColorActive
    ? STATIC_OUTPUT_CHROMATICITY_SEMANTIC
    : SPECTRAL_OUTPUT_CHROMATICITY_SEMANTIC;
  const materialProbeTransfer = deriveAcousticEnergyMaterialTransfer({
    detectorIntegratedEnergy: materialProbeDetectorIntegratedEnergy,
    coreDensity: materialProbeCoreDensity,
    sheathDensity: materialProbeSheathDensity,
    materialDensityScale: densityGain / RAYMARCH_DEFAULTS.densityGain,
    carrierColumnDensityScale: materialProbeCarrierColumnDensityScale,
    materialColor: staticMaterialColorLinearRgb,
    surfaceColor: staticSurfaceColorLinearRgb,
    scatteringCoefficient: REFERENCE_SCATTERING_COEFFICIENT,
    absorptionCoefficient: materialAbsorptionCoefficient,
    laserExcitedEmissionCoefficient:
      REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
    holographicIntensity,
    holographicFresnelPower,
    normalDotRay: 1,
    holographicBaseRadianceGain: materialProbeHolographicBaseRadianceGain,
    laserAccentAuthority: 0,
  });
  const materialProbeExtinction = Math.max(
    0,
    readFiniteNumber(materialProbeTransfer.extinction, 0),
  );
  const materialProbePreBloomRadiance = computeLinearLuminance(
    materialProbeTransfer.sourceRadiance,
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
  const spectralMix = runtimeState.uniforms.uSpectralMix?.value ?? 0;
  const spectralLightEnabled = spectralMix > 0;
  const spectralLightEvaluationMode =
    runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ??
    RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  const spectralLightLaneDrawable =
    !spectralLightEnabled ||
    spectralLightEvaluationMode ===
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache;
  const visibilityGate = deriveRaymarchVisibilityGate({
    renderAuthority,
    renderAuthorityDisplayHold:
      runtimeState.renderAuthorityDisplayHoldActive === true,
    sourceBoundaryState,
    modalBasisCacheDrawableAuthority,
    modalBasisDisplayAuthority,
    spectralLightEnabled,
    spectralLightEvaluationMode,
    spectralLightLaneDrawable,
    spectralLaneCache,
    volumeVisible: runtimeState.volumeMesh.visible,
    materialProbeExtinction,
    materialProbePreBloomRadiance,
    materialProbePostBloomRisk,
  });

  return {
    fieldState,
    renderAuthority,
    renderAuthorityDisplayHold:
      runtimeState.renderAuthorityDisplayHoldActive === true,
    renderAuthorityDisplayHoldAgeSec:
      runtimeState.renderAuthorityDisplayHoldAgeSec ?? null,
    renderAuthorityDisplayHoldMaxSec: RENDER_AUTHORITY_DISPLAY_HOLD_SEC,
    projectedRenderEnergy,
    renderEnergyEpsilon,
    sourceBoundaryState,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      raymarchFieldAnalysis?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      raymarchFieldAnalysis?.uploadedModeCount ?? activeModeCount,
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
    structuralProjectionRmsSpatialWavenumber:
      structuralProjection.rmsSpatialWavenumber,
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
    complexityScore: raymarchFieldAnalysis?.complexityScore ?? 0,
    complexityExcitation: raymarchFieldAnalysis?.excitation ?? fieldExcitation,
    complexityWeightedPermutationLoad:
      raymarchFieldAnalysis?.weightedPermutationLoad ?? 0,
    complexityCountLoad: raymarchFieldAnalysis?.countLoad ?? 0,
    peakModalFieldAmplitude,
    avgOpacity,
    avgDensity,
    materialProbeDetectorIntegratedEnergy,
    materialProbeCarrierDensity,
    materialProbeCoreDensity,
    materialProbeSheathDensity,
    materialProbeMaterialDensityScale:
      materialProbeTransfer.materialDensityScale,
    materialProbeCarrierColumnDensityScale:
      materialProbeTransfer.carrierColumnDensityScale,
    materialProbeOrganizedCoreDensity:
      materialProbeTransfer.organizedCoreDensity,
    materialProbeOrganizedSheathDensity:
      materialProbeTransfer.organizedSheathDensity,
    materialProbeOrganizedDensity: materialProbeTransfer.organizedDensity,
    materialProbeScatteringCoefficient:
      materialProbeTransfer.scatteringCoefficient,
    materialProbeAbsorptionCoefficient:
      materialProbeTransfer.absorptionCoefficient,
    materialProbeLaserExcitedEmissionCoefficient:
      materialProbeTransfer.laserExcitedEmissionCoefficient,
    materialProbeEmissionSourceStrength:
      materialProbeTransfer.emissionSourceStrength,
    materialProbeCoreEmissionSourceStrength:
      materialProbeTransfer.coreEmissionSourceStrength,
    materialProbeSheathEmissionSourceStrength:
      materialProbeTransfer.sheathEmissionSourceStrength,
    materialProbeFresnelEmissionSourceStrength:
      materialProbeTransfer.fresnelEmissionSourceStrength,
    materialProbeFresnelBase: materialProbeTransfer.fresnelBase,
    materialProbeHolographicFresnel: materialProbeTransfer.holographicFresnel,
    materialProbeSigmaS: materialProbeTransfer.sigmaS,
    materialProbeSigmaA: materialProbeTransfer.sigmaA,
    materialProbeExtinction,
    materialProbeHolographicBaseRadianceGain,
    materialProbeBaseRadiance: materialProbeTransfer.baseRadiance,
    materialProbeAccentRadiance: materialProbeTransfer.accentRadiance,
    materialProbeLaserTransportReady,
    materialProbePreBloomRadiance,
    materialProbePostBloomRisk,
    materialProbeBloomAmplification,
    staticColorActive,
    staticMaterialColorLinearRgb,
    expectedOutputChromaticityLinearRgb,
    outputChromaticitySemantic,
    visibilityGateState: visibilityGate.state,
    visibilityGateBlockedReason: visibilityGate.blockedReason,
    materialOutputVisible: visibilityGate.materialOutputVisible,
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
    holographicIntensity,
    holographicFresnelPower,
    effectiveBloomStrength,
    effectiveBloomRadius,
    effectiveBloomThreshold,
    bloomRisk,
    carrierCoreFwhmWorld:
      runtimeState.uniforms.uCarrierCoreFwhmWorld?.value ?? 0,
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
    auditFixtureBaseOnly: runtimeState.auditFixtureBaseOnly === true,
    laserTransportActive: runtimeState.laserTransportCache?.active === true,
    laserTransportReady: runtimeState.laserTransportCache?.ready === true,
    laserTransportDispatchCount: Math.max(
      0,
      Math.floor(runtimeState.laserTransportCache?.dispatchCount ?? 0),
    ),
    laserTransportLastComputeReason:
      runtimeState.laserTransportCache?.lastComputeReason ?? "uninitialized",
    spectralLightEnabled,
    spectralLightLaneDrawable,
    spectralLightEvaluationMode,
    spectralLightImplementationState:
      spectralLightEvaluationMode ===
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache
        ? "lane-cache-radiance"
        : "lane-cache-unavailable",
    spectralLaneCacheActive: spectralLaneCache?.active ?? false,
    spectralLaneCacheReady: spectralLaneCache?.ready ?? false,
    spectralLaneCacheBackend: spectralLaneCache?.backend ?? "compute",
    spectralLaneCacheLastComputeReason:
      spectralLaneCache?.lastComputeReason ?? "uninitialized",
    spectralLaneCacheLastError: spectralLaneCache?.lastError ?? null,
    spectralLaneCacheComputedAtSec:
      spectralLaneCache?.lastComputedAtSec ?? null,
    spectralLaneCacheBuiltAtSec:
      spectralLaneCache?.activeCacheBuiltAtSec ?? null,
    spectralLaneCacheResolution: spectralLaneCache?.resolution ?? null,
    spectralLaneCacheDescriptorHash:
      spectralLaneCache?.descriptor?.hash ?? null,
    spectralLaneCacheModalFieldCount:
      spectralLaneCache?.descriptor?.modalFieldCount ?? 0,
    spectralLaneCacheSpectralLaneHash:
      spectralLaneCache?.descriptor?.spectralLaneHash ?? null,
    spectralLaneCacheActivePacketCount:
      spectralLaneCache?.descriptor?.spectralLaneActivePacketCount ?? 0,
    spectralLaneCacheRadianceInputTotal:
      spectralLaneCache?.descriptor?.spectralLaneRadianceInputTotal ?? 0,
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
    liveFieldProjectionPressureRadiationReady: liveFieldPressureRadiationReady,
    liveFieldProjectionPressureRadiationSemantic:
      liveFieldPressureRadiationSemantic,
    radiationMaterialContrastSemantic,
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
    modalBasisCacheMinSamplesPerCycle,
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
    spectralMix,
    holographicReferenceStrength,
    avgRaySegmentLength,
    missRatio,
    primaryLightIntensity,
    secondaryLightIntensity,
    sceneLightAsymmetry: deriveLightAsymmetry(
      primaryLightIntensity,
      secondaryLightIntensity,
    ),
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
    idleLogoSuppressedForLive: runtimeState.idleLogoSuppressedForLive === true,
    idleLogoSuppressedForActiveTransport:
      runtimeState.idleLogoSuppressedForActiveTransport === true,
  };
}

function updateReactiveResponse(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
  deltaTime,
) {
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
      readRuntimeModalResponseEnergy(runtimeState, featureFrame),
      structuralProjection.projectionEnergyDrive,
    ),
  );
  const audioResponseGain = AUDIO_RESPONSE_GAIN;
  if (!renderAuthority) {
    runtimeState.responseEnvelope = 0;
    runtimeState.accentEnvelope = 0;
    runtimeState.motionSignal = 0;
    runtimeState.scaleSignal = 0;
    runtimeState.bloomResponseSignal = 0;
    runtimeState.visualRoot?.scale?.setScalar?.(1);
    return;
  }

  const presentationSignalScale = 1;
  const gatedStructureSignal = clamp01(
    structureSignal * audioResponseGain * presentationSignalScale,
  );
  const gatedEnergySignal = clamp01(
    energySignal * audioResponseGain * presentationSignalScale,
  );
  const gatedChangeSignal = clamp01(
    changeSignal * audioResponseGain * presentationSignalScale,
  );
  const gatedPulseSignal = clamp01(
    pulseSignal * audioResponseGain * presentationSignalScale,
  );
  const gatedModalResponseEnergy = clamp01(
    modalResponseEnergy * audioResponseGain * presentationSignalScale,
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
        ? RESPONSE_RELEASE * (1 + decayReleaseMask * DECAY_RELEASE_RATE_GAIN)
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
  const transientEnergy = clamp01(featureFrame?.transientEnergy ?? 0);
  const structuralBodyBloomControls = deriveStructuralBodyBloomControls(
    runtimeState,
    transientEnergy,
  );

  setIfChanged(uniforms.uContourSharpness, clamp(baseContourSharpness, 1, 8));
  const bt = runtimeState.bloomTuning;
  bt.effectiveStrength = baseBloomStrength;
  bt.effectiveRadius = Math.max(0, baseBloomRadius);
  bt.effectiveThreshold = clamp(baseBloomThreshold, 0, 1);
  bt.bloomAllowed = true;
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
      modalFieldSpectralLaneA: null,
      modalFieldSpectralLaneB: null,
      modalFieldSpectralMeta: null,
      modalFieldMetadata: null,
      modalFieldRole: null,
    };
  }

  return runtimeState.raymarchUploadState;
}

function buildLayerUploadSignature({
  slots,
  colorSlots,
  spectralLaneA,
  spectralLaneB,
  spectralMeta,
  metadataSlots,
  layer,
  includeColors,
  includeSpectral,
  identityOnly = false,
}) {
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const activeCount = Math.min(
    Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
    capacity,
  );
  let slotHash = FNV_OFFSET_BASIS;
  let colorHash = includeColors ? FNV_OFFSET_BASIS : 0;
  let spectralHash = includeSpectral ? FNV_OFFSET_BASIS : 0;
  let metadataHash = FNV_OFFSET_BASIS;

  for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    slotHash = hashUint32(slotIndex, slotHash);
    if (identityOnly) {
      slotHash = hashFloat32(slots?.[sourceOffset] ?? 0, slotHash);
      slotHash = hashFloat32(slots?.[sourceOffset + 1] ?? 0, slotHash);
      slotHash = hashFloat32(slots?.[sourceOffset + 2] ?? 0, slotHash);
    } else {
      slotHash = hashSlot4(slots, sourceOffset, slotHash);
    }
    if (includeColors) {
      colorHash = hashUint32(slotIndex, colorHash);
      colorHash = hashSlot4(colorSlots, sourceOffset, colorHash);
    }
    if (includeSpectral) {
      spectralHash = hashUint32(slotIndex, spectralHash);
      spectralHash = hashSlot4(spectralLaneA, sourceOffset, spectralHash);
      spectralHash = hashSlot4(spectralLaneB, sourceOffset, spectralHash);
      spectralHash = hashSlot4(spectralMeta, sourceOffset, spectralHash);
    }
    metadataHash = hashUint32(slotIndex, metadataHash);
    metadataHash = hashSlot4(metadataSlots, sourceOffset, metadataHash);
  }

  return {
    capacity,
    activeCount,
    includeColors: Boolean(includeColors),
    includeSpectral: Boolean(includeSpectral),
    slotHash: slotHash >>> 0,
    colorHash: colorHash >>> 0,
    spectralHash: spectralHash >>> 0,
    metadataHash: metadataHash >>> 0,
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

function layerMetadataUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.metadataHash !== next.metadataHash
  );
}

function applyLayerUploadIfChanged({
  uploadState,
  key,
  slots,
  colorSlots,
  spectralLaneA,
  spectralLaneB,
  spectralMeta,
  metadataSlots,
  targetSlots,
  targetColorSlots,
  targetSpectralLaneA,
  targetSpectralLaneB,
  targetSpectralMeta,
  targetMetadataSlots,
  modeBufferNode,
  colorBufferNode,
  spectralLaneABufferNode,
  spectralLaneBBufferNode,
  spectralMetaBufferNode,
  metadataBufferNode,
  layer,
  includeColors,
  includeSpectral,
  identityOnly = false,
}) {
  const signature = buildLayerUploadSignature({
    slots,
    colorSlots,
    spectralLaneA,
    spectralLaneB,
    spectralMeta,
    metadataSlots,
    layer,
    includeColors,
    includeSpectral,
    identityOnly,
  });
  const previous = uploadState[key]?.signature ?? null;
  const modeChanged = layerModeUploadSignatureChanged(previous, signature);
  const colorChanged = layerColorUploadSignatureChanged(previous, signature);
  const spectralChanged = layerSpectralUploadSignatureChanged(
    previous,
    signature,
  );
  const metadataChanged = layerMetadataUploadSignatureChanged(
    previous,
    signature,
  );

  if (modeChanged || colorChanged || spectralChanged || metadataChanged) {
    copyLayerUpload({
      slots,
      colorSlots,
      targetSlots,
      targetColorSlots,
      layer,
      includeColors,
      identityOnly,
    });
    copyLayerSpectralUpload({
      spectralLaneA,
      spectralLaneB,
      spectralMeta,
      targetSpectralLaneA,
      targetSpectralLaneB,
      targetSpectralMeta,
      layer,
      includeSpectral,
    });
    copyLayerMetadataUpload({
      metadataSlots,
      targetMetadataSlots,
      layer,
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
    if (includeSpectral && (spectralChanged || modeChanged)) {
      if (spectralLaneABufferNode?.value) {
        spectralLaneABufferNode.value.needsUpdate = true;
      }
      if (spectralLaneBBufferNode?.value) {
        spectralLaneBBufferNode.value.needsUpdate = true;
      }
      if (spectralMetaBufferNode?.value) {
        spectralMetaBufferNode.value.needsUpdate = true;
      }
    }
    if (metadataBufferNode?.value && (metadataChanged || modeChanged)) {
      metadataBufferNode.value.needsUpdate = true;
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

function resolvePhaseEvaluationSourceTimeSec(time) {
  return Number.isFinite(time) ? time : 0;
}

function resolvePhaseEvaluationClockSec(runtimeState, time) {
  const sourceTime = resolvePhaseEvaluationSourceTimeSec(time);
  const epoch = runtimeState?.modalPhaseEvaluationEpochSec;
  if (!Number.isFinite(epoch)) {
    return 0;
  }
  return Math.max(0, sourceTime - epoch);
}

function shouldRebasePhaseEvaluationClock(runtimeState, time) {
  const sourceTime = resolvePhaseEvaluationSourceTimeSec(time);
  const epoch = runtimeState?.modalPhaseEvaluationEpochSec;
  if (!Number.isFinite(epoch)) {
    return true;
  }
  const elapsed = sourceTime - epoch;
  return (
    !Number.isFinite(elapsed) ||
    elapsed < 0 ||
    elapsed >= PHASE_EVALUATION_CLOCK_REBASE_INTERVAL_SEC
  );
}

function applyLayerPhaseUploadIfChanged({
  runtimeState,
  uploadState,
  key,
  phaseSlots,
  targetPhaseSlots,
  phaseBufferNode,
  layer,
  capacity,
  time,
}) {
  if (!targetPhaseSlots || !layer) {
    uploadState[key] = null;
    if (runtimeState) {
      runtimeState.modalPhaseEvaluationEpochSec = null;
    }
    return 0;
  }

  const signature = buildPhaseUploadSignature({
    phaseSlots,
    layer,
    capacity,
  });
  const previous = uploadState[key]?.signature ?? null;
  const signatureChanged = !phaseUploadSignatureEquals(previous, signature);
  const rebaseRequired = shouldRebasePhaseEvaluationClock(runtimeState, time);
  if (!signatureChanged && !rebaseRequired) {
    return uploadState[key]?.activeCount ?? 0;
  }

  const phaseEvaluationTimeSec = resolvePhaseEvaluationSourceTimeSec(time);
  const activeCount = copyLayerPhaseUpload({
    phaseSlots,
    targetPhaseSlots,
    layer,
    capacity,
    phaseEvaluationTimeSec,
  });
  if (runtimeState) {
    runtimeState.modalPhaseEvaluationEpochSec = phaseEvaluationTimeSec;
  }
  if (phaseBufferNode?.value) {
    phaseBufferNode.value.needsUpdate = signatureChanged || activeCount > 0;
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
  identityOnly = false,
}) {
  copyModalField({
    sourceSlots: slots,
    sourceColorSlots: colorSlots,
    targetSlots,
    targetColorSlots,
    capacity: layer.capacity,
    includeColors,
  });
  if (identityOnly) {
    const activeCount = Math.min(
      Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
      Math.floor((targetSlots?.length ?? 0) / 4),
    );
    for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
      targetSlots[slotIndex * 4 + 3] = 1;
    }
  }
}

function copyLayerSpectralUpload({
  spectralLaneA,
  spectralLaneB,
  spectralMeta,
  targetSpectralLaneA,
  targetSpectralLaneB,
  targetSpectralMeta,
  layer,
  includeSpectral,
}) {
  if (!targetSpectralLaneA && !targetSpectralLaneB && !targetSpectralMeta) {
    return;
  }
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const targetLength = capacity * 4;
  targetSpectralLaneA?.fill(0, 0, targetLength);
  targetSpectralLaneB?.fill(0, 0, targetLength);
  targetSpectralMeta?.fill(0, 0, targetLength);
  if (!includeSpectral) {
    return;
  }
  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (targetSpectralLaneA) {
      targetSpectralLaneA[offset] = spectralLaneA?.[offset] ?? 0;
      targetSpectralLaneA[offset + 1] = spectralLaneA?.[offset + 1] ?? 0;
      targetSpectralLaneA[offset + 2] = spectralLaneA?.[offset + 2] ?? 0;
      targetSpectralLaneA[offset + 3] = spectralLaneA?.[offset + 3] ?? 0;
    }
    if (targetSpectralLaneB) {
      targetSpectralLaneB[offset] = spectralLaneB?.[offset] ?? 0;
      targetSpectralLaneB[offset + 1] = spectralLaneB?.[offset + 1] ?? 0;
      targetSpectralLaneB[offset + 2] = spectralLaneB?.[offset + 2] ?? 0;
      targetSpectralLaneB[offset + 3] = spectralLaneB?.[offset + 3] ?? 0;
    }
    if (targetSpectralMeta) {
      targetSpectralMeta[offset] = spectralMeta?.[offset] ?? 0;
      targetSpectralMeta[offset + 1] = spectralMeta?.[offset + 1] ?? 0;
      targetSpectralMeta[offset + 2] = spectralMeta?.[offset + 2] ?? 0;
      targetSpectralMeta[offset + 3] = spectralMeta?.[offset + 3] ?? 0;
    }
  }
}

function copyLayerMetadataUpload({
  metadataSlots,
  targetMetadataSlots,
  layer,
}) {
  if (!targetMetadataSlots) {
    return;
  }
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const targetLength = capacity * 4;
  targetMetadataSlots.fill(0, 0, targetLength);
  for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    targetMetadataSlots[offset] = metadataSlots?.[offset] ?? 0;
    targetMetadataSlots[offset + 1] = metadataSlots?.[offset + 1] ?? 0;
    targetMetadataSlots[offset + 2] = metadataSlots?.[offset + 2] ?? 0;
    targetMetadataSlots[offset + 3] = metadataSlots?.[offset + 3] ?? 0;
  }
}

function copyLayerPhaseUpload({
  phaseSlots,
  targetPhaseSlots,
  layer,
  capacity,
  phaseEvaluationTimeSec,
}) {
  if (!targetPhaseSlots || !layer) {
    return 0;
  }
  return copyCanonicalRaymarchPhaseSlots({
    sourceSlots: phaseSlots,
    targetSlots: targetPhaseSlots,
    capacity,
    phaseEvaluationTimeSec,
  });
}

function applyLayerCoefficientUpload({
  modeSlots,
  coefficients,
  targetCoefficientSlots,
  coefficientBufferNode,
  layer,
  capacity,
}) {
  if (!targetCoefficientSlots || !layer) {
    return 0;
  }

  let activeCount;
  if (coefficients) {
    targetCoefficientSlots.fill(0);
    activeCount = Math.min(
      Math.max(0, Math.floor(layer.uploadedActiveCount ?? 0)),
      Math.max(0, Math.floor(capacity ?? 0)),
      coefficients.length,
      Math.floor(targetCoefficientSlots.length / 4),
    );
    for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
      targetCoefficientSlots[slotIndex * 4] = coefficients[slotIndex] ?? 0;
    }
  } else {
    activeCount = copyCanonicalRaymarchStructuralCoefficients({
      modeSlots,
      targetSlots: targetCoefficientSlots,
      capacity,
      activeCount: layer.uploadedActiveCount,
    });
  }
  if (coefficientBufferNode?.value) {
    coefficientBufferNode.value.needsUpdate = activeCount > 0;
  }
  return activeCount;
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
    suspendModalBasisCacheRebuilds(modalBasisCache, descriptorBlockedReason);
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

function buildRuntimeSpectralLaneCacheDescriptor(
  runtimeState,
  modalBasisCacheDescriptor,
  { modalFieldCapacity },
) {
  const activeCount = Math.min(
    Math.max(
      0,
      Math.floor(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
    ),
    Math.max(0, Math.floor(modalFieldCapacity ?? 0)),
  );
  let hash = FNV_OFFSET_BASIS;
  hash = hashUint32(activeCount, hash);
  hash = hashUint32(modalBasisCacheDescriptor?.identitySetHash ?? 0, hash);
  hash = hashUint32(
    modalBasisCacheDescriptor?.identityPageAssignmentHash ?? 0,
    hash,
  );
  hash = hashUint32(modalBasisCacheDescriptor?.resolution ?? 0, hash);
  const descriptorSpectralLaneHash =
    runtimeState?.currentModalDescriptor?.diagnostics?.spectralLaneHash ?? 0;
  hash = hashUint32(descriptorSpectralLaneHash, hash);

  const coefficientSlots =
    runtimeState?.modalFieldCoefficientBuffer?.value?.array ?? null;
  const spectralLaneA =
    runtimeState?.modalFieldSpectralLaneABuffer?.value?.array ?? null;
  const spectralLaneB =
    runtimeState?.modalFieldSpectralLaneBBuffer?.value?.array ?? null;
  let spectralLaneRadianceInputTotal = 0;
  let spectralLaneActivePacketCount = 0;

  for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    hash = hashUint32(slotIndex, hash);
    hash = hashSlot4(coefficientSlots, offset, hash);

    const coefficient = Math.max(0, coefficientSlots?.[offset] ?? 0);
    const laneMass =
      Math.max(0, spectralLaneA?.[offset] ?? 0) +
      Math.max(0, spectralLaneA?.[offset + 1] ?? 0) +
      Math.max(0, spectralLaneA?.[offset + 2] ?? 0) +
      Math.max(0, spectralLaneA?.[offset + 3] ?? 0) +
      Math.max(0, spectralLaneB?.[offset] ?? 0) +
      Math.max(0, spectralLaneB?.[offset + 1] ?? 0) +
      Math.max(0, spectralLaneB?.[offset + 2] ?? 0) +
      Math.max(0, spectralLaneB?.[offset + 3] ?? 0);
    const packetRadianceInput = coefficient * laneMass;
    if (packetRadianceInput > 1e-8) {
      spectralLaneActivePacketCount += 1;
      spectralLaneRadianceInputTotal += packetRadianceInput;
    }
  }

  return {
    semantic: "spectral-lane-cache",
    modalFieldCount: activeCount,
    resolution:
      runtimeState?.spectralLaneCache?.resolution ??
      modalBasisCacheDescriptor?.resolution ??
      null,
    modalBasisIdentityHash: modalBasisCacheDescriptor?.identitySetHash ?? null,
    identityPageAssignmentHash:
      modalBasisCacheDescriptor?.identityPageAssignmentHash ?? null,
    liveModalPhaseHash: modalBasisCacheDescriptor?.liveModalPhaseHash ?? null,
    descriptorSpectralLaneHash,
    spectralLaneHash: hash >>> 0,
    spectralLaneActivePacketCount,
    spectralLaneRadianceInputTotal,
    hash: hash >>> 0,
  };
}

function readCommittedSpectralLaneCache(spectralLaneCache) {
  const descriptor =
    spectralLaneCache?.descriptor ??
    spectralLaneCache?.activeDescriptor ??
    null;
  if (
    spectralLaneCache?.ready !== true ||
    !descriptor ||
    !spectralLaneCache.spectralLaneTextureA ||
    !spectralLaneCache.spectralLaneTextureB ||
    !spectralLaneCache.spectralLaneStatsTexture
  ) {
    return null;
  }

  return {
    descriptor,
    activeDescriptor: spectralLaneCache.activeDescriptor ?? descriptor,
    activeCacheBuiltAtSec: spectralLaneCache.activeCacheBuiltAtSec ?? null,
    lastComputedAtSec: spectralLaneCache.lastComputedAtSec ?? null,
    modalBasisCacheDescriptor:
      spectralLaneCache.modalBasisCacheDescriptor ?? null,
    modalBasisAtlasTexture: spectralLaneCache.modalBasisAtlasTexture ?? null,
  };
}

function hasRadiantSpectralLaneDescriptor(descriptor) {
  return (
    (descriptor?.spectralLaneActivePacketCount ?? 0) > 0 &&
    (descriptor?.spectralLaneRadianceInputTotal ?? 0) > 1e-8
  );
}

function spectralLaneCacheHasCurrentModalBasisSource(
  committedCache,
  modalBasisAtlasTexture,
  modalBasisCacheDescriptor,
) {
  const committedModalBasisDescriptor =
    committedCache?.modalBasisCacheDescriptor ?? null;
  const modalBasisDescriptorFresh = Boolean(
    committedModalBasisDescriptor &&
    modalBasisCacheDescriptor &&
    getRaymarchModalBasisCacheDescriptorStaleReason({
      activeDescriptor: committedModalBasisDescriptor,
      nextDescriptor: modalBasisCacheDescriptor,
    }) == null,
  );
  return Boolean(
    committedCache?.modalBasisAtlasTexture &&
    modalBasisAtlasTexture &&
    committedCache.modalBasisAtlasTexture === modalBasisAtlasTexture &&
    modalBasisDescriptorFresh,
  );
}

function canRetainSpectralLaneCacheAfterMiss(
  committedCache,
  reason,
  modalBasisAtlasTexture,
  modalBasisCacheDescriptor,
) {
  return (
    Boolean(committedCache) &&
    spectralLaneCacheHasCurrentModalBasisSource(
      committedCache,
      modalBasisAtlasTexture,
      modalBasisCacheDescriptor,
    ) &&
    hasRadiantSpectralLaneDescriptor(committedCache.descriptor) &&
    (reason === "renderer-unavailable" || reason === "compute-node-unavailable")
  );
}

function retainSpectralLaneCache(spectralLaneCache, reason, committedCache) {
  if (committedCache?.descriptor) {
    spectralLaneCache.descriptor = committedCache.descriptor;
    spectralLaneCache.activeDescriptor =
      committedCache.activeDescriptor ?? committedCache.descriptor;
    spectralLaneCache.activeCacheBuiltAtSec =
      committedCache.activeCacheBuiltAtSec;
    spectralLaneCache.lastComputedAtSec = committedCache.lastComputedAtSec;
    spectralLaneCache.modalBasisCacheDescriptor =
      committedCache.modalBasisCacheDescriptor ?? null;
    spectralLaneCache.modalBasisAtlasTexture =
      committedCache.modalBasisAtlasTexture ?? null;
  }
  spectralLaneCache.active = true;
  spectralLaneCache.ready = true;
  spectralLaneCache.lastComputeReason = reason;
  return { computed: false, reason };
}

function shouldRetainCommittedSpectralLaneCache(
  spectralLaneCache,
  nextDescriptor,
  modalBasisAtlasTexture,
  modalBasisCacheDescriptor,
) {
  if (spectralLaneCache?.ready !== true || !nextDescriptor) {
    return false;
  }
  const committedDescriptor =
    spectralLaneCache.descriptor ?? spectralLaneCache.activeDescriptor ?? null;
  const retainEmptyPacket = Boolean(
    nextDescriptor.spectralLaneActivePacketCount === 0 &&
    nextDescriptor.spectralLaneRadianceInputTotal <= 1e-8 &&
    (nextDescriptor.modalFieldCount ?? 0) > 0 &&
    (committedDescriptor?.spectralLaneActivePacketCount ?? 0) > 0 &&
    (committedDescriptor?.spectralLaneRadianceInputTotal ?? 0) > 1e-8,
  );
  if (
    !spectralLaneCacheHasCurrentModalBasisSource(
      spectralLaneCache,
      modalBasisAtlasTexture,
      modalBasisCacheDescriptor,
    )
  ) {
    return retainEmptyPacket;
  }
  if (committedDescriptor?.hash === nextDescriptor.hash) {
    return true;
  }
  return retainEmptyPacket;
}

function resolveSpectralLaneRetentionReason(spectralLaneCache, nextDescriptor) {
  const committedDescriptor =
    spectralLaneCache?.descriptor ??
    spectralLaneCache?.activeDescriptor ??
    null;
  if (committedDescriptor?.hash === nextDescriptor?.hash) {
    return SPECTRAL_LANE_CACHE_CURRENT_RETAINED_REASON;
  }
  return SPECTRAL_LANE_EMPTY_PACKET_RETAINED_REASON;
}

function deactivateSpectralLaneCache(runtimeState, reason) {
  const spectralLaneCache = runtimeState?.spectralLaneCache;
  if (spectralLaneCache) {
    spectralLaneCache.active = false;
    spectralLaneCache.ready = false;
    spectralLaneCache.lastComputeReason = reason;
  }
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  return { computed: false, reason };
}

function updateSpectralLaneCache(
  runtimeState,
  renderer,
  {
    spectralLightEnabled,
    modalBasisCacheDescriptor,
    modalFieldCapacity,
    schedulerTimeSec,
  },
) {
  const spectralLaneCache = runtimeState?.spectralLaneCache;
  if (!spectralLightEnabled) {
    return deactivateSpectralLaneCache(runtimeState, "spectral-disabled");
  }
  if (!spectralLaneCache) {
    return deactivateSpectralLaneCache(runtimeState, "cache-unavailable");
  }

  const modalBasisAuthority =
    runtimeState.modalBasisCacheDrawableAuthority ??
    resolveRaymarchModalBasisCacheDrawableAuthority(
      runtimeState.modalBasisCache,
      modalBasisCacheDescriptor,
    );
  if (modalBasisAuthority?.staleWhileRebuilding === true) {
    if (spectralLaneCache.ready === true) {
      spectralLaneCache.active = true;
      spectralLaneCache.lastComputeReason = "modal-basis-cache-stale-retained";
      return { computed: false, reason: spectralLaneCache.lastComputeReason };
    }
    return deactivateSpectralLaneCache(
      runtimeState,
      "modal-basis-cache-stale-without-committed",
    );
  }
  if (modalBasisAuthority?.drawable !== true) {
    return deactivateSpectralLaneCache(
      runtimeState,
      modalBasisAuthority?.blockedReason ?? "modal-basis-cache-not-drawable",
    );
  }

  const modalBasisAtlasTexture =
    runtimeState.volumeMesh?.userData?.raymarchModalBasisAtlasTexture ??
    runtimeState.modalBasisCache?.texture ??
    null;
  const descriptor = buildRuntimeSpectralLaneCacheDescriptor(
    runtimeState,
    modalBasisCacheDescriptor,
    { modalFieldCapacity },
  );
  const committedCache = readCommittedSpectralLaneCache(spectralLaneCache);
  if (
    shouldRetainCommittedSpectralLaneCache(
      spectralLaneCache,
      descriptor,
      modalBasisAtlasTexture,
      modalBasisCacheDescriptor,
    )
  ) {
    return retainSpectralLaneCache(
      spectralLaneCache,
      resolveSpectralLaneRetentionReason(spectralLaneCache, descriptor),
    );
  }
  const result = computeRaymarchSpectralLaneCache(spectralLaneCache, renderer, {
    descriptor,
    modalBasisCacheDescriptor,
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer: runtimeState.modalFieldCoefficientBuffer,
    modalFieldSpectralLaneABuffer: runtimeState.modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer: runtimeState.modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer: runtimeState.modalFieldSpectralMetaBuffer,
    modalFieldCapacity,
    uniforms: runtimeState.uniforms,
    schedulerTimeSec,
  });
  if (
    canRetainSpectralLaneCacheAfterMiss(
      committedCache,
      result.reason,
      modalBasisAtlasTexture,
      modalBasisCacheDescriptor,
    )
  ) {
    return retainSpectralLaneCache(
      spectralLaneCache,
      SPECTRAL_LANE_CACHE_UNAVAILABLE_RETAINED_REASON,
      committedCache,
    );
  }
  return result;
}

function resolveSpectralLightEvaluationMode(
  runtimeState,
  { spectralLightEnabled },
) {
  const spectralLaneCache = runtimeState.spectralLaneCache ?? null;
  const laneCacheDrawable = Boolean(
    spectralLightEnabled &&
    spectralLaneCache?.ready === true &&
    spectralLaneCache.spectralLaneTextureA &&
    spectralLaneCache.spectralLaneTextureB &&
    spectralLaneCache.spectralLaneStatsTexture,
  );
  if (laneCacheDrawable) {
    runtimeState.currentSpectralLightDescriptor =
      spectralLaneCache.descriptor ?? null;
    runtimeState.spectralLightBuffersUploaded = true;
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache;
  }
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
  reconcileReadyModalBasisRenderPacket(runtimeState, modalBasisCacheDescriptor);
  updateSpectralLaneCache(runtimeState, renderer, {
    spectralLightEnabled,
    modalBasisCacheDescriptor,
    modalFieldCapacity: capacities.modalFieldCapacity,
    schedulerTimeSec: capacities.schedulerTimeSec,
  });

  const spectralLightEvaluationMode = resolveSpectralLightEvaluationMode(
    runtimeState,
    { spectralLightEnabled },
  );
  setRaymarchSpectralLightEvaluationMode(
    runtimeState.volumeMesh,
    spectralLightEvaluationMode,
  );
}

function buildRaymarchLaserTransportInputPacket(runtimeState, fieldTexture) {
  // Producer-owned upload signatures define transport cadence. The display
  // clock (uPhaseEvaluationTime) is deliberately excluded: it animates the
  // projection but does not constitute a new authoritative field packet.
  const uploadState = runtimeState?.raymarchUploadState;
  const modalFieldSignature = uploadState?.modalField?.signature;
  const phaseSignature = uploadState?.modalFieldPhase?.signature;
  const coefficientSlots =
    runtimeState?.modalFieldCoefficientBuffer?.value?.array;
  const modalBasisAtlasTexture =
    runtimeState?.volumeMesh?.userData?.raymarchModalBasisAtlasTexture ?? null;
  if (
    !modalFieldSignature ||
    !phaseSignature ||
    !coefficientSlots ||
    !modalBasisAtlasTexture ||
    !fieldTexture
  ) {
    return null;
  }

  const activeCount = Math.min(
    Math.max(0, Math.floor(modalFieldSignature.activeCount ?? 0)),
    Math.floor(coefficientSlots.length / 4),
  );
  let packetHash = FNV_OFFSET_BASIS;
  packetHash = hashUint32(modalFieldSignature.capacity ?? 0, packetHash);
  packetHash = hashUint32(activeCount, packetHash);
  packetHash = hashUint32(modalFieldSignature.slotHash ?? 0, packetHash);
  packetHash = hashUint32(modalFieldSignature.metadataHash ?? 0, packetHash);
  packetHash = hashUint32(phaseSignature.capacity ?? 0, packetHash);
  packetHash = hashUint32(phaseSignature.activeCount ?? 0, packetHash);
  packetHash = hashUint32(phaseSignature.activePhaseCount ?? 0, packetHash);
  packetHash = hashUint32(phaseSignature.slotHash ?? 0, packetHash);
  for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
    packetHash = hashUint32(slotIndex, packetHash);
    packetHash = hashFloat32(coefficientSlots[slotIndex * 4] ?? 0, packetHash);
  }
  packetHash = hashFloat32(
    runtimeState?.uniforms?.uModalEnergyAmplitude?.value ?? 0,
    packetHash,
  );
  packetHash = hashFloat32(
    runtimeState?.uniforms?.uRadius?.value ?? 1,
    packetHash,
  );
  packetHash = hashFloat32(
    runtimeState?.uniforms?.uLaserDeflectionGain?.value ?? 0,
    packetHash,
  );
  packetHash = hashUint32(
    runtimeState?.modalBasisCache?.rebuildCount ?? 0,
    packetHash,
  );

  return {
    packetHash: packetHash >>> 0,
    modalBasisAtlasTexture,
    fieldTexture,
  };
}

function raymarchLaserTransportInputPacketsEqual(previous, next) {
  return Boolean(
    previous &&
    next &&
    previous.packetHash === next.packetHash &&
    previous.modalBasisAtlasTexture === next.modalBasisAtlasTexture &&
    previous.fieldTexture === next.fieldTexture,
  );
}

function updateRaymarchLaserTransportCache(
  runtimeState,
  renderer,
  fieldTexture,
) {
  const laserTransportCache = runtimeState?.laserTransportCache;
  const inputPacket = buildRaymarchLaserTransportInputPacket(
    runtimeState,
    fieldTexture,
  );
  const inputPacketCurrent = raymarchLaserTransportInputPacketsEqual(
    runtimeState?.raymarchLaserTransportInputPacket,
    inputPacket,
  );
  if (
    inputPacketCurrent &&
    laserTransportCache?.active === true &&
    laserTransportCache?.ready === true
  ) {
    laserTransportCache.lastComputeReason = "packet-current-reused";
    return {
      computed: false,
      reused: true,
      reason: "packet-current-reused",
    };
  }

  const result = computeRaymarchLaserTransportCache(
    laserTransportCache,
    renderer,
    {
      fieldTexture,
      uniforms: runtimeState?.uniforms,
    },
  );
  runtimeState.raymarchLaserTransportInputPacket = result.computed
    ? inputPacket
    : null;
  return { ...result, reused: false };
}

function updateLiveFieldProjectionCache(
  runtimeState,
  renderer,
  { modalFieldCapacity, time, laserTransportEnabled = true },
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
    !runtimeState.modalFieldModeBuffer ||
    !runtimeState.modalFieldCoefficientBuffer ||
    !runtimeState.modalFieldMetadataBuffer
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
      modalFieldModeBuffer: runtimeState.modalFieldModeBuffer,
      modalFieldCoefficientBuffer: runtimeState.modalFieldCoefficientBuffer,
      modalFieldPhaseBuffer: runtimeState.modalFieldPhaseBuffer,
      modalFieldMetadataBuffer: runtimeState.modalFieldMetadataBuffer,
      modalFieldCapacity,
      uniforms: runtimeState.uniforms,
      schedulerTimeSec: time,
    },
  );
  setIfChanged(
    runtimeState.uniforms.uLiveFieldCacheActive,
    result.computed ? 1 : 0,
  );
  if (result.computed && laserTransportEnabled) {
    // Refract the collimated laser once per authoritative pressure-field
    // packet. Display-time phase evaluation may refresh the live field, but
    // does not replace the packet that owns this expensive transport result.
    const laserResult = updateRaymarchLaserTransportCache(
      runtimeState,
      renderer,
      liveFieldProjectionCache.fieldTexture,
    );
    setIfChanged(
      runtimeState.uniforms.uLaserCausticActive,
      laserResult.computed || laserResult.reused ? 1 : 0,
    );
  } else if (result.computed) {
    deactivateRuntimeLaserTransportCache(
      runtimeState,
      "audit-fixture-base-only",
    );
  } else if (result.retained !== true) {
    deactivateRuntimeLaserTransportCache(runtimeState, result.reason);
  }
  return result;
}

function readModalResponseEnergy(featureFrame) {
  return clamp01(
    Math.max(
      readFiniteNumber(featureFrame?.modalResponseEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderSourceCoupledEnergy, 0),
      readFiniteNumber(featureFrame?.modalResponseRenderResonantEnergy, 0),
      readFiniteNumber(featureFrame?.debug?.modalResponseEnergy, 0),
      readFiniteNumber(featureFrame?.debug?.modalResponseRenderEnergy, 0),
    ),
  );
}

function readRetainedModalRenderPacket(runtimeState) {
  return runtimeState?.modalRenderPacketRetained &&
    runtimeState?.activeModalRenderPacket
    ? runtimeState.activeModalRenderPacket
    : null;
}

function readRuntimeModalResponseEnergy(runtimeState, featureFrame) {
  const currentModalResponseEnergy = readModalResponseEnergy(featureFrame);
  const retainedModalResponseEnergy =
    readRetainedModalRenderPacket(runtimeState)?.modalResponseEnergy ?? 0;
  return Math.max(currentModalResponseEnergy, retainedModalResponseEnergy);
}

function snapshotActiveModalRenderPacket(runtimeState, featureFrame) {
  const activeModeCount = Math.max(
    0,
    Math.floor(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  // The displaced packet is unreachable once replaced, so its buffer
  // snapshots are safe to recycle.
  const displacedPacket = runtimeState?.activeModalRenderPacket ?? null;
  return {
    generationId: (displacedPacket?.generationId ?? 0) + 1,
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
      displacedPacket?.modalFieldModeBuffer,
    ),
    modalFieldColorBuffer: snapshotBufferArray(
      runtimeState.modalFieldColorBuffer,
      displacedPacket?.modalFieldColorBuffer,
    ),
    modalFieldSpectralLaneABuffer: snapshotBufferArray(
      runtimeState.modalFieldSpectralLaneABuffer,
      displacedPacket?.modalFieldSpectralLaneABuffer,
    ),
    modalFieldSpectralLaneBBuffer: snapshotBufferArray(
      runtimeState.modalFieldSpectralLaneBBuffer,
      displacedPacket?.modalFieldSpectralLaneBBuffer,
    ),
    modalFieldSpectralMetaBuffer: snapshotBufferArray(
      runtimeState.modalFieldSpectralMetaBuffer,
      displacedPacket?.modalFieldSpectralMetaBuffer,
    ),
    modalFieldMetadataBuffer: snapshotBufferArray(
      runtimeState.modalFieldMetadataBuffer,
      displacedPacket?.modalFieldMetadataBuffer,
    ),
    modalFieldPhaseBuffer: snapshotBufferArray(
      runtimeState.modalFieldPhaseBuffer,
      displacedPacket?.modalFieldPhaseBuffer,
    ),
    modalFieldCoefficientBuffer: snapshotBufferArray(
      runtimeState.modalFieldCoefficientBuffer,
      displacedPacket?.modalFieldCoefficientBuffer,
    ),
    modalFieldModeCount: activeModeCount,
    modalBasisPhaseAuthorityModeCount:
      runtimeState.modalBasisPhaseAuthorityModeCount ?? 0,
    totalSlotAmplitude: runtimeState.uniforms?.uTotalSlotAmplitude?.value ?? 0,
    modalEnergyAmplitude:
      runtimeState.uniforms?.uModalEnergyAmplitude?.value ?? 0,
    structuralProjectionDrive:
      runtimeState.uniforms?.uStructuralProjectionDrive?.value ?? 0,
    structuralProjectionConcentration:
      runtimeState.uniforms?.uStructuralProjectionConcentration?.value ?? 0,
    carrierColumnDensityScale:
      runtimeState.uniforms?.uCarrierColumnDensityScale?.value ?? 1,
    modalResponseEnergy: readModalResponseEnergy(featureFrame),
    raymarchFieldAnalysis: runtimeState.raymarchFieldAnalysis ?? null,
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
    runtimeState.modalFieldSpectralLaneABuffer,
    packet.modalFieldSpectralLaneABuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldSpectralLaneBBuffer,
    packet.modalFieldSpectralLaneBBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldSpectralMetaBuffer,
    packet.modalFieldSpectralMetaBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldMetadataBuffer,
    packet.modalFieldMetadataBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldPhaseBuffer,
    packet.modalFieldPhaseBuffer,
  );
  restoreBufferArray(
    runtimeState.modalFieldCoefficientBuffer,
    packet.modalFieldCoefficientBuffer,
  );
  runtimeState.raymarchFieldAnalysis = packet.raymarchFieldAnalysis ?? null;
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
    runtimeState.uniforms.uModalEnergyAmplitude,
    packet.modalEnergyAmplitude ?? 0,
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
    runtimeState.uniforms.uCarrierColumnDensityScale,
    packet.carrierColumnDensityScale ?? 1,
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

function reconcileReadyModalBasisRenderPacket(runtimeState, descriptor) {
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

  const result =
    commitRaymarchModalBasisCachePendingDescriptor(modalBasisCache);
  if (result.committed !== true) {
    return false;
  }
  setRaymarchModalBasisAtlasTexture(runtimeState.volumeMesh, result.texture);

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
  modalDescriptor,
  modalFieldCapacity,
  modalFieldPhaseCapacity,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldSpectralLaneABuffer,
  modalFieldSpectralLaneBBuffer,
  modalFieldSpectralMetaBuffer,
  modalFieldMetadataBuffer,
  modalFieldPhaseBuffer,
  modalFieldCoefficientBuffer,
  spectralLightEnabled,
  effectiveCavityGeometry,
}) {
  const descriptorSlots = modalDescriptor.slotViews;
  const productBasisAtlasPageCapacity =
    resolveProductBasisAtlasPageCapacity(runtimeState);
  const productUploadCapacity = Math.min(
    modalFieldCapacity,
    productBasisAtlasPageCapacity,
  );
  // The render loop is the integrator: it owns step adaptation. The field
  // analysis is diagnostic-only; profiles may only adjust the integrator's
  // raymarch step budget, never bloom, render scale, or DPR.
  const raymarchFieldAnalysis = buildRaymarchFieldAnalysis({
    modalFieldSlots: descriptorSlots.modalFieldSlots,
    modalFieldCapacity: productUploadCapacity,
    featureFrame,
    cavityGeometry: effectiveCavityGeometry,
  });
  const modalFieldLayer = raymarchFieldAnalysis.modalField;
  const packetActiveModeCount = Math.min(
    productUploadCapacity,
    Math.max(
      0,
      Math.floor(
        featureFrame?.activeModalFieldModeCount ??
          featureFrame?.activeModeCount ??
          modalFieldLayer.uploadedActiveCount,
      ),
    ),
  );
  if (featureFrame?.modalIdentitySlots) {
    modalFieldLayer.originalActiveCount = packetActiveModeCount;
    modalFieldLayer.uploadedActiveCount = packetActiveModeCount;
    modalFieldLayer.occupiedSlotSpan = packetActiveModeCount;
  }
  runtimeState.raymarchFieldAnalysis = raymarchFieldAnalysis;

  const uploadState = getRaymarchUploadState(runtimeState);
  applyLayerUploadIfChanged({
    uploadState,
    key: "modalField",
    slots: descriptorSlots.modalFieldSlots,
    colorSlots: descriptorSlots.modalFieldColorSlots,
    spectralLaneA: descriptorSlots.modalFieldSpectralLaneA,
    spectralLaneB: descriptorSlots.modalFieldSpectralLaneB,
    spectralMeta: descriptorSlots.modalFieldSpectralMeta,
    metadataSlots: descriptorSlots.modalFieldMetadataSlots,
    targetSlots: modalFieldModeBuffer.value.array,
    targetColorSlots: modalFieldColorBuffer.value.array,
    targetSpectralLaneA: modalFieldSpectralLaneABuffer?.value?.array ?? null,
    targetSpectralLaneB: modalFieldSpectralLaneBBuffer?.value?.array ?? null,
    targetSpectralMeta: modalFieldSpectralMetaBuffer?.value?.array ?? null,
    targetMetadataSlots: modalFieldMetadataBuffer?.value?.array ?? null,
    modeBufferNode: modalFieldModeBuffer,
    colorBufferNode: modalFieldColorBuffer,
    spectralLaneABufferNode: modalFieldSpectralLaneABuffer,
    spectralLaneBBufferNode: modalFieldSpectralLaneBBuffer,
    spectralMetaBufferNode: modalFieldSpectralMetaBuffer,
    metadataBufferNode: modalFieldMetadataBuffer,
    layer: modalFieldLayer,
    includeColors: spectralLightEnabled,
    includeSpectral: spectralLightEnabled,
    identityOnly: Boolean(featureFrame?.modalIdentitySlots),
  });

  const modalFieldPhaseAuthorityModeCount = applyLayerPhaseUploadIfChanged({
    runtimeState,
    uploadState,
    key: "modalFieldPhase",
    phaseSlots: descriptorSlots.modalFieldPhaseSlots,
    targetPhaseSlots: modalFieldPhaseBuffer?.value?.array ?? null,
    phaseBufferNode: modalFieldPhaseBuffer,
    layer: modalFieldLayer,
    capacity: Math.min(modalFieldPhaseCapacity, productUploadCapacity),
    time,
  });
  setIfChanged(
    uniforms.uPhaseEvaluationTime,
    resolvePhaseEvaluationClockSec(runtimeState, time),
  );
  runtimeState.modalBasisPhaseAuthorityModeCount =
    modalFieldPhaseAuthorityModeCount;
  applyLayerCoefficientUpload({
    modeSlots: descriptorSlots.modalFieldSlots,
    coefficients: featureFrame?.modalCoefficientSlots ?? null,
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
    laserTransportEnabled: runtimeState.auditFixtureBaseOnly !== true,
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
  const modalFieldSpectralLaneABuffer =
    runtimeState.modalFieldSpectralLaneABuffer;
  const modalFieldSpectralLaneBBuffer =
    runtimeState.modalFieldSpectralLaneBBuffer;
  const modalFieldSpectralMetaBuffer =
    runtimeState.modalFieldSpectralMetaBuffer;
  const modalFieldMetadataBuffer = runtimeState.modalFieldMetadataBuffer;
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
  const fatalModalDescriptorBlockReason =
    resolveFatalModalDescriptorBlockReason(
      featureFrame?.modalDescriptor?.fieldAuthority,
    );
  const renderAuthorityDisplayHold =
    !renderAuthority &&
    !fatalModalDescriptorBlockReason &&
    resolveRenderAuthorityDisplayHold(runtimeState, featureFrame, time);
  if (!renderAuthority && !renderAuthorityDisplayHold) {
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

  if (!renderAuthority && fatalModalDescriptorBlockReason) {
    runtimeState.currentModalDescriptor = featureFrame.modalDescriptor;
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      fatalModalDescriptorBlockReason,
    );
    return;
  }

  if (!renderAuthority) {
    if (renderAuthorityDisplayHold) {
      idleOverlay.visible = false;
      publishRaymarchRuntimeAuditSnapshot(
        runtimeState,
        featureFrame,
        fieldState,
        renderAuthority,
      );
      return;
    }
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
    syncObservationTransferUniforms(runtimeState);
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
  clearRenderAuthorityDisplayHold(runtimeState);
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
  if (!modalDescriptor) {
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      "descriptor-missing",
    );
    return;
  }
  runtimeState.currentModalDescriptor = modalDescriptor;
  const rebuiltFatalModalDescriptorBlockReason =
    resolveFatalModalDescriptorBlockReason(modalDescriptor.fieldAuthority);
  if (rebuiltFatalModalDescriptorBlockReason) {
    blockNonAuthoritativeModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      rebuiltFatalModalDescriptorBlockReason,
    );
    return;
  }
  applyRaymarchRuntimeUploadAuthority({
    runtimeState,
    featureFrame,
    renderer,
    time,
    uniforms,
    modalDescriptor,
    modalFieldCapacity,
    modalFieldPhaseCapacity,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer,
    modalFieldMetadataBuffer,
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
  setIfChanged(
    uniforms.uBeatPhase,
    resolveShaderBeatPhase(runtimeState, featureFrame, deltaTime),
  );
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
  setIfChanged(
    uniforms.uModalResponseEnergy,
    readRuntimeModalResponseEnergy(runtimeState, featureFrame),
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
  syncObservationTransferUniforms(runtimeState);
  const nextDensityGain =
    runtimeState.baseDensityGain ?? uniforms.uDensityGain.value;
  setIfChanged(uniforms.uDensityGain, nextDensityGain);
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
  const spectralLightLaneDrawable =
    !spectralLightEnabled ||
    runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ===
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache;
  volumeMesh.visible =
    renderAuthority && modalBasisDisplayCoherent && spectralLightLaneDrawable;
  if (volumeMesh.visible) {
    runtimeState.renderAuthorityLastVisibleAtSec = readRuntimeTimeSec(time);
  }
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
  disposeRaymarchSpectralLaneCache(runtimeState?.spectralLaneCache);
  disposeRaymarchLaserTransportCache(runtimeState?.laserTransportCache);
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

  // Fixed illumination: the acoustic field owns structure while this
  // symmetric optical rig owns the direct-light response.
  const primaryLight = new THREE.PointLight(0xe6f7ff, 1.25, radius * 6, 2);
  primaryLight.position.set(radius * 1.15, radius * 0.85, radius * 1.8);
  primaryLight.castShadow = false;
  root.add(primaryLight);

  const secondaryLight = new THREE.PointLight(0xe6f7ff, 1.25, radius * 6, 2);
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
