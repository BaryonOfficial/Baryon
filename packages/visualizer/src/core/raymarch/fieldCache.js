import * as THREE from "three";
import { Storage3DTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  cos,
  float,
  globalId,
  int,
  smoothstep,
  textureStore,
  uvec3,
  uint,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { buildRaymarchPhaseSlotSignature } from "./phaseSlotSemantics.js";

export const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;
export const RAYMARCH_EFFECTIVE_FIELD_RESOLUTION =
  RAYMARCH_FIELD_CACHE_RESOLUTION;
const FIELD_CACHE_COMPUTE_WORKGROUP_SIZE = Object.freeze([8, 8, 4]);
const FIELD_CACHE_COLOR_QUANTIZATION = 32;
const SIGNED_INTERFERENCE_VISIBILITY_EPSILON = 0.01;
const SIGNED_INTERFERENCE_VISIBILITY_START = 0.025;
const SIGNED_INTERFERENCE_VISIBILITY_END = 0.1;
const EFFECTIVE_FIELD_ENERGY_EPSILON = 0.01;
const SPECTRAL_LIGHT_CHROMA_EPSILON = 1e-6;
const EFFECTIVE_FIELD_SUPPORT_DIAGNOSTIC_SAMPLE_POINTS = Object.freeze([
  [0, 0, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, -0.5],
]);

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashFloat32(value, hash) {
  const floatView = new Float32Array(1);
  const uintView = new Uint32Array(floatView.buffer);
  floatView[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return hashUint32(uintView[0], hash);
}

function hashModalFieldTopology(slots, activeCount) {
  let hash = FNV_OFFSET_BASIS;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    hash = hashFloat32(slots?.[offset] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 1] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 2] ?? 0, hash);
  }

  return hash >>> 0;
}

function hashSpectralLightColorTopology(colorSlots, activeCount) {
  let hash = FNV_OFFSET_BASIS;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    hash = hashUint32(slotIndex, hash);
    hash = hashUint32(
      Math.round(
        clamp01(colorSlots?.[offset] ?? 0) * FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      hash,
    );
    hash = hashUint32(
      Math.round(
        clamp01(colorSlots?.[offset + 1] ?? 0) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      hash,
    );
    hash = hashUint32(
      Math.round(
        clamp01(colorSlots?.[offset + 2] ?? 0) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      hash,
    );
    hash = hashUint32(
      Math.round(
        clamp01(colorSlots?.[offset + 3] ?? 0) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      hash,
    );
  }

  return hash >>> 0;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstepScalar(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function deriveSignedInterferenceVisibility(
  signedPotential,
  unsignedPotential,
) {
  if (!(unsignedPotential > 0)) {
    return 0;
  }
  return smoothstepScalar(
    SIGNED_INTERFERENCE_VISIBILITY_START,
    SIGNED_INTERFERENCE_VISIBILITY_END,
    Math.abs(signedPotential) /
      Math.max(SIGNED_INTERFERENCE_VISIBILITY_EPSILON, unsignedPotential),
  );
}

function sumSlotAmplitude(slots, activeCount) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  let total = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = slots?.[offset + 3] ?? 0;
    if (amplitude > 0) {
      total += amplitude;
    }
  }

  return total;
}

function normalizeEffectiveFieldResolution(resolution) {
  const candidate = Number.isFinite(resolution)
    ? resolution
    : RAYMARCH_EFFECTIVE_FIELD_RESOLUTION;
  return Math.max(8, Math.round(candidate));
}

function getEffectiveFieldMaxRepresentableModeIndex(resolution) {
  return Math.max(
    1,
    Math.floor(normalizeEffectiveFieldResolution(resolution) / 2),
  );
}

function getSlotMaxModeIndex(slots, offset) {
  return Math.max(
    Math.abs(slots?.[offset] ?? 0),
    Math.abs(slots?.[offset + 1] ?? 0),
    Math.abs(slots?.[offset + 2] ?? 0),
  );
}

function isEffectiveFieldSlotRepresentable({ slots, offset, resolution }) {
  return (
    getSlotMaxModeIndex(slots, offset) <=
    getEffectiveFieldMaxRepresentableModeIndex(resolution)
  );
}

function getEffectiveFieldScale(radius) {
  return Math.PI / Math.max(radius, 1e-4);
}

function getEffectiveFieldGradientBasisScale(scale, boundaryMode) {
  return normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet
    ? scale * 0.5
    : scale;
}

function getEffectiveFieldSlotGradientBound({ slots, offset, basisScale }) {
  return (
    Math.hypot(
      Math.abs(slots?.[offset] ?? 0),
      Math.abs(slots?.[offset + 1] ?? 0),
      Math.abs(slots?.[offset + 2] ?? 0),
    ) * basisScale
  );
}

function summarizeEffectiveFieldDiagnostics({
  slots,
  activeCount,
  resolution,
  scale,
  boundaryMode,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const basisScale = getEffectiveFieldGradientBasisScale(scale, boundaryMode);
  let contributingEffectiveFieldModeCount = 0;
  let zeroAmplitudeSkippedModeCount = 0;
  let bandwidthRejectedModeCount = 0;
  let contributingModalEnergy = 0;
  let bandwidthRejectedModalEnergy = 0;
  let gradientEnvelopeNumerator = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const modalEnergy = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(modalEnergy > 0)) {
      zeroAmplitudeSkippedModeCount += 1;
      continue;
    }

    if (!isEffectiveFieldSlotRepresentable({ slots, offset, resolution })) {
      bandwidthRejectedModeCount += 1;
      bandwidthRejectedModalEnergy += modalEnergy;
      continue;
    }

    contributingEffectiveFieldModeCount += 1;
    contributingModalEnergy += modalEnergy;
    gradientEnvelopeNumerator +=
      modalEnergy *
      getEffectiveFieldSlotGradientBound({
        slots,
        offset,
        basisScale,
      });
  }

  const totalRepresentedModalEnergy =
    contributingModalEnergy + bandwidthRejectedModalEnergy;

  return {
    effectiveFieldMaxRepresentableModeIndex:
      getEffectiveFieldMaxRepresentableModeIndex(resolution),
    contributingEffectiveFieldModeCount,
    zeroAmplitudeSkippedModeCount,
    bandwidthRejectedModeCount,
    contributingModalEnergy,
    bandwidthRejectedModalEnergy,
    effectiveFieldResolvedModalEnergyRatio:
      totalRepresentedModalEnergy > EFFECTIVE_FIELD_ENERGY_EPSILON
        ? contributingModalEnergy / totalRepresentedModalEnergy
        : 1,
    effectiveFieldGradientEnvelope:
      gradientEnvelopeNumerator /
      Math.max(EFFECTIVE_FIELD_ENERGY_EPSILON, contributingModalEnergy),
  };
}

function summarizeEffectiveFieldSupportDiagnostics({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry,
  radius,
  resolution,
}) {
  const sampleRadius = Math.max(Math.abs(radius), 1e-4);
  let unsignedSupportSum = 0;
  let cancellationRatioSum = 0;
  let cancellationRatioMax = 0;
  let supportedSampleCount = 0;

  for (const [x, y, z] of EFFECTIVE_FIELD_SUPPORT_DIAGNOSTIC_SAMPLE_POINTS) {
    const sample = evaluateRaymarchEffectiveFieldPoint({
      modalFieldSlots,
      modalFieldPhaseSlots,
      modalFieldCount,
      boundaryMode,
      cavityGeometry,
      radius,
      x: x * sampleRadius,
      y: y * sampleRadius,
      z: z * sampleRadius,
      time: 0,
      resolution,
    });

    if (!(sample.unsignedSupport > EFFECTIVE_FIELD_ENERGY_EPSILON)) {
      continue;
    }

    supportedSampleCount += 1;
    unsignedSupportSum += sample.unsignedSupport;
    cancellationRatioSum += sample.cancellationRatio;
    cancellationRatioMax = Math.max(
      cancellationRatioMax,
      sample.cancellationRatio,
    );
  }

  return {
    effectiveFieldUnsignedSupportMean:
      supportedSampleCount > 0 ? unsignedSupportSum / supportedSampleCount : 0,
    effectiveFieldCancellationRatioMean:
      supportedSampleCount > 0
        ? cancellationRatioSum / supportedSampleCount
        : 0,
    effectiveFieldCancellationRatioMax: cancellationRatioMax,
    effectiveFieldSupportDiagnosticSampleCount: supportedSampleCount,
  };
}

function fieldDescriptorsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.boundaryMode === right.boundaryMode &&
    left.cavityGeometry === right.cavityGeometry &&
    left.radius === right.radius &&
    left.modalFieldCount === right.modalFieldCount &&
    left.modalFieldHash === right.modalFieldHash
  );
}

