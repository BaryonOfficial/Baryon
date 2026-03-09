import { isFieldDrivenState } from "../fieldState.js";

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

function computeMovementMetrics({
  oldX,
  oldY,
  oldZ,
  targetX,
  targetY,
  targetZ,
  fieldDriven,
  flowInfluence,
  flowStrength,
  flowFrequency,
  particleSpeed,
  distanceThreshold,
  movementType,
  time,
  deltaTime,
  radius,
}) {
  const toTargetX = targetX - oldX;
  const toTargetY = targetY - oldY;
  const toTargetZ = targetZ - oldZ;
  const targetDist = Math.hypot(toTargetX, toTargetY, toTargetZ);
  const invLen = 1 / (targetDist + 0.0001);
  const dirX = toTargetX * invLen;
  const dirY = toTargetY * invLen;
  const dirZ = toTargetZ * invLen;

  const nx = pseudoNoise3(oldX * flowFrequency, oldY * flowFrequency, oldZ * flowFrequency + time);
  const ny = pseudoNoise3(oldX * flowFrequency + 1, oldY * flowFrequency, oldZ * flowFrequency + time);
  const nz = pseudoNoise3(oldX * flowFrequency + 2, oldY * flowFrequency, oldZ * flowFrequency + time);
  const flowLen = Math.hypot(nx, ny, nz) || 1;
  const flowX = nx / flowLen;
  const flowY = ny / flowLen;
  const flowZ = nz / flowLen;

  const rawStrength =
    (pseudoNoise3(targetX * 0.2, targetY * 0.2, targetZ * 0.2 + time + 1) + 1) * 0.5;
  const influence = (flowInfluence - 0.5) * -2.0;
  const strength = Math.max(0, Math.min(1, (rawStrength - influence) / Math.max(1e-5, 1 - influence)));
  const flowBlend = fieldDriven
    ? Math.max(0, Math.min(1, targetDist / Math.max(1e-4, distanceThreshold + 0.0001)))
    : 0;
  const adjustedDirX = dirX + flowX * strength * flowBlend;
  const adjustedDirY = dirY + flowY * strength * flowBlend;
  const adjustedDirZ = dirZ + flowZ * strength * flowBlend;
  const flowMoveX = adjustedDirX * deltaTime * flowStrength;
  const flowMoveY = adjustedDirY * deltaTime * flowStrength;
  const flowMoveZ = adjustedDirZ * deltaTime * flowStrength;

  const timeFactor = Math.max(0, Math.min(1, particleSpeed * deltaTime));
  const distanceFactor = Math.max(0, Math.min(1, targetDist / (distanceThreshold + 1)));
  let alpha = timeFactor;
  if (fieldDriven && movementType === 1) {
    alpha = (timeFactor * 0.35) * (1 - distanceFactor) + distanceFactor;
  } else if (!fieldDriven) {
    alpha = Math.min(0.06, timeFactor * 0.12);
  }
  alpha *= 1 - Math.exp(-targetDist * 5);

  const lerpMoveX = (targetX - oldX) * alpha;
  const lerpMoveY = (targetY - oldY) * alpha;
  const lerpMoveZ = (targetZ - oldZ) * alpha;

  let newX = oldX + flowMoveX + lerpMoveX;
  let newY = oldY + flowMoveY + lerpMoveY;
  let newZ = oldZ + flowMoveZ + lerpMoveZ;
  const newLen = Math.hypot(newX, newY, newZ);
  if (newLen > radius) {
    const inv = radius / newLen;
    newX *= inv;
    newY *= inv;
    newZ *= inv;
  }

  return {
    targetDist,
    targetRadius: Math.hypot(targetX, targetY, targetZ),
    flowMovement: Math.hypot(flowMoveX, flowMoveY, flowMoveZ),
    lerpMovement: Math.hypot(lerpMoveX, lerpMoveY, lerpMoveZ),
    newX,
    newY,
    newZ,
    newRadius: Math.hypot(newX, newY, newZ),
  };
}

