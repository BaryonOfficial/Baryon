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
  abs,
} from "three/tsl";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { VOLUME_BOUNDS_MODES } from "./volumeBounds.js";
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
 *   halfExtentsNode?: any,
 *   volumeBoundsMode?: string,
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

    const isFullscreenBox =
      material.volumeBoundsMode === VOLUME_BOUNDS_MODES.fullscreenBox;
    const startPos = property("vec3");
    const endPos = property("vec3");
    const radiusNode = material.radiusNode ?? modelRadius;
    const halfExtentsNode = /** @type {any} */ (material.halfExtentsNode);
    const cameraDistanceThreshold = isFullscreenBox
      ? max(max(halfExtentsNode.x, halfExtentsNode.y), halfExtentsNode.z).mul(
          2.0,
        )
      : modelRadius.mul(2);

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
    raymarchLightNode.assign(vec3(0));
    raymarchOpacityNode.assign(0.0);

    const marchVolumeSegment = () => {
      If(exitDistance.greaterThan(entryDistance), () => {
        segmentLength.assign(exitDistance.sub(entryDistance));
        const diameter = isFullscreenBox
          ? max(
              max(halfExtentsNode.x, halfExtentsNode.y),
              halfExtentsNode.z,
            ).mul(2.0)
          : radiusNode.mul(2.0);
        const stepsPerUnit = stepCount.div(max(diameter, float(1e-4)));
        const effectiveSteps = clamp(
          segmentLength.mul(stepsPerUnit),
          float(MIN_ADAPTIVE_STEPS),
          stepCount,
        ).toVar();
        stepSize.assign(segmentLength.div(max(effectiveSteps, float(1.0))));
        const stepRatio = float(REFERENCE_STEPS).div(effectiveSteps).toVar();
        If(stepRatio.greaterThan(1.0), () => {
          stepCompensation.assign(
            min(
              float(MAX_STEP_COMPENSATION),
              stepRatio.pow(float(STEP_COMPENSATION_EXPONENT)),
            ),
          );
        });
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

          let scatteringNode;
          if (material.scatteringNode) {
            const viewDirLocal = cameraPositionLocal
              .sub(positionRayLocal)
              .normalize()
              .toVar();
            scatteringNode = material.scatteringNode({
              positionRay,
              positionRayLocal,
              viewDirLocal,
            });
          }

          super.start(builder);

          if (scatteringNode) {
            const directLightContribution = scatteringDensity.toVar();
            scatteringDensity.assign(
              scatteringNode
                .mul(float(EMISSION_SAMPLE_GAIN))
                .add(
                  directLightContribution
                    .mul(scatteringNode)
                    .mul(float(DIRECT_LIGHT_RESPONSE_GAIN)),
                ),
            );
          }

          const falloff = /** @type {any} */ (
            scatteringDensity.mul(EXTINCTION_SCALE).negate().mul(stepSize)
          ).exp();
          transmittance.mulAssign(falloff);
          const remainingTransmittance = max(
            max(transmittance.x, transmittance.y),
            transmittance.z,
          ).toVar();
          If(
            remainingTransmittance.lessThan(
              float(EARLY_EXIT_TRANSMITTANCE_EPSILON),
            ),
            () => {
              Break();
            },
          );
          distTravelled.addAssign(stepSize);
          If(distTravelled.greaterThanEqual(exitDistance), () => {
            Break();
          });
        });

        const visibility = transmittance.saturate().oneMinus().toVar();
        const compensatedVisibility = visibility
          .mul(OUTPUT_GAIN)
          .mul(stepCompensation)
          .toVar();
        const visibilityPeak = max(
          max(compensatedVisibility.x, compensatedVisibility.y),
          compensatedVisibility.z,
        ).toVar();
        const compressedVisibilityPeak =
          applySoftKneeCompressionNode(visibilityPeak).toVar();
        const visibilityCompressionRatio = compressedVisibilityPeak
          .div(max(visibilityPeak, float(1e-4)))
          .toVar();
        raymarchLightNode.addAssign(
          compensatedVisibility.mul(visibilityCompressionRatio),
        );
        raymarchOpacityNode.assign(
          clamp(compressedVisibilityPeak.mul(opacityGainNode), 0.0, 1.0),
        );
      });
    };

    if (isFullscreenBox) {
      const rayDirSafe = vec3(
        abs(rayDirLocal.x)
          .lessThan(float(1e-6))
          .select(float(1e-6), rayDirLocal.x),
        abs(rayDirLocal.y)
          .lessThan(float(1e-6))
          .select(float(1e-6), rayDirLocal.y),
        abs(rayDirLocal.z)
          .lessThan(float(1e-6))
          .select(float(1e-6), rayDirLocal.z),
      ).toVar();
      const t0 = halfExtentsNode.sub(startPosLocal).div(rayDirSafe).toVar();
      const t1 = halfExtentsNode
        .negate()
        .sub(startPosLocal)
        .div(rayDirSafe)
        .toVar();
      const tMin = /** @type {any} */ (min(t0, t1).toVar());
      const tMax = /** @type {any} */ (max(t0, t1).toVar());
      const tEnter = max(max(tMin.x, tMin.y), tMin.z).toVar();
      const tExit = min(min(tMax.x, tMax.y), tMax.z).toVar();

      entryDistance.assign(max(tEnter, 0.0));
      exitDistance.assign(min(tExit, maxDistance));
      marchVolumeSegment();
    } else {
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
    }
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
