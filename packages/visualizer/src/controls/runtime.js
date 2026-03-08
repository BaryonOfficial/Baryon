import * as THREE from "three";

export function applySimulationControls(gl, tslState, controls) {
  const uniforms = tslState.uniforms;
  gl.setClearColor(new THREE.Color(controls.backgroundColor));
  uniforms.uColor.value.set(controls.volumeColor);
  uniforms.uSurfaceColor.value.set(controls.surfaceColor);
  uniforms.uParticleSpeed.value = controls.particleSpeed;
  uniforms.uParticleSize.value = controls.particleSize;
  uniforms.uThreshold.value = controls.zeroPointPrecision;
  uniforms.uDistanceThreshold.value = controls.targetLerpThreshold;
  uniforms.uSurfaceControl.value = controls.surfaceParticles ? 1 : 0;
  uniforms.uParticleMovementType.value = controls.particleMovementType === "Smoothed" ? 1 : 0;
  uniforms.uIdleLogoIntensity.value = controls.idleLogoIntensity;
  uniforms.uIdleLogoAlpha.value = controls.idleLogoAlpha;
  uniforms.uIdleLogoSize.value = controls.idleLogoSize;
  uniforms.uFlowFieldStrength.value = controls.flowFieldStrength;
  uniforms.uFlowFieldFrequency.value = controls.flowFieldFrequency;
  uniforms.uFlowFieldInfluence.value = controls.flowFieldInfluence;

  return {
    backgroundColor: controls.backgroundColor,
    uniforms: {
      particleSpeed: uniforms.uParticleSpeed.value,
      particleSize: uniforms.uParticleSize.value,
      threshold: uniforms.uThreshold.value,
      distanceThreshold: uniforms.uDistanceThreshold.value,
      surfaceControl: uniforms.uSurfaceControl.value,
      particleMovementType: uniforms.uParticleMovementType.value,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoAlpha: uniforms.uIdleLogoAlpha.value,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      flowFieldStrength: uniforms.uFlowFieldStrength.value,
      flowFieldFrequency: uniforms.uFlowFieldFrequency.value,
      flowFieldInfluence: uniforms.uFlowFieldInfluence.value,
    },
  };
}

export function applyBloomControls(pipelineState, controls) {
  const pipeline = pipelineState.ensurePipeline();
  const { sceneColor, bloomPass } = pipelineState.postNodesRef.current;
  bloomPass.strength.value = controls.bloomStrength;
  bloomPass.radius.value = controls.bloomRadius;
  bloomPass.threshold.value = controls.bloomThreshold;
  pipeline.outputNode = controls.bloomEnabled ? sceneColor.add(bloomPass) : sceneColor;

  return {
    enabled: controls.bloomEnabled,
    strength: bloomPass.strength.value,
    radius: bloomPass.radius.value,
    threshold: bloomPass.threshold.value,
  };
}

export function applyAuditControls(featureState, controls) {
  if (!featureState?.audit?.settings) {
    return null;
  }

  Object.assign(featureState.audit.settings, {
    enabled: controls.auditEnabled,
    freezeModeSlots: controls.freezeModeSlots,
    injectTestTone: controls.injectTestTone,
    pitchSourceMode: controls.pitchSourceMode,
    testToneHz: controls.testToneHz,
    testToneAmplitude: controls.testToneAmplitude,
    logEveryFrames: controls.logEveryFrames,
  });

  return { ...featureState.audit.settings };
}

export function applySceneControls(points, controls, deltaTime) {
  if (!points) return null;
  points.rotation.y -= deltaTime * 0.5 * controls.rotationSpeed;
  return {
    rotationSpeed: controls.rotationSpeed,
    rotationY: points.rotation.y,
  };
}

export function buildControlInspectionSnapshot({
  simulation,
  bloom,
  audit,
  scene,
}) {
  return {
    simulation,
    bloom,
    audit,
    scene,
  };
}
