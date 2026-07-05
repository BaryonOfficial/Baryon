import { LightingModel } from "three/webgpu";
import {
  Break,
  If,
  Loop,
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraViewMatrix,
  dot,
  float,
  length,
  linearDepth,
  modelRadius,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  positionWorld,
  property,
  clamp,
  sqrt,
  uniform,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
  max,
  min,
} from "three/tsl";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  MAX_STEP_COMPENSATION,
  MIN_ADAPTIVE_STEPS,
  STEP_COMPENSATION_EXPONENT,
  STEP_REFERENCE,
} from "./stepStability.js";

const scatteringDensity = property("vec3");
const linearDepthRay = property("vec3");
export const raymarchLightNode = property("vec3", "baryonRaymarchLight");
export const raymarchOpacityNode = property("float", "baryonRaymarchOpacity");
const EXTINCTION_SCALE = 0.082;
const OUTPUT_GAIN = 1.38;
export const SOFT_KNEE_START = 0.62;
const SOFT_KNEE_STRENGTH = 1.15;
const REFERENCE_STEPS = STEP_REFERENCE;
const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;
export const EMISSION_SAMPLE_GAIN = 1.6;
export const DIRECT_LIGHT_RESPONSE_GAIN = 0.14;
// Emission–absorption transfer: radiance accumulates as
// L += T · (1 − e^(−σΔt)) · albedo · gain, with extinction σ from physical
// density and a colored source. Caustic focal spikes brighten L without
// telescoping back into the bounded 1 − T silhouette the old model produced.
export const SOURCE_ALBEDO_GAIN = 1.12;
// Chromatic Beer–Lambert: channels the medium scatters weakly are absorbed
// faster, so radiance grades from white-hot cores into saturated medium color
// with optical depth instead of graying out.
export const MEDIUM_CHROMATIC_ABSORPTION = 0.45;
const SOURCE_DENSITY_EPSILON = 1e-4;
const extinctionScaleNode = float(EXTINCTION_SCALE);
const emissionSampleGainNode = float(EMISSION_SAMPLE_GAIN);
const directLightResponseGainNode = float(DIRECT_LIGHT_RESPONSE_GAIN);
const earlyExitTransmittanceEpsilonNode = float(
  EARLY_EXIT_TRANSMITTANCE_EPSILON,
);
const outputGainNode = float(OUTPUT_GAIN);
const sourceAlbedoGainNode = float(SOURCE_ALBEDO_GAIN);
const mediumChromaticAbsorptionNode = float(MEDIUM_CHROMATIC_ABSORPTION);
const sourceDensityEpsilonNode = float(SOURCE_DENSITY_EPSILON);
const referenceStepsNode = float(REFERENCE_STEPS);

export function applySoftKneeCompression(
  value,
  kneeStart = SOFT_KNEE_START,
  kneeStrength = SOFT_KNEE_STRENGTH,
) {
  const aboveKnee = Math.max(0, value - kneeStart);
  return (
    Math.min(value, kneeStart) + aboveKnee / (1 + aboveKnee * kneeStrength)
  );
}

export function composeEmissionContribution(
  sampleValue,
  lightValue = 0,
  emissionSampleGain = EMISSION_SAMPLE_GAIN,
  directLightResponseGain = DIRECT_LIGHT_RESPONSE_GAIN,
) {
  return (
    sampleValue * emissionSampleGain +
    sampleValue * lightValue * directLightResponseGain
  );
}

/**
 * CPU mirror of the per-step emission–absorption integration in the march
 * loop. Extinction density is physical (no radiance gains) with a chromatic
 * Beer–Lambert weighting against the medium's weak channels; the exact step
 * solution per channel is L += T · (1 − e^(−σΔt)) · (J / D) · gain.
 */
