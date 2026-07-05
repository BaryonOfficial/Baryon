import {
  Break,
  Fn,
  If,
  Loop,
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

export const LASER_TRANSPORT_SEMANTIC =
  "acousto-optic-refracted-laser-irradiance";
export const LASER_TRANSPORT_RESOLUTION = 64;
export const LASER_TRANSPORT_RAY_GRID_SIZE = 128;
export const LASER_TRANSPORT_STEPS = 96;
export const LASER_TRANSPORT_FIXED_POINT_SCALE = 1024;
// Exaggerated acousto-optic coupling. Physically Δn/n in water is
// ~1e-6·(p/atm) via the piezo-optic (Gladstone–Dale) relation, which bends
// light too little to form caustics inside a render-scale cavity; the gain
// dial preserves the *structure* of the deflection law d(n·dr/ds)/ds = ∇n
// while scaling its strength, the same honesty pattern as the 40-octave
// spectral fold. Live value is the `laserDeflectionGain` control
// (uLaserDeflectionGain); this constant is the CPU-reference default.
export const LASER_DEFLECTION_GAIN = RAYMARCH_DEFAULTS.laserDeflectionGain;
export const LASER_MAX_STEP_DEFLECTION_RAD = 0.25;
export const LASER_MEDIUM_ABSORPTION = 0.02;
export const LASER_SUPPORT_EXTINCTION = 0.55;
export const LASER_TRANSMITTANCE_EPSILON = 1e-3;
// Side entry, slightly oblique so caustic sheets read in depth from the
// default camera instead of edge-on.
export const LASER_DEFAULT_DIRECTION = Object.freeze(
  normalizeVector3([0.78, 0.3, 0.55]),
);

const LASER_COMPUTE_WORKGROUP_3D = Object.freeze([8, 8, 4]);
const LASER_COMPUTE_WORKGROUP_RAYS = Object.freeze([8, 8, 1]);
const LASER_COMPUTE_WORKGROUP_LINEAR = Object.freeze([64, 1, 1]);
const TENT_FILTER_WEIGHTS = Object.freeze([1, 2, 1]);
const TENT_FILTER_WEIGHT_TOTAL = 64;

function normalizeVector3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(length > 0)) {
    return [1, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

/**
 * Orthonormal ray-grid basis for a collimated beam along `direction`.
 *
 * The beam floods the full cavity cross-section: ray origins span the
 * tangent-plane disk and enter on the unit sphere, matching a collimated
 * laser sheet flooding a water tank.
 */
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
 * Analytic normalization so a straight-ray flood resolves to irradiance ≈ 1.
 *
 * Total deposits ≈ Σ_rays chord/ds spread over the sphere's voxel count;
 * the tent resolve filter is sum-preserving so it does not change this.
 */
export function computeExpectedDepositsPerVoxel({
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  resolution = LASER_TRANSPORT_RESOLUTION,
} = {}) {
  const stepSize = 2 / steps;
  let expectedDeposits = 0;
  for (let j = 0; j < rayGridSize; j += 1) {
    for (let i = 0; i < rayGridSize; i += 1) {
      const u = ((i + 0.5) / rayGridSize) * 2 - 1;
      const v = ((j + 0.5) / rayGridSize) * 2 - 1;
      const lateralSquared = u * u + v * v;
      if (lateralSquared > 1) {
        continue;
      }
      expectedDeposits += (2 * Math.sqrt(1 - lateralSquared)) / stepSize;
    }
  }
  const voxelSide = 2 / resolution;
  const sphereVoxelCount = ((4 / 3) * Math.PI) / voxelSide ** 3;
  return expectedDeposits / Math.max(sphereVoxelCount, 1);
}

function depositVoxelIndex(position, resolution) {
  const clampAxis = (value) =>
    Math.min(
      resolution - 1,
      Math.max(0, Math.floor(((value + 1) * 0.5) * resolution)),
    );
  return (
    clampAxis(position[0]) +
    clampAxis(position[1]) * resolution +
    clampAxis(position[2]) * resolution * resolution
  );
}

function traceSingleLaserRayCpu({
  origin,
  forward,
  fieldSign,
  samplePressureGradient,
  sampleSupport,
  steps,
  stepSize,
  deflectionGain,
  maxStepDeflection,
  mediumAbsorption,
  supportExtinction,
  deposits,
  resolution,
}) {
  const position = [...origin];
  let direction = [...forward];
  let transmittance = 1;

  for (let step = 0; step < steps; step += 1) {
    const gradient = samplePressureGradient(
      position[0],
      position[1],
      position[2],
    );
    const support = sampleSupport(position[0], position[1], position[2]);
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
    if (deflectionLength > maxStepDeflection) {
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

    deposits[depositVoxelIndex(position, resolution)] += transmittance;

    transmittance *= Math.exp(
      -(mediumAbsorption + supportExtinction * Math.max(0, support)) *
        stepSize,
    );
    if (transmittance < LASER_TRANSMITTANCE_EPSILON) {
      break;
    }
    position[0] += direction[0] * stepSize;
    position[1] += direction[1] * stepSize;
    position[2] += direction[2] * stepSize;
    if (
      position[0] * position[0] +
        position[1] * position[1] +
        position[2] * position[2] >
      1
    ) {
      break;
    }
  }
}

function applyTentFilterCpu(deposits, resolution) {
  const filtered = new Float32Array(deposits.length);
  const clampAxis = (value) => Math.min(resolution - 1, Math.max(0, value));
  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        let total = 0;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const weight =
                TENT_FILTER_WEIGHTS[dx + 1] *
                TENT_FILTER_WEIGHTS[dy + 1] *
                TENT_FILTER_WEIGHTS[dz + 1];
              const index =
                clampAxis(x + dx) +
                clampAxis(y + dy) * resolution +
                clampAxis(z + dz) * resolution * resolution;
              total += deposits[index] * weight;
            }
          }
        }
        filtered[x + y * resolution + z * resolution * resolution] =
          total / TENT_FILTER_WEIGHT_TOTAL;
      }
    }
  }
  return filtered;
}

