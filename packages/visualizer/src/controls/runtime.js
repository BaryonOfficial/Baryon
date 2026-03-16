import * as THREE from "three";
import { CONTROL_HANDLERS } from "./schema.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "../visualization/types.js";
import { REACTIVITY_DEFAULTS, RENDER_DEFAULTS } from "../defaults.js";
import { normalizeOutputMode } from "../render/outputPipeline.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "../core/raymarch/stepStability.js";
import {
  buildSceneSnapshot,
  createDisabledSceneSnapshot,
  createSceneMotionState,
  deriveSceneSignals,
  getManualVelocity,
  getMotionAmount,
  normalizeRotationMode,
  stepAudioSceneMotion,
  stepManualSceneMotion,
  stepSettlingSceneMotion,
  syncIdleOverlayRotation,
} from "./sceneMotion.js";

const IDLE_LOGO_ALPHA_RATIO =
  RENDER_DEFAULTS.idleLogoIntensity > 0
    ? RENDER_DEFAULTS.idleLogoAlpha / RENDER_DEFAULTS.idleLogoIntensity
    : 1;
const TRANSPARENT_CLEAR_COLOR = new THREE.Color(0x000000);

function deriveIdleLogoAlpha(intensity) {
  return Math.min(1, intensity * IDLE_LOGO_ALPHA_RATIO);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
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
        (1 - bloomResponseBias * 0.2) *
        (1 - lowStepBloomGuard * 0.12),
    ),
    radius: Math.max(0, controls.bloomRadius * (1 - bloomResponseBias * 0.16)),
    threshold: Math.min(
      1,
      controls.bloomThreshold +
        bloomResponseBias * 0.1 +
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
  [CONTROL_HANDLERS.shared]: Object.freeze([
    "backgroundColor",
    "performanceHudEnabled",
    "visualizationMethod",
  ]),
  [CONTROL_HANDLERS.output]: Object.freeze([
    "outputMode",
    "outputBackgroundColor",
  ]),
  [CONTROL_HANDLERS.raymarch]: Object.freeze([
    "volumeColor",
    "surfaceColor",
    "colorMode",
    "chromesthesiaMix",
    "zeroPointPrecision",
    "structureMin",
    "structureMax",
    "raymarchSteps",
    "densityGain",
    "absorption",
    "opacityGain",
    "contourSharpness",
    "reactivity",
    "structurePersistence",
    "rimBloomBias",
    "rimCompression",
    "holographicIntensity",
    "holographicShift",
    "holographicFresnelPower",
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
  [CONTROL_HANDLERS.scene]: Object.freeze([
    "rotationMode",
    "rotationSpeed",
    "motionAmount",
  ]),
  [CONTROL_HANDLERS.audit]: Object.freeze([
    "auditEnabled",
    "freezeModeSlots",
    "forceWebGLFallbackTest",
    "lowLoadPlaybackDiagnostics",
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
  gl.setClearColor(TRANSPARENT_CLEAR_COLOR, 0);
  return {
    backgroundColor: controls.backgroundColor,
    performanceHudEnabled: Boolean(controls.performanceHudEnabled),
    clearAlpha: 0,
    visualizationMethod: controls.visualizationMethod,
  };
}

export function applyOutputControls(pipelineState, controls) {
  const outputMode = normalizeOutputMode(controls.outputMode);
  const outputBackgroundColor =
    controls.outputBackgroundColor ?? RENDER_DEFAULTS.outputBackgroundColor;
  const pipeline = pipelineState.ensurePipeline();
  const postNodes = pipelineState.postNodesRef.current;

  if (!pipeline || !postNodes) {
    return {
      outputMode,
      outputBackgroundColor,
    };
  }

  postNodes.outputUniforms?.backgroundColor?.value?.set(outputBackgroundColor);
  pipeline.outputNode = postNodes.composeOutputNode
    ? postNodes.composeOutputNode({
        bloomEnabled: controls.bloomEnabled,
        outputMode,
      })
    : pipeline.outputNode;
  pipeline.needsUpdate = true;

  return {
    outputMode,
    outputBackgroundColor,
  };
}

function applyCommonVisualizationControls(runtimeState, controls) {
  const uniforms = runtimeState.uniforms;
  const idleLogoAlpha = deriveIdleLogoAlpha(controls.idleLogoIntensity);
  const stepBudget = Math.round(controls.raymarchSteps ?? STEP_REFERENCE);
  const colorMode =
    controls.colorMode === "chromesthesia" ? "chromesthesia" : "static";
  const chromesthesiaMix =
    colorMode === "chromesthesia"
      ? clamp01(controls.chromesthesiaMix ?? RENDER_DEFAULTS.chromesthesiaMix)
      : 0;

  uniforms.uColor.value.set(controls.volumeColor);
  uniforms.uSurfaceColor.value.set(controls.surfaceColor);
  uniforms.uChromesthesiaMix.value = chromesthesiaMix;
  uniforms.uThreshold.value = controls.zeroPointPrecision;
  uniforms.uStructureMin.value = controls.structureMin;
  uniforms.uStructureMax.value = controls.structureMax;
  uniforms.uIdleLogoIntensity.value = controls.idleLogoIntensity;
  uniforms.uIdleLogoAlpha.value = idleLogoAlpha;
  uniforms.uIdleLogoSize.value = controls.idleLogoSize;
  uniforms.uDensityGain.value = controls.densityGain;
  uniforms.uOpacityGain.value = controls.opacityGain;
  uniforms.uContourSharpness.value = controls.contourSharpness;
  runtimeState.baseDensityGain = controls.densityGain;
  runtimeState.baseThreshold = controls.zeroPointPrecision;
  runtimeState.baseContourSharpness = controls.contourSharpness;
  runtimeState.reactivityTuning = {
    ...(runtimeState.reactivityTuning ?? {}),
    reactivity: controls.reactivity ?? REACTIVITY_DEFAULTS.reactivity,
    motionAmount: controls.motionAmount ?? REACTIVITY_DEFAULTS.motionAmount,
    structurePersistence:
      controls.structurePersistence ?? REACTIVITY_DEFAULTS.structurePersistence,
  };
  runtimeState.bloomTuning = {
    ...(runtimeState.bloomTuning ?? {}),
    stepReference: STEP_REFERENCE,
    stepCompensation: deriveStepCompensation(stepBudget),
    lowStepBloomGuard: deriveLowStepBloomGuard(stepBudget),
  };
  runtimeState.chromesthesia = {
    ...(runtimeState.chromesthesia ?? {}),
    colorMode,
    chromesthesiaMix,
  };

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
    uniforms,
    idleLogoAlpha,
    stepBudget,
    colorMode,
    chromesthesiaMix,
  };
}

function buildVisualizationControlSnapshot({
  controls,
  runtimeState,
  uniforms,
  idleLogoAlpha,
  colorMode,
  chromesthesiaMix,
  extraUniforms = {},
}) {
  return {
    uniforms: {
      volumeColor: controls.volumeColor,
      surfaceColor: controls.surfaceColor,
      colorMode,
      chromesthesiaMix,
      threshold: uniforms.uThreshold.value,
      structureMin: uniforms.uStructureMin.value,
      structureMax: uniforms.uStructureMax.value,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoAlpha,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      densityGain: uniforms.uDensityGain.value,
      opacityGain: uniforms.uOpacityGain.value,
      contourSharpness: uniforms.uContourSharpness.value,
      reactivity: runtimeState.reactivityTuning?.reactivity,
      motionAmount: runtimeState.reactivityTuning?.motionAmount,
      structurePersistence: runtimeState.reactivityTuning?.structurePersistence,
      ...extraUniforms,
    },
    overlay: {
      visible: runtimeState.idleOverlay?.visible ?? false,
      scale: runtimeState.idleOverlay?.scale?.x ?? controls.idleLogoSize,
    },
  };
}

export function applyRaymarchControls(runtimeState, controls) {
  const { uniforms, idleLogoAlpha, stepBudget, colorMode, chromesthesiaMix } =
    applyCommonVisualizationControls(runtimeState, controls);

  uniforms.uAbsorption.value = controls.absorption;
  uniforms.uRimBloomBias.value = controls.rimBloomBias;
  uniforms.uRimCompression.value = controls.rimCompression;
  uniforms.uHolographicIntensity.value = controls.holographicIntensity;
  uniforms.uHolographicShift.value = controls.holographicShift;
  uniforms.uHolographicFresnelPower.value = controls.holographicFresnelPower;
  uniforms.uRaymarchSteps.value = stepBudget;

  if (runtimeState.volumeMesh?.material) {
    runtimeState.volumeMesh.material.steps = stepBudget;
  }

  return buildVisualizationControlSnapshot({
    controls,
    runtimeState,
    uniforms,
    idleLogoAlpha,
    colorMode,
    chromesthesiaMix,
    extraUniforms: {
      absorption: uniforms.uAbsorption.value,
      rimBloomBias: uniforms.uRimBloomBias.value,
      rimCompression: uniforms.uRimCompression.value,
      holographicIntensity: uniforms.uHolographicIntensity.value,
      holographicShift: uniforms.uHolographicShift.value,
      holographicFresnelPower: uniforms.uHolographicFresnelPower.value,
      raymarchSteps: Math.round(runtimeState.volumeMesh.material.steps),
    },
  });
}

export function applyCymatics2dControls(runtimeState, controls) {
  const { uniforms, idleLogoAlpha, colorMode, chromesthesiaMix } =
    applyCommonVisualizationControls(runtimeState, controls);

  return buildVisualizationControlSnapshot({
    controls,
    runtimeState,
    uniforms,
    idleLogoAlpha,
    colorMode,
    chromesthesiaMix,
    extraUniforms: {
      slicePosition: uniforms.uSlicePosition?.value ?? 0,
    },
  });
}

export function applyVisualizationControls(method, runtimeState, controls) {
  if (!runtimeState) {
    return null;
  }

  if (method === VISUALIZATION_METHODS.cymatics2d) {
    return applyCymatics2dControls(runtimeState, controls);
  }

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
      baseStrength: effective.strength,
      baseRadius: effective.radius,
      baseThreshold: effective.threshold,
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

  const { sceneColor, bloomPass, composeOutputNode } = postNodes;
  bloomPass.strength.value = effective.strength;
  bloomPass.radius.value = effective.radius;
  bloomPass.threshold.value = effective.threshold;
  pipeline.outputNode = composeOutputNode
    ? composeOutputNode({
        bloomEnabled: controls.bloomEnabled,
        outputMode: controls.outputMode,
      })
    : controls.bloomEnabled
      ? sceneColor.add(bloomPass)
      : sceneColor;
  pipeline.needsUpdate = true;

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
    lowLoadPlaybackDiagnostics: controls.lowLoadPlaybackDiagnostics,
    injectTestTone: controls.injectTestTone,
    testToneHz: controls.testToneHz,
    testToneAmplitude: controls.testToneAmplitude,
    logEveryFrames: controls.logEveryFrames,
  });

  return { ...featureState.audit.settings };
}

export function applySceneControls(
  target,
  controls,
  deltaTime,
  featureFrame,
  status,
) {
  const runtimeState = target?.points ? target : null;
  const points = runtimeState?.points ?? target;
  if (!points?.rotation) return null;
  if (runtimeState?.method === VISUALIZATION_METHODS.cymatics2d) {
    return createDisabledSceneSnapshot(
      runtimeState,
      points,
      controls,
      featureFrame,
      deltaTime,
    );
  }

  const sceneMotion =
    runtimeState?.sceneMotion ?? createSceneMotionState(points.rotation.y ?? 0);
  const rotationMode = normalizeRotationMode(controls.rotationMode);
  const manualVelocity = getManualVelocity(controls);
  const motionAmount = getMotionAmount(controls, runtimeState);
  const audioActive =
    status?.isPlaying ||
    status?.isMicActive ||
    featureFrame?.fieldState === "test";
  const fieldDriven =
    featureFrame?.fieldState && featureFrame.fieldState !== "idle";
  const signals = deriveSceneSignals(
    featureFrame,
    runtimeState?.responseEnvelope ?? 0,
    sceneMotion.lastMotionSignal,
  );

  sceneMotion.yaw = points.rotation.y ?? sceneMotion.yaw ?? 0;

  if (rotationMode === "manual") {
    stepManualSceneMotion(sceneMotion, manualVelocity, deltaTime);
  } else if (rotationMode === "audio" && audioActive && fieldDriven) {
    stepAudioSceneMotion(sceneMotion, {
      motionAmount,
      shapedDrive: signals.shapedDrive,
      reactiveSignal: signals.reactiveSignal,
      motionImpulse: signals.motionImpulse,
      beatPulseId: featureFrame?.beatPulseId ?? 0,
      beatStrength: clamp01(featureFrame?.beatStrength ?? 0),
      beatConfidence: clamp01(featureFrame?.beatConfidence ?? 0),
      beatDetected: featureFrame?.beatDetected,
      deltaTime,
    });
  } else {
    stepSettlingSceneMotion(sceneMotion, deltaTime);
  }
  sceneMotion.lastMotionSignal = signals.motionSignal;

  points.rotation.y = sceneMotion.yaw;
  syncIdleOverlayRotation(runtimeState, sceneMotion, manualVelocity, deltaTime);
  if (runtimeState) {
    runtimeState.sceneMotion = sceneMotion;
  }

  return buildSceneSnapshot({
    rotationMode,
    rotationSpeed: controls.rotationSpeed,
    motionAmount,
    signals,
    sceneMotion,
    rotationY: points.rotation.y,
  });
}

function buildVisualizationInspectionAliases(visualization) {
  if (visualization === undefined) {
    return {};
  }

  return {
    visualization,
    raymarch: visualization,
    simulation: visualization,
  };
}

/**
 * @typedef {object} ControlInspectionSnapshotArgs
 * @property {string | undefined} [method]
 * @property {any} [audio]
 * @property {any} [shared]
 * @property {any} [output]
 * @property {any} [visualization]
 * @property {any} [raymarch]
 * @property {any} [bloom]
 * @property {any} [audit]
 * @property {any} [scene]
 */

/**
 * @param {ControlInspectionSnapshotArgs} args
 */
export function buildControlInspectionSnapshot({
  method = DEFAULT_VISUALIZATION_METHOD,
  audio,
  shared,
  output,
  visualization,
  raymarch,
  bloom,
  audit,
  scene,
}) {
  const resolvedVisualization = visualization ?? raymarch;

  return {
    method,
    ...(audio === undefined ? {} : { audio }),
    shared,
    output,
    ...buildVisualizationInspectionAliases(resolvedVisualization),
    bloom,
    audit,
    scene,
  };
}
