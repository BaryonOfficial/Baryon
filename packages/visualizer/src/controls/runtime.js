import * as THREE from "three";
import { CONTROL_HANDLERS } from "./schema.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";
import { RENDER_DEFAULTS } from "../defaults.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "../core/raymarch/stepStability.js";

const IDLE_LOGO_ALPHA_RATIO =
  RENDER_DEFAULTS.idleLogoIntensity > 0
    ? RENDER_DEFAULTS.idleLogoAlpha / RENDER_DEFAULTS.idleLogoIntensity
    : 1;

function deriveIdleLogoAlpha(intensity) {
  return Math.min(1, intensity * IDLE_LOGO_ALPHA_RATIO);
}

function deriveBloomResponse(controls, stepBudget) {
  const bloomResponseBias = Math.max(0, controls.bloomResponseBias ?? 0);
  const lowStepBloomGuard = deriveLowStepBloomGuard(stepBudget);
  const stepCompensation = deriveStepCompensation(stepBudget);
  return {
    bloomResponseBias,
    stepReference: STEP_REFERENCE,
    stepCompensation,
    lowStepBloomGuard,
    strength: Math.max(
      0,
      controls.bloomStrength *
        (1 - bloomResponseBias * 0.22) *
        (1 - lowStepBloomGuard * 0.12),
    ),
    radius: Math.max(0, controls.bloomRadius * (1 - bloomResponseBias * 0.08)),
    threshold: Math.min(
      1,
      controls.bloomThreshold +
        bloomResponseBias * 0.08 +
        lowStepBloomGuard * 0.05,
    ),
  };
}

export const CONTROL_RUNTIME_COVERAGE = Object.freeze({
  [CONTROL_HANDLERS.audio]: Object.freeze([
    "echoCancellation",
    "noiseSuppression",
    "autoGainControl",
  ]),
  [CONTROL_HANDLERS.shared]: Object.freeze(["backgroundColor"]),
  [CONTROL_HANDLERS.raymarch]: Object.freeze([
    "volumeColor",
    "surfaceColor",
    "zeroPointPrecision",
    "structureMin",
    "structureMax",
    "raymarchSteps",
    "densityGain",
    "absorption",
    "contourSharpness",
    "rimBloomBias",
    "rimCompression",
    "beatSensitivity",
    "pulseAmount",
    "pulseDecayMs",
    "idleLogoIntensity",
    "idleLogoSize",
  ]),
  [CONTROL_HANDLERS.bloom]: Object.freeze([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
    "bloomResponseBias",
  ]),
  [CONTROL_HANDLERS.scene]: Object.freeze(["rotationSpeed"]),
  [CONTROL_HANDLERS.audit]: Object.freeze([
    "auditEnabled",
    "freezeModeSlots",
    "forceWebGLFallbackTest",
    "injectTestTone",
    "testToneHz",
    "testToneAmplitude",
    "logEveryFrames",
  ]),
});

function getAudioControlSnapshot(controls) {
  return {
    echoCancellation: Boolean(controls.echoCancellation),
    noiseSuppression: Boolean(controls.noiseSuppression),
    autoGainControl: Boolean(controls.autoGainControl),
  };
}

export async function applyAudioControls(audioSession, controls) {
  const snapshot = getAudioControlSnapshot(controls);
  if (!audioSession?.setMicSettings) {
    return snapshot;
  }

  await audioSession.setMicSettings(snapshot);
  return snapshot;
}

export function applySharedControls(gl, controls) {
  gl.setClearColor(new THREE.Color(controls.backgroundColor));
  return {
    backgroundColor: controls.backgroundColor,
  };
}