export function integrateEmissionAbsorptionStep({
  transmittance = [1, 1, 1],
  sourceRadiance = [0, 0, 0],
  sourceDensity = 0,
  stepSize = 1,
  extinctionScale = EXTINCTION_SCALE,
  emissionSampleGain = EMISSION_SAMPLE_GAIN,
  albedoGain = SOURCE_ALBEDO_GAIN,
  chromaticAbsorption = MEDIUM_CHROMATIC_ABSORPTION,
} = {}) {
  const previousTransmittance = Array.isArray(transmittance)
    ? transmittance
    : [transmittance, transmittance, transmittance];
  const density = Math.max(0, sourceDensity);
  const albedoDenominator = Math.max(density, SOURCE_DENSITY_EPSILON);
  const sourceAlbedo = sourceRadiance.map(
    (channel) => Math.max(0, channel) / albedoDenominator,
  );
  const albedoPeak = Math.max(...sourceAlbedo, SOURCE_DENSITY_EPSILON);
  const grayExtinction = density * emissionSampleGain * extinctionScale;
  const falloff = sourceAlbedo.map((channel) => {
    const chromaticWeight =
      1 + chromaticAbsorption * (1 - channel / albedoPeak);
    return Math.exp(-grayExtinction * chromaticWeight * stepSize);
  });
  const segmentRadiance = sourceAlbedo.map(
    (channel, index) =>
      channel *
      previousTransmittance[index] *
      (1 - falloff[index]) *
      albedoGain,
  );

  return {
    falloff,
    segmentRadiance,
    nextTransmittance: previousTransmittance.map(
      (channel, index) => channel * falloff[index],
    ),
  };
}

function applySoftKneeCompressionNode(value) {
  const kneeStart = float(SOFT_KNEE_START);
  const aboveKnee = max(value.sub(kneeStart), 0.0);
  return min(value, kneeStart).add(
    aboveKnee.div(float(1.0).add(aboveKnee.mul(float(SOFT_KNEE_STRENGTH)))),
  );
}

/**
 * @typedef {import("three").Material & {
 *   steps?: number,
 *   radiusNode?: any,
 *   coreStepRadiusNode?: any,
 *   outerStepStretch?: number,
 *   opacityGainNode?: any,
 *   offsetNode?: any | ((args: {
 *     startPosLocal: any,
 *     endPosLocal: any,
 *     rayDirLocal: any,
 *     radiusNode: any
 *   }) => any),
 *   depthNode?: any,
 *   scatteringNode?: ((args: {
 *     positionRay: any,
 *     positionRayLocal: any,
 *     viewDirLocal: any
 *   }) => any) | null
 * }} RuntimeVolumeMaterial
 */