/**
 * CPU reference implementation of the GPU laser transport pass.
 *
 * Rays are collimated along `direction`, refracted per step by the
 * perpendicular component of the sampled pressure gradient (index
 * n = n₀ + κ·s·p̃ with an alternating time-average sign per ray), attenuated
 * by medium and acoustic-support extinction, and their transmittance is
 * deposited at each visited voxel. Deposits are tent-filtered and normalized
 * so a straight-ray flood resolves to irradiance ≈ 1; converging rays
 * produce values above 1 — the caustics.
 *
 * @param {{
 *   samplePressureGradient?: ((x: number, y: number, z: number) => number[]) | null,
 *   sampleSupport?: (x: number, y: number, z: number) => number,
 *   resolution?: number,
 *   rayGridSize?: number,
 *   steps?: number,
 *   deflectionGain?: number,
 *   maxStepDeflection?: number,
 *   mediumAbsorption?: number,
 *   supportExtinction?: number,
 *   direction?: readonly number[],
 *   oscillationParity?: boolean,
 * }} [options]
 * @returns {{ irradiance: Float32Array, resolution: number, rayCount: number }}
 */
export function traceLaserTransportCpu({
  samplePressureGradient,
  sampleSupport = () => 0,
  resolution = LASER_TRANSPORT_RESOLUTION,
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  deflectionGain = LASER_DEFLECTION_GAIN,
  maxStepDeflection = LASER_MAX_STEP_DEFLECTION_RAD,
  mediumAbsorption = LASER_MEDIUM_ABSORPTION,
  supportExtinction = LASER_SUPPORT_EXTINCTION,
  direction = LASER_DEFAULT_DIRECTION,
  oscillationParity = true,
} = {}) {
  const deposits = new Float32Array(resolution * resolution * resolution);
  if (typeof samplePressureGradient !== "function") {
    return { irradiance: deposits, resolution, rayCount: 0 };
  }

  const { forward, tangent1, tangent2 } = buildLaserRayBasis(direction);
  const stepSize = 2 / steps;
  let rayCount = 0;

  for (let j = 0; j < rayGridSize; j += 1) {
    for (let i = 0; i < rayGridSize; i += 1) {
      const u = ((i + 0.5) / rayGridSize) * 2 - 1;
      const v = ((j + 0.5) / rayGridSize) * 2 - 1;
      const lateralSquared = u * u + v * v;
      if (lateralSquared > 1) {
        continue;
      }
      rayCount += 1;
      // Alternating sign time-averages the oscillating index grating: a
      // standing wave refracts on both half-cycles, and cameras integrate
      // the two caustic families.
      const fieldSign = oscillationParity && (i + j) % 2 === 1 ? -1 : 1;
      const entryDepth = Math.sqrt(1 - lateralSquared);
      traceSingleLaserRayCpu({
        origin: [
          tangent1[0] * u + tangent2[0] * v - forward[0] * entryDepth,
          tangent1[1] * u + tangent2[1] * v - forward[1] * entryDepth,
          tangent1[2] * u + tangent2[2] * v - forward[2] * entryDepth,
        ],
        forward,
        fieldSign,
        samplePressureGradient,
        sampleSupport,
        steps,
        stepSize,
        deflectionGain,
        maxStepDeflection,
        mediumAbsorption,
        supportExtinction,
        deposits,
        resolution,
      });
    }
  }

  const filtered = applyTentFilterCpu(deposits, resolution);
  const expected = computeExpectedDepositsPerVoxel({
    rayGridSize,
    steps,
    resolution,
  });
  const normalization = expected > 0 ? 1 / expected : 0;
  for (let index = 0; index < filtered.length; index += 1) {
    filtered[index] *= normalization;
  }
  return { irradiance: filtered, resolution, rayCount };
}