export function applyRaymarchControls(runtimeState, controls) {
  const uniforms = runtimeState.uniforms;
  const idleLogoAlpha = deriveIdleLogoAlpha(controls.idleLogoIntensity);
  const stepBudget = Math.round(controls.raymarchSteps ?? STEP_REFERENCE);

  uniforms.uColor.value.set(controls.volumeColor);
  uniforms.uSurfaceColor.value.set(controls.surfaceColor);
  uniforms.uThreshold.value = controls.zeroPointPrecision;
  uniforms.uStructureMin.value = controls.structureMin;
  uniforms.uStructureMax.value = controls.structureMax;
  uniforms.uIdleLogoIntensity.value = controls.idleLogoIntensity;
  uniforms.uIdleLogoAlpha.value = idleLogoAlpha;
  uniforms.uIdleLogoSize.value = controls.idleLogoSize;
  uniforms.uDensityGain.value = controls.densityGain;
  uniforms.uAbsorption.value = controls.absorption;
  uniforms.uContourSharpness.value = controls.contourSharpness;
  uniforms.uRimBloomBias.value = controls.rimBloomBias;
  uniforms.uRimCompression.value = controls.rimCompression;
  uniforms.uRaymarchSteps.value = stepBudget;
  runtimeState.baseDensityGain = controls.densityGain;
  runtimeState.beatTuning = {
    ...(runtimeState.beatTuning ?? {}),
    beatSensitivity: controls.beatSensitivity,
    pulseAmount: controls.pulseAmount,
    pulseDecayMs: controls.pulseDecayMs,
  };
  runtimeState.bloomTuning = {
    ...(runtimeState.bloomTuning ?? {}),
    stepReference: STEP_REFERENCE,
    stepCompensation: deriveStepCompensation(stepBudget),
    lowStepBloomGuard: deriveLowStepBloomGuard(stepBudget),
  };

  if (runtimeState.volumeMesh?.material) {
    runtimeState.volumeMesh.material.steps = stepBudget;
  }
  if (runtimeState.idleOverlay) {
    runtimeState.idleOverlay.scale.setScalar(controls.idleLogoSize);
    if (runtimeState.idleOverlay.material?.color) {
      runtimeState.idleOverlay.material.color.set(controls.surfaceColor);
    }
    if ("opacity" in (runtimeState.idleOverlay.material ?? {})) {
      runtimeState.idleOverlay.material.opacity = idleLogoAlpha;
    }
  }

  return {
    uniforms: {
      volumeColor: controls.volumeColor,
      surfaceColor: controls.surfaceColor,
      threshold: uniforms.uThreshold.value,
      structureMin: uniforms.uStructureMin.value,
      structureMax: uniforms.uStructureMax.value,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoAlpha,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      densityGain: uniforms.uDensityGain.value,
      absorption: uniforms.uAbsorption.value,
      contourSharpness: uniforms.uContourSharpness.value,
      rimBloomBias: uniforms.uRimBloomBias.value,
      rimCompression: uniforms.uRimCompression.value,
      beatSensitivity: runtimeState.beatTuning?.beatSensitivity,
      pulseAmount: runtimeState.beatTuning?.pulseAmount,
      pulseDecayMs: runtimeState.beatTuning?.pulseDecayMs,
      raymarchSteps: Math.round(runtimeState.volumeMesh.material.steps),
    },
    overlay: {
      visible: runtimeState.idleOverlay?.visible ?? false,
      scale: runtimeState.idleOverlay?.scale?.x ?? controls.idleLogoSize,
    },
  };
}

export function applyVisualizationControls(method, runtimeState, controls) {
  void method;
  return applyRaymarchControls(runtimeState, controls);
}

export const applySimulationControls = (gl, runtimeState, controls) => ({
  ...applySharedControls(gl, controls),
  ...applyVisualizationControls(
    runtimeState?.method ?? DEFAULT_VISUALIZATION_METHOD,
    runtimeState,
    controls,
  ),
});

export function applyBloomControls(pipelineState, controls) {
  const stepBudget = Math.round(
    controls.raymarchSteps ??
      pipelineState.runtimeState?.volumeMesh?.material?.steps ??
      STEP_REFERENCE,
  );
  const effective = deriveBloomResponse(controls, stepBudget);
  if (pipelineState.runtimeState) {
    pipelineState.runtimeState.bloomTuning = {
      ...(pipelineState.runtimeState.bloomTuning ?? {}),
      bloomResponseBias: effective.bloomResponseBias,
      stepReference: effective.stepReference,
      stepCompensation: effective.stepCompensation,
      lowStepBloomGuard: effective.lowStepBloomGuard,
      effectiveStrength: effective.strength,
      effectiveRadius: effective.radius,
      effectiveThreshold: effective.threshold,
    };
  }
  const pipeline = pipelineState.ensurePipeline();
  const postNodes = pipelineState.postNodesRef.current;
  if (!pipeline || !postNodes) {
    return {
      enabled: controls.bloomEnabled,
      strength: effective.strength,
      radius: effective.radius,
      threshold: effective.threshold,
      bloomResponseBias: effective.bloomResponseBias,
      stepReference: effective.stepReference,
      stepCompensation: effective.stepCompensation,
      lowStepBloomGuard: effective.lowStepBloomGuard,
    };
  }

  const { sceneColor, bloomPass } = postNodes;
  bloomPass.strength.value = effective.strength;
  bloomPass.radius.value = effective.radius;
  bloomPass.threshold.value = effective.threshold;
  pipeline.outputNode = controls.bloomEnabled
    ? sceneColor.add(bloomPass)
    : sceneColor;

  return {
    enabled: controls.bloomEnabled,
    strength: bloomPass.strength.value,
    radius: bloomPass.radius.value,
    threshold: bloomPass.threshold.value,
    bloomResponseBias: effective.bloomResponseBias,
    stepReference: effective.stepReference,
    stepCompensation: effective.stepCompensation,
    lowStepBloomGuard: effective.lowStepBloomGuard,
  };
}

export function applyAuditControls(featureState, controls) {
  if (!featureState?.audit?.settings) {
    return null;
  }

  Object.assign(featureState.audit.settings, {
    enabled: controls.auditEnabled,
    freezeModeSlots: controls.freezeModeSlots,
    forceWebGLFallbackTest: controls.forceWebGLFallbackTest,
    injectTestTone: controls.injectTestTone,
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
  method = DEFAULT_VISUALIZATION_METHOD,
  audio,
  shared,
  raymarch,
  bloom,
  audit,
  scene,
}) {
  return {
    method,
    ...(audio === undefined ? {} : { audio }),
    shared,
    raymarch,
    simulation: raymarch,
    bloom,
    audit,
    scene,
  };
}
