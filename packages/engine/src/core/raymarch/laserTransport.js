import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  atomicAdd,
  atomicLoad,
  atomicStore,
  clamp,
  exp,
  float,
  floor,
  globalId,
  instancedArray,
  int,
  max,
  min,
  normalize,
  storageTexture3D,
  texture3D,
  textureStore,
  uint,
  uvec3,
  vec3,
  vec4,
  NodeAccess,
} from "three/tsl";
import { createRaymarchCacheTexture } from "./fieldCache.js";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { clamp01 } from "../../utils/math.js";
import { VOLUME_SHAPES, normalizeVolumeShape } from "../volumeShape.js";

const LASER_TRANSPORT_SEMANTIC =
  "acousto-optic-order-resolved-laser-irradiance";
const LASER_TRANSPORT_RESOLUTION = 64;
// CIC uses eight energy-conserving atomics and paired half-cycles use two
// traces per physical origin. A 48 x 48 origin grid therefore bounds trace
// atomic traffic to 2.25x the former 128 x 128 nearest-voxel estimator while
// trading source-grid density for hole-free trilinear reconstruction.
// 96 rays per axis: at 48 the CIC deposit lattice reconstructed as visible
// voxel-scale cells ("disco ball" facets) once the calibrated accent gain
// amplified the caustic excess. Densifying rays smooths the reconstruction
// at the source; deposit normalization keeps a straight flood at ~1.
export const LASER_TRANSPORT_RAY_GRID_SIZE = 96;
const LASER_TRANSPORT_STEPS = 192;
const LASER_TRANSPORT_FIXED_POINT_SCALE = 1024;
const LASER_REFERENCE_DIFFRACTED_POWER_FRACTION = 0.12;

/**
 * Resolve complementary optical-order powers from the single canonical
 * diffraction-efficiency parameter.
 */
export function deriveLaserOrderPowerFractions(diffractedPowerFraction) {
  const diffracted = clamp01(diffractedPowerFraction);
  return {
    zeroOrderPowerFraction: 1 - diffracted,
    diffractedPowerFraction: diffracted,
  };
}

const LASER_REFERENCE_ORDER_POWER_FRACTIONS = deriveLaserOrderPowerFractions(
  LASER_REFERENCE_DIFFRACTED_POWER_FRACTION,
);
/**
 * Declared reference apparatus used until the real optical train is measured.
 *
 * A weak acousto-optic phase object leaves most incident power in the
 * transmitted zero order and redirects only the declared diffracted fraction.
 * The two fractions sum to one, so the reference lane reveals the carrier
 * without adding light while the refracted lane still owns caustic
 * concentration. `pressureGradientCoupling` and the order split are apparatus
 * constants, not brightness controls. Their present normalized-cavity values
 * are explicit rather than claimed as measured SI ground truth.
 */
export const LASER_REFERENCE_APPARATUS_PROFILE = Object.freeze({
  semantic: "declared-reference-acousto-optic-apparatus",
  provenance: "fixed-reference-profile-until-measured",
  transportModel: "energy-conserving-reference-and-diffracted-order-split",
  incidentIrradiance: 1,
  ...LASER_REFERENCE_ORDER_POWER_FRACTIONS,
  cavityDiameter: 2,
  maxOpticalPathLength: 4,
  pressureGradientCoupling: RAYMARCH_DEFAULTS.laserDeflectionGain,
  mediumAbsorption: 0.02,
  maxAngularStepRadians: 0.25,
});

const LASER_DEFLECTION_GAIN =
  LASER_REFERENCE_APPARATUS_PROFILE.pressureGradientCoupling;
const LASER_MAX_STEP_DEFLECTION_RAD =
  LASER_REFERENCE_APPARATUS_PROFILE.maxAngularStepRadians;
const LASER_MEDIUM_ABSORPTION =
  LASER_REFERENCE_APPARATUS_PROFILE.mediumAbsorption;
const LASER_TRANSMITTANCE_EPSILON = 1e-3;
const LASER_CALIBRATION_EPSILON = 1e-4;
const ZERO_PRESSURE_GRADIENT = Object.freeze([0, 0, 0]);
// Side entry, slightly oblique so caustic sheets read in depth from the
// default camera instead of edge-on.
export const LASER_DEFAULT_DIRECTION = Object.freeze(
  normalizeVector3([0.78, 0.3, 0.55]),
);

const LASER_COMPUTE_WORKGROUP_3D = Object.freeze([8, 8, 4]);
const LASER_COMPUTE_WORKGROUP_RAYS = Object.freeze([8, 8, 1]);
const LASER_COMPUTE_WORKGROUP_LINEAR = Object.freeze([64, 1, 1]);
const SINGLE_PHASE_RAY_SAMPLES = Object.freeze([
  Object.freeze({ fieldSign: 1, powerWeight: 1 }),
]);
const PAIRED_PHASE_RAY_SAMPLES = Object.freeze([
  Object.freeze({ fieldSign: 1, powerWeight: 0.5 }),
  Object.freeze({ fieldSign: -1, powerWeight: 0.5 }),
]);

