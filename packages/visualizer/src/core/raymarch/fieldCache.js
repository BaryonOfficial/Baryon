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
  fract,
  globalId,
  int,
  instancedArray,
  log,
  textureStore,
  texture3D,
  uniform,
  uvec3,
  uint,
  max,
  sin,
  vec3,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { buildRaymarchModalBasisPhaseSignature } from "./phaseSlotSemantics.js";
import { normalizePhaseRad } from "../../utils/audio/modalPhaseSlots.js";
import { SPECTRAL_LIGHT_LANE_COUNT } from "../../utils/audio/spectralLight.js";

export const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;
export const RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION =
  RAYMARCH_FIELD_CACHE_RESOLUTION;
export const RAYMARCH_MODAL_BASIS_CACHE_CAPACITY = 12;
export const RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT =
  RAYMARCH_MODAL_BASIS_CACHE_CAPACITY;
export const RAYMARCH_BASIS_ATLAS_PACKING = "z-slice-pages-v1";
const FIELD_CACHE_COMPUTE_WORKGROUP_SIZE = Object.freeze([8, 8, 4]);
export const MODAL_BASIS_CACHE_ENERGY_EPSILON = 0.01;
export const STRUCTURAL_PROJECTION_REFERENCE_ENERGY = 0.01;
const STRUCTURAL_PROJECTION_EPSILON = 1e-12;

export function deriveLiveSynthesisCancellationRatio(field, unsignedSupport) {
  if (!(unsignedSupport > MODAL_BASIS_CACHE_ENERGY_EPSILON)) {
    return 0;
  }

  return Math.min(1, Math.max(0, 1 - Math.abs(field) / unsignedSupport));
}
const MODAL_BASIS_SUPPORT_DIAGNOSTIC_SAMPLE_POINTS = Object.freeze([
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
const MODAL_BASIS_SUPPORT_DIAGNOSTIC_ADAPTIVE_SAMPLE_LIMIT = 8;
const MODAL_BASIS_SUPPORT_DIAGNOSTIC_SAMPLE_KEY_SCALE = 1e6;
const SPECTRAL_LANE_EPSILON = 1e-12;

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const FLOAT32_BITS_VALUE = new Float32Array(1);
const FLOAT32_BITS_VIEW = new Uint32Array(FLOAT32_BITS_VALUE.buffer);

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashFloat32(value, hash) {
  return hashUint32(getFloat32Bits(value), hash);
}

function getFloat32Bits(value) {
  FLOAT32_BITS_VALUE[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return FLOAT32_BITS_VIEW[0];
}

function getModalFieldRelativeSupportKeyForAmplitude(
  amplitude,
  coefficientTotal,
) {
  return getFloat32Bits(clamp01(amplitude / coefficientTotal));
}

function readModalFieldCoordinate(slots, offset, componentOffset) {
  const value = slots?.[offset + componentOffset];
  return Math.fround(Number.isFinite(value) ? value : 0);
}

function getModalFieldIdentityKey(u, v, w) {
  return `${getFloat32Bits(u)}:${getFloat32Bits(v)}:${getFloat32Bits(w)}`;
}

function collectCanonicalModalFieldTerms(slots, activeCount) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const entriesByKey = new Map();

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }

    const u = readModalFieldCoordinate(slots, offset, 0);
    const v = readModalFieldCoordinate(slots, offset, 1);
    const w = readModalFieldCoordinate(slots, offset, 2);
    const key = getModalFieldIdentityKey(u, v, w);
    const entry = entriesByKey.get(key);
    if (entry) {
      entry.amplitude += amplitude;
    } else {
      entriesByKey.set(key, { u, v, w, amplitude });
    }
  }

  return Array.from(entriesByKey.values());
}

function compareCanonicalShapeEntries(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }

  return 0;
}

function buildCanonicalShapeEntries(terms, supportTotal) {
  const coefficientTotal = Math.max(
    MODAL_BASIS_CACHE_ENERGY_EPSILON,
    supportTotal,
  );
  const entries = terms.map(({ u, v, w, amplitude }) => [
    u,
    v,
    w,
    getModalFieldRelativeSupportKeyForAmplitude(amplitude, coefficientTotal),
  ]);

  entries.sort(compareCanonicalShapeEntries);

  return entries;
}

function buildCanonicalIdentityEntries(terms) {
  const entries = terms.map(({ u, v, w }) => [u, v, w]);
  entries.sort(compareCanonicalShapeEntries);
  return entries;
}

function buildCanonicalModalFieldShape(slots, activeCount) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const terms = collectCanonicalModalFieldTerms(slots, clampedActiveCount);
  return buildCanonicalShapeEntries(
    terms,
    sumSlotAmplitude(slots, clampedActiveCount),
  );
}

function buildModalBasisPageEntriesFromSlots(
  modalFieldSlots,
  activeCount,
  resolution,
  basisCapacity,
) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const normalizedBasisCapacity = normalizeBasisCapacity(basisCapacity);
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution);
  const entries = [];

  for (let pageIndex = 0; pageIndex < normalizedBasisCapacity; pageIndex += 1) {
    const offset = pageIndex * 4;
    const u = readModalFieldCoordinate(modalFieldSlots, offset, 0);
    const v = readModalFieldCoordinate(modalFieldSlots, offset, 1);
    const w = readModalFieldCoordinate(modalFieldSlots, offset, 2);
    const amplitude = Math.max(0, modalFieldSlots?.[offset + 3] ?? 0);
    const representable =
      pageIndex < Math.max(0, Math.round(activeCount || 0)) &&
      amplitude > 0 &&
      Math.max(Math.abs(u), Math.abs(v), Math.abs(w)) <=
        maxRepresentableModeIndex;

    entries.push({
      identityKey: getModalFieldIdentityKey(u, v, w),
      u,
      v,
      w,
      pageIndex,
      atlasZStart: pageIndex * normalizedResolution,
      atlasZCount: normalizedResolution,
      basisNorm: 1,
      gradientNorm: 1,
      representable,
    });
  }

  return entries;
}

function hashModalBasisPageAssignment(entries) {
  let hash = FNV_OFFSET_BASIS;
  for (const entry of entries) {
    hash = hashUint32(entry.pageIndex, hash);
    hash = hashFloat32(entry.u, hash);
    hash = hashFloat32(entry.v, hash);
    hash = hashFloat32(entry.w, hash);
  }

  return hash >>> 0;
}

function hashRepresentableDomain({ entries, resolution, basisCapacity }) {
  let hash = FNV_OFFSET_BASIS;
  hash = hashUint32(normalizeModalBasisCacheResolution(resolution), hash);
  hash = hashUint32(normalizeBasisCapacity(basisCapacity), hash);
  hash = hashUint32(entries.length, hash);
  for (const entry of entries) {
    hash = hashFloat32(entry.u, hash);
    hash = hashFloat32(entry.v, hash);
    hash = hashFloat32(entry.w, hash);
    hash = hashUint32(entry.representable ? 1 : 0, hash);
  }

  return hash >>> 0;
}

function hashCanonicalModalFieldShape(entries) {
  let hash = FNV_OFFSET_BASIS;
  for (const [u, v, w, supportKey] of entries) {
    hash = hashFloat32(u, hash);
    hash = hashFloat32(v, hash);
    hash = hashFloat32(w, hash);
    hash = hashUint32(supportKey, hash);
  }

  return hash >>> 0;
}

