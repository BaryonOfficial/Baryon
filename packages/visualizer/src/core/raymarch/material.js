import * as THREE from "three";
import { VolumeNodeMaterial } from "three/webgpu";
import {
  Break,
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
  smoothstep,
  texture3D,
  int,
  vec3,
  vec4,
} from "three/tsl";
import SafeVolumetricLightingModel, {
  raymarchLightNode,
  raymarchOpacityNode,
} from "./SafeVolumetricLightingModel.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import {
  RAYMARCH_BOUNDARY_END,
  RAYMARCH_BOUNDARY_START,
} from "./intersection.js";
import { deriveHighlightTargetNode } from "../../render/displayRadiance.js";
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
  EFFECTIVE_FIELD_CANCELLATION_SUPPRESSION_SCALE,
  EDGE_FADE_END,
  EDGE_FADE_START,
  EXCITATION_VISIBILITY_COHERENCE_WEIGHT,
  EXCITATION_VISIBILITY_MODAL_ENERGY_WEIGHT,
  EXCITATION_VISIBILITY_MODAL_SOURCE_AUTHORITY_WEIGHT,
  EXCITATION_VISIBILITY_MAX_FLOOR,
  EXCITATION_VISIBILITY_SOURCE_AUTHORITY_END,
  EXCITATION_VISIBILITY_SOURCE_AUTHORITY_START,
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
import { RAYMARCH_EFFECTIVE_FIELD_RESOLUTION } from "./fieldCache.js";

// Excitation gate: smoothstep range for uAverageAmplitude / 255.
// Below LOW the field is under-excited; gating reduces body fill and hot-core.
// Above HIGH the gate is fully open and behavior is identical to pre-fix.
const EXCITATION_GATE_LOW = 0.04;
const EXCITATION_GATE_HIGH = 0.35;
const STATIC_SURFACE_TINT_SCALE = 0.18;
const STATIC_HIGHLIGHT_SURFACE_PULL_SCALE = 0.2;
const RAYMARCH_LIVE_RESIDUAL_GAIN = 0.18;

export const RAYMARCH_LIVE_RESIDUAL_MAX_MODES = 2;

export const RAYMARCH_SPECTRAL_LIGHT_TUNING = Object.freeze({
  baseRadianceLift: 0.42,
  contourShadow: 0.97,
  hotCoreSurfacePull: 0.26,
  holographicAccentMix: 0.065,
  holographicAccentColorPull: 0.38,
  whiteEmissionLift: 0.034,
  directPresenceEnd: 0.04,
  cachedPresenceEnd: 0.06,
  uncoloredNeutralLift: 0.025,
});

export const RAYMARCH_BOUNDARY_TUNING = Object.freeze({
  dirichletBeamDensity: 0.64,
  dirichletHotCore: 0.08,
  dirichletSurfacePull: 0.07,
  dirichletWhiteEmission: 0.04,
});

/** @type {{ off: string; direct: string; cached: string }} */
export const RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES = Object.freeze({
  off: "off",
  direct: "direct",
  cached: "cached",
});

function normalizeFieldEvaluationMode(fieldEvaluationMode) {
  if (fieldEvaluationMode === "direct") {
    return "direct";
  }
  if (fieldEvaluationMode === "unavailable") {
    return "unavailable";
  }
  return "effective-cached";
}

function normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode) {
  switch (spectralLightEvaluationMode) {
    case RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct:
      return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
    case RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached:
      return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
    case RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off:
    default:
      return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  }
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
 *   fieldEvaluationMode?: string,
 *   spectralLightEvaluationMode?: string,
 *   effectiveFieldTexture?: any,
 *   effectiveFieldSupportTexture?: any
 * }} BaryonVolumeMaterial
 */

class BaryonVolumeNodeMaterial extends VolumeNodeMaterial {
  setupLightingModel() {
    return new SafeVolumetricLightingModel();
  }
}

function accumulateModalField({
  buffer,
  colorBuffer,
  capacity,
  activeCount,
  localPosition,
  uRadius,
  boundaryMode,
  cavityGeometry,
  enableColorAccumulation = null,
  field,
  gradX,
  gradY,
  gradZ,
  colorSum,
  colorWeight,
  phaseBuffer = null,
  uTime = null,
  unsignedSupport = null,
}) {
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
  Loop(
    { start: int(0), end: int(capacity), type: "int", condition: "<" },
    ({ i }) => {
      If(i.greaterThanEqual(activeCount), () => {
        Break();
      });
      const slot = buffer.element(i);
      const amplitude = slot.w;
      const phaseCurrentCoefficient =
        phaseBuffer && uTime
          ? (() => {
              const phaseSlot = phaseBuffer.element(i);
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
              return amplitude.mul(phaseScale).toVar();
            })()
          : amplitude;
      const u = slot.x;
      const v = slot.y;
      const w = slot.z;
      const family = geometryBackend.evaluateModeNode({
        u,
        v,
        w,
        xCoord: localPosition.x,
        yCoord: localPosition.y,
        zCoord: localPosition.z,
        scale,
        boundaryMode,
      });
      const phaseCurrentContribution = phaseCurrentCoefficient
        .mul(family.field)
        .toVar();
      field.addAssign(phaseCurrentContribution);
      gradX.addAssign(phaseCurrentCoefficient.mul(family.gradX));
      gradY.addAssign(phaseCurrentCoefficient.mul(family.gradY));
      gradZ.addAssign(phaseCurrentCoefficient.mul(family.gradZ));
      if (unsignedSupport) {
        unsignedSupport.addAssign(abs(phaseCurrentContribution));
      }
      if (colorBuffer && colorSum && colorWeight && enableColorAccumulation) {
        If(enableColorAccumulation.greaterThan(0.5), () => {
          const colorSlot = colorBuffer.element(i);
          const localInfluence = amplitude.mul(abs(family.field));
          const weightedInfluence = localInfluence.mul(colorSlot.w);
          colorSum.addAssign(
            vec3(colorSlot.x, colorSlot.y, colorSlot.z).mul(
              weightedInfluence,
            ),
          );
          colorWeight.addAssign(weightedInfluence);
        });
      }
    },
  );
}

