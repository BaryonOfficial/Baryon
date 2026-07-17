import { LightingModel } from "three/webgpu";
import {
  abs,
  Break,
  clamp,
  dot,
  float,
  Fn,
  If,
  int,
  Loop,
  max,
  min,
  modelRadius,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  cameraPosition,
  positionWorld,
  property,
  sqrt,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import { MIN_ADAPTIVE_STEPS } from "./stepStability.js";

export const raymarchLightNode = property("vec3", "baryonRaymarchLight");
export const raymarchOpacityNode = property("float", "baryonRaymarchOpacity");
export const raymarchBaseLightNode = property(
  "vec3",
  "baryonRaymarchBaseLight",
  vec3(0),
);
export const raymarchAccentLightNode = property(
  "vec3",
  "baryonRaymarchAccentLight",
  vec3(0),
);
export const raymarchTransmittanceNode = property(
  "float",
  "baryonRaymarchTransmittance",
  float(1),
);
export const raymarchCoverageNode = property(
  "float",
  "baryonRaymarchCoverage",
  float(0),
);

const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;
const EXTINCTION_EPSILON = 1e-8;

const ADAPTIVE_INTEGRATION_ERROR_TOLERANCE = 0.01;
const ADAPTIVE_INTEGRATION_MIN_STEP_MULTIPLIER = 0.5;
// Refinement may split the base lattice, but it may never enlarge a step and
// skip a thin carrier interval.
export const ADAPTIVE_INTEGRATION_MAX_STEP_MULTIPLIER = 1;

/**
 * CPU mirror of the interval-centered quadrature used by the GPU march.
 * intervalStart is an integration boundary, never a stochastic sample phase.
 */
export function deriveRaymarchSampleInterval({
  intervalStart = 0,
  intervalEnd = 0,
  nominalStepSize = 1,
  stepMultiplier = 1,
} = {}) {
  const start = Number.isFinite(intervalStart) ? intervalStart : 0;
  const end = Math.max(start, Number.isFinite(intervalEnd) ? intervalEnd : 0);
  const requestedStep =
    Math.max(0, Number.isFinite(nominalStepSize) ? nominalStepSize : 0) *
    Math.max(0, Number.isFinite(stepMultiplier) ? stepMultiplier : 0);
  const stepSize = Math.min(requestedStep, end - start);

  return {
    stepSize,
    sampleDistance: start + stepSize * 0.5,
    nextIntervalStart: start + stepSize,
  };
}

/** CPU mirror of the local-error refinement controller used by the GPU. */
export function deriveAdaptiveRaymarchStepSize({
  baseStepSize = 1,
  previousDensity = 0,
  currentDensity = 0,
  errorTolerance = ADAPTIVE_INTEGRATION_ERROR_TOLERANCE,
  minStepMultiplier = ADAPTIVE_INTEGRATION_MIN_STEP_MULTIPLIER,
  maxStepMultiplier = ADAPTIVE_INTEGRATION_MAX_STEP_MULTIPLIER,
} = {}) {
  const safeBaseStepSize = Math.max(Number.EPSILON, baseStepSize);
  const localError =
    Math.abs(currentDensity - previousDensity) * safeBaseStepSize;
  const stepMultiplier = Math.min(
    maxStepMultiplier,
    Math.max(
      minStepMultiplier,
      Math.sqrt(
        Math.max(errorTolerance, Number.EPSILON) /
          Math.max(localError, Number.EPSILON),
      ),
    ),
  );

  return {
    localError,
    stepMultiplier,
    stepSize: safeBaseStepSize * stepMultiplier,
  };
}

/**
 * Exact solution of dL/ds = J - sigma_t L over one constant segment.
 *
 * The base and accent sources are two diagnostic lanes of the same volume
 * source J in radiance per world length. Both use the same extinction sigma_t,
 * path, and scalar incident transmittance. Extinction is achromatic, so path
 * length cannot change either lane's chromaticity.
 */
export function integrateRadiativeTransferStep({
  transmittance = 1,
  baseSourceRadiance = [0, 0, 0],
  accentSourceRadiance = [0, 0, 0],
  extinction = 0,
  stepSize = 1,
} = {}) {
  const incidentTransmittance = Math.max(
    0,
    Number.isFinite(transmittance) ? transmittance : 0,
  );
  const sigmaT = Math.max(0, Number.isFinite(extinction) ? extinction : 0);
  const distance = Math.max(0, Number.isFinite(stepSize) ? stepSize : 0);
  const falloff = Math.exp(-sigmaT * distance);
  const segmentIntegral =
    sigmaT > EXTINCTION_EPSILON ? (1 - falloff) / sigmaT : distance;
  const integrateSource = (sourceRadiance) => {
    const source =
      Array.isArray(sourceRadiance) || ArrayBuffer.isView(sourceRadiance)
        ? sourceRadiance
        : [0, 0, 0];
    return [0, 1, 2].map((index) => {
      const channel = Number.isFinite(source[index])
        ? Math.max(0, source[index])
        : 0;
      return incidentTransmittance * channel * segmentIntegral;
    });
  };
  const segmentBaseRadiance = integrateSource(baseSourceRadiance);
  const segmentAccentRadiance = integrateSource(accentSourceRadiance);
  const segmentRadiance = segmentBaseRadiance.map(
    (channel, index) => channel + segmentAccentRadiance[index],
  );

  return {
    falloff,
    segmentBaseRadiance,
    segmentAccentRadiance,
    segmentRadiance,
    nextTransmittance: incidentTransmittance * falloff,
  };
}

/**
 * @typedef {import("three").Material & {
 *   steps?: number,
 *   radiusNode?: any,
 *   domainHalfExtentsNode?: any,
 *   scatteringNode?: ((args: {
 *     positionRay: any,
 *     positionRayLocal: any,
 *     rayDirLocal: any,
 *     stepSize: any
 *   }) => any) | null
 * }} RuntimeVolumeMaterial
 */

export function createSafeVolumetricOutputNode(material) {
  return Fn(() => {
    const startPos = property("vec3");
    const endPos = property("vec3");
    const radiusNode = material.radiusNode ?? modelRadius;
    const cameraDistanceThreshold = radiusNode.mul(2);

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
    const startPosLocal = modelWorldMatrixInverse
      .mul(vec4(startPos, 1))
      .xyz.toVar();
    const endPosLocal = modelWorldMatrixInverse
      .mul(vec4(endPos, 1))
      .xyz.toVar();
    const viewVectorLocal = endPosLocal.sub(startPosLocal).toVar();
    const rayDirLocal = viewVectorLocal.normalize().toVar();
    const maxDistance = viewVectorLocal.length().toVar();
    const entryDistance = float(0).toVar();
    const exitDistance = float(0).toVar();
    const segmentLength = float(0).toVar();
    const nominalStepSize = float(0).toVar();
    const stepSize = float(0).toVar();
    const adaptiveStepMultiplier = float(1).toVar();
    const previousExtinction = float(0).toVar();
    const stepCount = max(float(steps), 1).toVar();
    const distTravelled = float(0).toVar();
    const transmittance = float(1).toVar();
    const accumulatedBaseRadiance = vec3(0).toVar();
    const accumulatedAccentRadiance = vec3(0).toVar();

    raymarchLightNode.assign(vec3(0));
    raymarchOpacityNode.assign(float(0));
    raymarchBaseLightNode.assign(vec3(0));
    raymarchAccentLightNode.assign(vec3(0));
    raymarchTransmittanceNode.assign(float(1));
    raymarchCoverageNode.assign(float(0));

    const marchVolumeSegment = () => {
      If(exitDistance.greaterThan(entryDistance), () => {
        segmentLength.assign(exitDistance.sub(entryDistance));
        const diameter = radiusNode.mul(2);
        const stepsPerUnit = stepCount.div(max(diameter, float(1e-4)));
        const effectiveSteps = clamp(
          segmentLength.mul(stepsPerUnit),
          float(MIN_ADAPTIVE_STEPS),
          stepCount,
        ).toVar();
        nominalStepSize.assign(
          segmentLength.div(max(effectiveSteps, float(1))),
        );
        stepSize.assign(nominalStepSize);
        distTravelled.assign(entryDistance);

        // A two-times ceiling lets the controller halve every interval without
        // truncating the finite ray segment.
        Loop(
          {
            start: int(0),
            end: steps.mul(int(2)),
            type: "int",
            condition: "<",
          },
          () => {
            stepSize.assign(nominalStepSize.mul(adaptiveStepMultiplier));
            const currentStepSize = min(
              stepSize,
              max(exitDistance.sub(distTravelled), float(0)),
            ).toVar();
            const sampleDistance = distTravelled.add(currentStepSize.mul(0.5));
            const positionRayLocal = startPosLocal
              .add(rayDirLocal.mul(sampleDistance))
              .toVar();
            const positionRay = modelWorldMatrix
              .mul(vec4(positionRayLocal, 1))
              .xyz.toVar();
            // The scattering callback supplies split base and accent source
            // lanes with one shared extinction; both lanes integrate against
            // the same transmittance recurrence and step sequence.
            const scatterSample = material.scatteringNode
              ? material.scatteringNode({
                  positionRay,
                  positionRayLocal,
                  rayDirLocal,
                  stepSize: currentStepSize,
                })
              : null;
            const baseSourceRadiance = scatterSample
              ? max(vec3(scatterSample.baseRadiance), vec3(0)).toVar()
              : vec3(0).toVar();
            const accentSourceRadiance = scatterSample
              ? max(vec3(scatterSample.accentRadiance), vec3(0)).toVar()
              : vec3(0).toVar();
            const extinction = scatterSample
              ? max(float(scatterSample.extinction), float(0)).toVar()
              : float(0).toVar();

            const localIntegrationError = abs(
              extinction.sub(previousExtinction),
            )
              .mul(currentStepSize)
              .toVar();
            adaptiveStepMultiplier.assign(
              clamp(
                sqrt(
                  float(ADAPTIVE_INTEGRATION_ERROR_TOLERANCE).div(
                    max(localIntegrationError, float(1e-8)),
                  ),
                ),
                float(ADAPTIVE_INTEGRATION_MIN_STEP_MULTIPLIER),
                float(ADAPTIVE_INTEGRATION_MAX_STEP_MULTIPLIER),
              ),
            );
            previousExtinction.assign(extinction);

            // Exact homogeneous radiative transfer for this interval:
            // L += T * J/sigma_t * (1 - exp(-sigma_t ds)).
            const falloff = extinction
              .negate()
              .mul(currentStepSize)
              .exp()
              .toVar();
            const segmentIntegral = transmittance
              .mul(float(1).sub(falloff))
              .div(max(extinction, float(EXTINCTION_EPSILON)))
              .toVar();
            accumulatedBaseRadiance.addAssign(
              baseSourceRadiance.mul(segmentIntegral),
            );
            accumulatedAccentRadiance.addAssign(
              accentSourceRadiance.mul(segmentIntegral),
            );
            transmittance.mulAssign(falloff);

            If(
              transmittance.lessThan(float(EARLY_EXIT_TRANSMITTANCE_EPSILON)),
              () => {
                Break();
              },
            );
            distTravelled.addAssign(currentStepSize);
            If(distTravelled.greaterThanEqual(exitDistance), () => {
              Break();
            });
          },
        );

        const coverage = float(1.0).sub(transmittance).saturate();
        raymarchBaseLightNode.assign(accumulatedBaseRadiance);
        raymarchAccentLightNode.assign(accumulatedAccentRadiance);
        raymarchLightNode.assign(
          accumulatedBaseRadiance.add(accumulatedAccentRadiance),
        );
        raymarchTransmittanceNode.assign(transmittance);
        raymarchCoverageNode.assign(coverage);
        raymarchOpacityNode.assign(coverage);
      });
    };

    const intersectSphereDomain = () => {
      const rayOriginProjection = dot(startPosLocal, rayDirLocal).toVar();
      const originDistanceSquared = dot(startPosLocal, startPosLocal).toVar();
      const radiusSquared = radiusNode.mul(radiusNode).toVar();
      const discriminant = rayOriginProjection
        .mul(rayOriginProjection)
        .sub(originDistanceSquared.sub(radiusSquared))
        .toVar();

      If(discriminant.greaterThan(0), () => {
        const intersectionRoot = sqrt(discriminant).toVar();
        const unclampedEntry = rayOriginProjection
          .negate()
          .sub(intersectionRoot)
          .toVar();
        const unclampedExit = rayOriginProjection
          .negate()
          .add(intersectionRoot)
          .toVar();

        entryDistance.assign(max(unclampedEntry, 0));
        exitDistance.assign(min(unclampedExit, maxDistance));
        marchVolumeSegment();
      });
    };

    const intersectBoxDomain = () => {
      const directionEpsilon = float(1e-6);
      const directionSign = vec3(
        rayDirLocal.x.greaterThanEqual(0).select(1, -1),
        rayDirLocal.y.greaterThanEqual(0).select(1, -1),
        rayDirLocal.z.greaterThanEqual(0).select(1, -1),
      ).toVar();
      const safeRayDirection = max(abs(rayDirLocal), vec3(directionEpsilon))
        .mul(directionSign)
        .toVar();
      const inverseRayDirection = vec3(1).div(safeRayDirection).toVar();
      const domainHalfExtents = vec3(material.domainHalfExtentsNode).toVar();
      const intersectionA = domainHalfExtents
        .negate()
        .sub(startPosLocal)
        .mul(inverseRayDirection)
        .toVar();
      const intersectionB = domainHalfExtents
        .sub(startPosLocal)
        .mul(inverseRayDirection)
        .toVar();
      const slabEntry = min(intersectionA, intersectionB).toVar();
      const slabExit = max(intersectionA, intersectionB).toVar();
      const unclampedEntry = max(
        max(slabEntry.x, slabEntry.y),
        slabEntry.z,
      ).toVar();
      const unclampedExit = min(
        min(slabExit.x, slabExit.y),
        slabExit.z,
      ).toVar();

      entryDistance.assign(max(unclampedEntry, 0));
      exitDistance.assign(min(unclampedExit, maxDistance));
      marchVolumeSegment();
    };

    if (material.domainHalfExtentsNode) {
      intersectBoxDomain();
    } else {
      intersectSphereDomain();
    }

    return vec4(raymarchLightNode, raymarchOpacityNode);
  })();
}

export default class SafeVolumetricLightingModel extends LightingModel {
  start(builder) {
    const material = /** @type {RuntimeVolumeMaterial} */ (builder.material);
    const outputNode = createSafeVolumetricOutputNode(material);
    builder.context.outgoingLight.assign(outputNode.rgb);
  }

  finish(builder) {
    builder.context.outgoingLight.assign(raymarchLightNode);
  }
}