function hashCanonicalModalFieldTopology(entries) {
  let hash = FNV_OFFSET_BASIS;
  for (const [u, v, w] of entries) {
    hash = hashFloat32(u, hash);
    hash = hashFloat32(v, hash);
    hash = hashFloat32(w, hash);
  }

  return hash >>> 0;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function submitRaymarchCacheCompute(renderer, computeNode) {
  try {
    return Promise.resolve(renderer.computeAsync(computeNode));
  } catch (error) {
    return Promise.reject(error);
  }
}

function readUniformNumber(uniforms, key, fallback = 0) {
  const value = uniforms?.[key]?.value;
  return Number.isFinite(value) ? value : fallback;
}

function createRaymarchCacheVec4Buffer(modalFieldCapacity) {
  const buffer = instancedArray(
    normalizeComputeNodeCapacity(modalFieldCapacity),
    "vec4",
  );
  if (buffer?.value?.array?.fill) {
    buffer.value.array.fill(0);
    buffer.value.needsUpdate = true;
  }
  return buffer;
}

function createRaymarchCacheUniformSnapshots() {
  return {
    uRadius: uniform(1),
    uTime: uniform(0),
    uModalFieldModeCount: uniform(0),
    uTotalSlotAmplitude: uniform(0),
    uStructuralProjectionDrive: uniform(0),
    uStructuralProjectionConcentration: uniform(0),
  };
}

function copyRaymarchCacheVec4BufferSnapshot({
  sourceBuffer,
  targetBuffer,
  modalFieldCapacity,
}) {
  const targetArray = targetBuffer?.value?.array;
  if (!targetArray?.fill) {
    return;
  }

  targetArray.fill(0);
  const sourceArray = sourceBuffer?.value?.array;
  const copyLength = Math.min(
    targetArray.length,
    Math.max(0, normalizeComputeNodeCapacity(modalFieldCapacity) * 4),
    sourceArray?.length ?? 0,
  );
  if (copyLength > 0) {
    targetArray.set(sourceArray.subarray(0, copyLength), 0);
  }
  targetBuffer.value.needsUpdate = true;
}

function updateRaymarchCacheUniformSnapshots(targetUniforms, sourceUniforms) {
  if (!targetUniforms) {
    return;
  }

  targetUniforms.uRadius.value = readUniformNumber(
    sourceUniforms,
    "uRadius",
    1,
  );
  targetUniforms.uTime.value = readUniformNumber(sourceUniforms, "uTime", 0);
  targetUniforms.uModalFieldModeCount.value = readUniformNumber(
    sourceUniforms,
    "uModalFieldModeCount",
    0,
  );
  targetUniforms.uTotalSlotAmplitude.value = readUniformNumber(
    sourceUniforms,
    "uTotalSlotAmplitude",
    0,
  );
  targetUniforms.uStructuralProjectionDrive.value = readUniformNumber(
    sourceUniforms,
    "uStructuralProjectionDrive",
    0,
  );
  targetUniforms.uStructuralProjectionConcentration.value = readUniformNumber(
    sourceUniforms,
    "uStructuralProjectionConcentration",
    0,
  );
}

function createRaymarchCacheRequestVec4BufferSnapshot(
  sourceBuffer,
  modalFieldCapacity,
) {
  const array = new Float32Array(
    normalizeComputeNodeCapacity(modalFieldCapacity) * 4,
  );
  const sourceArray = sourceBuffer?.value?.array;
  const copyLength = Math.min(array.length, sourceArray?.length ?? 0);
  if (copyLength > 0) {
    array.set(sourceArray.subarray(0, copyLength), 0);
  }
  return { value: { array } };
}

function createRaymarchCacheRequestUniformSnapshots(sourceUniforms) {
  return {
    uRadius: { value: readUniformNumber(sourceUniforms, "uRadius", 1) },
    uTime: { value: readUniformNumber(sourceUniforms, "uTime", 0) },
    uPhaseEvaluationTime: {
      value: readUniformNumber(sourceUniforms, "uPhaseEvaluationTime", 0),
    },
    uModalFieldModeCount: {
      value: readUniformNumber(sourceUniforms, "uModalFieldModeCount", 0),
    },
    uTotalSlotAmplitude: {
      value: readUniformNumber(sourceUniforms, "uTotalSlotAmplitude", 0),
    },
    uStructuralProjectionDrive: {
      value: readUniformNumber(sourceUniforms, "uStructuralProjectionDrive", 0),
    },
    uStructuralProjectionConcentration: {
      value: readUniformNumber(
        sourceUniforms,
        "uStructuralProjectionConcentration",
        0,
      ),
    },
  };
}

function snapshotRaymarchCacheRebuildOptions(
  options,
  { includePhase = false } = {},
) {
  const modalFieldCapacity = normalizeComputeNodeCapacity(
    options?.modalFieldCapacity,
  );
  return {
    ...options,
    modalFieldCapacity,
    modalFieldModeBuffer: createRaymarchCacheRequestVec4BufferSnapshot(
      options?.modalFieldModeBuffer,
      modalFieldCapacity,
    ),
    modalFieldPhaseBuffer: includePhase
      ? createRaymarchCacheRequestVec4BufferSnapshot(
          options?.modalFieldPhaseBuffer,
          modalFieldCapacity,
        )
      : null,
    uniforms: createRaymarchCacheRequestUniformSnapshots(options?.uniforms),
  };
}

function createRaymarchCacheComputeInputs({
  modalFieldCapacity,
  includePhase = false,
}) {
  return {
    modalFieldModeBuffer: createRaymarchCacheVec4Buffer(modalFieldCapacity),
    modalFieldPhaseBuffer: includePhase
      ? createRaymarchCacheVec4Buffer(modalFieldCapacity)
      : null,
    uniforms: createRaymarchCacheUniformSnapshots(),
  };
}

function getOrUpdateRaymarchCacheComputeInputs(
  cache,
  nodeKey,
  {
    modalFieldModeBuffer,
    modalFieldPhaseBuffer = null,
    modalFieldCapacity,
    uniforms,
    includePhase = false,
  },
) {
  if (!cache.computeInputsByKey) {
    cache.computeInputsByKey = Object.create(null);
  }

  let inputs = cache.computeInputsByKey[nodeKey];
  if (!inputs) {
    inputs = createRaymarchCacheComputeInputs({
      modalFieldCapacity,
      includePhase,
    });
    cache.computeInputsByKey[nodeKey] = inputs;
  }

  copyRaymarchCacheVec4BufferSnapshot({
    sourceBuffer: modalFieldModeBuffer,
    targetBuffer: inputs.modalFieldModeBuffer,
    modalFieldCapacity,
  });
  if (includePhase) {
    copyRaymarchCacheVec4BufferSnapshot({
      sourceBuffer: modalFieldPhaseBuffer,
      targetBuffer: inputs.modalFieldPhaseBuffer,
      modalFieldCapacity,
    });
  }
  updateRaymarchCacheUniformSnapshots(inputs.uniforms, uniforms);

  return inputs;
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

function normalizeModalBasisCacheResolution(resolution) {
  const candidate = Number.isFinite(resolution)
    ? resolution
    : RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  return Math.max(8, Math.round(candidate));
}

function normalizeBasisCapacity(capacity) {
  const candidate = Number.isFinite(capacity)
    ? capacity
    : RAYMARCH_MODAL_BASIS_CACHE_CAPACITY;
  return Math.max(1, Math.round(candidate));
}

export function getRaymarchBasisAtlasDepth(
  resolution,
  basisCapacity = RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
) {
  return (
    normalizeModalBasisCacheResolution(resolution) *
    normalizeBasisCapacity(basisCapacity)
  );
}

export function resolveRaymarchBasisAtlasZ({
  basisSlot,
  localZ,
  basisCapacity = RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
}) {
  const normalizedCapacity = normalizeBasisCapacity(basisCapacity);
  const clampedSlot = Math.min(
    normalizedCapacity - 1,
    Math.max(0, Math.floor(basisSlot || 0)),
  );
  const clampedLocalZ = Math.min(1, Math.max(0, localZ || 0));
  return (clampedSlot + clampedLocalZ) / normalizedCapacity;
}

export function getModalBasisCacheMaxRepresentableModeIndex(resolution) {
  return Math.max(
    1,
    Math.floor(normalizeModalBasisCacheResolution(resolution) / 2),
  );
}

function getSlotMaxModeIndex(slots, offset) {
  return Math.max(
    Math.abs(slots?.[offset] ?? 0),
    Math.abs(slots?.[offset + 1] ?? 0),
    Math.abs(slots?.[offset + 2] ?? 0),
  );
}

function isBasisPageSlotRepresentable({ slots, offset, resolution }) {
  return (
    getSlotMaxModeIndex(slots, offset) <=
    getModalBasisCacheMaxRepresentableModeIndex(resolution)
  );
}

export function sumLiveSynthesisRepresentableUploadWeight({
  modalFieldSlots,
  activeCount,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  if (!modalFieldSlots || clampedActiveCount <= 0) {
    return 0;
  }

  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  let totalWeight = 0;
  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, modalFieldSlots[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }
    if (
      !isBasisPageSlotRepresentable({
        slots: modalFieldSlots,
        offset,
        resolution: normalizedResolution,
      })
    ) {
      continue;
    }
    totalWeight += amplitude;
  }

  return totalWeight;
}

export function deriveStructuralProjectionDrive({
  modalFieldSlots,
  activeCount,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  referenceEnergy = STRUCTURAL_PROJECTION_REFERENCE_ENERGY,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const projectionReferenceEnergy =
    Number.isFinite(referenceEnergy) && referenceEnergy > 0
      ? referenceEnergy
      : STRUCTURAL_PROJECTION_REFERENCE_ENERGY;

  if (!modalFieldSlots || clampedActiveCount <= 0) {
    return {
      amplitudeSum: 0,
      structuralEnergy: 0,
      effectiveModeCount: 0,
      rmsStructuralAmplitude: 0,
      projectionEnergyDrive: 0,
      structuralConcentration: 0,
      referenceEnergy: projectionReferenceEnergy,
    };
  }

  let amplitudeSum = 0;
  let structuralEnergy = 0;
  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, modalFieldSlots[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }
    if (
      !isBasisPageSlotRepresentable({
        slots: modalFieldSlots,
        offset,
        resolution: normalizedResolution,
      })
    ) {
      continue;
    }
    amplitudeSum += amplitude;
    structuralEnergy += amplitude * amplitude;
  }

  const hasStructuralEnergy = structuralEnergy > STRUCTURAL_PROJECTION_EPSILON;
  const hasAmplitudeSum = amplitudeSum > STRUCTURAL_PROJECTION_EPSILON;
  const amplitudeSumSquared = amplitudeSum * amplitudeSum;
  const effectiveModeCount =
    hasStructuralEnergy && hasAmplitudeSum
      ? amplitudeSumSquared / structuralEnergy
      : 0;
  const structuralConcentration =
    hasStructuralEnergy && hasAmplitudeSum
      ? clamp01(structuralEnergy / amplitudeSumSquared)
      : 0;
  const rmsStructuralAmplitude = hasStructuralEnergy
    ? Math.sqrt(structuralEnergy / Math.max(effectiveModeCount, 1))
    : 0;
  const projectionEnergyDrive = hasStructuralEnergy
    ? clamp01(structuralEnergy / (structuralEnergy + projectionReferenceEnergy))
    : 0;

  return {
    amplitudeSum,
    structuralEnergy,
    effectiveModeCount,
    rmsStructuralAmplitude,
    projectionEnergyDrive,
    structuralConcentration,
    referenceEnergy: projectionReferenceEnergy,
  };
}

function isBasisPageSlotContributing({ slots, offset, resolution }) {
  const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
  return (
    amplitude > 0 && isBasisPageSlotRepresentable({ slots, offset, resolution })
  );
}

function getModalBasisFieldScale(radius) {
  return Math.PI / Math.max(radius, 1e-4);
}

function getModalBasisGradientBasisScale(scale, boundaryMode) {
  return normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet
    ? scale * 0.5
    : scale;
}

function getModalBasisTermGradientBound({ term, basisScale }) {
  return (
    Math.hypot(Math.abs(term.u), Math.abs(term.v), Math.abs(term.w)) *
    basisScale
  );
}

function getDirichletAntinodeCoordinate(index) {
  const normalizedIndex = Math.max(1, Math.round(Math.abs(index) || 1));
  let bestCoordinate = 0;
  let bestDistance = Infinity;

  for (
    let antinodeIndex = 0;
    antinodeIndex < normalizedIndex;
    antinodeIndex += 1
  ) {
    const coordinate = (2 * antinodeIndex + 1) / normalizedIndex - 1;
    const distance = Math.abs(coordinate);
    if (distance < bestDistance) {
      bestCoordinate = coordinate;
      bestDistance = distance;
    }
  }

  return bestCoordinate;
}

function getSupportDiagnosticAntinodeCoordinate(index, boundaryMode) {
  return normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet
    ? getDirichletAntinodeCoordinate(index)
    : 0;
}

function clampSupportDiagnosticCoordinate(coordinate) {
  return Math.max(
    -1,
    Math.min(1, Number.isFinite(coordinate) ? coordinate : 0),
  );
}

function getSupportDiagnosticSampleKey(point) {
  return point
    .map((coordinate) =>
      Math.round(
        clampSupportDiagnosticCoordinate(coordinate) *
          MODAL_BASIS_SUPPORT_DIAGNOSTIC_SAMPLE_KEY_SCALE,
      ),
    )
    .join(":");
}

function addSupportDiagnosticSamplePoint(samples, sampleKeys, point) {
  const samplePoint = point.map(clampSupportDiagnosticCoordinate);
  const key = getSupportDiagnosticSampleKey(samplePoint);
  if (sampleKeys.has(key)) {
    return false;
  }

  sampleKeys.add(key);
  samples.push(samplePoint);
  return true;
}

function getModalBasisTermAntinodeSamplePoint(term, boundaryMode) {
  return [
    getSupportDiagnosticAntinodeCoordinate(term.u, boundaryMode),
    getSupportDiagnosticAntinodeCoordinate(term.v, boundaryMode),
    getSupportDiagnosticAntinodeCoordinate(term.w, boundaryMode),
  ];
}

function buildLiveSynthesisSupportDiagnosticSamplePoints({
  slots,
  activeCount,
  resolution,
  boundaryMode,
}) {
  const samples = [];
  const sampleKeys = new Set();

  for (const point of MODAL_BASIS_SUPPORT_DIAGNOSTIC_SAMPLE_POINTS) {
    addSupportDiagnosticSamplePoint(samples, sampleKeys, point);
  }

  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(resolution);
  const canonicalTerms = collectCanonicalModalFieldTerms(
    slots,
    Math.max(0, Math.round(activeCount || 0)),
  ).sort((left, right) => {
    if (right.amplitude !== left.amplitude) {
      return right.amplitude - left.amplitude;
    }
    const leftMax = Math.max(
      Math.abs(left.u),
      Math.abs(left.v),
      Math.abs(left.w),
    );
    const rightMax = Math.max(
      Math.abs(right.u),
      Math.abs(right.v),
      Math.abs(right.w),
    );
    if (leftMax !== rightMax) {
      return leftMax - rightMax;
    }
    const leftKey = getModalFieldIdentityKey(left.u, left.v, left.w);
    const rightKey = getModalFieldIdentityKey(right.u, right.v, right.w);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  let adaptiveSampleCount = 0;

  for (const term of canonicalTerms) {
    if (
      Math.max(Math.abs(term.u), Math.abs(term.v), Math.abs(term.w)) >
      maxRepresentableModeIndex
    ) {
      continue;
    }
    if (
      addSupportDiagnosticSamplePoint(
        samples,
        sampleKeys,
        getModalBasisTermAntinodeSamplePoint(term, boundaryMode),
      )
    ) {
      adaptiveSampleCount += 1;
    }
    if (
      adaptiveSampleCount >=
      MODAL_BASIS_SUPPORT_DIAGNOSTIC_ADAPTIVE_SAMPLE_LIMIT
    ) {
      break;
    }
  }

  return samples;
}

function countZeroAmplitudeModalSlots(slots, activeCount) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  let zeroAmplitudeSkippedModeCount = 0;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    if (!(Math.max(0, slots?.[offset + 3] ?? 0) > 0)) {
      zeroAmplitudeSkippedModeCount += 1;
    }
  }

  return zeroAmplitudeSkippedModeCount;
}

function collectCanonicalLiveSynthesisDiagnosticTerms({ slots, activeCount }) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const entriesByKey = new Map();

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }

    const u = readModalFieldCoordinate(slots, offset, 0);
    const v = readModalFieldCoordinate(slots, offset, 1);
    const w = readModalFieldCoordinate(slots, offset, 2);
    const key = getModalFieldIdentityKey(u, v, w);
    const entry = entriesByKey.get(key) ?? {
      u,
      v,
      w,
      amplitude: 0,
      structuralCoefficient: 0,
    };
    entry.amplitude += amplitude;
    entry.structuralCoefficient += amplitude;
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, entry);
    }
  }

  return Array.from(entriesByKey.values());
}

