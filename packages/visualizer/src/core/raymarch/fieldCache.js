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
  length,
  textureStore,
  uvec3,
  uint,
  vec3,
  vec4,
} from "three/tsl";
import { normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { RAYMARCH_FIELD_CACHE_OVERRIDE_MODES } from "../../visualization/fieldEvaluation.js";
import { DETAIL_LAYER_WEIGHT } from "./fieldShaping.js";

export const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;
export const RAYMARCH_PHASE_OVERLAY_RESOLUTION = 32;
export const RAYMARCH_PHASE_OVERLAY_UPDATE_INTERVAL_MS = 1000 / 15;
export const RAYMARCH_PHASE_OVERLAY_BACKBONE_LIMIT = 2;
export const RAYMARCH_PHASE_OVERLAY_DETAIL_LIMIT = 6;

/*
Dev overrides for manual testing:

window.__baryonFieldCacheOverride = "direct";
window.__baryonFieldCacheOverride = "cached";

Legacy note: "analytic" is no longer recognized here and now falls back to
"cached".

You can confirm the active mode in window.__baryonAuditSnapshot:

window.__baryonAuditSnapshot?.fieldEvaluationMode
window.__baryonAuditSnapshot?.fieldCacheOverride

*/
const FIELD_CACHE_COMPUTE_WORKGROUP_SIZE = Object.freeze([8, 8, 4]);
const FIELD_CACHE_WEIGHT_QUANTIZATION = 1024;
const PHASE_OVERLAY_CANCELLATION_SUPPORT_EPSILON = 1e-5;
const PHASE_OVERLAY_CANCELLATION_SUPPORT_FULL = 0.01;

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

function hashSlotLayer(slots, activeCount) {
  let hash = FNV_OFFSET_BASIS;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    hash = hashFloat32(slots?.[offset] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 1] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 2] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 3] ?? 0, hash);
  }

  return hash >>> 0;
}

function sumWeightedSlotAmplitude(slots, activeCount, weight = 1) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  let total = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = slots?.[offset + 3] ?? 0;
    if (amplitude > 0) {
      total += amplitude * weight;
    }
  }

  return total;
}

function hashFieldTopologyLayer({
  slots,
  activeCount,
  weight = 1,
  totalWeightedAmplitude = 0,
}) {
  let hash = FNV_OFFSET_BASIS;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const safeTotal = Math.max(totalWeightedAmplitude, 1e-6);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const weightedAmplitude = Math.max(0, slots?.[offset + 3] ?? 0) * weight;
    const normalizedWeight = Math.round(
      Math.min(1, weightedAmplitude / safeTotal) *
        FIELD_CACHE_WEIGHT_QUANTIZATION,
    );
    hash = hashFloat32(slots?.[offset] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 1] ?? 0, hash);
    hash = hashFloat32(slots?.[offset + 2] ?? 0, hash);
    hash = hashUint32(normalizedWeight, hash);
  }

  return hash >>> 0;
}

function fieldDescriptorsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.boundaryMode === right.boundaryMode &&
    left.cavityGeometry === right.cavityGeometry &&
    left.radius === right.radius &&
    left.backboneCount === right.backboneCount &&
    left.detailCount === right.detailCount &&
    left.backboneHash === right.backboneHash &&
    left.detailHash === right.detailHash
  );
}

function spectralLightDescriptorsEqual(left, right) {
  if (!fieldDescriptorsEqual(left, right)) {
    return false;
  }

  return (
    left.backboneColorHash === right.backboneColorHash &&
    left.detailColorHash === right.detailColorHash
  );
}

function resolveFieldRebuildReason(previousDescriptor, nextDescriptor) {
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
  if (
    previousDescriptor.backboneCount !== nextDescriptor.backboneCount ||
    previousDescriptor.detailCount !== nextDescriptor.detailCount
  ) {
    return "mode-count";
  }
  if (
    previousDescriptor.backboneHash !== nextDescriptor.backboneHash ||
    previousDescriptor.detailHash !== nextDescriptor.detailHash
  ) {
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
    previousDescriptor.backboneColorHash !== nextDescriptor.backboneColorHash ||
    previousDescriptor.detailColorHash !== nextDescriptor.detailColorHash
  ) {
    return "color-slots";
  }

  return null;
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
    mode: RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.cached,
  });
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

