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
  instancedArray,
  textureStore,
  uniform,
  uvec3,
  uint,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { buildRaymarchModalBasisPhaseSignature } from "./phaseSlotSemantics.js";
import { deriveOpticalConvergenceAuthority } from "./fieldShaping.js";

export const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;
export const RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION =
  RAYMARCH_FIELD_CACHE_RESOLUTION;
export const RAYMARCH_MODAL_BASIS_CACHE_CAPACITY = 12;
export const RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT =
  RAYMARCH_MODAL_BASIS_CACHE_CAPACITY;
export const RAYMARCH_BASIS_ATLAS_PACKING = "z-slice-pages-v1";
const FIELD_CACHE_COMPUTE_WORKGROUP_SIZE = Object.freeze([8, 8, 4]);
const FIELD_CACHE_COLOR_QUANTIZATION = 32;
const MODAL_BASIS_CACHE_ENERGY_EPSILON = 0.01;
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

function buildCanonicalSpectralLightColorTopology({
  colorSlots,
  modalFieldSlots,
  activeCount,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const entriesByKey = new Map();

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 4;
    const amplitude = Math.max(0, modalFieldSlots?.[offset + 3] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }

    const colorWeight = clamp01(colorSlots?.[offset + 3] ?? 0);
    const colorInfluence = amplitude * colorWeight;
    if (!(colorInfluence > 0)) {
      continue;
    }

    const u = readModalFieldCoordinate(modalFieldSlots, offset, 0);
    const v = readModalFieldCoordinate(modalFieldSlots, offset, 1);
    const w = readModalFieldCoordinate(modalFieldSlots, offset, 2);
    const key = getModalFieldIdentityKey(u, v, w);
    const entry = entriesByKey.get(key) ?? {
      u,
      v,
      w,
      amplitude: 0,
      colorInfluence: 0,
      r: 0,
      g: 0,
      b: 0,
    };
    entry.amplitude += amplitude;
    entry.colorInfluence += colorInfluence;
    entry.r += colorInfluence * clamp01(colorSlots?.[offset] ?? 0);
    entry.g += colorInfluence * clamp01(colorSlots?.[offset + 1] ?? 0);
    entry.b += colorInfluence * clamp01(colorSlots?.[offset + 2] ?? 0);
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, entry);
    }
  }

  const spectralLightContributionTotal = Math.max(
    MODAL_BASIS_CACHE_ENERGY_EPSILON,
    Array.from(entriesByKey.values()).reduce(
      (total, entry) => total + entry.amplitude,
      0,
    ),
  );
  const entries = Array.from(entriesByKey.values()).map((entry) => {
    const supportKey = getModalFieldRelativeSupportKeyForAmplitude(
      entry.amplitude,
      spectralLightContributionTotal,
    );

    return [
      getFloat32Bits(entry.u),
      getFloat32Bits(entry.v),
      getFloat32Bits(entry.w),
      supportKey,
      Math.round(
        clamp01(entry.r / entry.colorInfluence) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      Math.round(
        clamp01(entry.g / entry.colorInfluence) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      Math.round(
        clamp01(entry.b / entry.colorInfluence) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
      Math.round(
        clamp01(entry.colorInfluence / entry.amplitude) *
          FIELD_CACHE_COLOR_QUANTIZATION,
      ),
    ];
  });

  entries.sort((left, right) => {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] - right[index];
      }
    }
    return 0;
  });

  return entries;
}

function hashSpectralLightModeTopology(entries) {
  let hash = FNV_OFFSET_BASIS;
  for (const entry of entries) {
    for (let index = 0; index < 4; index += 1) {
      hash = hashUint32(entry[index], hash);
    }
  }

  return hash >>> 0;
}

function hashSpectralLightColorTopology(entries) {
  let hash = FNV_OFFSET_BASIS;
  for (const entry of entries) {
    for (const value of entry) {
      hash = hashUint32(value, hash);
    }
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
    uModalFieldModeCount: {
      value: readUniformNumber(sourceUniforms, "uModalFieldModeCount", 0),
    },
    uTotalSlotAmplitude: {
      value: readUniformNumber(sourceUniforms, "uTotalSlotAmplitude", 0),
    },
  };
}