function createClearKernel({ depositBuffer, cellCount }) {
  const cellCountInt = int(cellCount);
  return Fn(() => {
    const index = int(globalId.x);
    If(index.lessThan(cellCountInt), () => {
      atomicStore(depositBuffer.element(index), uint(0));
    });
  })().compute(
    /** @type {any} */ ([Math.ceil(cellCount / LASER_COMPUTE_WORKGROUP_LINEAR[0]), 1, 1]),
    Array.from(LASER_COMPUTE_WORKGROUP_LINEAR),
  );
}

function createTraceKernel({
  depositBuffer,
  fieldTexture,
  supportTexture,
  resolution,
  rayGridSize,
  steps,
  basis,
  deflectionGainNode = null,
}) {
  const resolutionFloat = float(resolution);
  const resolutionInt = int(resolution);
  const rayGridInt = int(rayGridSize);
  const stepSize = float(2 / steps);
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
  const supportExtinction = float(LASER_SUPPORT_EXTINCTION);
  const fixedPointScale = float(LASER_TRANSPORT_FIXED_POINT_SCALE);
  const transmittanceEpsilon = float(LASER_TRANSMITTANCE_EPSILON);
  const one = float(1.0);
  const half = float(0.5);

  return Fn(() => {
    const rayX = int(globalId.x);
    const rayY = int(globalId.y);
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
      If(lateralSquared.lessThanEqual(one), () => {
        const entryDepth = lateralSquared.oneMinus().sqrt();
        // (i + j) parity alternates the index sign: the oscillating grating's
        // two half-cycles time-average into both caustic families.
        const fieldSign = float(rayX.add(rayY).bitAnd(int(1)))
          .mul(-2)
          .add(one)
          .toVar();
        const position = tangent1
          .mul(u)
          .add(tangent2.mul(v))
          .sub(forward.mul(entryDepth))
          .toVar();
        const direction = forward.toVar();
        const transmittance = one.toVar();

        Loop({ start: int(0), end: int(steps), type: "int" }, () => {
          const sampleUv = position.add(1).mul(half);
          const fieldSample = texture3D(fieldTexture).sample(sampleUv);
          const supportSample = texture3D(supportTexture).sample(sampleUv);
          const gradient = vec3(fieldSample.y, fieldSample.z, fieldSample.w);
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

          const voxel = clamp(
            floor(position.add(1).mul(half).mul(resolutionFloat)),
            vec3(0.0),
            vec3(resolution - 1),
          );
          const linearIndex = int(voxel.x)
            .add(int(voxel.y).mul(resolutionInt))
            .add(int(voxel.z).mul(resolutionInt).mul(resolutionInt));
          atomicAdd(
            depositBuffer.element(linearIndex),
            uint(transmittance.mul(fixedPointScale).add(half)),
          );

          transmittance.mulAssign(
            exp(
              mediumAbsorption
                .add(supportExtinction.mul(max(supportSample.x, float(0.0))))
                .negate()
                .mul(stepSize),
            ),
          );
          If(transmittance.lessThan(transmittanceEpsilon), () => {
            Break();
          });
          position.addAssign(direction.mul(stepSize));
          If(position.dot(position).greaterThan(one), () => {
            Break();
          });
        });
      });
    });
  })().compute(
    /** @type {any} */ ([
      Math.ceil(rayGridSize / LASER_COMPUTE_WORKGROUP_RAYS[0]),
      Math.ceil(rayGridSize / LASER_COMPUTE_WORKGROUP_RAYS[1]),
      1,
    ]),
    Array.from(LASER_COMPUTE_WORKGROUP_RAYS),
  );
}