export function createRaymarchPhaseOverlayCache({
  resolution = RAYMARCH_PHASE_OVERLAY_RESOLUTION,
} = {}) {
  const normalizedResolution = Math.max(8, Math.round(resolution));
  const texture = createCacheTexture(normalizedResolution);

  return {
    ...createCacheState({
      resolution: normalizedResolution,
      texture,
      mode: "cached",
    }),
    maxBackboneModes: RAYMARCH_PHASE_OVERLAY_BACKBONE_LIMIT,
    maxDetailModes: RAYMARCH_PHASE_OVERLAY_DETAIL_LIMIT,
    updateIntervalMs: RAYMARCH_PHASE_OVERLAY_UPDATE_INTERVAL_MS,
    lastUpdateTimeMs: -Infinity,
    activePhaseModeCount: 0,
    semantic: "signed-displacement",
  };
}

export function disposeRaymarchFieldCache(fieldCache) {
  fieldCache?.texture?.dispose?.();
  if (fieldCache?.computeNodesByKey) {
    Object.values(fieldCache.computeNodesByKey).forEach((node) => {
      node?.dispose?.();
    });
  }
}

export function disposeRaymarchSpectralLightCache(spectralLightCache) {
  disposeRaymarchFieldCache(spectralLightCache);
}

export function disposeRaymarchPhaseOverlayCache(phaseOverlayCache) {
  disposeRaymarchFieldCache(phaseOverlayCache);
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

function markCacheBackendUnavailable(
  cache,
  message = "Renderer computeAsync unavailable",
) {
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
    cache.queuedDescriptor = descriptor;
    cache.queuedRebuildReason = rebuildReason;
    cache.queuedRequest = request;
  }

  return {
    enqueued: false,
    reason: "pending",
    descriptor: cache.pendingDescriptor,
    queuedDescriptor: cache.queuedDescriptor,
  };
}

function beginCacheRebuild(cache, descriptor) {
  const hadReadyCache = Boolean(cache.ready && cache.activeDescriptor);
  cache.backend = "compute";
  cache.ready = hadReadyCache;
  cache.rebuildPending = true;
  cache.pendingDescriptor = descriptor;
  cache.lastError = null;
}

export function buildRaymarchFieldCacheDescriptor({
  backboneSlots,
  detailSlots,
  backboneCount = 0,
  detailCount = 0,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
}) {
  const normalizedBackboneCount = Math.max(0, Math.round(backboneCount || 0));
  const normalizedDetailCount = Math.max(0, Math.round(detailCount || 0));
  const totalWeightedAmplitude =
    sumWeightedSlotAmplitude(backboneSlots, normalizedBackboneCount, 1) +
    sumWeightedSlotAmplitude(
      detailSlots,
      normalizedDetailCount,
      DETAIL_LAYER_WEIGHT,
    );

  return {
    boundaryMode: normalizeBoundaryMode(boundaryMode),
    cavityGeometry: normalizeCavityGeometry(cavityGeometry),
    radius: Number.isFinite(radius) ? radius : 1,
    backboneCount: normalizedBackboneCount,
    detailCount: normalizedDetailCount,
    backboneHash: hashFieldTopologyLayer({
      slots: backboneSlots,
      activeCount: normalizedBackboneCount,
      weight: 1,
      totalWeightedAmplitude,
    }),
    detailHash: hashFieldTopologyLayer({
      slots: detailSlots,
      activeCount: normalizedDetailCount,
      weight: DETAIL_LAYER_WEIGHT,
      totalWeightedAmplitude,
    }),
  };
}