function summarizeLiveSynthesisDiagnostics({
  slots,
  activeCount,
  resolution,
  scale,
  boundaryMode,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const basisScale = getModalBasisGradientBasisScale(scale, boundaryMode);
  const canonicalTerms = collectCanonicalLiveSynthesisDiagnosticTerms({
    slots,
    activeCount: clampedActiveCount,
  });
  let contributingBasisPageModeCount = 0;
  const zeroAmplitudeSkippedModeCount = countZeroAmplitudeModalSlots(
    slots,
    clampedActiveCount,
  );
  let bandwidthRejectedModeCount = 0;
  let contributingRawModalEnergy = 0;
  let bandwidthRejectedRawModalEnergy = 0;
  let contributingStructuralModalEnergy = 0;
  let bandwidthRejectedStructuralModalEnergy = 0;
  let rawGradientEnvelopeNumerator = 0;
  let structuralGradientEnvelopeNumerator = 0;

  for (const term of canonicalTerms) {
    const modalEnergy = term.amplitude * term.amplitude;
    const structuralModalEnergy =
      term.structuralCoefficient * term.structuralCoefficient;

    if (
      getModalBasisCacheMaxRepresentableModeIndex(resolution) <
      Math.max(Math.abs(term.u), Math.abs(term.v), Math.abs(term.w))
    ) {
      bandwidthRejectedModeCount += 1;
      bandwidthRejectedRawModalEnergy += modalEnergy;
      bandwidthRejectedStructuralModalEnergy += structuralModalEnergy;
      continue;
    }

    contributingBasisPageModeCount += 1;
    contributingRawModalEnergy += modalEnergy;
    contributingStructuralModalEnergy += structuralModalEnergy;
    const gradientBound = getModalBasisTermGradientBound({
      term,
      basisScale,
    });
    rawGradientEnvelopeNumerator += modalEnergy * gradientBound;
    structuralGradientEnvelopeNumerator +=
      structuralModalEnergy * gradientBound;
  }

  const totalRepresentedModalEnergy =
    contributingRawModalEnergy + bandwidthRejectedRawModalEnergy;
  const totalRepresentedStructuralModalEnergy =
    contributingStructuralModalEnergy + bandwidthRejectedStructuralModalEnergy;

  return {
    modalBasisCacheMaxRepresentableModeIndex:
      getModalBasisCacheMaxRepresentableModeIndex(resolution),
    contributingBasisPageModeCount,
    zeroAmplitudeSkippedModeCount,
    bandwidthRejectedModeCount,
    contributingRawModalEnergy,
    bandwidthRejectedRawModalEnergy,
    contributingStructuralModalEnergy,
    bandwidthRejectedStructuralModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio:
      totalRepresentedModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? contributingRawModalEnergy / totalRepresentedModalEnergy
        : 1,
    liveSynthesisResolvedStructuralModalEnergyRatio:
      totalRepresentedStructuralModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? contributingStructuralModalEnergy /
          totalRepresentedStructuralModalEnergy
        : 1,
    liveSynthesisRawGradientEnvelope:
      rawGradientEnvelopeNumerator /
      Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, contributingRawModalEnergy),
    liveSynthesisStructuralGradientEnvelope:
      structuralGradientEnvelopeNumerator /
      Math.max(
        MODAL_BASIS_CACHE_ENERGY_EPSILON,
        contributingStructuralModalEnergy,
      ),
  };
}

function evaluateRaymarchModalBasisSupportSample({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry,
  radius,
  x,
  y,
  z,
  resolution,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const modalField = accumulateLiveSynthesisFieldAtPoint({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    x,
    y,
    z,
    resolution: normalizedResolution,
    scale: getModalBasisFieldScale(radius),
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const amplitudeNorm = Math.max(
    modalField.totalWeight,
    MODAL_BASIS_CACHE_ENERGY_EPSILON,
  );
  const field = modalField.field / amplitudeNorm;
  const unsignedSupport = modalField.unsignedSupport / amplitudeNorm;

  return {
    unsignedSupport,
    cancellationRatio: deriveLiveSynthesisCancellationRatio(
      field,
      unsignedSupport,
    ),
  };
}

function summarizeLiveSynthesisSupportDiagnostics({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry,
  radius,
  resolution,
}) {
  const sampleRadius = Math.max(Math.abs(radius), 1e-4);
  const diagnosticSamplePoints =
    buildLiveSynthesisSupportDiagnosticSamplePoints({
      slots: modalFieldSlots,
      activeCount: modalFieldCount,
      resolution,
      boundaryMode,
    });
  const diagnosticSampleCount = diagnosticSamplePoints.length;
  let unsignedSupportSum = 0;
  let cancellationRatioSum = 0;
  let cancellationRatioMax = 0;
  let supportedSampleCount = 0;

  for (const [x, y, z] of diagnosticSamplePoints) {
    const sample = evaluateRaymarchModalBasisSupportSample({
      modalFieldSlots,
      modalFieldPhaseSlots,
      modalFieldCount,
      boundaryMode,
      cavityGeometry,
      radius,
      x: x * sampleRadius,
      y: y * sampleRadius,
      z: z * sampleRadius,
      resolution,
    });

    unsignedSupportSum += sample.unsignedSupport;

    if (!(sample.unsignedSupport > MODAL_BASIS_CACHE_ENERGY_EPSILON)) {
      continue;
    }

    supportedSampleCount += 1;
    cancellationRatioSum += sample.cancellationRatio;
    cancellationRatioMax = Math.max(
      cancellationRatioMax,
      sample.cancellationRatio,
    );
  }

  return {
    liveSynthesisUnsignedSupportMean:
      diagnosticSampleCount > 0
        ? unsignedSupportSum / diagnosticSampleCount
        : 0,
    liveSynthesisCancellationRatioMean:
      supportedSampleCount > 0
        ? cancellationRatioSum / supportedSampleCount
        : 0,
    liveSynthesisCancellationRatioMax: cancellationRatioMax,
    liveSynthesisSupportDiagnosticSampleCount: diagnosticSampleCount,
    liveSynthesisSupportDiagnosticSupportedSampleCount: supportedSampleCount,
    liveSynthesisSupportDiagnosticCoverage:
      diagnosticSampleCount > 0
        ? supportedSampleCount / diagnosticSampleCount
        : 0,
  };
}

function modalBasisCacheDescriptorsEqual(left, right) {
  return resolveModalBasisCacheRebuildReason(left, right) == null;
}

function normalizeModalBasisCacheBaseRebuildReason(reason) {
  if (reason === "boundary-mode") {
    return "boundary";
  }
  if (reason === "cavity-geometry") {
    return "geometry";
  }
  return reason;
}

function resolveFieldDescriptorBaseRebuildReason(
  previousDescriptor,
  nextDescriptor,
) {
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

  return null;
}

function resolveModalBasisCacheRebuildReason(
  previousDescriptor,
  nextDescriptor,
) {
  const baseReason = normalizeModalBasisCacheBaseRebuildReason(
    resolveFieldDescriptorBaseRebuildReason(previousDescriptor, nextDescriptor),
  );
  if (baseReason) {
    return baseReason;
  }
  if (previousDescriptor.resolution !== nextDescriptor.resolution) {
    return "resolution";
  }
  if (
    previousDescriptor.basisTextureResolution !==
    nextDescriptor.basisTextureResolution
  ) {
    return "resolution";
  }
  if (previousDescriptor.basisCapacity !== nextDescriptor.basisCapacity) {
    return "capacity";
  }
  if (previousDescriptor.basisPacking !== nextDescriptor.basisPacking) {
    return "packing";
  }
  if (previousDescriptor.basisAtlasDepth !== nextDescriptor.basisAtlasDepth) {
    return "packing";
  }
  if (
    previousDescriptor.descriptorOverflow !== nextDescriptor.descriptorOverflow
  ) {
    return "descriptor-overflow";
  }
  // Basis atlas pages are keyed by the top-N (u,v,w) page assignment only.
  // Live synthesis carries per-frame coefficients/phases; do not rebuild when
  // deeper representable modes churn but atlas page assignment is unchanged.
  if (
    previousDescriptor.identityPageAssignmentHash !==
    nextDescriptor.identityPageAssignmentHash
  ) {
    return "modal-identity";
  }

  return null;
}

export function getRaymarchModalBasisCacheDescriptorStaleReason({
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
  return resolveModalBasisCacheRebuildReason(activeDescriptor, nextDescriptor);
}

function resolveDispatchSize(resolution, depth = resolution) {
  const [xGroupSize, yGroupSize, zGroupSize] =
    FIELD_CACHE_COMPUTE_WORKGROUP_SIZE;
  return [
    Math.ceil(resolution / xGroupSize),
    Math.ceil(resolution / yGroupSize),
    Math.ceil(depth / zGroupSize),
  ];
}

export function createRaymarchModalBasisCache({
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  basisCapacity = RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
} = {}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const normalizedBasisCapacity = normalizeBasisCapacity(basisCapacity);
  const basisAtlasDepth = getRaymarchBasisAtlasDepth(
    normalizedResolution,
    normalizedBasisCapacity,
  );
  const texture = createCacheTexture(
    normalizedResolution,
    normalizedResolution,
    basisAtlasDepth,
  );
  const pendingTexture = createCacheTexture(
    normalizedResolution,
    normalizedResolution,
    basisAtlasDepth,
  );
  return {
    ...createCacheState({
      resolution: normalizedResolution,
      depth: basisAtlasDepth,
      texture,
      mode: "modal-basis-cached",
    }),
    semantic: "modal-basis-cache",
    pendingTexture,
    basisCapacity: normalizedBasisCapacity,
    basisTextureResolution: normalizedResolution,
    basisAtlasDepth,
    basisPacking: RAYMARCH_BASIS_ATLAS_PACKING,
    liveSynthesisModeCount: Math.min(
      normalizedBasisCapacity,
      RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
    ),
    activePhaseSampleTimeSec: null,
    pendingPhaseSampleTimeSec: null,
    activeBasisPageModeCount: 0,
    modalBasisCachePhaseAuthority: 0,
    modeIdentityRetentionRatio: 1,
    modalBasisCacheMaxRepresentableModeIndex:
      getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution),
    contributingBasisPageModeCount: 0,
    zeroAmplitudeSkippedModeCount: 0,
    contributingRawModalEnergy: 0,
    bandwidthRejectedModeCount: 0,
    bandwidthRejectedRawModalEnergy: 0,
    contributingStructuralModalEnergy: 0,
    bandwidthRejectedStructuralModalEnergy: 0,
    liveSynthesisResolvedRawModalEnergyRatio: 1,
    liveSynthesisResolvedStructuralModalEnergyRatio: 1,
    liveSynthesisRawGradientEnvelope: 0,
    liveSynthesisStructuralGradientEnvelope: 0,
    liveSynthesisUnsignedSupportMean: 0,
    liveSynthesisCancellationRatioMean: 0,
    liveSynthesisCancellationRatioMax: 0,
    liveSynthesisSupportDiagnosticSampleCount: 0,
    liveSynthesisSupportDiagnosticSupportedSampleCount: 0,
    liveSynthesisSupportDiagnosticCoverage: 0,
  };
}

export function createRaymarchLiveFieldProjectionCache({
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
} = {}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const fieldTexture = createCacheTexture(normalizedResolution);
  const supportTexture = createCacheTexture(normalizedResolution);
  const phaseInterferenceTexture = createCacheTexture(normalizedResolution);

  return {
    ...createCacheState({
      resolution: normalizedResolution,
      texture: fieldTexture,
      mode: "live-field-projection",
    }),
    semantic: "frame-current-modal-field-projection",
    fieldTexture,
    supportTexture,
    phaseInterferenceTexture,
    lastComputedAtSec: null,
    lastComputeReason: "uninitialized",
  };
}

export function createRaymarchSpectralLaneCache({
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
} = {}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const spectralLaneTextureA = createCacheTexture(normalizedResolution);
  const spectralLaneTextureB = createCacheTexture(normalizedResolution);
  const spectralLaneStatsTexture = createCacheTexture(normalizedResolution);

  return {
    ...createCacheState({
      resolution: normalizedResolution,
      texture: spectralLaneTextureA,
      mode: "spectral-lane-cache",
    }),
    semantic: "spectral-lane-cache",
    spectralLaneTextureA,
    spectralLaneTextureB,
    spectralLaneStatsTexture,
    descriptor: null,
    activeCacheBuiltAtSec: null,
    lastComputedAtSec: null,
    lastComputeReason: "uninitialized",
  };
}

export function disposeRaymarchFieldCache(fieldCache) {
  fieldCache?.texture?.dispose?.();
  if (
    fieldCache?.pendingTexture &&
    fieldCache.pendingTexture !== fieldCache.texture
  ) {
    fieldCache.pendingTexture.dispose?.();
  }
  if (fieldCache?.computeNodesByKey) {
    Object.values(fieldCache.computeNodesByKey).forEach((node) => {
      node?.dispose?.();
    });
  }
  if (fieldCache?.computeInputsByKey) {
    Object.values(fieldCache.computeInputsByKey).forEach((inputs) => {
      inputs?.modalFieldModeBuffer?.dispose?.();
      inputs?.modalFieldPhaseBuffer?.dispose?.();
      Object.values(inputs?.uniforms ?? {}).forEach((uniformNode) => {
        uniformNode?.dispose?.();
      });
    });
  }
}

export function disposeRaymarchModalBasisCache(modalBasisCache) {
  disposeRaymarchFieldCache(modalBasisCache);
}

export function disposeRaymarchLiveFieldProjectionCache(
  liveFieldProjectionCache,
) {
  disposeRaymarchFieldCache(liveFieldProjectionCache);
  liveFieldProjectionCache?.supportTexture?.dispose?.();
  liveFieldProjectionCache?.phaseInterferenceTexture?.dispose?.();
}

export function disposeRaymarchSpectralLaneCache(spectralLaneCache) {
  disposeRaymarchFieldCache(spectralLaneCache);
  spectralLaneCache?.spectralLaneTextureB?.dispose?.();
  spectralLaneCache?.spectralLaneStatsTexture?.dispose?.();
}

function createCacheTexture(width, height = width, depth = width) {
  const texture = new Storage3DTexture(width, height, depth);
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

function createCacheState({ resolution, depth = resolution, texture, mode }) {
  return {
    resolution,
    dispatchSize: resolveDispatchSize(resolution, depth),
    depth,
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
    pendingReady: false,
    pendingCacheBuiltAtSec: null,
    pendingRebuildReason: null,
    activeCacheBuiltAtSec: null,
    mode,
    computeNodesByKey: Object.create(null),
    computeInputsByKey: Object.create(null),
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
  cache.queuedDescriptorAtSec = null;
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

/**
 * Static identity of a modal-basis atlas. These fields alone decide atlas
 * invalidation: a rebuild is enqueued only when one of them changes (see
 * {@link resolveModalBasisCacheRebuildReason}). Time-varying coefficients,
 * phases, and audit telemetry are explicitly excluded — they belong to
 * {@link CoefficientUploadState} and the audit diagnostics, never here.
 *
 * @typedef {object} BasisIdentity
 * @property {string} identityPageAssignmentHash Top-N (u,v,w) page assignment.
 * @property {string} representableDomainHash Hash of the representable domain.
 * @property {string} boundaryMode Cavity boundary mode.
 * @property {string} cavityGeometry Cavity geometry.
 * @property {number} radius Cavity radius.
 * @property {number} resolution Atlas voxel resolution per axis.
 * @property {number} basisAtlasDepth Atlas page depth.
 * @property {number} basisCapacity Max atlas pages (mode capacity).
 * @property {boolean} descriptorOverflow Whether the descriptor overflowed.
 */

/**
 * GPU coefficient upload state for the modal field. Owns the slot buffers and
 * the count of modes actually uploaded; it never owns integration step budget
 * (the observation integrator) nor atlas identity ({@link BasisIdentity}).
 *
 * @typedef {object} CoefficientUploadState
 * @property {number} uploadedActiveCount Modes uploaded to the mode buffer.
 * @property {number} phaseAuthorityModeCount Modes with live phase authority.
 * @property {boolean} ready Whether the active atlas is committed and drawable.
 */

export const RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES = Object.freeze({
  absent: "modal-basis-cache-absent",
  building: "modal-basis-cache-building",
  readyCurrent: "modal-basis-cache-ready-current",
  readyStale: "modal-basis-cache-ready-stale",
  blocked: "modal-basis-cache-blocked",
});

export function resolveRaymarchModalBasisCacheDescriptorBlockedReason(
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
      Math.max(0, Math.round(descriptor.contributingBasisPageModeCount || 0)) >
      0
    )
  ) {
    return "no-contributing-basis-pages";
  }
  return null;
}

function makeModalBasisCacheDrawableAuthority({
  drawable = false,
  state,
  blockedReason = null,
  staleReason = null,
}) {
  return {
    drawable,
    state,
    // Single source of truth for "drawable from a committed atlas while a newer
    // identity rebuilds": both readyStale branches (rebuildPending and queued
    // descriptor) collapse to this boolean so read sites need not compare state
    // strings.
    staleWhileRebuilding:
      drawable === true &&
      state === RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.readyStale,
    blockedReason,
    staleReason,
  };
}

export function resolveRaymarchModalBasisCacheDrawableAuthority(
  modalBasisCache,
  descriptor,
) {
  const descriptorBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(descriptor);
  if (descriptorBlockedReason) {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.blocked,
      blockedReason: descriptorBlockedReason,
    });
  }

  if (!modalBasisCache) {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.absent,
      blockedReason: "cache-unavailable",
    });
  }

  if (modalBasisCache.backend === "unavailable") {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.blocked,
      blockedReason: "backend-unavailable",
    });
  }

  const activeDescriptor = modalBasisCache.activeDescriptor;
  const activeDescriptorBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(activeDescriptor);
  const hasDrawableActiveDescriptor = Boolean(
    modalBasisCache.ready && activeDescriptor && !activeDescriptorBlockedReason,
  );

  if (
    hasDrawableActiveDescriptor &&
    modalBasisCacheDescriptorsEqual(activeDescriptor, descriptor)
  ) {
    return makeModalBasisCacheDrawableAuthority({
      drawable: true,
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.readyCurrent,
    });
  }

  const staleReason = hasDrawableActiveDescriptor
    ? resolveModalBasisCacheRebuildReason(activeDescriptor, descriptor)
    : null;

  if (hasDrawableActiveDescriptor && modalBasisCache.rebuildPending) {
    return makeModalBasisCacheDrawableAuthority({
      drawable: true,
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.readyStale,
      staleReason,
    });
  }

  if (hasDrawableActiveDescriptor && modalBasisCache.pendingReady) {
    return makeModalBasisCacheDrawableAuthority({
      drawable: true,
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.readyStale,
      staleReason:
        modalBasisCache.pendingRebuildReason ?? staleReason ?? "pending-ready",
    });
  }

  if (hasDrawableActiveDescriptor && modalBasisCache.queuedDescriptor) {
    return makeModalBasisCacheDrawableAuthority({
      drawable: true,
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.readyStale,
      staleReason:
        modalBasisCache.queuedRebuildReason ??
        staleReason ??
        "queued-descriptor",
    });
  }

  if (modalBasisCache.rebuildPending) {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.building,
      blockedReason: "cache-rebuild-pending",
    });
  }

  if (modalBasisCache.pendingReady) {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.building,
      blockedReason: "pending-cache-awaiting-runtime-commit",
    });
  }

  if (!modalBasisCache.ready) {
    return makeModalBasisCacheDrawableAuthority({
      state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.building,
      blockedReason: "cache-not-ready",
    });
  }

  return makeModalBasisCacheDrawableAuthority({
    state: RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES.blocked,
    blockedReason: activeDescriptorBlockedReason ?? "descriptor-mismatch",
  });
}

