import * as THREE from "three";
import { VolumeNodeMaterial } from "three/webgpu";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  If,
  Loop,
  clamp,
  dot,
  float,
  max,
  mix,
  modelWorldMatrixInverse,
  int,
  texture3D,
  vec3,
  vec4,
} from "three/tsl";
import { MODAL_BASIS_CACHE_ENERGY_EPSILON } from "./fieldCache.js";
import SafeVolumetricLightingModel, {
  createSafeVolumetricOutputNode,
} from "./SafeVolumetricLightingModel.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import { BOUNDARY_MODES, normalizeBoundaryMode } from "../modeFamily.js";
import { VOLUME_SHAPES, normalizeVolumeShape } from "../volumeShape.js";
import { SPECTRAL_LIGHT_LANE_DISPLAY_RGB } from "../../utils/audio/spectralLight.js";
import { deriveFixedWorldSpaceCarrierDensityNode } from "./carrierDensityNode.js";
import {
  deriveAcousticEnergyMaterialTransferNode,
  deriveBoundedCausticAccentAuthorityNode,
} from "./observationTransferNode.js";
import { LASER_REFERENCE_APPARATUS_PROFILE } from "./laserTransport.js";
import {
  REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  REFERENCE_SCATTERING_COEFFICIENT,
} from "./observationTransfer.js";
import { RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT } from "./fieldCache.js";

/** @typedef {"dirichlet" | "neumann"} BoundaryMode */
/** @typedef {import("../volumeShape.js").VolumeShape} VolumeShape */

const DEFAULT_VOLUME_SHAPE = /** @type {VolumeShape} */ (VOLUME_SHAPES.sphere);

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
 *   rayDirLocal: any,
 *   stepSize: any
 * }} ScatteringNodeInputs
 */