function spectralLightDescriptorsEqual(left, right) {
  if (!fieldDescriptorsEqual(left, right)) {
    return false;
  }

  return left.modalFieldColorHash === right.modalFieldColorHash;
}

function effectiveFieldDescriptorsEqual(left, right) {
  if (!fieldDescriptorsEqual(left, right)) {
    return false;
  }

  return (
    left.modalFieldPhaseHash === right.modalFieldPhaseHash &&
    left.phaseModeCount === right.phaseModeCount &&
    left.descriptorOverflow === right.descriptorOverflow &&
    left.resolution === right.resolution
  );
}

function resolveFieldRebuildReason(previousDescriptor, nextDescriptor) {
  if (!nextDescriptor) {
    return "missing-descriptor";
  }
  if (!previousDescriptor) {
    return "initial";
  }
  if (previousDescriptor.boundaryMode !== nextDescriptor.boundaryMode) {
    return "boundary-mode";
  }
  if (previousDescriptor.cavityGeometry !== nextDescriptor.cavityGeometry) {
    return "cavity-geometry";
  }
  if (previousDescriptor.radius !== nextDescriptor.radius) {
    return "radius";
  }
  if (previousDescriptor.modalFieldCount !== nextDescriptor.modalFieldCount) {
    return "mode-count";
  }
  if (previousDescriptor.modalFieldHash !== nextDescriptor.modalFieldHash) {
    return "mode-slots";
  }

  return null;
}

function resolveSpectralLightRebuildReason(previousDescriptor, nextDescriptor) {
  const fieldReason = resolveFieldRebuildReason(
    previousDescriptor,
    nextDescriptor,
  );
  if (fieldReason) {
    return fieldReason;
  }
  if (
    previousDescriptor.modalFieldColorHash !==
    nextDescriptor.modalFieldColorHash
  ) {
    return "color-slots";
  }

  return null;
}

function resolveEffectiveFieldRebuildReason(
  previousDescriptor,
  nextDescriptor,
) {
  const fieldReason = resolveFieldRebuildReason(
    previousDescriptor,
    nextDescriptor,
  );
  if (fieldReason) {
    return fieldReason;
  }
  if (
    previousDescriptor.modalFieldPhaseHash !==
    nextDescriptor.modalFieldPhaseHash
  ) {
    return "phase-slots";
  }
  if (previousDescriptor.phaseModeCount !== nextDescriptor.phaseModeCount) {
    return "phase-mode-count";
  }
  if (
    previousDescriptor.descriptorOverflow !== nextDescriptor.descriptorOverflow
  ) {
    return "descriptor-overflow";
  }
  if (previousDescriptor.resolution !== nextDescriptor.resolution) {
    return "resolution";
  }

  return null;
}

export function getRaymarchEffectiveFieldDescriptorStaleReason({
  descriptorFresh = false,
  reportedReason = null,
  rebuildPending = false,
  queuedDescriptor = null,
  activeDescriptor = null,
  nextDescriptor = null,
  hasDescriptorState = true,
} = {}) {
  if (descriptorFresh === true) {
    return null;
  }
  if (typeof reportedReason === "string" && reportedReason.length > 0) {
    return reportedReason;
  }
  if (rebuildPending === true) {
    return "rebuild-pending";
  }
  if (queuedDescriptor) {
    return "queued-descriptor";
  }
  if (hasDescriptorState !== true && !activeDescriptor && !nextDescriptor) {
    return null;
  }
  return resolveEffectiveFieldRebuildReason(activeDescriptor, nextDescriptor);
}

function resolveDispatchSize(resolution) {
  const [xGroupSize, yGroupSize, zGroupSize] =
    FIELD_CACHE_COMPUTE_WORKGROUP_SIZE;
  return [
    Math.ceil(resolution / xGroupSize),
    Math.ceil(resolution / yGroupSize),
    Math.ceil(resolution / zGroupSize),
  ];
}

export function createRaymarchFieldCache({
  resolution = RAYMARCH_FIELD_CACHE_RESOLUTION,
} = {}) {
  const normalizedResolution = Math.max(8, Math.round(resolution));
  const texture = createCacheTexture(normalizedResolution);

  return createCacheState({
    resolution: normalizedResolution,
    texture,
    mode: "cached",
  });
}

export function createRaymarchEffectiveFieldCache({
  resolution = RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
} = {}) {
  const normalizedResolution = normalizeEffectiveFieldResolution(resolution);
  const texture = createCacheTexture(normalizedResolution);
  const supportTexture = createCacheTexture(normalizedResolution);

  return {
    ...createCacheState({
      resolution: normalizedResolution,
      texture,
      mode: "effective-cached",
    }),
    semantic: "canonical-effective-field",
    supportTexture,
    supportSemantic: "effective-field-support",
    activeEffectiveFieldModeCount: 0,
    effectiveFieldAuthority: 0,
    modeIdentityRetentionRatio: 1,
    effectiveFieldMaxRepresentableModeIndex:
      getEffectiveFieldMaxRepresentableModeIndex(normalizedResolution),
    contributingEffectiveFieldModeCount: 0,
    zeroAmplitudeSkippedModeCount: 0,
    contributingModalEnergy: 0,
    bandwidthRejectedModeCount: 0,
    bandwidthRejectedModalEnergy: 0,
    effectiveFieldResolvedModalEnergyRatio: 1,
    effectiveFieldGradientEnvelope: 0,
    effectiveFieldUnsignedSupportMean: 0,
    effectiveFieldCancellationRatioMean: 0,
    effectiveFieldCancellationRatioMax: 0,
    effectiveFieldSupportDiagnosticSampleCount: 0,
  };
}

export function createRaymarchSpectralLightCache({
  resolution = RAYMARCH_FIELD_CACHE_RESOLUTION,
} = {}) {
  const normalizedResolution = Math.max(8, Math.round(resolution));
  const texture = createCacheTexture(normalizedResolution);

  return createCacheState({
    resolution: normalizedResolution,
    texture,
    mode: "off",
  });
}

export function disposeRaymarchFieldCache(fieldCache) {
  fieldCache?.texture?.dispose?.();
  if (fieldCache?.computeNodesByKey) {
    Object.values(fieldCache.computeNodesByKey).forEach((node) => {
      node?.dispose?.();
    });
  }
}

export function disposeRaymarchEffectiveFieldCache(effectiveFieldCache) {
  disposeRaymarchFieldCache(effectiveFieldCache);
  effectiveFieldCache?.supportTexture?.dispose?.();
}