function accumulateModalFieldColorOnly({
  buffer,
  colorBuffer,
  capacity,
  activeCount,
  localPosition,
  uRadius,
  boundaryMode,
  cavityGeometry,
  colorSum,
  colorWeight,
}) {
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
  Loop(
    { start: int(0), end: int(capacity), type: "int", condition: "<" },
    ({ i }) => {
      If(i.greaterThanEqual(activeCount), () => {
        Break();
      });
      const slot = buffer.element(i);
      const amplitude = slot.w;
      const family = geometryBackend.evaluateModeNode({
        u: slot.x,
        v: slot.y,
        w: slot.z,
        xCoord: localPosition.x,
        yCoord: localPosition.y,
        zCoord: localPosition.z,
        scale,
        boundaryMode,
      });
      const colorSlot = colorBuffer.element(i);
      const localInfluence = amplitude.mul(abs(family.field));
      const weightedInfluence = localInfluence.mul(colorSlot.w);
      colorSum.addAssign(
        vec3(colorSlot.x, colorSlot.y, colorSlot.z).mul(weightedInfluence),
      );
      colorWeight.addAssign(weightedInfluence);
    },
  );
}

function accumulateCachedLiveResidual({
  modalFieldModeBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  modalFieldActiveCount,
  localPosition,
  uRadius,
  boundaryMode,
  cavityGeometry,
  field,
  uTime,
  effectiveUnsignedSupport,
  uTransientEnergy,
  uPulseSignal,
  uModalResponseEnergy,
}) {
  const geometryBackend = getModalGeometryBackend(cavityGeometry);
  const scale = float(Math.PI).div(uRadius.max(float(1e-4)));
  const residualField = float(0.0).toVar();
  const residualCapacity = Math.min(
    Math.max(0, Math.floor(modalFieldCapacity ?? 0)),
    RAYMARCH_LIVE_RESIDUAL_MAX_MODES,
  );

  If(modalFieldActiveCount.greaterThan(0), () => {
    Loop(
      { start: int(0), end: int(residualCapacity), type: "int", condition: "<" },
      ({ i }) => {
        If(i.greaterThanEqual(modalFieldActiveCount), () => {
          Break();
        });
        const slot = modalFieldModeBuffer.element(i);
        const phaseSlot = modalFieldPhaseBuffer.element(i);
        const beta = clamp(phaseSlot.z.mul(phaseSlot.w), float(0.0), float(1.0));
        const phase = phaseSlot.x.add(phaseSlot.y.mul(uTime));
        const phaseScale = float(1.0)
          .sub(beta)
          .add(beta.mul(cos(phase)))
          .toVar();
        const family = geometryBackend.evaluateFieldNode({
          u: slot.x,
          v: slot.y,
          w: slot.z,
          xCoord: localPosition.x,
          yCoord: localPosition.y,
          zCoord: localPosition.z,
          scale,
          boundaryMode,
        });

        residualField.addAssign(slot.w.mul(phaseScale).mul(family.field));
      },
    );
  });

  const liveEnergyGate = clamp(
    uTransientEnergy.add(uPulseSignal).add(uModalResponseEnergy),
    float(0.0),
    float(1.0),
  );
  const residualAuthority = clamp(
    effectiveUnsignedSupport,
    float(0.0),
    float(1.0),
  )
    .mul(liveEnergyGate)
    .mul(float(RAYMARCH_LIVE_RESIDUAL_GAIN));

  field.addAssign(residualField.mul(residualAuthority));
}

function accumulateDirectModalField({
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  modalFieldActiveCount,
  localPosition,
  uRadius,
  boundaryMode,
  cavityGeometry,
  spectralLightEnabled,
  field,
  gradX,
  gradY,
  gradZ,
  colorSum,
  colorWeight,
  uTime,
  unsignedSupport,
}) {
  If(modalFieldActiveCount.greaterThan(0), () => {
    accumulateModalField({
      buffer: modalFieldModeBuffer,
      colorBuffer: modalFieldColorBuffer,
      capacity: modalFieldCapacity,
      activeCount: modalFieldActiveCount,
      localPosition,
      uRadius,
      boundaryMode,
      cavityGeometry,
      enableColorAccumulation: spectralLightEnabled,
      field,
      gradX,
      gradY,
      gradZ,
      colorSum,
      colorWeight,
      phaseBuffer: modalFieldPhaseBuffer,
      uTime,
      unsignedSupport,
    });
  });
}

function accumulateDirectModalFieldColorOnly({
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldCapacity,
  modalFieldActiveCount,
  localPosition,
  uRadius,
  boundaryMode,
  cavityGeometry,
  spectralLightEnabled,
  colorSum,
  colorWeight,
}) {
  If(spectralLightEnabled.greaterThan(0.5), () => {
    If(modalFieldActiveCount.greaterThan(0), () => {
      accumulateModalFieldColorOnly({
        buffer: modalFieldModeBuffer,
        colorBuffer: modalFieldColorBuffer,
        capacity: modalFieldCapacity,
        activeCount: modalFieldActiveCount,
        localPosition,
        uRadius,
        boundaryMode,
        cavityGeometry,
        colorSum,
        colorWeight,
      });
    });
  });
}

