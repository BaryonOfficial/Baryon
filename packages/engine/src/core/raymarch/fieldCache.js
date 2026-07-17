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
  NodeAccess,
  storageTexture3D,
  textureStore,
  texture3D,
  uniform,
  uvec3,
  uint,
  max,
  sqrt,
  vec3,
  vec4,
} from "three/tsl";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { buildRaymarchModalBasisPhaseSignature } from "./phaseSlotSemantics.js";
import { normalizePhaseRad } from "../../utils/audio/modalPhaseSlots.js";
import { SPECTRAL_LIGHT_LANE_COUNT } from "../../utils/audio/spectralLight.js";
import { clamp01 } from "../../utils/math.js";

const RAYMARCH_FIELD_CACHE_RESOLUTION = 64;
export const RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION =
  RAYMARCH_FIELD_CACHE_RESOLUTION;
// The modal scalar cache is sampled at cell centers and reconstructed with
// trilinear interpolation. A two-sample Nyquist limit is not drawable here:
// for Neumann cos(n*pi*x/r), n = resolution/2 is exactly zero at every scalar
// sample center, while adjacent modes leave only one sample per half-cycle.
// Require two samples across each positive and negative lobe (four per full
// cycle) so zero crossings and gradients remain bracketed by cache samples.
export const RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE = 4;
export const RAYMARCH_MODAL_BASIS_STEADY_MODE_COUNT = 12;
export const RAYMARCH_MODAL_BASIS_HANDOFF_MODE_COUNT = 1;
export const RAYMARCH_MODAL_BASIS_CACHE_CAPACITY =
  RAYMARCH_MODAL_BASIS_STEADY_MODE_COUNT +
  RAYMARCH_MODAL_BASIS_HANDOFF_MODE_COUNT;
// The synthesis loop budget and storage capacity are distinct contracts even
// while the current cache allocates exactly one page per synthesized mode.
export const RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT =
  RAYMARCH_MODAL_BASIS_CACHE_CAPACITY;
const RAYMARCH_BASIS_ATLAS_PACKING = "z-slice-pages-v1";
const FIELD_CACHE_COMPUTE_WORKGROUP_SIZE = Object.freeze([8, 8, 4]);
export const MODAL_BASIS_CACHE_ENERGY_EPSILON = 0.01;
export const STRUCTURAL_PROJECTION_REFERENCE_ENERGY = 0.01;
const STRUCTURAL_PROJECTION_EPSILON = 1e-12;
// A fixed 60 Hz rectangular detector shutter. This belongs to observation,
// not audio reactivity: it determines which modal frequency separations can
// remain mutually coherent during one measured frame.
const RAYMARCH_DETECTOR_INTEGRATION_TIME_SECONDS = 1 / 60;
export const RAYMARCH_PRESSURE_RADIATION_SEMANTIC =
  "normalized-pressure-velocity-radiation-potential";
const RAYMARCH_UNAVAILABLE_RADIATION_MATERIAL_CONTRAST = Object.freeze({
  pressureEnergyWeight: 0,
  velocityEnergyWeight: 0,
  semantic: "unavailable-no-material-contrast",
  ready: false,
});
// Default radiation tracer: a rigid mineral (quartz-like) particle suspended
// in water — the canonical "particles collect at pressure nodes" cymatic
// configuration. The Gor'kov monopole contrast f1 = 1 − κ_p/κ_0 and dipole
// contrast f2 = 2(ρ̃ − 1)/(2ρ̃ + 1) weight the normalized pressure and
// velocity energies as U ∝ (f1/3)⟨p̃²⟩ − (f2/2)⟨ṽ²⟩. Particle radius only
// scales the physical prefactor, not this normalized shape, so the carrier
// remains a normalized potential rather than calibrated newtons.
const RAYMARCH_RADIATION_TRACER_PROPERTIES = Object.freeze({
  mediumDensityKgPerM3: 998,
  mediumSoundSpeedMetersPerSecond: 1481,
  particleDensityKgPerM3: 2650,
  particleSoundSpeedMetersPerSecond: 5700,
});

export function computeGorkovContrastFactors({
  mediumDensityKgPerM3,
  mediumSoundSpeedMetersPerSecond,
  particleDensityKgPerM3,
  particleSoundSpeedMetersPerSecond,
} = RAYMARCH_RADIATION_TRACER_PROPERTIES) {
  const mediumStiffness =
    mediumDensityKgPerM3 * mediumSoundSpeedMetersPerSecond ** 2;
  const particleStiffness =
    particleDensityKgPerM3 * particleSoundSpeedMetersPerSecond ** 2;
  const compressibilityRatio = mediumStiffness / particleStiffness;
  const densityRatio = particleDensityKgPerM3 / mediumDensityKgPerM3;
  return {
    monopole: 1 - compressibilityRatio,
    dipole: (2 * (densityRatio - 1)) / (2 * densityRatio + 1),
  };
}

const GORKOV_TRACER_CONTRAST = computeGorkovContrastFactors();

export const RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST = Object.freeze(
  {
    pressureEnergyWeight: GORKOV_TRACER_CONTRAST.monopole / 3,
    velocityEnergyWeight: GORKOV_TRACER_CONTRAST.dipole / 2,
    semantic: "gorkov-normalized-rigid-mineral-tracer-in-water",
    ready: true,
  },
);

export function deriveLiveSynthesisCancellationRatio(field, unsignedSupport) {
  if (!(unsignedSupport > MODAL_BASIS_CACHE_ENERGY_EPSILON)) {
    return 0;
  }

  return Math.min(1, Math.max(0, 1 - Math.abs(field) / unsignedSupport));
}

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clampSignedUnit(value) {
  return Math.max(-1, Math.min(1, readFiniteNumber(value, 0)));
}

function normalizeRadiationMaterialContrast(radiationMaterialContrast) {
  if (
    !radiationMaterialContrast ||
    typeof radiationMaterialContrast !== "object"
  ) {
    return RAYMARCH_UNAVAILABLE_RADIATION_MATERIAL_CONTRAST;
  }

  const pressureEnergyWeight = Math.max(
    0,
    readFiniteNumber(radiationMaterialContrast.pressureEnergyWeight, 0),
  );
  const velocityEnergyWeight = Math.max(
    0,
    readFiniteNumber(radiationMaterialContrast.velocityEnergyWeight, 0),
  );
  if (!(pressureEnergyWeight > 0 || velocityEnergyWeight > 0)) {
    return RAYMARCH_UNAVAILABLE_RADIATION_MATERIAL_CONTRAST;
  }

  return {
    pressureEnergyWeight,
    velocityEnergyWeight,
    semantic:
      typeof radiationMaterialContrast.semantic === "string" &&
      radiationMaterialContrast.semantic
        ? radiationMaterialContrast.semantic
        : "normalized-pressure-velocity-material-contrast",
    ready: true,
  };
}