function createResolveKernel({
  depositBuffer,
  irradianceTexture,
  resolution,
  expectedDepositsPerVoxel,
}) {
  const writeIrradiance = storageTexture3D(irradianceTexture).setAccess(
    NodeAccess.WRITE_ONLY,
  );
  const resolutionInt = int(resolution);
  const normalization = float(
    expectedDepositsPerVoxel > 0
      ? 1 /
          (expectedDepositsPerVoxel *
            LASER_TRANSPORT_FIXED_POINT_SCALE *
            TENT_FILTER_WEIGHT_TOTAL)
      : 0,
  );

  return Fn(() => {
    const voxelCoord = uvec3(globalId);
    const inBounds = int(voxelCoord.x)
      .lessThan(resolutionInt)
      .and(int(voxelCoord.y).lessThan(resolutionInt))
      .and(int(voxelCoord.z).lessThan(resolutionInt));
    If(inBounds, () => {
      const total = float(0.0).toVar();
      // Sum-preserving [1,2,1]³ tent filter smooths nearest-voxel deposit
      // quantization without atomics contention in the trace pass. The 27
      // neighbors are flattened into one loop: i = (dz+1)·9 + (dy+1)·3 + (dx+1).
      Loop(
        { start: int(0), end: int(27), type: "int", condition: "<" },
        ({ i }) => {
          const dz = float(i.div(9)).sub(1);
          const remainder = i.sub(i.div(9).mul(9));
          const dy = float(remainder.div(3)).sub(1);
          const dx = float(remainder.sub(remainder.div(3).mul(3))).sub(1);
          const resolutionEdge = float(resolution - 1);
          const nx = clamp(
            float(voxelCoord.x).add(dx),
            float(0.0),
            resolutionEdge,
          );
          const ny = clamp(
            float(voxelCoord.y).add(dy),
            float(0.0),
            resolutionEdge,
          );
          const nz = clamp(
            float(voxelCoord.z).add(dz),
            float(0.0),
            resolutionEdge,
          );
          const weight = float(2.0)
            .sub(dx.abs())
            .mul(float(2.0).sub(dy.abs()))
            .mul(float(2.0).sub(dz.abs()));
          const neighborIndex = int(nx)
            .add(int(ny).mul(resolutionInt))
            .add(int(nz).mul(resolutionInt).mul(resolutionInt));
          total.addAssign(
            float(
              /** @type {any} */ (
                atomicLoad(depositBuffer.element(neighborIndex))
              ),
            ).mul(weight),
          );
        },
      );
      textureStore(
        writeIrradiance,
        voxelCoord,
        vec4(total.mul(normalization), 0.0, 0.0, 1.0),
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
 * Create the refracted laser transport cache: an irradiance volume written
 * each frame by tracing collimated laser rays through the acoustically
 * modulated refractive index of the water cavity.
 */
export function createRaymarchLaserTransportCache({
  resolution = LASER_TRANSPORT_RESOLUTION,
  rayGridSize = LASER_TRANSPORT_RAY_GRID_SIZE,
  steps = LASER_TRANSPORT_STEPS,
  direction = LASER_DEFAULT_DIRECTION,
} = {}) {
  const normalizedResolution = Math.max(8, Math.round(resolution));
  return {
    semantic: LASER_TRANSPORT_SEMANTIC,
    resolution: normalizedResolution,
    rayGridSize: Math.max(8, Math.round(rayGridSize)),
    steps: Math.max(8, Math.round(steps)),
    basis: buildLaserRayBasis(direction),
    irradianceTexture: createRaymarchCacheTexture(normalizedResolution),
    depositBuffer: null,
    kernels: null,
    active: false,
    ready: false,
    backend: "compute",
    lastError: null,
    lastComputeReason: "uninitialized",
  };
}

function getOrCreateLaserTransportKernels(
  cache,
  { fieldTexture, supportTexture, uniforms },
) {
  if (
    cache.kernels &&
    cache.kernelFieldTexture === fieldTexture &&
    cache.kernelSupportTexture === supportTexture
  ) {
    return cache.kernels;
  }
  const cellCount = cache.resolution ** 3;
  if (!cache.depositBuffer) {
    cache.depositBuffer = instancedArray(cellCount, "uint").toAtomic();
  }
  cache.kernels = {
    clear: createClearKernel({
      depositBuffer: cache.depositBuffer,
      cellCount,
    }),
    trace: createTraceKernel({
      depositBuffer: cache.depositBuffer,
      fieldTexture,
      supportTexture,
      resolution: cache.resolution,
      rayGridSize: cache.rayGridSize,
      steps: cache.steps,
      basis: cache.basis,
      deflectionGainNode: uniforms?.uLaserDeflectionGain ?? null,
    }),
    resolve: createResolveKernel({
      depositBuffer: cache.depositBuffer,
      irradianceTexture: cache.irradianceTexture,
      resolution: cache.resolution,
      expectedDepositsPerVoxel: computeExpectedDepositsPerVoxel({
        rayGridSize: cache.rayGridSize,
        steps: cache.steps,
        resolution: cache.resolution,
      }),
    }),
  };
  cache.kernelFieldTexture = fieldTexture;
  cache.kernelSupportTexture = supportTexture;
  return cache.kernels;
}

/**
 * Run the laser transport pass for the current frame. Requires the live
 * field projection cache to be current: the pressure gradient it samples is
 * this frame's coherent modal field, so the pass fails closed with it.
 *
 * @param {ReturnType<typeof createRaymarchLaserTransportCache> | null} cache
 * @param {{ compute?: (node: unknown) => void } | null} renderer
 * @param {{ fieldTexture?: object | null, supportTexture?: object | null,
 *   uniforms?: { uLaserDeflectionGain?: object } | null }} [inputs]
 */
export function computeRaymarchLaserTransportCache(
  cache,
  renderer,
  { fieldTexture, supportTexture, uniforms = null } = {},
) {
  if (!cache) {
    return { computed: false, reason: "unavailable" };
  }
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
  if (!fieldTexture || !supportTexture) {
    cache.active = false;
    cache.ready = false;
    cache.lastComputeReason = "field-textures-unavailable";
    return { computed: false, reason: "field-textures-unavailable" };
  }

  try {
    // Kernel construction stays inside the guard: a TSL construction error
    // must fail this pass closed, never propagate into the render tick.
    const kernels = getOrCreateLaserTransportKernels(cache, {
      fieldTexture,
      supportTexture,
      uniforms,
    });
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
  cache?.depositBuffer?.dispose?.();
  if (cache?.kernels) {
    Object.values(cache.kernels).forEach((kernel) => {
      kernel?.dispose?.();
    });
    cache.kernels = null;
  }
}