function sampleFieldGradientNormalNode({
  localPosition,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  modalFieldActiveCount,
  uRadius,
  boundaryMode,
  cavityGeometry,
  effectiveFieldTexture,
  directFieldEvaluationEnabled,
  uTime,
}) {
  const sampleGradient = vec3(0.0).toVar();

  if (effectiveFieldTexture) {
    const normalizedSamplePosition = localPosition.div(uRadius);
    const cacheUv = clamp(
      normalizedSamplePosition.mul(float(0.5)).add(vec3(0.5)),
      vec3(0.0),
      vec3(1.0),
    );
    const cachedSample = texture3D(effectiveFieldTexture).sample(cacheUv);
    sampleGradient.assign(vec3(cachedSample.y, cachedSample.z, cachedSample.w));
  } else if (directFieldEvaluationEnabled) {
    const sampleField = float(0.0).toVar();
    const sampleGradX = float(0.0).toVar();
    const sampleGradY = float(0.0).toVar();
    const sampleGradZ = float(0.0).toVar();
    accumulateModalField({
      buffer: modalFieldModeBuffer,
      colorBuffer: modalFieldColorBuffer,
      capacity: modalFieldCapacity,
      activeCount: modalFieldActiveCount,
      localPosition,
      uRadius,
      boundaryMode,
      cavityGeometry,
      enableColorAccumulation: null,
      field: sampleField,
      gradX: sampleGradX,
      gradY: sampleGradY,
      gradZ: sampleGradZ,
      colorSum: null,
      colorWeight: null,
      phaseBuffer: modalFieldPhaseBuffer,
      uTime,
    });
    sampleGradient.assign(vec3(sampleGradX, sampleGradY, sampleGradZ));
  }

  return sampleGradient.div(max(length(sampleGradient), float(1e-4)));
}

function deriveOpticalConvergenceAuthorityNode({
  localPosition,
  tangent1,
  tangent2,
  sampleStep,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer,
  modalFieldCapacity,
  modalFieldActiveCount,
  uRadius,
  boundaryMode,
  cavityGeometry,
  effectiveFieldTexture,
  directFieldEvaluationEnabled,
  uTime,
}) {
  const normalPositiveT1 = sampleFieldGradientNormalNode({
    localPosition: localPosition.add(tangent1.mul(sampleStep)),
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    modalFieldActiveCount,
    uRadius,
    boundaryMode,
    cavityGeometry,
    effectiveFieldTexture,
    directFieldEvaluationEnabled,
    uTime,
  });
  const normalNegativeT1 = sampleFieldGradientNormalNode({
    localPosition: localPosition.sub(tangent1.mul(sampleStep)),
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    modalFieldActiveCount,
    uRadius,
    boundaryMode,
    cavityGeometry,
    effectiveFieldTexture,
    directFieldEvaluationEnabled,
    uTime,
  });
  const normalPositiveT2 = sampleFieldGradientNormalNode({
    localPosition: localPosition.add(tangent2.mul(sampleStep)),
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    modalFieldActiveCount,
    uRadius,
    boundaryMode,
    cavityGeometry,
    effectiveFieldTexture,
    directFieldEvaluationEnabled,
    uTime,
  });
  const normalNegativeT2 = sampleFieldGradientNormalNode({
    localPosition: localPosition.sub(tangent2.mul(sampleStep)),
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldPhaseBuffer,
    modalFieldCapacity,
    modalFieldActiveCount,
    uRadius,
    boundaryMode,
    cavityGeometry,
    effectiveFieldTexture,
    directFieldEvaluationEnabled,
    uTime,
  });
  const viewPlaneNormalConvergence = dot(
    normalPositiveT1.sub(normalNegativeT1),
    tangent1,
  )
    .add(dot(normalPositiveT2.sub(normalNegativeT2), tangent2))
    .mul(float(-0.5));

  return clamp(
    max(float(0.0), viewPlaneNormalConvergence),
    float(0.0),
    float(1.0),
  );
}

