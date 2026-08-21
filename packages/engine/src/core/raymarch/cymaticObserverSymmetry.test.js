import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CYMATIC_OBSERVER_REFERENCE,
  deriveCymaticObserverBlend,
} from "./cymaticObserverReference.js";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
  deriveFieldCacheVoxelRank,
  sortFieldCacheVoxelIndex,
} from "./fieldCacheGeometry.js";
import { resolveSpectralChromaticity } from "./spectralColorimetry.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";

const PERMUTATIONS = Object.freeze([
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [2, 1, 0],
  [1, 2, 0],
  [2, 0, 1],
]);

const f32 = Math.fround;
const half = (value) =>
  THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(value));
const add = (left, right) => f32(f32(left) + f32(right));
const sub = (left, right) => f32(f32(left) - f32(right));
const mul = (left, right) => f32(f32(left) * f32(right));
const div = (left, right) => f32(f32(left) / f32(right));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (left, right, amount) =>
  add(mul(left, sub(1, amount)), mul(right, amount));
const dot = (left, right) =>
  add(
    add(mul(left[0], right[0]), mul(left[1], right[1])),
    mul(left[2], right[2]),
  );
const magnitude = (vector) => f32(Math.sqrt(dot(vector, vector)));
const magnitude2 = (vector) =>
  f32(Math.sqrt(add(mul(vector[0], vector[0]), mul(vector[1], vector[1]))));
const quantizeLane = (lane) => lane.map(half);

function toPosition(voxel) {
  return voxel.map((index) =>
    sub(
      mul(add(index, 0.5), FIELD_CACHE_CELL_SIZE),
      FIELD_CACHE_DOMAIN_HALF_EXTENT,
    ),
  );
}

function symmetricInvariants(position) {
  const sum = add(add(position[0], position[1]), position[2]);
  const squaredRadius = dot(position, position);
  const product = mul(mul(position[0], position[1]), position[2]);
  return { sum, squaredRadius, product };
}

function createCanonicalResolved(voxel, generation) {
  const position = toPosition(voxel);
  const { sum, squaredRadius, product } = symmetricInvariants(position);
  const generationOffset = mul(generation, 0.0017);
  const potential = add(
    add(0.018, mul(0.012, squaredRadius)),
    add(mul(0.0025, product), generationOffset),
  );
  const gradient = position.map((component, axis) => {
    const otherSum = add(position[(axis + 1) % 3], position[(axis + 2) % 3]);
    return add(mul(0.19, component), mul(0.027, otherSum));
  });
  const phase = add(mul(0.37, sum), mul(0.11, squaredRadius));
  const energy = clamp(
    add(0.36, add(mul(0.08, squaredRadius), mul(0.025, product))),
    0.05,
    0.9,
  );
  const topology = quantizeLane([potential, ...gradient]);
  const source = quantizeLane([
    mul(0.62, Math.cos(phase)),
    mul(0.62, Math.sin(phase)),
    mul(0.31, Math.cos(mul(2, phase))),
    energy,
  ]);
  const organization = quantizeLane([
    clamp(add(0.72, mul(0.03, product)), 0, 1),
    clamp(mul(0.16, sum), -0.75, 0.75),
    mul(0.31, Math.sin(mul(2, phase))),
    clamp(add(0.74, mul(0.04, squaredRadius)), 0, 1),
  ]);
  return { topology, source, organization };
}

function expandVectorLane(lane, rank) {
  return [lane[0], ...rank.map((sortedAxis) => lane[sortedAxis + 1])];
}

function readResolved(voxel, generation) {
  const canonical = sortFieldCacheVoxelIndex(voxel);
  const rank = deriveFieldCacheVoxelRank(voxel);
  const stored = createCanonicalResolved(canonical, generation);
  return {
    topology: expandVectorLane(stored.topology, rank),
    source: stored.source,
    organization: stored.organization,
  };
}

function createCanonicalPreviousObserver(voxel) {
  const position = toPosition(voxel);
  const { sum, squaredRadius, product } = symmetricInvariants(position);
  const phase = add(mul(0.29, sum), mul(0.09, squaredRadius));
  const rawNormal = position.map((component, axis) =>
    add(
      component,
      mul(0.045, add(position[(axis + 1) % 3], position[(axis + 2) % 3])),
    ),
  );
  const normalMagnitude = Math.max(magnitude(rawNormal), 1e-8);
  const direction = [f32(Math.cos(phase)), f32(Math.sin(phase))];
  const chromaticity = resolveSpectralChromaticity(direction);
  return {
    geometry: quantizeLane([
      add(-0.025, add(mul(0.014, squaredRadius), mul(0.003, product))),
      ...rawNormal.map((component) => div(component, normalMagnitude)),
    ]),
    appearance: quantizeLane([
      ...direction,
      add(0.42, mul(0.035, squaredRadius)),
      clamp(add(0.7, mul(0.025, product)), 0, 1),
    ]),
    organization: quantizeLane([
      ...chromaticity,
      clamp(add(0.68, mul(0.025, sum)), 0, 1),
    ]),
  };
}

