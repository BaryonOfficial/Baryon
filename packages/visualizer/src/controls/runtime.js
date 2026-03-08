import * as THREE from "three";
import { CONTROL_HANDLERS } from "./schema.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";

export const CONTROL_RUNTIME_COVERAGE = Object.freeze({
  [CONTROL_HANDLERS.shared]: Object.freeze(["backgroundColor"]),
  [CONTROL_HANDLERS.particle]: Object.freeze([
    "volumeColor",
    "surfaceColor",
    "particleSpeed",
    "particleSize",
    "flowFieldStrength",
    "flowFieldFrequency",
    "flowFieldInfluence",
    "targetLerpThreshold",
    "zeroPointPrecision",
    "surfaceParticles",
    "particleMovementType",
    "idleLogoIntensity",
    "idleLogoAlpha",
    "idleLogoSize",
  ]),
  [CONTROL_HANDLERS.bloom]: Object.freeze([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
  ]),
  [CONTROL_HANDLERS.scene]: Object.freeze(["rotationSpeed"]),
  [CONTROL_HANDLERS.audit]: Object.freeze([
    "auditEnabled",
    "freezeModeSlots",
    "injectTestTone",
    "pitchSourceMode",
    "testToneHz",
    "testToneAmplitude",
    "logEveryFrames",
  ]),
});

export function applySharedControls(gl, controls) {
  gl.setClearColor(new THREE.Color(controls.backgroundColor));
  return {
    backgroundColor: controls.backgroundColor,
  };
}

export function applyParticleControls(tslState, controls) {
  const uniforms = tslState.uniforms;
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
    uniforms: {
      volumeColor: controls.volumeColor,
      surfaceColor: controls.surfaceColor,
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

export const applySimulationControls = (gl, tslState, controls) => ({
  ...applySharedControls(gl, controls),
  ...applyParticleControls(tslState, controls),
});

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

export function applyParticleSceneControls(points, controls, deltaTime) {
  if (!points) return null;
  points.rotation.y -= deltaTime * 0.5 * controls.rotationSpeed;
  return {
    rotationSpeed: controls.rotationSpeed,
    rotationY: points.rotation.y,
  };
}

export const applySceneControls = applyParticleSceneControls;

export function buildControlInspectionSnapshot({
  method = DEFAULT_VISUALIZATION_METHOD,
  shared,
  particle,
  bloom,
  audit,
  scene,
}) {
  return {
    method,
    shared,
    particle,
    simulation: particle,
    bloom,
    audit,
    scene,
  };
}