function createScatteringNode({
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer = null,
  modalFieldCapacity,
  uniforms,
  boundaryMode = BOUNDARY_MODES.neumann,
  cavityGeometry = "rectangular",
  fieldEvaluationMode = "effective-cached",
  effectiveFieldTexture = null,
  effectiveFieldSupportTexture = null,
  spectralLightCacheTexture = null,
  spectralLightEvaluationMode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
}) {
  const {
    uRadius,
    uTime,
    uThreshold,
    uAverageAmplitude,
    uRaymarchSteps,
    uModalFieldModeCount,
    uColor,
    uSurfaceColor,
    uSpectralMix,
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
    uPulseSignal,
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
    uModalResponseEnergy,
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
  const effectiveFieldSampleResolution =
    effectiveFieldTexture?.image?.width ?? RAYMARCH_EFFECTIVE_FIELD_RESOLUTION;
  const spectralColorBiasHintOffset = uModeCoherence
    .mul(0.05)
    .add(uModalResponseEnergy.mul(0.08))
    .sub(uChangeSignal.mul(0.08));
  const modalCoefficientEnergy = clamp(
    uTotalSlotAmplitude,
    float(0.0),
    float(1.0),
  );
  // Excitation gate: 0 when field is under-excited (weak/noisy input), 1 when
  // fully excited. Render-eligible modal coefficients are authoritative here.
  // Hoisted as loop-invariant.
  const excitationInput = uAverageAmplitude
    .div(float(255.0))
    .mul(float(0.3))
    .add(uStructureSignal.mul(float(0.45)))
    .add(uModalResponseEnergy.mul(float(0.25)))
    .add(modalCoefficientEnergy.mul(float(0.18)));
  const excitationGate = smoothstep(
    float(EXCITATION_GATE_LOW),
    float(EXCITATION_GATE_HIGH),
    excitationInput,
  );
  const modalAuthorityEnergy = max(
    uModalResponseEnergy,
    modalCoefficientEnergy,
  );
  const excitationSourceAuthority = smoothstep(
    float(EXCITATION_VISIBILITY_SOURCE_AUTHORITY_START),
    float(EXCITATION_VISIBILITY_SOURCE_AUTHORITY_END),
    max(
      uAverageAmplitude.div(float(255.0)),
      modalAuthorityEnergy.mul(
        float(EXCITATION_VISIBILITY_MODAL_SOURCE_AUTHORITY_WEIGHT),
      ),
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
    ).mul(excitationSourceAuthority),
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
      // High energy = tighter boundary (more solid); low energy = diffuse, ghostly
      const edgeFade = float(1.0).sub(
        smoothstep(dynamicEdgeFadeStart, float(EDGE_FADE_END), radialDistance),
      );
      const field = float(0.0).toVar();
      const gradX = float(0.0).toVar();
      const gradY = float(0.0).toVar();
      const gradZ = float(0.0).toVar();
      const effectiveUnsignedSupport = float(0.0).toVar();
      const effectiveCancellationRatio = float(0.0).toVar();
      const colorSum = vec3(0.0).toVar();
      const colorWeight = float(0.0).toVar();
      const spectralLightEnabled = smoothstep(
        float(0.0),
        float(1e-4),
        uSpectralMix,
      );
      const directSpectralLightEnabled =
        spectralLightEvaluationMode ===
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
      const cachedSpectralLightEnabled =
        spectralLightEvaluationMode ===
          RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached &&
        Boolean(spectralLightCacheTexture);
      const spectralLightModeEnabled =
        directSpectralLightEnabled || cachedSpectralLightEnabled;
      const directFieldEvaluationEnabled = fieldEvaluationMode === "direct";
      const modalFieldActiveCount = int(uModalFieldModeCount);
      const amplitudeNorm = max(uTotalSlotAmplitude, float(0.01));
      const cacheUv = clamp(
        normalizedPosition.mul(float(0.5)).add(vec3(0.5)),
        vec3(0.0),
        vec3(1.0),
      );
      if (effectiveFieldTexture) {
        const cachedSample = texture3D(effectiveFieldTexture).sample(cacheUv);
        field.assign(cachedSample.x);
        gradX.assign(cachedSample.y);
        gradY.assign(cachedSample.z);
        gradZ.assign(cachedSample.w);
        if (effectiveFieldSupportTexture) {
          const effectiveFieldSupportSample = texture3D(
            effectiveFieldSupportTexture,
          ).sample(cacheUv);
          effectiveUnsignedSupport.assign(effectiveFieldSupportSample.x);
          effectiveCancellationRatio.assign(effectiveFieldSupportSample.y);
        }

        accumulateCachedLiveResidual({
          modalFieldModeBuffer,
          modalFieldPhaseBuffer,
          modalFieldCapacity,
          modalFieldActiveCount,
          localPosition,
          uRadius,
          boundaryMode,
          cavityGeometry,
          field,
          uTime,
          effectiveUnsignedSupport,
          uTransientEnergy,
          uPulseSignal,
          uModalResponseEnergy,
        });

        if (cachedSpectralLightEnabled) {
          const cachedSpectralLightSample = texture3D(
            spectralLightCacheTexture,
          ).sample(cacheUv);
          colorSum.assign(cachedSpectralLightSample.xyz);
          colorWeight.assign(cachedSpectralLightSample.w);
        } else if (directSpectralLightEnabled) {
          accumulateDirectModalFieldColorOnly({
            modalFieldModeBuffer,
            modalFieldColorBuffer,
            modalFieldCapacity,
            modalFieldActiveCount,
            localPosition,
            uRadius,
            boundaryMode,
            cavityGeometry,
            spectralLightEnabled,
            colorSum,
            colorWeight,
          });
        }
      } else if (directFieldEvaluationEnabled) {
        accumulateDirectModalField({
          modalFieldModeBuffer,
          modalFieldColorBuffer,
          modalFieldPhaseBuffer,
          modalFieldCapacity,
          modalFieldActiveCount,
          localPosition,
          uRadius,
          boundaryMode,
          cavityGeometry,
          spectralLightEnabled: directSpectralLightEnabled
            ? spectralLightEnabled
            : float(0.0),
          field,
          gradX,
          gradY,
          gradZ,
          colorSum,
          colorWeight,
          uTime,
          unsignedSupport: effectiveUnsignedSupport,
        });
        if (cachedSpectralLightEnabled) {
          const cachedSpectralLightSample = texture3D(
            spectralLightCacheTexture,
          ).sample(cacheUv);
          colorSum.assign(cachedSpectralLightSample.xyz);
          colorWeight.assign(cachedSpectralLightSample.w);
        }
        const normalizedDirectSupport = effectiveUnsignedSupport
          .div(amplitudeNorm)
          .toVar();
        effectiveUnsignedSupport.assign(normalizedDirectSupport);
        const normalizedDirectFieldAbs = abs(field.div(amplitudeNorm));
        effectiveCancellationRatio.assign(
          clamp(
            float(1.0).sub(
              normalizedDirectFieldAbs.div(
                max(normalizedDirectSupport, float(0.01)),
              ),
            ),
            float(0.0),
            float(1.0),
          ),
        );
      }

      const effectiveField = field;
      const fieldAbs = abs(effectiveField);
      const gradient = vec3(gradX, gradY, gradZ).toVar();
      const gradientMagnitude = length(gradient);
      const gradientNormal = gradient.div(max(gradientMagnitude, float(1e-4)));
      const effectiveGradientMagnitude = gradientMagnitude;
      // Effective field textures are pre-normalized by their modal amplitude
      // during compute, so product cached rendering can stay stable across
      // envelope-only amplitude changes without falling back to direct raymarch
      // evaluation.
      const normalizedFieldAbs = effectiveFieldTexture
        ? fieldAbs
        : fieldAbs.div(amplitudeNorm);
      const normalizedGradMagnitude = effectiveFieldTexture
        ? effectiveGradientMagnitude
        : gradientMagnitude.div(amplitudeNorm);
      const localGradientEvidence = clamp(
        normalizedGradMagnitude,
        float(0.0),
        float(1.0),
      );
      const modalFieldCount = float(uModalFieldModeCount);
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
      const shellWeight = mix(
        float(SHELL_WEIGHT_MIN),
        float(SHELL_WEIGHT_MAX),
        smoothstep(
          float(SHELL_WEIGHT_START),
          float(SHELL_WEIGHT_END),
          radialDistance,
        ),
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
          .mul(float(EFFECTIVE_FIELD_CANCELLATION_SUPPRESSION_SCALE)),
      );
      const localFieldSupportAuthority = clamp(
        effectiveUnsignedSupport,
        float(0.0),
        float(1.0),
      );
      const activeMask = smoothstep(float(0.0), float(1.0), modalFieldCount);
      // Beat pulse drives a visible density surge through the volume
      const densityMod = float(1.0)
        .add(uTransientEnergy.mul(0.3))
        .add(uSpectralFlux.mul(0.2))
        .add(uBeatPulse.mul(0.35));
      const boundaryMask = smoothstep(
        float(RAYMARCH_BOUNDARY_START),
        float(RAYMARCH_BOUNDARY_END),
        radialDistance,
      );
      // Strong local field evidence opens up the interior — more inner detail visible
      const interiorMask = float(1.0).sub(
        smoothstep(
          dynamicInteriorMaskStart,
          float(INTERIOR_MASK_END),
          radialDistance,
        ),
      );
      // Reduce body fill when treble is incoherent (broadband hiss/cymbal noise
      // with low modal coherence). Max 45% body reduction — prevents diffuse white fog
      // from high-freq noise without suppressing tonal treble structure.
      const incoherentTrebleSuppression = float(1.0).sub(
        uTrebleBroadbandEnergy
          .mul(float(1.0).sub(uModeCoherence))
          .mul(float(INCOHERENT_TREBLE_BODY_SUPPRESSION_MAX)),
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
      const supportStructureAuthority =
        localFieldSupportAuthority.mul(modalStructureSupport);
      const causticFocusAuthority = clamp(
        max(
          max(
            gradientFieldAuthority.mul(modalStructureSupport),
            shellFocus.mul(modalStructureSupport).mul(shellFieldAuthority),
          ),
          shellFocus.mul(supportStructureAuthority),
        ),
        float(0.0),
        float(1.0),
      );
      const causticRidgeAuthority = clamp(
        causticFocusAuthority
          .mul(edgeFade)
          .mul(activeMask),
        float(0.0),
        float(1.0),
      );
      const causticVisibility =
        causticRidgeAuthority.mul(cancellationSuppression);
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
      const opticalSlopeAuthority = clamp(
        float(1.0)
          .sub(abs(dot(gradientNormal, viewDirLocal.negate())))
          .pow(float(OPTICAL_SLOPE_POWER))
          .mul(localGradientEvidence),
        float(0.0),
        float(1.0),
      );
      const viewDirection = viewDirLocal.normalize().toVar();
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
      const tangent2 = cross(viewDirection, tangent1).normalize();
      const convergenceSampleStep = effectiveFieldTexture
        ? uRadius.mul(float(2.0)).div(float(effectiveFieldSampleResolution))
        : uRadius.mul(float(2.0)).div(max(uRaymarchSteps, float(1.0)));
      const opticalConvergenceAuthority = deriveOpticalConvergenceAuthorityNode(
        {
          localPosition,
          tangent1,
          tangent2,
          sampleStep: convergenceSampleStep,
          modalFieldModeBuffer,
          modalFieldColorBuffer,
          modalFieldPhaseBuffer,
          modalFieldCapacity,
          modalFieldActiveCount,
          uRadius,
          boundaryMode,
          cavityGeometry,
          effectiveFieldTexture,
          directFieldEvaluationEnabled,
          uTime,
        },
      );
      const opticalFocusAuthority = clamp(
        causticRidgeAuthority
          .mul(
            float(1.0).add(
              opticalSlopeAuthority.mul(opticalConvergenceAuthority),
            ),
          )
          .mul(
            float(1.0).add(
              ridgeConcentration.mul(opticalConvergenceAuthority),
            ),
          ),
        float(0.0),
        float(1.0),
      );
      const opticalFocus = /** @type {any} */ (opticalFocusAuthority).pow(
        float(OPTICAL_FOCUS_POWER),
      );
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
      const photographicShellAuthority = clamp(
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
      const hotCoreCrowding = hotCoreBodyCrowdingGate
        .mul(float(0.35).add(hotCoreRidgeRelief.mul(float(0.65))))
        .mul(hotCoreTransientRelief);
      const whiteEmissionCrowding = hotCoreBodyCrowdingGate
        .mul(float(0.35).add(hotCoreRidgeRelief.mul(float(0.65))))
        .mul(whiteEmissionTransientRelief);
      const localHotCoreStart = hotCoreStartDynamic.add(
        hotCoreCrowding.mul(float(HOT_CORE_CROWDING_THRESHOLD_LIFT)),
      );
      const density = clamp(
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
        density,
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
      const { visibleDensity } = observationTransfer;
      const observedContourSupport = observationTransfer.observedContourSupport;
      const highlightMask = smoothstep(
        float(HIGHLIGHT_MASK_START),
        float(HIGHLIGHT_MASK_END),
        visibleDensity,
      );
      const stabilizedDensity = visibleDensity;
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
      const spectralLightColorGate = clamp(
        max(
          localFieldSupportAuthority.mul(cancellationSuppression),
          causticVisibility,
        ),
        float(0.0),
        float(1.0),
      );
      const staticBaseColor = mix(
        uColor,
        uSurfaceColor,
        spectralColorBias.mul(float(STATIC_SURFACE_TINT_SCALE)),
      );
      const spectralColor = colorSum.div(colorWeight.max(float(1e-4)));
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
      const hotCoreMix = smoothstep(
        localHotCoreStart,
        float(HOT_CORE_END),
        /** @type {any} */ (
          photographicLaserCausticRadiance
            .mul(contourMix.mul(float(0.14)).add(float(0.76)))
            .mul(float(0.72).add(photographicFocus.mul(float(0.28))))
            .add(highlightMask.mul(float(0.12)))
            .add(uTransientEnergy.mul(float(0.08)))
            .div(
              float(1.0).add(
                photographicLaserCausticRadiance
                  .mul(contourMix.mul(float(0.14)).add(float(0.76)))
                  .mul(float(0.72).add(photographicFocus.mul(float(0.28))))
                  .add(highlightMask.mul(float(0.12)))
                  .add(uTransientEnergy.mul(float(0.08)))
                  .mul(float(0.22)),
              ),
            )
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
        float(1.0)
          .sub(abs(dot(gradientNormal, viewDirLocal.negate())))
          .pow(max(uHolographicFresnelPower, float(0.01))),
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
      const crowdedWhiteEmissionMix = holographicEmissionLift
        .mul(
          float(1.0).sub(
            whiteEmissionCrowding.mul(float(WHITE_EMISSION_CROWDING_REDUCTION)),
          ),
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
      const activityAccent = smoothstep(float(0.0), float(1.0), modalFieldCount);
      const staticVolumeColor = mix(
        staticHolographicLaserColor.mul(float(0.9)),
        staticHolographicLaserColor,
        activityAccent,
      );
      const volumeColor = staticVolumeColor.toVar();
      if (spectralLightModeEnabled) {
        If(spectralLightEnabled.greaterThan(0.5), () => {
          const spectralLightPresenceEnd = float(
            cachedSpectralLightEnabled
              ? RAYMARCH_SPECTRAL_LIGHT_TUNING.cachedPresenceEnd
              : RAYMARCH_SPECTRAL_LIGHT_TUNING.directPresenceEnd,
          );
          const spectralLightPresence = smoothstep(
            float(0.0),
            spectralLightPresenceEnd,
            colorWeight,
          );
          const spectralLightWeight = clamp(
            uSpectralMix
              .mul(spectralLightPresence)
              .mul(spectralLightColorGate),
            float(0.0),
            float(1.0),
          );
          const spectralLightUncoloredColor = vec3(
            float(RAYMARCH_SPECTRAL_LIGHT_TUNING.uncoloredNeutralLift),
          );
          const spectralLightContourColor = mix(
            spectralColor.mul(
              float(RAYMARCH_SPECTRAL_LIGHT_TUNING.contourShadow),
            ),
            spectralColor,
            /** @type {any} */ (contourAccent),
          );
          const spectralLightLaserColor = mix(
            spectralLightContourColor,
            spectralColor,
            crowdedHotCoreMix
              .mul(float(RAYMARCH_SPECTRAL_LIGHT_TUNING.hotCoreSurfacePull))
              .mul(boundarySurfacePull),
          );
          const spectralLightHolographicAccentColor = mix(
            spectralColor,
            holographicAccentColor,
            float(RAYMARCH_SPECTRAL_LIGHT_TUNING.holographicAccentColorPull),
          );
          const spectralLightHolographicColor = mix(
            spectralLightLaserColor,
            spectralLightHolographicAccentColor,
            /** @type {any} */ (
              holographicColorMix.mul(
                float(RAYMARCH_SPECTRAL_LIGHT_TUNING.holographicAccentMix),
              )
            ),
          );
          const spectralLightWhiteEmissionMix = crowdedWhiteEmissionMix
            .mul(float(RAYMARCH_SPECTRAL_LIGHT_TUNING.whiteEmissionLift))
            .mul(boundaryWhiteEmission);
          const spectralLightHolographicLaserColor = deriveHighlightTargetNode(
            spectralLightHolographicColor,
            uSurfaceColor,
            spectralLightWhiteEmissionMix,
          );
          const spectralLightVolumeColor = mix(
            spectralLightHolographicLaserColor.mul(float(0.9)),
            spectralLightHolographicLaserColor,
            activityAccent,
          );
          const spectralLightTintedRadiance = mix(
            spectralLightUncoloredColor,
            spectralLightVolumeColor,
            spectralLightWeight,
          );
          const spectralLightBaseRadiance = uColor.mul(
            float(RAYMARCH_SPECTRAL_LIGHT_TUNING.baseRadianceLift),
          );
          volumeColor.assign(
            spectralLightTintedRadiance.add(spectralLightBaseRadiance),
          );
        });
      }

      return volumeColor.mul(stabilizedDensity).mul(structureAwareEmissionGain);
    },
  );
}

function deriveObservationTransferNode(
  density,
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
    density,
  );
  const physicalVisibleDensity = density.mul(physicalVisibilityGate);
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
      exp(
        observationResponse
          .mul(observationAnchor)
          .mul(observationTransferGain.negate()),
      ),
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

  return {
    physicalVisibilityGate,
    physicalVisibleDensity,
    observationAnchor,
    observationEnergy,
    observationResponse,
    observationSupport,
    observedDensityFloor,
    observedContourSupport,
    visibleDensity: max(physicalVisibleDensity, observedDensityFloor),
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

export function createRaymarchVolumeMesh({
  radius,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer = null,
  effectiveFieldTexture = null,
  effectiveFieldSupportTexture = null,
  spectralLightCacheTexture = null,
  capacity = null,
  modalFieldCapacity = capacity ?? 0,
  uniforms,
  cavityGeometry = "rectangular",
}) {
  // SphereGeometry instead of BoxGeometry: vertex velocities land on the actual
  // sphere surface, so TRAA's interpolated velocity at each fragment closely matches
  // the true sphere-surface motion during mesh rotation. BoxGeometry corners sit at
  // depth sqrt(3)*radius ≈ 1.73r — far from the sphere surface — causing reprojection
  // errors that blur the history buffer during rotation. Sphere geometry also culls
  // the box corners (~22% fewer fragment invocations).
  // 1% radius padding avoids precision clipping at the silhouette.
  const geometry = new THREE.SphereGeometry(radius * 1.01, 32, 32);
  const sharedOffsetNode = createRaymarchOffsetNode();
  const createMaterialForBoundaryMode = (
    boundaryMode,
    fieldEvaluationMode,
    spectralLightEvaluationMode,
    materialCavityGeometry,
  ) => {
    const material = /** @type {BaryonVolumeMaterial} */ (
      new BaryonVolumeNodeMaterial()
    );
    material.transparent = true;
    material.blending = THREE.NormalBlending;
    material.outputNode = vec4(raymarchLightNode, raymarchOpacityNode);
    material.steps = Math.round(uniforms.uRaymarchSteps.value);
    material.radiusNode = uniforms.uRadius;
    material.opacityGainNode = uniforms.uOpacityGain;
    material.offsetNode = sharedOffsetNode;
    material.scatteringNode = createScatteringNode({
      modalFieldModeBuffer,
      modalFieldColorBuffer,
      modalFieldPhaseBuffer,
      modalFieldCapacity,
      uniforms,
      boundaryMode,
      cavityGeometry: materialCavityGeometry,
      fieldEvaluationMode,
      effectiveFieldTexture:
        fieldEvaluationMode === "effective-cached"
          ? effectiveFieldTexture
          : null,
      effectiveFieldSupportTexture:
        fieldEvaluationMode === "effective-cached"
          ? effectiveFieldSupportTexture
          : null,
      spectralLightCacheTexture:
        spectralLightEvaluationMode ===
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached
          ? spectralLightCacheTexture
          : null,
      spectralLightEvaluationMode,
    });
    material.fieldEvaluationMode = fieldEvaluationMode;
    material.spectralLightEvaluationMode = spectralLightEvaluationMode;
    material.effectiveFieldTexture =
      fieldEvaluationMode === "effective-cached" ? effectiveFieldTexture : null;
    material.effectiveFieldSupportTexture =
      fieldEvaluationMode === "effective-cached"
        ? effectiveFieldSupportTexture
        : null;
    return material;
  };
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const initialFieldEvaluationMode = "effective-cached";
  const initialSpectralLightEvaluationMode =
    RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  const materialCache = {
    [BOUNDARY_MODES.dirichlet]: {
      direct: {},
      "effective-cached": {
        [initialSpectralLightEvaluationMode]: {
          [normalizedCavityGeometry]: createMaterialForBoundaryMode(
            BOUNDARY_MODES.dirichlet,
            initialFieldEvaluationMode,
            initialSpectralLightEvaluationMode,
            normalizedCavityGeometry,
          ),
        },
      },
    },
    [BOUNDARY_MODES.neumann]: {
      direct: {},
      "effective-cached": {
        [initialSpectralLightEvaluationMode]: {
          [normalizedCavityGeometry]: createMaterialForBoundaryMode(
            BOUNDARY_MODES.neumann,
            initialFieldEvaluationMode,
            initialSpectralLightEvaluationMode,
            normalizedCavityGeometry,
          ),
        },
      },
    },
  };
  const mesh = new THREE.Mesh(
    geometry,
    materialCache[BOUNDARY_MODES.neumann]["effective-cached"][
      initialSpectralLightEvaluationMode
    ][normalizedCavityGeometry],
  );
  mesh.userData.raymarchMaterialCache = materialCache;
  mesh.userData.raymarchCreateMaterialVariant = createMaterialForBoundaryMode;
  mesh.userData.raymarchBoundaryMode = BOUNDARY_MODES.neumann;
  mesh.userData.raymarchFieldEvaluationMode = initialFieldEvaluationMode;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    initialSpectralLightEvaluationMode;
  mesh.userData.raymarchEffectiveFieldTexture = effectiveFieldTexture;
  mesh.userData.raymarchEffectiveFieldSupportTexture =
    effectiveFieldSupportTexture;
  mesh.userData.raymarchCavityGeometry = normalizedCavityGeometry;
  mesh.frustumCulled = false;

  return mesh;
}

export function getRaymarchMaterialCache(mesh) {
  return mesh?.userData?.raymarchMaterialCache ?? null;
}

function getOrCreateRaymarchMaterial(
  mesh,
  boundaryMode,
  fieldEvaluationMode,
  spectralLightEvaluationMode,
  cavityGeometry,
) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return null;
  }

  const boundaryMaterials = materialCache[boundaryMode];
  if (!boundaryMaterials) {
    return null;
  }

  const normalizedFieldEvaluationMode =
    normalizeFieldEvaluationMode(fieldEvaluationMode);
  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const spectralLightMaterials =
    boundaryMaterials[normalizedFieldEvaluationMode] ??
    (boundaryMaterials[normalizedFieldEvaluationMode] = {});
  const geometryMaterials =
    spectralLightMaterials[normalizedSpectralLightEvaluationMode] ??
    (spectralLightMaterials[normalizedSpectralLightEvaluationMode] = {});
  if (geometryMaterials[normalizedCavityGeometry]) {
    return geometryMaterials[normalizedCavityGeometry];
  }

  const createMaterialVariant = mesh?.userData?.raymarchCreateMaterialVariant;
  if (typeof createMaterialVariant !== "function") {
    return null;
  }

  const material = createMaterialVariant(
    boundaryMode,
    normalizedFieldEvaluationMode,
    normalizedSpectralLightEvaluationMode,
    normalizedCavityGeometry,
  );
  geometryMaterials[normalizedCavityGeometry] = material;
  return material;
}

export function setRaymarchBoundaryMode(mesh, boundaryMode) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return;
  }

  const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
  const normalizedCavityGeometry = normalizeCavityGeometry(
    mesh?.userData?.raymarchCavityGeometry,
  );
  const fieldEvaluationMode = normalizeFieldEvaluationMode(
    mesh?.userData?.raymarchFieldEvaluationMode,
  );
  const spectralLightEvaluationMode = normalizeSpectralLightEvaluationMode(
    mesh?.userData?.raymarchSpectralLightEvaluationMode,
  );
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    fieldEvaluationMode,
    spectralLightEvaluationMode,
    normalizedCavityGeometry,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchBoundaryMode = normalizedBoundaryMode;
    return;
  }

  const currentMaterial = mesh.material;
  nextMaterial.steps = currentMaterial?.steps ?? nextMaterial.steps;
  mesh.material = nextMaterial;
  mesh.userData.raymarchBoundaryMode = normalizedBoundaryMode;
}

export function setRaymarchFieldEvaluationMode(mesh, fieldEvaluationMode) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return;
  }

  const normalizedFieldEvaluationMode =
    normalizeFieldEvaluationMode(fieldEvaluationMode);
  const normalizedBoundaryMode = normalizeBoundaryMode(
    mesh?.userData?.raymarchBoundaryMode,
  );
  const normalizedCavityGeometry = normalizeCavityGeometry(
    mesh?.userData?.raymarchCavityGeometry,
  );
  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(
      mesh?.userData?.raymarchSpectralLightEvaluationMode,
    );
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    normalizedFieldEvaluationMode,
    normalizedSpectralLightEvaluationMode,
    normalizedCavityGeometry,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchFieldEvaluationMode = normalizedFieldEvaluationMode;
    return;
  }

  const currentMaterial = mesh.material;
  nextMaterial.steps = currentMaterial?.steps ?? nextMaterial.steps;
  mesh.material = nextMaterial;
  mesh.userData.raymarchFieldEvaluationMode = normalizedFieldEvaluationMode;
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
  const normalizedFieldEvaluationMode = normalizeFieldEvaluationMode(
    mesh?.userData?.raymarchFieldEvaluationMode,
  );
  const normalizedCavityGeometry = normalizeCavityGeometry(
    mesh?.userData?.raymarchCavityGeometry,
  );
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    normalizedFieldEvaluationMode,
    normalizedSpectralLightEvaluationMode,
    normalizedCavityGeometry,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchSpectralLightEvaluationMode =
      normalizedSpectralLightEvaluationMode;
    return;
  }

  const currentMaterial = mesh.material;
  nextMaterial.steps = currentMaterial?.steps ?? nextMaterial.steps;
  mesh.material = nextMaterial;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    normalizedSpectralLightEvaluationMode;
}