function readPreviousObserver(voxel) {
  const bounded = voxel.map((component) =>
    Math.max(0, Math.min(FIELD_CACHE_RESOLUTION - 1, component)),
  );
  const canonical = sortFieldCacheVoxelIndex(bounded);
  const rank = deriveFieldCacheVoxelRank(bounded);
  const stored = createCanonicalPreviousObserver(canonical);
  return {
    geometry: expandVectorLane(stored.geometry, rank),
    appearance: stored.appearance,
    organization: stored.organization,
  };
}

function bilinear(corners, xMix, yMix) {
  return corners[0].map((_, lane) =>
    mix(
      mix(corners[0][lane], corners[1][lane], xMix),
      mix(corners[2][lane], corners[3][lane], xMix),
      yMix,
    ),
  );
}

function samplePreviousObserver(position) {
  const maximumVoxel = FIELD_CACHE_RESOLUTION - 1.001;
  const voxel = position.map((component) =>
    clamp(
      sub(
        div(
          add(component, FIELD_CACHE_DOMAIN_HALF_EXTENT),
          FIELD_CACHE_CELL_SIZE,
        ),
        0.5,
      ),
      0,
      maximumVoxel,
    ),
  );
  const base = voxel.map(Math.floor);
  const amount = voxel.map((component, axis) => sub(component, base[axis]));
  const slices = [0, 1].map((zOffset) => {
    const corners = [
      readPreviousObserver([base[0], base[1], base[2] + zOffset]),
      readPreviousObserver([base[0] + 1, base[1], base[2] + zOffset]),
      readPreviousObserver([base[0], base[1] + 1, base[2] + zOffset]),
      readPreviousObserver([base[0] + 1, base[1] + 1, base[2] + zOffset]),
    ];
    return Object.fromEntries(
      ["geometry", "appearance", "organization"].map((lane) => [
        lane,
        bilinear(
          corners.map((corner) => corner[lane]),
          amount[0],
          amount[1],
        ),
      ]),
    );
  });
  return Object.fromEntries(
    ["geometry", "appearance", "organization"].map((lane) => [
      lane,
      slices[0][lane].map((value, component) =>
        mix(value, slices[1][lane][component], amount[2]),
      ),
    ]),
  );
}

function normalize2(vector, fallback = [1, 0]) {
  const size = magnitude2(vector);
  return size >= SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon
    ? vector.map((component) =>
        div(
          component,
          Math.max(size, SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon),
        ),
      )
    : fallback;
}

function smoothstep(low, high, value) {
  const amount = clamp(div(sub(value, low), sub(high, low)), 0, 1);
  return mul(mul(amount, amount), sub(3, mul(2, amount)));
}

function deriveSpectralEvidence(firstMoment, secondMoment, priorDirection) {
  const rho1 = clamp(magnitude2(firstMoment), 0, 1);
  const rho2 = clamp(magnitude2(secondMoment), 0, 1);
  const directDirection = normalize2(firstMoment);
  const safeMagnitude = Math.max(
    magnitude2(secondMoment),
    SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon,
  );
  const normalizedX = clamp(div(secondMoment[0], safeMagnitude), -1, 1);
  const halfCos = f32(Math.sqrt(clamp(mul(add(normalizedX, 1), 0.5), 0, 1)));
  const halfSinMagnitude = f32(
    Math.sqrt(clamp(mul(sub(1, normalizedX), 0.5), 0, 1)),
  );
  const rawAxis =
    rho2 >= SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon
      ? [halfCos, secondMoment[1] < 0 ? -halfSinMagnitude : halfSinMagnitude]
      : [1, 0];
  const axisDot = add(
    mul(rawAxis[0], priorDirection[0]),
    mul(rawAxis[1], priorDirection[1]),
  );
  const secondMomentAxis =
    axisDot < 0 ? rawAxis.map((value) => -value) : rawAxis;
  const firstGate = smoothstep(
    SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateStart,
    SPECTRAL_PHASE_FIELD_REFERENCE.firstMomentGateEnd,
    rho1,
  );
  const secondGate = mul(
    sub(1, firstGate),
    smoothstep(
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateStart,
      SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentGateEnd,
      rho2,
    ),
  );
  const weightedSecondGate = mul(
    secondGate,
    SPECTRAL_PHASE_FIELD_REFERENCE.secondMomentWeight,
  );
  const nominalGate = clamp(add(firstGate, weightedSecondGate), 0, 1);
  const numerator = directDirection.map((component, index) =>
    add(
      mul(component, firstGate),
      mul(secondMomentAxis[index], weightedSecondGate),
    ),
  );
  const numeratorMagnitude = magnitude2(numerator);
  return numeratorMagnitude >= SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon
    ? {
        gate: nominalGate,
        direction: numerator.map((component) =>
          div(
            component,
            Math.max(
              numeratorMagnitude,
              SPECTRAL_PHASE_FIELD_REFERENCE.directionEpsilon,
            ),
          ),
        ),
      }
    : { gate: 0, direction: priorDirection };
}