export function buildRaymarchSpectralLightCacheDescriptor({
  backboneSlots,
  detailSlots,
  backboneColorSlots,
  detailColorSlots,
  backboneCount = 0,
  detailCount = 0,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
}) {
  const fieldDescriptor = buildRaymarchFieldCacheDescriptor({
    backboneSlots,
    detailSlots,
    backboneCount,
    detailCount,
    boundaryMode,
    cavityGeometry,
    radius,
  });

  return {
    ...fieldDescriptor,
    backboneColorHash: hashSlotLayer(backboneColorSlots, backboneCount),
    detailColorHash: hashSlotLayer(detailColorSlots, detailCount),
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
  let r = 0;
  let g = 0;
  let b = 0;
  let colorWeight = 0;
  let totalAmplitude = 0;
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
    const localInfluence =
      amplitude * Math.abs(family.field) * (colorSlots?.[offset + 3] ?? 0);
    r += localInfluence * (colorSlots?.[offset] ?? 0);
    g += localInfluence * (colorSlots?.[offset + 1] ?? 0);
    b += localInfluence * (colorSlots?.[offset + 2] ?? 0);
    colorWeight += localInfluence;
  }

  return { r, g, b, colorWeight, totalAmplitude };
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
  backboneSlots,
  detailSlots,
  backboneCount = 0,
  detailCount = 0,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const scale = Math.PI / Math.max(radius, 1e-4);
  const backbone = accumulateLayerAtPoint({
    slots: backboneSlots,
    activeCount: backboneCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry,
  });
  const detail = accumulateLayerAtPoint({
    slots: detailSlots,
    activeCount: detailCount,
    weight: DETAIL_LAYER_WEIGHT,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry,
  });
  const amplitudeNorm = Math.max(
    sumWeightedSlotAmplitude(backboneSlots, backboneCount, 1) +
      sumWeightedSlotAmplitude(detailSlots, detailCount, DETAIL_LAYER_WEIGHT),
    0.01,
  );

  return {
    field: (backbone.field + detail.field) / amplitudeNorm,
    gradX: (backbone.gradX + detail.gradX) / amplitudeNorm,
    gradY: (backbone.gradY + detail.gradY) / amplitudeNorm,
    gradZ: (backbone.gradZ + detail.gradZ) / amplitudeNorm,
  };
}