export function setRaymarchCavityGeometry(mesh, cavityGeometry) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    return;
  }

  const normalizedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  const normalizedBoundaryMode = normalizeBoundaryMode(
    mesh?.userData?.raymarchBoundaryMode,
  );
  const normalizedFieldEvaluationMode = normalizeFieldEvaluationMode(
    mesh?.userData?.raymarchFieldEvaluationMode,
  );
  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(
      mesh?.userData?.raymarchSpectralLightEvaluationMode,
    );
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    normalizedFieldEvaluationMode,
    normalizedSpectralLightEvaluationMode,
    normalizedCavityGeometry,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchCavityGeometry = normalizedCavityGeometry;
    return;
  }

  const currentMaterial = mesh.material;
  nextMaterial.steps = currentMaterial?.steps ?? nextMaterial.steps;
  mesh.material = nextMaterial;
  mesh.userData.raymarchCavityGeometry = normalizedCavityGeometry;
}

export function syncRaymarchMaterialSteps(mesh, steps) {
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    if (mesh?.material) {
      mesh.material.steps = steps;
    }
    return;
  }

  Object.values(materialCache).forEach((boundaryMaterials) => {
    Object.values(boundaryMaterials).forEach((spectralLightMaterials) => {
      if (
        !spectralLightMaterials ||
        typeof spectralLightMaterials !== "object"
      ) {
        return;
      }
      Object.values(spectralLightMaterials).forEach((geometryMaterials) => {
        if (!geometryMaterials || typeof geometryMaterials !== "object") {
          return;
        }
        Object.values(geometryMaterials).forEach((material) => {
          if (material) {
            material.steps = steps;
          }
        });
      });
    });
  });
}

export function createIdleOverlay({ baryonGeometry, uniforms }) {
  const geometry = new THREE.EdgesGeometry(baryonGeometry);
  const overlay = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: uniforms.uSurfaceColor.value.clone(),
      transparent: true,
      opacity: uniforms.uIdleLogoAlpha.value,
    }),
  );
  overlay.scale.setScalar(uniforms.uIdleLogoSize.value);
  overlay.frustumCulled = false;

  return overlay;
}