export default class SafeVolumetricLightingModel extends LightingModel {
  start(builder) {
    const material = /** @type {RuntimeVolumeMaterial} */ (builder.material);
    const { context } = builder;

    const startPos = property("vec3");
    const endPos = property("vec3");
    const radiusNode = material.radiusNode ?? modelRadius;
    const coreStepRadiusNode = material.coreStepRadiusNode ?? null;
    const outerStepStretch = Math.max(1, material.outerStepStretch ?? 1);
    const cameraDistanceThreshold = modelRadius.mul(2);

    If(
      cameraPosition
        .sub(positionWorld)
        .length()
        .greaterThan(cameraDistanceThreshold),
      () => {
        startPos.assign(cameraPosition);
        endPos.assign(positionWorld);
      },
    ).Else(() => {
      startPos.assign(positionWorld);
      endPos.assign(cameraPosition);
    });

    const steps = uniform(0, /** @type {any} */ ("int")).onRenderUpdate(
      ({ material: runtimeMaterial }) =>
        /** @type {RuntimeVolumeMaterial} */ (runtimeMaterial).steps ?? 0,
    );
    const opacityGainNode =
      material.opacityGainNode ?? uniform(RAYMARCH_DEFAULTS.opacityGain);
    const startPosLocal = modelWorldMatrixInverse
      .mul(vec4(startPos, 1))
      .xyz.toVar();
    const endPosLocal = modelWorldMatrixInverse
      .mul(vec4(endPos, 1))
      .xyz.toVar();
    const cameraPositionLocal = modelWorldMatrixInverse
      .mul(vec4(cameraPosition, 1))
      .xyz.toVar();
    const modelViewMatrix = cameraViewMatrix.mul(modelWorldMatrix).toVar();
    const viewVectorLocal = endPosLocal.sub(startPosLocal).toVar();
    const rayDirLocal = viewVectorLocal.normalize().toVar();
    const maxDistance = viewVectorLocal.length().toVar();
    const entryDistance = float(0.0).toVar();
    const exitDistance = float(0.0).toVar();
    const segmentLength = float(0.0).toVar();
    const stepSize = float(0.0).toVar();
    const stepCount = max(float(steps), 1.0).toVar();
    const stepCompensation = float(1.0).toVar();
    const distTravelled = float(0.0).toVar();
    const transmittance = vec3(1).toVar();
    const accumulatedRadiance = vec3(0).toVar();
    raymarchLightNode.assign(vec3(0));
    raymarchOpacityNode.assign(0.0);

    const marchVolumeSegment = () => {
      If(exitDistance.greaterThan(entryDistance), () => {
        segmentLength.assign(exitDistance.sub(entryDistance));
        const diameter = radiusNode.mul(2.0);
        const stepsPerUnit = stepCount.div(max(diameter, float(1e-4)));
        const effectiveSteps = clamp(
          segmentLength.mul(stepsPerUnit),
          float(MIN_ADAPTIVE_STEPS),
          stepCount,
        ).toVar();
        stepSize.assign(segmentLength.div(max(effectiveSteps, float(1.0))));
        const stepRatio = referenceStepsNode.div(effectiveSteps).toVar();
        If(stepRatio.greaterThan(1.0), () => {
          stepCompensation.assign(
            min(
              float(MAX_STEP_COMPENSATION),
              stepRatio.pow(float(STEP_COMPENSATION_EXPONENT)),
            ),
          );
        });
        // Radial-adaptive stepping (opt-in via material.coreStepRadiusNode):
        // flagship sample density inside the core radius, stretched steps in
        // the smooth radiating zone. The fine step is budgeted so the worst
        // chord — the core diameter at fine density plus the remaining
        // domain at stretched density — fits the step count, so a large
        // open domain costs little beyond the core march. The per-slab
        // exponential integration below is exact for any step size, so no
        // extra brightness compensation is needed.
        let adaptiveFineStep = null;
        let adaptiveCoarseStep = null;
        if (coreStepRadiusNode) {
          const coreDiameter = coreStepRadiusNode.mul(2.0);
          adaptiveFineStep = coreDiameter
            .add(diameter.sub(coreDiameter).div(float(outerStepStretch)))
            .div(max(stepCount, float(1.0)))
            .toVar();
          adaptiveCoarseStep = adaptiveFineStep
            .mul(float(outerStepStretch))
            .toVar();
          stepSize.assign(adaptiveFineStep);
        }
        distTravelled.assign(entryDistance);

        if (material.offsetNode) {
          const offsetNode =
            typeof material.offsetNode === "function"
              ? material.offsetNode({
                  startPosLocal,
                  endPosLocal,
                  rayDirLocal,
                  radiusNode,
                })
              : material.offsetNode;
          distTravelled.addAssign(offsetNode.mul(stepSize));
        }

        // @ts-ignore — TSL Loop types expect number but UniformNode<int> is valid at runtime
        Loop(steps, () => {
          const sampleDistance = min(distTravelled, exitDistance);
          const positionRayLocal = startPosLocal
            .add(rayDirLocal.mul(sampleDistance))
            .toVar();
          if (coreStepRadiusNode) {
            stepSize.assign(
              length(positionRayLocal)
                .lessThan(coreStepRadiusNode)
                .select(adaptiveFineStep, adaptiveCoarseStep),
            );
          }
          const positionRay = modelWorldMatrix
            .mul(vec4(positionRayLocal, 1))
            .xyz.toVar();
          const positionViewRay = modelViewMatrix.mul(
            vec4(positionRayLocal, 1),
          ).xyz;

          if (material.depthNode !== null) {
            linearDepthRay.assign(
              linearDepth(
                viewZToPerspectiveDepth(
                  positionViewRay.z,
                  cameraNear,
                  cameraFar,
                ),
              ),
            );

            context.sceneDepthNode = linearDepth(material.depthNode).toVar();
          }

          context.positionWorld = positionRay;
          context.shadowPositionWorld = positionRay;
          context.positionView = positionViewRay;

          scatteringDensity.assign(0);

          // Scattering contract: rgb = colored source radiance J (caustic
          // focal spikes included), a = physical extinction density (no
          // radiance gains — concentrated light does not occlude).
          let scatterSample;
          if (material.scatteringNode) {
            const viewDirLocal = cameraPositionLocal
              .sub(positionRayLocal)
              .normalize()
              .toVar();
            scatterSample = material.scatteringNode({
              positionRay,
              positionRayLocal,
              viewDirLocal,
            });
          }

          super.start(builder);

          const sourceRadiance = vec3(0).toVar();
          const sourceDensity = float(0.0).toVar();
          if (scatterSample) {
            const sample = vec4(scatterSample).toVar();
            const directLightContribution = scatteringDensity.toVar();
            sourceRadiance.assign(
              sample.rgb.add(
                directLightContribution
                  .mul(sample.rgb)
                  .mul(directLightResponseGainNode),
              ),
            );
            sourceDensity.assign(max(sample.a, 0.0));
          } else {
            sourceRadiance.assign(scatteringDensity);
            sourceDensity.assign(
              max(
                max(scatteringDensity.x, scatteringDensity.y),
                scatteringDensity.z,
              ),
            );
          }

          // Exact emission–absorption step: physical extinction density,
          // colored source, chromatic Beer–Lambert against weak channels.
          const sourceAlbedo = sourceRadiance.div(
            max(sourceDensity, sourceDensityEpsilonNode),
          );
          const albedoPeak = max(
            max(sourceAlbedo.x, sourceAlbedo.y),
            max(sourceAlbedo.z, sourceDensityEpsilonNode),
          );
          const chromaticWeight = vec3(1).add(
            mediumChromaticAbsorptionNode.mul(
              vec3(1).sub(sourceAlbedo.div(albedoPeak)),
            ),
          );
          const sigma = sourceDensity
            .mul(emissionSampleGainNode)
            .mul(extinctionScaleNode)
            .mul(chromaticWeight);
          const falloff = /** @type {any} */ (
            sigma.negate().mul(stepSize)
          ).exp();
          accumulatedRadiance.addAssign(
            sourceAlbedo
              .mul(transmittance.mul(vec3(1).sub(falloff)))
              .mul(sourceAlbedoGainNode),
          );
          transmittance.mulAssign(falloff);
          const remainingTransmittance = max(
            max(transmittance.x, transmittance.y),
            transmittance.z,
          ).toVar();
          If(
            remainingTransmittance.lessThan(earlyExitTransmittanceEpsilonNode),
            () => {
              Break();
            },
          );
          distTravelled.addAssign(stepSize);
          If(distTravelled.greaterThanEqual(exitDistance), () => {
            Break();
          });
        });

        // Radiance stays uncompressed here — the display shoulder and bloom
        // own highlight handling. The soft knee only shapes coverage (alpha).
        raymarchLightNode.addAssign(
          accumulatedRadiance.mul(outputGainNode).mul(stepCompensation),
        );
        const visibilityPeak = float(1.0)
          .sub(min(min(transmittance.x, transmittance.y), transmittance.z))
          .saturate()
          .mul(outputGainNode)
          .mul(stepCompensation)
          .toVar();
        const compressedVisibility =
          applySoftKneeCompressionNode(visibilityPeak).toVar();
        raymarchOpacityNode.assign(
          clamp(compressedVisibility.mul(opacityGainNode), 0.0, 1.0),
        );
      });
    };

    // The march domain is always a single analytic sphere bound. The
    // unbounded field extent widens this radius to the free-field reach
    // (see createVolumeDomainRadiusNode) — it never swaps in a box or any
    // other hard-edged domain shape.
    const intersectSphereDomain = () => {
      const rayOriginProjection = dot(startPosLocal, rayDirLocal).toVar();
      const originDistanceSquared = dot(startPosLocal, startPosLocal).toVar();
      const radiusSquared = radiusNode.mul(radiusNode).toVar();
      const discriminant = rayOriginProjection
        .mul(rayOriginProjection)
        .sub(originDistanceSquared.sub(radiusSquared))
        .toVar();

      If(discriminant.greaterThan(0.0), () => {
        const intersectionRoot = sqrt(discriminant).toVar();
        const unclampedEntry = rayOriginProjection
          .negate()
          .sub(intersectionRoot)
          .toVar();
        const unclampedExit = rayOriginProjection
          .negate()
          .add(intersectionRoot)
          .toVar();

        entryDistance.assign(max(unclampedEntry, 0.0));
        exitDistance.assign(min(unclampedExit, maxDistance));
        marchVolumeSegment();
      });
    };

    intersectSphereDomain();
  }

  scatteringLight(lightColor, builder) {
    const sceneDepthNode = builder.context.sceneDepthNode;

    if (sceneDepthNode) {
      If(sceneDepthNode.greaterThanEqual(linearDepthRay), () => {
        scatteringDensity.addAssign(lightColor);
      });
    } else {
      scatteringDensity.addAssign(lightColor);
    }
  }

  direct({ lightNode, lightColor }, builder) {
    if (lightNode.light.distance === undefined) return;

    const directLight = lightColor.xyz.toVar();

    if (lightNode.shadowNode !== null) {
      directLight.mulAssign(lightNode.shadowNode);
    }

    this.scatteringLight(directLight, builder);
  }

  directRectArea(
    { lightColor, lightPosition, halfWidth, halfHeight },
    builder,
  ) {
    void lightColor;
    void lightPosition;
    void halfWidth;
    void halfHeight;
    void builder;
  }

  finish(builder) {
    builder.context.outgoingLight.assign(raymarchLightNode);
  }
}