function seedDenseObserver(voxel) {
  const resolved = readResolved(voxel, 1);
  const gradient = resolved.topology.slice(1);
  const gradientMagnitudeSquared = dot(gradient, gradient);
  const gradientMagnitude = f32(Math.sqrt(gradientMagnitudeSquared));
  const gradientValidity = div(
    gradientMagnitudeSquared,
    add(gradientMagnitudeSquared, 1e-16),
  );
  const surfaceSupport = clamp(mul(resolved.source[3], gradientValidity), 0, 1);
  const spectralDirection = normalize2(resolved.source.slice(0, 2));
  const fineAuthority = clamp(
    mul(
      clamp(resolved.organization[0], 0, 1),
      add(
        1,
        mul(
          clamp(resolved.organization[1], -1, 1),
          CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
        ),
      ),
    ),
    0,
    1,
  );
  return {
    geometry: quantizeLane([
      div(resolved.topology[0], Math.max(div(gradientMagnitude, 3), 1e-8)),
      ...gradient.map((component) =>
        mul(
          div(component, Math.max(gradientMagnitude, 1e-8)),
          gradientValidity,
        ),
      ),
    ]),
    appearance: quantizeLane([
      ...spectralDirection,
      resolved.source[3],
      surfaceSupport,
    ]),
    organization: quantizeLane([
      ...resolveSpectralChromaticity(spectralDirection),
      fineAuthority,
    ]),
  };
}

function evolveDenseObserver(voxel) {
  const previousResolved = readResolved(voxel, 0);
  const currentResolved = readResolved(voxel, 1);
  const previousFieldMix = f32(0.25);
  const currentFieldMix = f32(0.5);
  const previousTopology = previousResolved.topology.map((value, lane) =>
    mix(value, currentResolved.topology[lane], previousFieldMix),
  );
  const currentTopology = previousResolved.topology.map((value, lane) =>
    mix(value, currentResolved.topology[lane], currentFieldMix),
  );
  const currentSource = previousResolved.source.map((value, lane) =>
    mix(value, currentResolved.source[lane], currentFieldMix),
  );
  const currentOrganization = previousResolved.organization.map((value, lane) =>
    mix(value, currentResolved.organization[lane], currentFieldMix),
  );
  const gradient = currentTopology.slice(1);
  const gradientMagnitudeSquared = dot(gradient, gradient);
  const gradientMagnitude = f32(Math.sqrt(gradientMagnitudeSquared));
  const gradientValidity = div(
    gradientMagnitudeSquared,
    add(gradientMagnitudeSquared, 1e-16),
  );
  const signedDistanceWorld = div(
    currentTopology[0],
    Math.max(div(gradientMagnitude, 3), 1e-8),
  );
  const sourceNormal = gradient.map((component) =>
    mul(div(component, Math.max(gradientMagnitude, 1e-8)), gradientValidity),
  );
  const surfaceSupport = clamp(mul(currentSource[3], gradientValidity), 0, 1);
  const backtraceScale = div(
    sub(currentTopology[0], previousTopology[0]),
    add(gradientMagnitudeSquared, 1e-10),
  );
  const historyPosition = toPosition(voxel).map((component, axis) =>
    add(component, mul(gradient[axis], backtraceScale)),
  );
  const history = samplePreviousObserver(historyPosition);
  const geometryBlend = f32(
    deriveCymaticObserverBlend(
      CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
      CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
    ),
  );
  const radianceBlend = f32(
    deriveCymaticObserverBlend(
      CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
      CYMATIC_OBSERVER_REFERENCE.radianceExposureSeconds,
    ),
  );
  const spectralAssimilation = f32(
    deriveCymaticObserverBlend(
      CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
      SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds,
    ),
  );
  const geometryAssimilation = mul(geometryBlend, surfaceSupport);
  const geometry = [
    mix(history.geometry[0], signedDistanceWorld, geometryAssimilation),
    ...history.geometry
      .slice(1)
      .map((value, axis) =>
        mix(value, sourceNormal[axis], geometryAssimilation),
      ),
  ];
  const priorDirection = normalize2(history.appearance.slice(0, 2));
  const evidence = deriveSpectralEvidence(
    currentSource.slice(0, 2),
    [currentSource[2], currentOrganization[2]],
    priorDirection,
  );
  const assimilation = mul(spectralAssimilation, evidence.gate);
  const priorMix = Math.max(0, sub(1, assimilation));
  const spectralNumerator = priorDirection.map((component, index) =>
    add(mul(component, priorMix), mul(evidence.direction[index], assimilation)),
  );
  const spectralDirection = normalize2(spectralNumerator, priorDirection);
  const fineAuthority = clamp(
    mul(
      clamp(currentOrganization[0], 0, 1),
      add(
        1,
        mul(
          clamp(currentOrganization[1], -1, 1),
          CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
        ),
      ),
    ),
    0,
    1,
  );
  const appearance = [
    ...spectralDirection,
    mix(history.appearance[2], currentSource[3], radianceBlend),
    mix(history.appearance[3], surfaceSupport, radianceBlend),
  ];
  const chromaticity = resolveSpectralChromaticity(spectralDirection);
  const organization = [
    ...chromaticity,
    mix(history.organization[3], fineAuthority, geometryAssimilation),
  ];
  return {
    geometry: quantizeLane(geometry),
    appearance: quantizeLane(appearance),
    organization: quantizeLane(organization),
  };
}