/**
 * @typedef {import("three/webgpu").VolumeNodeMaterial & {
 *   steps: number,
 *   radiusNode?: any,
 *   domainHalfExtentsNode?: any,
 *   scatteringNode?: any,
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
 *   raymarchVolumeShape?: VolumeShape,
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

  return {
    field: basisSample.x,
    gradient: vec3(basisSample.y, basisSample.z, basisSample.w),
  };
}

function sampleLiveFieldProjectionCacheNode({
  basisUv,
  modalLiveFieldTexture,
}) {
  const fieldSample = texture3D(modalLiveFieldTexture).sample(basisUv);

  // One texture stores the matched linear pressure/gradient tuple. The local
  // zero-set distance is invariant to amplitude only when both quantities have
  // undergone exactly the same normalization.
  return {
    field: fieldSample.x,
    gradient: vec3(fieldSample.y, fieldSample.z, fieldSample.w),
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
    detectorIntegratedSpatialEnergy: clamp(
      interferenceSample.y,
      float(0.0),
      float(1.0),
    ),
    authority: clamp(interferenceSample.z, float(0.0), float(1.0)),
    independentSpatialEnergy: clamp(
      interferenceSample.w,
      float(0.0),
      float(1.0),
    ),
  };
}

const LINEAR_RGB_LUMINANCE = Object.freeze([0.2126, 0.7152, 0.0722]);

function normalizeMaterialChromaticityNode(color) {
  const nonnegativeColor = max(color, vec3(0.0));
  const luminance = dot(
    nonnegativeColor,
    vec3(
      float(LINEAR_RGB_LUMINANCE[0]),
      float(LINEAR_RGB_LUMINANCE[1]),
      float(LINEAR_RGB_LUMINANCE[2]),
    ),
  );
  return nonnegativeColor.div(max(luminance, float(1e-6)));
}

function projectSpectralLaneRadianceToRgbNode({
  laneA,
  laneB,
  total,
  fallbackColor,
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
  const safeTotal = max(total, float(1e-6));
  const spectralRgb = laneRgbNode0
    .mul(laneA.x)
    .add(laneRgbNode1.mul(laneA.y))
    .add(laneRgbNode2.mul(laneA.z))
    .add(laneRgbNode3.mul(laneA.w))
    .add(laneRgbNode4.mul(laneB.x))
    .add(laneRgbNode5.mul(laneB.y))
    .add(laneRgbNode6.mul(laneB.z))
    .add(laneRgbNode7.mul(laneB.w))
    .div(safeTotal);
  const spectralChromaticity = normalizeMaterialChromaticityNode(spectralRgb);
  const fallbackChromaticity = normalizeMaterialChromaticityNode(fallbackColor);

  // Spectral lanes own chromaticity only. Detector-integrated acoustic energy
  // and laser irradiance own radiance, so changing pitch/lane occupancy cannot
  // silently brighten or dim the same structure.
  return total
    .greaterThan(float(1e-6))
    .select(spectralChromaticity, fallbackChromaticity);
}

function sampleSpectralLaneCacheNode({
  basisUv,
  spectralLaneTextureA,
  spectralLaneTextureB,
  spectralLaneStatsTexture,
  fallbackColor,
}) {
  const laneA = texture3D(spectralLaneTextureA).sample(basisUv);
  const laneB = texture3D(spectralLaneTextureB).sample(basisUv);
  const stats = texture3D(spectralLaneStatsTexture).sample(basisUv);
  const total = max(stats.x, float(0.0));

  return {
    rgb: projectSpectralLaneRadianceToRgbNode({
      laneA,
      laneB,
      total,
      fallbackColor,
    }),
    total,
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
  modalEnergyAmplitude,
  modalBasisAtlasTexture,
  modalFieldModeBuffer,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const field = float(0.0).toVar();
  const gradient = vec3(0.0).toVar();
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
        });
      },
    );
  }

  const normalizedField = field.div(modalEnergyAmplitude).toVar();
  const normalizedGradient = gradient.div(modalEnergyAmplitude).toVar();

  return {
    field: normalizedField,
    gradient: normalizedGradient,
  };
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
 *   volumeShape?: VolumeShape,
 *   modalFieldModeBuffer?: any,
 *   modalFieldCoefficientBuffer?: any,
 *   liveSynthesisModeCount?: number,
 * }} options
 */
