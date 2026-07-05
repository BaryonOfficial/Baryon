import * as THREE from "three";
import { VolumeNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  cos,
  cross,
  dot,
  exp,
  float,
  fract,
  length,
  max,
  mix,
  modelWorldMatrixInverse,
  screenCoordinate,
  sin,
  smoothstep,
  sqrt,
  int,
  texture3D,
  vec3,
  vec4,
} from "three/tsl";
import { MODAL_BASIS_CACHE_ENERGY_EPSILON } from "./fieldCache.js";
import SafeVolumetricLightingModel, {
  raymarchLightNode,
  raymarchOpacityNode,
} from "./SafeVolumetricLightingModel.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import {
  FIELD_EXTENTS,
  normalizeFieldExtent,
  UNBOUNDED_CORE_STEP_RADIUS_SCALE,
  UNBOUNDED_DIRECTIVITY_RADIUS,
  UNBOUNDED_DOMAIN_SCALE,
  UNBOUNDED_FIELD_FALLOFF,
  UNBOUNDED_FOCUS_PRESENCE,
  UNBOUNDED_OUTER_FADE_END,
  UNBOUNDED_OUTER_FADE_START,
  UNBOUNDED_OUTER_STEP_STRETCH,
  UNBOUNDED_RADIAL_PHASE_GAIN,
  UNBOUNDED_REACH_EXTENSION,
  UNBOUNDED_SHELL_RAMP,
  UNBOUNDED_STEP_SCALE,
  UNBOUNDED_SUPPORT_PRESENCE_END,
  UNBOUNDED_SUPPORT_PRESENCE_START,
  UNBOUNDED_TRAVEL_BLEND_END,
  UNBOUNDED_TRAVEL_BLEND_START,
  UNBOUNDED_WAVE_DRIFT,
} from "../fieldExtent.js";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import {
  RAYMARCH_BOUNDARY_END,
  RAYMARCH_BOUNDARY_START,
} from "./intersection.js";
import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";
import { SPECTRAL_LIGHT_LANE_DISPLAY_RGB } from "../../utils/audio/spectralLight.js";
import {
  BOUNDARY_CONTOUR_ACCENT_WEIGHT,
  AIR_BAND_WEIGHT,
  BODY_BOUNDARY_REDUCTION,
  BODY_DENSITY_GAIN,
  BEAM_SPECTRAL_GAIN,
  BEAM_TRANSIENT_GAIN,
  BROAD_BAND_SCALE,
  CAUSTIC_BODY_MIX_MAX,
  CAUSTIC_DENSITY_GAIN,
  CAUSTIC_FOCAL_CONVERGENCE,
  CAUSTIC_FOCAL_FLOOR,
  CAUSTIC_FOCUS_POWER,
  COLOR_BIAS_SCALE,
  COLOR_BLEND_END,
  COLOR_BLEND_START,
  CONTOUR_BLEND,
  DENSITY_BOOST,
  DENSITY_MAX,
  EMISSION_ROLLOFF_BASE,
  EMISSION_ROLLOFF_MIX,
  EMISSION_ROLLOFF_TRANSIENT_GAIN,
  LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE,
  EDGE_FADE_END,
  EDGE_FADE_START,
  EXCITATION_VISIBILITY_COHERENCE_WEIGHT,
  EXCITATION_VISIBILITY_MODAL_ENERGY_WEIGHT,
  EXCITATION_VISIBILITY_MODAL_AUTHORITY_END,
  EXCITATION_VISIBILITY_MODAL_AUTHORITY_START,
  EXCITATION_VISIBILITY_MODAL_AUTHORITY_WEIGHT,
  EXCITATION_VISIBILITY_MAX_FLOOR,
  HIGHLIGHT_CONTOUR_ACCENT_WEIGHT,
  HOT_CORE_END,
  HOT_CORE_START,
  HOT_CORE_CROWDING_THRESHOLD_LIFT,
  HOT_CORE_SURFACE_CROWDING_REDUCTION,
  HIGHLIGHT_MASK_END,
  HIGHLIGHT_MASK_START,
  HOLOGRAPHIC_TINT_BLUE,
  HOLOGRAPHIC_TINT_GREEN,
  HOLOGRAPHIC_TINT_RED,
  HIGH_MID_BAND_WEIGHT,
  INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX,
  INNER_BAND_WEIGHT,
  INTERIOR_MASK_END,
  INTERIOR_MASK_START,
  LATCHED_FOG_BEAM_REDUCTION,
  LATCHED_FOG_BODY_REDUCTION,
  LATCHED_FOG_CHANGE_END,
  LATCHED_FOG_STRUCTURE_RANGE,
  LATCHED_FOG_STRUCTURE_START,
  LATCHED_FOG_TRANSIENT_RELEASE_END,
  LATCHED_FOG_TRANSIENT_RELEASE_START,
  LOW_MID_BAND_WEIGHT,
  MODAL_CROWDING_ACCUMULATION_COMPRESSION,
  MODAL_CROWDING_BODY_COMPRESSION,
  OPTICAL_BODY_SUPPRESSION_MAX,
  OPTICAL_FOCUS_POWER,
  OPTICAL_FRINGE_MIX_MAX,
  OPTICAL_LASER_GAIN,
  OPTICAL_SLOPE_POWER,
  OPTICAL_SPACE_GATE_END,
  OPTICAL_SPACE_GATE_START,
  PHASE_INTERFERENCE_FRINGE_MAX,
  PHASE_INTERFERENCE_FRINGE_MIN,
  PHOTOGRAPHIC_APERTURE_FADE_END,
  PHOTOGRAPHIC_APERTURE_FADE_START,
  PHOTOGRAPHIC_BLACKFIELD_GATE_END,
  PHOTOGRAPHIC_BLACKFIELD_GATE_START,
  PHOTOGRAPHIC_DARK_BODY_RATIO,
  PHOTOGRAPHIC_DARK_CAUSTIC_RATIO,
  PHOTOGRAPHIC_FOCUS_POWER,
  PHOTOGRAPHIC_LASER_GAIN,
  PHOTOGRAPHIC_SHELL_FOCUS_GAIN,
  PHOTOGRAPHIC_SHELL_INNER_END,
  PHOTOGRAPHIC_SHELL_INNER_FADE_END,
  PHOTOGRAPHIC_SHELL_INNER_FADE_START,
  PHOTOGRAPHIC_SHELL_INNER_START,
  PHOTOGRAPHIC_SHELL_RIM_END,
  PHOTOGRAPHIC_SHELL_RIM_FADE_END,
  PHOTOGRAPHIC_SHELL_RIM_FADE_START,
  PHOTOGRAPHIC_SHELL_RIM_START,
  PHOTOGRAPHIC_SHELL_SUPPRESSION_END,
  PHOTOGRAPHIC_SHELL_SUPPRESSION_START,
  PROJECTED_CAUSTIC_RADIANCE_COMPRESSION,
  PROJECTED_CAUSTIC_RADIANCE_MIN_SCALE,
  PROJECTED_CAUSTIC_RADIANCE_RIDGE_AUTHORITY_FLOOR,
  SIGNED_INTERFERENCE_BODY_AUTHORITY_END,
  SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER,
  SIGNED_INTERFERENCE_BODY_AUTHORITY_START,
  RIM_BLOOM_BIAS_BASE,
  RIM_BLOOM_BIAS_GAIN,
  RIM_COMPRESSION_BOUNDARY_GAIN,
  RIM_COMPRESSION_OUTER_GAIN,
  SHELL_WEIGHT_END,
  SHELL_WEIGHT_MAX,
  SHELL_WEIGHT_MIN,
  SHELL_WEIGHT_START,
  STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION,
  STRUCTURE_AWARE_EMISSION_CONTOUR_WEIGHT,
  STRUCTURE_AWARE_EMISSION_CROWDING_END,
  STRUCTURE_AWARE_EMISSION_CROWDING_START,
  STRUCTURE_AWARE_EMISSION_DETAIL_GATE_END,
  STRUCTURE_AWARE_EMISSION_DETAIL_GATE_START,
  STRUCTURE_AWARE_EMISSION_HIGHLIGHT_WEIGHT,
  STRUCTURE_AWARE_EMISSION_MIN_GAIN,
  STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_END,
  STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_START,
  STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_WEIGHT,
  STRUCTURE_AWARE_EMISSION_RIDGE_WEIGHT,
  STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF,
  WHITE_EMISSION_CROWDING_REDUCTION,
  WHITE_EMISSION_CROWDING_TRANSIENT_RELIEF,
} from "./fieldShaping.js";
import {
  RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
} from "./fieldCache.js";

/** @typedef {"sphere" | "unbounded"} FieldExtent */
/** @typedef {"dirichlet" | "neumann"} BoundaryMode */

const DEFAULT_FIELD_EXTENT = /** @type {FieldExtent} */ (FIELD_EXTENTS.sphere);

// Excitation gate: smoothstep range for modal/field transfer descriptors.
// Below LOW the field is under-excited; gating reduces body fill and hot-core.
// Above HIGH the gate is fully open.
const EXCITATION_GATE_LOW = 0.04;
const EXCITATION_GATE_HIGH = 0.35;
const STATIC_SURFACE_TINT_SCALE = 0.18;
const STATIC_HIGHLIGHT_SURFACE_PULL_SCALE = 0.2;
const OPTICAL_CONVERGENCE_MEASUREMENT_EPSILON = 1e-4;
// Refracted-laser irradiance clamps: acoustic shadows may dim the medium to
// this floor (never to black), and support-reveal shading caps below the
// caustic focal ceiling so body fill cannot bloom like a caustic.
const LASER_SHADOW_FLOOR = 0.18;
const LASER_SUPPORT_IRRADIANCE_MAX = 2.0;

export const RAYMARCH_BOUNDARY_TUNING = Object.freeze({
  dirichletBeamDensity: 0.64,
  dirichletHotCore: 0.08,
  dirichletSurfacePull: 0.07,
  dirichletWhiteEmission: 0.04,
});

/** @type {{ off: string, laneCache: string }} */
export const RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES = Object.freeze({
  off: "off",
  laneCache: "lane-cache",
});

function normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode) {
  if (
    spectralLightEvaluationMode ===
    RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache
  ) {
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache;
  }
  return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
}

/**
 * @typedef {{
 *   positionRay: any,
 *   positionRayLocal: any,
 *   viewDirLocal: any
 * }} ScatteringNodeInputs
 */

/**
 * @typedef {import("three/webgpu").VolumeNodeMaterial & {
 *   steps: number,
 *   radiusNode?: any,
 *   scatteringNode?: any,
 *   opacityGainNode?: any,
 *   offsetNode?: any | ((args: { startPosLocal: any, rayDirLocal: any, radiusNode: any }) => any),
 *   spectralLightEvaluationMode?: string,
 *   modalBasisAtlasTexture?: any,
 *   modalLiveFieldTexture?: any,
 *   modalLiveSupportTexture?: any,
 *   modalPressureRadiationTexture?: any,
 *   modalPhaseInterferenceTexture?: any,
 *   spectralLaneTextureA?: any,
 *   spectralLaneTextureB?: any,
 *   spectralLaneStatsTexture?: any,
 *   raymarchBoundaryMode?: BoundaryMode,
 *   raymarchFieldExtent?: FieldExtent,
 *   coreStepRadiusNode?: any,
 *   outerStepStretch?: number,
 *   modalFieldModeBuffer?: any,
 *   modalFieldCoefficientBuffer?: any,
 *   modalFieldCapacity?: number,
 * }} BaryonVolumeMaterial
 */

class BaryonVolumeNodeMaterial extends VolumeNodeMaterial {
  setupLightingModel() {
    return new SafeVolumetricLightingModel();
  }
}

function getBasisLocalUvNode({ localPosition, uRadius }) {
  const normalizedSamplePosition = localPosition.div(uRadius);
  return clamp(
    normalizedSamplePosition.mul(float(0.5)).add(vec3(0.5)),
    vec3(0.0),
    vec3(1.0),
  );
}

function getBasisAtlasUvNode({
  basisUv,
  basisSlot,
  invLiveSynthesisModeCount,
}) {
  const atlasZ = float(basisSlot).add(basisUv.z);
  return vec3(
    basisUv.x,
    basisUv.y,
    atlasZ.mul(float(invLiveSynthesisModeCount)),
  );
}

function getTexture3DNode(textureLike) {
  if (!textureLike) {
    return null;
  }
  return textureLike.isTexture3DNode === true
    ? textureLike
    : texture3D(textureLike);
}

function sampleBasisAtlasPageNode({
  basisUv,
  basisSlot,
  invLiveSynthesisModeCount,
  modalBasisAtlasTexture,
}) {
  const atlasUv = getBasisAtlasUvNode({
    basisUv,
    basisSlot,
    invLiveSynthesisModeCount,
  });
  const basisSample = getTexture3DNode(modalBasisAtlasTexture).sample(atlasUv);
  const basisSupport = abs(basisSample.x);

  return {
    field: basisSample.x,
    gradient: vec3(basisSample.y, basisSample.z, basisSample.w),
    support: basisSupport,
  };
}

