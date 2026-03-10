import { isFieldDrivenState } from "../fieldState.js";

const EPSILON = 1e-4;
const MAX_ACTIVE_SPEED = 2;
const FIELD_OCCUPANCY_THRESHOLD = 0.01;
const HIGH_POTENTIAL_THRESHOLD = 0.25;

/**
 * @typedef {Object} ParticleLifecycle
 * @property {boolean} [modeSlotsChanged]
 * @property {boolean} [resetTriggered]
 * @property {string} [resetReason]
 */

export function computeScalarFieldValue(x, y, z, modeSlots, radius) {
  let sum = 0;
  const scale = 1 / radius;

  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3];
    if (!amplitude) continue;
    const ui = modeSlots[i];
    const vi = modeSlots[i + 1];
    const wi = modeSlots[i + 2];
    sum += amplitude
      * Math.sin(ui * Math.PI * x * scale)
      * Math.sin(vi * Math.PI * y * scale)
      * Math.sin(wi * Math.PI * z * scale);
  }

  return sum;
}

export function computeScalarFieldGradient(x, y, z, modeSlots, radius) {
  const scale = Math.PI / radius;
  let gradX = 0;
  let gradY = 0;
  let gradZ = 0;

  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3];
    if (!amplitude) continue;

    const ui = modeSlots[i];
    const vi = modeSlots[i + 1];
    const wi = modeSlots[i + 2];
    const sx = Math.sin(ui * Math.PI * x / radius);
    const sy = Math.sin(vi * Math.PI * y / radius);
    const sz = Math.sin(wi * Math.PI * z / radius);
    const gx = Math.cos(ui * Math.PI * x / radius) * ui * scale;
    const gy = Math.cos(vi * Math.PI * y / radius) * vi * scale;
    const gz = Math.cos(wi * Math.PI * z / radius) * wi * scale;

    gradX += amplitude * gx * sy * sz;
    gradY += amplitude * sx * gy * sz;
    gradZ += amplitude * sx * sy * gz;
  }

  return {
    x: gradX,
    y: gradY,
    z: gradZ,
    magnitude: Math.hypot(gradX, gradY, gradZ),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) {
    return x < edge0 ? 0 : 1;
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeVector(x, y, z) {
  const len = Math.hypot(x, y, z);
  if (len <= EPSILON) {
    return { x: 0, y: 0, z: 0, length: 0 };
  }
  return { x: x / len, y: y / len, z: z / len, length: len };
}

function clampVectorMagnitude(x, y, z, limit) {
  const length = Math.hypot(x, y, z);
  if (length <= limit) {
    return { x, y, z, length };
  }
  const inv = limit / Math.max(length, EPSILON);
  return {
    x: x * inv,
    y: y * inv,
    z: z * inv,
    length: limit,
  };
}

export function deriveParticleDiagnosticConfig(radius) {
  return {
    minNodeRadius: radius * 0.12,
    coreRadius: radius * 0.18,
  };
}

function pseudoNoise3(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function computeFlowVector(x, y, z, flowFrequency, time) {
  const nx = pseudoNoise3(x * flowFrequency, y * flowFrequency, z * flowFrequency + time);
  const ny = pseudoNoise3(x * flowFrequency + 1, y * flowFrequency, z * flowFrequency + time);
  const nz = pseudoNoise3(x * flowFrequency + 2, y * flowFrequency, z * flowFrequency + time);
  return normalizeVector(nx, ny, nz);
}

export function computeNodalFieldMetrics({
  x,
  y,
  z,
  modeSlots,
  radius,
  threshold,
  surfaceThreshold,
  surfaceControl,
  centerSuppressionInner,
  centerSuppressionOuter,
  structureMin,
  structureMax,
}) {
  const field = computeScalarFieldValue(x, y, z, modeSlots, radius);
  const fieldAbs = Math.abs(field);
  const gradient = computeScalarFieldGradient(x, y, z, modeSlots, radius);
  const radialDist = Math.hypot(x, y, z);
  const nodeBandWeight = 1 - smoothstep(0, threshold, fieldAbs);
  const structureWeight = smoothstep(structureMin, structureMax, gradient.magnitude);
  const centerSuppression = smoothstep(
    centerSuppressionInner,
    centerSuppressionOuter,
    radialDist
  );
  const potential = nodeBandWeight * structureWeight * centerSuppression;
  const isOnSurface = Math.abs(radialDist - radius) <= surfaceThreshold;
  const groupTag = isOnSurface && surfaceControl !== 0 ? 1 : 2;

  return {
    field,
    fieldAbs,
    gradient,
    radialDist,
    nodeBandWeight,
    structureWeight,
    centerSuppression,
    potential,
    isOnSurface,
    groupTag,
  };
}

function computeParticleStep({
  oldX,
  oldY,
  oldZ,
  oldVx,
  oldVy,
  oldVz,
  anchorX,
  anchorY,
  anchorZ,
  anchorPotential,
  baryonX,
  baryonY,
  baryonZ,
  modeSlots,
  radius,
  threshold,
  surfaceThreshold,
  surfaceControl,
  flowStrength,
  flowFrequency,
  flowMix,
  particleSpeed,
  attractionStrength,
  velocityDamping,
  centerSuppressionInner,
  centerSuppressionOuter,
  structureMin,
  structureMax,
  idleScale,
  time,
  deltaTime,
  fieldDriven,
}) {
  if (!fieldDriven) {
    const targetX = baryonX * idleScale;
    const targetY = baryonY * idleScale;
    const targetZ = baryonZ * idleScale;
    const idleAlpha = clamp(particleSpeed * deltaTime * 0.08, 0, 0.08);
    const nextX = oldX + (targetX - oldX) * idleAlpha;
    const nextY = oldY + (targetY - oldY) * idleAlpha;
    const nextZ = oldZ + (targetZ - oldZ) * idleAlpha;
    const nextVx = oldVx * 0.6 + (targetX - oldX) * idleAlpha * 0.25;
    const nextVy = oldVy * 0.6 + (targetY - oldY) * idleAlpha * 0.25;
    const nextVz = oldVz * 0.6 + (targetZ - oldZ) * idleAlpha * 0.25;

    return {
      x: nextX,
      y: nextY,
      z: nextZ,
      vx: nextVx,
      vy: nextVy,
      vz: nextVz,
      attractionContribution: 0,
      anchorContribution: 0,
      centerEscapeContribution: 0,
      flowContribution: 0,
      velocityMagnitude: Math.hypot(nextVx, nextVy, nextVz),
      repaired: false,
      nodal: null,
    };
  }

  const nodal = computeNodalFieldMetrics({
    x: oldX,
    y: oldY,
    z: oldZ,
    modeSlots,
    radius,
    threshold,
    surfaceThreshold,
    surfaceControl,
    centerSuppressionInner,
    centerSuppressionOuter,
    structureMin,
    structureMax,
  });
  const gradientDir = normalizeVector(
    nodal.gradient.x + EPSILON,
    nodal.gradient.y + EPSILON,
    nodal.gradient.z + EPSILON
  );
  const radialDir = normalizeVector(oldX + EPSILON, oldY + EPSILON, oldZ + EPSILON);
  const anchorDir = normalizeVector(anchorX - oldX, anchorY - oldY, anchorZ - oldZ);
  const anchorDistance = Math.hypot(anchorX - oldX, anchorY - oldY, anchorZ - oldZ);
  const signScale = nodal.field >= 0 ? -1 : 1;
  const attractionScalar = clamp(
    nodal.fieldAbs / (threshold * 4 + EPSILON),
    0,
    1
  ) * nodal.structureWeight * nodal.centerSuppression * attractionStrength;
  const attractionX = gradientDir.x * signScale * attractionScalar;
  const attractionY = gradientDir.y * signScale * attractionScalar;
  const attractionZ = gradientDir.z * signScale * attractionScalar;
  const anchorScalar = smoothstep(0, radius * 0.35, anchorDistance)
    * anchorPotential
    * attractionStrength
    * 0.8;
  const anchorXForce = anchorDir.x * anchorScalar;
  const anchorYForce = anchorDir.y * anchorScalar;
  const anchorZForce = anchorDir.z * anchorScalar;
  const centerEscapeScalar = (1 - nodal.centerSuppression)
    * (1 - nodal.nodeBandWeight * nodal.structureWeight)
    * attractionStrength
    * 0.35;
  const centerEscapeX = radialDir.x * centerEscapeScalar;
  const centerEscapeY = radialDir.y * centerEscapeScalar;
  const centerEscapeZ = radialDir.z * centerEscapeScalar;

  const flowDir = computeFlowVector(oldX, oldY, oldZ, flowFrequency, time);
  const flowScalar = flowStrength * flowMix * (1 - nodal.potential) * (1 - anchorPotential * 0.85);
  const flowX = flowDir.x * flowScalar;
  const flowY = flowDir.y * flowScalar;
  const flowZ = flowDir.z * flowScalar;

  const unclampedVelocityX = oldVx * velocityDamping + (attractionX + anchorXForce + centerEscapeX + flowX) * deltaTime;
  const unclampedVelocityY = oldVy * velocityDamping + (attractionY + anchorYForce + centerEscapeY + flowY) * deltaTime;
  const unclampedVelocityZ = oldVz * velocityDamping + (attractionZ + anchorZForce + centerEscapeZ + flowZ) * deltaTime;
  const clampedVelocity = clampVectorMagnitude(
    unclampedVelocityX,
    unclampedVelocityY,
    unclampedVelocityZ,
    MAX_ACTIVE_SPEED
  );

  let nextX = oldX + clampedVelocity.x * particleSpeed * deltaTime;
  let nextY = oldY + clampedVelocity.y * particleSpeed * deltaTime;
  let nextZ = oldZ + clampedVelocity.z * particleSpeed * deltaTime;
  let nextVx = clampedVelocity.x;
  let nextVy = clampedVelocity.y;
  let nextVz = clampedVelocity.z;
  let repaired = false;

  if (![nextX, nextY, nextZ, nextVx, nextVy, nextVz].every(Number.isFinite)) {
    nextX = baryonX * idleScale;
    nextY = baryonY * idleScale;
    nextZ = baryonZ * idleScale;
    nextVx = 0;
    nextVy = 0;
    nextVz = 0;
    repaired = true;
  }

  const nextLen = Math.hypot(nextX, nextY, nextZ);
  if (nextLen > radius) {
    const inv = radius / Math.max(nextLen, EPSILON);
    nextX *= inv;
    nextY *= inv;
    nextZ *= inv;
    nextVx *= 0.5;
    nextVy *= 0.5;
    nextVz *= 0.5;
    repaired = true;
  }

  return {
    x: nextX,
    y: nextY,
    z: nextZ,
    vx: nextVx,
    vy: nextVy,
    vz: nextVz,
    attractionContribution: Math.hypot(attractionX, attractionY, attractionZ) * deltaTime,
    anchorContribution: Math.hypot(anchorXForce, anchorYForce, anchorZForce) * deltaTime,
    centerEscapeContribution: Math.hypot(centerEscapeX, centerEscapeY, centerEscapeZ) * deltaTime,
    flowContribution: Math.hypot(flowX, flowY, flowZ) * deltaTime,
    velocityMagnitude: Math.hypot(nextVx, nextVy, nextVz),
    repaired,
    nodal,
  };
}

/**
 * @param {Object} args
 * @param {Uint32Array} args.sampleIndices
 * @param {Float32Array} args.basePositions
 * @param {Float32Array} args.shadowParticles
 * @param {Float32Array} args.shadowVelocities
 * @param {Float32Array} args.sampleBaryon
 * @param {Float32Array} args.modeSlots
 * @param {number} args.radius
 * @param {number} args.threshold
 * @param {number} args.surfaceThreshold
 * @param {number} args.flowStrength
 * @param {number} args.flowFrequency
 * @param {number} args.flowMix
 * @param {number} args.particleSpeed
 * @param {number} args.attractionStrength
 * @param {number} args.velocityDamping
 * @param {number} args.centerSuppressionInner
 * @param {number} args.centerSuppressionOuter
 * @param {number} args.structureMin
 * @param {number} args.structureMax
 * @param {number} args.surfaceControl
 * @param {number} args.idleScale
 * @param {number} args.activeModeCount
 * @param {string} args.fieldState
 * @param {number} args.time
 * @param {number} args.deltaTime
 * @param {ParticleLifecycle} [args.lifecycle]
 */
export function computeParticleDebugMetrics({
  sampleIndices,
  basePositions,
  shadowParticles,
  shadowVelocities,
  sampleBaryon,
  modeSlots,
  radius,
  threshold,
  surfaceThreshold,
  flowStrength,
  flowFrequency,
  flowMix,
  particleSpeed,
  attractionStrength,
  velocityDamping,
  centerSuppressionInner,
  centerSuppressionOuter,
  structureMin,
  structureMax,
  surfaceControl,
  idleScale,
  activeModeCount,
  fieldState,
  time,
  deltaTime,
  lifecycle = {},
}) {
  const { coreRadius } = deriveParticleDiagnosticConfig(radius);
  const fieldDriven = isFieldDrivenState(fieldState) && activeModeCount > 0;
  const divisor = sampleIndices.length || 1;

  let fieldPopulationCount = 0;
  let fieldSurfaceCount = 0;
  let highPotentialCount = 0;
  let centerParticleCount = 0;
  let centerPotentialCount = 0;
  let repairedCount = 0;
  let avgPotential = 0;
  let avgFieldAbs = 0;
  let avgGradientMagnitude = 0;
  let avgParticleRadius = 0;
  let avgAttractionContribution = 0;
  let avgAnchorContribution = 0;
  let avgCenterEscapeContribution = 0;
  let avgFlowContribution = 0;
  let avgVelocityMagnitude = 0;

  for (let i = 0; i < sampleIndices.length; i++) {
    const index = sampleIndices[i];
    const baseX = basePositions[index * 3];
    const baseY = basePositions[index * 3 + 1];
    const baseZ = basePositions[index * 3 + 2];

    const baseNodal = fieldDriven
      ? computeNodalFieldMetrics({
        x: baseX,
        y: baseY,
        z: baseZ,
        modeSlots,
        radius,
        threshold,
        surfaceThreshold,
        surfaceControl,
        centerSuppressionInner,
        centerSuppressionOuter,
        structureMin,
        structureMax,
      })
      : null;

    if (baseNodal && baseNodal.potential > FIELD_OCCUPANCY_THRESHOLD) {
      fieldPopulationCount++;
      if (baseNodal.isOnSurface) {
        fieldSurfaceCount++;
      }
    }

    const shadowOffset = i * 3;
    const velocityOffset = i * 3;
    const particleStep = computeParticleStep({
      oldX: shadowParticles[shadowOffset],
      oldY: shadowParticles[shadowOffset + 1],
      oldZ: shadowParticles[shadowOffset + 2],
      oldVx: shadowVelocities[velocityOffset],
      oldVy: shadowVelocities[velocityOffset + 1],
      oldVz: shadowVelocities[velocityOffset + 2],
      anchorX: baseX,
      anchorY: baseY,
      anchorZ: baseZ,
      anchorPotential: baseNodal?.potential ?? 0,
      baryonX: sampleBaryon[shadowOffset],
      baryonY: sampleBaryon[shadowOffset + 1],
      baryonZ: sampleBaryon[shadowOffset + 2],
      modeSlots,
      radius,
      threshold,
      surfaceThreshold,
      surfaceControl,
      flowStrength,
      flowFrequency,
      flowMix,
      particleSpeed,
      attractionStrength,
      velocityDamping,
      centerSuppressionInner,
      centerSuppressionOuter,
      structureMin,
      structureMax,
      idleScale,
      time,
      deltaTime,
      fieldDriven,
    });

    shadowParticles[shadowOffset] = particleStep.x;
    shadowParticles[shadowOffset + 1] = particleStep.y;
    shadowParticles[shadowOffset + 2] = particleStep.z;
    shadowVelocities[velocityOffset] = particleStep.vx;
    shadowVelocities[velocityOffset + 1] = particleStep.vy;
    shadowVelocities[velocityOffset + 2] = particleStep.vz;

    const particleRadius = Math.hypot(particleStep.x, particleStep.y, particleStep.z);
    const particleNodal = fieldDriven
      ? computeNodalFieldMetrics({
        x: particleStep.x,
        y: particleStep.y,
        z: particleStep.z,
        modeSlots,
        radius,
        threshold,
        surfaceThreshold,
        surfaceControl,
        centerSuppressionInner,
        centerSuppressionOuter,
        structureMin,
        structureMax,
      })
      : null;

    if (particleRadius <= coreRadius) {
      centerParticleCount++;
    }
    if (particleNodal && particleNodal.potential > FIELD_OCCUPANCY_THRESHOLD && particleRadius <= coreRadius) {
      centerPotentialCount++;
    }
    if (particleNodal && particleNodal.potential > HIGH_POTENTIAL_THRESHOLD) {
      highPotentialCount++;
    }
    if (particleStep.repaired) {
      repairedCount++;
    }

    avgPotential += particleNodal?.potential ?? 0;
    avgFieldAbs += particleNodal?.fieldAbs ?? 0;
    avgGradientMagnitude += particleNodal?.gradient.magnitude ?? 0;
    avgParticleRadius += particleRadius;
    avgAttractionContribution += particleStep.attractionContribution;
    avgAnchorContribution += particleStep.anchorContribution;
    avgCenterEscapeContribution += particleStep.centerEscapeContribution;
    avgFlowContribution += particleStep.flowContribution;
    avgVelocityMagnitude += particleStep.velocityMagnitude;
  }

  const avgAttraction = avgAttractionContribution / divisor;
  const avgFlow = avgFlowContribution / divisor;
  const fieldPopulationRatio = fieldPopulationCount / divisor;
  const centerPotentialOccupancy = centerPotentialCount / divisor;

  return {
    fieldState,
    fieldDriven,
    idleFallbackActive: !fieldDriven,
    activeModeCount,
    modeSlotsChanged: Boolean(lifecycle.modeSlotsChanged),
    resetTriggered: Boolean(lifecycle.resetTriggered),
    resetReason: lifecycle.resetReason ?? "none",
    continuityMode: lifecycle.resetTriggered ? "reset" : "inertia",
    fieldPopulated: fieldPopulationCount > 0,
    fieldPopulationCount,
    fieldPopulationRatio,
    highPotentialCount,
    highPotentialOccupancy: highPotentialCount / divisor,
    avgPotential: avgPotential / divisor,
    avgFieldAbs: avgFieldAbs / divisor,
    avgGradientMagnitude: avgGradientMagnitude / divisor,
    avgParticleRadius: avgParticleRadius / divisor,
    avgAttractionContribution: avgAttraction,
    avgAnchorContribution: avgAnchorContribution / divisor,
    avgCenterEscapeContribution: avgCenterEscapeContribution / divisor,
    avgFlowContribution: avgFlow,
    avgVelocityMagnitude: avgVelocityMagnitude / divisor,
    attractionDominant: avgAttraction >= avgFlow,
    attractionToFlowRatio: avgAttraction / Math.max(avgFlow, 1e-6),
    repairedParticleCount: repairedCount,
    repairedParticleRatio: repairedCount / divisor,
    diagnosticCoreRadius: coreRadius,
    centerParticleCount,
    centerParticleOccupancy: centerParticleCount / divisor,
    centerPotentialCount,
    centerPotentialOccupancy,
    zeroPointOccupancy: fieldPopulationRatio,
    zeroPointValidCount: fieldPopulationCount,
    zeroPointSurfaceCount: fieldSurfaceCount,
    retainedZeroPointCount: 0,
    retainedTargetRatio: 0,
    centerTargetCount: centerPotentialCount,
    centerTargetOccupancy: centerPotentialOccupancy,
    centerValidZeroPointCount: centerPotentialCount,
    centerValidZeroPointOccupancy: centerPotentialOccupancy,
    avgFlowMovement: avgFlow,
    avgLerpMovement: avgAttraction,
    flowToLerpRatio: avgFlow / Math.max(avgAttraction, 1e-6),
  };
}