export function disposeRaymarchSpectralLightCache(spectralLightCache) {
  disposeRaymarchFieldCache(spectralLightCache);
}

function createCacheTexture(resolution) {
  const texture = new Storage3DTexture(resolution, resolution, resolution);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.HalfFloatType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.wrapR = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createCacheState({ resolution, texture, mode }) {
  return {
    resolution,
    dispatchSize: resolveDispatchSize(resolution),
    texture,
    generation: 0,
    active: false,
    ready: false,
    rebuildPending: false,
    backend: "compute",
    lastError: null,
    activeDescriptor: null,
    rebuildCount: 0,
    lastRebuildReason: "uninitialized",
    queuedDescriptor: null,
    queuedRebuildReason: null,
    queuedRequest: null,
    pendingDescriptor: null,
    mode,
    computeNodesByKey: Object.create(null),
  };
}

export function advanceRaymarchCacheGeneration(cache) {
  if (!cache) {
    return 0;
  }

  cache.generation = (Math.floor(cache.generation ?? 0) + 1) >>> 0;
  return cache.generation;
}

function isCurrentRaymarchCacheGeneration(cache, generation) {
  return Boolean(cache && (cache.generation ?? 0) === generation);
}

export function clearQueuedRaymarchCacheRebuild(cache) {
  if (!cache) {
    return;
  }

  cache.queuedDescriptor = null;
  cache.queuedRebuildReason = null;
  cache.queuedRequest = null;
}

function takeQueuedCacheRebuild(cache) {
  const queued = {
    descriptor: cache.queuedDescriptor,
    rebuildReason: cache.queuedRebuildReason,
    request: cache.queuedRequest,
  };
  clearQueuedRaymarchCacheRebuild(cache);
  return queued;
}

function isPhaseOnlyEffectiveFieldRebuildReason(rebuildReason) {
  return (
    rebuildReason === "phase-slots" || rebuildReason === "phase-mode-count"
  );
}

export const RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES = Object.freeze({
  absent: "field-cache-absent",
  building: "field-cache-building",
  readyCurrent: "field-cache-ready-current",
  readyPhaseStale: "field-cache-ready-phase-stale",
  readyStale: "field-cache-ready-stale",
  blocked: "field-cache-blocked",
});

export function resolveRaymarchEffectiveFieldDescriptorBlockedReason(
  descriptor,
) {
  if (!descriptor) {
    return "missing-descriptor";
  }
  if (descriptor.descriptorOverflow === true) {
    return "descriptor-overflow";
  }
  if (!(Math.max(0, Math.round(descriptor.modalFieldCount || 0)) > 0)) {
    return "empty-descriptor";
  }
  if (
    !(
      Math.max(
        0,
        Math.round(descriptor.contributingEffectiveFieldModeCount || 0),
      ) > 0
    )
  ) {
    return "no-contributing-effective-field-modes";
  }
  return null;
}

function makeEffectiveFieldDrawableAuthority({
  drawable = false,
  state,
  blockedReason = null,
  staleReason = null,
  phaseStalenessSec = 0,
}) {
  return {
    drawable,
    state,
    blockedReason,
    staleReason,
    phaseStalenessSec: Number.isFinite(phaseStalenessSec)
      ? Math.max(0, phaseStalenessSec)
      : 0,
  };
}

export function resolveRaymarchEffectiveFieldDrawableAuthority(
  effectiveFieldCache,
  descriptor,
  { schedulerTimeSec = null } = {},
) {
  const descriptorBlockedReason =
    resolveRaymarchEffectiveFieldDescriptorBlockedReason(descriptor);
  if (descriptorBlockedReason) {
    return makeEffectiveFieldDrawableAuthority({
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.blocked,
      blockedReason: descriptorBlockedReason,
    });
  }

  if (!effectiveFieldCache) {
    return makeEffectiveFieldDrawableAuthority({
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.absent,
      blockedReason: "cache-unavailable",
    });
  }

  if (effectiveFieldCache.backend === "unavailable") {
    return makeEffectiveFieldDrawableAuthority({
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.blocked,
      blockedReason: "backend-unavailable",
    });
  }

  const activeDescriptor = effectiveFieldCache.activeDescriptor;
  const activeDescriptorBlockedReason =
    resolveRaymarchEffectiveFieldDescriptorBlockedReason(activeDescriptor);
  const hasDrawableActiveDescriptor = Boolean(
    effectiveFieldCache.ready &&
      activeDescriptor &&
      !activeDescriptorBlockedReason,
  );

  if (
    hasDrawableActiveDescriptor &&
    effectiveFieldDescriptorsEqual(activeDescriptor, descriptor)
  ) {
    return makeEffectiveFieldDrawableAuthority({
      drawable: true,
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.readyCurrent,
    });
  }

  const staleReason = hasDrawableActiveDescriptor
    ? resolveEffectiveFieldRebuildReason(activeDescriptor, descriptor)
    : null;
  if (isPhaseOnlyEffectiveFieldRebuildReason(staleReason)) {
    const lastSubmittedAtSec =
      effectiveFieldCache.lastRebuildSubmittedAtSec ?? null;
    const phaseStalenessSec =
      Number.isFinite(schedulerTimeSec) && Number.isFinite(lastSubmittedAtSec)
        ? schedulerTimeSec - lastSubmittedAtSec
        : 0;
    return makeEffectiveFieldDrawableAuthority({
      drawable: true,
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.readyPhaseStale,
      staleReason,
      phaseStalenessSec,
    });
  }

  if (hasDrawableActiveDescriptor && effectiveFieldCache.rebuildPending) {
    return makeEffectiveFieldDrawableAuthority({
      drawable: true,
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.readyStale,
      staleReason,
    });
  }

  if (effectiveFieldCache.rebuildPending) {
    return makeEffectiveFieldDrawableAuthority({
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.building,
      blockedReason: "cache-rebuild-pending",
    });
  }

  if (!effectiveFieldCache.ready) {
    return makeEffectiveFieldDrawableAuthority({
      state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.building,
      blockedReason: "cache-not-ready",
    });
  }

  return makeEffectiveFieldDrawableAuthority({
    state: RAYMARCH_EFFECTIVE_FIELD_DRAWABLE_STATES.blocked,
    blockedReason: activeDescriptorBlockedReason ?? "descriptor-mismatch",
  });
}

function getCacheSchedulerTimeSec(options) {
  return Number.isFinite(options?.schedulerTimeSec)
    ? options.schedulerTimeSec
    : null;
}

function setQueuedCacheRebuild(cache, descriptor, rebuildReason, request) {
  cache.queuedDescriptor = descriptor;
  cache.queuedRebuildReason = rebuildReason;
  cache.queuedRequest = request;
}

function markCacheBackendUnavailable(
  cache,
  message = "Renderer computeAsync unavailable",
) {
  advanceRaymarchCacheGeneration(cache);
  cache.backend = "unavailable";
  cache.ready = false;
  cache.rebuildPending = false;
  cache.pendingDescriptor = null;
  clearQueuedRaymarchCacheRebuild(cache);
  cache.lastError = message;
  cache.lastRebuildReason = "unavailable";
}

function queueLatestCacheRebuild(
  cache,
  descriptor,
  rebuildReason,
  request,
  descriptorsEqual,
) {
  if (descriptorsEqual(cache.pendingDescriptor, descriptor)) {
    clearQueuedRaymarchCacheRebuild(cache);
  } else {
    setQueuedCacheRebuild(cache, descriptor, rebuildReason, request);
  }

  return {
    enqueued: false,
    reason: "pending",
    descriptor: cache.pendingDescriptor,
    queuedDescriptor: cache.queuedDescriptor,
  };
}

function beginCacheRebuild(cache, descriptor, schedulerTimeSec = null) {
  const hadReadyCache = Boolean(cache.ready && cache.activeDescriptor);
  const generation = cache.generation ?? 0;
  cache.backend = "compute";
  cache.ready = hadReadyCache;
  cache.rebuildPending = true;
  cache.pendingDescriptor = descriptor;
  cache.lastError = null;
  if (Number.isFinite(schedulerTimeSec)) {
    cache.lastRebuildSubmittedAtSec = schedulerTimeSec;
  }
  clearQueuedRaymarchCacheRebuild(cache);
  return generation;
}

export function buildRaymarchFieldCacheDescriptor({
  modalFieldSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
}) {
  const normalizedModalFieldCount = Math.max(
    0,
    Math.round(modalFieldCount || 0),
  );
  return {
    boundaryMode: normalizeBoundaryMode(boundaryMode),
    cavityGeometry: normalizeCavityGeometry(cavityGeometry),
    radius: Number.isFinite(radius) ? radius : 1,
    modalFieldCount: normalizedModalFieldCount,
    modalFieldHash: hashModalFieldTopology(
      modalFieldSlots,
      normalizedModalFieldCount,
    ),
  };
}

export function buildRaymarchEffectiveFieldDescriptor({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  phaseModeCount = 0,
  phaseAuthority = 0,
  descriptorOverflow = false,
  modeIdentityRetentionRatio = 1,
  resolution = RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
}) {
  const normalizedResolution = normalizeEffectiveFieldResolution(resolution);
  const normalizedRadius = Number.isFinite(radius) ? radius : 1;
  const effectiveFieldScale = getEffectiveFieldScale(normalizedRadius);
  const fieldDescriptor = buildRaymarchFieldCacheDescriptor({
    modalFieldSlots,
    modalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius: normalizedRadius,
  });
  const effectiveDiagnostics = summarizeEffectiveFieldDiagnostics({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale: effectiveFieldScale,
    boundaryMode,
  });
  const effectiveSupportDiagnostics = summarizeEffectiveFieldSupportDiagnostics(
    {
      modalFieldSlots,
      modalFieldPhaseSlots,
      modalFieldCount,
      boundaryMode,
      cavityGeometry,
      radius: normalizedRadius,
      resolution: normalizedResolution,
    },
  );

  const descriptor = {
    ...fieldDescriptor,
    modalFieldPhaseHash: buildRaymarchPhaseSlotSignature({
      phaseSlots: modalFieldPhaseSlots,
      activeCount: modalFieldCount,
    }).slotHash,
    phaseModeCount: Math.max(0, Math.round(phaseModeCount || 0)),
    phaseAuthority: Math.round(clamp01(phaseAuthority) * 1000) / 1000,
    descriptorOverflow: descriptorOverflow === true,
    modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio),
    resolution: normalizedResolution,
    ...effectiveDiagnostics,
    ...effectiveSupportDiagnostics,
  };
  const effectiveFieldBlockedReason =
    resolveRaymarchEffectiveFieldDescriptorBlockedReason(descriptor);
  return {
    ...descriptor,
    effectiveFieldDrawable: effectiveFieldBlockedReason == null,
    effectiveFieldBlockedReason,
  };
}

