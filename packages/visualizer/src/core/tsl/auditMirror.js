import { isFieldDrivenState } from '../fieldState.js';

function computeScalarFieldValue(x, y, z, modeSlots, radius) {
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

function pseudoNoise3(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function createAuditState(basePositions, initialParticlePositions, baryonPositions) {
  const sampleCount = Math.min(256, Math.max(32, Math.floor(basePositions.length / 3000)));
  const sampleIndices = new Uint32Array(sampleCount);
  const shadowParticles = new Float32Array(sampleCount * 3);
  const retainedTargets = new Float32Array(sampleCount * 4);
  const sampleBaryon = new Float32Array(sampleCount * 3);
  const stride = Math.max(1, Math.floor(basePositions.length / 3 / sampleCount));

  for (let i = 0; i < sampleCount; i++) {
    const index = Math.min(Math.floor(basePositions.length / 3) - 1, i * stride);
    sampleIndices[i] = index;
    shadowParticles[i * 3] = initialParticlePositions[index * 3];
    shadowParticles[i * 3 + 1] = initialParticlePositions[index * 3 + 1];
    shadowParticles[i * 3 + 2] = initialParticlePositions[index * 3 + 2];
    retainedTargets[i * 4] = basePositions[index * 3];
    retainedTargets[i * 4 + 1] = basePositions[index * 3 + 1];
    retainedTargets[i * 4 + 2] = basePositions[index * 3 + 2];
    retainedTargets[i * 4 + 3] = 2;
    sampleBaryon[i * 3] = baryonPositions[index * 4];
    sampleBaryon[i * 3 + 1] = baryonPositions[index * 4 + 1];
    sampleBaryon[i * 3 + 2] = baryonPositions[index * 4 + 2];
  }

  return {
    frame: 0,
    sampleIndices,
    shadowParticles,
    retainedTargets,
    sampleBaryon,
    lastSnapshot: null,
  };
}

export function updateAuditSnapshot(tslState, featureFrame, deltaTime) {
  const auditState = tslState.audit;
  if (!auditState || !featureFrame) {
    return null;
  }

  const {
    sampleIndices,
    shadowParticles,
    retainedTargets,
    sampleBaryon,
  } = auditState;
  const radius = tslState.uniforms.uRadius.value;
  const threshold = tslState.uniforms.uThreshold.value;
  const surfaceThreshold = tslState.uniforms.uSurfaceThreshold.value;
  const flowInfluence = tslState.uniforms.uFlowFieldInfluence.value;
  const flowStrength = tslState.uniforms.uFlowFieldStrength.value;
  const flowFrequency = tslState.uniforms.uFlowFieldFrequency.value;
  const particleSpeed = tslState.uniforms.uParticleSpeed.value;
  const distanceThreshold = tslState.uniforms.uDistanceThreshold.value;
  const movementType = tslState.uniforms.uParticleMovementType.value;
  const surfaceControl = tslState.uniforms.uSurfaceControl.value;
  const idleScale = tslState.uniforms.uIdleLogoSize.value;
  const activeModeCount = tslState.uniforms.uActiveModeCount.value;
  const minNodeRadius = radius * 0.12;
  const fieldDriven = isFieldDrivenState(featureFrame.fieldState);

  let validCount = 0;
  let surfaceCount = 0;
  let retainedCount = 0;
  let avgFieldAbs = 0;
  let avgTargetDistance = 0;
  let avgLerpMovement = 0;
  let avgFlowMovement = 0;

  for (let i = 0; i < sampleIndices.length; i++) {
    const index = sampleIndices[i];
    const baseX = tslState.basePositions[index * 3];
    const baseY = tslState.basePositions[index * 3 + 1];
    const baseZ = tslState.basePositions[index * 3 + 2];
    const field = computeScalarFieldValue(baseX, baseY, baseZ, featureFrame.modeSlots, radius);
    avgFieldAbs += Math.abs(field);
    const dist = Math.hypot(baseX, baseY, baseZ);
    const isOnSurface = Math.abs(dist - radius) <= surfaceThreshold;
    const isValid =
      activeModeCount > 0 &&
      dist > minNodeRadius &&
      Math.abs(field) < threshold &&
      (!isOnSurface || surfaceControl !== 0);
    const targetOffset = i * 4;

    if (fieldDriven) {
      if (isValid) {
        retainedTargets[targetOffset] = baseX;
        retainedTargets[targetOffset + 1] = baseY;
        retainedTargets[targetOffset + 2] = baseZ;
        retainedTargets[targetOffset + 3] = isOnSurface ? 1 : 2;
        validCount++;
        if (isOnSurface) surfaceCount++;
      } else {
        retainedCount++;
      }
    } else {
      retainedTargets[targetOffset] = sampleBaryon[i * 3] * idleScale;
      retainedTargets[targetOffset + 1] = sampleBaryon[i * 3 + 1] * idleScale;
      retainedTargets[targetOffset + 2] = sampleBaryon[i * 3 + 2] * idleScale;
      retainedTargets[targetOffset + 3] = 1;
    }

    const shadowOffset = i * 3;
    const oldX = shadowParticles[shadowOffset];
    const oldY = shadowParticles[shadowOffset + 1];
    const oldZ = shadowParticles[shadowOffset + 2];
    const targetX = retainedTargets[targetOffset];
    const targetY = retainedTargets[targetOffset + 1];
    const targetZ = retainedTargets[targetOffset + 2];
    const toTargetX = targetX - oldX;
    const toTargetY = targetY - oldY;
    const toTargetZ = targetZ - oldZ;
    const targetDist = Math.hypot(toTargetX, toTargetY, toTargetZ);
    avgTargetDistance += targetDist;

    const invLen = 1 / (targetDist + 0.0001);
    const dirX = toTargetX * invLen;
    const dirY = toTargetY * invLen;
    const dirZ = toTargetZ * invLen;
    const nx = pseudoNoise3(oldX * flowFrequency, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const ny = pseudoNoise3(oldX * flowFrequency + 1, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const nz = pseudoNoise3(oldX * flowFrequency + 2, oldY * flowFrequency, oldZ * flowFrequency + tslState.uniforms.uTime.value);
    const flowLen = Math.hypot(nx, ny, nz) || 1;
    const flowX = nx / flowLen;
    const flowY = ny / flowLen;
    const flowZ = nz / flowLen;
    const rawStrength = (pseudoNoise3(targetX * 0.2, targetY * 0.2, targetZ * 0.2 + tslState.uniforms.uTime.value + 1) + 1) * 0.5;
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
    avgFlowMovement += Math.hypot(flowMoveX, flowMoveY, flowMoveZ);

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
    avgLerpMovement += Math.hypot(lerpMoveX, lerpMoveY, lerpMoveZ);

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
    shadowParticles[shadowOffset] = newX;
    shadowParticles[shadowOffset + 1] = newY;
    shadowParticles[shadowOffset + 2] = newZ;
  }

  const divisor = sampleIndices.length || 1;
  const snapshot = {
    zeroPointOccupancy: validCount / divisor,
    zeroPointValidCount: validCount,
    zeroPointSurfaceCount: surfaceCount,
    retainedZeroPointCount: retainedCount,
    avgFieldAbs: avgFieldAbs / divisor,
    avgTargetDistance: avgTargetDistance / divisor,
    avgLerpMovement: avgLerpMovement / divisor,
    avgFlowMovement: avgFlowMovement / divisor,
  };

  auditState.frame += 1;
  auditState.lastSnapshot = snapshot;
  return snapshot;
}