function createScatteringNode({
  uniforms,
  modalBasisAtlasTexture = null,
  modalLiveFieldTexture = null,
  modalPhaseInterferenceTexture = null,
  laserIrradianceTexture = null,
  spectralLaneTextureA = null,
  spectralLaneTextureB = null,
  spectralLaneStatsTexture = null,
  spectralLightEvaluationMode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
  modalFieldModeBuffer = null,
  modalFieldCoefficientBuffer = null,
  liveSynthesisModeCount = RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
}) {
  const {
    uRadius,
    uCarrierCoreFwhmWorld,
    uModalFieldModeCount,
    uColor,
    uSurfaceColor,
    uSpectralMix,
    uDensityGain,
    uMaterialAbsorptionCoefficient,
    uModalEnergyAmplitude,
    uStructuralProjectionDrive,
    uCarrierColumnDensityScale,
    uLiveFieldCacheActive,
    uHolographicBaseRadianceGain,
    uHolographicIntensity,
    uHolographicFresnelPower,
    uLaserCausticActive,
  } = uniforms;
  const modalBasisAtlasTextureNode = getTexture3DNode(modalBasisAtlasTexture);
  const modalCoefficientEnergy = clamp(
    uStructuralProjectionDrive,
    float(0.0),
    float(1.0),
  );
  const modalEnergyAmplitude = max(
    uModalEnergyAmplitude,
    float(MODAL_BASIS_CACHE_ENERGY_EPSILON),
  );
  const activeMask = uModalFieldModeCount
    .greaterThan(int(0))
    .select(float(1.0), float(0.0));
  const materialDensityScale = max(uDensityGain, float(0.0)).div(
    float(RAYMARCH_DEFAULTS.densityGain),
  );
  const spectralMix = clamp(uSpectralMix, float(0.0), float(1.0));
  const spectralLaneTransferEnabled = Boolean(
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode) ===
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.laneCache &&
    spectralLaneTextureA &&
    spectralLaneTextureB &&
    spectralLaneStatsTexture,
  );

  // Plain node-graph closure (not Fn): the volume loop consumes separate
  // base and accent source lanes plus one shared extinction per sample, so
  // the sample contract is a struct of nodes rather than one packed vec4.
  return (
    /**
     * @param {ScatteringNodeInputs} args
     */
    ({ positionRay, positionRayLocal, rayDirLocal, stepSize }) => {
      const localPosition =
        positionRayLocal ??
        modelWorldMatrixInverse.mul(vec4(positionRay, 1.0)).xyz;
      const basisUv = getBasisLocalUvNode({
        localPosition,
        uRadius,
      });
      const field = float(0.0).toVar();
      const gradX = float(0.0).toVar();
      const gradY = float(0.0).toVar();
      const gradZ = float(0.0).toVar();
      const phaseInterferenceCarrier = modalPhaseInterferenceTexture
        ? samplePhaseInterferenceCarrierNode({
            basisUv,
            modalPhaseInterferenceTexture,
          })
        : {
            detectorIntegratedSpatialEnergy: float(1.0),
            authority: float(0.0),
            independentSpatialEnergy: float(1.0),
          };
      const phaseEnergyCarrierAuthority = modalPhaseInterferenceTexture
        ? clamp(uLiveFieldCacheActive, float(0.0), float(1.0)).mul(
            phaseInterferenceCarrier.authority,
          )
        : float(0.0);
      // The phase-interference cache already owns the finite detector-window
      // integration and normalizes both spatial-energy fields against the same
      // global modal coefficient energy. Reconstruct local observed energy
      // from those fields rather than applying contrast to a uniform volume.
      const detectorIntegratedAcousticEnergy = modalCoefficientEnergy.mul(
        mix(
          phaseInterferenceCarrier.independentSpatialEnergy,
          phaseInterferenceCarrier.detectorIntegratedSpatialEnergy,
          phaseEnergyCarrierAuthority,
        ),
      );
      const assignLiveFieldSample = (liveFieldSample) => {
        field.assign(liveFieldSample.field);
        gradX.assign(liveFieldSample.gradient.x);
        gradY.assign(liveFieldSample.gradient.y);
        gradZ.assign(liveFieldSample.gradient.z);
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
            modalEnergyAmplitude,
            modalBasisAtlasTexture: modalBasisAtlasTextureNode,
            modalFieldModeBuffer,
            modalFieldCoefficientBuffer,
            liveSynthesisModeCount,
          }),
        );
      };
      if (modalLiveFieldTexture) {
        If(uLiveFieldCacheActive.greaterThan(float(0.5)), () => {
          assignLiveFieldSample(
            sampleLiveFieldProjectionCacheNode({
              basisUv,
              modalLiveFieldTexture,
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

      const gradient = vec3(gradX, gradY, gradZ).toVar();
      const carrier = deriveFixedWorldSpaceCarrierDensityNode({
        fieldValue: field,
        gradient,
        rayDirLocal,
        stepSize,
        coreFwhmWorld: uCarrierCoreFwhmWorld,
      });
      const coreDensity = carrier.coreDensity.mul(activeMask);
      const sheathDensity = carrier.sheathDensity.mul(activeMask);
      const staticMaterialColor = normalizeMaterialChromaticityNode(uColor);
      const surfaceMaterialColor =
        normalizeMaterialChromaticityNode(uSurfaceColor);

      // Selected production accent authority: ready current transport,
      // bounded by the caustic compression knee. It multiplies accent source
      // radiance and can never create carrier support.
      const laserOrderSample = laserIrradianceTexture
        ? texture3D(laserIrradianceTexture).sample(basisUv).toVar()
        : null;
      const laserAccentAuthority = laserOrderSample
        ? deriveBoundedCausticAccentAuthorityNode({
            totalIrradiance: laserOrderSample.x,
            zeroOrderIrradiance: laserOrderSample.y,
            zeroOrderPowerFraction: float(
              LASER_REFERENCE_APPARATUS_PROFILE.zeroOrderPowerFraction,
            ),
            transportReady: uLaserCausticActive,
          }).accentAuthority
        : float(0.0);

      if (spectralLaneTransferEnabled) {
        const spectralLaneTransfer = sampleSpectralLaneCacheNode({
          basisUv,
          spectralLaneTextureA,
          spectralLaneTextureB,
          spectralLaneStatsTexture,
          fallbackColor: uColor,
        });
        const spectralMaterialColor = mix(
          staticMaterialColor,
          spectralLaneTransfer.rgb,
          spectralMix,
        );
        const spectralObservationRadiance =
          deriveAcousticEnergyMaterialTransferNode({
            detectorIntegratedEnergy: detectorIntegratedAcousticEnergy,
            coreDensity,
            sheathDensity,
            materialColor: spectralMaterialColor,
            surfaceColor: surfaceMaterialColor,
            materialDensityScale,
            carrierColumnDensityScale: uCarrierColumnDensityScale,
            scatteringCoefficient: float(REFERENCE_SCATTERING_COEFFICIENT),
            absorptionCoefficient: uMaterialAbsorptionCoefficient,
            laserExcitedEmissionCoefficient: float(
              REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
            ),
            holographicIntensity: uHolographicIntensity,
            holographicFresnelPower: uHolographicFresnelPower,
            normalDotRay: carrier.normalDotRay,
            holographicBaseRadianceGain: uHolographicBaseRadianceGain,
            laserAccentAuthority,
          });
        return {
          baseRadiance: spectralObservationRadiance.baseRadiance,
          accentRadiance: spectralObservationRadiance.accentRadiance,
          extinction: spectralObservationRadiance.extinction,
        };
      }

      const observationRadiance = deriveAcousticEnergyMaterialTransferNode({
        detectorIntegratedEnergy: detectorIntegratedAcousticEnergy,
        coreDensity,
        sheathDensity,
        materialColor: staticMaterialColor,
        surfaceColor: surfaceMaterialColor,
        materialDensityScale,
        carrierColumnDensityScale: uCarrierColumnDensityScale,
        scatteringCoefficient: float(REFERENCE_SCATTERING_COEFFICIENT),
        absorptionCoefficient: uMaterialAbsorptionCoefficient,
        laserExcitedEmissionCoefficient: float(
          REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
        ),
        holographicIntensity: uHolographicIntensity,
        holographicFresnelPower: uHolographicFresnelPower,
        normalDotRay: carrier.normalDotRay,
        holographicBaseRadianceGain: uHolographicBaseRadianceGain,
        laserAccentAuthority,
      });
      return {
        baseRadiance: observationRadiance.baseRadiance,
        accentRadiance: observationRadiance.accentRadiance,
        extinction: observationRadiance.extinction,
      };
    }
  );
}

const RAYMARCH_DOMAIN_GEOMETRY_MARGIN = 1.01;
function createVolumeDomainGeometry(radius, volumeShape) {
  const hullRadius = radius * RAYMARCH_DOMAIN_GEOMETRY_MARGIN;
  const geometry =
    normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube
      ? new THREE.BoxGeometry(hullRadius * 2, hullRadius * 2, hullRadius * 2)
      : new THREE.SphereGeometry(hullRadius, 32, 32);
  geometry.computeBoundingSphere();
  return geometry;
}

function resolveMaterialStepBudget(steps) {
  return Math.max(1, Math.round(Number.isFinite(steps) ? steps : 1));
}

function getRaymarchMaterialVariantKey(
  spectralLightEvaluationMode,
  volumeShape,
) {
  const normalizedSpectralLightEvaluationMode =
    normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  return normalizedVolumeShape === VOLUME_SHAPES.sphere
    ? normalizedSpectralLightEvaluationMode
    : `${normalizedSpectralLightEvaluationMode}:${normalizedVolumeShape}`;
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
  volumeShape = DEFAULT_VOLUME_SHAPE,
}) {
  const initialVolumeShape = normalizeVolumeShape(volumeShape);
  const geometry = createVolumeDomainGeometry(radius, initialVolumeShape);
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
    volumeShape = DEFAULT_VOLUME_SHAPE,
  ) => {
    const normalizedBoundaryMode = normalizeBoundaryMode(boundaryMode);
    const normalizedSpectralLightEvaluationMode =
      normalizeSpectralLightEvaluationMode(spectralLightEvaluationMode);
    const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
    const material = /** @type {BaryonVolumeMaterial} */ (
      new BaryonVolumeNodeMaterial()
    );
    material.transparent = true;
    // The emission-absorption integrator already returns premultiplied scene
    // radiance (L) and coverage (1 - T). Straight-alpha NormalBlending would
    // multiply L by coverage a second time, suppressing thin outer structure
    // quadratically and favoring long central chords. Use premultiplied blend
    // factors directly while leaving premultipliedAlpha false: enabling that
    // flag would make NodeMaterial multiply output RGB by alpha in the shader.
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendEquationAlpha = THREE.AddEquation;
    material.blendSrcAlpha = THREE.OneFactor;
    material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    // The field radiance is self-emission, not a response to scene lights.
    // Build the production traversal as the explicit fragment output so its
    // execution cannot be gated by Three's optional scene-light lifecycle.
    material.lights = false;
    material.outputNode = createSafeVolumetricOutputNode(material);
    material.steps = resolveMaterialStepBudget(uniforms.uRaymarchSteps.value);
    material.radiusNode = uniforms.uRadius;
    if (normalizedVolumeShape === VOLUME_SHAPES.cube) {
      material.domainHalfExtentsNode = vec3(uniforms.uRadius);
    }
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
      volumeShape: normalizedVolumeShape,
      modalFieldModeBuffer: modalResourceBindings.modalFieldModeBuffer,
      modalFieldCoefficientBuffer:
        modalResourceBindings.modalFieldCoefficientBuffer,
      liveSynthesisModeCount: modalResourceBindings.modalFieldCapacity,
    });
    material.spectralLightEvaluationMode =
      normalizedSpectralLightEvaluationMode;
    material.raymarchBoundaryMode = normalizedBoundaryMode;
    material.raymarchVolumeShape = normalizedVolumeShape;
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
  const initialMaterialKey = getRaymarchMaterialVariantKey(
    initialSpectralLightEvaluationMode,
    initialVolumeShape,
  );
  const materialCache = {
    [BOUNDARY_MODES.dirichlet]: {
      [initialMaterialKey]: createMaterialForBoundaryMode(
        BOUNDARY_MODES.dirichlet,
        initialSpectralLightEvaluationMode,
        initialVolumeShape,
      ),
    },
    [BOUNDARY_MODES.neumann]: {
      [initialMaterialKey]: createMaterialForBoundaryMode(
        BOUNDARY_MODES.neumann,
        initialSpectralLightEvaluationMode,
        initialVolumeShape,
      ),
    },
  };
  const mesh = new THREE.Mesh(
    geometry,
    materialCache[BOUNDARY_MODES.neumann][initialMaterialKey],
  );
  mesh.userData.raymarchMaterialCache = materialCache;
  mesh.userData.raymarchCreateMaterialVariant = createMaterialForBoundaryMode;
  mesh.userData.raymarchBoundaryMode = BOUNDARY_MODES.neumann;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    initialSpectralLightEvaluationMode;
  mesh.userData.raymarchVolumeShape = initialVolumeShape;
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
  volumeShape,
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
    normalizeVolumeShape(material.raymarchVolumeShape) ===
      normalizeVolumeShape(volumeShape)
  );
}