/**
 * @param {Object} args
 * @param {Uint32Array} args.sampleIndices
 * @param {Float32Array} args.basePositions
 * @param {Float32Array} args.shadowParticles
 * @param {Float32Array} args.retainedTargets
 * @param {Float32Array} args.sampleBaryon
 * @param {Float32Array} args.modeSlots
 * @param {number} args.radius
 * @param {number} args.threshold
 * @param {number} args.surfaceThreshold
 * @param {number} args.flowInfluence
 * @param {number} args.flowStrength
 * @param {number} args.flowFrequency
 * @param {number} args.particleSpeed
 * @param {number} args.distanceThreshold
 * @param {number} args.movementType
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
  retainedTargets,
  sampleBaryon,
  modeSlots,
  radius,
  threshold,
  surfaceThreshold,
  flowInfluence,
  flowStrength,
  flowFrequency,
  particleSpeed,
  distanceThreshold,
  movementType,
  surfaceControl,
  idleScale,
  activeModeCount,
  fieldState,
  time,
  deltaTime,
  lifecycle = {},
}) {
  const { minNodeRadius, coreRadius } = deriveParticleDiagnosticConfig(radius);
  const fieldDriven = isFieldDrivenState(fieldState);

  let validCount = 0;
  let surfaceCount = 0;
  let retainedCount = 0;
  let centerValidCount = 0;
  let centerRetainedTargetCount = 0;
  let centerTargetCount = 0;
  let centerParticleCount = 0;
  let avgFieldAbs = 0;
  let avgTargetDistance = 0;
  let avgTargetRadius = 0;
  let avgParticleRadius = 0;
  let avgLerpMovement = 0;
  let avgFlowMovement = 0;

  for (let i = 0; i < sampleIndices.length; i++) {
    const index = sampleIndices[i];
    const baseX = basePositions[index * 3];
    const baseY = basePositions[index * 3 + 1];
    const baseZ = basePositions[index * 3 + 2];
    const field = computeScalarFieldValue(baseX, baseY, baseZ, modeSlots, radius);
    avgFieldAbs += Math.abs(field);
    const baseRadius = Math.hypot(baseX, baseY, baseZ);
    const isOnSurface = Math.abs(baseRadius - radius) <= surfaceThreshold;
    const isValid =
      activeModeCount > 0 &&
      baseRadius > minNodeRadius &&
      Math.abs(field) < threshold &&
      (!isOnSurface || surfaceControl !== 0);
    const isCoreBase = baseRadius <= coreRadius;
    const targetOffset = i * 4;

    if (fieldDriven) {
      if (isValid) {
        retainedTargets[targetOffset] = baseX;
        retainedTargets[targetOffset + 1] = baseY;
        retainedTargets[targetOffset + 2] = baseZ;
        retainedTargets[targetOffset + 3] = isOnSurface ? 1 : 2;
        validCount++;
        if (isOnSurface) surfaceCount++;
        if (isCoreBase) centerValidCount++;
      } else {
        retainedCount++;
      }
    } else {
      retainedTargets[targetOffset] = sampleBaryon[i * 3] * idleScale;
      retainedTargets[targetOffset + 1] = sampleBaryon[i * 3 + 1] * idleScale;
      retainedTargets[targetOffset + 2] = sampleBaryon[i * 3 + 2] * idleScale;
      retainedTargets[targetOffset + 3] = 1;
    }

    const targetX = retainedTargets[targetOffset];
    const targetY = retainedTargets[targetOffset + 1];
    const targetZ = retainedTargets[targetOffset + 2];
    const targetRadius = Math.hypot(targetX, targetY, targetZ);
    if (targetRadius <= coreRadius) {
      centerTargetCount++;
      if (fieldDriven && !isValid) {
        centerRetainedTargetCount++;
      }
    }

    const shadowOffset = i * 3;
    const oldX = shadowParticles[shadowOffset];
    const oldY = shadowParticles[shadowOffset + 1];
    const oldZ = shadowParticles[shadowOffset + 2];
    const movement = computeMovementMetrics({
      oldX,
      oldY,
      oldZ,
      targetX,
      targetY,
      targetZ,
      fieldDriven,
      flowInfluence,
      flowStrength,
      flowFrequency,
      particleSpeed,
      distanceThreshold,
      movementType,
      time,
      deltaTime,
      radius,
    });

    avgTargetDistance += movement.targetDist;
    avgTargetRadius += movement.targetRadius;
    avgParticleRadius += movement.newRadius;
    avgFlowMovement += movement.flowMovement;
    avgLerpMovement += movement.lerpMovement;

    if (movement.newRadius <= coreRadius) {
      centerParticleCount++;
    }

    shadowParticles[shadowOffset] = movement.newX;
    shadowParticles[shadowOffset + 1] = movement.newY;
    shadowParticles[shadowOffset + 2] = movement.newZ;
  }

  const divisor = sampleIndices.length || 1;
  return {
    fieldState,
    fieldDriven,
    idleFallbackActive: !fieldDriven,
    activeModeCount,
    modeSlotsChanged: Boolean(lifecycle.modeSlotsChanged),
    resetTriggered: Boolean(lifecycle.resetTriggered),
    resetReason: lifecycle.resetReason ?? "none",
    zeroPointOccupancy: validCount / divisor,
    zeroPointValidCount: validCount,
    zeroPointSurfaceCount: surfaceCount,
    retainedZeroPointCount: retainedCount,
    retainedTargetRatio: retainedCount / divisor,
    avgFieldAbs: avgFieldAbs / divisor,
    avgTargetDistance: avgTargetDistance / divisor,
    avgTargetRadius: avgTargetRadius / divisor,
    avgParticleRadius: avgParticleRadius / divisor,
    avgLerpMovement: avgLerpMovement / divisor,
    avgFlowMovement: avgFlowMovement / divisor,
    flowToLerpRatio: avgFlowMovement / Math.max(avgLerpMovement, 1e-6),
    diagnosticCoreRadius: coreRadius,
    centerParticleCount,
    centerParticleOccupancy: centerParticleCount / divisor,
    centerTargetCount,
    centerTargetOccupancy: centerTargetCount / divisor,
    centerValidZeroPointCount: centerValidCount,
    centerValidZeroPointOccupancy: centerValidCount / divisor,
    centerRetainedTargetCount,
    centerRetainedTargetOccupancy: centerRetainedTargetCount / divisor,
  };
}