function snapshotRaymarchCacheRebuildOptions(
  options,
  { includeColor = false, includePhase = false } = {},
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
    modalFieldColorBuffer: includeColor
      ? createRaymarchCacheRequestVec4BufferSnapshot(
          options?.modalFieldColorBuffer,
          modalFieldCapacity,
        )
      : null,
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
  includeColor = false,
  includePhase = false,
}) {
  return {
    modalFieldModeBuffer: createRaymarchCacheVec4Buffer(modalFieldCapacity),
    modalFieldColorBuffer: includeColor
      ? createRaymarchCacheVec4Buffer(modalFieldCapacity)
      : null,
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
    modalFieldColorBuffer = null,
    modalFieldPhaseBuffer = null,
    modalFieldCapacity,
    uniforms,
    includeColor = false,
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
      includeColor,
      includePhase,
    });
    cache.computeInputsByKey[nodeKey] = inputs;
  }

  copyRaymarchCacheVec4BufferSnapshot({
    sourceBuffer: modalFieldModeBuffer,
    targetBuffer: inputs.modalFieldModeBuffer,
    modalFieldCapacity,
  });
  if (includeColor) {
    copyRaymarchCacheVec4BufferSnapshot({
      sourceBuffer: modalFieldColorBuffer,
      targetBuffer: inputs.modalFieldColorBuffer,
      modalFieldCapacity,
    });
  }
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

/**
 * @param {unknown} value
 * @param {[number, number, number]} fallback
 * @returns {[number, number, number]}
 */
function readVector3(value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [];
  return [
    Number.isFinite(source[0]) ? source[0] : fallback[0],
    Number.isFinite(source[1]) ? source[1] : fallback[1],
    Number.isFinite(source[2]) ? source[2] : fallback[2],
  ];
}

/**
 * @param {unknown} value
 * @param {[number, number, number]} fallback
 * @returns {[number, number, number]}
 */
function normalizeVector3(value, fallback = [0, 0, 0]) {
  const vector = readVector3(value, fallback);
  const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(magnitude > 1e-6)) {
    return [...fallback];
  }
  return [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude];
}

/**
 * @param {[number, number, number]} left
 * @param {[number, number, number]} right
 * @returns {[number, number, number]}
 */
function crossVector3(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

/**
 * @param {unknown} viewDirection
 * @returns {{ tangent1: [number, number, number], tangent2: [number, number, number] }}
 */
function deriveViewPlaneBasis(viewDirection) {
  const view = normalizeVector3(viewDirection, [0, 0, -1]);
  const seed = /** @type {[number, number, number]} */ (
    Math.abs(view[1]) > Math.abs(view[0]) &&
    Math.abs(view[1]) > Math.abs(view[2])
      ? [1, 0, 0]
      : [0, 1, 0]
  );
  const tangent1 = normalizeVector3(crossVector3(view, seed), [1, 0, 0]);
  const tangent2 = normalizeVector3(crossVector3(view, tangent1), [0, 1, 0]);

  return { tangent1, tangent2 };
}

/**
 * @param {{ gradX?: number, gradY?: number, gradZ?: number } | null | undefined} sample
 * @returns {[number, number, number]}
 */
function readGradientNormal(sample) {
  return normalizeVector3(
    [sample?.gradX ?? 0, sample?.gradY ?? 0, sample?.gradZ ?? 0],
    [0, 0, 0],
  );
}

/**
 * @param {[number, number, number]} vector
 * @param {number} scale
 * @returns {[number, number, number]}
 */
function scaleVector3(vector, scale) {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
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

function getModalBasisCacheMaxRepresentableModeIndex(resolution) {
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

function getModalBasisPhaseScale({ phaseSlots, offset, time }) {
  const beta = Math.min(
    1,
    Math.max(
      0,
      (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
    ),
  );
  const phase =
    (phaseSlots?.[offset] ?? 0) + (phaseSlots?.[offset + 1] ?? 0) * time;
  return 1 - beta + beta * Math.cos(phase);
}

function collectCanonicalLiveSynthesisDiagnosticTerms({
  slots,
  phaseSlots,
  activeCount,
  time = 0,
}) {
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
      phaseCurrentCoefficient: 0,
    };
    entry.amplitude += amplitude;
    entry.phaseCurrentCoefficient +=
      amplitude * getModalBasisPhaseScale({ phaseSlots, offset, time });
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, entry);
    }
  }

  return Array.from(entriesByKey.values());
}