describe("cymatic observer permutation symmetry", () => {
  it("keeps every seed lane S3-equivariant", () => {
    for (let i = 11; i < FIELD_CACHE_RESOLUTION - 11; i += 17) {
      const canonical = sortFieldCacheVoxelIndex([i, i + 3, i + 9]);
      const stored = seedDenseObserver(canonical);
      for (const permutation of PERMUTATIONS) {
        const voxel = permutation.map((axis) => canonical[axis]);
        const rank = deriveFieldCacheVoxelRank(voxel);
        const expanded = {
          geometry: expandVectorLane(stored.geometry, rank),
          appearance: stored.appearance,
          organization: stored.organization,
        };
        const dense = seedDenseObserver(voxel);
        for (const laneName of ["geometry", "appearance", "organization"]) {
          for (let lane = 0; lane < 4; lane += 1) {
            expect(
              Math.abs(dense[laneName][lane] - expanded[laneName][lane]),
            ).toBeLessThanOrEqual(2 ** -10);
          }
        }
      }
    }
  });

  it("keeps every published lane S3-equivariant through sparse evolution and full expansion", () => {
    const maximumError = {
      geometry: [0, 0, 0, 0],
      appearance: [0, 0, 0, 0],
      organization: [0, 0, 0, 0],
    };
    let state = 0x243f6a88;
    const randomIndex = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return 8 + (state % (FIELD_CACHE_RESOLUTION - 16));
    };

    for (let sample = 0; sample < 384; sample += 1) {
      const canonical = sortFieldCacheVoxelIndex([
        randomIndex(),
        randomIndex(),
        randomIndex(),
      ]);
      const stored = evolveDenseObserver(canonical);
      for (const permutation of PERMUTATIONS) {
        const voxel = permutation.map((axis) => canonical[axis]);
        const rank = deriveFieldCacheVoxelRank(voxel);
        const expanded = {
          geometry: expandVectorLane(stored.geometry, rank),
          appearance: stored.appearance,
          organization: stored.organization,
        };
        const dense = evolveDenseObserver(voxel);
        for (const laneName of ["geometry", "appearance", "organization"]) {
          for (let lane = 0; lane < 4; lane += 1) {
            maximumError[laneName][lane] = Math.max(
              maximumError[laneName][lane],
              Math.abs(dense[laneName][lane] - expanded[laneName][lane]),
            );
          }
        }
      }
    }

    // One half-float ULP at the largest observer chromaticity in this oracle.
    // The bound includes Float32 reassociation in dot products and the change
    // in XY/Z interpolation order under coordinate permutation.
    for (const errors of Object.values(maximumError)) {
      for (const error of errors) {
        expect(error).toBeLessThanOrEqual(2 ** -9);
      }
    }
  });
});
