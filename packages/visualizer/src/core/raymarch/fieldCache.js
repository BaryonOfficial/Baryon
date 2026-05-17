import * as THREE from "three";
import { Storage3DTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  float,
  globalId,
  int,
  sin,
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
    mode: RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.direct,
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
      const combinedInfluence = zero.toVar();
      const backboneInfluence = zero.toVar();
      const detailInfluence = zero.toVar();
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
            const phaseEnvelope = sin(phase).mul(float(0.5)).add(float(0.5));
            const localInfluence = amplitude
              .mul(abs(family.field))
              .mul(authority)
              .mul(float(0.72).add(phaseEnvelope.mul(float(0.28))))
              .toVar();
            backboneInfluence.addAssign(localInfluence);
            combinedInfluence.addAssign(localInfluence.mul(float(0.72)));
            authoritySum.addAssign(authority.mul(amplitude));
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
            const phaseEnvelope = sin(phase).mul(float(0.5)).add(float(0.5));
            const localInfluence = amplitude
              .mul(abs(family.field))
              .mul(authority)
              .mul(float(0.58).add(phaseEnvelope.mul(float(0.42))))
              .toVar();
            detailInfluence.addAssign(localInfluence);
            combinedInfluence.addAssign(localInfluence.mul(float(1.18)));
            authoritySum.addAssign(authority.mul(amplitude));
            totalWeight.addAssign(amplitude);
          });
        },
      );

      textureStore(
        texture,
        uvec3(voxelCoord),
        vec4(
          clamp(
            combinedInfluence.div(totalWeight.max(float(0.01))),
            float(0.0),
            float(1.0),
          ),
          clamp(
            backboneInfluence.div(totalWeight.max(float(0.01))),
            float(0.0),
            float(1.0),
          ),
          clamp(
            detailInfluence.div(totalWeight.max(float(0.01))),
            float(0.0),
            float(1.0),
          ),
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

export function enqueueRaymarchSpectralLightCacheRebuild(
  spectralLightCache,
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
  if (!spectralLightCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (spectralLightCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    spectralLightCache.backend = "unavailable";
    spectralLightCache.ready = false;
    spectralLightCache.rebuildPending = false;
    spectralLightCache.lastError = "Renderer computeAsync unavailable";
    spectralLightCache.lastRebuildReason = "unavailable";
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

  const hadReadyCache = Boolean(
    spectralLightCache.ready && spectralLightCache.activeDescriptor,
  );
  spectralLightCache.backend = "compute";
  spectralLightCache.ready = hadReadyCache;
  spectralLightCache.rebuildPending = true;
  spectralLightCache.lastError = null;
  const submission = Promise.resolve()
    .then(() => renderer.computeAsync(computeNode))
    .then(
      () => {
        spectralLightCache.activeDescriptor = descriptor;
        spectralLightCache.ready = true;
        spectralLightCache.rebuildPending = false;
        spectralLightCache.lastError = null;
        spectralLightCache.backend = "compute";
        spectralLightCache.rebuildCount += 1;
        spectralLightCache.lastRebuildReason = rebuildReason;
      },
      (error) => {
        spectralLightCache.backend = "unavailable";
        spectralLightCache.ready = false;
        spectralLightCache.rebuildPending = false;
        spectralLightCache.lastError =
          error instanceof Error ? error.message : String(error);
        spectralLightCache.lastRebuildReason = "unavailable";
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

export function shouldRebuildRaymarchSpectralLightCache(
  spectralLightCache,
  descriptor,
) {
  if (!spectralLightCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }

  if (spectralLightCache.rebuildPending) {
    return { needsRebuild: false, reason: "pending" };
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