function summarizeLiveSynthesisDiagnostics({
  slots,
  phaseSlots,
  activeCount,
  resolution,
  scale,
  boundaryMode,
  time = 0,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const basisScale = getModalBasisGradientBasisScale(scale, boundaryMode);
  const canonicalTerms = collectCanonicalLiveSynthesisDiagnosticTerms({
    slots,
    phaseSlots,
    activeCount: clampedActiveCount,
    time,
  });
  let contributingBasisPageModeCount = 0;
  const zeroAmplitudeSkippedModeCount = countZeroAmplitudeModalSlots(
    slots,
    clampedActiveCount,
  );
  let bandwidthRejectedModeCount = 0;
  let contributingRawModalEnergy = 0;
  let bandwidthRejectedRawModalEnergy = 0;
  let contributingPhaseCurrentModalEnergy = 0;
  let bandwidthRejectedPhaseCurrentModalEnergy = 0;
  let rawGradientEnvelopeNumerator = 0;
  let phaseCurrentGradientEnvelopeNumerator = 0;

  for (const term of canonicalTerms) {
    const modalEnergy = term.amplitude * term.amplitude;
    const phaseCurrentModalEnergy =
      term.phaseCurrentCoefficient * term.phaseCurrentCoefficient;

    if (
      getModalBasisCacheMaxRepresentableModeIndex(resolution) <
      Math.max(Math.abs(term.u), Math.abs(term.v), Math.abs(term.w))
    ) {
      bandwidthRejectedModeCount += 1;
      bandwidthRejectedRawModalEnergy += modalEnergy;
      bandwidthRejectedPhaseCurrentModalEnergy += phaseCurrentModalEnergy;
      continue;
    }

    contributingBasisPageModeCount += 1;
    contributingRawModalEnergy += modalEnergy;
    contributingPhaseCurrentModalEnergy += phaseCurrentModalEnergy;
    const gradientBound = getModalBasisTermGradientBound({
      term,
      basisScale,
    });
    rawGradientEnvelopeNumerator += modalEnergy * gradientBound;
    phaseCurrentGradientEnvelopeNumerator +=
      phaseCurrentModalEnergy * gradientBound;
  }

  const totalRepresentedModalEnergy =
    contributingRawModalEnergy + bandwidthRejectedRawModalEnergy;
  const totalRepresentedPhaseCurrentModalEnergy =
    contributingPhaseCurrentModalEnergy +
    bandwidthRejectedPhaseCurrentModalEnergy;

  return {
    modalBasisCacheMaxRepresentableModeIndex:
      getModalBasisCacheMaxRepresentableModeIndex(resolution),
    contributingBasisPageModeCount,
    zeroAmplitudeSkippedModeCount,
    bandwidthRejectedModeCount,
    contributingRawModalEnergy,
    bandwidthRejectedRawModalEnergy,
    contributingPhaseCurrentModalEnergy,
    bandwidthRejectedPhaseCurrentModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio:
      totalRepresentedModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? contributingRawModalEnergy / totalRepresentedModalEnergy
        : 1,
    liveSynthesisResolvedPhaseCurrentModalEnergyRatio:
      totalRepresentedPhaseCurrentModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? contributingPhaseCurrentModalEnergy /
          totalRepresentedPhaseCurrentModalEnergy
        : 1,
    liveSynthesisRawGradientEnvelope:
      rawGradientEnvelopeNumerator /
      Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, contributingRawModalEnergy),
    liveSynthesisPhaseCurrentGradientEnvelope:
      phaseCurrentGradientEnvelopeNumerator /
      Math.max(
        MODAL_BASIS_CACHE_ENERGY_EPSILON,
        contributingPhaseCurrentModalEnergy,
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
  time,
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
    time,
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
  const cancellationRatio =
    unsignedSupport > 0
      ? Math.min(
          1,
          Math.max(
            0,
            1 -
              Math.abs(field) /
                Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, unsignedSupport),
          ),
        )
      : 0;

  return {
    unsignedSupport,
    cancellationRatio,
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
  time = 0,
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
      time,
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

function fieldDescriptorsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  if (!fieldDescriptorBaseEqual(left, right)) {
    return false;
  }

  return (
    left.modalFieldCount === right.modalFieldCount &&
    left.modalFieldHash === right.modalFieldHash
  );
}

function fieldDescriptorBaseEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    left.boundaryMode === right.boundaryMode &&
    left.cavityGeometry === right.cavityGeometry &&
    left.radius === right.radius
  );
}