function getCacheSchedulerTimeSec(options) {
  if (Number.isFinite(options?.schedulerTimeSec)) {
    return options.schedulerTimeSec;
  }
  const uniformTime = options?.uniforms?.uTime?.value;
  return Number.isFinite(uniformTime) ? uniformTime : null;
}

function normalizeComputeNodeCapacity(modalFieldCapacity) {
  return Math.max(
    1,
    Math.round(Number.isFinite(modalFieldCapacity) ? modalFieldCapacity : 0),
  );
}

function buildRaymarchComputeNodeCacheKey({
  boundaryMode,
  cavityGeometry,
  modalFieldCapacity,
}) {
  return [
    normalizeCavityGeometry(cavityGeometry),
    normalizeBoundaryMode(boundaryMode),
    `capacity=${normalizeComputeNodeCapacity(modalFieldCapacity)}`,
  ].join(":");
}

function setQueuedCacheRebuild(cache, descriptor, rebuildReason, request) {
  cache.queuedDescriptor = descriptor;
  cache.queuedRebuildReason = rebuildReason;
  cache.queuedDescriptorAtSec = getCacheSchedulerTimeSec(request?.options);
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
  cache.pendingReady = false;
  cache.pendingCacheBuiltAtSec = null;
  cache.pendingRebuildReason = null;
  cache.pendingPhaseSampleTimeSec = null;
  cache.activePhaseSampleTimeSec = null;
  cache.activeCacheBuiltAtSec = null;
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
  const generation = cache.generation ?? 0;
  cache.backend = "compute";
  // Keep the prior basis atlas drawable while a new coefficient-invariant rebuild runs.
  cache.ready = Boolean(cache.activeDescriptor);
  cache.rebuildPending = true;
  cache.pendingReady = false;
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
  const normalizedUploadedModalFieldCount = Math.max(
    0,
    Math.round(modalFieldCount || 0),
  );
  const modalFieldShape = buildCanonicalModalFieldShape(
    modalFieldSlots,
    normalizedUploadedModalFieldCount,
  );
  return {
    boundaryMode: normalizeBoundaryMode(boundaryMode),
    cavityGeometry: normalizeCavityGeometry(cavityGeometry),
    radius: Number.isFinite(radius) ? radius : 1,
    modalFieldCount: modalFieldShape.length,
    modalFieldHash: hashCanonicalModalFieldShape(modalFieldShape),
  };
}

export function buildRaymarchModalBasisCacheDescriptor({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  time = 0,
  phaseModeCount = 0,
  phaseAuthority = 0,
  descriptorOverflow = false,
  modeIdentityRetentionRatio = 1,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  basisCapacity = RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
  basisPacking = RAYMARCH_BASIS_ATLAS_PACKING,
}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const normalizedBasisCapacity = normalizeBasisCapacity(basisCapacity);
  const normalizedRadius = Number.isFinite(radius) ? radius : 1;
  const normalizedUploadedModalFieldCount = Math.max(
    0,
    Math.round(modalFieldCount || 0),
  );
  const modalBasisFieldScale = getModalBasisFieldScale(normalizedRadius);
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const canonicalModalFieldTerms = collectCanonicalModalFieldTerms(
    modalFieldSlots,
    normalizedUploadedModalFieldCount,
  );
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution);
  const representableBasisPageTerms = canonicalModalFieldTerms.filter(
    ({ u, v, w }) =>
      Math.max(Math.abs(u), Math.abs(v), Math.abs(w)) <=
      maxRepresentableModeIndex,
  );
  const modalFieldTopology = buildCanonicalIdentityEntries(
    canonicalModalFieldTerms,
  );
  const modalBasisCacheShape = buildCanonicalShapeEntries(
    representableBasisPageTerms,
    representableBasisPageTerms.reduce(
      (total, term) => total + term.amplitude,
      0,
    ),
  );
  const modalBasisCacheTopology = buildCanonicalIdentityEntries(
    representableBasisPageTerms,
  );
  const basisPageMetadata = buildModalBasisPageEntriesFromSlots(
    modalFieldSlots,
    normalizedUploadedModalFieldCount,
    normalizedResolution,
    normalizedBasisCapacity,
  );
  const identitySetHash = hashCanonicalModalFieldTopology(
    modalBasisCacheTopology,
  );
  const identityPageAssignmentHash =
    hashModalBasisPageAssignment(basisPageMetadata);
  const representableDomainHash = hashRepresentableDomain({
    entries: basisPageMetadata,
    resolution: normalizedResolution,
    basisCapacity: normalizedBasisCapacity,
  });
  const basisAtlasDepth = getRaymarchBasisAtlasDepth(
    normalizedResolution,
    normalizedBasisCapacity,
  );
  const liveSynthesisDiagnostics = summarizeLiveSynthesisDiagnostics({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale: modalBasisFieldScale,
    boundaryMode,
  });

  const descriptor = {
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
    radius: normalizedRadius,
    modalFieldCount: modalFieldTopology.length,
    modalFieldTopologyCount: modalFieldTopology.length,
    modalFieldTopologyHash: hashCanonicalModalFieldTopology(modalFieldTopology),
    basisTextureResolution: normalizedResolution,
    basisCapacity: normalizedBasisCapacity,
    basisPacking,
    basisAtlasDepth,
    basisFieldAtlasLayout: {
      width: normalizedResolution,
      height: normalizedResolution,
      depth: basisAtlasDepth,
      pageDepth: normalizedResolution,
      pageCount: normalizedBasisCapacity,
    },
    basisPageMetadata,
    liveSynthesisModeCount: Math.min(
      normalizedBasisCapacity,
      RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
    ),
    identitySetHash,
    identityPageAssignmentHash,
    representableDomainHash,
    modalBasisCacheSupportDiagnosticHash:
      hashCanonicalModalFieldShape(modalBasisCacheShape),
    modalBasisCacheTopologyHash: identitySetHash,
    liveModalPhaseHash: buildRaymarchModalBasisPhaseSignature({
      phaseSlots: modalFieldPhaseSlots,
      modalFieldSlots,
      activeCount: normalizedUploadedModalFieldCount,
      time,
      isSlotContributing: ({ slots, offset }) =>
        isBasisPageSlotContributing({
          slots,
          offset,
          resolution: normalizedResolution,
        }),
      getSlotIdentityKey: ({ slots, offset }) => [
        getFloat32Bits(slots?.[offset] ?? 0),
        getFloat32Bits(slots?.[offset + 1] ?? 0),
        getFloat32Bits(slots?.[offset + 2] ?? 0),
      ],
    }).slotHash,
    phaseModeCount: Math.max(0, Math.round(phaseModeCount || 0)),
    phaseAuthority: Math.round(clamp01(phaseAuthority) * 1000) / 1000,
    descriptorOverflow: descriptorOverflow === true,
    modeIdentityRetentionRatio: clamp01(modeIdentityRetentionRatio),
    resolution: normalizedResolution,
    ...liveSynthesisDiagnostics,
  };
  const modalBasisCacheBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(descriptor);
  return {
    ...descriptor,
    modalBasisCacheDrawable: modalBasisCacheBlockedReason == null,
    modalBasisCacheBlockedReason,
  };
}

