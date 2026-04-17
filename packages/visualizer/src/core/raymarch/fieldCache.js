import * as THREE from "three";
import { Storage3DTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  float,
  globalId,
  int,
  textureStore,
  uvec3,
  uint,
  vec4,
} from "three/tsl";
import { normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { RAYMARCH_FIELD_CACHE_OVERRIDE_MODES } from "../../visualization/fieldEvaluation.js";
import { DETAIL_LAYER_WEIGHT } from "./fieldShaping.js";

export const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;

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

function chromaDescriptorsEqual(left, right) {
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

function resolveChromaRebuildReason(previousDescriptor, nextDescriptor) {
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
    mode: RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.direct,
  });
}

export function createRaymarchChromaCache({
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

export function disposeRaymarchChromaCache(chromaCache) {
  disposeRaymarchFieldCache(chromaCache);
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
    mode,
    computeNodesByKey: Object.create(null),
  };
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
  return {
    boundaryMode: normalizeBoundaryMode(boundaryMode),
    cavityGeometry: normalizeCavityGeometry(cavityGeometry),
    radius: Number.isFinite(radius) ? radius : 1,
    backboneCount: Math.max(0, Math.round(backboneCount || 0)),
    detailCount: Math.max(0, Math.round(detailCount || 0)),
    backboneHash: hashSlotLayer(backboneSlots, backboneCount),
    detailHash: hashSlotLayer(detailSlots, detailCount),
  };
}

export function buildRaymarchChromaCacheDescriptor({
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

  return {
    field: backbone.field + detail.field,
    gradX: backbone.gradX + detail.gradX,
    gradY: backbone.gradY + detail.gradY,
    gradZ: backbone.gradZ + detail.gradZ,
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
        vec4(field, gradX, gradY, gradZ),
      ).toWriteOnly();
    });
  })().compute(
    fieldCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function createChromaComputeKernel({
  chromaCache,
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
  const { resolution, texture } = chromaCache;
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
        vec4(colorSumX, colorSumY, colorSumZ, colorWeight),
      ).toWriteOnly();
    });
  })().compute(
    chromaCache.dispatchSize,
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

function getOrCreateRaymarchChromaCacheComputeNode(
  chromaCache,
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
  if (!chromaCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const nodeKey = `${normalizedCavityGeometry}:${normalizedBoundaryMode}`;
  const cachedNode = chromaCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createChromaComputeKernel({
    chromaCache,
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
  chromaCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

export function enqueueRaymarchFieldCacheRebuild(
  fieldCache,
  renderer,
  descriptor,
  rebuildReason,
  {
    backboneModeBuffer,
    detailModeBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
  },
) {
  if (!fieldCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (fieldCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    fieldCache.backend = "unavailable";
    fieldCache.ready = false;
    fieldCache.rebuildPending = false;
    fieldCache.lastError = "Renderer computeAsync unavailable";
    fieldCache.lastRebuildReason = "unavailable";
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

  const hadReadyCache = Boolean(
    fieldCache.ready && fieldCache.activeDescriptor,
  );
  fieldCache.backend = "compute";
  fieldCache.ready = hadReadyCache;
  fieldCache.rebuildPending = true;
  fieldCache.lastError = null;
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        fieldCache.activeDescriptor = descriptor;
        fieldCache.ready = true;
        fieldCache.rebuildPending = false;
        fieldCache.lastError = null;
        fieldCache.backend = "compute";
        fieldCache.rebuildCount += 1;
        fieldCache.lastRebuildReason = rebuildReason;
      },
      (error) => {
        fieldCache.backend = "unavailable";
        fieldCache.ready = false;
        fieldCache.rebuildPending = false;
        fieldCache.lastError =
          error instanceof Error ? error.message : String(error);
        fieldCache.lastRebuildReason = "unavailable";
      },
    );

  void submission;

  return {
    enqueued: true,
    reason: rebuildReason,
    descriptor,
  };
}

export function enqueueRaymarchChromaCacheRebuild(
  chromaCache,
  renderer,
  descriptor,
  rebuildReason,
  {
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
  },
) {
  if (!chromaCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (chromaCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    chromaCache.backend = "unavailable";
    chromaCache.ready = false;
    chromaCache.rebuildPending = false;
    chromaCache.lastError = "Renderer computeAsync unavailable";
    chromaCache.lastRebuildReason = "unavailable";
    return { enqueued: false, reason: "unavailable" };
  }

  const computeNode = getOrCreateRaymarchChromaCacheComputeNode(chromaCache, {
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    backboneCapacity,
    detailCapacity,
    uniforms,
    boundaryMode: descriptor.boundaryMode,
    cavityGeometry: descriptor.cavityGeometry,
  });
  if (!computeNode) {
    return { enqueued: false, reason: "unavailable" };
  }

  const hadReadyCache = Boolean(
    chromaCache.ready && chromaCache.activeDescriptor,
  );
  chromaCache.backend = "compute";
  chromaCache.ready = hadReadyCache;
  chromaCache.rebuildPending = true;
  chromaCache.lastError = null;
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        chromaCache.activeDescriptor = descriptor;
        chromaCache.ready = true;
        chromaCache.rebuildPending = false;
        chromaCache.lastError = null;
        chromaCache.backend = "compute";
        chromaCache.rebuildCount += 1;
        chromaCache.lastRebuildReason = rebuildReason;
      },
      (error) => {
        chromaCache.backend = "unavailable";
        chromaCache.ready = false;
        chromaCache.rebuildPending = false;
        chromaCache.lastError =
          error instanceof Error ? error.message : String(error);
        chromaCache.lastRebuildReason = "unavailable";
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
    return { needsRebuild: false, reason: "pending" };
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

export function shouldRebuildRaymarchChromaCache(chromaCache, descriptor) {
  if (!chromaCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }

  if (chromaCache.rebuildPending) {
    return { needsRebuild: false, reason: "pending" };
  }

  const rebuildReason = resolveChromaRebuildReason(
    chromaCache.activeDescriptor,
    descriptor,
  );

  return {
    needsRebuild: Boolean(rebuildReason),
    reason: rebuildReason ?? "unchanged",
  };
}

export function isRaymarchChromaCacheReadyForDescriptor(
  chromaCache,
  descriptor,
) {
  return Boolean(
    chromaCache?.ready &&
    !chromaCache?.rebuildPending &&
    chromaDescriptorsEqual(chromaCache.activeDescriptor, descriptor),
  );
}