export function buildRaymarchSpectralLightCacheDescriptor({
  modalFieldSlots,
  modalFieldColorSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
}) {
  const fieldDescriptor = buildRaymarchFieldCacheDescriptor({
    modalFieldSlots,
    modalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius,
  });

  return {
    ...fieldDescriptor,
    modalFieldColorHash: hashSpectralLightColorTopology(
      modalFieldColorSlots,
      modalFieldCount,
    ),
  };
}

function accumulateLayerAtPoint({
  slots,
  activeCount,
  weight,
  x,
  y,
  z,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let field = 0;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = (slots?.[offset + 3] ?? 0) * weight;
    if (!(amplitude > 0)) {
      continue;
    }
    const family = geometryBackend.evaluateMode({
      u: slots[offset] ?? 0,
      v: slots[offset + 1] ?? 0,
      w: slots[offset + 2] ?? 0,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
    field += amplitude * family.field;
    gradX += amplitude * family.gradX;
    gradY += amplitude * family.gradY;
    gradZ += amplitude * family.gradZ;
  }

  return { field, gradX, gradY, gradZ };
}

function accumulateSpectralLightLayerAtPoint({
  slots,
  colorSlots,
  activeCount,
  weight,
  x,
  y,
  z,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let colorWeight = 0;
  let chromaR = 0;
  let chromaG = 0;
  let chromaB = 0;
  let chromaWeight = 0;
  let totalAmplitude = 0;
  let signedPotential = 0;
  let unsignedPotential = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = (slots?.[offset + 3] ?? 0) * weight;
    if (!(amplitude > 0)) {
      continue;
    }

    totalAmplitude += amplitude;
    const family = geometryBackend.evaluateMode({
      u: slots[offset] ?? 0,
      v: slots[offset + 1] ?? 0,
      w: slots[offset + 2] ?? 0,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
    const contribution = amplitude * family.field;
    signedPotential += contribution;
    unsignedPotential += Math.abs(contribution);
    const localInfluence =
      Math.abs(contribution) * (colorSlots?.[offset + 3] ?? 0);
    const localChromaInfluence = localInfluence * localInfluence;
    colorWeight += localInfluence;
    chromaR += localChromaInfluence * (colorSlots?.[offset] ?? 0);
    chromaG += localChromaInfluence * (colorSlots?.[offset + 1] ?? 0);
    chromaB += localChromaInfluence * (colorSlots?.[offset + 2] ?? 0);
    chromaWeight += localChromaInfluence;
  }

  return {
    colorWeight,
    chromaR,
    chromaG,
    chromaB,
    chromaWeight,
    totalAmplitude,
    signedPotential,
    unsignedPotential,
  };
}

function accumulateSignedPotentialLayerAtPoint({
  slots,
  activeCount,
  weight,
  x,
  y,
  z,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let signedPotential = 0;
  let unsignedPotential = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = (slots?.[offset + 3] ?? 0) * weight;
    if (!(amplitude > 0)) {
      continue;
    }
    const family = geometryBackend.evaluateMode({
      u: slots[offset] ?? 0,
      v: slots[offset + 1] ?? 0,
      w: slots[offset + 2] ?? 0,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
    const contribution = amplitude * family.field;
    signedPotential += contribution;
    unsignedPotential += Math.abs(contribution);
  }

  return { signedPotential, unsignedPotential };
}

export function evaluateRaymarchFieldCachePoint({
  modalFieldSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const scale = Math.PI / Math.max(radius, 1e-4);
  const modalField = accumulateLayerAtPoint({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry,
  });
  const amplitudeNorm = Math.max(
    sumSlotAmplitude(modalFieldSlots, modalFieldCount),
    0.01,
  );

  return {
    field: modalField.field / amplitudeNorm,
    gradX: modalField.gradX / amplitudeNorm,
    gradY: modalField.gradY / amplitudeNorm,
    gradZ: modalField.gradZ / amplitudeNorm,
  };
}

function accumulateEffectiveFieldLayerAtPoint({
  slots,
  phaseSlots,
  activeCount,
  x,
  y,
  z,
  time,
  resolution,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let field = 0;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;
  let unsignedSupport = 0;
  let authoritySum = 0;
  let totalWeight = 0;
  let contributingEffectiveFieldModeCount = 0;
  let zeroAmplitudeSkippedModeCount = 0;
  let bandwidthRejectedModeCount = 0;
  let bandwidthRejectedModalEnergy = 0;
  let gradientEnvelopeNumerator = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const basisScale = getEffectiveFieldGradientBasisScale(scale, boundaryMode);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      zeroAmplitudeSkippedModeCount += 1;
      continue;
    }
    if (!isEffectiveFieldSlotRepresentable({ slots, offset, resolution })) {
      bandwidthRejectedModeCount += 1;
      bandwidthRejectedModalEnergy += amplitude;
      continue;
    }
    totalWeight += amplitude;
    contributingEffectiveFieldModeCount += 1;
    gradientEnvelopeNumerator +=
      amplitude *
      getEffectiveFieldSlotGradientBound({
        slots,
        offset,
        basisScale,
      });
    const beta = Math.min(
      1,
      Math.max(
        0,
        (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
      ),
    );
    authoritySum += amplitude * beta;
    const phase =
      (phaseSlots?.[offset] ?? 0) + (phaseSlots?.[offset + 1] ?? 0) * time;
    const coefficient = amplitude * (1 - beta + beta * Math.cos(phase));
    const family = geometryBackend.evaluateMode({
      u: slots[offset] ?? 0,
      v: slots[offset + 1] ?? 0,
      w: slots[offset + 2] ?? 0,
      x,
      y,
      z,
      scale,
      boundaryMode,
    });
    field += coefficient * family.field;
    gradX += coefficient * family.gradX;
    gradY += coefficient * family.gradY;
    gradZ += coefficient * family.gradZ;
    unsignedSupport += Math.abs(coefficient * family.field);
  }

  return {
    field,
    gradX,
    gradY,
    gradZ,
    unsignedSupport,
    authoritySum,
    totalWeight,
    contributingEffectiveFieldModeCount,
    zeroAmplitudeSkippedModeCount,
    bandwidthRejectedModeCount,
    bandwidthRejectedModalEnergy,
    gradientEnvelopeNumerator,
  };
}

export function evaluateRaymarchEffectiveFieldPoint({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
  time = 0,
  resolution = RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeEffectiveFieldResolution(resolution);
  const scale = getEffectiveFieldScale(radius);
  const modalField = accumulateEffectiveFieldLayerAtPoint({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    x,
    y,
    z,
    time,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const amplitudeNorm = Math.max(
    modalField.totalWeight,
    EFFECTIVE_FIELD_ENERGY_EPSILON,
  );
  const totalRepresentedModalEnergy =
    modalField.totalWeight + modalField.bandwidthRejectedModalEnergy;
  const field = modalField.field / amplitudeNorm;
  const unsignedSupport = modalField.unsignedSupport / amplitudeNorm;
  const cancellationRatio =
    unsignedSupport > 0
      ? Math.min(
          1,
          Math.max(
            0,
            1 -
              Math.abs(field) /
                Math.max(EFFECTIVE_FIELD_ENERGY_EPSILON, unsignedSupport),
          ),
        )
      : 0;

  return {
    field,
    gradX: modalField.gradX / amplitudeNorm,
    gradY: modalField.gradY / amplitudeNorm,
    gradZ: modalField.gradZ / amplitudeNorm,
    unsignedSupport,
    cancellationRatio,
    effectiveFieldAuthority: Math.min(
      1,
      Math.max(
        0,
        modalField.authoritySum /
          Math.max(EFFECTIVE_FIELD_ENERGY_EPSILON, modalField.totalWeight),
      ),
    ),
    effectiveFieldMaxRepresentableModeIndex:
      getEffectiveFieldMaxRepresentableModeIndex(normalizedResolution),
    contributingEffectiveFieldModeCount:
      modalField.contributingEffectiveFieldModeCount,
    zeroAmplitudeSkippedModeCount: modalField.zeroAmplitudeSkippedModeCount,
    contributingModalEnergy: modalField.totalWeight,
    bandwidthRejectedModeCount: modalField.bandwidthRejectedModeCount,
    bandwidthRejectedModalEnergy: modalField.bandwidthRejectedModalEnergy,
    effectiveFieldResolvedModalEnergyRatio:
      totalRepresentedModalEnergy > EFFECTIVE_FIELD_ENERGY_EPSILON
        ? modalField.totalWeight / totalRepresentedModalEnergy
        : 1,
    effectiveFieldGradientEnvelope:
      modalField.gradientEnvelopeNumerator / amplitudeNorm,
  };
}

export function evaluateRaymarchSpectralLightCachePoint({
  modalFieldSlots,
  modalFieldColorSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const scale = Math.PI / Math.max(radius, 1e-4);
  const modalField = accumulateSpectralLightLayerAtPoint({
    slots: modalFieldSlots,
    colorSlots: modalFieldColorSlots,
    activeCount: modalFieldCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const amplitudeNorm = Math.max(modalField.totalAmplitude, 0.01);
  const signedVisibility = deriveSignedInterferenceVisibility(
    modalField.signedPotential,
    modalField.unsignedPotential,
  );
  const colorWeight =
    (modalField.colorWeight * signedVisibility) / amplitudeNorm;
  const chromaScale =
    modalField.chromaWeight > SPECTRAL_LIGHT_CHROMA_EPSILON
      ? 1 / modalField.chromaWeight
      : 0;

  return {
    r: modalField.chromaR * chromaScale * colorWeight,
    g: modalField.chromaG * chromaScale * colorWeight,
    b: modalField.chromaB * chromaScale * colorWeight,
    colorWeight,
  };
}

export function evaluateRaymarchSignedPotentialAtPoint({
  modalFieldSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const scale = Math.PI / Math.max(radius, 1e-4);
  const modalField = accumulateSignedPotentialLayerAtPoint({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });

  return {
    signedPotential: modalField.signedPotential,
    unsignedPotential: modalField.unsignedPotential,
    cancellation: Math.min(
      1,
      Math.max(
        0,
        1 -
          Math.abs(modalField.signedPotential) /
            Math.max(0.01, modalField.unsignedPotential),
      ),
    ),
  };
}

function createComputeKernel({
  fieldCache,
  modalFieldModeBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture } = fieldCache;
  const uRadius = uniforms.uRadius;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const resolutionUint = uint(resolution);
  const resolutionFloat = float(resolution);
  const half = float(0.5);
  const two = float(2.0);
  const zero = float(0.0);

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(resolutionUint));

    If(inBounds, () => {
      const xCoord = float(voxelCoord.x)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const yCoord = float(voxelCoord.y)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const zCoord = float(voxelCoord.z)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
      const field = zero.toVar();
      const gradX = zero.toVar();
      const gradY = zero.toVar();
      const gradZ = zero.toVar();
      const totalAmplitude = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(modalFieldCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(modalFieldActiveCount), () => {}).Else(() => {
            const slot = modalFieldModeBuffer.element(i);
            const amplitude = slot.w.toVar();
            const family = geometryBackend.evaluateModeNode({
              u: slot.x,
              v: slot.y,
              w: slot.z,
              xCoord,
              yCoord,
              zCoord,
              scale,
              boundaryMode,
            });
            totalAmplitude.addAssign(amplitude);
            field.addAssign(amplitude.mul(family.field));
            gradX.addAssign(amplitude.mul(family.gradX));
            gradY.addAssign(amplitude.mul(family.gradY));
            gradZ.addAssign(amplitude.mul(family.gradZ));
          });
        },
      );

      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          field.div(totalAmplitude.max(float(0.01))),
          gradX.div(totalAmplitude.max(float(0.01))),
          gradY.div(totalAmplitude.max(float(0.01))),
          gradZ.div(totalAmplitude.max(float(0.01))),
        ),
      ).toWriteOnly();
    });
  })().compute(
    fieldCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function createSpectralLightComputeKernel({
  spectralLightCache,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture } = spectralLightCache;
  const uRadius = uniforms.uRadius;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const resolutionUint = uint(resolution);
  const resolutionFloat = float(resolution);
  const half = float(0.5);
  const two = float(2.0);
  const zero = float(0.0);

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(resolutionUint));

    If(inBounds, () => {
      const xCoord = float(voxelCoord.x)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const yCoord = float(voxelCoord.y)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const zCoord = float(voxelCoord.z)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
      const colorSumX = zero.toVar();
      const colorSumY = zero.toVar();
      const colorSumZ = zero.toVar();
      const colorWeight = zero.toVar();
      const chromaSumX = zero.toVar();
      const chromaSumY = zero.toVar();
      const chromaSumZ = zero.toVar();
      const chromaWeight = zero.toVar();
      const totalAmplitude = zero.toVar();
      const signedPotential = zero.toVar();
      const unsignedPotential = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(modalFieldCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(modalFieldActiveCount), () => {}).Else(() => {
            const slot = modalFieldModeBuffer.element(i);
            const amplitude = slot.w.toVar();
            const family = geometryBackend.evaluateModeNode({
              u: slot.x,
              v: slot.y,
              w: slot.z,
              xCoord,
              yCoord,
              zCoord,
              scale,
              boundaryMode,
            });
            const colorSlot = modalFieldColorBuffer.element(i);
            totalAmplitude.addAssign(amplitude);
            const contribution = amplitude.mul(family.field).toVar();
            signedPotential.addAssign(contribution);
            unsignedPotential.addAssign(abs(contribution));
            const localInfluence = abs(contribution).mul(colorSlot.w).toVar();
            const localChromaInfluence = localInfluence
              .mul(localInfluence)
              .toVar();
            colorSumX.addAssign(localInfluence.mul(colorSlot.x));
            colorSumY.addAssign(localInfluence.mul(colorSlot.y));
            colorSumZ.addAssign(localInfluence.mul(colorSlot.z));
            colorWeight.addAssign(localInfluence);
            chromaSumX.addAssign(localChromaInfluence.mul(colorSlot.x));
            chromaSumY.addAssign(localChromaInfluence.mul(colorSlot.y));
            chromaSumZ.addAssign(localChromaInfluence.mul(colorSlot.z));
            chromaWeight.addAssign(localChromaInfluence);
          });
        },
      );

      const signedVisibility = clamp(
        smoothstep(
          float(SIGNED_INTERFERENCE_VISIBILITY_START),
          float(SIGNED_INTERFERENCE_VISIBILITY_END),
          abs(signedPotential).div(
            unsignedPotential.max(
              float(SIGNED_INTERFERENCE_VISIBILITY_EPSILON),
            ),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      const normalizedAmplitude = totalAmplitude.max(float(0.01));
      const normalizedColorWeight = colorWeight
        .mul(signedVisibility)
        .div(normalizedAmplitude)
        .toVar();
      const chromaNormalizer = chromaWeight.max(
        float(SPECTRAL_LIGHT_CHROMA_EPSILON),
      );
      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          chromaSumX.div(chromaNormalizer).mul(normalizedColorWeight),
          chromaSumY.div(chromaNormalizer).mul(normalizedColorWeight),
          chromaSumZ.div(chromaNormalizer).mul(normalizedColorWeight),
          normalizedColorWeight,
        ),
      ).toWriteOnly();
    });
  })().compute(
    spectralLightCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function accumulateEffectiveFieldComputeLayer({
  modeBuffer,
  phaseBuffer,
  capacity,
  activeCount,
  weight,
  maxRepresentableModeIndex,
  xCoord,
  yCoord,
  zCoord,
  scale,
  boundaryMode,
  geometryBackend,
  uTime,
  totalAmplitude,
  field,
  gradX,
  gradY,
  gradZ,
  unsignedSupport,
}) {
  Loop(
    {
      start: int(0),
      end: int(capacity),
      type: "int",
      condition: "<",
    },
    ({ i }) => {
      If(i.greaterThanEqual(activeCount), () => {}).Else(() => {
        const slot = modeBuffer.element(i);
        const phaseSlot = phaseBuffer.element(i);
        const amplitude = slot.w.mul(weight).toVar();
        const representable = abs(slot.x)
          .lessThanEqual(maxRepresentableModeIndex)
          .and(abs(slot.y).lessThanEqual(maxRepresentableModeIndex))
          .and(abs(slot.z).lessThanEqual(maxRepresentableModeIndex));
        If(representable, () => {
          const beta = clamp(
            phaseSlot.z.mul(phaseSlot.w),
            float(0.0),
            float(1.0),
          );
          const phase = phaseSlot.x.add(phaseSlot.y.mul(uTime));
          const phaseScale = float(1.0)
            .sub(beta)
            .add(beta.mul(cos(phase)))
            .toVar();
          const coefficient = amplitude.mul(phaseScale).toVar();
          const family = geometryBackend.evaluateModeNode({
            u: slot.x,
            v: slot.y,
            w: slot.z,
            xCoord,
            yCoord,
            zCoord,
            scale,
            boundaryMode,
          });
          totalAmplitude.addAssign(amplitude);
          const contribution = coefficient.mul(family.field).toVar();
          field.addAssign(contribution);
          gradX.addAssign(coefficient.mul(family.gradX));
          gradY.addAssign(coefficient.mul(family.gradY));
          gradZ.addAssign(coefficient.mul(family.gradZ));
          unsignedSupport.addAssign(abs(contribution));
        });
      });
    },
  );
}

function createEffectiveFieldComputeKernel({
  effectiveFieldCache,
  modalFieldModeBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture, supportTexture } = effectiveFieldCache;
  const uRadius = uniforms.uRadius;
  const uTime = uniforms.uTime;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const maxRepresentableModeIndex = float(
    getEffectiveFieldMaxRepresentableModeIndex(resolution),
  );
  const resolutionUint = uint(resolution);
  const resolutionFloat = float(resolution);
  const half = float(0.5);
  const two = float(2.0);
  const zero = float(0.0);

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(resolutionUint));

    If(inBounds, () => {
      const xCoord = float(voxelCoord.x)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const yCoord = float(voxelCoord.y)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const zCoord = float(voxelCoord.z)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
      const field = zero.toVar();
      const gradX = zero.toVar();
      const gradY = zero.toVar();
      const gradZ = zero.toVar();
      const unsignedSupport = zero.toVar();
      const totalAmplitude = zero.toVar();

      accumulateEffectiveFieldComputeLayer({
        modeBuffer: modalFieldModeBuffer,
        phaseBuffer: modalFieldPhaseBuffer,
        capacity: modalFieldCapacity,
        activeCount: modalFieldActiveCount,
        weight: float(1.0),
        maxRepresentableModeIndex,
        xCoord,
        yCoord,
        zCoord,
        scale,
        boundaryMode,
        geometryBackend,
        uTime,
        totalAmplitude,
        field,
        gradX,
        gradY,
        gradZ,
        unsignedSupport,
      });

      const normalizedAmplitude = totalAmplitude.max(
        float(EFFECTIVE_FIELD_ENERGY_EPSILON),
      );
      const normalizedField = field.div(normalizedAmplitude).toVar();
      const normalizedUnsignedSupport = unsignedSupport
        .div(normalizedAmplitude)
        .toVar();
      const cancellationRatio = clamp(
        float(1.0).sub(
          abs(normalizedField).div(
            normalizedUnsignedSupport.max(
              float(EFFECTIVE_FIELD_ENERGY_EPSILON),
            ),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          normalizedField,
          gradX.div(normalizedAmplitude),
          gradY.div(normalizedAmplitude),
          gradZ.div(normalizedAmplitude),
        ),
      ).toWriteOnly();
      textureStore(
        supportTexture,
        uvec3(voxelCoord),
        vec4(normalizedUnsignedSupport, cancellationRatio, zero, zero),
      ).toWriteOnly();
    });
  })().compute(
    effectiveFieldCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function getOrCreateRaymarchFieldCacheComputeNode(
  fieldCache,
  {
    modalFieldModeBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode,
    cavityGeometry,
  },
) {
  if (!fieldCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const nodeKey = `${normalizedCavityGeometry}:${normalizedBoundaryMode}`;
  const cachedNode = fieldCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createComputeKernel({
    fieldCache,
    modalFieldModeBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  fieldCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchSpectralLightCacheComputeNode(
  spectralLightCache,
  {
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode,
    cavityGeometry,
  },
) {
  if (!spectralLightCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const nodeKey = `${normalizedCavityGeometry}:${normalizedBoundaryMode}`;
  const cachedNode = spectralLightCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createSpectralLightComputeKernel({
    spectralLightCache,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  spectralLightCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchEffectiveFieldComputeNode(
  effectiveFieldCache,
  {
    modalFieldModeBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode,
    cavityGeometry,
  },
) {
  if (!effectiveFieldCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const nodeKey = `${normalizedCavityGeometry}:${normalizedBoundaryMode}`;
  const cachedNode = effectiveFieldCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createEffectiveFieldComputeKernel({
    effectiveFieldCache,
    modalFieldModeBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  effectiveFieldCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function dispatchQueuedRaymarchFieldCacheRebuild(fieldCache) {
  const queued = takeQueuedCacheRebuild(fieldCache);
  if (
    !queued.descriptor ||
    !queued.request ||
    fieldDescriptorsEqual(fieldCache.activeDescriptor, queued.descriptor)
  ) {
    return;
  }

  enqueueRaymarchFieldCacheRebuild(
    fieldCache,
    queued.request.renderer,
    queued.descriptor,
    queued.rebuildReason ?? "queued",
    queued.request.options,
  );
}

function dispatchQueuedRaymarchSpectralLightCacheRebuild(spectralLightCache) {
  const queued = takeQueuedCacheRebuild(spectralLightCache);
  if (
    !queued.descriptor ||
    !queued.request ||
    spectralLightDescriptorsEqual(
      spectralLightCache.activeDescriptor,
      queued.descriptor,
    )
  ) {
    return;
  }

  enqueueRaymarchSpectralLightCacheRebuild(
    spectralLightCache,
    queued.request.renderer,
    queued.descriptor,
    queued.rebuildReason ?? "queued",
    queued.request.options,
  );
}

function dispatchQueuedRaymarchEffectiveFieldCacheRebuild(effectiveFieldCache) {
  const queued = takeQueuedCacheRebuild(effectiveFieldCache);
  if (
    !queued.descriptor ||
    !queued.request ||
    effectiveFieldDescriptorsEqual(
      effectiveFieldCache.activeDescriptor,
      queued.descriptor,
    )
  ) {
    return;
  }

  enqueueRaymarchEffectiveFieldRebuild(
    effectiveFieldCache,
    queued.request.renderer,
    queued.descriptor,
    queued.rebuildReason ?? "queued",
    queued.request.options,
  );
}

export function enqueueRaymarchFieldCacheRebuild(
  fieldCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const {
    modalFieldModeBuffer,
    modalFieldCapacity,
    uniforms,
  } = options;
  if (!fieldCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (fieldCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (fieldCache.rebuildPending) {
    return queueLatestCacheRebuild(
      fieldCache,
      descriptor,
      rebuildReason,
      { renderer, options },
      fieldDescriptorsEqual,
    );
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    markCacheBackendUnavailable(fieldCache);
    return { enqueued: false, reason: "unavailable" };
  }

  const computeNode = getOrCreateRaymarchFieldCacheComputeNode(fieldCache, {
    modalFieldModeBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode: descriptor.boundaryMode,
    cavityGeometry: descriptor.cavityGeometry,
  });
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  const rebuildGeneration = beginCacheRebuild(fieldCache, descriptor);
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        if (!isCurrentRaymarchCacheGeneration(fieldCache, rebuildGeneration)) {
          return;
        }
        fieldCache.activeDescriptor = descriptor;
        fieldCache.ready = true;
        fieldCache.rebuildPending = false;
        fieldCache.pendingDescriptor = null;
        fieldCache.lastError = null;
        fieldCache.backend = "compute";
        fieldCache.rebuildCount += 1;
        fieldCache.lastRebuildReason = rebuildReason;
        dispatchQueuedRaymarchFieldCacheRebuild(fieldCache);
      },
      (error) => {
        if (!isCurrentRaymarchCacheGeneration(fieldCache, rebuildGeneration)) {
          return;
        }
        markCacheBackendUnavailable(
          fieldCache,
          error instanceof Error ? error.message : String(error),
        );
      },
    );

  void submission;

  return {
    enqueued: true,
    reason: rebuildReason,
    descriptor,
  };
}

export function enqueueRaymarchSpectralLightCacheRebuild(
  spectralLightCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const {
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldCapacity,
    uniforms,
  } = options;
  if (!spectralLightCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (spectralLightCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (spectralLightCache.rebuildPending) {
    return queueLatestCacheRebuild(
      spectralLightCache,
      descriptor,
      rebuildReason,
      { renderer, options },
      spectralLightDescriptorsEqual,
    );
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    markCacheBackendUnavailable(spectralLightCache);
    return { enqueued: false, reason: "unavailable" };
  }

  const computeNode = getOrCreateRaymarchSpectralLightCacheComputeNode(
    spectralLightCache,
    {
      modalFieldModeBuffer,
      modalFieldColorBuffer,
      modalFieldCapacity,
      uniforms,
      boundaryMode: descriptor.boundaryMode,
      cavityGeometry: descriptor.cavityGeometry,
    },
  );
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  const rebuildGeneration = beginCacheRebuild(spectralLightCache, descriptor);
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        if (
          !isCurrentRaymarchCacheGeneration(
            spectralLightCache,
            rebuildGeneration,
          )
        ) {
          return;
        }
        spectralLightCache.activeDescriptor = descriptor;
        spectralLightCache.ready = true;
        spectralLightCache.rebuildPending = false;
        spectralLightCache.pendingDescriptor = null;
        spectralLightCache.lastError = null;
        spectralLightCache.backend = "compute";
        spectralLightCache.rebuildCount += 1;
        spectralLightCache.lastRebuildReason = rebuildReason;
        dispatchQueuedRaymarchSpectralLightCacheRebuild(spectralLightCache);
      },
      (error) => {
        if (
          !isCurrentRaymarchCacheGeneration(
            spectralLightCache,
            rebuildGeneration,
          )
        ) {
          return;
        }
        markCacheBackendUnavailable(
          spectralLightCache,
          error instanceof Error ? error.message : String(error),
        );
      },
    );

  void submission;

  return {
    enqueued: true,
    reason: rebuildReason,
    descriptor,
  };
}

export function enqueueRaymarchEffectiveFieldRebuild(
  effectiveFieldCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const {
    modalFieldModeBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    uniforms,
  } = options;
  if (!effectiveFieldCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (effectiveFieldCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (effectiveFieldCache.rebuildPending) {
    return queueLatestCacheRebuild(
      effectiveFieldCache,
      descriptor,
      rebuildReason,
      { renderer, options },
      effectiveFieldDescriptorsEqual,
    );
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    markCacheBackendUnavailable(effectiveFieldCache);
    return { enqueued: false, reason: "unavailable" };
  }

  const computeNode = getOrCreateRaymarchEffectiveFieldComputeNode(
    effectiveFieldCache,
    {
      modalFieldModeBuffer,
      modalFieldPhaseBuffer,
      modalFieldCapacity,
      uniforms,
      boundaryMode: descriptor.boundaryMode,
      cavityGeometry: descriptor.cavityGeometry,
    },
  );
  if (!computeNode) {
    markCacheBackendUnavailable(effectiveFieldCache);
    return { enqueued: false, reason: "unavailable" };
  }

  const rebuildGeneration = beginCacheRebuild(
    effectiveFieldCache,
    descriptor,
    getCacheSchedulerTimeSec(options),
  );
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        if (
          !isCurrentRaymarchCacheGeneration(
            effectiveFieldCache,
            rebuildGeneration,
          )
        ) {
          return;
        }
        effectiveFieldCache.activeDescriptor = descriptor;
        effectiveFieldCache.ready = true;
        effectiveFieldCache.rebuildPending = false;
        effectiveFieldCache.pendingDescriptor = null;
        effectiveFieldCache.lastError = null;
        effectiveFieldCache.backend = "compute";
        effectiveFieldCache.rebuildCount += 1;
        effectiveFieldCache.lastRebuildReason = rebuildReason;
        effectiveFieldCache.activeEffectiveFieldModeCount =
          descriptor.phaseModeCount ?? 0;
        effectiveFieldCache.effectiveFieldAuthority =
          descriptor.phaseAuthority ?? 0;
        effectiveFieldCache.modeIdentityRetentionRatio =
          descriptor.modeIdentityRetentionRatio ?? 1;
        effectiveFieldCache.effectiveFieldMaxRepresentableModeIndex =
          descriptor.effectiveFieldMaxRepresentableModeIndex ??
          getEffectiveFieldMaxRepresentableModeIndex(
            effectiveFieldCache.resolution,
          );
        effectiveFieldCache.contributingEffectiveFieldModeCount =
          descriptor.contributingEffectiveFieldModeCount ?? 0;
        effectiveFieldCache.zeroAmplitudeSkippedModeCount =
          descriptor.zeroAmplitudeSkippedModeCount ?? 0;
        effectiveFieldCache.contributingModalEnergy =
          descriptor.contributingModalEnergy ?? 0;
        effectiveFieldCache.bandwidthRejectedModeCount =
          descriptor.bandwidthRejectedModeCount ?? 0;
        effectiveFieldCache.bandwidthRejectedModalEnergy =
          descriptor.bandwidthRejectedModalEnergy ?? 0;
        effectiveFieldCache.effectiveFieldResolvedModalEnergyRatio =
          descriptor.effectiveFieldResolvedModalEnergyRatio ?? 1;
        effectiveFieldCache.effectiveFieldGradientEnvelope =
          descriptor.effectiveFieldGradientEnvelope ?? 0;
        effectiveFieldCache.effectiveFieldUnsignedSupportMean =
          descriptor.effectiveFieldUnsignedSupportMean ?? 0;
        effectiveFieldCache.effectiveFieldCancellationRatioMean =
          descriptor.effectiveFieldCancellationRatioMean ?? 0;
        effectiveFieldCache.effectiveFieldCancellationRatioMax =
          descriptor.effectiveFieldCancellationRatioMax ?? 0;
        effectiveFieldCache.effectiveFieldSupportDiagnosticSampleCount =
          descriptor.effectiveFieldSupportDiagnosticSampleCount ?? 0;
        dispatchQueuedRaymarchEffectiveFieldCacheRebuild(effectiveFieldCache);
      },
      (error) => {
        if (
          !isCurrentRaymarchCacheGeneration(
            effectiveFieldCache,
            rebuildGeneration,
          )
        ) {
          return;
        }
        markCacheBackendUnavailable(
          effectiveFieldCache,
          error instanceof Error ? error.message : String(error),
        );
      },
    );

  void submission;

  return {
    enqueued: true,
    reason: rebuildReason,
    descriptor,
  };
}

export function shouldRebuildRaymarchFieldCache(fieldCache, descriptor) {
  if (!fieldCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }

  if (fieldCache.rebuildPending) {
    const rebuildReason = resolveFieldRebuildReason(
      fieldCache.queuedDescriptor ??
        fieldCache.pendingDescriptor ??
        fieldCache.activeDescriptor,
      descriptor,
    );

    return {
      needsRebuild: Boolean(rebuildReason),
      reason: rebuildReason ?? "pending",
    };
  }

  const rebuildReason = resolveFieldRebuildReason(
    fieldCache.activeDescriptor,
    descriptor,
  );

  return {
    needsRebuild: Boolean(rebuildReason),
    reason: rebuildReason ?? "unchanged",
  };
}

export function isRaymarchFieldCacheReadyForDescriptor(fieldCache, descriptor) {
  return Boolean(
    fieldCache?.ready &&
    !fieldCache?.rebuildPending &&
    fieldDescriptorsEqual(fieldCache.activeDescriptor, descriptor),
  );
}

export function shouldRebuildRaymarchEffectiveFieldCache(
  effectiveFieldCache,
  descriptor,
) {
  if (!effectiveFieldCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }

  if (effectiveFieldCache.rebuildPending) {
    const rebuildReason = resolveEffectiveFieldRebuildReason(
      effectiveFieldCache.queuedDescriptor ??
        effectiveFieldCache.pendingDescriptor ??
        effectiveFieldCache.activeDescriptor,
      descriptor,
    );

    return {
      needsRebuild: Boolean(rebuildReason),
      reason: rebuildReason ?? "pending",
    };
  }

  const rebuildReason = resolveEffectiveFieldRebuildReason(
    effectiveFieldCache.activeDescriptor,
    descriptor,
  );

  return {
    needsRebuild: Boolean(rebuildReason),
    reason: rebuildReason ?? "unchanged",
  };
}

export function isRaymarchEffectiveFieldCacheReadyForDescriptor(
  effectiveFieldCache,
  descriptor,
) {
  return Boolean(
    effectiveFieldCache?.ready &&
    !effectiveFieldCache?.rebuildPending &&
    effectiveFieldDescriptorsEqual(
      effectiveFieldCache.activeDescriptor,
      descriptor,
    ),
  );
}

export function shouldRebuildRaymarchSpectralLightCache(
  spectralLightCache,
  descriptor,
) {
  if (!spectralLightCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }

  if (spectralLightCache.rebuildPending) {
    const rebuildReason = resolveSpectralLightRebuildReason(
      spectralLightCache.queuedDescriptor ??
        spectralLightCache.pendingDescriptor ??
        spectralLightCache.activeDescriptor,
      descriptor,
    );

    return {
      needsRebuild: Boolean(rebuildReason),
      reason: rebuildReason ?? "pending",
    };
  }

  const rebuildReason = resolveSpectralLightRebuildReason(
    spectralLightCache.activeDescriptor,
    descriptor,
  );

  return {
    needsRebuild: Boolean(rebuildReason),
    reason: rebuildReason ?? "unchanged",
  };
}

export function isRaymarchSpectralLightCacheReadyForDescriptor(
  spectralLightCache,
  descriptor,
) {
  return Boolean(
    spectralLightCache?.ready &&
    !spectralLightCache?.rebuildPending &&
    spectralLightDescriptorsEqual(
      spectralLightCache.activeDescriptor,
      descriptor,
    ),
  );
}