/**
 * Computes the sampled live-synthesis support/cancellation telemetry.
 *
 * This is pure AuditDiagnostics: it samples the live field at diagnostic
 * points (the expensive per-sample synthesis) and never feeds cache-rebuild
 * or render decisions. Kept out of {@link buildRaymarchModalBasisCacheDescriptor}
 * so the hot path only pays for it when auditing is enabled.
 *
 * @returns {{
 *   liveSynthesisUnsignedSupportMean: number,
 *   liveSynthesisCancellationRatioMean: number,
 *   liveSynthesisCancellationRatioMax: number,
 *   liveSynthesisSupportDiagnosticSampleCount: number,
 *   liveSynthesisSupportDiagnosticSupportedSampleCount: number,
 *   liveSynthesisSupportDiagnosticCoverage: number,
 * }}
 */
export function buildModalBasisAuditDiagnostics({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
}) {
  return summarizeLiveSynthesisSupportDiagnostics({
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius: Number.isFinite(radius) ? radius : 1,
    resolution: normalizeModalBasisCacheResolution(resolution),
  });
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

function accumulateLiveSynthesisFieldAtPoint({
  slots,
  phaseSlots,
  activeCount,
  x,
  y,
  z,
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
  let phaseAuthorityWeightedAmplitudeSum = 0;
  let totalWeight = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }
    if (!isBasisPageSlotRepresentable({ slots, offset, resolution })) {
      continue;
    }
    totalWeight += amplitude;
    const beta = Math.min(
      1,
      Math.max(
        0,
        (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
      ),
    );
    phaseAuthorityWeightedAmplitudeSum += amplitude * beta;
    const coefficient = amplitude;
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
    const structuralContribution = coefficient * family.field;
    field += structuralContribution;
    gradX += coefficient * family.gradX;
    gradY += coefficient * family.gradY;
    gradZ += coefficient * family.gradZ;
    unsignedSupport += Math.abs(structuralContribution);
  }

  return {
    field,
    gradX,
    gradY,
    gradZ,
    unsignedSupport,
    phaseAuthorityWeightedAmplitudeSum,
    totalWeight,
  };
}

/**
 * @param {{
 *   point?: [number, number, number] | Float32Array | number[] | null,
 *   modalFieldSlots?: Float32Array | number[] | null,
 *   modalFieldSpectralLaneA?: Float32Array | number[] | null,
 *   modalFieldSpectralLaneB?: Float32Array | number[] | null,
 *   activeCount?: number,
 *   boundaryMode?: string,
 *   cavityGeometry?: string,
 *   radius?: number,
 *   x?: number,
 *   y?: number,
 *   z?: number,
 *   resolution?: number,
 *   supportExponent?: number,
 * }} options
 */
export function accumulateSpectralLaneRadianceAtPoint({
  point = null,
  modalFieldSlots,
  modalFieldSpectralLaneA,
  modalFieldSpectralLaneB,
  activeCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = point?.[0] ?? 0,
  y = point?.[1] ?? 0,
  z = point?.[2] ?? 0,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  supportExponent = 1,
} = {}) {
  const lanes = new Float32Array(SPECTRAL_LIGHT_LANE_COUNT);
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const scale = getModalBasisFieldScale(radius);
  const geometryBackend = getModalGeometryBackend(normalizedCavityGeometry);
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const gamma =
    Number.isFinite(supportExponent) && supportExponent > 0
      ? supportExponent
      : 1;

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const coefficient = Math.max(0, modalFieldSlots?.[offset + 3] ?? 0);
    if (!(coefficient > 0)) {
      continue;
    }
    if (
      !isBasisPageSlotRepresentable({
        slots: modalFieldSlots,
        offset,
        resolution: normalizedResolution,
      })
    ) {
      continue;
    }
    const family = geometryBackend.evaluateMode({
      u: modalFieldSlots?.[offset] ?? 0,
      v: modalFieldSlots?.[offset + 1] ?? 0,
      w: modalFieldSlots?.[offset + 2] ?? 0,
      x,
      y,
      z,
      scale,
      boundaryMode: normalizedBoundaryMode,
    });
    const support = Math.abs(coefficient * (family?.field ?? 0)) ** gamma;
    if (!(support > 0)) {
      continue;
    }

    lanes[0] += support * Math.max(0, modalFieldSpectralLaneA?.[offset] ?? 0);
    lanes[1] +=
      support * Math.max(0, modalFieldSpectralLaneA?.[offset + 1] ?? 0);
    lanes[2] +=
      support * Math.max(0, modalFieldSpectralLaneA?.[offset + 2] ?? 0);
    lanes[3] +=
      support * Math.max(0, modalFieldSpectralLaneA?.[offset + 3] ?? 0);
    lanes[4] += support * Math.max(0, modalFieldSpectralLaneB?.[offset] ?? 0);
    lanes[5] +=
      support * Math.max(0, modalFieldSpectralLaneB?.[offset + 1] ?? 0);
    lanes[6] +=
      support * Math.max(0, modalFieldSpectralLaneB?.[offset + 2] ?? 0);
    lanes[7] +=
      support * Math.max(0, modalFieldSpectralLaneB?.[offset + 3] ?? 0);
  }

  let total = 0;
  let maxLane = 0;
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const value = lanes[laneIndex];
    total += value;
    maxLane = Math.max(maxLane, value);
  }
  const dominance = total > SPECTRAL_LANE_EPSILON ? maxLane / total : 0;
  let entropy = 0;
  if (total > SPECTRAL_LANE_EPSILON) {
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      const probability = lanes[laneIndex] / total;
      if (probability > SPECTRAL_LANE_EPSILON) {
        entropy -= probability * Math.log(probability);
      }
    }
    entropy /= Math.log(SPECTRAL_LIGHT_LANE_COUNT);
  }

  return {
    lanes,
    total,
    dominance,
    entropy,
  };
}

function getPhaseProjectionWeight(phaseSlots, offset) {
  return clamp01(
    (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
  );
}

function getSignedInterferenceContrast({
  phaseCoherentEnergy,
  independentPhaseEnergy,
  maxConstructivePhaseEnergy,
}) {
  const energyDelta = phaseCoherentEnergy - independentPhaseEnergy;
  if (Math.abs(energyDelta) <= STRUCTURAL_PROJECTION_EPSILON) {
    return 0;
  }

  if (energyDelta > 0) {
    return clamp01(
      energyDelta /
        Math.max(
          STRUCTURAL_PROJECTION_EPSILON,
          maxConstructivePhaseEnergy - independentPhaseEnergy,
        ),
    );
  }

  return -clamp01(
    -energyDelta /
      Math.max(STRUCTURAL_PROJECTION_EPSILON, independentPhaseEnergy),
  );
}

function accumulatePhaseInterferenceContrastAtPoint({
  slots,
  phaseSlots,
  activeCount,
  phaseEvaluationTimeSec,
  x,
  y,
  z,
  resolution,
  scale,
  boundaryMode,
  cavityGeometry,
}) {
  let phaseReal = 0;
  let phaseImag = 0;
  let independentPhaseEnergy = 0;
  let maxConstructivePhaseMagnitude = 0;
  let structuralSupport = 0;
  let structuralWeight = 0;
  let phaseAuthorityWeightedSupport = 0;
  let phaseAuthorityModeCount = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const time = Number.isFinite(phaseEvaluationTimeSec)
    ? phaseEvaluationTimeSec
    : 0;
  const geometryBackend = getModalGeometryBackend(cavityGeometry);

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, slots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }
    if (!isBasisPageSlotRepresentable({ slots, offset, resolution })) {
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
    const structuralContribution = amplitude * family.field;
    const structuralMagnitude = Math.abs(structuralContribution);
    structuralSupport += structuralMagnitude;
    structuralWeight += amplitude;

    const phaseWeight = getPhaseProjectionWeight(phaseSlots, offset);
    if (!(phaseWeight > 1e-4)) {
      continue;
    }

    phaseAuthorityModeCount += 1;
    phaseAuthorityWeightedSupport += structuralMagnitude * phaseWeight;
    const phase = normalizePhaseRad(
      (phaseSlots?.[offset] ?? 0) + (phaseSlots?.[offset + 1] ?? 0) * time,
    );
    const phaseContribution = structuralContribution * phaseWeight;
    phaseReal += phaseContribution * Math.cos(phase);
    phaseImag += phaseContribution * Math.sin(phase);
    independentPhaseEnergy += phaseContribution * phaseContribution;
    maxConstructivePhaseMagnitude += Math.abs(phaseContribution);
  }

  const supportDenominator = Math.max(
    MODAL_BASIS_CACHE_ENERGY_EPSILON,
    structuralSupport,
  );
  const phaseCoherentEnergy = phaseReal * phaseReal + phaseImag * phaseImag;
  const maxConstructivePhaseEnergy =
    maxConstructivePhaseMagnitude * maxConstructivePhaseMagnitude;
  const phaseInterferenceContrast = getSignedInterferenceContrast({
    phaseCoherentEnergy,
    independentPhaseEnergy,
    maxConstructivePhaseEnergy,
  });
  const phaseInterferenceAuthority = clamp01(
    phaseAuthorityWeightedSupport / supportDenominator,
  );

  return {
    phaseInterferenceContrast,
    phaseInterferenceAuthority,
    phaseCoherentEnergy,
    independentPhaseEnergy,
    maxConstructivePhaseEnergy,
    structuralSupport:
      structuralSupport /
      Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, structuralWeight),
    unnormalizedStructuralSupport: structuralSupport,
    phaseAuthorityModeCount,
    phaseReal,
    phaseImag,
  };
}