export function spectralLightDescriptorsEqual(left, right) {
  if (!fieldDescriptorBaseEqual(left, right)) {
    return false;
  }

  return (
    left.spectralLightModeCount === right.spectralLightModeCount &&
    left.spectralLightModeHash === right.spectralLightModeHash &&
    left.modalFieldColorHash === right.modalFieldColorHash
  );
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

function resolveFieldRebuildReason(previousDescriptor, nextDescriptor) {
  const baseReason = resolveFieldDescriptorBaseRebuildReason(
    previousDescriptor,
    nextDescriptor,
  );
  if (baseReason) {
    return baseReason;
  }
  if (previousDescriptor.modalFieldCount !== nextDescriptor.modalFieldCount) {
    return "modal-identity";
  }
  if (previousDescriptor.modalFieldHash !== nextDescriptor.modalFieldHash) {
    return "modal-identity";
  }

  return null;
}

function resolveSpectralLightRebuildReason(previousDescriptor, nextDescriptor) {
  const baseReason = resolveFieldDescriptorBaseRebuildReason(
    previousDescriptor,
    nextDescriptor,
  );
  if (baseReason) {
    return baseReason;
  }
  if (
    previousDescriptor.spectralLightModeCount !==
      nextDescriptor.spectralLightModeCount ||
    previousDescriptor.spectralLightModeHash !==
      nextDescriptor.spectralLightModeHash
  ) {
    const modalFieldShapeUnchanged =
      previousDescriptor.modalFieldCount === nextDescriptor.modalFieldCount &&
      previousDescriptor.modalFieldHash === nextDescriptor.modalFieldHash;
    return modalFieldShapeUnchanged ? "color-slots" : "modal-identity";
  }
  if (
    previousDescriptor.modalFieldColorHash !==
    nextDescriptor.modalFieldColorHash
  ) {
    return "color-slots";
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
  const supportTexture = createCacheTexture(
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
    supportTexture,
    supportSemantic: "coefficient-invariant-basis-support",
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
    contributingPhaseCurrentModalEnergy: 0,
    bandwidthRejectedPhaseCurrentModalEnergy: 0,
    liveSynthesisResolvedRawModalEnergyRatio: 1,
    liveSynthesisResolvedPhaseCurrentModalEnergyRatio: 1,
    liveSynthesisRawGradientEnvelope: 0,
    liveSynthesisPhaseCurrentGradientEnvelope: 0,
    liveSynthesisUnsignedSupportMean: 0,
    liveSynthesisCancellationRatioMean: 0,
    liveSynthesisCancellationRatioMax: 0,
    liveSynthesisSupportDiagnosticSampleCount: 0,
    liveSynthesisSupportDiagnosticSupportedSampleCount: 0,
    liveSynthesisSupportDiagnosticCoverage: 0,
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
  if (fieldCache?.computeInputsByKey) {
    Object.values(fieldCache.computeInputsByKey).forEach((inputs) => {
      inputs?.modalFieldModeBuffer?.dispose?.();
      inputs?.modalFieldColorBuffer?.dispose?.();
      inputs?.modalFieldPhaseBuffer?.dispose?.();
      Object.values(inputs?.uniforms ?? {}).forEach((uniformNode) => {
        uniformNode?.dispose?.();
      });
    });
  }
}

export function disposeRaymarchModalBasisCache(modalBasisCache) {
  disposeRaymarchFieldCache(modalBasisCache);
  modalBasisCache?.supportTexture?.dispose?.();
}

export function disposeRaymarchSpectralLightCache(spectralLightCache) {
  disposeRaymarchFieldCache(spectralLightCache);
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
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale: modalBasisFieldScale,
    boundaryMode,
    time,
  });
  const effectiveSupportDiagnostics = summarizeLiveSynthesisSupportDiagnostics({
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius: normalizedRadius,
    resolution: normalizedResolution,
    time,
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
    basisSupportAtlasLayout: {
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
    ...effectiveSupportDiagnostics,
  };
  const modalBasisCacheBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(descriptor);
  return {
    ...descriptor,
    modalBasisCacheDrawable: modalBasisCacheBlockedReason == null,
    modalBasisCacheBlockedReason,
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
  const normalizedUploadedModalFieldCount = Math.max(
    0,
    Math.round(modalFieldCount || 0),
  );
  const fieldDescriptor = buildRaymarchFieldCacheDescriptor({
    modalFieldSlots,
    modalFieldCount: normalizedUploadedModalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius,
  });
  const spectralLightColorTopology = buildCanonicalSpectralLightColorTopology({
    colorSlots: modalFieldColorSlots,
    modalFieldSlots,
    activeCount: normalizedUploadedModalFieldCount,
  });

  return {
    ...fieldDescriptor,
    spectralLightModeCount: spectralLightColorTopology.length,
    spectralLightModeHash: hashSpectralLightModeTopology(
      spectralLightColorTopology,
    ),
    modalFieldColorHash: hashSpectralLightColorTopology(
      spectralLightColorTopology,
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
  let colorR = 0;
  let colorG = 0;
  let colorB = 0;
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
    const localInfluence =
      Math.abs(contribution) * (colorSlots?.[offset + 3] ?? 0);
    colorWeight += localInfluence;
    colorR += localInfluence * (colorSlots?.[offset] ?? 0);
    colorG += localInfluence * (colorSlots?.[offset + 1] ?? 0);
    colorB += localInfluence * (colorSlots?.[offset + 2] ?? 0);
  }

  return {
    colorWeight,
    colorR,
    colorG,
    colorB,
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

function accumulateLiveSynthesisFieldAtPoint({
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
    const phaseCurrentContribution = coefficient * family.field;
    field += phaseCurrentContribution;
    gradX += coefficient * family.gradX;
    gradY += coefficient * family.gradY;
    gradZ += coefficient * family.gradZ;
    unsignedSupport += Math.abs(phaseCurrentContribution);
  }

  return {
    field,
    gradX,
    gradY,
    gradZ,
    unsignedSupport,
    authoritySum,
    totalWeight,
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
  time = 0,
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
    time,
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
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
    time,
  });
  const totalRepresentedModalEnergy =
    liveSynthesisDiagnostics.contributingRawModalEnergy +
    liveSynthesisDiagnostics.bandwidthRejectedRawModalEnergy;
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
                Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, unsignedSupport),
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
    modalBasisCachePhaseAuthority: Math.min(
      1,
      Math.max(
        0,
        modalField.authoritySum /
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
    contributingPhaseCurrentModalEnergy:
      liveSynthesisDiagnostics.contributingPhaseCurrentModalEnergy,
    bandwidthRejectedPhaseCurrentModalEnergy:
      liveSynthesisDiagnostics.bandwidthRejectedPhaseCurrentModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio:
      totalRepresentedModalEnergy > MODAL_BASIS_CACHE_ENERGY_EPSILON
        ? liveSynthesisDiagnostics.contributingRawModalEnergy /
          totalRepresentedModalEnergy
        : 1,
    liveSynthesisResolvedPhaseCurrentModalEnergyRatio:
      liveSynthesisDiagnostics.liveSynthesisResolvedPhaseCurrentModalEnergyRatio,
    liveSynthesisRawGradientEnvelope:
      liveSynthesisDiagnostics.liveSynthesisRawGradientEnvelope,
    liveSynthesisPhaseCurrentGradientEnvelope:
      liveSynthesisDiagnostics.liveSynthesisPhaseCurrentGradientEnvelope,
  };
}

export function evaluateRaymarchNormalConvergencePoint(options = {}) {
  const {
    evaluateFieldPoint: evaluateFieldPointOption,
    viewDirection = [0, 0, -1],
    sampleStep = null,
    radius = 1,
    resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
    x = 0,
    y = 0,
    z = 0,
    ...fieldPointInputs
  } = options;
  const evaluateFieldPoint = /** @type {(inputs: any) => any} */ (
    evaluateFieldPointOption ?? evaluateRaymarchLiveSynthesisFieldPoint
  );
  const safeRadius = Math.max(1e-4, Number.isFinite(radius) ? radius : 1);
  const defaultStep =
    (2 * safeRadius) /
    Math.max(1, normalizeModalBasisCacheResolution(resolution));
  const h =
    Number.isFinite(sampleStep) && sampleStep > 0 ? sampleStep : defaultStep;
  const { tangent1, tangent2 } = deriveViewPlaneBasis(viewDirection);
  /**
   * @param {[number, number, number]} offset
   */
  const sampleNormalAtOffset = ([dx, dy, dz]) =>
    readGradientNormal(
      evaluateFieldPoint({
        ...fieldPointInputs,
        radius: safeRadius,
        resolution,
        x: x + dx,
        y: y + dy,
        z: z + dz,
      }),
    );

  return deriveOpticalConvergenceAuthority({
    tangent1,
    tangent2,
    normalPositiveT1: sampleNormalAtOffset(scaleVector3(tangent1, h)),
    normalNegativeT1: sampleNormalAtOffset(scaleVector3(tangent1, -h)),
    normalPositiveT2: sampleNormalAtOffset(scaleVector3(tangent2, h)),
    normalNegativeT2: sampleNormalAtOffset(scaleVector3(tangent2, -h)),
  });
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
  const colorWeight = modalField.colorWeight;

  return {
    r: modalField.colorR,
    g: modalField.colorG,
    b: modalField.colorB,
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
      const colorWeight = zero.toVar();
      const colorSumX = zero.toVar();
      const colorSumY = zero.toVar();
      const colorSumZ = zero.toVar();

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
            const contribution = amplitude.mul(family.field).toVar();
            const localInfluence = abs(contribution).mul(colorSlot.w).toVar();
            colorWeight.addAssign(localInfluence);
            colorSumX.addAssign(localInfluence.mul(colorSlot.x));
            colorSumY.addAssign(localInfluence.mul(colorSlot.y));
            colorSumZ.addAssign(localInfluence.mul(colorSlot.z));
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

function createModalBasisCacheComputeKernel({
  modalBasisCache,
  modalFieldModeBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution, texture, supportTexture } = modalBasisCache;
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
        textureStore(
          supportTexture,
          voxelCoord,
          vec4(abs(basisField), float(1.0), zero, zero),
        ).toWriteOnly();
      }).Else(() => {
        textureStore(texture, voxelCoord, vec4(zero)).toWriteOnly();
        textureStore(supportTexture, voxelCoord, vec4(zero)).toWriteOnly();
      });
    });
  })().compute(
    modalBasisCache.dispatchSize,
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
  const normalizedModalFieldCapacity =
    normalizeComputeNodeCapacity(modalFieldCapacity);
  const nodeKey = buildRaymarchComputeNodeCacheKey({
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
    modalFieldCapacity: normalizedModalFieldCapacity,
  });
  const computeInputs = getOrUpdateRaymarchCacheComputeInputs(
    fieldCache,
    nodeKey,
    {
      modalFieldModeBuffer,
      modalFieldCapacity: normalizedModalFieldCapacity,
      uniforms,
    },
  );
  const cachedNode = fieldCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createComputeKernel({
    fieldCache,
    modalFieldModeBuffer: computeInputs.modalFieldModeBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms: computeInputs.uniforms,
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
  const normalizedModalFieldCapacity =
    normalizeComputeNodeCapacity(modalFieldCapacity);
  const nodeKey = buildRaymarchComputeNodeCacheKey({
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
    modalFieldCapacity: normalizedModalFieldCapacity,
  });
  const computeInputs = getOrUpdateRaymarchCacheComputeInputs(
    spectralLightCache,
    nodeKey,
    {
      modalFieldModeBuffer,
      modalFieldColorBuffer,
      modalFieldCapacity: normalizedModalFieldCapacity,
      uniforms,
      includeColor: true,
    },
  );
  const cachedNode = spectralLightCache.computeNodesByKey?.[nodeKey];
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createSpectralLightComputeKernel({
    spectralLightCache,
    modalFieldModeBuffer: computeInputs.modalFieldModeBuffer,
    modalFieldColorBuffer: computeInputs.modalFieldColorBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms: computeInputs.uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  spectralLightCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
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
    return cachedNode;
  }

  const computeNode = createModalBasisCacheComputeKernel({
    modalBasisCache,
    modalFieldModeBuffer: computeInputs.modalFieldModeBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms: computeInputs.uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  modalBasisCache.computeNodesByKey[nodeKey] = computeNode;
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

export function enqueueRaymarchFieldCacheRebuild(
  fieldCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  const { modalFieldModeBuffer, modalFieldCapacity, uniforms } = options;
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
      {
        renderer,
        options: snapshotRaymarchCacheRebuildOptions(options),
      },
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
  const submission = submitRaymarchCacheCompute(renderer, computeNode).then(
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
      {
        renderer,
        options: snapshotRaymarchCacheRebuildOptions(options, {
          includeColor: true,
        }),
      },
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
  const submission = submitRaymarchCacheCompute(renderer, computeNode).then(
    () => {
      if (
        !isCurrentRaymarchCacheGeneration(spectralLightCache, rebuildGeneration)
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
        !isCurrentRaymarchCacheGeneration(spectralLightCache, rebuildGeneration)
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
    markCacheBackendUnavailable(modalBasisCache);
    return { enqueued: false, reason: "unavailable" };
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
    markCacheBackendUnavailable(modalBasisCache);
    return { enqueued: false, reason: "unavailable" };
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
      modalBasisCache.activeDescriptor = descriptor;
      modalBasisCache.ready = true;
      modalBasisCache.rebuildPending = false;
      modalBasisCache.activePhaseSampleTimeSec =
        modalBasisCache.pendingPhaseSampleTimeSec;
      modalBasisCache.activeCacheBuiltAtSec =
        modalBasisCache.pendingPhaseSampleTimeSec;
      modalBasisCache.pendingPhaseSampleTimeSec = null;
      modalBasisCache.pendingDescriptor = null;
      modalBasisCache.lastError = null;
      modalBasisCache.backend = "compute";
      modalBasisCache.rebuildCount += 1;
      modalBasisCache.lastRebuildReason = rebuildReason;
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
      modalBasisCache.contributingPhaseCurrentModalEnergy =
        descriptor.contributingPhaseCurrentModalEnergy ?? 0;
      modalBasisCache.bandwidthRejectedPhaseCurrentModalEnergy =
        descriptor.bandwidthRejectedPhaseCurrentModalEnergy ?? 0;
      modalBasisCache.liveSynthesisResolvedRawModalEnergyRatio =
        descriptor.liveSynthesisResolvedRawModalEnergyRatio ?? 1;
      modalBasisCache.liveSynthesisResolvedPhaseCurrentModalEnergyRatio =
        descriptor.liveSynthesisResolvedPhaseCurrentModalEnergyRatio ?? 1;
      modalBasisCache.liveSynthesisRawGradientEnvelope =
        descriptor.liveSynthesisRawGradientEnvelope ?? 0;
      modalBasisCache.liveSynthesisPhaseCurrentGradientEnvelope =
        descriptor.liveSynthesisPhaseCurrentGradientEnvelope ?? 0;
      modalBasisCache.liveSynthesisUnsignedSupportMean =
        descriptor.liveSynthesisUnsignedSupportMean ?? 0;
      modalBasisCache.liveSynthesisCancellationRatioMean =
        descriptor.liveSynthesisCancellationRatioMean ?? 0;
      modalBasisCache.liveSynthesisCancellationRatioMax =
        descriptor.liveSynthesisCancellationRatioMax ?? 0;
      modalBasisCache.liveSynthesisSupportDiagnosticSampleCount =
        descriptor.liveSynthesisSupportDiagnosticSampleCount ?? 0;
      modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount =
        descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount ?? 0;
      modalBasisCache.liveSynthesisSupportDiagnosticCoverage =
        descriptor.liveSynthesisSupportDiagnosticCoverage ?? 0;
      dispatchQueuedRaymarchModalBasisCacheRebuild(modalBasisCache);
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