/**
 * The velocity inputs must be the acoustic-velocity-weighted modal gradient
 * sum `Σ c_m ∇Ψ_m / k_m`, not the raw field gradient: linearized Euler gives
 * `v = ∇p / (ρω)` and the cavity dispersion `ω_m = c·k_m`, so each mode's
 * gradient contributes with weight `1/k_m`. The raw gradient over-weights a
 * high-order mode's velocity energy by `k²` and skews the Gor'kov balance.
 */
function deriveNormalizedPressureRadiationFields({
  normalizedPressure,
  velocityX,
  velocityY,
  velocityZ,
  radiationMaterialContrast = null,
}) {
  const pressure = clampSignedUnit(normalizedPressure);
  const normalizedVelocityProxy = clamp01(
    Math.hypot(
      readFiniteNumber(velocityX, 0),
      readFiniteNumber(velocityY, 0),
      readFiniteNumber(velocityZ, 0),
    ),
  );
  const normalizedPressureEnergy = clamp01(pressure * pressure);
  const normalizedVelocityEnergy = clamp01(
    normalizedVelocityProxy * normalizedVelocityProxy,
  );
  const materialContrast = normalizeRadiationMaterialContrast(
    radiationMaterialContrast,
  );
  const normalizedRadiationPotential = materialContrast.ready
    ? clampSignedUnit(
        normalizedPressureEnergy * materialContrast.pressureEnergyWeight -
          normalizedVelocityEnergy * materialContrast.velocityEnergyWeight,
      )
    : 0;

  return {
    normalizedPressure: pressure,
    normalizedPressureProvenance: "coherent-signed-modal-summation",
    normalizedVelocityProxy,
    normalizedPressureEnergy,
    normalizedVelocityEnergy,
    normalizedRadiationPotential,
    radiationPotentialReady: materialContrast.ready,
    radiationMaterialContrastSemantic: materialContrast.semantic,
    radiationPressureEnergyWeight: materialContrast.pressureEnergyWeight,
    radiationVelocityEnergyWeight: materialContrast.velocityEnergyWeight,
  };
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

// Single allocation-free pass over the page slots feeding both topology
// hashes; this runs every runtime tick.
function hashModalBasisPageTopology({
  modalFieldSlots,
  activeCount,
  resolution,
  basisCapacity,
}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const normalizedBasisCapacity = normalizeBasisCapacity(basisCapacity);
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution);
  const normalizedActiveCount = Math.max(0, Math.round(activeCount || 0));
  let pageAssignmentHash = FNV_OFFSET_BASIS;
  let domainHash = FNV_OFFSET_BASIS;
  domainHash = hashUint32(normalizedResolution, domainHash);
  domainHash = hashUint32(normalizedBasisCapacity, domainHash);
  domainHash = hashUint32(normalizedBasisCapacity, domainHash);

  for (let pageIndex = 0; pageIndex < normalizedBasisCapacity; pageIndex += 1) {
    const offset = pageIndex * 4;
    const u = readModalFieldCoordinate(modalFieldSlots, offset, 0);
    const v = readModalFieldCoordinate(modalFieldSlots, offset, 1);
    const w = readModalFieldCoordinate(modalFieldSlots, offset, 2);
    const amplitude = Math.max(0, modalFieldSlots?.[offset + 3] ?? 0);
    const representable =
      pageIndex < normalizedActiveCount &&
      amplitude > 0 &&
      Math.max(Math.abs(u), Math.abs(v), Math.abs(w)) <=
        maxRepresentableModeIndex;

    pageAssignmentHash = hashUint32(pageIndex, pageAssignmentHash);
    pageAssignmentHash = hashFloat32(u, pageAssignmentHash);
    pageAssignmentHash = hashFloat32(v, pageAssignmentHash);
    pageAssignmentHash = hashFloat32(w, pageAssignmentHash);
    domainHash = hashFloat32(u, domainHash);
    domainHash = hashFloat32(v, domainHash);
    domainHash = hashFloat32(w, domainHash);
    domainHash = hashUint32(representable ? 1 : 0, domainHash);
  }

  return {
    identityPageAssignmentHash: pageAssignmentHash >>> 0,
    representableDomainHash: domainHash >>> 0,
  };
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

function getRaymarchBasisAtlasDepth(
  resolution,
  basisCapacity = RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
) {
  return (
    normalizeModalBasisCacheResolution(resolution) *
    normalizeBasisCapacity(basisCapacity)
  );
}

export function getModalBasisCacheMaxRepresentableModeIndex(resolution) {
  return Math.max(
    1,
    Math.floor(
      normalizeModalBasisCacheResolution(resolution) /
        RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
    ),
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
      rmsSpatialWavenumber: 0,
      referenceEnergy: projectionReferenceEnergy,
    };
  }

  let amplitudeSum = 0;
  let structuralEnergy = 0;
  let admittedEnergy = 0;
  let admittedWavenumberEnergy = 0;
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(normalizedResolution);
  const canonicalTerms = collectCanonicalModalFieldTerms(
    modalFieldSlots,
    clampedActiveCount,
  );
  for (const term of canonicalTerms) {
    const amplitude = Math.max(0, term.amplitude);
    if (!(amplitude > 0)) {
      continue;
    }
    // Wavenumber statistics cover every admitted term: any over-bandwidth
    // admission routes the whole set through analytic synthesis, so those
    // modes still render even though they never upload to the basis cache.
    const termEnergy = amplitude * amplitude;
    admittedEnergy += termEnergy;
    admittedWavenumberEnergy +=
      termEnergy * (term.u * term.u + term.v * term.v + term.w * term.w);
    if (
      Math.max(Math.abs(term.u), Math.abs(term.v), Math.abs(term.w)) >
      maxRepresentableModeIndex
    ) {
      continue;
    }
    amplitudeSum += amplitude;
    structuralEnergy += termEnergy;
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
  const rmsSpatialWavenumber =
    admittedEnergy > STRUCTURAL_PROJECTION_EPSILON
      ? Math.sqrt(admittedWavenumberEnergy / admittedEnergy)
      : 0;

  return {
    amplitudeSum,
    structuralEnergy,
    effectiveModeCount,
    rmsStructuralAmplitude,
    projectionEnergyDrive,
    structuralConcentration,
    rmsSpatialWavenumber,
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
  const maxRepresentableModeIndex =
    getModalBasisCacheMaxRepresentableModeIndex(resolution);
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
      maxRepresentableModeIndex <
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
    modalBasisCacheMinSamplesPerCycle:
      RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
    modalBasisCacheMaxRepresentableModeIndex: maxRepresentableModeIndex,
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
  const structuralProjection = deriveStructuralProjectionDrive({
    modalFieldSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
  });
  const modalEnergyAmplitude = Math.sqrt(
    Math.max(
      structuralProjection.structuralEnergy,
      MODAL_BASIS_CACHE_ENERGY_EPSILON ** 2,
    ),
  );
  const field = modalField.field / modalEnergyAmplitude;
  const unsignedSupport = modalField.unsignedSupport / modalEnergyAmplitude;

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
  const texture = createRaymarchCacheTexture(
    normalizedResolution,
    normalizedResolution,
    basisAtlasDepth,
  );
  const pendingTexture = createRaymarchCacheTexture(
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
    modalBasisCacheMinSamplesPerCycle:
      RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
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
  const fieldTexture = createRaymarchCacheTexture(normalizedResolution);
  const supportTexture = createRaymarchCacheTexture(normalizedResolution);
  const pressureRadiationTexture =
    createRaymarchCacheTexture(normalizedResolution);
  const phaseInterferenceTexture =
    createRaymarchCacheTexture(normalizedResolution);

  return {
    ...createCacheState({
      resolution: normalizedResolution,
      texture: fieldTexture,
      mode: "live-field-projection",
    }),
    semantic: "frame-current-modal-field-projection",
    fieldTexture,
    supportTexture,
    pressureRadiationTexture,
    pressureRadiationSemantic: RAYMARCH_PRESSURE_RADIATION_SEMANTIC,
    radiationMaterialContrast:
      RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST,
    phaseInterferenceTexture,
    detectorPairIntegrationBuffersByCapacity: Object.create(null),
    lastComputedAtSec: null,
    lastComputeReason: "uninitialized",
  };
}

export function createRaymarchSpectralLaneCache({
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
} = {}) {
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const spectralLaneTextureA = createRaymarchCacheTexture(normalizedResolution);
  const spectralLaneTextureB = createRaymarchCacheTexture(normalizedResolution);
  const spectralLaneStatsTexture =
    createRaymarchCacheTexture(normalizedResolution);

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

function disposeRaymarchFieldCache(fieldCache) {
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
  if (fieldCache?.standbyComputeNodesByKey) {
    Object.values(fieldCache.standbyComputeNodesByKey).forEach((node) => {
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
  Object.values(
    liveFieldProjectionCache?.detectorPairIntegrationBuffersByCapacity ?? {},
  ).forEach((buffer) => buffer?.dispose?.());
  liveFieldProjectionCache?.supportTexture?.dispose?.();
  liveFieldProjectionCache?.pressureRadiationTexture?.dispose?.();
  liveFieldProjectionCache?.phaseInterferenceTexture?.dispose?.();
}

export function disposeRaymarchSpectralLaneCache(spectralLaneCache) {
  disposeRaymarchFieldCache(spectralLaneCache);
  spectralLaneCache?.spectralLaneTextureB?.dispose?.();
  spectralLaneCache?.spectralLaneStatsTexture?.dispose?.();
}

export function createRaymarchCacheTexture(
  width,
  height = width,
  depth = width,
) {
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

const RAYMARCH_MODAL_BASIS_CACHE_DRAWABLE_STATES = Object.freeze({
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
  const identitySetHash = hashCanonicalModalFieldTopology(
    modalBasisCacheTopology,
  );
  const { identityPageAssignmentHash, representableDomainHash } =
    hashModalBasisPageTopology({
      modalFieldSlots,
      activeCount: normalizedUploadedModalFieldCount,
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
  phaseEvaluationTimeSec = 0,
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
  let velocityX = 0;
  let velocityY = 0;
  let velocityZ = 0;
  let unsignedSupport = 0;
  let phaseAuthorityWeightedAmplitudeSum = 0;
  let totalWeight = 0;
  let modalCoefficientEnergy = 0;
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const phaseEvaluationTime = Number.isFinite(phaseEvaluationTimeSec)
    ? phaseEvaluationTimeSec
    : 0;

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
    modalCoefficientEnergy += amplitude * amplitude;
    const beta = Math.min(
      1,
      Math.max(
        0,
        (phaseSlots?.[offset + 2] ?? 0) * (phaseSlots?.[offset + 3] ?? 0),
      ),
    );
    phaseAuthorityWeightedAmplitudeSum += amplitude * beta;
    const phase = normalizePhaseRad(
      (phaseSlots?.[offset] ?? 0) +
        (phaseSlots?.[offset + 1] ?? 0) * phaseEvaluationTime,
    );
    const phaseMotionContribution = 1 - beta + beta * Math.cos(phase);
    const coefficient = amplitude * phaseMotionContribution;
    const u = slots[offset] ?? 0;
    const v = slots[offset + 1] ?? 0;
    const w = slots[offset + 2] ?? 0;
    const family = geometryBackend.evaluateMode({
      u,
      v,
      w,
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
    // Acoustic velocity per linearized Euler: v = ∇p/(ρω) with ω = c·k, so
    // each mode's gradient carries a 1/k_m weight (k_m = scale·|(u,v,w)|).
    const inverseWaveNumber = 1 / Math.max(scale * Math.hypot(u, v, w), 1e-9);
    velocityX += coefficient * family.gradX * inverseWaveNumber;
    velocityY += coefficient * family.gradY * inverseWaveNumber;
    velocityZ += coefficient * family.gradZ * inverseWaveNumber;
    unsignedSupport += Math.abs(structuralContribution);
  }

  return {
    field,
    gradX,
    gradY,
    gradZ,
    velocityX,
    velocityY,
    velocityZ,
    unsignedSupport,
    phaseAuthorityWeightedAmplitudeSum,
    totalWeight,
    modalCoefficientEnergy,
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
  detectorIntegratedCoherentEnergy,
  independentPhaseEnergy,
  maxConstructivePhaseEnergy,
}) {
  const energyDelta = detectorIntegratedCoherentEnergy - independentPhaseEnergy;
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

function normalizedSinc(value) {
  return Math.abs(value) <= 1e-8 ? 1 : Math.sin(value) / value;
}

/**
 * Precompute the detector-window cross-term weights that are uniform across
 * the volume. The GPU still evaluates the spatial basis product per voxel,
 * but no longer repeats phase wrapping, cosine, frequency separation, or sinc
 * evaluation for every voxel/pair combination.
 * @param {{
 *   target?: Float32Array | null,
 *   capacity?: number,
 *   activeCount?: number,
 *   phaseSlots?: Float32Array | number[] | null,
 *   metadataSlots?: Float32Array | number[] | null,
 *   phaseEvaluationTimeSec?: number,
 *   integrationTimeSec?: number,
 * }} options
 */
export function writeDetectorPairIntegrationWeights({
  target,
  capacity,
  activeCount,
  phaseSlots,
  metadataSlots,
  phaseEvaluationTimeSec = 0,
  integrationTimeSec = RAYMARCH_DETECTOR_INTEGRATION_TIME_SECONDS,
} = {}) {
  if (!target?.fill) {
    return 0;
  }

  target.fill(0);
  const normalizedCapacity = Math.max(1, Math.floor(capacity ?? 0));
  const normalizedActiveCount = Math.min(
    normalizedCapacity,
    Math.max(0, Math.floor(activeCount ?? 0)),
  );
  const phaseEvaluationTime = Number.isFinite(phaseEvaluationTimeSec)
    ? phaseEvaluationTimeSec
    : 0;
  const detectorWindowSec = Math.max(
    0,
    Number.isFinite(integrationTimeSec)
      ? integrationTimeSec
      : RAYMARCH_DETECTOR_INTEGRATION_TIME_SECONDS,
  );
  let pairCount = 0;

  for (let leftIndex = 0; leftIndex < normalizedActiveCount; leftIndex += 1) {
    const leftOffset = leftIndex * 4;
    const leftPhaseWeight = getPhaseProjectionWeight(phaseSlots, leftOffset);
    const leftPhase = normalizePhaseRad(
      (phaseSlots?.[leftOffset] ?? 0) +
        (phaseSlots?.[leftOffset + 1] ?? 0) * phaseEvaluationTime,
    );
    const leftFrequencyHz = Math.max(0, metadataSlots?.[leftOffset] ?? 0);

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalizedActiveCount;
      rightIndex += 1
    ) {
      const rightOffset = rightIndex * 4;
      const rightPhaseWeight = getPhaseProjectionWeight(
        phaseSlots,
        rightOffset,
      );
      const rightPhase = normalizePhaseRad(
        (phaseSlots?.[rightOffset] ?? 0) +
          (phaseSlots?.[rightOffset + 1] ?? 0) * phaseEvaluationTime,
      );
      const rightFrequencyHz = Math.max(0, metadataSlots?.[rightOffset] ?? 0);
      const detectorCoherence = normalizedSinc(
        Math.PI * (leftFrequencyHz - rightFrequencyHz) * detectorWindowSec,
      );
      const coherentPairScale =
        2 * leftPhaseWeight * rightPhaseWeight * detectorCoherence;
      const targetOffset = (leftIndex * normalizedCapacity + rightIndex) * 4;
      target[targetOffset] =
        coherentPairScale * Math.cos(leftPhase - rightPhase);
      target[targetOffset + 1] = Math.abs(coherentPairScale);
      pairCount += 1;
    }
  }

  return pairCount;
}

/**
 * Integrate partially coherent modal energy over a centered rectangular
 * detector shutter. Each cross term is weighted by
 * sinc(pi * (f_i - f_j) * T), so equal-frequency modes retain exact physical
 * interference while frequency-separated modes decorrelate by the amount a
 * real finite-time detector can resolve. The non-authoritative phase fraction
 * remains incoherent and therefore cannot silently destroy acoustic energy.
 */
export function deriveDetectorIntegratedModalEnergy({
  structuralContributions = [],
  phaseWeights = [],
  phases = [],
  frequenciesHz = [],
  modalEnergyReference = null,
  integrationTimeSec = RAYMARCH_DETECTOR_INTEGRATION_TIME_SECONDS,
} = {}) {
  let phaseReal = 0;
  let phaseImag = 0;
  let independentPhaseEnergy = 0;
  let independentStructuralEnergy = 0;
  let incoherentResidualEnergy = 0;
  let structuralSupport = 0;
  const coherentContributions = [];
  const resolvedPhases = [];
  const resolvedFrequenciesHz = [];
  const detectorWindowSec = Math.max(
    0,
    Number.isFinite(integrationTimeSec)
      ? integrationTimeSec
      : RAYMARCH_DETECTOR_INTEGRATION_TIME_SECONDS,
  );
  const count = Math.max(
    structuralContributions.length,
    phaseWeights.length,
    phases.length,
    frequenciesHz.length,
  );

  for (let index = 0; index < count; index += 1) {
    const structuralContribution = Number.isFinite(
      structuralContributions[index],
    )
      ? structuralContributions[index]
      : 0;
    const phaseWeight = clamp01(phaseWeights[index] ?? 0);
    const phase = Number.isFinite(phases[index]) ? phases[index] : 0;
    const frequencyHz = Number.isFinite(frequenciesHz[index])
      ? frequenciesHz[index]
      : 0;
    const structuralEnergy = structuralContribution * structuralContribution;
    const coherentContribution = structuralContribution * phaseWeight;

    structuralSupport += Math.abs(structuralContribution);
    independentStructuralEnergy += structuralEnergy;
    independentPhaseEnergy += coherentContribution * coherentContribution;
    incoherentResidualEnergy +=
      structuralEnergy * (1 - phaseWeight * phaseWeight);
    phaseReal += coherentContribution * Math.cos(phase);
    phaseImag += coherentContribution * Math.sin(phase);
    coherentContributions.push(coherentContribution);
    resolvedPhases.push(phase);
    resolvedFrequenciesHz.push(frequencyHz);
  }

  const instantaneousCoherentEnergy =
    phaseReal * phaseReal + phaseImag * phaseImag;
  let detectorIntegratedCoherentEnergy = independentPhaseEnergy;
  for (let leftIndex = 0; leftIndex < count; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < count; rightIndex += 1) {
      const frequencySeparationHz =
        resolvedFrequenciesHz[leftIndex] - resolvedFrequenciesHz[rightIndex];
      const detectorCoherence = normalizedSinc(
        Math.PI * frequencySeparationHz * detectorWindowSec,
      );
      detectorIntegratedCoherentEnergy +=
        2 *
        coherentContributions[leftIndex] *
        coherentContributions[rightIndex] *
        Math.cos(resolvedPhases[leftIndex] - resolvedPhases[rightIndex]) *
        detectorCoherence;
    }
  }
  detectorIntegratedCoherentEnergy = Math.max(
    0,
    detectorIntegratedCoherentEnergy,
  );
  const detectorIntegratedEnergy =
    detectorIntegratedCoherentEnergy + incoherentResidualEnergy;
  const resolvedModalEnergyReference = Math.max(
    Number.isFinite(modalEnergyReference) && modalEnergyReference > 0
      ? modalEnergyReference
      : independentStructuralEnergy,
    STRUCTURAL_PROJECTION_EPSILON,
  );

  return {
    phaseReal,
    phaseImag,
    instantaneousCoherentEnergy,
    detectorIntegratedCoherentEnergy,
    independentPhaseEnergy,
    independentStructuralEnergy,
    incoherentResidualEnergy,
    detectorIntegratedEnergy,
    detectorIntegratedSpatialEnergy: clamp01(
      detectorIntegratedEnergy / resolvedModalEnergyReference,
    ),
    independentStructuralSpatialEnergy: clamp01(
      independentStructuralEnergy / resolvedModalEnergyReference,
    ),
    modalEnergyReference: resolvedModalEnergyReference,
    structuralSupport,
  };
}

function accumulatePhaseInterferenceContrastAtPoint({
  slots,
  phaseSlots,
  metadataSlots,
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
  let independentStructuralEnergy = 0;
  let incoherentResidualEnergy = 0;
  let maxConstructivePhaseMagnitude = 0;
  let structuralSupport = 0;
  let structuralWeight = 0;
  let structuralModalEnergy = 0;
  let phaseAuthorityWeightedSupport = 0;
  let phaseAuthorityModeCount = 0;
  const structuralContributions = [];
  const phaseWeights = [];
  const phases = [];
  const frequenciesHz = [];
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
    const structuralEnergy = structuralContribution * structuralContribution;
    structuralSupport += structuralMagnitude;
    structuralWeight += amplitude;
    structuralModalEnergy += amplitude * amplitude;

    const phaseWeight = getPhaseProjectionWeight(phaseSlots, offset);
    independentStructuralEnergy += structuralEnergy;
    incoherentResidualEnergy +=
      structuralEnergy * (1 - phaseWeight * phaseWeight);
    const phase = normalizePhaseRad(
      (phaseSlots?.[offset] ?? 0) + (phaseSlots?.[offset + 1] ?? 0) * time,
    );
    structuralContributions.push(structuralContribution);
    phaseWeights.push(phaseWeight);
    phases.push(phase);
    frequenciesHz.push(metadataSlots?.[offset] ?? 0);
    if (!(phaseWeight > 1e-4)) {
      continue;
    }

    phaseAuthorityModeCount += 1;
    phaseAuthorityWeightedSupport += structuralMagnitude * phaseWeight;
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
  const detectorEnergy = deriveDetectorIntegratedModalEnergy({
    structuralContributions,
    phaseWeights,
    phases,
    frequenciesHz,
    modalEnergyReference: structuralModalEnergy,
  });
  const detectorIntegratedCoherentEnergy =
    detectorEnergy.detectorIntegratedCoherentEnergy;
  const detectorIntegratedEnergy = detectorEnergy.detectorIntegratedEnergy;
  const maxConstructivePhaseEnergy =
    maxConstructivePhaseMagnitude * maxConstructivePhaseMagnitude;
  const phaseInterferenceContrast = getSignedInterferenceContrast({
    detectorIntegratedCoherentEnergy,
    independentPhaseEnergy,
    maxConstructivePhaseEnergy,
  });
  const phaseInterferenceAuthority = clamp01(
    phaseAuthorityWeightedSupport / supportDenominator,
  );

  return {
    phaseInterferenceContrast,
    phaseInterferenceAuthority,
    detectorIntegratedCoherentEnergy,
    independentPhaseEnergy,
    independentStructuralEnergy,
    incoherentResidualEnergy,
    detectorIntegratedEnergy,
    detectorIntegratedSpatialEnergy:
      detectorEnergy.detectorIntegratedSpatialEnergy,
    independentStructuralSpatialEnergy:
      detectorEnergy.independentStructuralSpatialEnergy,
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
  phaseEvaluationTimeSec = 0,
  boundaryMode,
  cavityGeometry = "rectangular",
  radius = 1,
  x = 0,
  y = 0,
  z = 0,
  resolution = RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  radiationMaterialContrast = null,
}) {
  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedResolution = normalizeModalBasisCacheResolution(resolution);
  const scale = getModalBasisFieldScale(radius);
  const modalField = accumulateLiveSynthesisFieldAtPoint({
    slots: modalFieldSlots,
    phaseSlots: modalFieldPhaseSlots,
    activeCount: modalFieldCount,
    phaseEvaluationTimeSec,
    x,
    y,
    z,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  const liveSynthesisDiagnostics = summarizeLiveSynthesisDiagnostics({
    slots: modalFieldSlots,
    activeCount: modalFieldCount,
    resolution: normalizedResolution,
    scale,
    boundaryMode: normalizedBoundaryMode,
  });
  // The unit-mean-square modal basis makes Σa² the represented acoustic
  // energy. Canonical diagnostic terms merge duplicate identities before the
  // sum, matching the runtime descriptor. Its square root is therefore the
  // mode-count-independent scale for structural observation. Raw pressure
  // and gradient remain untouched for the acousto-optic transport owner.
  const modalEnergyAmplitude = Math.sqrt(
    Math.max(
      liveSynthesisDiagnostics.contributingRawModalEnergy,
      MODAL_BASIS_CACHE_ENERGY_EPSILON ** 2,
    ),
  );
  const totalRepresentedModalEnergy =
    liveSynthesisDiagnostics.contributingRawModalEnergy +
    liveSynthesisDiagnostics.bandwidthRejectedRawModalEnergy;
  const field = modalField.field / modalEnergyAmplitude;
  const gradX = modalField.gradX / modalEnergyAmplitude;
  const gradY = modalField.gradY / modalEnergyAmplitude;
  const gradZ = modalField.gradZ / modalEnergyAmplitude;
  const unsignedSupport = modalField.unsignedSupport / modalEnergyAmplitude;
  const cancellationRatio = deriveLiveSynthesisCancellationRatio(
    field,
    unsignedSupport,
  );
  const pressureRadiationFields = deriveNormalizedPressureRadiationFields({
    normalizedPressure: field,
    velocityX: modalField.velocityX / modalEnergyAmplitude,
    velocityY: modalField.velocityY / modalEnergyAmplitude,
    velocityZ: modalField.velocityZ / modalEnergyAmplitude,
    radiationMaterialContrast,
  });

  return {
    field,
    gradX,
    gradY,
    gradZ,
    rawPressure: modalField.field,
    rawGradX: modalField.gradX,
    rawGradY: modalField.gradY,
    rawGradZ: modalField.gradZ,
    modalEnergyAmplitude,
    unsignedSupport,
    cancellationRatio,
    ...pressureRadiationFields,
    modalBasisCachePhaseAuthority: Math.min(
      1,
      Math.max(
        0,
        modalField.phaseAuthorityWeightedAmplitudeSum /
          Math.max(MODAL_BASIS_CACHE_ENERGY_EPSILON, modalField.totalWeight),
      ),
    ),
    modalBasisCacheMinSamplesPerCycle:
      RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
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
  modalFieldMetadataSlots,
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
    metadataSlots: modalFieldMetadataSlots,
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
  targetTexture,
  modalFieldModeBuffer,
  modalFieldCapacity,
  uniforms,
  boundaryMode,
  cavityGeometry,
}) {
  const { resolution } = modalBasisCache;
  const texture = targetTexture;
  const writeTexture = storageTexture3D(texture).setAccess(
    NodeAccess.WRITE_ONLY,
  );
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
          writeTexture,
          voxelCoord,
          vec4(basisField, basisGradX, basisGradY, basisGradZ),
        ).toWriteOnly();
      }).Else(() => {
        textureStore(writeTexture, voxelCoord, vec4(zero)).toWriteOnly();
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
  modalFieldModeBuffer,
  modalFieldCoefficientBuffer,
  modalFieldPhaseBuffer,
  detectorPairIntegrationBuffer,
  modalFieldCapacity,
  uniforms,
}) {
  const {
    resolution,
    fieldTexture,
    supportTexture,
    pressureRadiationTexture,
    phaseInterferenceTexture,
  } = liveFieldProjectionCache;
  const writeFieldTexture = storageTexture3D(fieldTexture).setAccess(
    NodeAccess.WRITE_ONLY,
  );
  const writeSupportTexture = storageTexture3D(supportTexture).setAccess(
    NodeAccess.WRITE_ONLY,
  );
  const writePressureRadiationTexture = storageTexture3D(
    pressureRadiationTexture,
  ).setAccess(NodeAccess.WRITE_ONLY);
  const writePhaseInterferenceTexture = storageTexture3D(
    phaseInterferenceTexture,
  ).setAccess(NodeAccess.WRITE_ONLY);
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
      const velocitySum = vec3(0.0).toVar();
      const supportSum = zero.toVar();
      const structuralSupportSum = zero.toVar();
      const modalCoefficientEnergySum = zero.toVar();
      const independentPhaseEnergySum = zero.toVar();
      const independentStructuralEnergySum = zero.toVar();
      const incoherentResidualEnergySum = zero.toVar();
      const phaseInterferenceAuthoritySum = zero.toVar();
      const waveNumberScale = float(Math.PI).div(
        uniforms.uRadius.max(float(1e-4)),
      );

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
            const phaseSlot = modalFieldPhaseBuffer.element(i);
            const phaseWeight = clamp(phaseSlot.z.mul(phaseSlot.w), zero, one);
            const rawPhase = phaseSlot.x.add(
              phaseSlot.y.mul(uniforms.uPhaseEvaluationTime),
            );
            const phase = fract(rawPhase.mul(invTwoPi).add(half))
              .sub(half)
              .mul(twoPi);
            const phaseMotionContribution = one
              .sub(phaseWeight)
              .add(phaseWeight.mul(cos(phase)));
            const phaseAwareCoefficient = coefficient.mul(
              phaseMotionContribution,
            );
            fieldSum.addAssign(phaseAwareCoefficient.mul(basisSample.x));
            gradXSum.addAssign(phaseAwareCoefficient.mul(basisSample.y));
            gradYSum.addAssign(phaseAwareCoefficient.mul(basisSample.z));
            gradZSum.addAssign(phaseAwareCoefficient.mul(basisSample.w));
            // Acoustic velocity per linearized Euler: v = ∇p/(ρω), ω = c·k,
            // so each mode's gradient carries a 1/k_m weight. Mirrors the
            // CPU path in accumulateLiveSynthesisFieldAtPoint.
            const modeSlot = modalFieldModeBuffer.element(i);
            const tupleMagnitude = sqrt(
              modeSlot.x
                .mul(modeSlot.x)
                .add(modeSlot.y.mul(modeSlot.y))
                .add(modeSlot.z.mul(modeSlot.z)),
            );
            const inverseWaveNumber = one.div(
              max(waveNumberScale.mul(tupleMagnitude), float(1e-9)),
            );
            velocitySum.addAssign(
              vec3(basisSample.y, basisSample.z, basisSample.w)
                .mul(phaseAwareCoefficient)
                .mul(inverseWaveNumber),
            );
            supportSum.addAssign(
              abs(phaseAwareCoefficient).mul(abs(basisSample.x)),
            );
            structuralSupportSum.addAssign(abs(structuralContribution));
            modalCoefficientEnergySum.addAssign(coefficient.mul(coefficient));
            const weightedPhaseContribution =
              structuralContribution.mul(phaseWeight);
            const structuralEnergy = structuralContribution.mul(
              structuralContribution,
            );
            independentPhaseEnergySum.addAssign(
              weightedPhaseContribution.mul(weightedPhaseContribution),
            );
            independentStructuralEnergySum.addAssign(structuralEnergy);
            incoherentResidualEnergySum.addAssign(
              structuralEnergy.mul(one.sub(phaseWeight.mul(phaseWeight))),
            );
            phaseInterferenceAuthoritySum.addAssign(
              abs(structuralContribution).mul(phaseWeight),
            );
          });
        },
      );

      // Exact centered rectangular-window integral of the coherent cross
      // terms. The phase/frequency/shutter weights are uniform across the
      // volume and are precomputed once per frame; this pass owns only the
      // spatial basis products that genuinely vary per voxel.
      const detectorIntegratedCoherentEnergy =
        independentPhaseEnergySum.toVar();
      const maxDetectorCrossMagnitude = zero.toVar();
      Loop(
        {
          start: int(0),
          end: int(normalizedCapacity),
          type: "int",
          condition: "<",
        },
        ({ i }) => {
          If(i.lessThan(modalFieldActiveCount), () => {
            const coefficientI = modalFieldCoefficientBuffer.element(i).x;
            const atlasUvI = vec3(
              basisUv.x,
              basisUv.y,
              float(i).add(basisUv.z).mul(invCapacity),
            );
            const structuralContributionI = coefficientI.mul(
              texture3D(modalBasisAtlasTexture).sample(atlasUvI).x,
            );
            Loop(
              {
                start: int(0),
                end: int(normalizedCapacity),
                type: "int",
                condition: "<",
              },
              ({ i: j }) => {
                If(
                  j.greaterThan(i).and(j.lessThan(modalFieldActiveCount)),
                  () => {
                    const coefficientJ =
                      modalFieldCoefficientBuffer.element(j).x;
                    const atlasUvJ = vec3(
                      basisUv.x,
                      basisUv.y,
                      float(j).add(basisUv.z).mul(invCapacity),
                    );
                    const structuralContributionJ = coefficientJ.mul(
                      texture3D(modalBasisAtlasTexture).sample(atlasUvJ).x,
                    );
                    const detectorPair = detectorPairIntegrationBuffer.element(
                      i.mul(int(normalizedCapacity)).add(j),
                    );
                    const structuralPair = structuralContributionI.mul(
                      structuralContributionJ,
                    );
                    const detectorCrossTerm = structuralPair.mul(
                      detectorPair.x,
                    );
                    detectorIntegratedCoherentEnergy.addAssign(
                      detectorCrossTerm,
                    );
                    maxDetectorCrossMagnitude.addAssign(
                      abs(structuralPair).mul(detectorPair.y),
                    );
                  },
                );
              },
            );
          });
        },
      );

      const modalEnergyAmplitude = sqrt(
        max(
          modalCoefficientEnergySum,
          float(MODAL_BASIS_CACHE_ENERGY_EPSILON ** 2),
        ),
      );
      const normalizedSignedField = fieldSum.div(modalEnergyAmplitude).toVar();
      const normalizedPressure = clamp(
        normalizedSignedField,
        float(-1.0),
        one,
      ).toVar();
      const normalizedVelocity = velocitySum.div(modalEnergyAmplitude);
      const normalizedVelocityProxy = clamp(
        sqrt(
          normalizedVelocity.x
            .mul(normalizedVelocity.x)
            .add(normalizedVelocity.y.mul(normalizedVelocity.y))
            .add(normalizedVelocity.z.mul(normalizedVelocity.z)),
        ),
        zero,
        one,
      ).toVar();
      const normalizedPressureEnergy = clamp(
        normalizedPressure.mul(normalizedPressure),
        zero,
        one,
      );
      const normalizedVelocityEnergy = clamp(
        normalizedVelocityProxy.mul(normalizedVelocityProxy),
        zero,
        one,
      );
      const normalizedRadiationPotential = clamp(
        normalizedPressureEnergy
          .mul(
            float(
              RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.pressureEnergyWeight,
            ),
          )
          .sub(
            normalizedVelocityEnergy.mul(
              float(
                RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST.velocityEnergyWeight,
              ),
            ),
          ),
        float(-1.0),
        one,
      );
      const modalCoefficientEnergyReference = max(
        modalCoefficientEnergySum,
        float(STRUCTURAL_PROJECTION_EPSILON),
      );
      const nonnegativeDetectorIntegratedCoherentEnergy = max(
        detectorIntegratedCoherentEnergy,
        zero,
      );
      const phaseEnergyDelta = nonnegativeDetectorIntegratedCoherentEnergy.sub(
        independentPhaseEnergySum,
      );
      const constructiveContrast = clamp(
        phaseEnergyDelta.div(
          max(maxDetectorCrossMagnitude, float(STRUCTURAL_PROJECTION_EPSILON)),
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
          max(structuralSupportSum, float(MODAL_BASIS_CACHE_ENERGY_EPSILON)),
        ),
        zero,
        one,
      );
      const detectorIntegratedEnergy =
        nonnegativeDetectorIntegratedCoherentEnergy.add(
          incoherentResidualEnergySum,
        );
      const detectorIntegratedSpatialEnergy = clamp(
        detectorIntegratedEnergy.div(modalCoefficientEnergyReference),
        zero,
        one,
      );
      const independentStructuralSpatialEnergy = clamp(
        independentStructuralEnergySum.div(modalCoefficientEnergyReference),
        zero,
        one,
      );
      textureStore(
        writeFieldTexture,
        voxelCoord,
        // Physical pressure and ∇p are the acousto-optic carrier. They must
        // stay linear in coefficient amplitude; only the separate detector
        // texture below is RMS-normalized for structural observation.
        vec4(fieldSum, gradXSum, gradYSum, gradZSum),
      ).toWriteOnly();
      textureStore(
        writeSupportTexture,
        voxelCoord,
        vec4(supportSum.div(modalEnergyAmplitude), zero, zero, one),
      ).toWriteOnly();
      textureStore(
        writePressureRadiationTexture,
        voxelCoord,
        vec4(
          normalizedPressure,
          normalizedVelocityProxy,
          normalizedRadiationPotential,
          one,
        ),
      ).toWriteOnly();
      textureStore(
        writePhaseInterferenceTexture,
        voxelCoord,
        vec4(
          phaseInterferenceContrast,
          detectorIntegratedSpatialEnergy,
          phaseInterferenceAuthority,
          independentStructuralSpatialEnergy,
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
  const writeSpectralLaneTextureA = storageTexture3D(
    spectralLaneTextureA,
  ).setAccess(NodeAccess.WRITE_ONLY);
  const writeSpectralLaneTextureB = storageTexture3D(
    spectralLaneTextureB,
  ).setAccess(NodeAccess.WRITE_ONLY);
  const writeSpectralLaneStatsTexture = storageTexture3D(
    spectralLaneStatsTexture,
  ).setAccess(NodeAccess.WRITE_ONLY);
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
        writeSpectralLaneTextureA,
        voxelCoord,
        vec4(lane0, lane1, lane2, lane3),
      ).toWriteOnly();
      textureStore(
        writeSpectralLaneTextureB,
        voxelCoord,
        vec4(lane4, lane5, lane6, lane7),
      ).toWriteOnly();
      textureStore(
        writeSpectralLaneStatsTexture,
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
  const cachedNode = getCachedTexturedComputeNode(
    modalBasisCache,
    nodeKey,
    "raymarchModalBasisTargetTexture",
    targetTexture,
  );
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createModalBasisCacheComputeKernel({
    modalBasisCache,
    targetTexture,
    modalFieldModeBuffer: computeInputs.modalFieldModeBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms: computeInputs.uniforms,
    boundaryMode: normalizedBoundaryMode,
    cavityGeometry: normalizedCavityGeometry,
  });
  tagTexturedComputeNode(
    computeNode,
    "raymarchModalBasisTargetTexture",
    targetTexture,
  );
  modalBasisCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function getOrCreateRaymarchLiveFieldProjectionCacheComputeNode(
  liveFieldProjectionCache,
  {
    modalBasisAtlasTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    detectorPairIntegrationBuffer,
    modalFieldCapacity,
    uniforms,
  },
) {
  if (
    !liveFieldProjectionCache ||
    !modalBasisAtlasTexture ||
    !modalFieldModeBuffer ||
    !modalFieldCoefficientBuffer ||
    !modalFieldPhaseBuffer ||
    !detectorPairIntegrationBuffer
  ) {
    return null;
  }

  const normalizedModalFieldCapacity =
    normalizeComputeNodeCapacity(modalFieldCapacity);
  const nodeKey = [
    "live-field-projection",
    `capacity=${normalizedModalFieldCapacity}`,
  ].join(":");
  const cachedNode = getCachedTexturedComputeNode(
    liveFieldProjectionCache,
    nodeKey,
    "raymarchModalBasisAtlasTexture",
    modalBasisAtlasTexture,
  );
  if (cachedNode) {
    return cachedNode;
  }

  const computeNode = createLiveFieldProjectionComputeKernel({
    liveFieldProjectionCache,
    modalBasisAtlasTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    detectorPairIntegrationBuffer,
    modalFieldCapacity: normalizedModalFieldCapacity,
    uniforms,
  });
  tagTexturedComputeNode(
    computeNode,
    "raymarchModalBasisAtlasTexture",
    modalBasisAtlasTexture,
  );
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
  const cachedNode = getCachedTexturedComputeNode(
    spectralLaneCache,
    nodeKey,
    "raymarchModalBasisAtlasTexture",
    modalBasisAtlasTexture,
  );
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
  tagTexturedComputeNode(
    computeNode,
    "raymarchModalBasisAtlasTexture",
    modalBasisAtlasTexture,
  );
  spectralLaneCache.computeNodesByKey[nodeKey] = computeNode;
  return computeNode;
}

function texturedComputeNodeMatches(computeNode, textureTagKey, texture) {
  const taggedTexture = /** @type {Record<string, unknown>} */ (computeNode)[
    textureTagKey
  ];
  return !taggedTexture || taggedTexture === texture;
}

// The modal-basis atlas ping-pongs between exactly two textures, so each
// kernel has at most two texture-bound variants. Retain the displaced variant
// in a standby slot instead of disposing it: steady-state atlas promotions
// then reuse compiled pipelines instead of rebuilding WGSL kernels.
function getCachedTexturedComputeNode(cache, nodeKey, textureTagKey, texture) {
  const activeNode = cache.computeNodesByKey?.[nodeKey] ?? null;
  if (
    activeNode &&
    texturedComputeNodeMatches(activeNode, textureTagKey, texture)
  ) {
    return activeNode;
  }

  if (!cache.standbyComputeNodesByKey) {
    cache.standbyComputeNodesByKey = Object.create(null);
  }
  const standbyNode = cache.standbyComputeNodesByKey[nodeKey] ?? null;
  if (
    standbyNode &&
    texturedComputeNodeMatches(standbyNode, textureTagKey, texture)
  ) {
    if (activeNode) {
      cache.standbyComputeNodesByKey[nodeKey] = activeNode;
    } else {
      delete cache.standbyComputeNodesByKey[nodeKey];
    }
    cache.computeNodesByKey[nodeKey] = standbyNode;
    return standbyNode;
  }

  if (activeNode) {
    standbyNode?.dispose?.();
    cache.standbyComputeNodesByKey[nodeKey] = activeNode;
    delete cache.computeNodesByKey[nodeKey];
  }
  return null;
}

function tagTexturedComputeNode(computeNode, textureTagKey, texture) {
  if (
    computeNode &&
    (typeof computeNode === "object" || typeof computeNode === "function")
  ) {
    /** @type {Record<string, unknown>} */ (computeNode)[textureTagKey] =
      texture;
  }
}

function getOrUpdateDetectorPairIntegrationBuffer(
  liveFieldProjectionCache,
  {
    modalFieldPhaseBuffer,
    modalFieldMetadataBuffer,
    modalFieldCapacity,
    uniforms,
  },
) {
  const phaseSlots = modalFieldPhaseBuffer?.value?.array;
  const metadataSlots = modalFieldMetadataBuffer?.value?.array;
  if (!phaseSlots || !metadataSlots) {
    return null;
  }

  const normalizedCapacity = normalizeComputeNodeCapacity(modalFieldCapacity);
  const buffersByCapacity =
    liveFieldProjectionCache.detectorPairIntegrationBuffersByCapacity ??
    (liveFieldProjectionCache.detectorPairIntegrationBuffersByCapacity =
      Object.create(null));
  let buffer = buffersByCapacity[normalizedCapacity];
  if (!buffer) {
    buffer = createRaymarchCacheVec4Buffer(
      normalizedCapacity * normalizedCapacity,
    );
    buffersByCapacity[normalizedCapacity] = buffer;
  }

  writeDetectorPairIntegrationWeights({
    target: buffer.value.array,
    capacity: normalizedCapacity,
    activeCount: readUniformNumber(uniforms, "uModalFieldModeCount", 0),
    phaseSlots,
    metadataSlots,
    phaseEvaluationTimeSec: readUniformNumber(
      uniforms,
      "uPhaseEvaluationTime",
      0,
    ),
  });
  buffer.value.needsUpdate = true;
  return buffer;
}

export function computeRaymarchLiveFieldProjectionCache(
  liveFieldProjectionCache,
  renderer,
  {
    modalBasisAtlasTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldPhaseBuffer,
    modalFieldMetadataBuffer,
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

  const detectorPairIntegrationBuffer =
    getOrUpdateDetectorPairIntegrationBuffer(liveFieldProjectionCache, {
      modalFieldPhaseBuffer,
      modalFieldMetadataBuffer,
      modalFieldCapacity,
      uniforms,
    });

  const computeNode = getOrCreateRaymarchLiveFieldProjectionCacheComputeNode(
    liveFieldProjectionCache,
    {
      modalBasisAtlasTexture,
      modalFieldModeBuffer,
      modalFieldCoefficientBuffer,
      modalFieldPhaseBuffer,
      detectorPairIntegrationBuffer,
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
    modalBasisCacheDescriptor = null,
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
  spectralLaneCache.modalBasisCacheDescriptor = modalBasisCacheDescriptor;
  spectralLaneCache.modalBasisAtlasTexture = modalBasisAtlasTexture;
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
  modalBasisCache.modalBasisCacheMinSamplesPerCycle =
    descriptor.modalBasisCacheMinSamplesPerCycle ??
    RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE;
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
  if (!modalBasisCache?.pendingReady || !modalBasisCache.pendingDescriptor) {
    return { committed: false, reason: "pending-unavailable" };
  }
  if (!modalBasisCache.texture || !modalBasisCache.pendingTexture) {
    modalBasisCache.lastError = "cache-texture-missing";
    modalBasisCache.lastRebuildReason = "texture-missing";
    return { committed: false, reason: "texture-missing" };
  }
  if (modalBasisCache.pendingTexture === modalBasisCache.texture) {
    modalBasisCache.lastError = "cache-texture-alias";
    modalBasisCache.lastRebuildReason = "texture-alias";
    return { committed: false, reason: "texture-alias" };
  }

  const descriptor = modalBasisCache.pendingDescriptor;
  const promotedTexture = modalBasisCache.pendingTexture;
  modalBasisCache.pendingTexture = modalBasisCache.texture;
  modalBasisCache.texture = promotedTexture;
  applyCommittedModalBasisDescriptor(modalBasisCache, descriptor);
  dispatchQueuedRaymarchModalBasisCacheRebuild(modalBasisCache);
  return {
    committed: true,
    descriptor,
    texture: promotedTexture,
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
  const submission = submitRaymarchCacheCompute(renderer, computeNode).catch(
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

  // The compute dispatch is queue-ordered ahead of everything this frame
  // renders, so the pending atlas is safe to commit within the same runtime
  // tick. Waiting a frame here is what froze the render packet once per
  // basis reassign (~13x/s with dense music) and read as flicker.
  modalBasisCache.ready = Boolean(modalBasisCache.activeDescriptor);
  modalBasisCache.rebuildPending = false;
  modalBasisCache.pendingReady = true;
  modalBasisCache.pendingCacheBuiltAtSec =
    modalBasisCache.pendingPhaseSampleTimeSec;
  modalBasisCache.pendingRebuildReason = rebuildReason;
  modalBasisCache.lastError = null;
  modalBasisCache.backend = "compute";
  modalBasisCache.lastRebuildReason = "pending-ready";

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