function normalizeVector3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(length > 0)) {
    return [1, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function getUnitCubeProjectionExtents(basis) {
  const support = (axis) =>
    Math.abs(axis[0]) + Math.abs(axis[1]) + Math.abs(axis[2]);
  return {
    tangent1: support(basis.tangent1),
    tangent2: support(basis.tangent2),
    forward: support(basis.forward),
  };
}

function intersectUnitCubeRay(origin, direction) {
  let entryDistance = Number.NEGATIVE_INFINITY;
  let exitDistance = Number.POSITIVE_INFINITY;

  for (let axis = 0; axis < 3; axis += 1) {
    const axisOrigin = origin[axis];
    const axisDirection = direction[axis];
    if (Math.abs(axisDirection) <= 1e-9) {
      if (axisOrigin < -1 || axisOrigin > 1) {
        return null;
      }
      continue;
    }

    const intersectionA = (-1 - axisOrigin) / axisDirection;
    const intersectionB = (1 - axisOrigin) / axisDirection;
    entryDistance = Math.max(
      entryDistance,
      Math.min(intersectionA, intersectionB),
    );
    exitDistance = Math.min(
      exitDistance,
      Math.max(intersectionA, intersectionB),
    );
  }

  return exitDistance >= entryDistance ? { entryDistance, exitDistance } : null;
}

function resolveLaserDomainRaySample({ u, v, basis, volumeShape }) {
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const { forward, tangent1, tangent2 } = basis;
  if (normalizedVolumeShape === VOLUME_SHAPES.sphere) {
    const lateralSquared = u * u + v * v;
    if (lateralSquared > 1) {
      return null;
    }
    const entryDepth = Math.sqrt(1 - lateralSquared);
    return {
      origin: [
        tangent1[0] * u + tangent2[0] * v - forward[0] * entryDepth,
        tangent1[1] * u + tangent2[1] * v - forward[1] * entryDepth,
        tangent1[2] * u + tangent2[2] * v - forward[2] * entryDepth,
      ],
      chordLength: entryDepth * 2,
    };
  }

  const extents = getUnitCubeProjectionExtents(basis);
  const projectedU = u * extents.tangent1;
  const projectedV = v * extents.tangent2;
  const rayStart = [
    tangent1[0] * projectedU +
      tangent2[0] * projectedV -
      forward[0] * extents.forward,
    tangent1[1] * projectedU +
      tangent2[1] * projectedV -
      forward[1] * extents.forward,
    tangent1[2] * projectedU +
      tangent2[2] * projectedV -
      forward[2] * extents.forward,
  ];
  const intersection = intersectUnitCubeRay(rayStart, forward);
  if (!intersection) {
    return null;
  }
  const entryDistance = Math.max(0, intersection.entryDistance);
  if (intersection.exitDistance < entryDistance) {
    return null;
  }
  return {
    origin: rayStart.map(
      (component, axis) => component + forward[axis] * entryDistance,
    ),
    chordLength: intersection.exitDistance - entryDistance,
  };
}

function isOutsideUnitDomain(position, volumeShape) {
  return normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube
    ? Math.max(...position.map((component) => Math.abs(component))) > 1
    : position[0] * position[0] +
        position[1] * position[1] +
        position[2] * position[2] >
        1;
}

/** Orthonormal ray-grid basis for a collimated beam along `direction`. */
export function buildLaserRayBasis(direction = LASER_DEFAULT_DIRECTION) {
  const forward = normalizeVector3([
    direction?.[0] ?? 1,
    direction?.[1] ?? 0,
    direction?.[2] ?? 0,
  ]);
  const reference = Math.abs(forward[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const tangent1 = normalizeVector3([
    forward[1] * reference[2] - forward[2] * reference[1],
    forward[2] * reference[0] - forward[0] * reference[2],
    forward[0] * reference[1] - forward[1] * reference[0],
  ]);
  const tangent2 = [
    forward[1] * tangent1[2] - forward[2] * tangent1[1],
    forward[2] * tangent1[0] - forward[0] * tangent1[2],
    forward[0] * tangent1[1] - forward[1] * tangent1[0],
  ];
  return { forward, tangent1, tangent2 };
}

/**
 * Discrete normalization so a straight-ray flood resolves to irradiance ≈ 1.
 *
 * Total deposits ≈ Σ_rays chord/ds spread over the selected domain's voxels.
 * Cloud-in-cell deposition is already energy conserving, so the direct
 * resolve needs only this scalar normalization.
 */
export function computeExpectedDepositsPerVoxel({
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  resolution = LASER_TRANSPORT_RESOLUTION,
  direction = LASER_DEFAULT_DIRECTION,
  basis = null,
  volumeShape = VOLUME_SHAPES.sphere,
} = {}) {
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const resolvedBasis = basis ?? buildLaserRayBasis(direction);
  const stepSize = 2 / steps;
  let expectedDeposits = 0;
  for (let j = 0; j < rayGridSize; j += 1) {
    for (let i = 0; i < rayGridSize; i += 1) {
      const u = ((i + 0.5) / rayGridSize) * 2 - 1;
      const v = ((j + 0.5) / rayGridSize) * 2 - 1;
      const raySample = resolveLaserDomainRaySample({
        u,
        v,
        basis: resolvedBasis,
        volumeShape: normalizedVolumeShape,
      });
      if (!raySample) {
        continue;
      }
      expectedDeposits += raySample.chordLength / stepSize;
    }
  }
  const voxelSide = 2 / resolution;
  const domainVoxelCount =
    normalizedVolumeShape === VOLUME_SHAPES.cube
      ? resolution ** 3
      : ((4 / 3) * Math.PI) / voxelSide ** 3;
  return expectedDeposits / Math.max(domainVoxelCount, 1);
}

/**
 * Half-cycle samples carried by one physical ray origin.
 *
 * Pairing both signs at the same origin performs the equal-time optical
 * observation without correlating acoustic phase with a source-grid
 * checkerboard. The weights always sum to one incident ray's power.
 */
export function getLaserRayPhaseSamples(phasePairing = true) {
  return phasePairing ? PAIRED_PHASE_RAY_SAMPLES : SINGLE_PHASE_RAY_SAMPLES;
}

/**
 * Deposit one ray sample with cloud-in-cell (trilinear) reconstruction.
 * Clamp-to-edge merges out-of-domain stencil entries at the boundary, so the
 * eight weights still deposit exactly `sampleEnergy` into the finite volume.
 */
export function depositLaserSampleTrilinearCpu(
  deposits,
  position,
  resolution,
  sampleEnergy,
) {
  const gridPosition = position.map(
    (value) => (value + 1) * 0.5 * resolution - 0.5,
  );
  const base = gridPosition.map((value) => Math.floor(value));
  const fraction = gridPosition.map((value, axis) => value - base[axis]);
  const clampAxis = (value) => Math.min(resolution - 1, Math.max(0, value));

  for (let dz = 0; dz <= 1; dz += 1) {
    const weightZ = dz === 0 ? 1 - fraction[2] : fraction[2];
    const z = clampAxis(base[2] + dz);
    for (let dy = 0; dy <= 1; dy += 1) {
      const weightY = dy === 0 ? 1 - fraction[1] : fraction[1];
      const y = clampAxis(base[1] + dy);
      for (let dx = 0; dx <= 1; dx += 1) {
        const weightX = dx === 0 ? 1 - fraction[0] : fraction[0];
        const x = clampAxis(base[0] + dx);
        deposits[x + y * resolution + z * resolution * resolution] +=
          sampleEnergy * weightX * weightY * weightZ;
      }
    }
  }
}

function traceSingleLaserRayCpu({
  origin,
  forward,
  fieldSign,
  rayPowerWeight,
  samplePressureGradient,
  stepSize,
  deflectionGain,
  maxStepDeflection,
  mediumAbsorption,
  deposits,
  resolution,
  maxTraceSteps,
  diagnostics,
  volumeShape,
}) {
  const position = [...origin];
  let direction = [...forward];
  let transmittance = rayPowerWeight;

  let escaped = false;
  for (let step = 0; step < maxTraceSteps; step += 1) {
    const gradient = samplePressureGradient(
      position[0],
      position[1],
      position[2],
    );
    const along =
      gradient[0] * direction[0] +
      gradient[1] * direction[1] +
      gradient[2] * direction[2];
    let deflectX = (gradient[0] - along * direction[0]) * deflectionGain;
    let deflectY = (gradient[1] - along * direction[1]) * deflectionGain;
    let deflectZ = (gradient[2] - along * direction[2]) * deflectionGain;
    deflectX *= fieldSign * stepSize;
    deflectY *= fieldSign * stepSize;
    deflectZ *= fieldSign * stepSize;
    const deflectionLength = Math.hypot(deflectX, deflectY, deflectZ);
    if (diagnostics) {
      diagnostics.maxUnclampedStepDeflectionRadians = Math.max(
        diagnostics.maxUnclampedStepDeflectionRadians,
        deflectionLength,
      );
    }
    if (deflectionLength > maxStepDeflection) {
      if (diagnostics) {
        diagnostics.angularClampCount += 1;
      }
      const rescale = maxStepDeflection / deflectionLength;
      deflectX *= rescale;
      deflectY *= rescale;
      deflectZ *= rescale;
    }
    direction = normalizeVector3([
      direction[0] + deflectX,
      direction[1] + deflectY,
      direction[2] + deflectZ,
    ]);

    depositLaserSampleTrilinearCpu(
      deposits,
      position,
      resolution,
      transmittance,
    );

    transmittance *= Math.exp(-mediumAbsorption * stepSize);
    if (transmittance < LASER_TRANSMITTANCE_EPSILON * rayPowerWeight) {
      break;
    }
    position[0] += direction[0] * stepSize;
    position[1] += direction[1] * stepSize;
    position[2] += direction[2] * stepSize;
    if (isOutsideUnitDomain(position, volumeShape)) {
      escaped = true;
      break;
    }
  }

  return { direction, escaped, position, transmittance };
}

function traceLaserDepositFieldCpu({
  samplePressureGradient,
  resolution,
  rayGridSize,
  steps,
  deflectionGain,
  maxStepDeflection,
  mediumAbsorption,
  basis,
  phasePairing,
  volumeShape,
}) {
  const deposits = new Float32Array(resolution * resolution * resolution);
  const { forward } = basis;
  const stepSize = 2 / steps;
  const maxTraceSteps = Math.ceil(
    (steps * LASER_REFERENCE_APPARATUS_PROFILE.maxOpticalPathLength) /
      LASER_REFERENCE_APPARATUS_PROFILE.cavityDiameter,
  );
  let rayCount = 0;
  const diagnostics = {
    angularClampCount: 0,
    maxUnclampedStepDeflectionRadians: 0,
    escapedPower: 0,
    forwardOutputPower: 0,
    nonForwardEscapePower: 0,
    absorbedPower: 0,
    unresolvedPower: 0,
    exitDirection: [0, 0, 0],
    exitPosition: [0, 0, 0],
  };

  for (let j = 0; j < rayGridSize; j += 1) {
    for (let i = 0; i < rayGridSize; i += 1) {
      const u = ((i + 0.5) / rayGridSize) * 2 - 1;
      const v = ((j + 0.5) / rayGridSize) * 2 - 1;
      const raySample = resolveLaserDomainRaySample({
        u,
        v,
        basis,
        volumeShape,
      });
      if (!raySample) {
        continue;
      }
      rayCount += 1;
      for (const phaseSample of getLaserRayPhaseSamples(phasePairing)) {
        const traced = traceSingleLaserRayCpu({
          origin: raySample.origin,
          forward,
          fieldSign: phaseSample.fieldSign,
          rayPowerWeight: phaseSample.powerWeight,
          samplePressureGradient,
          stepSize,
          deflectionGain,
          maxStepDeflection,
          mediumAbsorption,
          deposits,
          resolution,
          maxTraceSteps,
          diagnostics,
          volumeShape,
        });
        diagnostics.absorbedPower +=
          phaseSample.powerWeight - traced.transmittance;
        if (traced.escaped) {
          diagnostics.escapedPower += traced.transmittance;
          const forwardExitCosine =
            traced.direction[0] * forward[0] +
            traced.direction[1] * forward[1] +
            traced.direction[2] * forward[2];
          if (forwardExitCosine > 0) {
            // Every forward-going ray crosses an infinite output plane normal
            // to the incident beam. Integrated plane flux therefore receives
            // the ray's full remaining power, independent of exit angle.
            diagnostics.forwardOutputPower += traced.transmittance;
          } else {
            diagnostics.nonForwardEscapePower += traced.transmittance;
          }
          for (let axis = 0; axis < 3; axis += 1) {
            diagnostics.exitDirection[axis] +=
              traced.direction[axis] * traced.transmittance;
            diagnostics.exitPosition[axis] +=
              traced.position[axis] * traced.transmittance;
          }
        } else {
          diagnostics.unresolvedPower += traced.transmittance;
        }
      }
    }
  }

  return { deposits, diagnostics, rayCount };
}

function computeDirectBeamTransmittance({
  position,
  forward,
  mediumAbsorption,
  volumeShape,
}) {
  if (normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube) {
    if (isOutsideUnitDomain(position, VOLUME_SHAPES.cube)) {
      return 0;
    }
    const intersection = intersectUnitCubeRay(position, forward);
    const pathLength = intersection
      ? Math.max(0, -intersection.entryDistance)
      : 0;
    return Math.exp(-mediumAbsorption * pathLength);
  }

  const projection =
    position[0] * forward[0] +
    position[1] * forward[1] +
    position[2] * forward[2];
  const radiusSquared =
    position[0] * position[0] +
    position[1] * position[1] +
    position[2] * position[2];
  const lateralSquared = Math.max(0, radiusSquared - projection * projection);
  if (lateralSquared > 1) {
    return 0;
  }
  const halfChord = Math.sqrt(Math.max(0, 1 - lateralSquared));
  const pathLength = Math.min(
    halfChord * 2,
    Math.max(0, projection + halfChord),
  );
  return Math.exp(-mediumAbsorption * pathLength);
}

/**
 * CPU reference implementation of the GPU laser transport pass.
 *
 * Rays are collimated along `direction`, refracted per step by the
 * perpendicular component of the sampled pressure gradient (index
 * n = n₀ + κ·s·p̃ with an equal-power half-cycle pair per origin), attenuated
 * only by the uniform optical medium, and their transmittance is deposited at
 * each visited voxel. Acoustic unsigned support is not an absorber: it is a
 * modal-envelope diagnostic and cannot own optical extinction. Cloud-in-cell
 * deposits are normalized directly so a straight-ray flood resolves to
 * irradiance ≈ 1; converging rays produce values above 1 — the caustics.
 * Texture sampling supplies the reconstruction kernel, so no second blur may
 * erase transported caustic bandwidth. The traced family represents the
 * diffracted order. It is mixed with the analytic straight reference using the
 * fixed apparatus fractions, which sum to one and therefore lift accidental
 * transport shadows without creating optical power.
 *
 * @param {{
 *   samplePressureGradient?: ((x: number, y: number, z: number) => number[]) | null,
 *   resolution?: number,
 *   rayGridSize?: number,
 *   steps?: number,
 *   deflectionGain?: number,
 *   maxStepDeflection?: number,
 *   mediumAbsorption?: number,
 *   direction?: readonly number[],
 *   phasePairing?: boolean,
 *   diffractedPowerFraction?: number,
 *   volumeShape?: import("../volumeShape.js").VolumeShape,
 * }} [options]
 * @returns {{ irradiance: Float32Array, zeroOrderIrradiance: Float32Array,
 *   diffractedOrderIrradiance: Float32Array,
 *   resolution: number, rayCount: number,
 *   powerLedger: { incidentPower: number, escapedPower: number,
 *     forwardOutputPower: number, nonForwardEscapePower: number,
 *     absorbedPower: number, unresolvedPower: number, balanceError: number },
 *   transportDiagnostics: { angularClampCount: number,
 *     maxUnclampedStepDeflectionRadians: number,
 *     zeroOrderPowerFraction: number, diffractedPowerFraction: number,
 *     meanExitDirection: number[], meanExitPosition: number[] },
 *   volumeShape: import("../volumeShape.js").VolumeShape }}
 */
export function traceLaserTransportCpu({
  samplePressureGradient,
  resolution = LASER_TRANSPORT_RESOLUTION,
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  deflectionGain = LASER_DEFLECTION_GAIN,
  maxStepDeflection = LASER_MAX_STEP_DEFLECTION_RAD,
  mediumAbsorption = LASER_MEDIUM_ABSORPTION,
  direction = LASER_DEFAULT_DIRECTION,
  phasePairing = true,
  diffractedPowerFraction = LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction,
  volumeShape = VOLUME_SHAPES.sphere,
} = {}) {
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const orderPowerFractions = deriveLaserOrderPowerFractions(
    diffractedPowerFraction,
  );
  const {
    zeroOrderPowerFraction,
    diffractedPowerFraction: safeDiffractedPowerFraction,
  } = orderPowerFractions;
  if (typeof samplePressureGradient !== "function") {
    const cellCount = resolution * resolution * resolution;
    return {
      irradiance: new Float32Array(cellCount),
      zeroOrderIrradiance: new Float32Array(cellCount),
      diffractedOrderIrradiance: new Float32Array(cellCount),
      resolution,
      rayCount: 0,
      powerLedger: {
        incidentPower: 0,
        escapedPower: 0,
        forwardOutputPower: 0,
        nonForwardEscapePower: 0,
        absorbedPower: 0,
        unresolvedPower: 0,
        balanceError: 0,
      },
      transportDiagnostics: {
        angularClampCount: 0,
        maxUnclampedStepDeflectionRadians: 0,
        ...orderPowerFractions,
        meanExitDirection: [0, 0, 0],
        meanExitPosition: [0, 0, 0],
      },
      volumeShape: normalizedVolumeShape,
    };
  }

  const basis = buildLaserRayBasis(direction);
  const traced = traceLaserDepositFieldCpu({
    samplePressureGradient,
    resolution,
    rayGridSize,
    steps,
    deflectionGain,
    maxStepDeflection,
    mediumAbsorption,
    basis,
    phasePairing,
    volumeShape: normalizedVolumeShape,
  });
  // The straight reference uses the identical source grid, step cadence,
  // absorption, and CIC estimator. Dividing by that response removes only
  // estimator support lost at the finite boundary; it does not flatten the
  // refracted field or normalize real caustic concentration.
  const straightReference = traceLaserDepositFieldCpu({
    samplePressureGradient: () => ZERO_PRESSURE_GRADIENT,
    resolution,
    rayGridSize,
    steps,
    deflectionGain,
    maxStepDeflection,
    mediumAbsorption,
    basis,
    phasePairing: false,
    volumeShape: normalizedVolumeShape,
  });
  const resolved = traced.deposits.slice();
  const resolvedZeroOrder = new Float32Array(resolved.length);
  const resolvedDiffractedOrder = new Float32Array(resolved.length);
  const resolvedStraightReference = straightReference.deposits;
  const expected = computeExpectedDepositsPerVoxel({
    rayGridSize,
    steps,
    resolution,
    direction,
    volumeShape: normalizedVolumeShape,
  });
  const normalization = expected > 0 ? 1 / expected : 0;
  for (let index = 0; index < resolved.length; index += 1) {
    const straightIrradiance = resolvedStraightReference[index] * normalization;
    if (straightIrradiance <= LASER_CALIBRATION_EPSILON) {
      resolved[index] = 0;
      continue;
    }
    const x = index % resolution;
    const y = Math.floor(index / resolution) % resolution;
    const z = Math.floor(index / (resolution * resolution));
    const position = [
      ((x + 0.5) / resolution) * 2 - 1,
      ((y + 0.5) / resolution) * 2 - 1,
      ((z + 0.5) / resolution) * 2 - 1,
    ];
    const directTransmittance = computeDirectBeamTransmittance({
      position,
      forward: basis.forward,
      mediumAbsorption,
      volumeShape: normalizedVolumeShape,
    });
    const transportedIrradiance =
      (resolved[index] * normalization * directTransmittance) /
      straightIrradiance;
    resolvedZeroOrder[index] = directTransmittance * zeroOrderPowerFraction;
    resolvedDiffractedOrder[index] =
      transportedIrradiance * safeDiffractedPowerFraction;
    resolved[index] = resolvedZeroOrder[index] + resolvedDiffractedOrder[index];
  }
  const incidentPower = traced.rayCount > 0 ? 1 : 0;
  const normalizePower = traced.rayCount > 0 ? 1 / traced.rayCount : 0;
  const combinePower = (key) =>
    (straightReference.diagnostics[key] * zeroOrderPowerFraction +
      traced.diagnostics[key] * safeDiffractedPowerFraction) *
    normalizePower;
  const escapedPower = combinePower("escapedPower");
  const forwardOutputPower = combinePower("forwardOutputPower");
  const nonForwardEscapePower = combinePower("nonForwardEscapePower");
  const absorbedPower = combinePower("absorbedPower");
  const unresolvedPower = combinePower("unresolvedPower");
  const combinedExitPower = Math.max(
    straightReference.diagnostics.escapedPower * zeroOrderPowerFraction +
      traced.diagnostics.escapedPower * safeDiffractedPowerFraction,
    1e-12,
  );
  const meanExitDirection = traced.diagnostics.exitDirection.map(
    (component, axis) =>
      (straightReference.diagnostics.exitDirection[axis] *
        zeroOrderPowerFraction +
        component * safeDiffractedPowerFraction) /
      combinedExitPower,
  );
  const meanExitPosition = traced.diagnostics.exitPosition.map(
    (component, axis) =>
      (straightReference.diagnostics.exitPosition[axis] *
        zeroOrderPowerFraction +
        component * safeDiffractedPowerFraction) /
      combinedExitPower,
  );
  return {
    irradiance: resolved,
    zeroOrderIrradiance: resolvedZeroOrder,
    diffractedOrderIrradiance: resolvedDiffractedOrder,
    resolution,
    rayCount: traced.rayCount,
    powerLedger: {
      incidentPower,
      escapedPower,
      forwardOutputPower,
      nonForwardEscapePower,
      absorbedPower,
      unresolvedPower,
      balanceError: Math.abs(
        incidentPower - escapedPower - absorbedPower - unresolvedPower,
      ),
    },
    transportDiagnostics: {
      angularClampCount: traced.diagnostics.angularClampCount,
      maxUnclampedStepDeflectionRadians:
        traced.diagnostics.maxUnclampedStepDeflectionRadians,
      ...orderPowerFractions,
      meanExitDirection,
      meanExitPosition,
    },
    volumeShape: normalizedVolumeShape,
  };
}

function createClearKernel({ depositBuffer, cellCount }) {
  const cellCountInt = int(cellCount);
  return Fn(() => {
    const index = int(globalId.x);
    If(index.lessThan(cellCountInt), () => {
      atomicStore(depositBuffer.element(index), uint(0));
    });
  })().compute(
    /** @type {any} */ ([
      Math.ceil(cellCount / LASER_COMPUTE_WORKGROUP_LINEAR[0]),
      1,
      1,
    ]),
    Array.from(LASER_COMPUTE_WORKGROUP_LINEAR),
  );
}

function createTraceKernel({
  depositBuffer,
  fieldTexture,
  resolution,
  rayGridSize,
  steps,
  basis,
  phasePairing = true,
  deflectionGainNode = null,
  volumeShape = VOLUME_SHAPES.sphere,
}) {
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const isCubeVolume = normalizedVolumeShape === VOLUME_SHAPES.cube;
  const cubeProjectionExtents = getUnitCubeProjectionExtents(basis);
  const inverseForwardComponents = basis.forward.map((component) => {
    const safeComponent =
      Math.abs(component) > 1e-6 ? component : component >= 0 ? 1e-6 : -1e-6;
    return 1 / safeComponent;
  });
  const resolutionFloat = float(resolution);
  const resolutionEdge = float(resolution - 1);
  const resolutionInt = int(resolution);
  const rayGridInt = int(rayGridSize);
  const phaseSampleCount = phasePairing ? 2 : 1;
  const stepSize = float(2 / steps);
  const maxTraceSteps = Math.ceil(
    (steps * LASER_REFERENCE_APPARATUS_PROFILE.maxOpticalPathLength) /
      LASER_REFERENCE_APPARATUS_PROFILE.cavityDiameter,
  );
  const forward = vec3(basis.forward[0], basis.forward[1], basis.forward[2]);
  const tangent1 = vec3(
    basis.tangent1[0],
    basis.tangent1[1],
    basis.tangent1[2],
  );
  const tangent2 = vec3(
    basis.tangent2[0],
    basis.tangent2[1],
    basis.tangent2[2],
  );
  const deflectionGain = deflectionGainNode ?? float(LASER_DEFLECTION_GAIN);
  const maxStepDeflection = float(LASER_MAX_STEP_DEFLECTION_RAD);
  const mediumAbsorption = float(LASER_MEDIUM_ABSORPTION);
  const fixedPointScale = float(LASER_TRANSPORT_FIXED_POINT_SCALE);
  const transmittanceEpsilon = float(LASER_TRANSMITTANCE_EPSILON);
  const one = float(1.0);
  const half = float(0.5);

  return Fn(() => {
    const rayX = int(globalId.x);
    const rayY = int(globalId.y);
    const phaseSample = int(globalId.z);
    If(rayX.lessThan(rayGridInt).and(rayY.lessThan(rayGridInt)), () => {
      const u = float(rayX)
        .add(half)
        .div(float(rayGridInt))
        .mul(2)
        .sub(one)
        .toVar();
      const v = float(rayY)
        .add(half)
        .div(float(rayGridInt))
        .mul(2)
        .sub(one)
        .toVar();
      const lateralSquared = u.mul(u).add(v.mul(v));
      const entryDepth = max(lateralSquared.oneMinus(), float(0.0)).sqrt();
      let domainRayAccepted = lateralSquared.lessThanEqual(one);
      let domainRayOrigin = tangent1
        .mul(u)
        .add(tangent2.mul(v))
        .sub(forward.mul(entryDepth));
      if (isCubeVolume) {
        const projectedU = u.mul(float(cubeProjectionExtents.tangent1));
        const projectedV = v.mul(float(cubeProjectionExtents.tangent2));
        const rayStart = tangent1
          .mul(projectedU)
          .add(tangent2.mul(projectedV))
          .sub(forward.mul(float(cubeProjectionExtents.forward)));
        const inverseForward = vec3(
          inverseForwardComponents[0],
          inverseForwardComponents[1],
          inverseForwardComponents[2],
        );
        const intersectionA = vec3(-1.0).sub(rayStart).mul(inverseForward);
        const intersectionB = vec3(1.0).sub(rayStart).mul(inverseForward);
        const slabEntry = min(intersectionA, intersectionB);
        const slabExit = max(intersectionA, intersectionB);
        const cubeEntryDistance = max(
          max(slabEntry.x, slabEntry.y),
          slabEntry.z,
        );
        const cubeExitDistance = min(min(slabExit.x, slabExit.y), slabExit.z);
        const clampedCubeEntryDistance = max(cubeEntryDistance, float(0.0));
        domainRayAccepted = cubeExitDistance.greaterThanEqual(
          clampedCubeEntryDistance,
        );
        domainRayOrigin = rayStart.add(forward.mul(clampedCubeEntryDistance));
      }
      If(domainRayAccepted, () => {
        // The z dispatch dimension carries an equal-power +/- half-cycle pair
        // at the same physical ray origin. Acoustic phase is therefore never
        // correlated with source-grid position.
        const fieldSign = phasePairing
          ? float(phaseSample).mul(-2).add(one)
          : one;
        const rayPowerWeight = float(1 / phaseSampleCount);
        const position = domainRayOrigin.toVar();
        const direction = forward.toVar();
        const transmittance = rayPowerWeight.toVar();

        Loop({ start: int(0), end: int(maxTraceSteps), type: "int" }, () => {
          const sampleUv = position.add(1).mul(half);
          const gradient = fieldTexture
            ? (() => {
                const fieldSample = texture3D(fieldTexture).sample(sampleUv);
                return vec3(fieldSample.y, fieldSample.z, fieldSample.w);
              })()
            : vec3(0.0);
          const along = gradient.dot(direction);
          const deflection = gradient
            .sub(direction.mul(along))
            .mul(deflectionGain)
            .mul(fieldSign)
            .mul(stepSize)
            .toVar();
          const deflectionLength = deflection.length();
          If(deflectionLength.greaterThan(maxStepDeflection), () => {
            deflection.mulAssign(
              maxStepDeflection.div(max(deflectionLength, float(1e-9))),
            );
          });
          direction.assign(normalize(direction.add(deflection)));

          const gridPosition = position
            .add(one)
            .mul(half)
            .mul(resolutionFloat)
            .sub(half);
          const baseVoxel = floor(gridPosition);
          const voxelFraction = gridPosition.sub(baseVoxel);
          // Cloud-in-cell deposition is the adjoint of trilinear sampling.
          // Integer remainders are carried through each axis split, so the
          // eight fixed-point children sum exactly to this sample's quantized
          // energy. Clamp-to-edge then merges duplicate boundary entries
          // without discarding ray energy.
          const fixedSampleEnergy = uint(
            transmittance.mul(fixedPointScale).add(half),
          );
          const highXEnergy = uint(
            float(fixedSampleEnergy).mul(voxelFraction.x),
          );
          const lowXEnergy = fixedSampleEnergy.sub(highXEnergy);
          for (let dz = 0; dz <= 1; dz += 1) {
            const z = int(
              clamp(baseVoxel.z.add(float(dz)), float(0.0), resolutionEdge),
            );
            for (let dy = 0; dy <= 1; dy += 1) {
              const y = int(
                clamp(baseVoxel.y.add(float(dy)), float(0.0), resolutionEdge),
              );
              for (let dx = 0; dx <= 1; dx += 1) {
                const x = int(
                  clamp(baseVoxel.x.add(float(dx)), float(0.0), resolutionEdge),
                );
                const linearIndex = x
                  .add(y.mul(resolutionInt))
                  .add(z.mul(resolutionInt).mul(resolutionInt));
                const xEnergy = dx === 0 ? lowXEnergy : highXEnergy;
                const highYEnergy = uint(float(xEnergy).mul(voxelFraction.y));
                const yEnergy =
                  dy === 0 ? xEnergy.sub(highYEnergy) : highYEnergy;
                const highZEnergy = uint(float(yEnergy).mul(voxelFraction.z));
                const cicFixedEnergy =
                  dz === 0 ? yEnergy.sub(highZEnergy) : highZEnergy;
                atomicAdd(depositBuffer.element(linearIndex), cicFixedEnergy);
              }
            }
          }

          transmittance.mulAssign(exp(mediumAbsorption.negate().mul(stepSize)));
          If(
            transmittance.lessThan(transmittanceEpsilon.mul(rayPowerWeight)),
            () => {
              Break();
            },
          );
          position.addAssign(direction.mul(stepSize));
          const outsideDomain = isCubeVolume
            ? max(
                max(abs(position.x), abs(position.y)),
                abs(position.z),
              ).greaterThan(one)
            : position.dot(position).greaterThan(one);
          If(outsideDomain, () => {
            Break();
          });
        });
      });
    });
  })().compute(
    /** @type {any} */ ([
      Math.ceil(rayGridSize / LASER_COMPUTE_WORKGROUP_RAYS[0]),
      Math.ceil(rayGridSize / LASER_COMPUTE_WORKGROUP_RAYS[1]),
      phaseSampleCount,
    ]),
    Array.from(LASER_COMPUTE_WORKGROUP_RAYS),
  );
}

function createIrradianceResolveKernel({
  depositBuffer,
  irradianceTexture,
  calibrationTexture = null,
  resolution,
  normalization = 1,
  basis = null,
  mediumAbsorption = LASER_MEDIUM_ABSORPTION,
  diffractedPowerFraction = LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction,
  volumeShape = VOLUME_SHAPES.sphere,
}) {
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  const isCubeVolume = normalizedVolumeShape === VOLUME_SHAPES.cube;
  const inverseCalibrationForward = basis?.forward.map((component) => {
    const safeComponent =
      Math.abs(component) > 1e-6 ? component : component >= 0 ? 1e-6 : -1e-6;
    return 1 / safeComponent;
  });
  const writeIrradiance = storageTexture3D(irradianceTexture).setAccess(
    NodeAccess.WRITE_ONLY,
  );
  const resolutionInt = int(resolution);
  const normalizationNode = float(normalization);
  const calibrationEpsilon = float(LASER_CALIBRATION_EPSILON);
  const calibrationForward = basis
    ? vec3(basis.forward[0], basis.forward[1], basis.forward[2])
    : null;
  const mediumAbsorptionNode = float(mediumAbsorption);
  const orderPowerFractions = deriveLaserOrderPowerFractions(
    diffractedPowerFraction,
  );
  const diffractedPowerFractionNode = float(
    orderPowerFractions.diffractedPowerFraction,
  );
  const zeroOrderPowerFractionNode = float(
    orderPowerFractions.zeroOrderPowerFraction,
  );
  const half = float(0.5);
  const one = float(1.0);

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = int(voxelCoord.x)
      .lessThan(resolutionInt)
      .and(int(voxelCoord.y).lessThan(resolutionInt))
      .and(int(voxelCoord.z).lessThan(resolutionInt));
    If(inBounds, () => {
      const x = int(voxelCoord.x);
      const y = int(voxelCoord.y);
      const z = int(voxelCoord.z);
      const linearIndex = x
        .add(y.mul(resolutionInt))
        .add(z.mul(resolutionInt).mul(resolutionInt));
      // CIC deposition is the adjoint of the texture's trilinear sampler and
      // already provides a normalized reconstruction footprint. Resolve each
      // voxel directly so a second spatial filter cannot erase caustic detail.
      const depositedEnergy = float(
        /** @type {any} */ (atomicLoad(depositBuffer.element(linearIndex))),
      );
      const resolvedIrradiance = depositedEnergy.mul(normalizationNode).toVar();
      const resolvedZeroOrderIrradiance = float(0.0).toVar();
      const resolvedDiffractedOrderIrradiance = float(0.0).toVar();
      if (calibrationTexture && calibrationForward) {
        const sampleUv = vec3(
          float(voxelCoord.x).add(half).div(float(resolution)),
          float(voxelCoord.y).add(half).div(float(resolution)),
          float(voxelCoord.z).add(half).div(float(resolution)),
        );
        const straightReference =
          texture3D(calibrationTexture).sample(sampleUv).x;
        resolvedIrradiance.assign(float(0.0));
        If(straightReference.greaterThan(calibrationEpsilon), () => {
          const position = sampleUv.mul(2).sub(one);
          const resolveCalibratedIrradiance = (pathLength) => {
            const directTransmittance = exp(
              mediumAbsorptionNode.negate().mul(pathLength),
            );
            const diffractedIrradiance = depositedEnergy
              .mul(normalizationNode)
              .mul(directTransmittance)
              .div(straightReference);
            resolvedZeroOrderIrradiance.assign(
              directTransmittance.mul(zeroOrderPowerFractionNode),
            );
            resolvedDiffractedOrderIrradiance.assign(
              diffractedIrradiance.mul(diffractedPowerFractionNode),
            );
            resolvedIrradiance.assign(
              resolvedZeroOrderIrradiance.add(
                resolvedDiffractedOrderIrradiance,
              ),
            );
          };

          if (isCubeVolume) {
            const inverseForward = vec3(
              inverseCalibrationForward[0],
              inverseCalibrationForward[1],
              inverseCalibrationForward[2],
            );
            const intersectionA = vec3(-1.0).sub(position).mul(inverseForward);
            const intersectionB = vec3(1.0).sub(position).mul(inverseForward);
            const slabEntry = min(intersectionA, intersectionB);
            const cubeEntryDistance = max(
              max(slabEntry.x, slabEntry.y),
              slabEntry.z,
            );
            const cubeDistance = max(
              max(abs(position.x), abs(position.y)),
              abs(position.z),
            );
            If(cubeDistance.lessThanEqual(one), () => {
              resolveCalibratedIrradiance(
                max(cubeEntryDistance.negate(), float(0.0)),
              );
            });
          } else {
            const projection = position.dot(calibrationForward);
            const lateralSquared = max(
              position.dot(position).sub(projection.mul(projection)),
              float(0.0),
            );
            If(lateralSquared.lessThanEqual(one), () => {
              const halfChord = one.sub(lateralSquared).sqrt();
              resolveCalibratedIrradiance(
                clamp(projection.add(halfChord), float(0.0), halfChord.mul(2)),
              );
            });
          }
        });
      }
      textureStore(
        writeIrradiance,
        voxelCoord,
        vec4(
          resolvedIrradiance,
          resolvedZeroOrderIrradiance,
          resolvedDiffractedOrderIrradiance,
          1.0,
        ),
      ).toWriteOnly();
    });
  })().compute(
    /** @type {any} */ ([
      Math.ceil(resolution / LASER_COMPUTE_WORKGROUP_3D[0]),
      Math.ceil(resolution / LASER_COMPUTE_WORKGROUP_3D[1]),
      Math.ceil(resolution / LASER_COMPUTE_WORKGROUP_3D[2]),
    ]),
    Array.from(LASER_COMPUTE_WORKGROUP_3D),
  );
}

/**
 * Create the order-resolved acousto-optic laser transport cache. Texture RGB
 * stores total, transmitted zero-order, and diffracted-order irradiance; alpha
 * stores readiness. The order weights sum to one before absorption or cavity
 * escape, and the detector remains free to accept those orders independently.
 */
export function createRaymarchLaserTransportCache({
  resolution = LASER_TRANSPORT_RESOLUTION,
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  direction = LASER_DEFAULT_DIRECTION,
  volumeShape = VOLUME_SHAPES.sphere,
} = {}) {
  const normalizedResolution = Math.max(8, Math.round(resolution));
  return {
    semantic: LASER_TRANSPORT_SEMANTIC,
    resolution: normalizedResolution,
    rayGridSize: Math.max(8, Math.round(rayGridSize)),
    steps: Math.max(8, Math.round(steps)),
    basis: buildLaserRayBasis(direction),
    volumeShape: normalizeVolumeShape(volumeShape),
    irradianceTexture: createRaymarchCacheTexture(normalizedResolution),
    straightCalibrationTexture:
      createRaymarchCacheTexture(normalizedResolution),
    depositBuffer: null,
    kernels: null,
    kernelFieldTexture: null,
    kernelVolumeShape: null,
    calibrationReady: false,
    active: false,
    ready: false,
    dispatchCount: 0,
    backend: "compute",
    lastError: null,
    lastComputeReason: "uninitialized",
  };
}

function disposeLaserTransportKernels(cache) {
  if (!cache?.kernels) {
    return;
  }
  Object.values(cache.kernels).forEach((kernel) => {
    kernel?.dispose?.();
  });
  cache.kernels = null;
  cache.kernelFieldTexture = null;
  cache.kernelVolumeShape = null;
}

export function setRaymarchLaserTransportVolumeShape(cache, volumeShape) {
  if (!cache) {
    return false;
  }
  const normalizedVolumeShape = normalizeVolumeShape(volumeShape);
  if (cache.volumeShape === normalizedVolumeShape) {
    return false;
  }

  disposeLaserTransportKernels(cache);
  cache.volumeShape = normalizedVolumeShape;
  cache.calibrationReady = false;
  cache.active = false;
  cache.ready = false;
  cache.lastComputeReason = "volume-shape-changed";
  return true;
}

function getOrCreateLaserTransportKernels(cache, { fieldTexture, uniforms }) {
  const normalizedVolumeShape = normalizeVolumeShape(cache.volumeShape);
  if (
    cache.kernels &&
    cache.kernelFieldTexture === fieldTexture &&
    cache.kernelVolumeShape === normalizedVolumeShape
  ) {
    return cache.kernels;
  }
  disposeLaserTransportKernels(cache);
  const cellCount = cache.resolution ** 3;
  if (!cache.depositBuffer) {
    cache.depositBuffer = instancedArray(cellCount, "uint").toAtomic();
  }
  const expectedDepositsPerVoxel = computeExpectedDepositsPerVoxel({
    rayGridSize: cache.rayGridSize,
    steps: cache.steps,
    resolution: cache.resolution,
    basis: cache.basis,
    volumeShape: normalizedVolumeShape,
  });
  const normalization =
    expectedDepositsPerVoxel > 0
      ? 1 / (expectedDepositsPerVoxel * LASER_TRANSPORT_FIXED_POINT_SCALE)
      : 0;
  cache.kernels = {
    clear: createClearKernel({
      depositBuffer: cache.depositBuffer,
      cellCount,
    }),
    trace: createTraceKernel({
      depositBuffer: cache.depositBuffer,
      fieldTexture,
      resolution: cache.resolution,
      rayGridSize: cache.rayGridSize,
      steps: cache.steps,
      basis: cache.basis,
      phasePairing: true,
      deflectionGainNode: uniforms?.uLaserDeflectionGain ?? null,
      volumeShape: normalizedVolumeShape,
    }),
    traceCalibration: createTraceKernel({
      depositBuffer: cache.depositBuffer,
      fieldTexture: null,
      resolution: cache.resolution,
      rayGridSize: cache.rayGridSize,
      steps: cache.steps,
      basis: cache.basis,
      phasePairing: false,
      volumeShape: normalizedVolumeShape,
    }),
    resolve: createIrradianceResolveKernel({
      depositBuffer: cache.depositBuffer,
      irradianceTexture: cache.irradianceTexture,
      calibrationTexture: cache.straightCalibrationTexture,
      resolution: cache.resolution,
      normalization,
      basis: cache.basis,
      mediumAbsorption: LASER_MEDIUM_ABSORPTION,
      diffractedPowerFraction:
        LASER_REFERENCE_APPARATUS_PROFILE.diffractedPowerFraction,
      volumeShape: normalizedVolumeShape,
    }),
    resolveCalibration: createIrradianceResolveKernel({
      depositBuffer: cache.depositBuffer,
      irradianceTexture: cache.straightCalibrationTexture,
      resolution: cache.resolution,
      normalization,
      volumeShape: normalizedVolumeShape,
    }),
  };
  cache.kernelFieldTexture = fieldTexture;
  cache.kernelVolumeShape = normalizedVolumeShape;
  return cache.kernels;
}

/**
 * Run the laser transport pass for the current frame. Requires the live
 * field projection cache to be current: the pressure gradient it samples is
 * this frame's coherent modal field, so the pass fails closed with it.
 *
 * @param {ReturnType<typeof createRaymarchLaserTransportCache> | null} cache
 * @param {{ compute?: (node: unknown) => void } | null} renderer
 * @param {{ fieldTexture?: object | null,
 *   uniforms?: { uLaserDeflectionGain?: object } | null,
 *   volumeShape?: import("../volumeShape.js").VolumeShape }} [inputs]
 */
export function computeRaymarchLaserTransportCache(
  cache,
  renderer,
  { fieldTexture, uniforms = null, volumeShape = cache?.volumeShape } = {},
) {
  if (!cache) {
    return { computed: false, reason: "unavailable" };
  }
  setRaymarchLaserTransportVolumeShape(cache, volumeShape);
  if (cache.backend === "unavailable") {
    cache.active = false;
    return { computed: false, reason: "unavailable" };
  }
  if (!renderer || typeof renderer.compute !== "function") {
    cache.active = false;
    cache.ready = false;
    cache.lastComputeReason = "renderer-unavailable";
    return { computed: false, reason: "renderer-unavailable" };
  }
  if (!fieldTexture) {
    cache.active = false;
    cache.ready = false;
    cache.lastComputeReason = "field-texture-unavailable";
    return { computed: false, reason: "field-texture-unavailable" };
  }

  try {
    // Kernel construction stays inside the guard: a TSL construction error
    // must fail this pass closed, never propagate into the render tick.
    const kernels = getOrCreateLaserTransportKernels(cache, {
      fieldTexture,
      uniforms,
    });
    if (!cache.calibrationReady) {
      renderer.compute(kernels.clear);
      renderer.compute(kernels.traceCalibration);
      renderer.compute(kernels.resolveCalibration);
      cache.calibrationReady = true;
    }
    renderer.compute(kernels.clear);
    renderer.compute(kernels.trace);
    renderer.compute(kernels.resolve);
  } catch (error) {
    cache.active = false;
    cache.ready = false;
    cache.backend = "unavailable";
    cache.lastError = error instanceof Error ? error.message : String(error);
    cache.lastComputeReason = "compute-failed";
    return { computed: false, reason: "compute-failed" };
  }

  cache.active = true;
  cache.ready = true;
  cache.dispatchCount = Math.max(0, Math.floor(cache.dispatchCount ?? 0)) + 1;
  cache.lastError = null;
  cache.lastComputeReason = "frame-current";
  return { computed: true, reason: "frame-current" };
}

export function deactivateRaymarchLaserTransportCache(cache, reason) {
  if (!cache) {
    return;
  }
  cache.active = false;
  cache.ready = false;
  cache.lastComputeReason = reason ?? "deactivated";
}

export function disposeRaymarchLaserTransportCache(cache) {
  cache?.irradianceTexture?.dispose?.();
  cache?.straightCalibrationTexture?.dispose?.();
  cache?.depositBuffer?.dispose?.();
  disposeLaserTransportKernels(cache);
}