export function evaluateRaymarchLiveSynthesisFieldPoint({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const scale = getModalBasisFieldScale(radius);
  const modalField = accumulateLiveSynthesisFieldAtPoint({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    x,
    y,
    z,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const amplitudeNorm = Math.max(
    modalField.totalWeight,
    MODAL_BASIS_CACHE_ENERGY_EPSILON,
  );
  const liveSynthesisDiagnostics = summarizeLiveSynthesisDiagnostics({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });
  const totalRepresentedModalEnergy =
    liveSynthesisDiagnostics.contributingRawModalEnergy +
    liveSynthesisDiagnostics.bandwidthRejectedRawModalEnergy;
  const field = modalField.field / amplitudeNorm;
  const unsignedSupport = modalField.unsignedSupport / amplitudeNorm;
  const cancellationRatio = deriveLiveSynthesisCancellationRatio(
    field,
    unsignedSupport,
  );

  return {
    field,
    gradX: modalField.gradX / amplitudeNorm,
    gradY: modalField.gradY / amplitudeNorm,
    gradZ: modalField.gradZ / amplitudeNorm,
    unsignedSupport,
    cancellationRatio,
    modalBasisCachePhaseAuthority: Math.min(
      1,
      Math.max(
        0,
        modalField.phaseAuthorityWeightedAmplitudeSum /
          Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, modalField.totalWeight),
      ),
    ),
    modalBasisCacheMaxRepresentableModeIndex:
      getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution),
    contributingBasisPageModeCount:
      liveSynthesisDiagnostics.contributingBasisPageModeCount,
    zeroAmplitudeSkippedModeCount:
      liveSynthesisDiagnostics.zeroAmplitudeSkippedModeCount,
    contributingRawModalEnergy:
      liveSynthesisDiagnostics.contributingRawModalEnergy,
    bandwidthRejectedModeCount:
      liveSynthesisDiagnostics.bandwidthRejectedModeCount,
    bandwidthRejectedRawModalEnergy:
      liveSynthesisDiagnostics.bandwidthRejectedRawModalEnergy,
    contributingStructuralModalEnergy:
      liveSynthesisDiagnostics.contributingStructuralModalEnergy,
    bandwidthRejectedStructuralModalEnergy:
      liveSynthesisDiagnostics.bandwidthRejectedStructuralModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio:
      totalRepresentedModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? liveSynthesisDiagnostics.contributingRawModalEnergy /
          totalRepresentedModalEnergy
        : 1,
    liveSynthesisResolvedStructuralModalEnergyRatio:
      liveSynthesisDiagnostics.liveSynthesisResolvedStructuralModalEnergyRatio,
    liveSynthesisRawGradientEnvelope:
      liveSynthesisDiagnostics.liveSynthesisRawGradientEnvelope,
    liveSynthesisStructuralGradientEnvelope:
      liveSynthesisDiagnostics.liveSynthesisStructuralGradientEnvelope,
  };
}

export function evaluateRaymarchPhaseInterferenceContrastPoint({
  modalFieldSlots,
  modalFieldPhaseSlots,
  modalFieldCount,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  phaseEvaluationTimeSec,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);

  return accumulatePhaseInterferenceContrastAtPoint({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    phaseEvaluationTimeSec,
    x,
    y,
    z,
    resolution: normalizedResolution,
    scale: getModalBasisFieldScale(radius),
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
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

function createModalBasisCacheComputeKernel({
  modalBasisCache,
  modalFieldModeBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution } = modalBasisCache;
  const texture = modalBasisCache.pendingTexture ?? modalBasisCache.texture;
  const uRadius = uniforms.uRadius;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const maxRepresentableModeIndex = float(
    getModalBasisCacheMaxRepresentableModeIndex(resolution),
  );
  const resolutionUint = uint(resolution);
  const atlasDepthUint = uint(modalBasisCache.depth ?? resolution);
  const resolutionFloat = float(resolution);
  const half = float(0.5);
  const two = float(2.0);
  const zero = float(0.0);
  const basisCapacityInt = int(modalFieldCapacity);

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(atlasDepthUint));

    If(inBounds, () => {
      const pageIndex = voxelCoord.z.div(resolutionUint);
      const localZ = voxelCoord.z.mod(resolutionUint);
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
      const zCoord = float(localZ)
        .add(half)
        .div(resolutionFloat)
        .mul(two)
        .sub(float(1.0))
        .mul(uRadius)
        .toVar();
      const pageIndexInt = int(pageIndex);
      const slot = modalFieldModeBuffer.element(pageIndexInt);
      const activePage = pageIndexInt
        .lessThan(modalFieldActiveCount)
        .and(pageIndexInt.lessThan(basisCapacityInt))
        .and(slot.w.greaterThan(zero));
      const representable = abs(slot.x)
        .lessThanEqual(maxRepresentableModeIndex)
        .and(abs(slot.y).lessThanEqual(maxRepresentableModeIndex))
        .and(abs(slot.z).lessThanEqual(maxRepresentableModeIndex));
      const scale = float(Math.PI).div(uRadius.max(float(1e-4)));

      If(activePage.and(representable), () => {
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
        const basisField = zero.toVar();
        const basisGradX = zero.toVar();
        const basisGradY = zero.toVar();
        const basisGradZ = zero.toVar();
        basisField.addAssign(family.field);
        basisGradX.addAssign(family.gradX);
        basisGradY.addAssign(family.gradY);
        basisGradZ.addAssign(family.gradZ);

        textureStore(
          texture,
          voxelCoord,
          vec4(basisField, basisGradX, basisGradY, basisGradZ),
        ).toWriteOnly();
      }).Else(() => {
        textureStore(texture, voxelCoord, vec4(zero)).toWriteOnly();
      });
    });
  })().compute(
    modalBasisCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function createLiveFieldProjectionComputeKernel({
  liveFieldProjectionCache,
  modalBasisAtlasTexture,
  modalFieldCoefficientBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  uniforms,
}) {
  const { resolution, fieldTexture, supportTexture, phaseInterferenceTexture } =
    liveFieldProjectionCache;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const resolutionUint = uint(resolution);
  const resolutionFloat = float(resolution);
  const normalizedCapacity = Math.max(1, Math.round(modalFieldCapacity || 0));
  const half = float(0.5);
  const zero = float(0.0);
  const one = float(1.0);
  const twoPi = float(Math.PI * 2);
  const invTwoPi = float(1 / (Math.PI * 2));
  const invResolution = one.div(resolutionFloat);
  const invCapacity = one.div(float(normalizedCapacity));

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(resolutionUint));

    If(inBounds, () => {
      const basisUv = vec3(
        float(voxelCoord.x).add(half).mul(invResolution),
        float(voxelCoord.y).add(half).mul(invResolution),
        float(voxelCoord.z).add(half).mul(invResolution),
      );
      const fieldSum = zero.toVar();
      const gradXSum = zero.toVar();
      const gradYSum = zero.toVar();
      const gradZSum = zero.toVar();
      const supportSum = zero.toVar();
      const phaseInterferenceSumReal = zero.toVar();
      const phaseInterferenceSumImag = zero.toVar();
      const independentPhaseEnergySum = zero.toVar();
      const maxConstructivePhaseMagnitudeSum = zero.toVar();
      const phaseInterferenceAuthoritySum = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(normalizedCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(modalFieldActiveCount), () => {}).Else(() => {
            const coefficient = modalFieldCoefficientBuffer.element(i).x;
            const atlasUv = vec3(
              basisUv.x,
              basisUv.y,
              float(i).add(basisUv.z).mul(invCapacity),
            );
            const basisSample = texture3D(modalBasisAtlasTexture).sample(
              atlasUv,
            );
            const structuralContribution = coefficient.mul(basisSample.x);
            fieldSum.addAssign(structuralContribution);
            gradXSum.addAssign(coefficient.mul(basisSample.y));
            gradYSum.addAssign(coefficient.mul(basisSample.z));
            gradZSum.addAssign(coefficient.mul(basisSample.w));
            supportSum.addAssign(abs(coefficient).mul(abs(basisSample.x)));
            const phaseSlot = modalFieldPhaseBuffer.element(i);
            const phaseWeight = clamp(phaseSlot.z.mul(phaseSlot.w), zero, one);
            const rawPhase = phaseSlot.x.add(
              phaseSlot.y.mul(uniforms.uPhaseEvaluationTime),
            );
            const phase = fract(rawPhase.mul(invTwoPi).add(half))
              .sub(half)
              .mul(twoPi);
            const weightedPhaseContribution =
              structuralContribution.mul(phaseWeight);
            phaseInterferenceSumReal.addAssign(
              weightedPhaseContribution.mul(cos(phase)),
            );
            phaseInterferenceSumImag.addAssign(
              weightedPhaseContribution.mul(sin(phase)),
            );
            independentPhaseEnergySum.addAssign(
              weightedPhaseContribution.mul(weightedPhaseContribution),
            );
            maxConstructivePhaseMagnitudeSum.addAssign(
              abs(weightedPhaseContribution),
            );
            phaseInterferenceAuthoritySum.addAssign(
              abs(structuralContribution).mul(phaseWeight),
            );
          });
        },
      );

      const amplitudeNorm = max(uniforms.uTotalSlotAmplitude, float(0.01));
      const supportEnergyNorm = max(
        supportSum.mul(supportSum),
        float(STRUCTURAL_PROJECTION_EPSILON),
      );
      const phaseCoherentEnergy = phaseInterferenceSumReal
        .mul(phaseInterferenceSumReal)
        .add(phaseInterferenceSumImag.mul(phaseInterferenceSumImag));
      const maxConstructivePhaseEnergy = maxConstructivePhaseMagnitudeSum.mul(
        maxConstructivePhaseMagnitudeSum,
      );
      const phaseEnergyDelta = phaseCoherentEnergy.sub(
        independentPhaseEnergySum,
      );
      const constructiveContrast = clamp(
        phaseEnergyDelta.div(
          max(
            maxConstructivePhaseEnergy.sub(independentPhaseEnergySum),
            float(STRUCTURAL_PROJECTION_EPSILON),
          ),
        ),
        zero,
        one,
      );
      const destructiveContrast = clamp(
        phaseEnergyDelta.div(
          max(independentPhaseEnergySum, float(STRUCTURAL_PROJECTION_EPSILON)),
        ),
        float(-1.0),
        zero,
      );
      const phaseInterferenceContrast = clamp(
        constructiveContrast.add(destructiveContrast),
        float(-1.0),
        one,
      );
      const phaseInterferenceAuthority = clamp(
        phaseInterferenceAuthoritySum.div(
          max(supportSum, float(MODAL_BASIS_CACHE_ENERGY_EPSILON)),
        ),
        zero,
        one,
      );
      const phaseCoherentEnergyNorm = clamp(
        phaseCoherentEnergy.div(supportEnergyNorm),
        zero,
        one,
      );
      const independentPhaseEnergyNorm = clamp(
        independentPhaseEnergySum.div(supportEnergyNorm),
        zero,
        one,
      );
      textureStore(
        fieldTexture,
        voxelCoord,
        vec4(
          fieldSum.div(amplitudeNorm),
          gradXSum.div(amplitudeNorm),
          gradYSum.div(amplitudeNorm),
          gradZSum.div(amplitudeNorm),
        ),
      ).toWriteOnly();
      textureStore(
        supportTexture,
        voxelCoord,
        vec4(supportSum.div(amplitudeNorm), zero, zero, one),
      ).toWriteOnly();
      textureStore(
        phaseInterferenceTexture,
        voxelCoord,
        vec4(
          phaseInterferenceContrast,
          phaseCoherentEnergyNorm,
          phaseInterferenceAuthority,
          independentPhaseEnergyNorm,
        ),
      ).toWriteOnly();
    });
  })().compute(
    liveFieldProjectionCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function createSpectralLaneCacheComputeKernel({
  spectralLaneCache,
  modalBasisAtlasTexture,
  modalFieldCoefficientBuffer,
  modalFieldSpectralLaneABuffer,
  modalFieldSpectralLaneBBuffer,
  modalFieldSpectralMetaBuffer,
  modalFieldCapacity,
  uniforms,
}) {
  const {
    resolution,
    spectralLaneTextureA,
    spectralLaneTextureB,
    spectralLaneStatsTexture,
  } = spectralLaneCache;
  const modalFieldActiveCount = int(uniforms.uModalFieldModeCount);
  const resolutionUint = uint(resolution);
  const resolutionFloat = float(resolution);
  const normalizedCapacity = Math.max(1, Math.round(modalFieldCapacity || 0));
  const half = float(0.5);
  const zero = float(0.0);
  const one = float(1.0);
  const entropyNorm = one.div(log(float(SPECTRAL_LIGHT_LANE_COUNT)));
  const laneEpsilon = float(SPECTRAL_LANE_EPSILON);
  const invResolution = one.div(resolutionFloat);
  const invCapacity = one.div(float(normalizedCapacity));

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = voxelCoord.x
      .lessThan(resolutionUint)
      .and(voxelCoord.y.lessThan(resolutionUint))
      .and(voxelCoord.z.lessThan(resolutionUint));

    If(inBounds, () => {
      const basisUv = vec3(
        float(voxelCoord.x).add(half).mul(invResolution),
        float(voxelCoord.y).add(half).mul(invResolution),
        float(voxelCoord.z).add(half).mul(invResolution),
      );
      const lane0 = zero.toVar();
      const lane1 = zero.toVar();
      const lane2 = zero.toVar();
      const lane3 = zero.toVar();
      const lane4 = zero.toVar();
      const lane5 = zero.toVar();
      const lane6 = zero.toVar();
      const lane7 = zero.toVar();
      const packetConfidenceSum = zero.toVar();
      const packetSupportSum = zero.toVar();

      Loop(
        {
          start: int(0),
          end: int(normalizedCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.greaterThanEqual(modalFieldActiveCount), () => {}).Else(() => {
            const coefficient = modalFieldCoefficientBuffer.element(i).x;
            const atlasUv = vec3(
              basisUv.x,
              basisUv.y,
              float(i).add(basisUv.z).mul(invCapacity),
            );
            const basisSample = texture3D(modalBasisAtlasTexture).sample(
              atlasUv,
            );
            const laneA = modalFieldSpectralLaneABuffer.element(i);
            const laneB = modalFieldSpectralLaneBBuffer.element(i);
            const meta = modalFieldSpectralMetaBuffer.element(i);
            const spectralConfidence = clamp(meta.z, zero, one);
            const modalSupport = abs(coefficient).mul(abs(basisSample.x));
            const spectralSupport = modalSupport;

            packetConfidenceSum.addAssign(spectralConfidence.mul(modalSupport));
            packetSupportSum.addAssign(modalSupport);
            lane0.addAssign(spectralSupport.mul(max(laneA.x, zero)));
            lane1.addAssign(spectralSupport.mul(max(laneA.y, zero)));
            lane2.addAssign(spectralSupport.mul(max(laneA.z, zero)));
            lane3.addAssign(spectralSupport.mul(max(laneA.w, zero)));
            lane4.addAssign(spectralSupport.mul(max(laneB.x, zero)));
            lane5.addAssign(spectralSupport.mul(max(laneB.y, zero)));
            lane6.addAssign(spectralSupport.mul(max(laneB.z, zero)));
            lane7.addAssign(spectralSupport.mul(max(laneB.w, zero)));
          });
        },
      );

      const total = lane0
        .add(lane1)
        .add(lane2)
        .add(lane3)
        .add(lane4)
        .add(lane5)
        .add(lane6)
        .add(lane7)
        .toVar();
      const maxLaneA = max(max(lane0, lane1), max(lane2, lane3));
      const maxLaneB = max(max(lane4, lane5), max(lane6, lane7));
      const maxLane = max(maxLaneA, maxLaneB);
      const dominance = total
        .greaterThan(laneEpsilon)
        .select(maxLane.div(total), zero)
        .toVar();
      const invTotal = one.div(max(total, laneEpsilon));
      const p0 = lane0.mul(invTotal);
      const p1 = lane1.mul(invTotal);
      const p2 = lane2.mul(invTotal);
      const p3 = lane3.mul(invTotal);
      const p4 = lane4.mul(invTotal);
      const p5 = lane5.mul(invTotal);
      const p6 = lane6.mul(invTotal);
      const p7 = lane7.mul(invTotal);
      const entropyContribution0 = p0
        .greaterThan(laneEpsilon)
        .select(p0.mul(log(p0)), zero);
      const entropyContribution1 = p1
        .greaterThan(laneEpsilon)
        .select(p1.mul(log(p1)), zero);
      const entropyContribution2 = p2
        .greaterThan(laneEpsilon)
        .select(p2.mul(log(p2)), zero);
      const entropyContribution3 = p3
        .greaterThan(laneEpsilon)
        .select(p3.mul(log(p3)), zero);
      const entropyContribution4 = p4
        .greaterThan(laneEpsilon)
        .select(p4.mul(log(p4)), zero);
      const entropyContribution5 = p5
        .greaterThan(laneEpsilon)
        .select(p5.mul(log(p5)), zero);
      const entropyContribution6 = p6
        .greaterThan(laneEpsilon)
        .select(p6.mul(log(p6)), zero);
      const entropyContribution7 = p7
        .greaterThan(laneEpsilon)
        .select(p7.mul(log(p7)), zero);
      const entropy = total
        .greaterThan(laneEpsilon)
        .select(
          zero
            .sub(
              entropyContribution0
                .add(entropyContribution1)
                .add(entropyContribution2)
                .add(entropyContribution3)
                .add(entropyContribution4)
                .add(entropyContribution5)
                .add(entropyContribution6)
                .add(entropyContribution7),
            )
            .mul(entropyNorm),
          zero,
        )
        .toVar();
      const spectralConfidence = packetSupportSum
        .greaterThan(laneEpsilon)
        .select(packetConfidenceSum.div(packetSupportSum), zero);

      textureStore(
        spectralLaneTextureA,
        voxelCoord,
        vec4(lane0, lane1, lane2, lane3),
      ).toWriteOnly();
      textureStore(
        spectralLaneTextureB,
        voxelCoord,
        vec4(lane4, lane5, lane6, lane7),
      ).toWriteOnly();
      textureStore(
        spectralLaneStatsTexture,
        voxelCoord,
        vec4(total, dominance, entropy, spectralConfidence),
      ).toWriteOnly();
    });
  })().compute(
    spectralLaneCache.dispatchSize,
    Array.from(FIELD_CACHE_COMPUTE_WORKGROUP_SIZE),
  );
}