function samplePressureRadiationCarrierNode({
  basisUv,
  modalPressureRadiationTexture,
}) {
  const pressureRadiationSample = texture3D(
    modalPressureRadiationTexture,
  ).sample(basisUv);
  const normalizedPressure = clamp(
    pressureRadiationSample.x,
    float(-1.0),
    float(1.0),
  );
  const velocityProxy = clamp(
    pressureRadiationSample.y,
    float(0.0),
    float(1.0),
  );
  const radiationPotential = clamp(
    pressureRadiationSample.z,
    float(-1.0),
    float(1.0),
  );
  const ready = smoothstep(float(0.5), float(1.0), pressureRadiationSample.w);

  return {
    pressure: normalizedPressure,
    velocityProxy,
    radiationPotential,
    ready,
  };
}

function sampleLiveFieldProjectionCacheNode({
  basisUv,
  modalLiveFieldTexture,
  modalLiveSupportTexture,
  modalPressureRadiationTexture,
}) {
  const fieldSample = texture3D(modalLiveFieldTexture).sample(basisUv);
  const supportSample = texture3D(modalLiveSupportTexture).sample(basisUv);
  const pressureRadiationCarrier = samplePressureRadiationCarrierNode({
    basisUv,
    modalPressureRadiationTexture,
  });
  const normalizedField = pressureRadiationCarrier.pressure;
  const normalizedUnsignedSupport = max(supportSample.x, float(0.0));
  const cancellationSupportEpsilon = float(MODAL_BASIS_CACHE_ENERGY_EPSILON);
  const cancellationRatio = normalizedUnsignedSupport
    .greaterThan(cancellationSupportEpsilon)
    .select(
      clamp(
        float(1.0).sub(abs(normalizedField).div(normalizedUnsignedSupport)),
        float(0.0),
        float(1.0),
      ),
      float(0.0),
    );

  return {
    field: normalizedField,
    gradient: vec3(fieldSample.y, fieldSample.z, fieldSample.w),
    unsignedSupport: normalizedUnsignedSupport,
    cancellationRatio,
    velocityProxy: pressureRadiationCarrier.velocityProxy,
    radiationPotential: pressureRadiationCarrier.radiationPotential,
    radiationReady: pressureRadiationCarrier.ready,
  };
}

function samplePhaseInterferenceCarrierNode({
  basisUv,
  modalPhaseInterferenceTexture,
}) {
  const interferenceSample = texture3D(modalPhaseInterferenceTexture).sample(
    basisUv,
  );
  return {
    contrast: clamp(interferenceSample.x, float(-1.0), float(1.0)),
    authority: clamp(interferenceSample.z, float(0.0), float(1.0)),
  };
}

function projectSpectralLaneRadianceToRgbNode({
  laneA,
  laneB,
  total,
  dominance,
  entropy,
}) {
  const laneRgb0 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[0];
  const laneRgb1 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[1];
  const laneRgb2 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[2];
  const laneRgb3 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[3];
  const laneRgb4 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[4];
  const laneRgb5 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[5];
  const laneRgb6 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[6];
  const laneRgb7 = SPECTRAL_LIGHT_LANE_DISPLAY_RGB[7];
  const laneRgbNode0 = vec3(
    float(laneRgb0.r),
    float(laneRgb0.g),
    float(laneRgb0.b),
  );
  const laneRgbNode1 = vec3(
    float(laneRgb1.r),
    float(laneRgb1.g),
    float(laneRgb1.b),
  );
  const laneRgbNode2 = vec3(
    float(laneRgb2.r),
    float(laneRgb2.g),
    float(laneRgb2.b),
  );
  const laneRgbNode3 = vec3(
    float(laneRgb3.r),
    float(laneRgb3.g),
    float(laneRgb3.b),
  );
  const laneRgbNode4 = vec3(
    float(laneRgb4.r),
    float(laneRgb4.g),
    float(laneRgb4.b),
  );
  const laneRgbNode5 = vec3(
    float(laneRgb5.r),
    float(laneRgb5.g),
    float(laneRgb5.b),
  );
  const laneRgbNode6 = vec3(
    float(laneRgb6.r),
    float(laneRgb6.g),
    float(laneRgb6.b),
  );
  const laneRgbNode7 = vec3(
    float(laneRgb7.r),
    float(laneRgb7.g),
    float(laneRgb7.b),
  );
  const dominantLaneWeight = max(laneA.x, float(0.0)).toVar();
  const dominantLaneRgb = laneRgbNode0.toVar();
  const assignDominantLane = (laneWeight, laneRgbNode) => {
    const candidateWeight = max(laneWeight, float(0.0));
    If(candidateWeight.greaterThan(dominantLaneWeight), () => {
      dominantLaneWeight.assign(candidateWeight);
      dominantLaneRgb.assign(laneRgbNode);
    });
  };
  assignDominantLane(laneA.y, laneRgbNode1);
  assignDominantLane(laneA.z, laneRgbNode2);
  assignDominantLane(laneA.w, laneRgbNode3);
  assignDominantLane(laneB.x, laneRgbNode4);
  assignDominantLane(laneB.y, laneRgbNode5);
  assignDominantLane(laneB.z, laneRgbNode6);
  assignDominantLane(laneB.w, laneRgbNode7);

  const spectralRgb = laneRgbNode0
    .mul(laneA.x)
    .add(laneRgbNode1.mul(laneA.y))
    .add(laneRgbNode2.mul(laneA.z))
    .add(laneRgbNode3.mul(laneA.w))
    .add(laneRgbNode4.mul(laneB.x))
    .add(laneRgbNode5.mul(laneB.y))
    .add(laneRgbNode6.mul(laneB.z))
    .add(laneRgbNode7.mul(laneB.w))
    .toVar();
  const spectralPeak = max(max(spectralRgb.x, spectralRgb.y), spectralRgb.z);
  const normalizedSpectralRgb = spectralRgb.div(max(spectralPeak, float(1e-4)));
  const broadSpectrumChromaAnchor = clamp(
    entropy.mul(float(1.0).sub(dominance)).mul(float(0.72)),
    float(0.0),
    float(0.72),
  );
  const chromaticSpectralRgb = mix(
    normalizedSpectralRgb,
    dominantLaneRgb,
    broadSpectrumChromaAnchor,
  );
  const spectralLuminance = dot(
    chromaticSpectralRgb,
    vec3(float(0.2126), float(0.7152), float(0.0722)),
  );
  const spectralChroma = chromaticSpectralRgb.sub(vec3(spectralLuminance));
  const chromaGain = mix(float(1.12), float(1.68), entropy);
  const chromaPreservedRgb = clamp(
    vec3(spectralLuminance).add(spectralChroma.mul(chromaGain)),
    vec3(0.0),
    vec3(1.18),
  );
  const broadSpectrumExposureCompression = mix(
    float(1.0),
    float(0.84),
    entropy,
  );
  const dominanceGain = mix(float(0.98), float(1.14), dominance);
  const rawRadianceGain = smoothstep(float(0.0), float(0.009), total);
  const spectralReadabilityPresent = total
    .greaterThan(float(1e-7))
    .select(float(1.0), float(0.0));
  const spectralReadabilityFloor = spectralReadabilityPresent
    .mul(mix(float(0.54), float(0.42), dominance))
    .mul(mix(float(1.0), float(0.94), entropy));
  const spectralReadabilityGain = max(
    rawRadianceGain,
    spectralReadabilityFloor,
  );

  return clamp(
    chromaPreservedRgb
      .mul(dominanceGain)
      .mul(broadSpectrumExposureCompression)
      .mul(spectralReadabilityGain),
    vec3(0.0),
    vec3(1.18),
  );
}

function sampleSpectralLaneCacheNode({
  basisUv,
  spectralLaneTextureA,
  spectralLaneTextureB,
  spectralLaneStatsTexture,
}) {
  const laneA = texture3D(spectralLaneTextureA).sample(basisUv);
  const laneB = texture3D(spectralLaneTextureB).sample(basisUv);
  const stats = texture3D(spectralLaneStatsTexture).sample(basisUv);
  const total = max(stats.x, float(0.0));
  const dominance = clamp(stats.y, float(0.0), float(1.0));
  const entropy = clamp(stats.z, float(0.0), float(1.0));
  const confidence = clamp(stats.w, float(0.0), float(1.0));
  const authority = smoothstep(float(0.0), float(0.0015), total).mul(
    confidence,
  );

  return {
    rgb: projectSpectralLaneRadianceToRgbNode({
      laneA,
      laneB,
      total,
      dominance,
      entropy,
    }),
    total,
    dominance,
    entropy,
    confidence,
    authority,
  };
}

function computeLiveModalCoefficientNodes(modeSlot, coefficientSlot = null) {
  if (coefficientSlot) {
    return { coefficient: coefficientSlot.x };
  }

  const coefficient = modeSlot.w.toVar();

  return { coefficient };
}

