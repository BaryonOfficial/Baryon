import { computeParticleDebugMetrics } from "./debugMetrics.js";

export function createAuditState(
  basePositions,
  initialParticlePositions,
  baryonPositions,
) {
  const sampleCount = Math.min(
    256,
    Math.max(32, Math.floor(basePositions.length / 3000)),
  );
  const sampleIndices = new Uint32Array(sampleCount);
  const shadowParticles = new Float32Array(sampleCount * 3);
  const shadowVelocities = new Float32Array(sampleCount * 3);
  const sampleBaryon = new Float32Array(sampleCount * 3);
  const stride = Math.max(
    1,
    Math.floor(basePositions.length / 3 / sampleCount),
  );

  for (let i = 0; i < sampleCount; i++) {
    const index = Math.min(
      Math.floor(basePositions.length / 3) - 1,
      i * stride,
    );
    sampleIndices[i] = index;
    shadowParticles[i * 3] = initialParticlePositions[index * 3];
    shadowParticles[i * 3 + 1] = initialParticlePositions[index * 3 + 1];
    shadowParticles[i * 3 + 2] = initialParticlePositions[index * 3 + 2];
    sampleBaryon[i * 3] = baryonPositions[index * 4];
    sampleBaryon[i * 3 + 1] = baryonPositions[index * 4 + 1];
    sampleBaryon[i * 3 + 2] = baryonPositions[index * 4 + 2];
  }

  return {
    frame: 0,
    sampleIndices,
    shadowParticles,
    shadowVelocities,
    sampleBaryon,
    lastSnapshot: null,
  };
}

export function updateAuditSnapshot(
  tslState,
  featureFrame,
  deltaTime,
  lifecycle = {},
) {
  const auditState = tslState.audit;
  if (!auditState || !featureFrame) {
    return null;
  }

  const { sampleIndices, shadowParticles, shadowVelocities, sampleBaryon } =
    auditState;
  const snapshot = computeParticleDebugMetrics({
    sampleIndices,
    basePositions: tslState.basePositions,
    shadowParticles,
    shadowVelocities,
    sampleBaryon,
    modeSlots: featureFrame.modeSlots,
    radius: tslState.uniforms.uRadius.value,
    threshold: tslState.uniforms.uThreshold.value,
    surfaceThreshold: tslState.uniforms.uSurfaceThreshold.value,
    flowStrength: tslState.uniforms.uFlowFieldStrength.value,
    flowFrequency: tslState.uniforms.uFlowFieldFrequency.value,
    flowMix: tslState.uniforms.uFlowMix.value,
    particleSpeed: tslState.uniforms.uParticleSpeed.value,
    attractionStrength: tslState.uniforms.uAttractionStrength.value,
    velocityDamping: tslState.uniforms.uVelocityDamping.value,
    centerSuppressionInner: tslState.uniforms.uCenterSuppressionInner.value,
    centerSuppressionOuter: tslState.uniforms.uCenterSuppressionOuter.value,
    structureMin: tslState.uniforms.uStructureMin.value,
    structureMax: tslState.uniforms.uStructureMax.value,
    surfaceControl: tslState.uniforms.uSurfaceControl.value,
    idleScale: tslState.uniforms.uIdleLogoSize.value,
    activeModeCount: tslState.uniforms.uActiveModeCount.value,
    fieldState: featureFrame.fieldState,
    time: tslState.uniforms.uTime.value,
    deltaTime,
    lifecycle,
  });

  auditState.frame += 1;
  auditState.lastSnapshot = snapshot;
  return snapshot;
}