function getOrCreateRaymarchModalBasisCacheComputeNode(
  modalBasisCache,
  {
    modalFieldModeBuffer,
    modalFieldCapacity,
    uniforms,
    boundaryMode,
    cavityGeometry,
  },
) {
  if (!modalBasisCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedModalFieldCapacity = normalizeBasisCapacity(
    modalFieldCapacity ?? modalBasisCache.basisCapacity,
  );
  const nodeKey = buildRaymarchComputeNodeCacheKey({
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
    modalFieldCapacity: normalizedModalFieldCapacity,
  });
  const targetTexture =
    modalBasisCache.pendingTexture ?? modalBasisCache.texture;
  const computeInputs = getOrUpdateRaymarchCacheComputeInputs(
    modalBasisCache,
    nodeKey,
    {
      modalFieldModeBuffer,
      modalFieldCapacity: normalizedModalFieldCapacity,
      uniforms,
    },
  );
  const cachedNode = modalBasisCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    const cachedTargetTexture =
      /** @type {{ raymarchModalBasisTargetTexture?: unknown }} */ (cachedNode)
        .raymarchModalBasisTargetTexture;
    if (cachedTargetTexture && cachedTargetTexture !== targetTexture) {
      cachedNode.dispose?.();
      delete modalBasisCache.computeNodesByKey[nodeKey];
    } else {
      return cachedNode;
    }
  }

  const computeNode = createModalBasisCacheComputeKernel({
    modalBasisCache,
    modalFieldModeBuffer: computeInputs.modalFieldModeBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms: computeInputs.uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  if (computeNode && typeof computeNode === "object") {
    /** @type {{ raymarchModalBasisTargetTexture?: unknown }} */ (
      computeNode
    ).raymarchModalBasisTargetTexture = targetTexture;
  }
  modalBasisCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchLiveFieldProjectionCacheComputeNode(
  liveFieldProjectionCache,
  {
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    uniforms,
  },
) {
  if (
    !liveFieldProjectionCache ||
    !modalBasisAtlasTexture ||
    !modalFieldCoefficientBuffer ||
    !modalFieldPhaseBuffer
  ) {
    return null;
  }

  const normalizedModalFieldCapacity =
    normalizeComputeNodeCapacity(modalFieldCapacity);
  const nodeKey = [
    "live-field-projection",
    `capacity=${normalizedModalFieldCapacity}`,
  ].join(":");
  const cachedNode = liveFieldProjectionCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createLiveFieldProjectionComputeKernel({
    liveFieldProjectionCache,
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms,
  });
  liveFieldProjectionCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchSpectralLaneCacheComputeNode(
  spectralLaneCache,
  {
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer,
    modalFieldCapacity,
    uniforms,
  },
) {
  if (
    !spectralLaneCache ||
    !modalBasisAtlasTexture ||
    !modalFieldCoefficientBuffer ||
    !modalFieldSpectralLaneABuffer ||
    !modalFieldSpectralLaneBBuffer ||
    !modalFieldSpectralMetaBuffer
  ) {
    return null;
  }

  const normalizedModalFieldCapacity =
    normalizeComputeNodeCapacity(modalFieldCapacity);
  const nodeKey = [
    "spectral-lane-cache",
    `capacity=${normalizedModalFieldCapacity}`,
  ].join(":");
  const cachedNode = spectralLaneCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createSpectralLaneCacheComputeKernel({
    spectralLaneCache,
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms,
  });
  spectralLaneCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

export function computeRaymarchLiveFieldProjectionCache(
  liveFieldProjectionCache,
  renderer,
  {
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    uniforms,
    schedulerTimeSec = null,
  },
) {
  if (!liveFieldProjectionCache) {
    return { computed: false, reason: "unavailable" };
  }

  if (liveFieldProjectionCache.backend === "unavailable") {
    liveFieldProjectionCache.active = false;
    return { computed: false, reason: "unavailable" };
  }

  if (!renderer || typeof renderer.compute !== "function") {
    liveFieldProjectionCache.active = false;
    liveFieldProjectionCache.ready = false;
    liveFieldProjectionCache.lastError = "renderer-compute-unavailable";
    liveFieldProjectionCache.lastComputeReason = "renderer-unavailable";
    return { computed: false, reason: "renderer-unavailable" };
  }

  const computeNode = getOrCreateRaymarchLiveFieldProjectionCacheComputeNode(
    liveFieldProjectionCache,
    {
      modalBasisAtlasTexture,
      modalFieldCoefficientBuffer,
      modalFieldPhaseBuffer,
      modalFieldCapacity,
      uniforms,
    },
  );
  if (!computeNode) {
    liveFieldProjectionCache.active = false;
    liveFieldProjectionCache.ready = false;
    liveFieldProjectionCache.lastComputeReason = "compute-node-unavailable";
    return { computed: false, reason: "compute-node-unavailable" };
  }

  try {
    renderer.compute(computeNode);
  } catch (error) {
    liveFieldProjectionCache.active = false;
    markCacheBackendUnavailable(
      liveFieldProjectionCache,
      error instanceof Error ? error.message : String(error),
    );
    liveFieldProjectionCache.lastComputeReason = "compute-failed";
    return { computed: false, reason: "compute-failed" };
  }

  liveFieldProjectionCache.active = true;
  liveFieldProjectionCache.ready = true;
  liveFieldProjectionCache.backend = "compute";
  liveFieldProjectionCache.lastError = null;
  liveFieldProjectionCache.lastComputedAtSec = Number.isFinite(schedulerTimeSec)
    ? schedulerTimeSec
    : getCacheSchedulerTimeSec({ uniforms });
  liveFieldProjectionCache.lastComputeReason = "frame-current";
  return { computed: true, reason: "frame-current" };
}

export function computeRaymarchSpectralLaneCache(
  spectralLaneCache,
  renderer,
  {
    descriptor = null,
    modalBasisAtlasTexture,
    modalFieldCoefficientBuffer,
    modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer,
    modalFieldCapacity,
    uniforms,
    schedulerTimeSec = null,
  },
) {
  if (!spectralLaneCache) {
    return { computed: false, reason: "unavailable" };
  }

  if (spectralLaneCache.backend === "unavailable") {
    spectralLaneCache.active = false;
    return { computed: false, reason: "unavailable" };
  }

  if (!renderer || typeof renderer.compute !== "function") {
    spectralLaneCache.active = false;
    spectralLaneCache.ready = false;
    spectralLaneCache.lastError = "renderer-compute-unavailable";
    spectralLaneCache.lastComputeReason = "renderer-unavailable";
    return { computed: false, reason: "renderer-unavailable" };
  }

  const computeNode = getOrCreateRaymarchSpectralLaneCacheComputeNode(
    spectralLaneCache,
    {
      modalBasisAtlasTexture,
      modalFieldCoefficientBuffer,
      modalFieldSpectralLaneABuffer,
      modalFieldSpectralLaneBBuffer,
      modalFieldSpectralMetaBuffer,
      modalFieldCapacity,
      uniforms,
    },
  );
  if (!computeNode) {
    spectralLaneCache.active = false;
    spectralLaneCache.ready = false;
    spectralLaneCache.lastComputeReason = "compute-node-unavailable";
    return { computed: false, reason: "compute-node-unavailable" };
  }

  try {
    renderer.compute(computeNode);
  } catch (error) {
    spectralLaneCache.active = false;
    markCacheBackendUnavailable(
      spectralLaneCache,
      error instanceof Error ? error.message : String(error),
    );
    spectralLaneCache.lastComputeReason = "compute-failed";
    return { computed: false, reason: "compute-failed" };
  }

  spectralLaneCache.active = true;
  spectralLaneCache.ready = true;
  spectralLaneCache.backend = "compute";
  spectralLaneCache.descriptor = descriptor;
  spectralLaneCache.activeDescriptor = descriptor;
  spectralLaneCache.lastError = null;
  spectralLaneCache.activeCacheBuiltAtSec = Number.isFinite(schedulerTimeSec)
    ? schedulerTimeSec
    : getCacheSchedulerTimeSec({ uniforms });
  spectralLaneCache.lastComputedAtSec = spectralLaneCache.activeCacheBuiltAtSec;
  spectralLaneCache.lastComputeReason = "frame-current";
  return { computed: true, reason: "frame-current", descriptor };
}

function dispatchQueuedRaymarchModalBasisCacheRebuild(modalBasisCache) {
  const queued = takeQueuedCacheRebuild(modalBasisCache);
  if (
    !queued.descriptor ||
    !queued.request ||
    modalBasisCacheDescriptorsEqual(
      modalBasisCache.activeDescriptor,
      queued.descriptor,
    )
  ) {
    return;
  }

  enqueueRaymarchModalBasisCacheRebuild(
    modalBasisCache,
    queued.request.renderer,
    queued.descriptor,
    queued.rebuildReason ?? "queued",
    queued.request.options,
  );
}

function applyCommittedModalBasisDescriptor(modalBasisCache, descriptor) {
  modalBasisCache.activeDescriptor = descriptor;
  modalBasisCache.ready = true;
  modalBasisCache.rebuildPending = false;
  modalBasisCache.activePhaseSampleTimeSec =
    modalBasisCache.pendingPhaseSampleTimeSec;
  modalBasisCache.activeCacheBuiltAtSec =
    modalBasisCache.pendingCacheBuiltAtSec ??
    modalBasisCache.pendingPhaseSampleTimeSec;
  modalBasisCache.pendingPhaseSampleTimeSec = null;
  modalBasisCache.pendingCacheBuiltAtSec = null;
  modalBasisCache.pendingDescriptor = null;
  modalBasisCache.pendingReady = false;
  modalBasisCache.lastError = null;
  modalBasisCache.backend = "compute";
  modalBasisCache.rebuildCount += 1;
  modalBasisCache.lastRebuildReason =
    modalBasisCache.pendingRebuildReason ?? modalBasisCache.lastRebuildReason;
  modalBasisCache.pendingRebuildReason = null;
  modalBasisCache.activeBasisPageModeCount =
    descriptor.contributingBasisPageModeCount ?? 0;
  modalBasisCache.modalBasisCachePhaseAuthority =
    descriptor.phaseAuthority ?? 0;
  modalBasisCache.modeIdentityRetentionRatio =
    descriptor.modeIdentityRetentionRatio ?? 1;
  modalBasisCache.modalBasisCacheMaxRepresentableModeIndex =
    descriptor.modalBasisCacheMaxRepresentableModeIndex ??
    getModalBasisCacheMaxRepresentableModeIndex(modalBasisCache.resolution);
  modalBasisCache.contributingBasisPageModeCount =
    descriptor.contributingBasisPageModeCount ?? 0;
  modalBasisCache.zeroAmplitudeSkippedModeCount =
    descriptor.zeroAmplitudeSkippedModeCount ?? 0;
  modalBasisCache.contributingRawModalEnergy =
    descriptor.contributingRawModalEnergy ?? 0;
  modalBasisCache.bandwidthRejectedModeCount =
    descriptor.bandwidthRejectedModeCount ?? 0;
  modalBasisCache.bandwidthRejectedRawModalEnergy =
    descriptor.bandwidthRejectedRawModalEnergy ?? 0;
  modalBasisCache.contributingStructuralModalEnergy =
    descriptor.contributingStructuralModalEnergy ?? 0;
  modalBasisCache.bandwidthRejectedStructuralModalEnergy =
    descriptor.bandwidthRejectedStructuralModalEnergy ?? 0;
  modalBasisCache.liveSynthesisResolvedRawModalEnergyRatio =
    descriptor.liveSynthesisResolvedRawModalEnergyRatio ?? 1;
  modalBasisCache.liveSynthesisResolvedStructuralModalEnergyRatio =
    descriptor.liveSynthesisResolvedStructuralModalEnergyRatio ?? 1;
  modalBasisCache.liveSynthesisRawGradientEnvelope =
    descriptor.liveSynthesisRawGradientEnvelope ?? 0;
  modalBasisCache.liveSynthesisStructuralGradientEnvelope =
    descriptor.liveSynthesisStructuralGradientEnvelope ?? 0;
}

export function isRaymarchModalBasisCachePendingReadyForDescriptor(
  modalBasisCache,
  descriptor,
) {
  return Boolean(
    modalBasisCache?.pendingReady === true &&
    modalBasisCacheDescriptorsEqual(
      modalBasisCache.pendingDescriptor,
      descriptor,
    ),
  );
}

export function commitRaymarchModalBasisCachePendingDescriptor(
  modalBasisCache,
) {
  if (
    !modalBasisCache?.pendingReady ||
    !modalBasisCache.pendingDescriptor ||
    !modalBasisCache.pendingTexture
  ) {
    return { committed: false, reason: "pending-unavailable" };
  }

  const descriptor = modalBasisCache.pendingDescriptor;
  applyCommittedModalBasisDescriptor(modalBasisCache, descriptor);
  dispatchQueuedRaymarchModalBasisCacheRebuild(modalBasisCache);
  return {
    committed: true,
    descriptor,
    texture: modalBasisCache.texture,
  };
}

export function discardRaymarchModalBasisCachePendingDescriptor(
  modalBasisCache,
) {
  if (!modalBasisCache?.pendingReady || !modalBasisCache.pendingDescriptor) {
    return { discarded: false, reason: "pending-unavailable" };
  }

  const descriptor = modalBasisCache.pendingDescriptor;
  modalBasisCache.ready = Boolean(modalBasisCache.activeDescriptor);
  modalBasisCache.rebuildPending = false;
  modalBasisCache.pendingDescriptor = null;
  modalBasisCache.pendingReady = false;
  modalBasisCache.pendingPhaseSampleTimeSec = null;
  modalBasisCache.pendingCacheBuiltAtSec = null;
  modalBasisCache.pendingRebuildReason = null;
  modalBasisCache.lastRebuildReason = "pending-discarded";
  dispatchQueuedRaymarchModalBasisCacheRebuild(modalBasisCache);
  return {
    discarded: true,
    descriptor,
  };
}

export function enqueueRaymarchModalBasisCacheRebuild(
  modalBasisCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const { modalFieldModeBuffer, uniforms } = options;
  if (!modalBasisCache) {
    return { enqueued: false, reason: "unavailable" };
  }

  if (modalBasisCache.backend === "unavailable") {
    return { enqueued: false, reason: "unavailable" };
  }

  const phaseSampleTimeSec = getCacheSchedulerTimeSec(options);
  const basisCapacity = normalizeBasisCapacity(
    descriptor?.basisCapacity ?? modalBasisCache.basisCapacity,
  );

  if (modalBasisCache.pendingReady) {
    return queueLatestCacheRebuild(
      modalBasisCache,
      descriptor,
      rebuildReason,
      {
        renderer,
        options: snapshotRaymarchCacheRebuildOptions({
          ...options,
          modalFieldCapacity: basisCapacity,
        }),
      },
      modalBasisCacheDescriptorsEqual,
    );
  }

  if (modalBasisCache.rebuildPending) {
    return queueLatestCacheRebuild(
      modalBasisCache,
      descriptor,
      rebuildReason,
      {
        renderer,
        options: snapshotRaymarchCacheRebuildOptions({
          ...options,
          modalFieldCapacity: basisCapacity,
        }),
      },
      modalBasisCacheDescriptorsEqual,
    );
  }

  if (!renderer || typeof renderer.computeAsync !== "function") {
    return { enqueued: false, reason: "renderer-unavailable" };
  }

  const computeNode = getOrCreateRaymarchModalBasisCacheComputeNode(
    modalBasisCache,
    {
      modalFieldModeBuffer,
      modalFieldCapacity: basisCapacity,
      uniforms,
      boundaryMode: descriptor.boundaryMode,
      cavityGeometry: descriptor.cavityGeometry,
    },
  );
  if (!computeNode) {
    return { enqueued: false, reason: "compute-node-unavailable" };
  }

  const rebuildGeneration = beginCacheRebuild(
    modalBasisCache,
    descriptor,
    phaseSampleTimeSec,
  );
  modalBasisCache.pendingPhaseSampleTimeSec = phaseSampleTimeSec;
  const submission = submitRaymarchCacheCompute(renderer, computeNode).then(
    () => {
      if (
        !isCurrentRaymarchCacheGeneration(modalBasisCache, rebuildGeneration)
      ) {
        return;
      }
      modalBasisCache.ready = Boolean(modalBasisCache.activeDescriptor);
      modalBasisCache.rebuildPending = false;
      modalBasisCache.pendingReady = true;
      modalBasisCache.pendingCacheBuiltAtSec =
        modalBasisCache.pendingPhaseSampleTimeSec;
      modalBasisCache.pendingRebuildReason = rebuildReason;
      modalBasisCache.lastError = null;
      modalBasisCache.backend = "compute";
      modalBasisCache.lastRebuildReason = "pending-ready";
    },
    (error) => {
      if (
        !isCurrentRaymarchCacheGeneration(modalBasisCache, rebuildGeneration)
      ) {
        return;
      }
      markCacheBackendUnavailable(
        modalBasisCache,
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

export function shouldRebuildRaymarchModalBasisCache(
  modalBasisCache,
  descriptor,
) {
  if (!modalBasisCache) {
    return { needsRebuild: false, reason: "unavailable" };
  }
  const blockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(descriptor);
  if (blockedReason) {
    return { needsRebuild: false, reason: blockedReason };
  }

  if (modalBasisCache.pendingReady) {
    const pendingReadyReason = resolveModalBasisCacheRebuildReason(
      modalBasisCache.pendingDescriptor,
      descriptor,
    );
    return {
      needsRebuild: Boolean(pendingReadyReason),
      reason: pendingReadyReason ?? "pending-ready",
    };
  }

  if (modalBasisCache.rebuildPending) {
    const rebuildReason = resolveModalBasisCacheRebuildReason(
      modalBasisCache.queuedDescriptor ??
        modalBasisCache.pendingDescriptor ??
        modalBasisCache.activeDescriptor,
      descriptor,
    );

    return {
      needsRebuild: Boolean(rebuildReason),
      reason: rebuildReason ?? "pending",
    };
  }

  const rebuildReason = resolveModalBasisCacheRebuildReason(
    modalBasisCache.activeDescriptor,
    descriptor,
  );

  return {
    needsRebuild: Boolean(rebuildReason),
    reason: rebuildReason ?? "unchanged",
  };
}

export function isRaymarchModalBasisCacheReadyForDescriptor(
  modalBasisCache,
  descriptor,
) {
  return Boolean(
    modalBasisCache?.ready &&
    !modalBasisCache?.rebuildPending &&
    modalBasisCacheDescriptorsEqual(
      modalBasisCache.activeDescriptor,
      descriptor,
    ),
  );
}
