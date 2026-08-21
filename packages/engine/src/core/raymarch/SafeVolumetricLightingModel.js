import {
  abs,
  ceil,
  clamp,
  dot,
  float,
  Fn,
  If,
  int,
  Loop,
  max,
  min,
  mix,
  modelRadius,
  modelWorldMatrixInverse,
  cameraPosition,
  positionWorld,
  property,
  sqrt,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

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
const raymarchCoverageNode = property(
  "float",
  "baryonRaymarchCoverage",
  float(0),
);

const EXTINCTION_EPSILON = 1e-8;
const GAUSS_LEGENDRE_TWO_POINT_OFFSET = 1 / (2 * Math.sqrt(3));

/**
 * CPU mirror of the deterministic GPU quadrature. `sampleBudget` is the
 * declared number of analytic field evaluations on a reference-length chord.
 * It is rounded up once to an even count because every panel uses the same
 * two-point rule. Shorter chords retain the same world-space panel spacing and
 * finish with one partial panel instead of rescaling every existing sample.
 *
 * That fixed lattice is important visually: changing chord length can only add
 * or grow the final panel, so neighbouring rays never turn integer sample-count
 * boundaries into either coherent rings or stochastic grain.
 */
export function deriveCompositeGaussLegendreRaymarchSamples({
  entryDistance = 0,
  exitDistance = 0,
  referenceLength = 1,
  sampleBudget = 1,
} = {}) {
  const entry = Number.isFinite(entryDistance) ? entryDistance : 0;
  const exit = Math.max(
    entry,
    Number.isFinite(exitDistance) ? exitDistance : entry,
  );
  const segmentLength = exit - entry;
  if (!(segmentLength > 0)) {
    return [];
  }

  const normalizedBudget = Math.max(
    1,
    Math.round(Number.isFinite(sampleBudget) ? sampleBudget : 1),
  );
  const safeReferenceLength = Math.max(
    Number.EPSILON,
    Number.isFinite(referenceLength) ? referenceLength : 1,
  );
  const evenSampleBudget = 2 * Math.ceil(normalizedBudget / 2);
  const targetPanelWidth =
    safeReferenceLength / Math.max(1, evenSampleBudget / 2);
  const panelCount = Math.max(
    1,
    Math.ceil(
      segmentLength / targetPanelWidth - Number.EPSILON * evenSampleBudget,
    ),
  );
  const samples = [];

  for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
    const panelStart = entry + panelIndex * targetPanelWidth;
    const localPanelWidth = Math.min(targetPanelWidth, exit - panelStart);
    if (!(localPanelWidth > 0)) {
      continue;
    }
    const panelCenter = panelStart + localPanelWidth * 0.5;
    const offset = localPanelWidth * GAUSS_LEGENDRE_TWO_POINT_OFFSET;
    const weight = localPanelWidth * 0.5;
    samples.push(
      { distance: panelCenter - offset, weight },
      { distance: panelCenter + offset, weight },
    );
  }

  return samples;
}

/**
 * Deterministic CPU oracle for the direct volume quadrature.
 * @param {{
 *   entryDistance?: number,
 *   exitDistance?: number,
 *   referenceLength?: number,
 *   sampleBudget?: number,
 *   sample?: (distance: number) => number,
 * }} options
 */