function getOrCreateRaymarchMaterial(
  mesh,
  boundaryMode,
  spectralLightEvaluationMode,
  volumeShape = DEFAULT_VOLUME_SHAPE,
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
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const materialKey = getRaymarchMaterialVariantKey(
    normalizedSpectralLightEvaluationMode,
    normalizedVolumeShape,
  );
  const cachedMaterial = boundaryMaterials[materialKey];
  if (
    raymarchMaterialMatchesVariant(
      cachedMaterial,
      normalizedBoundaryMode,
      normalizedSpectralLightEvaluationMode,
      normalizedVolumeShape,
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
    normalizedVolumeShape,
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
  const volumeShape = normalizeVolumeShape(mesh?.userData?.raymarchVolumeShape);
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    spectralLightEvaluationMode,
    volumeShape,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchBoundaryMode = normalizedBoundaryMode;
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
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
  const volumeShape = normalizeVolumeShape(mesh?.userData?.raymarchVolumeShape);
  const nextMaterial = getOrCreateRaymarchMaterial(
    mesh,
    normalizedBoundaryMode,
    normalizedSpectralLightEvaluationMode,
    volumeShape,
  );
  if (!nextMaterial || mesh.material === nextMaterial) {
    mesh.userData.raymarchSpectralLightEvaluationMode =
      normalizedSpectralLightEvaluationMode;
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
  );
  mesh.material = nextMaterial;
  mesh.userData.raymarchSpectralLightEvaluationMode =
    normalizedSpectralLightEvaluationMode;
}

export function setRaymarchVolumeShape(mesh, volumeShape) {
  if (!mesh?.userData) {
    return;
  }

  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const previousVolumeShape = normalizeVolumeShape(
    mesh.userData.raymarchVolumeShape,
  );
  const activeMaterialShape = normalizeVolumeShape(
    mesh.material?.raymarchVolumeShape,
  );
  if (
    previousVolumeShape === normalizedVolumeShape &&
    activeMaterialShape === normalizedVolumeShape
  ) {
    return;
  }

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
    normalizedVolumeShape,
  );
  if (!nextMaterial) {
    return;
  }

  nextMaterial.steps = resolveMaterialStepBudget(
    mesh.userData.raymarchRequestedSteps ?? mesh.material?.steps,
  );
  mesh.material = nextMaterial;
  mesh.userData.raymarchVolumeShape = normalizedVolumeShape;

  if (previousVolumeShape === normalizedVolumeShape) {
    return;
  }

  const baseRadius = mesh.userData.raymarchBaseRadius;
  if (!Number.isFinite(baseRadius) || baseRadius <= 0) {
    return;
  }

  const previousGeometry = mesh.geometry;
  mesh.geometry = createVolumeDomainGeometry(baseRadius, normalizedVolumeShape);
  previousGeometry?.dispose?.();
}

export function setRaymarchCavityGeometry(mesh, cavityGeometry) {
  if (mesh?.userData) {
    mesh.userData.raymarchCavityGeometry =
      normalizeCavityGeometry(cavityGeometry);
  }
}

export function syncRaymarchMaterialSteps(mesh, steps) {
  if (mesh?.userData) {
    mesh.userData.raymarchRequestedSteps = Math.round(steps);
  }
  const materialCache = getRaymarchMaterialCache(mesh);
  if (!materialCache) {
    if (mesh?.material) {
      mesh.material.steps = resolveMaterialStepBudget(steps);
    }
    return;
  }

  Object.values(materialCache).forEach((boundaryMaterials) => {
    Object.values(boundaryMaterials).forEach((material) => {
      if (material) {
        material.steps = resolveMaterialStepBudget(steps);
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
