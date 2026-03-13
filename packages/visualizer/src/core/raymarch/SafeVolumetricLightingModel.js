import { LightingModel } from "three/webgpu";
import {
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
  sqrt,
  uniform,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
  max,
  min,
} from "three/tsl";

const scatteringDensity = property("vec3");
const linearDepthRay = property("vec3");
const outgoingRayLight = property("vec3");
const EXTINCTION_SCALE = 0.08;
const OUTPUT_GAIN = 1.35;
const REFERENCE_STEPS = 96.0;

/**
 * @typedef {import("three").Material & {
 *   steps?: number,
 *   radiusNode?: any,
 *   offsetNode?: any,
 *   depthNode?: any,
 *   scatteringNode?: ((args: { positionRay: any }) => any) | null
 * }} RuntimeVolumeMaterial
 */

export default class SafeVolumetricLightingModel extends LightingModel {
  start(builder) {
    const material = /** @type {RuntimeVolumeMaterial} */ (builder.material);
    const { context } = builder;

    const startPos = property("vec3");
    const endPos = property("vec3");

    If(
      cameraPosition
        .sub(positionWorld)
        .length()
        .greaterThan(modelRadius.mul(2)),
      () => {
        startPos.assign(cameraPosition);
        endPos.assign(positionWorld);
      },
    ).Else(() => {
      startPos.assign(positionWorld);
      endPos.assign(cameraPosition);
    });

    const steps = uniform("int").onRenderUpdate(
      ({ material: runtimeMaterial }) =>
        /** @type {RuntimeVolumeMaterial} */ (runtimeMaterial).steps ?? 0,
    );
    const radiusNode = material.radiusNode ?? modelRadius;
    const startPosLocal = modelWorldMatrixInverse
      .mul(vec4(startPos, 1))
      .xyz.toVar();
    const endPosLocal = modelWorldMatrixInverse
      .mul(vec4(endPos, 1))
      .xyz.toVar();
    const viewVectorLocal = endPosLocal.sub(startPosLocal).toVar();
    const rayDirLocal = viewVectorLocal.normalize().toVar();
    const maxDistance = viewVectorLocal.length().toVar();
    const rayOriginProjection = dot(startPosLocal, rayDirLocal).toVar();
    const originDistanceSquared = dot(startPosLocal, startPosLocal).toVar();
    const radiusSquared = radiusNode.mul(radiusNode).toVar();
    const discriminant = rayOriginProjection
      .mul(rayOriginProjection)
      .sub(originDistanceSquared.sub(radiusSquared))
      .toVar();
    const entryDistance = float(0.0).toVar();
    const exitDistance = float(0.0).toVar();
    const segmentLength = float(0.0).toVar();
    const stepSize = float(0.0).toVar();
    const stepNormalization = float(REFERENCE_STEPS).div(float(steps)).toVar();
    const distTravelled = float(0.0).toVar();
    const transmittance = vec3(1).toVar();

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

      If(exitDistance.greaterThan(entryDistance), () => {
        segmentLength.assign(exitDistance.sub(entryDistance));
        stepSize.assign(segmentLength.div(steps));
        distTravelled.assign(entryDistance);

        if (material.offsetNode) {
          distTravelled.addAssign(material.offsetNode.mul(stepSize));
        }

        Loop(steps, () => {
          const sampleDistance = min(distTravelled, exitDistance);
          const positionRayLocal = startPosLocal
            .add(rayDirLocal.mul(sampleDistance))
            .toVar();
          const positionRay = modelWorldMatrix
            .mul(vec4(positionRayLocal, 1))
            .xyz.toVar();
          const positionViewRay = cameraViewMatrix.mul(
            vec4(positionRay, 1),
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
            scatteringNode = material.scatteringNode({ positionRay });
          }

          super.start(builder);

          if (scatteringNode) {
            scatteringDensity.mulAssign(scatteringNode);
          }

          const falloff = scatteringDensity
            .mul(EXTINCTION_SCALE)
            .mul(stepNormalization)
            .negate()
            .mul(stepSize)
            .exp();
          transmittance.mulAssign(falloff);
          distTravelled.addAssign(stepSize);
        });

        outgoingRayLight.addAssign(
          transmittance
            .saturate()
            .oneMinus()
            .mul(OUTPUT_GAIN)
            .mul(stepNormalization.sqrt()),
        );
      });
    });
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
    builder.context.outgoingLight.assign(outgoingRayLight);
  }
}