function synthesizeLiveModalFieldNode({
  localPosition,
  uRadius,
  basisUv = null,
  uModalFieldModeCount,
  amplitudeNorm,
  modalBasisAtlasTexture,
  modalFieldModeBuffer,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const field = float(0.0).toVar();
  const gradient = vec3(0.0).toVar();
  const unsignedSupport = float(0.0).toVar();
  const normalizedLiveSynthesisModeCount = Math.max(
    1,
    Math.round(liveSynthesisModeCount || RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT),
  );
  const invLiveSynthesisModeCount = 1 / normalizedLiveSynthesisModeCount;

  if (modalBasisAtlasTexture && modalFieldModeBuffer) {
    const resolvedBasisUv =
      basisUv ??
      getBasisLocalUvNode({
        localPosition,
        uRadius,
      });
    const activeModeCount = int(uModalFieldModeCount);

    Loop(
      {
        start: int(0),
        end: int(normalizedLiveSynthesisModeCount),
        type: "int",
        condition: "<",
      },
      ({ i }) => {
        If(i.greaterThanEqual(activeModeCount), () => {}).Else(() => {
          const modeSlot = modalFieldModeBuffer.element(i);
          const coefficientSlot =
            modalFieldCoefficientBuffer?.element(i) ?? null;
          const { coefficient } = computeLiveModalCoefficientNodes(
            modeSlot,
            coefficientSlot,
          );
          const basisSample = sampleBasisAtlasPageNode({
            basisUv: resolvedBasisUv,
            basisSlot: i,
            invLiveSynthesisModeCount,
            modalBasisAtlasTexture,
          });
          field.addAssign(coefficient.mul(basisSample.field));
          gradient.addAssign(basisSample.gradient.mul(coefficient));
          unsignedSupport.addAssign(abs(coefficient).mul(basisSample.support));
        });
      },
    );
  }

  const normalizedField = field.div(amplitudeNorm).toVar();
  const normalizedGradient = gradient.div(amplitudeNorm).toVar();
  const normalizedUnsignedSupport = unsignedSupport.div(amplitudeNorm).toVar();
  const cancellationSupportEpsilon = float(MODAL_BASIS_CACHE_ENERGY_EPSILON);
  const cancellationRatio = normalizedUnsignedSupport
    .greaterThan(cancellationSupportEpsilon)
    .select(
      clamp(
        float(1.0).sub(abs(normalizedField).div(normalizedUnsignedSupport)),
        float(0.0),
        float(1.0),
      ),
      float(0.0),
    );

  return {
    field: normalizedField,
    gradient: normalizedGradient,
    unsignedSupport: normalizedUnsignedSupport,
    cancellationRatio,
  };
}

function normalizeModalGradientNormalNode(gradient, amplitudeNorm) {
  return gradient.div(max(length(gradient), amplitudeNorm.mul(float(1e-4))));
}

function offsetBasisUvNode({ basisUv, tangent, sampleUvStep }) {
  return clamp(basisUv.add(tangent.mul(sampleUvStep)), vec3(0.0), vec3(1.0));
}

function deriveOpticalConvergenceNormalsNode({
  basisUv,
  tangent1,
  tangent2,
  sampleUvStep,
  uModalFieldModeCount,
  amplitudeNorm,
  modalBasisAtlasTexture,
  modalFieldModeBuffer,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const zeroNormal = vec3(0.0);
  if (!modalBasisAtlasTexture || !modalFieldModeBuffer) {
    return {
      normalPositiveT1: zeroNormal,
      normalPositiveT2: zeroNormal,
    };
  }

  const basisUvPosT1 = offsetBasisUvNode({
    basisUv,
    tangent: tangent1,
    sampleUvStep,
  });
  const basisUvPosT2 = offsetBasisUvNode({
    basisUv,
    tangent: tangent2,
    sampleUvStep,
  });
  const gradientPosT1 = vec3(0.0).toVar();
  const gradientPosT2 = vec3(0.0).toVar();
  const normalizedLiveSynthesisModeCount = Math.max(
    1,
    Math.round(liveSynthesisModeCount || RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT),
  );
  const invLiveSynthesisModeCount = 1 / normalizedLiveSynthesisModeCount;
  const activeModeCount = int(uModalFieldModeCount);

  Loop(
    {
      start: int(0),
      end: int(normalizedLiveSynthesisModeCount),
      type: "int",
      condition: "<",
    },
    ({ i }) => {
      If(i.greaterThanEqual(activeModeCount), () => {}).Else(() => {
        const modeSlot = modalFieldModeBuffer.element(i);
        const coefficientSlot = modalFieldCoefficientBuffer?.element(i) ?? null;
        const { coefficient } = computeLiveModalCoefficientNodes(
          modeSlot,
          coefficientSlot,
        );
        const basisSamplePosT1 = sampleBasisAtlasPageNode({
          basisUv: basisUvPosT1,
          basisSlot: i,
          invLiveSynthesisModeCount,
          modalBasisAtlasTexture,
        });
        const basisSamplePosT2 = sampleBasisAtlasPageNode({
          basisUv: basisUvPosT2,
          basisSlot: i,
          invLiveSynthesisModeCount,
          modalBasisAtlasTexture,
        });
        gradientPosT1.addAssign(basisSamplePosT1.gradient.mul(coefficient));
        gradientPosT2.addAssign(basisSamplePosT2.gradient.mul(coefficient));
      });
    },
  );

  // Offset normals reuse the same amplitude-scaled normalization as the center
  // normal (gradientNormal): because the center gradient is pre-divided by
  // amplitudeNorm with a fixed 1e-4 floor, normalizeModalGradientNormalNode(g_raw,
  // amplitudeNorm) reduces to the identical rule on the amplitude-normalized
  // gradient. Forward difference N(+t) - N0 therefore mixes no normalization rules.
  return {
    normalPositiveT1: normalizeModalGradientNormalNode(
      gradientPosT1,
      amplitudeNorm,
    ),
    normalPositiveT2: normalizeModalGradientNormalNode(
      gradientPosT2,
      amplitudeNorm,
    ),
  };
}

function deriveOpticalConvergenceAuthorityNode({
  basisUv,
  tangent1,
  tangent2,
  sampleUvStep,
  uModalFieldModeCount,
  amplitudeNorm,
  centerGradientNormal,
  modalBasisAtlasTexture,
  modalFieldModeBuffer,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const { normalPositiveT1, normalPositiveT2 } =
    deriveOpticalConvergenceNormalsNode({
      basisUv,
      tangent1,
      tangent2,
      sampleUvStep,
      uModalFieldModeCount,
      amplitudeNorm,
      modalBasisAtlasTexture,
      modalFieldModeBuffer,
      modalFieldCoefficientBuffer,
      liveSynthesisModeCount,
    });
  // Forward difference reusing the center normal N0 as baseline:
  // -[(N(+t1) - N0)·t1 + (N(+t2) - N0)·t2] estimates the same negative
  // divergence of the iso-surface normal as the prior 4-sample central
  // difference -0.5·[(N(+t1) - N(-t1))·t1 + (N(+t2) - N(-t2))·t2], at half cost.
  const viewPlaneNormalConvergence = dot(
    normalPositiveT1.sub(centerGradientNormal),
    tangent1,
  )
    .add(dot(normalPositiveT2.sub(centerGradientNormal), tangent2))
    .mul(float(-1.0));

  return clamp(
    max(float(0.0), viewPlaneNormalConvergence),
    float(0.0),
    float(1.0),
  );
}

/**
 * @param {{
 *   uniforms: any,
 *   boundaryMode?: BoundaryMode,
 *   modalBasisAtlasTexture?: any,
 *   modalLiveFieldTexture?: any,
 *   modalLiveSupportTexture?: any,
 *   modalPressureRadiationTexture?: any,
 *   modalPhaseInterferenceTexture?: any,
 *   laserIrradianceTexture?: any,
 *   spectralLaneTextureA?: any,
 *   spectralLaneTextureB?: any,
 *   spectralLaneStatsTexture?: any,
 *   spectralLightEvaluationMode?: string,
 *   fieldExtent?: FieldExtent,
 *   modalFieldModeBuffer?: any,
 *   modalFieldCoefficientBuffer?: any,
 *   liveSynthesisModeCount?: number,
 * }} options
 */
function createScatteringNode({
  uniforms,
  boundaryMode = BOUNDARY_MODES.neumann,
  modalBasisAtlasTexture = null,
  modalLiveFieldTexture = null,
  modalLiveSupportTexture = null,
  modalPressureRadiationTexture = null,
  modalPhaseInterferenceTexture = null,
  laserIrradianceTexture = null,
  spectralLaneTextureA = null,
  spectralLaneTextureB = null,
  spectralLaneStatsTexture = null,
  spectralLightEvaluationMode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
  fieldExtent = DEFAULT_FIELD_EXTENT,
  modalFieldModeBuffer = null,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const normalizedFieldExtent = normalizeFieldExtent(fieldExtent);
  const isUnboundedFieldExtent =
    normalizedFieldExtent === FIELD_EXTENTS.unbounded;
  const {
    uTime,
    uRadius,
    uThreshold,
    uRaymarchSteps,
    uModalFieldModeCount,
    uColor,
    uSurfaceColor,
    uDensityAbsorption,
    uContourSharpness,
    uRimBloomBias,
    uRimCompression,
    uHolographicIntensity,
    uHolographicShift,
    uHolographicFresnelPower,
    uBandEnergies,
    uTransientEnergy,
    uSpectralCentroid,
    uSpectralFlux,
    uStructureSignal,
    uEnergySignal,
    uChangeSignal,
    uBassSalience,
    uTimbreSpread,
    uSpectralNovelty,
    uBeatPulse,
    uBeatPhase,
    uRhythmicDensity,
    uKeyMode,
    uTrebleBroadbandEnergy,
    uModeCoherence,
    uTotalSlotAmplitude,
    uStructuralProjectionDrive,
    uStructuralProjectionConcentration,
    uModalResponseEnergy,
    uPhaseProjectionMix,
    uPhaseProjectionStrength,
    uLiveFieldCacheActive,
    uLaserCausticActive,
    uObservationDensityFadeStart,
    uObservationDensityFadeEnd,
    uObservationTransferGain,
    uObservationDensityFloor,
    uObservationContourSupportScale,
  } = uniforms;
  // Uniform-only expressions: hoist outside the Fn so they are loop-invariant
  // at the TSL graph level and do not re-evaluate every raymarch step.
  const dynamicEdgeFadeStart = float(EDGE_FADE_START).sub(
    uEnergySignal.mul(0.06),
  );
  // Fail-safe fade at the fixed free-field reach. Absorption drives the
  // field to ~black well before these radii, so this never reads as a
  // container — it only guarantees exact zero at the march bound.
  const unboundedOuterFadeStart = float(
    UNBOUNDED_DOMAIN_SCALE * UNBOUNDED_OUTER_FADE_START,
  );
  const unboundedOuterFadeEnd = float(
    UNBOUNDED_DOMAIN_SCALE * UNBOUNDED_OUTER_FADE_END,
  );
  const dynamicInteriorMaskStart = float(INTERIOR_MASK_START).add(
    uStructureSignal.mul(0.1),
  );
  // Beat phase decay: 1.0 on the beat, fades to 0 at ~2/3 of the beat period.
  // Uniform-only — loop-invariant, hoisted outside the Fn.
  const beatPhaseDecay = max(float(0.0), float(1.0).sub(uBeatPhase.mul(1.5)));
  const hotCoreStartDynamic = float(HOT_CORE_START)
    .sub(uBeatPulse.mul(0.12))
    .sub(beatPhaseDecay.mul(0.07))
    .add(uRhythmicDensity.mul(0.04));
  const contourGainBase = uStructureSignal
    .mul(0.3)
    .add(uModeCoherence.mul(0.08))
    .add(uModalResponseEnergy.mul(0.12))
    .add(beatPhaseDecay.mul(0.18));
  const dynamicHolographicIntensity = uHolographicIntensity
    .mul(float(1.0).add(uTimbreSpread.mul(0.35)))
    .mul(float(1.0).add(beatPhaseDecay.mul(0.22)));
  const dynamicHolographicShift = clamp(
    uHolographicShift.add(uSpectralNovelty.mul(0.2)).sub(uKeyMode.mul(0.12)),
    float(0.0),
    float(1.0),
  );
  const isDirichletBoundary = String(boundaryMode) === BOUNDARY_MODES.dirichlet;
  const boundaryCausticDensity = isDirichletBoundary
    ? float(RAYMARCH_BOUNDARY_TUNING.dirichletBeamDensity)
    : float(1.0);
  const boundaryHotCore = isDirichletBoundary
    ? float(RAYMARCH_BOUNDARY_TUNING.dirichletHotCore)
    : float(1.0);
  const boundarySurfacePull = isDirichletBoundary
    ? float(RAYMARCH_BOUNDARY_TUNING.dirichletSurfacePull)
    : float(1.0);
  const boundaryWhiteEmission = isDirichletBoundary
    ? float(RAYMARCH_BOUNDARY_TUNING.dirichletWhiteEmission)
    : float(1.0);
  const modalBasisAtlasTextureNode = getTexture3DNode(modalBasisAtlasTexture);
  const modalBasisAtlasTextureValue =
    modalBasisAtlasTextureNode?.value ?? modalBasisAtlasTexture;
  const liveFieldSampleResolution =
    modalBasisAtlasTextureValue?.image?.width ??
    RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  const spectralColorBiasHintOffset = uModeCoherence
    .mul(0.05)
    .add(uModalResponseEnergy.mul(0.08))
    .sub(uChangeSignal.mul(0.08));
  const modalCoefficientEnergy = clamp(
    uStructuralProjectionDrive,
    float(0.0),
    float(1.0),
  );
  const structuralConcentration = clamp(
    uStructuralProjectionConcentration,
    float(0.0),
    float(1.0),
  );
  // Excitation gate: 0 when field is under-excited (weak/noisy input), 1 when
  // fully excited. Render-eligible modal coefficients and response energy are
  // authoritative here; raw source amplitude remains upstream evidence.
  // Hoisted as loop-invariant.
  const excitationInput = uStructureSignal
    .mul(float(0.42))
    .add(uModalResponseEnergy.mul(float(0.34)))
    .add(modalCoefficientEnergy.mul(float(0.28)))
    .add(uModeCoherence.mul(float(0.12)));
  const excitationGate = smoothstep(
    float(EXCITATION_GATE_LOW),
    float(EXCITATION_GATE_HIGH),
    excitationInput,
  );
  const modalAuthorityEnergy = max(
    uModalResponseEnergy,
    modalCoefficientEnergy,
  );
  const excitationModalAuthority = smoothstep(
    float(EXCITATION_VISIBILITY_MODAL_AUTHORITY_START),
    float(EXCITATION_VISIBILITY_MODAL_AUTHORITY_END),
    modalAuthorityEnergy.mul(
      float(EXCITATION_VISIBILITY_MODAL_AUTHORITY_WEIGHT),
    ),
  );
  const excitationVisibility = max(
    excitationGate,
    clamp(
      uModeCoherence
        .mul(float(EXCITATION_VISIBILITY_COHERENCE_WEIGHT))
        .add(
          modalAuthorityEnergy.mul(
            float(EXCITATION_VISIBILITY_MODAL_ENERGY_WEIGHT),
          ),
        ),
      float(0.0),
      float(EXCITATION_VISIBILITY_MAX_FLOOR),
    ).mul(excitationModalAuthority),
  );
  const latchedFogMask = clamp(
    uStructureSignal
      .sub(float(LATCHED_FOG_STRUCTURE_START))
      .div(float(LATCHED_FOG_STRUCTURE_RANGE)),
    float(0.0),
    float(1.0),
  )
    .mul(
      clamp(
        float(LATCHED_FOG_CHANGE_END)
          .sub(uChangeSignal)
          .div(float(LATCHED_FOG_CHANGE_END)),
        float(0.0),
        float(1.0),
      ),
    )
    .mul(
      float(1.0).sub(
        smoothstep(
          float(LATCHED_FOG_TRANSIENT_RELEASE_START),
          float(LATCHED_FOG_TRANSIENT_RELEASE_END),
          uTransientEnergy,
        ),
      ),
    );
  const amplitudeNorm = max(uTotalSlotAmplitude, float(0.01));
  const modalFieldCount = float(uModalFieldModeCount);
  const activeMask = smoothstep(float(0.0), float(1.0), modalFieldCount);
  const convergenceSampleStep = modalBasisAtlasTextureNode
    ? uRadius.mul(float(2.0)).div(float(liveFieldSampleResolution))
    : uRadius.mul(float(2.0)).div(max(uRaymarchSteps, float(1.0)));
  const convergenceSampleUvStep = convergenceSampleStep.div(
    max(uRadius.mul(float(2.0)), float(1e-4)),
  );
  const densityMod = float(1.0)
    .add(uTransientEnergy.mul(0.3))
    .add(uSpectralFlux.mul(0.2))
    .add(uBeatPulse.mul(0.35));
  const incoherentTrebleSuppression = float(1.0).sub(
    uTrebleBroadbandEnergy
      .mul(float(1.0).sub(uModeCoherence))
      .mul(float(INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX)),
  );
  const spectralLaneTransferEnabled = Boolean(
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode) ===
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache &&
    spectralLaneTextureA &&
    spectralLaneTextureB &&
    spectralLaneStatsTexture,
  );

  return Fn(
    /**
     * @param {ScatteringNodeInputs} args
     */
    ({ positionRay, positionRayLocal, viewDirLocal }) => {
      const localPosition =
        positionRayLocal ??
        modelWorldMatrixInverse.mul(vec4(positionRay, 1.0)).xyz;
      const normalizedPosition = localPosition.div(uRadius);
      const radialDistance = length(normalizedPosition);
      // Radiating continuation — how sound actually propagates from a
      // compact source: the far field is D(θ,φ)·cos(k·r − ω·t)·decay(r).
      // The angular directivity D is the live modal field sampled mid-cavity
      // along this ray's direction (constant along the ray, so it can never
      // imprint a radial shell); the traveling factor is applied after
      // sampling. The sample position morphs from the cavity point to the
      // directivity point across a half-radius band, so the standing core
      // dissolves into traveling waves with no seam — never a mirror tiling
      // of the cavity, which reads as discrete bounded copies. The sphere
      // variant keeps the old clamped sample path with no extra graph work.
      let basisUv;
      let unboundedTravelMix = null;
      let unboundedRadialDirection = null;
      let unboundedEnergyProfile = null;
      if (isUnboundedFieldExtent) {
        unboundedTravelMix = smoothstep(
          float(UNBOUNDED_TRAVEL_BLEND_START),
          float(UNBOUNDED_TRAVEL_BLEND_END),
          radialDistance,
        );
        unboundedRadialDirection = normalizedPosition.div(
          max(radialDistance, float(1e-4)),
        );
        const directivitySamplePosition = unboundedRadialDirection
          .mul(uRadius)
          .mul(float(UNBOUNDED_DIRECTIVITY_RADIUS));
        const radiatingSamplePosition = mix(
          localPosition,
          directivitySamplePosition,
          unboundedTravelMix,
        );
        basisUv = getBasisLocalUvNode({
          localPosition: radiatingSamplePosition,
          uRadius,
        });
      } else {
        basisUv = getBasisLocalUvNode({
          localPosition,
          uRadius,
        });
      }
      // High energy = tighter boundary (more solid); low energy = diffuse, ghostly
      const boundedEdgeFade = float(1.0).sub(
        smoothstep(dynamicEdgeFadeStart, float(EDGE_FADE_END), radialDistance),
      );
      // Unbounded: the only cutoff is a fail-safe fade against the
      // camera-scaled march bound, far beyond where absorption has already
      // dissolved the field — attenuation owns the visible falloff.
      const edgeFade = isUnboundedFieldExtent
        ? float(1.0).sub(
            smoothstep(
              unboundedOuterFadeStart,
              unboundedOuterFadeEnd,
              radialDistance,
            ),
          )
        : boundedEdgeFade;
      const field = float(0.0).toVar();
      const gradX = float(0.0).toVar();
      const gradY = float(0.0).toVar();
      const gradZ = float(0.0).toVar();
      const effectiveUnsignedSupport = float(0.0).toVar();
      const effectiveCancellationRatio = float(0.0).toVar();
      const normalizedVelocityProxy = float(0.0).toVar();
      const normalizedRadiationPotential = float(0.0).toVar();
      const radiationPotentialReady = float(0.0).toVar();
      // Cavity-carrier authority: the phase-interference, pressure-radiation,
      // and laser textures are all cavity solves. Under the radiating zone's
      // inward-pulled directivity sampling their planar structures re-project
      // through the origin as straight radial streaks, so every cavity
      // carrier fades out with the travel blend and only the pattern field
      // itself continues outward.
      const cavityCarrierAuthority = unboundedTravelMix
        ? float(1.0).sub(unboundedTravelMix)
        : null;
      const phaseInterferenceCarrier = modalPhaseInterferenceTexture
        ? samplePhaseInterferenceCarrierNode({
            basisUv,
            modalPhaseInterferenceTexture,
          })
        : {
            contrast: float(0.0),
            authority: float(0.0),
          };
      let phaseInterferenceAuthority = smoothstep(
        float(0.5),
        float(1.0),
        uLiveFieldCacheActive,
      ).mul(phaseInterferenceCarrier.authority);
      if (cavityCarrierAuthority) {
        phaseInterferenceAuthority = phaseInterferenceAuthority.mul(
          cavityCarrierAuthority,
        );
      }
      const phaseInterferenceContrast = phaseInterferenceCarrier.contrast.mul(
        phaseInterferenceAuthority,
      );
      // Refracted laser transport: relative ray density from tracing the
      // collimated beam through the acoustically modulated refractive index.
      // Unfocused flood ≈ 1, convergence (caustics) above 1, acoustic
      // shadows below 1. Fails closed via the runtime uniform and the
      // resolve pass's readiness channel. The transport is a cavity solve
      // for the flagship orb: a collimated beam whose aperture and shadow
      // edges are straight planes, and the unbounded variant's inward-pulled
      // directivity sampling re-projects those edges through the origin into
      // radial streak artifacts — so the unbounded variant skips the
      // transport entirely and renders from the heuristic focal law (the
      // well-tested no-texture fallback path).
      const laserSample =
        laserIrradianceTexture && !isUnboundedFieldExtent
          ? texture3D(laserIrradianceTexture).sample(basisUv)
          : null;
      const laserIrradiance = laserSample
        ? max(laserSample.x, float(0.0))
        : float(0.0);
      // Readiness alone is not proof of transported light: a silently
      // failed dispatch leaves zeros behind a live readiness flag. Gate the
      // substitution on measured light being present so the pass degrades
      // to the heuristic focal law instead of flattening the image. (Deep
      // full-shadow voxels also revert to the heuristic — accepted trade
      // for fail-safe behavior.)
      const laserCausticReady = laserSample
        ? smoothstep(float(0.5), float(1.0), uLaserCausticActive)
            .mul(clamp(laserSample.w, float(0.0), float(1.0)))
            .mul(smoothstep(float(0.0), float(0.05), laserIrradiance))
        : float(0.0);
      const assignLiveFieldSample = (liveFieldSample) => {
        field.assign(liveFieldSample.field);
        gradX.assign(liveFieldSample.gradient.x);
        gradY.assign(liveFieldSample.gradient.y);
        gradZ.assign(liveFieldSample.gradient.z);
        effectiveUnsignedSupport.assign(liveFieldSample.unsignedSupport);
        effectiveCancellationRatio.assign(liveFieldSample.cancellationRatio);
        normalizedVelocityProxy.assign(
          liveFieldSample.velocityProxy ?? float(0.0),
        );
        normalizedRadiationPotential.assign(
          liveFieldSample.radiationPotential ?? float(0.0),
        );
        radiationPotentialReady.assign(
          liveFieldSample.radiationReady ?? float(0.0),
        );
      };
      const canSynthesizeLiveField =
        modalBasisAtlasTextureNode && modalFieldModeBuffer;
      const assignSynthesizedLiveField = () => {
        assignLiveFieldSample(
          synthesizeLiveModalFieldNode({
            localPosition,
            basisUv,
            uRadius,
            uModalFieldModeCount,
            amplitudeNorm,
            modalBasisAtlasTexture: modalBasisAtlasTextureNode,
            modalFieldModeBuffer,
            modalFieldCoefficientBuffer,
            liveSynthesisModeCount,
          }),
        );
      };
      if (
        modalLiveFieldTexture &&
        modalLiveSupportTexture &&
        modalPressureRadiationTexture
      ) {
        If(uLiveFieldCacheActive.greaterThan(float(0.5)), () => {
          assignLiveFieldSample(
            sampleLiveFieldProjectionCacheNode({
              basisUv,
              modalLiveFieldTexture,
              modalLiveSupportTexture,
              modalPressureRadiationTexture,
            }),
          );
        }).Else(() => {
          if (canSynthesizeLiveField) {
            assignSynthesizedLiveField();
          }
        });
      } else if (canSynthesizeLiveField) {
        assignSynthesizedLiveField();
      }

      if (isUnboundedFieldExtent) {
        const travelMix = unboundedTravelMix ?? float(0.0);
        const radialDirection = unboundedRadialDirection ?? vec3(0.0);
        // Traveling spherical wavefronts: the sampled directivity pattern is
        // carried outward by a signed cos(k·r − ω·t) factor. Its moving
        // zero-crossings ARE the wavefronts — the nodal-band renderer draws
        // them as expanding shells cut by the pattern's angular nodal cones,
        // advancing one wavelength per beat (the 2π beat-phase term wraps
        // seamlessly) and drifting continuously between beats. Inside the
        // core travelMix is zero and the standing cavity field is untouched.
        const radialWavePhase = radialDistance
          .mul(float(UNBOUNDED_RADIAL_PHASE_GAIN))
          .sub(uBeatPhase.mul(float(Math.PI * 2)))
          .sub(uTime.mul(float(UNBOUNDED_WAVE_DRIFT)))
          .add(uModeCoherence.mul(float(1.2)));
        const signedTravel = mix(float(1.0), cos(radialWavePhase), travelMix);
        // Radial term of ∇(D·cos(k·r − ω·t)): strong gradient evidence on
        // the moving shells, so the caustic lanes light the wavefronts.
        // Must read `field` before the traveling factor lands on it.
        const wavefrontGradient = radialDirection
          .mul(field)
          .mul(sin(radialWavePhase).negate())
          .mul(float(UNBOUNDED_RADIAL_PHASE_GAIN))
          .mul(travelMix);
        gradX.assign(gradX.mul(signedTravel).add(wavefrontGradient.x));
        gradY.assign(gradY.mul(signedTravel).add(wavefrontGradient.y));
        gradZ.assign(gradZ.mul(signedTravel).add(wavefrontGradient.z));
        field.mulAssign(signedTravel);
        // Structure and energy stay separated: classification sees the
        // full-strength radiating field, and the radial energy profile below
        // is applied exactly once, to the emitted radiance and extinction of
        // the final sample — linear fade in luminance, never squared decay
        // through the authority products. Support presence runs through a
        // calibration window because normalized support is small in
        // absolute terms; it slows the falloff so excited directivity lobes
        // reach farther than nodal directions and the field's own amplitude
        // defines the silhouette. GPU mirror of deriveUnboundedFieldEnvelope.
        const supportPresence = smoothstep(
          float(UNBOUNDED_SUPPORT_PRESENCE_START),
          float(UNBOUNDED_SUPPORT_PRESENCE_END),
          effectiveUnsignedSupport,
        );
        const effectiveFalloff = float(UNBOUNDED_FIELD_FALLOFF).mul(
          float(1.0).sub(supportPresence.mul(float(UNBOUNDED_REACH_EXTENSION))),
        );
        unboundedEnergyProfile = exp(
          max(radialDistance.sub(float(1.0)), float(0.0)).mul(
            effectiveFalloff.negate(),
          ),
        ).toVar();
      }

      const liveField = field;
      const fieldAbs = abs(liveField);
      const gradient = vec3(gradX, gradY, gradZ).toVar();
      const gradientMagnitude = length(gradient);
      const gradientNormal = gradient.div(max(gradientMagnitude, float(1e-4)));
      const effectiveGradientMagnitude = gradientMagnitude;
      const normalizedFieldAbs = fieldAbs;
      const normalizedGradMagnitude = effectiveGradientMagnitude;
      const localGradientEvidence = clamp(
        normalizedGradMagnitude,
        float(0.0),
        float(1.0),
      );
      // Local field evidence sharpens nodal lines; style descriptors do not own clarity.
      // contourGainBase is pre-computed above the Fn.
      const contourGain = float(1.0)
        .add(uTransientEnergy.mul(0.25))
        .add(contourGainBase);
      const nodeBand = float(1.0).sub(
        smoothstep(float(0.0), uThreshold, normalizedFieldAbs),
      );
      const broadBand = float(1.0).sub(
        smoothstep(
          float(0.0),
          uThreshold.mul(float(BROAD_BAND_SCALE)),
          normalizedFieldAbs,
        ),
      );
      const innerShellAccent = smoothstep(
        float(0.0),
        float(0.45),
        radialDistance,
      );
      const outerShellAccent = smoothstep(
        float(0.35),
        float(1.0),
        radialDistance,
      );
      const rimBandBias = float(RIM_BLOOM_BIAS_BASE).add(
        uRimBloomBias.mul(float(RIM_BLOOM_BIAS_GAIN)),
      );
      const shellBandMod = float(1.0)
        .add(
          uBandEnergies.x
            .mul(float(INNER_BAND_WEIGHT))
            .mul(float(1.0).sub(innerShellAccent)),
        )
        .add(uBandEnergies.y.mul(float(LOW_MID_BAND_WEIGHT)))
        .add(
          uBandEnergies.z
            .mul(float(HIGH_MID_BAND_WEIGHT))
            .mul(rimBandBias)
            .mul(outerShellAccent),
        )
        .add(
          uBandEnergies.w
            .mul(float(AIR_BAND_WEIGHT))
            .mul(rimBandBias)
            .mul(outerShellAccent),
        );
      // Bass salience thickens the inner shell — bass-heavy music looks heavier
      const bassShellBoost = uBassSalience
        .mul(0.2)
        .mul(float(1.0).sub(outerShellAccent));
      // Rim-weighted shell emphasis implies a container wall; the unbounded
      // field flattens the ramp so no spherical rim is carved out.
      const shellRamp = isUnboundedFieldExtent
        ? float(UNBOUNDED_SHELL_RAMP)
        : smoothstep(
            float(SHELL_WEIGHT_START),
            float(SHELL_WEIGHT_END),
            radialDistance,
          );
      const shellWeight = mix(
        float(SHELL_WEIGHT_MIN),
        float(SHELL_WEIGHT_MAX),
        shellRamp,
      )
        .mul(shellBandMod)
        .mul(float(1.0).add(bassShellBoost));
      const contourCore = nodeBand.pow(uContourSharpness.mul(contourGain));
      const contourShape = mix(broadBand, contourCore, float(CONTOUR_BLEND));
      const modalStructureSupport = nodeBand;
      const signedBodyAuthority = smoothstep(
        float(SIGNED_INTERFERENCE_BODY_AUTHORITY_START),
        float(SIGNED_INTERFERENCE_BODY_AUTHORITY_END),
        normalizedFieldAbs,
      ).pow(float(SIGNED_INTERFERENCE_BODY_AUTHORITY_POWER));
      const cancellationSuppression = float(1.0).sub(
        effectiveCancellationRatio
          .mul(clamp(effectiveUnsignedSupport, float(0.0), float(1.0)))
          .mul(float(LIVE_SYNTHESIS_CANCELLATION_SUPPRESSION_SCALE)),
      );
      const localFieldSupportAuthority = clamp(
        effectiveUnsignedSupport,
        float(0.0),
        float(1.0),
      );
      // The pressure/radiation carrier is a cavity solve too — its transfer
      // authority fades with the travel blend for the same radial-streak
      // reason as the other cavity carriers.
      let radiationTransferAuthority = radiationPotentialReady.mul(
        localFieldSupportAuthority,
      );
      if (cavityCarrierAuthority) {
        radiationTransferAuthority = radiationTransferAuthority.mul(
          cavityCarrierAuthority,
        );
      }
      const radiationPotentialMagnitude = abs(normalizedRadiationPotential).mul(
        radiationTransferAuthority,
      );
      const velocityProxyAuthority = normalizedVelocityProxy.mul(
        radiationTransferAuthority,
      );
      // No container wall in the unbounded field: rim compression, boundary
      // accents, and the interior cutoff all belong to the sphere.
      const boundaryMask = isUnboundedFieldExtent
        ? float(0.0)
        : smoothstep(
            float(RAYMARCH_BOUNDARY_START),
            float(RAYMARCH_BOUNDARY_END),
            radialDistance,
          );
      // Strong local field evidence opens up the interior — more inner detail visible
      const interiorMask = isUnboundedFieldExtent
        ? float(1.0)
        : float(1.0).sub(
            smoothstep(
              dynamicInteriorMaskStart,
              float(INTERIOR_MASK_END),
              radialDistance,
            ),
          );
      const bodyDensity = broadBand
        .mul(edgeFade)
        .mul(activeMask)
        .mul(interiorMask)
        .mul(float(BODY_DENSITY_GAIN))
        .mul(float(1.0).sub(boundaryMask.mul(float(BODY_BOUNDARY_REDUCTION))))
        .mul(signedBodyAuthority)
        .mul(cancellationSuppression)
        .mul(incoherentTrebleSuppression)
        // Under-excited fields get much less body fill to avoid diffuse white fog
        .mul(excitationVisibility.pow(float(1.2)));
      const dampedBodyDensity = bodyDensity.mul(
        float(1.0).sub(latchedFogMask.mul(float(LATCHED_FOG_BODY_REDUCTION))),
      );
      // Beat pulse adds an emission flash through the caustic layer.
      const transientBoost = float(1.0)
        .add(uTransientEnergy.mul(float(BEAM_TRANSIENT_GAIN)))
        .add(uSpectralFlux.mul(float(BEAM_SPECTRAL_GAIN)))
        .add(uBeatPulse.mul(0.5));
      const rimCompressionMix = clamp(
        boundaryMask
          .mul(uRimCompression)
          .mul(float(RIM_COMPRESSION_BOUNDARY_GAIN))
          .add(
            outerShellAccent
              .mul(uRimCompression)
              .mul(float(RIM_COMPRESSION_OUTER_GAIN)),
          ),
        float(0.0),
        float(1.0),
      );
      const compressedShellWeight = shellWeight.mul(
        float(1.0).sub(rimCompressionMix),
      );
      const shellFocus = clamp(
        shellWeight
          .sub(float(SHELL_WEIGHT_MIN))
          .div(float(SHELL_WEIGHT_MAX - SHELL_WEIGHT_MIN)),
        float(0.0),
        float(1.0),
      );
      const shellFieldAuthority = localFieldSupportAuthority.mul(
        max(localGradientEvidence, signedBodyAuthority),
      );
      const gradientFieldAuthority = localGradientEvidence.mul(
        localFieldSupportAuthority,
      );
      const supportStructureAuthority = localFieldSupportAuthority.mul(
        modalStructureSupport,
      );
      const causticFocusAuthority = clamp(
        max(
          max(
            gradientFieldAuthority.mul(modalStructureSupport),
            shellFocus.mul(modalStructureSupport).mul(shellFieldAuthority),
          ),
          max(
            shellFocus.mul(supportStructureAuthority),
            radiationPotentialMagnitude
              .mul(max(velocityProxyAuthority, localGradientEvidence))
              .mul(modalStructureSupport),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      const causticRidgeAuthority = clamp(
        causticFocusAuthority.mul(edgeFade).mul(activeMask),
        float(0.0),
        float(1.0),
      );
      const causticVisibility = causticRidgeAuthority.mul(
        cancellationSuppression,
      );
      const causticCore = causticFocusAuthority.pow(float(CAUSTIC_FOCUS_POWER));
      const causticDensity = causticCore
        .mul(causticVisibility)
        .mul(compressedShellWeight)
        .mul(transientBoost)
        .mul(boundaryCausticDensity)
        .mul(float(CAUSTIC_DENSITY_GAIN))
        .mul(
          float(1.0).sub(latchedFogMask.mul(float(LATCHED_FOG_BEAM_REDUCTION))),
        );
      const rolledCausticDensity = mix(
        causticDensity,
        causticDensity.div(
          float(1.0).add(
            causticDensity.mul(
              float(EMISSION_ROLLOFF_BASE).add(
                uTransientEnergy.mul(float(EMISSION_ROLLOFF_TRANSIENT_GAIN)),
              ),
            ),
          ),
        ),
        float(EMISSION_ROLLOFF_MIX),
      );
      const additiveLocalDensity = rolledCausticDensity.add(
        dampedBodyDensity.mul(float(CAUSTIC_BODY_MIX_MAX)),
      );
      const ridgeConcentration = rolledCausticDensity.div(
        rolledCausticDensity.add(dampedBodyDensity).add(float(1e-4)),
      );
      const bodyCrowding = additiveLocalDensity.mul(
        float(1.0).sub(ridgeConcentration),
      );
      const bodyCompression = float(1.0).div(
        float(1.0).add(
          bodyCrowding.mul(float(MODAL_CROWDING_BODY_COMPRESSION)),
        ),
      );
      const adjustedBodyDensity = dampedBodyDensity.mul(bodyCompression);
      const accumulationCompression = float(1.0).div(
        float(1.0).add(
          bodyCrowding
            .mul(float(MODAL_CROWDING_ACCUMULATION_COMPRESSION))
            .mul(float(1.0).sub(ridgeConcentration)),
        ),
      );
      const adjustedBodyContribution = adjustedBodyDensity
        .mul(float(CAUSTIC_BODY_MIX_MAX))
        .mul(accumulationCompression);
      const negViewDirLocal = viewDirLocal.negate();
      const viewNormalGrazing = float(1.0).sub(
        abs(dot(gradientNormal, negViewDirLocal)),
      );
      const opticalSlopeAuthority = clamp(
        viewNormalGrazing
          .pow(float(OPTICAL_SLOPE_POWER))
          .mul(localGradientEvidence),
        float(0.0),
        float(1.0),
      );
      const opticalConvergenceAuthority = float(0.0).toVar();
      let shouldMeasureOpticalConvergence = causticRidgeAuthority
        .greaterThan(float(OPTICAL_CONVERGENCE_MEASUREMENT_EPSILON))
        .and(
          localGradientEvidence.greaterThan(
            float(OPTICAL_CONVERGENCE_MEASUREMENT_EPSILON),
          ),
        )
        .and(
          effectiveUnsignedSupport.greaterThan(
            float(OPTICAL_CONVERGENCE_MEASUREMENT_EPSILON),
          ),
        );
      if (isUnboundedFieldExtent) {
        // The convergence probe loops the live modes with two atlas fetches
        // each. In the flagship it fires only on sparse caustic ridges, but
        // the undecayed radiating field has ridge authority across the whole
        // canvas — measuring out there melts the frame budget for detail the
        // analytic wavefront gradient already provides. Cavity only.
        shouldMeasureOpticalConvergence = shouldMeasureOpticalConvergence.and(
          radialDistance.lessThan(float(UNBOUNDED_TRAVEL_BLEND_START)),
        );
      }
      If(shouldMeasureOpticalConvergence, () => {
        const viewDirection = viewDirLocal.toVar();
        const tangentSeed = vec3(0.0, 1.0, 0.0).toVar();
        If(
          abs(viewDirection.y).greaterThan(
            max(abs(viewDirection.x), abs(viewDirection.z)),
          ),
          () => {
            tangentSeed.assign(vec3(1.0, 0.0, 0.0));
          },
        );
        const tangent1 = cross(viewDirection, tangentSeed).normalize();
        const tangent2 = cross(viewDirection, tangent1);
        const assignAtlasOpticalConvergenceAuthority = () => {
          const measuredOpticalConvergenceAuthority =
            deriveOpticalConvergenceAuthorityNode({
              basisUv,
              tangent1,
              tangent2,
              sampleUvStep: convergenceSampleUvStep,
              uModalFieldModeCount,
              amplitudeNorm,
              centerGradientNormal: gradientNormal,
              modalBasisAtlasTexture,
              modalFieldModeBuffer,
              modalFieldCoefficientBuffer,
              liveSynthesisModeCount,
            });
          opticalConvergenceAuthority.assign(
            measuredOpticalConvergenceAuthority,
          );
        };
        assignAtlasOpticalConvergenceAuthority();
      });
      const opticalFocusAuthority = clamp(
        causticRidgeAuthority
          .mul(
            float(1.0).add(
              opticalSlopeAuthority.mul(opticalConvergenceAuthority),
            ),
          )
          .mul(
            float(1.0).add(ridgeConcentration.mul(opticalConvergenceAuthority)),
          ),
        float(0.0),
        float(1.0),
      );
      // Standing-wave fringe modulation: wide enough to read as interference
      // rings near ridges, still bounded so it never inverts the field.
      const phaseInterferenceTransfer = clamp(
        float(1.0).add(
          clamp(uPhaseProjectionMix, float(0.0), float(1.0))
            .mul(clamp(uPhaseProjectionStrength, float(0.0), float(0.5)))
            .mul(phaseInterferenceContrast),
        ),
        float(PHASE_INTERFERENCE_FRINGE_MIN),
        float(PHASE_INTERFERENCE_FRINGE_MAX),
      );
      const opticalFocus = /** @type {any} */ (opticalFocusAuthority)
        .pow(float(OPTICAL_FOCUS_POWER))
        .mul(phaseInterferenceTransfer);
      const opticalNegativeSpaceGate = smoothstep(
        float(OPTICAL_SPACE_GATE_START),
        float(OPTICAL_SPACE_GATE_END),
        /** @type {any} */ (opticalFocus.mul(causticRidgeAuthority)),
      );
      const opticalBodyAttenuation = float(1.0).sub(
        float(OPTICAL_BODY_SUPPRESSION_MAX).mul(
          float(1.0).sub(opticalNegativeSpaceGate),
        ),
      );
      const laserCausticRadiance = rolledCausticDensity.mul(
        float(1.0).add(opticalFocus.mul(float(OPTICAL_LASER_GAIN))),
      );
      const opticalBodyContribution = adjustedBodyContribution.mul(
        opticalBodyAttenuation,
      );
      const opticalFringeWeight = clamp(
        opticalFocus
          .mul(opticalSlopeAuthority)
          .mul(float(OPTICAL_FRINGE_MIX_MAX)),
        float(0.0),
        float(1.0),
      );
      const innerLensAuthority = smoothstep(
        float(PHOTOGRAPHIC_SHELL_INNER_START),
        float(PHOTOGRAPHIC_SHELL_INNER_END),
        radialDistance,
      )
        .mul(
          float(1.0).sub(
            smoothstep(
              float(PHOTOGRAPHIC_SHELL_INNER_FADE_START),
              float(PHOTOGRAPHIC_SHELL_INNER_FADE_END),
              radialDistance,
            ),
          ),
        )
        .mul(shellFocus);
      const rimShellAuthority = smoothstep(
        float(PHOTOGRAPHIC_SHELL_RIM_START),
        float(PHOTOGRAPHIC_SHELL_RIM_END),
        radialDistance,
      )
        .mul(
          float(1.0).sub(
            smoothstep(
              float(PHOTOGRAPHIC_SHELL_RIM_FADE_START),
              float(PHOTOGRAPHIC_SHELL_RIM_FADE_END),
              radialDistance,
            ),
          ),
        )
        .mul(max(contourCore, shellFocus.mul(float(0.5))));
      const apertureAuthority = float(1.0)
        .sub(
          smoothstep(
            float(PHOTOGRAPHIC_APERTURE_FADE_START),
            float(PHOTOGRAPHIC_APERTURE_FADE_END),
            radialDistance,
          ),
        )
        .mul(contourCore);
      const shellSuppression = smoothstep(
        float(PHOTOGRAPHIC_SHELL_SUPPRESSION_START),
        float(PHOTOGRAPHIC_SHELL_SUPPRESSION_END),
        radialDistance,
      );
      const photographicShellAuthorityBase = clamp(
        innerLensAuthority
          .mul(float(0.46))
          .add(rimShellAuthority.mul(float(0.36)))
          .add(apertureAuthority.mul(float(0.24))),
        float(0.0),
        float(1.0),
      )
        .mul(float(1.0).sub(shellSuppression))
        .mul(edgeFade)
        .mul(activeMask);
      // The photographic inner-lens/rim/aperture stack reads as a glass
      // sphere — it has no place in the unbounded field. But the blackfield
      // gate needs its focus lift to leave the dark regime, so the unbounded
      // variant substitutes a radially uniform presence: flagship-level
      // exposure with no container geometry implied.
      const photographicShellAuthority = isUnboundedFieldExtent
        ? float(UNBOUNDED_FOCUS_PRESENCE).mul(edgeFade).mul(activeMask)
        : photographicShellAuthorityBase;
      const photographicFocusAuthority = clamp(
        opticalFocusAuthority.mul(
          float(1.0).add(
            photographicShellAuthority.mul(
              float(PHOTOGRAPHIC_SHELL_FOCUS_GAIN),
            ),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      const photographicFocus = /** @type {any} */ (
        photographicFocusAuthority
      ).pow(float(PHOTOGRAPHIC_FOCUS_POWER));
      const blackfieldGate = smoothstep(
        float(PHOTOGRAPHIC_BLACKFIELD_GATE_START),
        float(PHOTOGRAPHIC_BLACKFIELD_GATE_END),
        /** @type {any} */ (photographicFocus.mul(causticRidgeAuthority)),
      );
      const photographicBodyAttenuation = mix(
        float(PHOTOGRAPHIC_DARK_BODY_RATIO),
        float(1.0),
        blackfieldGate,
      );
      const photographicBodyContribution = opticalBodyContribution.mul(
        photographicBodyAttenuation,
      );
      const photographicRadianceScale = mix(
        float(PHOTOGRAPHIC_DARK_CAUSTIC_RATIO),
        float(1.0).add(photographicFocus.mul(float(PHOTOGRAPHIC_LASER_GAIN))),
        blackfieldGate,
      );
      const photographicLaserCausticRadiance = laserCausticRadiance.mul(
        photographicRadianceScale,
      );
      const photographicFringeWeight = clamp(
        opticalFringeWeight.add(
          photographicFocus.mul(causticRidgeAuthority).mul(float(0.035)),
        ),
        float(0.0),
        float(1.0),
      );
      const hotCoreBodyCrowdingGate = smoothstep(
        float(0.28),
        float(1.1),
        /** @type {any} */ (bodyCrowding),
      );
      const hotCoreRidgeRelief = float(1.0).sub(
        smoothstep(
          float(0.76),
          float(0.94),
          /** @type {any} */ (ridgeConcentration),
        ),
      );
      const hotCoreTransientRelief = float(1.0).sub(
        uTransientEnergy.mul(float(0.55)),
      );
      const whiteEmissionTransientRelief = float(1.0).sub(
        uTransientEnergy.mul(float(WHITE_EMISSION_CROWDING_TRANSIENT_RELIEF)),
      );
      const hotCoreCrowdingBase = hotCoreBodyCrowdingGate.mul(
        float(0.35).add(hotCoreRidgeRelief.mul(float(0.65))),
      );
      const hotCoreCrowding = hotCoreCrowdingBase.mul(hotCoreTransientRelief);
      const whiteEmissionCrowding = hotCoreCrowdingBase.mul(
        whiteEmissionTransientRelief,
      );
      const localHotCoreStart = hotCoreStartDynamic.add(
        hotCoreCrowding.mul(float(HOT_CORE_CROWDING_THRESHOLD_LIFT)),
      );
      const physicalCausticDensity = clamp(
        photographicLaserCausticRadiance
          .mul(edgeFade)
          .mul(uDensityAbsorption)
          .mul(densityMod)
          .mul(activeMask),
        float(0.0),
        float(DENSITY_MAX),
      ).mul(float(DENSITY_BOOST));
      const observationInputDensity = clamp(
        photographicLaserCausticRadiance
          .add(photographicBodyContribution)
          .mul(edgeFade)
          .mul(uDensityAbsorption)
          .mul(densityMod)
          .mul(activeMask),
        float(0.0),
        float(DENSITY_MAX),
      ).mul(float(DENSITY_BOOST));
      const modalStructureAnchor = /** @type {any} */ (causticRidgeAuthority);
      const ridgeAnchor = /** @type {any} */ (causticRidgeAuthority);
      const observationTransfer = deriveObservationTransferNode(
        observationInputDensity,
        modalCoefficientEnergy,
        modalStructureAnchor,
        uModalResponseEnergy,
        ridgeAnchor,
        /** @type {any} */ (cancellationSuppression),
        uObservationDensityFadeStart,
        uObservationDensityFadeEnd,
        uObservationTransferGain,
        uObservationDensityFloor,
        uObservationContourSupportScale,
      );
      const { observationDensity } = observationTransfer;
      const causticVisibilityGate = smoothstep(
        uObservationDensityFadeStart,
        uObservationDensityFadeEnd,
        /** @type {any} */ (physicalCausticDensity),
      );
      const causticVisibleDensity = physicalCausticDensity.mul(
        causticVisibilityGate,
      );
      const projectedCausticRidgeEvidence = clamp(
        max(ridgeConcentration, causticRidgeAuthority),
        float(0.0),
        float(1.0),
      );
      const projectedCausticFocusEvidence = clamp(
        photographicFocus.mul(
          float(0.35).add(projectedCausticRidgeEvidence.mul(float(0.65))),
        ),
        float(0.0),
        float(1.0),
      );
      const projectedCausticLocalEvidence = clamp(
        max(projectedCausticRidgeEvidence, projectedCausticFocusEvidence),
        float(0.0),
        float(1.0),
      );
      const projectedCausticStructuralDrive = clamp(
        max(structuralConcentration, modalCoefficientEnergy),
        float(0.0),
        float(1.0),
      );
      const projectedCausticRadianceAuthority = clamp(
        max(
          projectedCausticLocalEvidence.mul(projectedCausticStructuralDrive),
          projectedCausticRidgeEvidence.mul(
            float(PROJECTED_CAUSTIC_RADIANCE_RIDGE_AUTHORITY_FLOOR),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      const projectedCausticAuthorityResponse = sqrt(
        /** @type {any} */ (projectedCausticRadianceAuthority),
      );
      const projectedCausticCompressionBase = float(1.0).sub(
        projectedCausticRadianceAuthority,
      );
      const projectedCausticCompressionGate =
        projectedCausticCompressionBase.mul(projectedCausticCompressionBase);
      const projectedCausticCompressedDensity = causticVisibleDensity.div(
        float(1.0).add(
          causticVisibleDensity
            .mul(float(PROJECTED_CAUSTIC_RADIANCE_COMPRESSION))
            .mul(projectedCausticCompressionGate),
        ),
      );
      const projectedCausticRadianceScale = float(
        PROJECTED_CAUSTIC_RADIANCE_MIN_SCALE,
      )
        .mul(float(1.0).sub(projectedCausticAuthorityResponse))
        .add(projectedCausticAuthorityResponse);
      const projectedCausticRadianceDensity =
        projectedCausticCompressedDensity.mul(projectedCausticRadianceScale);
      const observedContourSupport = observationTransfer.observedContourSupport;
      const highlightMask = smoothstep(
        float(HIGHLIGHT_MASK_START),
        float(HIGHLIGHT_MASK_END),
        /** @type {any} */ (projectedCausticRadianceDensity),
      );
      const stabilizedDensity = observationDensity;
      const contourMix = smoothstep(
        float(COLOR_BLEND_START),
        float(COLOR_BLEND_END),
        contourShape,
      );
      const structureDetailGate = smoothstep(
        float(STRUCTURE_AWARE_EMISSION_DETAIL_GATE_START),
        float(STRUCTURE_AWARE_EMISSION_DETAIL_GATE_END),
        /** @type {any} */ (ridgeConcentration),
      );
      const structureRidgeLock = smoothstep(
        float(STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_START),
        float(STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_END),
        /** @type {any} */ (ridgeConcentration),
      );
      const structureFilamentEligibility = clamp(
        ridgeConcentration
          .mul(float(STRUCTURE_AWARE_EMISSION_RIDGE_WEIGHT))
          .add(
            contourMix
              .mul(float(STRUCTURE_AWARE_EMISSION_CONTOUR_WEIGHT))
              .mul(structureDetailGate),
          )
          .add(
            highlightMask
              .mul(float(STRUCTURE_AWARE_EMISSION_HIGHLIGHT_WEIGHT))
              .mul(structureDetailGate),
          )
          .add(
            structureRidgeLock.mul(
              float(STRUCTURE_AWARE_EMISSION_RIDGE_LOCK_WEIGHT),
            ),
          ),
        float(0.0),
        float(1.0),
      );
      const structureBodyCrowdingGate = smoothstep(
        float(STRUCTURE_AWARE_EMISSION_CROWDING_START),
        float(STRUCTURE_AWARE_EMISSION_CROWDING_END),
        /** @type {any} */ (bodyCrowding),
      );
      const structureTransientRelief = clamp(
        float(1.0).sub(
          uTransientEnergy.mul(
            float(STRUCTURE_AWARE_EMISSION_TRANSIENT_RELIEF),
          ),
        ),
        float(0.0),
        float(1.0),
      );
      const structureBodySuppression = structureBodyCrowdingGate
        .mul(float(1.0).sub(structureFilamentEligibility))
        .mul(structureTransientRelief);
      const structureAwareEmissionGain = max(
        float(STRUCTURE_AWARE_EMISSION_MIN_GAIN),
        float(1.0).sub(
          structureBodySuppression.mul(
            float(STRUCTURE_AWARE_EMISSION_BODY_SUPPRESSION),
          ),
        ),
      );
      const contourAccent = clamp(
        contourMix
          .mul(float(0.18))
          .add(boundaryMask.mul(float(BOUNDARY_CONTOUR_ACCENT_WEIGHT)))
          .add(highlightMask.mul(float(HIGHLIGHT_CONTOUR_ACCENT_WEIGHT)))
          .add(observedContourSupport),
        float(0.0),
        float(1.0),
      );
      // Beat pulse briefly expands the bright hot core — "bloom from within" on hits
      // hotCoreStartDynamic is pre-computed above the Fn.
      // excitationGate prevents weak tonal fields from triggering the white laser core.
      const hotCoreInput = projectedCausticRadianceDensity
        .mul(contourMix.mul(float(0.14)).add(float(0.76)))
        .mul(float(0.72).add(photographicFocus.mul(float(0.28))))
        .add(highlightMask.mul(float(0.12)))
        .add(uTransientEnergy.mul(float(0.08)));
      const hotCoreMix = smoothstep(
        localHotCoreStart,
        float(HOT_CORE_END),
        /** @type {any} */ (
          hotCoreInput.div(float(1.0).add(hotCoreInput.mul(float(0.22))))
        ),
      )
        .mul(excitationGate)
        .mul(boundaryHotCore);
      const crowdedHotCoreMix = hotCoreMix.mul(
        float(1.0).sub(
          hotCoreCrowding.mul(float(HOT_CORE_SURFACE_CROWDING_REDUCTION)),
        ),
      );
      const fresnelBase = clamp(
        viewNormalGrazing.pow(max(uHolographicFresnelPower, float(0.01))),
        float(0.0),
        float(1.0),
      );
      // Rich timbres boost iridescence; deterministic novelty shifts the hue.
      // dynamicHolographicIntensity and dynamicHolographicShift pre-computed above the Fn
      const holographicFresnel = fresnelBase
        .mul(dynamicHolographicIntensity)
        .mul(localGradientEvidence)
        .mul(edgeFade);
      const holographicAccentColor = mix(
        uSurfaceColor,
        vec3(
          float(HOLOGRAPHIC_TINT_RED),
          float(HOLOGRAPHIC_TINT_GREEN),
          float(HOLOGRAPHIC_TINT_BLUE),
        ),
        clamp(
          float(0.25).add(dynamicHolographicShift.mul(float(0.75))),
          float(0.0),
          float(1.0),
        ),
      );
      const holographicColorMix = clamp(
        holographicFresnel
          .mul(float(0.35).add(dynamicHolographicShift.mul(float(0.65))))
          .add(photographicFringeWeight),
        float(0.0),
        float(1.0),
      );
      const holographicEmissionLift = clamp(
        holographicFresnel
          .mul(float(0.12).add(dynamicHolographicShift.mul(float(0.18))))
          .mul(float(0.72).add(photographicFocus.mul(float(0.28)))),
        float(0.0),
        float(1.0),
      );
      const whiteEmissionRidgeEvidence = clamp(
        max(ridgeConcentration, causticRidgeAuthority),
        float(0.0),
        float(1.0),
      );
      const whiteEmissionLocalEvidence = clamp(
        max(
          ridgeConcentration,
          photographicFocus.mul(whiteEmissionRidgeEvidence),
        ),
        float(0.0),
        float(1.0),
      );
      const whiteEmissionStructuralDrive = clamp(
        max(structuralConcentration, modalCoefficientEnergy),
        float(0.0),
        float(1.0),
      );
      const whiteEmissionFieldAuthority = clamp(
        whiteEmissionLocalEvidence.mul(whiteEmissionStructuralDrive),
        float(0.0),
        float(1.0),
      );
      const whiteEmissionFieldCrowding = float(1.0).sub(
        whiteEmissionFieldAuthority,
      );
      const crowdedWhiteEmissionMix = holographicEmissionLift
        .mul(whiteEmissionFieldAuthority)
        .mul(
          float(1.0).sub(
            max(whiteEmissionCrowding, whiteEmissionFieldCrowding).mul(
              float(WHITE_EMISSION_CROWDING_REDUCTION),
            ),
          ),
        );
      // Modal coherence warms color; rapid change cools it.
      // spectralColorBiasHintOffset is pre-computed above the Fn.
      const spectralColorBias = clamp(
        contourMix
          .add(uSpectralCentroid.mul(0.25))
          .add(uTransientEnergy.mul(0.1))
          .add(spectralColorBiasHintOffset)
          .mul(float(COLOR_BIAS_SCALE)),
        float(0.0),
        float(1.0),
      );
      const staticBaseColor = mix(
        uColor,
        uSurfaceColor,
        spectralColorBias.mul(float(STATIC_SURFACE_TINT_SCALE)),
      );
      const staticContourColor = mix(
        staticBaseColor,
        uSurfaceColor,
        /** @type {any} */ (
          contourAccent.mul(float(STATIC_SURFACE_TINT_SCALE))
        ),
      );
      const staticLaserColor = mix(
        staticContourColor,
        uSurfaceColor,
        crowdedHotCoreMix
          .mul(float(0.72))
          .mul(boundarySurfacePull.mul(float(STATIC_SURFACE_TINT_SCALE))),
      );
      const staticHolographicColor = mix(
        staticLaserColor,
        holographicAccentColor,
        /** @type {any} */ (
          holographicColorMix.mul(float(STATIC_SURFACE_TINT_SCALE))
        ),
      );
      const staticWhiteEmissionMix = crowdedWhiteEmissionMix
        .mul(float(0.45))
        .mul(boundaryWhiteEmission);
      const staticHolographicLaserColor = deriveHighlightTargetNode(
        staticHolographicColor,
        uSurfaceColor,
        staticWhiteEmissionMix,
        float(STATIC_HIGHLIGHT_SURFACE_PULL_SCALE),
      );
      const volumeColor = mix(
        staticHolographicLaserColor.mul(float(0.9)),
        staticHolographicLaserColor,
        activeMask,
      );
      // Dim support medium carries the laser (volume) color — a white-tinted
      // veil reads as gray fog instead of laser scatter in the fluid.
      const supportRevealColor = clamp(
        uColor.mul(float(PHOTOGRAPHIC_DARK_BODY_RATIO)),
        vec3(0.0),
        vec3(PHOTOGRAPHIC_DARK_BODY_RATIO),
      );

      const supportVisibleDensity = max(
        stabilizedDensity.sub(causticVisibleDensity),
        float(0.0),
      );
      // The dim support medium scatters the laser light actually present at
      // the sample: measured irradiance shades it with light shafts and
      // acoustic shadows once the transport pass is live.
      const supportRevealDensity = supportVisibleDensity.mul(
        mix(
          float(1.0),
          clamp(
            laserIrradiance,
            float(LASER_SHADOW_FLOOR),
            float(LASER_SUPPORT_IRRADIANCE_MAX),
          ),
          laserCausticReady,
        ),
      );
      // Fold-caustic focal law: irradiance diverges as 1 / (1 − κ·d) at the
      // fold. Applied to source radiance only — extinction keeps the
      // unboosted density, since focused light does not occlude.
      const heuristicCausticFocalBoost = float(1.0).div(
        max(
          float(1.0).sub(
            photographicFocus
              .mul(causticRidgeAuthority)
              .mul(float(CAUSTIC_FOCAL_CONVERGENCE)),
          ),
          float(CAUSTIC_FOCAL_FLOOR),
        ),
      );
      // When the refracted laser transport is live, measured ray density
      // replaces the heuristic focal law: caustics brighten where traced
      // light actually converges, clamped to the same display ceiling.
      const causticFocalBoost = mix(
        heuristicCausticFocalBoost,
        clamp(
          laserIrradiance,
          float(LASER_SHADOW_FLOOR),
          float(1 / CAUSTIC_FOCAL_FLOOR),
        ),
        laserCausticReady,
      );
      const luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
      // The unbounded energy profile scales emitted radiance and extinction
      // together, exactly once, at the sample output. The sphere variant
      // adds no node here.
      const applyExtentEnergyProfile = (node) =>
        unboundedEnergyProfile ? node.mul(unboundedEnergyProfile) : node;
      if (spectralLaneTransferEnabled) {
        const spectralLaneTransfer = sampleSpectralLaneCacheNode({
          basisUv,
          spectralLaneTextureA,
          spectralLaneTextureB,
          spectralLaneStatsTexture,
        });
        const spectralCausticRadianceContribution =
          spectralLaneTransfer.rgb.mul(projectedCausticRadianceDensity);
        const spectralSupportRevealContribution = spectralLaneTransfer.rgb
          .mul(float(PHOTOGRAPHIC_DARK_BODY_RATIO))
          .mul(supportRevealDensity);
        const spectralBaseRadiance = spectralCausticRadianceContribution
          .mul(structureAwareEmissionGain)
          .add(spectralSupportRevealContribution);

        return vec4(
          applyExtentEnergyProfile(
            spectralCausticRadianceContribution
              .mul(structureAwareEmissionGain)
              .mul(causticFocalBoost)
              .add(spectralSupportRevealContribution),
          ),
          applyExtentEnergyProfile(dot(spectralBaseRadiance, luminanceWeights)),
        );
      }
      const causticRadianceContribution = volumeColor.mul(
        projectedCausticRadianceDensity,
      );
      const supportRevealContribution =
        supportRevealColor.mul(supportRevealDensity);
      const baseRadiance = causticRadianceContribution
        .mul(structureAwareEmissionGain)
        .add(supportRevealContribution);
      return vec4(
        applyExtentEnergyProfile(
          causticRadianceContribution
            .mul(structureAwareEmissionGain)
            .mul(causticFocalBoost)
            .add(supportRevealContribution),
        ),
        applyExtentEnergyProfile(dot(baseRadiance, luminanceWeights)),
      );
    },
  );
}

// GPU mirror of deriveObservationTransfer in observationTransfer.js.
function deriveObservationTransferNode(
  observationInputDensity,
  modalCoefficientEnergy,
  modalStructureAnchor,
  modalResponseEnergy = float(0.0),
  ridgeAnchor = float(0.0),
  signedRadianceAuthority = float(1.0),
  observationDensityFadeStart = float(0.0),
  observationDensityFadeEnd = float(0.0),
  observationTransferGain = float(0.0),
  observationDensityFloor = float(0.0),
  observationContourSupportScale = float(0.0),
) {
  const physicalVisibilityGate = smoothstep(
    observationDensityFadeStart,
    observationDensityFadeEnd,
    observationInputDensity,
  );
  const physicalVisibleDensity = observationInputDensity.mul(
    physicalVisibilityGate,
  );
  const contourRidgeAnchor = clamp(ridgeAnchor, float(0.0), float(1.0));
  const observationAnchor = clamp(
    modalStructureAnchor.mul(signedRadianceAuthority),
    float(0.0),
    float(1.0),
  );
  const observationEnergy = clamp(
    max(modalCoefficientEnergy, modalResponseEnergy),
    float(0.0),
    float(1.0),
  );
  const observationResponse = /** @type {any} */ (observationEnergy).pow(
    float(0.5),
  );
  const observationSupport = clamp(
    float(1.0).sub(
      exp(observationResponse.mul(observationTransferGain.negate())),
    ),
    float(0.0),
    float(1.0),
  );
  const observedDensityFloor = clamp(
    observationSupport.mul(observationAnchor).mul(observationDensityFloor),
    float(0.0),
    observationDensityFloor,
  );
  const observedContourSupport = clamp(
    observationSupport
      .mul(observationAnchor)
      .mul(contourRidgeAnchor)
      .mul(observationContourSupportScale),
    float(0.0),
    observationContourSupportScale,
  );
  const observationDensity = max(physicalVisibleDensity, observedDensityFloor);

  return {
    physicalVisibilityGate,
    physicalVisibleDensity,
    observationAnchor,
    observationEnergy,
    observationResponse,
    observationSupport,
    observedDensityFloor,
    observedContourSupport,
    observationDensity,
  };
}

function createRaymarchOffsetNode() {
  // IGN (Interleaved Gradient Noise) — Jorge Jimenez's formula.
  // No temporal phase here: TRAA's Halton sub-pixel camera jitter provides temporal
  // decorrelation across frames. Animating the noise would cause TRAA to accumulate
  // the scintillation instead of cancelling it, defeating the history pass.
  return () => {
    const c = screenCoordinate.x
      .mul(0.06711056)
      .add(screenCoordinate.y.mul(0.00583715));
    return fract(fract(c).mul(52.9829189));
  };
}

const RAYMARCH_DOMAIN_GEOMETRY_MARGIN = 1.01;
const UNBOUNDED_MIN_RAYMARCH_STEPS = 16;

function resolveVolumeDomainGeometryRadius(radius, fieldExtent) {
  const hullScale =
    normalizeFieldExtent(fieldExtent) === FIELD_EXTENTS.unbounded
      ? UNBOUNDED_DOMAIN_SCALE
      : 1;
  return radius * hullScale * RAYMARCH_DOMAIN_GEOMETRY_MARGIN;
}

function createVolumeDomainGeometry(radius, fieldExtent) {
  // The hull is only the rasterized trigger for the march. The unbounded
  // hull covers the fixed free-field reach: absorption drives the field to
  // ~black before this radius, so the bound is a compute budget, never a
  // visible edge — and the camera stays outside the medium at flagship
  // framing, keeping the march off most background pixels.
  // SphereGeometry: TRAA vertex velocities match the sphere surface during rotation.
  const geometry = new THREE.SphereGeometry(
    resolveVolumeDomainGeometryRadius(radius, fieldExtent),
    32,
    32,
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function isVolumeDomainGeometryForExtent(geometry, radius, fieldExtent) {
  if (!Number.isFinite(radius) || radius <= 0) {
    return true;
  }

  const actualRadius = geometry?.parameters?.radius;
  if (!Number.isFinite(actualRadius)) {
    return false;
  }

  const expectedRadius = resolveVolumeDomainGeometryRadius(radius, fieldExtent);
  const tolerance = Math.max(1e-6, Math.abs(expectedRadius) * 1e-6);
  return Math.abs(actualRadius - expectedRadius) <= tolerance;
}

function createVolumeDomainRadiusNode(uniforms, fieldExtent) {
  return normalizeFieldExtent(fieldExtent) === FIELD_EXTENTS.unbounded
    ? uniforms.uRadius.mul(float(UNBOUNDED_DOMAIN_SCALE))
    : uniforms.uRadius;
}

function resolveMaterialStepBudget(steps, fieldExtent) {
  const requestedSteps = Math.max(
    1,
    Math.round(Number.isFinite(steps) ? steps : 1),
  );
  if (normalizeFieldExtent(fieldExtent) !== FIELD_EXTENTS.unbounded) {
    return requestedSteps;
  }
  return Math.max(
    UNBOUNDED_MIN_RAYMARCH_STEPS,
    Math.round(requestedSteps * UNBOUNDED_STEP_SCALE),
  );
}

function getRaymarchMaterialVariantKey(
  spectralLightEvaluationMode,
  fieldExtent,
) {
  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const normalizedFieldExtent = normalizeFieldExtent(fieldExtent);
  return normalizedFieldExtent === FIELD_EXTENTS.sphere
    ? normalizedSpectralLightEvaluationMode
    : `${normalizedSpectralLightEvaluationMode}:${normalizedFieldExtent}`;
}

export function createRaymarchVolumeMesh({
  radius,
  modalBasisAtlasTexture = null,
  modalLiveFieldTexture = null,
  modalLiveSupportTexture = null,
  modalPressureRadiationTexture = null,
  modalPhaseInterferenceTexture = null,
  laserIrradianceTexture = null,
  spectralLaneTextureA = null,
  spectralLaneTextureB = null,
  spectralLaneStatsTexture = null,
  modalFieldModeBuffer = null,
  modalFieldCoefficientBuffer = null,
  modalFieldCapacity = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
  uniforms,
  cavityGeometry = "rectangular",
  spectralLightEvaluationMode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
}) {
  const geometry = createVolumeDomainGeometry(radius, FIELD_EXTENTS.sphere);
  const sharedOffsetNode = createRaymarchOffsetNode();
  const modalBasisAtlasTextureNode = getTexture3DNode(modalBasisAtlasTexture);
  const modalResourceBindings = {
    modalBasisAtlasTexture,
    modalBasisAtlasTextureNode,
    modalLiveFieldTexture,
    modalLiveSupportTexture,
    modalPressureRadiationTexture,
    modalPhaseInterferenceTexture,
    laserIrradianceTexture,
    spectralLaneTextureA,
    spectralLaneTextureB,
    spectralLaneStatsTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldCapacity,
  };
  const createMaterialForBoundaryMode = (
    boundaryMode,
    spectralLightEvaluationMode,
    fieldExtent = DEFAULT_FIELD_EXTENT,
  ) => {
    const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
    const normalizedSpectralLightEvaluationMode =
      normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
    const normalizedFieldExtent = normalizeFieldExtent(fieldExtent);
    const material = /** @type {BaryonVolumeMaterial} */ (
      new BaryonVolumeNodeMaterial()
    );
    material.transparent = true;
    material.blending = THREE.NormalBlending;
    material.outputNode = vec4(raymarchLightNode, raymarchOpacityNode);
    material.steps = resolveMaterialStepBudget(
      uniforms.uRaymarchSteps.value,
      normalizedFieldExtent,
    );
    material.radiusNode = createVolumeDomainRadiusNode(
      uniforms,
      normalizedFieldExtent,
    );
    if (normalizedFieldExtent === FIELD_EXTENTS.unbounded) {
      // Radial-adaptive march: flagship sample density through the cavity
      // and the travel blend, stretched steps across the smooth radiating
      // zone — the large open domain costs little beyond the core march.
      material.coreStepRadiusNode = uniforms.uRadius.mul(
        float(UNBOUNDED_CORE_STEP_RADIUS_SCALE),
      );
      material.outerStepStretch = UNBOUNDED_OUTER_STEP_STRETCH;
    }
    material.opacityGainNode = uniforms.uOpacityGain;
    material.offsetNode = sharedOffsetNode;
    material.scatteringNode = createScatteringNode({
      uniforms,
      boundaryMode: normalizedBoundaryMode,
      modalBasisAtlasTexture: modalResourceBindings.modalBasisAtlasTextureNode,
      modalLiveFieldTexture: modalResourceBindings.modalLiveFieldTexture,
      modalLiveSupportTexture: modalResourceBindings.modalLiveSupportTexture,
      modalPressureRadiationTexture:
        modalResourceBindings.modalPressureRadiationTexture,
      modalPhaseInterferenceTexture:
        modalResourceBindings.modalPhaseInterferenceTexture,
      laserIrradianceTexture: modalResourceBindings.laserIrradianceTexture,
      spectralLaneTextureA: modalResourceBindings.spectralLaneTextureA,
      spectralLaneTextureB: modalResourceBindings.spectralLaneTextureB,
      spectralLaneStatsTexture: modalResourceBindings.spectralLaneStatsTexture,
      spectralLightEvaluationMode: normalizedSpectralLightEvaluationMode,
      fieldExtent: normalizedFieldExtent,
      modalFieldModeBuffer: modalResourceBindings.modalFieldModeBuffer,
      modalFieldCoefficientBuffer:
        modalResourceBindings.modalFieldCoefficientBuffer,
      liveSynthesisModeCount: modalResourceBindings.modalFieldCapacity,
    });
    material.spectralLightEvaluationMode =
      normalizedSpectralLightEvaluationMode;
    material.raymarchBoundaryMode = normalizedBoundaryMode;
    material.raymarchFieldExtent = normalizedFieldExtent;
    material.modalBasisAtlasTexture =
      modalResourceBindings.modalBasisAtlasTexture;
    material.modalLiveFieldTexture =
      modalResourceBindings.modalLiveFieldTexture;
    material.modalLiveSupportTexture =
      modalResourceBindings.modalLiveSupportTexture;
    material.modalPressureRadiationTexture =
      modalResourceBindings.modalPressureRadiationTexture;
    material.modalPhaseInterferenceTexture =
      modalResourceBindings.modalPhaseInterferenceTexture;
    material.spectralLaneTextureA = modalResourceBindings.spectralLaneTextureA;
    material.spectralLaneTextureB = modalResourceBindings.spectralLaneTextureB;
    material.spectralLaneStatsTexture =
      modalResourceBindings.spectralLaneStatsTexture;
    material.modalFieldModeBuffer = modalResourceBindings.modalFieldModeBuffer;
    material.modalFieldCoefficientBuffer =
      modalResourceBindings.modalFieldCoefficientBuffer;
    material.modalFieldCapacity = modalResourceBindings.modalFieldCapacity;
    return material;
  };
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const initialSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const materialCache = {
    [BOUNDARY_MODES.dirichlet]: {
      [initialSpectralLightEvaluationMode]: createMaterialForBoundaryMode(
        BOUNDARY_MODES.dirichlet,
        initialSpectralLightEvaluationMode,
      ),
    },
    [BOUNDARY_MODES.neumann]: {
      [initialSpectralLightEvaluationMode]: createMaterialForBoundaryMode(
        BOUNDARY_MODES.neumann,
        initialSpectralLightEvaluationMode,
      ),
    },
  };
  const mesh = new THREE.Mesh(
    geometry,
    materialCache[BOUNDARY_MODES.neumann][initialSpectralLightEvaluationMode],
  );
  mesh.userData.raymarchMaterialCache = materialCache;
  mesh.userData.raymarchCreateMaterialVariant = createMaterialForBoundaryMode;
  mesh.userData.raymarchBoundaryMode = BOUNDARY_MODES.neumann;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    initialSpectralLightEvaluationMode;
  mesh.userData.raymarchModalBasisAtlasTexture = modalBasisAtlasTexture;
  mesh.userData.raymarchModalLiveFieldTexture = modalLiveFieldTexture;
  mesh.userData.raymarchModalLiveSupportTexture = modalLiveSupportTexture;
  mesh.userData.raymarchModalPressureRadiationTexture =
    modalPressureRadiationTexture;
  mesh.userData.raymarchModalPhaseInterferenceTexture =
    modalPhaseInterferenceTexture;
  mesh.userData.raymarchSpectralLaneTextureA = spectralLaneTextureA;
  mesh.userData.raymarchSpectralLaneTextureB = spectralLaneTextureB;
  mesh.userData.raymarchSpectralLaneStatsTexture = spectralLaneStatsTexture;
  mesh.userData.raymarchModalFieldModeBuffer = modalFieldModeBuffer;
  mesh.userData.raymarchModalFieldCoefficientBuffer =
    modalFieldCoefficientBuffer;
  mesh.userData.raymarchModalFieldCapacity = modalFieldCapacity;
  mesh.userData.raymarchModalResourceBindings = modalResourceBindings;
  mesh.userData.raymarchCavityGeometry = normalizedCavityGeometry;
  mesh.userData.raymarchBaseRadius = radius;
  mesh.userData.raymarchFieldExtent = FIELD_EXTENTS.sphere;
  mesh.userData.raymarchRequestedSteps = Math.round(
    uniforms.uRaymarchSteps.value,
  );
  mesh.frustumCulled = false;

  return mesh;
}

export function getRaymarchMaterialCache(mesh) {
  return mesh?.userData?.raymarchMaterialCache ?? null;
}

export function setRaymarchModalBasisAtlasTexture(mesh, texture) {
  if (!mesh?.userData) {
    return;
  }

  mesh.userData.raymarchModalBasisAtlasTexture = texture;
  const bindings = mesh.userData.raymarchModalResourceBindings;
  if (bindings) {
    bindings.modalBasisAtlasTexture = texture;
    if (!bindings.modalBasisAtlasTextureNode && texture) {
      bindings.modalBasisAtlasTextureNode = texture3D(texture);
    }
    if (bindings.modalBasisAtlasTextureNode) {
      bindings.modalBasisAtlasTextureNode.value = texture;
    }
  }

  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    if (mesh.material) {
      mesh.material.modalBasisAtlasTexture = texture;
    }
    return;
  }

  Object.values(materialCache).forEach((boundaryMaterials) => {
    Object.values(boundaryMaterials).forEach((material) => {
      if (material) {
        material.modalBasisAtlasTexture = texture;
      }
    });
  });
}

function raymarchMaterialMatchesVariant(
  material,
  boundaryMode,
  spectralLightEvaluationMode,
  fieldExtent,
) {
  if (!material) {
    return false;
  }

  return (
    normalizeBoundaryMode(material.raymarchBoundaryMode) ===
      normalizeBoundaryMode(boundaryMode) &&
    normalizeSpectralLightEvaluationMode(
      material.spectralLightEvaluationMode,
    ) === normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode) &&
    normalizeFieldExtent(material.raymarchFieldExtent) ===
      normalizeFieldExtent(fieldExtent)
  );
}

function getOrCreateRaymarchMaterial(
  mesh,
  boundaryMode,
  spectralLightEvaluationMode,
  fieldExtent = DEFAULT_FIELD_EXTENT,
) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return null;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const boundaryMaterials = materialCache[normalizedBoundaryMode];
  if (!boundaryMaterials) {
    return null;
  }

  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const normalizedFieldExtent = normalizeFieldExtent(fieldExtent);
  const materialKey = getRaymarchMaterialVariantKey(
    normalizedSpectralLightEvaluationMode,
    normalizedFieldExtent,
  );
  const cachedMaterial = boundaryMaterials[materialKey];
  if (
    raymarchMaterialMatchesVariant(
      cachedMaterial,
      normalizedBoundaryMode,
      normalizedSpectralLightEvaluationMode,
      normalizedFieldExtent,
    )
  ) {
    return cachedMaterial;
  }

  const createMaterialVariant = mesh?.userData?.raymarchCreateMaterialVariant;
  if (typeof createMaterialVariant !== "function") {
    return null;
  }

  const material = createMaterialVariant(
    normalizedBoundaryMode,
    normalizedSpectralLightEvaluationMode,
    normalizedFieldExtent,
  );
  boundaryMaterials[materialKey] = material;
  return material;
}

export function setRaymarchBoundaryMode(mesh, boundaryMode) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const spectralLightEvaluationMode = normalizeSpectralLightEvaluationMode(
    mesh?.userData?.raymarchSpectralLightEvaluationMode,
  );
  const fieldExtent = normalizeFieldExtent(mesh?.userData?.raymarchFieldExtent);
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    spectralLightEvaluationMode,
    fieldExtent,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchBoundaryMode = normalizedBoundaryMode;
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
    fieldExtent,
  );
  mesh.material = nextMaterial;
  mesh.userData.raymarchBoundaryMode = normalizedBoundaryMode;
}

export function setRaymarchSpectralLightEvaluationMode(
  mesh,
  spectralLightEvaluationMode,
) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return;
  }

  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const normalizedBoundaryMode = normalizeBoundaryMode(
    mesh?.userData?.raymarchBoundaryMode,
  );
  const fieldExtent = normalizeFieldExtent(mesh?.userData?.raymarchFieldExtent);
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    normalizedSpectralLightEvaluationMode,
    fieldExtent,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchSpectralLightEvaluationMode =
      normalizedSpectralLightEvaluationMode;
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
    fieldExtent,
  );
  mesh.material = nextMaterial;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    normalizedSpectralLightEvaluationMode;
}

export function setRaymarchCavityGeometry(mesh, cavityGeometry) {
  if (mesh?.userData) {
    mesh.userData.raymarchCavityGeometry =
      normalizeCavityGeometry(cavityGeometry);
  }
}

export function setRaymarchFieldExtent(mesh, fieldExtent) {
  if (!mesh?.userData) {
    return;
  }

  const normalizedFieldExtent = normalizeFieldExtent(fieldExtent);
  const previousFieldExtent = normalizeFieldExtent(
    mesh.userData.raymarchFieldExtent,
  );
  const baseRadius = mesh.userData.raymarchBaseRadius;
  const activeMaterialExtent = normalizeFieldExtent(
    mesh.material?.raymarchFieldExtent,
  );
  const activeExtentMatches =
    previousFieldExtent === normalizedFieldExtent &&
    activeMaterialExtent === normalizedFieldExtent &&
    isVolumeDomainGeometryForExtent(
      mesh.geometry,
      baseRadius,
      normalizedFieldExtent,
    );
  if (activeExtentMatches) {
    return;
  }

  mesh.userData.raymarchFieldExtent = normalizedFieldExtent;
  const normalizedBoundaryMode = normalizeBoundaryMode(
    mesh.userData.raymarchBoundaryMode,
  );
  const spectralLightEvaluationMode = normalizeSpectralLightEvaluationMode(
    mesh.userData.raymarchSpectralLightEvaluationMode,
  );
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    spectralLightEvaluationMode,
    normalizedFieldExtent,
  );
  if (nextMaterial) {
    nextMaterial.steps = resolveMaterialStepBudget(
      mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
      normalizedFieldExtent,
    );
    mesh.material = nextMaterial;
  }

  if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
    return;
  }
  if (
    previousFieldExtent === normalizedFieldExtent &&
    isVolumeDomainGeometryForExtent(
      mesh.geometry,
      baseRadius,
      normalizedFieldExtent,
    )
  ) {
    return;
  }

  // The mesh is only the rasterized hull that triggers the march — swapping
  // geometry per extent keeps the flagship sphere free of the overdraw a
  // permanently enlarged hull would cost.
  const previousGeometry = mesh.geometry;
  mesh.geometry = createVolumeDomainGeometry(baseRadius, normalizedFieldExtent);
  previousGeometry?.dispose?.();
}

export function syncRaymarchMaterialSteps(mesh, steps) {
  if (mesh?.userData) {
    mesh.userData.raymarchRequestedSteps = Math.round(steps);
  }
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    if (mesh?.material) {
      mesh.material.steps = resolveMaterialStepBudget(
        steps,
        mesh?.userData?.raymarchFieldExtent,
      );
    }
    return;
  }

  Object.values(materialCache).forEach((boundaryMaterials) => {
    Object.values(boundaryMaterials).forEach((material) => {
      if (material) {
        material.steps = resolveMaterialStepBudget(
          steps,
          material.raymarchFieldExtent,
        );
      }
    });
  });
}

export function createIdleOverlay({ baryonGeometry, uniforms }) {
  const geometry = new THREE.EdgesGeometry(baryonGeometry);
  const overlay = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: uniforms.uIdleLogoColor.value.clone(),
      transparent: true,
      opacity: uniforms.uIdleLogoAlpha.value,
    }),
  );
  overlay.scale.setScalar(uniforms.uIdleLogoSize.value);
  overlay.frustumCulled = false;

  return overlay;
}