export function evaluateRaymarchSpectralLightCachePoint({
  backboneSlots,
  detailSlots,
  backboneColorSlots,
  detailColorSlots,
  backboneCount = 0,
  detailCount = 0,
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
  const backbone = accumulateSpectralLightLayerAtPoint({
    slots: backboneSlots,
    colorSlots: backboneColorSlots,
    activeCount: backboneCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const detail = accumulateSpectralLightLayerAtPoint({
    slots: detailSlots,
    colorSlots: detailColorSlots,
    activeCount: detailCount,
    weight: DETAIL_LAYER_WEIGHT,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const amplitudeNorm = Math.max(
    backbone.totalAmplitude + detail.totalAmplitude,
    0.01,
  );

  return {
    r: (backbone.r + detail.r) / amplitudeNorm,
    g: (backbone.g + detail.g) / amplitudeNorm,
    b: (backbone.b + detail.b) / amplitudeNorm,
    colorWeight:
      (backbone.colorWeight + detail.colorWeight) / amplitudeNorm,
  };
}

export function evaluateRaymarchSignedPotentialAtPoint({
  backboneSlots,
  detailSlots,
  backboneCount = 0,
  detailCount = 0,
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
  const backbone = accumulateSignedPotentialLayerAtPoint({
    slots: backboneSlots,
    activeCount: backboneCount,
    weight: 1,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const detail = accumulateSignedPotentialLayerAtPoint({
    slots: detailSlots,
    activeCount: detailCount,
    weight: DETAIL_LAYER_WEIGHT,
    x,
    y,
    z,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const signedPotential = backbone.signedPotential + detail.signedPotential;
  const unsignedPotential =
    backbone.unsignedPotential + detail.unsignedPotential;

  return {
    signedPotential,
    unsignedPotential,
    cancellation: Math.min(
      1,
      Math.max(
        0,
        1 - Math.abs(signedPotential) / Math.max(0.01, unsignedPotential),
      ),
    ),
  };
}

function accumulatePhaseOverlayLayerAtPoint({
  slots,
  phaseSlots,
  activeCount,
  weight,
  x,
  y,
  z,
  time,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let signedDisplacement = 0;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;
  let unsignedPotential = 0;
  let authoritySum = 0;
  let totalWeight = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0) * weight;
    if (!(amplitude > 0)) {
      continue;
    }
    const coherence = phaseSlots?.[offset + 2] ?? 0;
    const authority = Math.min(
      1,
      Math.max(0, coherence * (phaseSlots?.[offset + 3] ?? 0)),
    );
    totalWeight += amplitude;
    if (!(authority > 0)) {
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
    const phase =
      (phaseSlots?.[offset] ?? 0) + (phaseSlots?.[offset + 1] ?? 0) * time;
    const oscillator = Math.cos(phase);
    const weightedAuthority = amplitude * authority;
    signedDisplacement += weightedAuthority * family.field * oscillator;
    gradX += weightedAuthority * family.gradX * oscillator;
    gradY += weightedAuthority * family.gradY * oscillator;
    gradZ += weightedAuthority * family.gradZ * oscillator;
    unsignedPotential +=
      weightedAuthority * Math.abs(family.field) * Math.abs(oscillator);
    authoritySum += weightedAuthority;
  }

  return {
    signedDisplacement,
    gradX,
    gradY,
    gradZ,
    unsignedPotential,
    authoritySum,
    totalWeight,
  };
}

export function evaluateRaymarchPhaseOverlayPoint({
  backboneSlots,
  detailSlots,
  backbonePhaseSlots,
  detailPhaseSlots,
  backboneCount = 0,
  detailCount = 0,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
  time = 0,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const scale = Math.PI / Math.max(radius, 1e-4);
  const backbone = accumulatePhaseOverlayLayerAtPoint({
    slots: backboneSlots,
    phaseSlots: backbonePhaseSlots,
    activeCount: backboneCount,
    weight: 1,
    x,
    y,
    z,
    time,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const detail = accumulatePhaseOverlayLayerAtPoint({
    slots: detailSlots,
    phaseSlots: detailPhaseSlots,
    activeCount: detailCount,
    weight: DETAIL_LAYER_WEIGHT,
    x,
    y,
    z,
    time,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const signedDisplacement =
    backbone.signedDisplacement + detail.signedDisplacement;
  const gradX = backbone.gradX + detail.gradX;
  const gradY = backbone.gradY + detail.gradY;
  const gradZ = backbone.gradZ + detail.gradZ;
  const unsignedPotential =
    backbone.unsignedPotential + detail.unsignedPotential;
  const authoritySum = backbone.authoritySum + detail.authoritySum;
  const totalWeight = backbone.totalWeight + detail.totalWeight;
  const safeAuthority = Math.max(authoritySum, 0.01);
  const normalizedSignedDisplacement = Math.max(
    -1,
    Math.min(1, signedDisplacement / safeAuthority),
  );
  const gradientMagnitude = Math.min(
    1,
    Math.hypot(gradX, gradY, gradZ) / safeAuthority,
  );
  const cancellationSupport = Math.min(
    1,
    Math.max(
      0,
      (unsignedPotential - PHASE_OVERLAY_CANCELLATION_SUPPORT_EPSILON) /
        (PHASE_OVERLAY_CANCELLATION_SUPPORT_FULL -
          PHASE_OVERLAY_CANCELLATION_SUPPORT_EPSILON),
    ),
  );
  const cancellation =
    cancellationSupport *
    Math.min(
      1,
      Math.max(
        0,
        1 -
          Math.abs(signedDisplacement) /
            Math.max(PHASE_OVERLAY_CANCELLATION_SUPPORT_FULL, unsignedPotential),
      ),
    );
  const authority = Math.min(
    1,
    Math.max(0, authoritySum / Math.max(0.01, totalWeight)),
  );

  return {
    signedDisplacement: normalizedSignedDisplacement,
    gradientMagnitude,
    cancellation,
    authority,
  };
}

function createComputeKernel({
  fieldCache,
  backboneModeBuffer,
  detailModeBuffer,
  backboneCapacity,
  detailCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture } = fieldCache;
  const uRadius = uniforms.uRadius;
  const backboneActiveCount = int(uniforms.uBackboneModeCount);
  const detailActiveCount = int(uniforms.uDetailModeCount);
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
          end: int(backboneCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(backboneActiveCount), () => {}).Else(() => {
            const slot = backboneModeBuffer.element(i);
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

      Loop(
        {
          start: int(0),
          end: int(detailCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(detailActiveCount), () => {}).Else(() => {
            const slot = detailModeBuffer.element(i);
            const amplitude = slot.w.mul(float(DETAIL_LAYER_WEIGHT)).toVar();
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
  backboneModeBuffer,
  detailModeBuffer,
  backboneColorBuffer,
  detailColorBuffer,
  backboneCapacity,
  detailCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture } = spectralLightCache;
  const uRadius = uniforms.uRadius;
  const backboneActiveCount = int(uniforms.uBackboneModeCount);
  const detailActiveCount = int(uniforms.uDetailModeCount);
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
      const totalAmplitude = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(backboneCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(backboneActiveCount), () => {}).Else(() => {
            const slot = backboneModeBuffer.element(i);
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
            const colorSlot = backboneColorBuffer.element(i);
            totalAmplitude.addAssign(amplitude);
            const localInfluence = amplitude
              .mul(abs(family.field))
              .mul(colorSlot.w)
              .toVar();
            colorSumX.addAssign(localInfluence.mul(colorSlot.x));
            colorSumY.addAssign(localInfluence.mul(colorSlot.y));
            colorSumZ.addAssign(localInfluence.mul(colorSlot.z));
            colorWeight.addAssign(localInfluence);
          });
        },
      );

      Loop(
        {
          start: int(0),
          end: int(detailCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(detailActiveCount), () => {}).Else(() => {
            const slot = detailModeBuffer.element(i);
            const amplitude = slot.w.mul(float(DETAIL_LAYER_WEIGHT)).toVar();
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
            const colorSlot = detailColorBuffer.element(i);
            totalAmplitude.addAssign(amplitude);
            const localInfluence = amplitude
              .mul(abs(family.field))
              .mul(colorSlot.w)
              .toVar();
            colorSumX.addAssign(localInfluence.mul(colorSlot.x));
            colorSumY.addAssign(localInfluence.mul(colorSlot.y));
            colorSumZ.addAssign(localInfluence.mul(colorSlot.z));
            colorWeight.addAssign(localInfluence);
          });
        },
      );

      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          colorSumX.div(totalAmplitude.max(float(0.01))),
          colorSumY.div(totalAmplitude.max(float(0.01))),
          colorSumZ.div(totalAmplitude.max(float(0.01))),
          colorWeight.div(totalAmplitude.max(float(0.01))),
        ),
      ).toWriteOnly();
    });
  })().compute(
    spectralLightCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function createPhaseOverlayComputeKernel({
  phaseOverlayCache,
  backboneModeBuffer,
  detailModeBuffer,
  backbonePhaseBuffer,
  detailPhaseBuffer,
  backboneCapacity,
  detailCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture } = phaseOverlayCache;
  const uRadius = uniforms.uRadius;
  const uTime = uniforms.uTime;
  const backboneActiveCount = int(uniforms.uBackboneModeCount);
  const detailActiveCount = int(uniforms.uDetailModeCount);
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
      const signedDisplacement = zero.toVar();
      const signedGradX = zero.toVar();
      const signedGradY = zero.toVar();
      const signedGradZ = zero.toVar();
      const unsignedPotential = zero.toVar();
      const authoritySum = zero.toVar();
      const totalWeight = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(backboneCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(backboneActiveCount), () => {}).Else(() => {
            const slot = backboneModeBuffer.element(i);
            const phaseSlot = backbonePhaseBuffer.element(i);
            const amplitude = slot.w.toVar();
            const authority = clamp(
              phaseSlot.z.mul(phaseSlot.w),
              float(0.0),
              float(1.0),
            );
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
            const phase = phaseSlot.x.add(phaseSlot.y.mul(uTime));
            const oscillator = cos(phase);
            const weightedAuthority = amplitude.mul(authority).toVar();
            signedDisplacement.addAssign(
              weightedAuthority.mul(family.field).mul(oscillator),
            );
            signedGradX.addAssign(
              weightedAuthority.mul(family.gradX).mul(oscillator),
            );
            signedGradY.addAssign(
              weightedAuthority.mul(family.gradY).mul(oscillator),
            );
            signedGradZ.addAssign(
              weightedAuthority.mul(family.gradZ).mul(oscillator),
            );
            unsignedPotential.addAssign(
              weightedAuthority.mul(abs(family.field).mul(abs(oscillator))),
            );
            authoritySum.addAssign(weightedAuthority);
            totalWeight.addAssign(amplitude);
          });
        },
      );

      Loop(
        {
          start: int(0),
          end: int(detailCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(detailActiveCount), () => {}).Else(() => {
            const slot = detailModeBuffer.element(i);
            const phaseSlot = detailPhaseBuffer.element(i);
            const amplitude = slot.w.mul(float(DETAIL_LAYER_WEIGHT)).toVar();
            const authority = clamp(
              phaseSlot.z.mul(phaseSlot.w),
              float(0.0),
              float(1.0),
            );
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
            const phase = phaseSlot.x.add(phaseSlot.y.mul(uTime));
            const oscillator = cos(phase);
            const weightedAuthority = amplitude.mul(authority).toVar();
            signedDisplacement.addAssign(
              weightedAuthority.mul(family.field).mul(oscillator),
            );
            signedGradX.addAssign(
              weightedAuthority.mul(family.gradX).mul(oscillator),
            );
            signedGradY.addAssign(
              weightedAuthority.mul(family.gradY).mul(oscillator),
            );
            signedGradZ.addAssign(
              weightedAuthority.mul(family.gradZ).mul(oscillator),
            );
            unsignedPotential.addAssign(
              weightedAuthority.mul(abs(family.field).mul(abs(oscillator))),
            );
            authoritySum.addAssign(weightedAuthority);
            totalWeight.addAssign(amplitude);
          });
        },
      );

      const safeAuthority = authoritySum.max(float(0.01));
      const cancellationSupport = clamp(
        unsignedPotential
          .sub(float(PHASE_OVERLAY_CANCELLATION_SUPPORT_EPSILON))
          .div(
            float(
              PHASE_OVERLAY_CANCELLATION_SUPPORT_FULL -
                PHASE_OVERLAY_CANCELLATION_SUPPORT_EPSILON,
            ),
          ),
        float(0.0),
        float(1.0),
      );
      const cancellation = clamp(
        float(1.0).sub(
          abs(signedDisplacement).div(
            unsignedPotential.max(
              float(PHASE_OVERLAY_CANCELLATION_SUPPORT_FULL),
            ),
          ),
        ),
        float(0.0),
        float(1.0),
      ).mul(cancellationSupport);
      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          clamp(
            signedDisplacement.div(safeAuthority),
            float(-1.0),
            float(1.0),
          ),
          clamp(
            length(vec3(signedGradX, signedGradY, signedGradZ)).div(
              safeAuthority,
            ),
            float(0.0),
            float(1.0),
          ),
          cancellation,
          clamp(
            authoritySum.div(totalWeight.max(float(0.01))),
            float(0.0),
            float(1.0),
          ),
        ),
      ).toWriteOnly();
    });
  })().compute(
    phaseOverlayCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function getOrCreateRaymarchFieldCacheComputeNode(
  fieldCache,
  {
    backboneModeBuffer,
    detailModeBuffer,
    backboneCapacity,
    detailCapacity,
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
    backboneModeBuffer,
    detailModeBuffer,
    backboneCapacity,
    detailCapacity,
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
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    backboneCapacity,
    detailCapacity,
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
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  spectralLightCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchPhaseOverlayComputeNode(
  phaseOverlayCache,
  {
    backboneModeBuffer,
    detailModeBuffer,
    backbonePhaseBuffer,
    detailPhaseBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
    boundaryMode,
    cavityGeometry,
  },
) {
  if (!phaseOverlayCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const nodeKey = `${normalizedCavityGeometry}:${normalizedBoundaryMode}`;
  const cachedNode = phaseOverlayCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createPhaseOverlayComputeKernel({
    phaseOverlayCache,
    backboneModeBuffer,
    detailModeBuffer,
    backbonePhaseBuffer,
    detailPhaseBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  phaseOverlayCache.computeNodesByKey[nodeKey] = computeNode;
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

export function enqueueRaymarchFieldCacheRebuild(
  fieldCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const {
    backboneModeBuffer,
    detailModeBuffer,
    backboneCapacity,
    detailCapacity,
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
    backboneModeBuffer,
    detailModeBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
    boundaryMode: descriptor.boundaryMode,
    cavityGeometry: descriptor.cavityGeometry,
  });
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  beginCacheRebuild(fieldCache, descriptor);
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
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
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    backboneCapacity,
    detailCapacity,
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
      backboneModeBuffer,
      detailModeBuffer,
      backboneColorBuffer,
      detailColorBuffer,
      backboneCapacity,
      detailCapacity,
      uniforms,
      boundaryMode: descriptor.boundaryMode,
      cavityGeometry: descriptor.cavityGeometry,
    },
  );
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  beginCacheRebuild(spectralLightCache, descriptor);
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
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

export function enqueueRaymarchPhaseOverlayRebuild(
  phaseOverlayCache,
  renderer,
  descriptor,
  rebuildReason,
  {
    backboneModeBuffer,
    detailModeBuffer,
    backbonePhaseBuffer,
    detailPhaseBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
  },
) {
  if (!phaseOverlayCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (phaseOverlayCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (phaseOverlayCache.rebuildPending) {
    return { enqueued: false, reason: "pending" };
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    phaseOverlayCache.backend = "unavailable";
    phaseOverlayCache.ready = false;
    phaseOverlayCache.rebuildPending = false;
    phaseOverlayCache.lastError = "Renderer computeAsync unavailable";
    phaseOverlayCache.lastRebuildReason = "unavailable";
    return { enqueued: false, reason: "unavailable" };
  }

  const computeNode = getOrCreateRaymarchPhaseOverlayComputeNode(
    phaseOverlayCache,
    {
      backboneModeBuffer,
      detailModeBuffer,
      backbonePhaseBuffer,
      detailPhaseBuffer,
      backboneCapacity,
      detailCapacity,
      uniforms,
      boundaryMode: descriptor.boundaryMode,
      cavityGeometry: descriptor.cavityGeometry,
    },
  );
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  const hadReadyCache = Boolean(
    phaseOverlayCache.ready && phaseOverlayCache.activeDescriptor,
  );
  phaseOverlayCache.backend = "compute";
  phaseOverlayCache.ready = hadReadyCache;
  phaseOverlayCache.rebuildPending = true;
  phaseOverlayCache.lastError = null;
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        phaseOverlayCache.activeDescriptor = descriptor;
        phaseOverlayCache.ready = true;
        phaseOverlayCache.rebuildPending = false;
        phaseOverlayCache.lastError = null;
        phaseOverlayCache.backend = "compute";
        phaseOverlayCache.rebuildCount += 1;
        phaseOverlayCache.lastRebuildReason = rebuildReason;
      },
      (error) => {
        phaseOverlayCache.backend = "unavailable";
        phaseOverlayCache.ready = false;
        phaseOverlayCache.rebuildPending = false;
        phaseOverlayCache.lastError =
          error instanceof Error ? error.message : String(error);
        phaseOverlayCache.lastRebuildReason = "unavailable";
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