export function integrateCompositeGaussLegendreRaymarch({
  entryDistance = 0,
  exitDistance = 0,
  referenceLength = 1,
  sampleBudget = 1,
  sample = () => 0,
} = {}) {
  return deriveCompositeGaussLegendreRaymarchSamples({
    entryDistance,
    exitDistance,
    referenceLength,
    sampleBudget,
  }).reduce(
    (integral, quadratureSample) =>
      integral +
      Number(sample(quadratureSample.distance) || 0) * quadratureSample.weight,
    0,
  );
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
 * Deterministic CPU oracle for the camera-ordered production transfer.
 *
 * Composite Gauss-Legendre weights partition the chord into positive path
 * intervals. Each sampled coefficient tuple is treated as constant over its
 * interval, then integrated exactly before the next camera-depth interval.
 */
export function integrateRadiativeTransferRay({
  entryDistance = 0,
  exitDistance = 0,
  referenceLength = 1,
  sampleBudget = 1,
  cameraAtRayStart = true,
  sample = /** @type {(distance: number) => any} */ (() => ({})),
} = {}) {
  const samples = deriveCompositeGaussLegendreRaymarchSamples({
    entryDistance,
    exitDistance,
    referenceLength,
    sampleBudget,
  });
  const orderedSamples = cameraAtRayStart ? samples : [...samples].reverse();
  const baseRadiance = [0, 0, 0];
  const accentRadiance = [0, 0, 0];
  let transmittance = 1;

  for (const quadratureSample of orderedSamples) {
    const coefficients = sample(quadratureSample.distance) ?? {};
    const localExtinction = Math.max(
      0,
      Number.isFinite(coefficients.extinction) ? coefficients.extinction : 0,
    );
    const step = integrateRadiativeTransferStep({
      transmittance,
      baseSourceRadiance: coefficients.baseSourceRadiance,
      accentSourceRadiance: coefficients.accentSourceRadiance,
      extinction: localExtinction,
      stepSize: quadratureSample.weight,
    });

    for (let channel = 0; channel < 3; channel += 1) {
      baseRadiance[channel] += step.segmentBaseRadiance[channel];
      accentRadiance[channel] += step.segmentAccentRadiance[channel];
    }
    transmittance = step.nextTransmittance;
  }

  return {
    baseRadiance,
    accentRadiance,
    sourceRadiance: baseRadiance.map(
      (channel, index) => channel + accentRadiance[index],
    ),
    transmittance,
    coverage: Math.min(1, Math.max(0, 1 - transmittance)),
  };
}

/**
 * @typedef {import("three").Material & {
 *   steps?: number,
 *   radiusNode?: any,
 *   domainHalfExtentsNode?: any,
 *   createOpticalTransferRaySampler?: ((args: {
 *     rayOriginLocal: any,
 *     unitRayDirLocal: any
 *   }) => ((sample: {sampleDistance: any, stepSize: any}) => any)) | null
 * }} RuntimeVolumeMaterial
 */

export function createSafeVolumetricOutputNode(material) {
  return Fn(() => {
    const startPos = property("vec3");
    const endPos = property("vec3");
    const radiusNode = material.radiusNode ?? modelRadius;
    const cameraDistanceThreshold = radiusNode.mul(2);
    // Which end of the parameterized ray the camera sits on. The emission
    // integral attenuates each sample by the optical depth between it and the
    // camera, so this decides which endpoint that depth is measured from.
    const cameraAtRayStart = float(0).toVar();

    If(
      cameraPosition
        .sub(positionWorld)
        .length()
        .greaterThan(cameraDistanceThreshold),
      () => {
        startPos.assign(cameraPosition);
        endPos.assign(positionWorld);
        cameraAtRayStart.assign(1);
      },
    ).Else(() => {
      startPos.assign(positionWorld);
      endPos.assign(cameraPosition);
      cameraAtRayStart.assign(0);
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
    const stepCount = max(float(steps), 1).toVar();
    // `stepCount` is the declared sample budget for a diameter chord. The
    // production rule rounds it up to complete two-point panels, fixes that
    // panel spacing in world space, and allows longer box chords to consume
    // proportionally more panels.
    const domainDiameter = max(radiusNode.mul(2), float(1e-4)).toVar();
    const longestDomainChord = material.domainHalfExtentsNode
      ? float(vec3(material.domainHalfExtentsNode).length()).mul(2)
      : float(radiusNode).mul(2);
    const panelBudget = max(ceil(stepCount.mul(float(0.5))), float(1)).toVar();
    const targetPanelWidth = domainDiameter.div(panelBudget).toVar();
    const panelCountCeiling = max(
      ceil(longestDomainChord.div(targetPanelWidth)),
      float(1),
    ).toVar();
    const accumulatedBaseRadiance = vec3(0).toVar();
    const accumulatedAccentRadiance = vec3(0).toVar();
    const accumulatedTransmittance = float(1).toVar();
    const opticalTransferRaySampler = material.createOpticalTransferRaySampler
      ? material.createOpticalTransferRaySampler({
          rayOriginLocal: startPosLocal,
          unitRayDirLocal: rayDirLocal,
        })
      : null;

    raymarchLightNode.assign(vec3(0));
    raymarchOpacityNode.assign(float(0));
    raymarchBaseLightNode.assign(vec3(0));
    raymarchAccentLightNode.assign(vec3(0));
    raymarchTransmittanceNode.assign(float(1));
    raymarchCoverageNode.assign(float(0));

    const marchVolumeSegment = () => {
      If(exitDistance.greaterThan(entryDistance), () => {
        segmentLength.assign(exitDistance.sub(entryDistance));
        // Each ray shares one fixed panel lattice measured from its entry
        // point. Only the final panel changes width as a chord grows, removing
        // both coherent count bands and the former per-ray dither grain.
        const segmentPanelCount = int(
          clamp(
            ceil(segmentLength.div(targetPanelWidth)),
            float(1),
            panelCountCeiling,
          ),
        ).toVar();
        const segmentPanelCountFloat = float(segmentPanelCount).toVar();
        const lastPanelIndex = segmentPanelCountFloat.sub(float(1)).toVar();
        const firstGaussDirection = mix(
          float(1),
          float(-1),
          cameraAtRayStart,
        ).toVar();

        const accumulateSample = (sampleDistance, sampleWeight) => {
          const opticalSample = opticalTransferRaySampler
            ? opticalTransferRaySampler({
                sampleDistance,
                stepSize: sampleWeight,
              })
            : null;
          if (opticalSample) {
            const baseSourceRadiance = vec3(opticalSample.baseRadiance).toVar();
            const accentSourceRadiance = vec3(
              opticalSample.accentRadiance,
            ).toVar();
            const localExtinction = float(opticalSample.extinction).toVar();
            const falloff = localExtinction
              .negate()
              .mul(sampleWeight)
              .exp()
              .toVar();
            const attenuatedInterval = float(1)
              .sub(falloff)
              .div(max(localExtinction, float(EXTINCTION_EPSILON)));
            const segmentIntegral = localExtinction
              .greaterThan(float(EXTINCTION_EPSILON))
              .select(attenuatedInterval, sampleWeight)
              .uniformFlow()
              .toVar();
            const weightedTransmittance = accumulatedTransmittance
              .mul(segmentIntegral)
              .toVar();
            accumulatedBaseRadiance.addAssign(
              baseSourceRadiance.mul(weightedTransmittance),
            );
            accumulatedAccentRadiance.addAssign(
              accentSourceRadiance.mul(weightedTransmittance),
            );
            accumulatedTransmittance.mulAssign(falloff);
          }
        };

        // Traverse the same deterministic quadrature from the camera toward the
        // far side in either ray parameterization. Each interval updates the
        // one shared extinction recurrence before the next depth sample.
        Loop(
          {
            start: int(0),
            end: segmentPanelCount,
            type: "int",
            condition: "<",
          },
          ({ i }) => {
            const panelIndex = float(i).toVar();
            const marchPanelIndex = mix(
              lastPanelIndex.sub(panelIndex),
              panelIndex,
              cameraAtRayStart,
            ).toVar();
            const panelOffset = marchPanelIndex.mul(targetPanelWidth).toVar();
            const panelStartDistance = entryDistance.add(panelOffset);
            const localPanelWidth = min(
              targetPanelWidth,
              max(exitDistance.sub(panelStartDistance), float(0)),
            ).toVar();
            const gaussWeight = localPanelWidth.mul(float(0.5)).toVar();
            const panelCenterDistance = entryDistance.add(
              panelOffset.add(gaussWeight),
            );
            const gaussOffset = localPanelWidth
              .mul(float(GAUSS_LEGENDRE_TWO_POINT_OFFSET))
              .toVar();
            const signedGaussOffset = gaussOffset
              .mul(firstGaussDirection)
              .toVar();
            const firstSampleDistance = panelCenterDistance
              .add(signedGaussOffset)
              .toVar();
            const secondSampleDistance = panelCenterDistance
              .sub(signedGaussOffset)
              .toVar();
            accumulateSample(firstSampleDistance, gaussWeight);
            accumulateSample(secondSampleDistance, gaussWeight);
          },
        );

        const transmittance = accumulatedTransmittance;
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

// Safe volumetric lighting model owner end.
