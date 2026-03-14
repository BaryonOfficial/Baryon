import * as THREE from "three";
import { CONTROL_HANDLERS } from "./schema.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";
import { REACTIVITY_DEFAULTS, RENDER_DEFAULTS } from "../defaults.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "../core/raymarch/stepStability.js";

const IDLE_LOGO_ALPHA_RATIO =
  RENDER_DEFAULTS.idleLogoIntensity > 0
    ? RENDER_DEFAULTS.idleLogoAlpha / RENDER_DEFAULTS.idleLogoIntensity
    : 1;
const MANUAL_ROTATION_RATE_SCALE = -0.5;
const AUDIO_ROTATION_MIN_SPEED = 0.03;
const AUDIO_ROTATION_MAX_SPEED = 4.8;
const AUDIO_ROTATION_ATTACK = 14;
const AUDIO_ROTATION_RELEASE = 4.8;
const AUDIO_ROTATION_IDLE_DAMP = 5.5;
const AUDIO_ROTATION_RETURN = 4.5;
const AUDIO_ROTATION_SUSTAIN_SCALE = 4.8;
const AUDIO_ROTATION_IMPULSE_SCALE = 1.75;
const AUDIO_ROTATION_BEAT_IMPULSE_SCALE = 0.9;
const AUDIO_ROTATION_BEAT_CONFIDENCE_FLOOR = 0.3;
const AUDIO_ROTATION_DRIVE_DEADZONE = 0.08;

function deriveIdleLogoAlpha(intensity) {
  return Math.min(1, intensity * IDLE_LOGO_ALPHA_RATIO);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}

function wrapAngle(angle) {
  const turn = Math.PI * 2;
  let wrapped = angle;
  while (wrapped <= -Math.PI) wrapped += turn;
  while (wrapped > Math.PI) wrapped -= turn;
  return wrapped;
}

function dampAngle(current, target, smoothing, deltaTime) {
  const delta = wrapAngle(target - current);
  return wrapAngle(
    current + delta * (1 - Math.exp(-smoothing * Math.max(0, deltaTime))),
  );
}

function normalizeRotationMode(mode) {
  if (mode === "manual" || mode === "off") {
    return mode;
  }
  return "audio";
}

function createSceneMotionState(initialYaw = 0) {
  return {
    yaw: initialYaw,
    angularVelocity: 0,
    targetAngularVelocity: 0,
    lastMotionSignal: 0,
    lastBeatPulseId: 0,
    idleLogoYaw: initialYaw,
  };
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
    "colorMode",
    "chromesthesiaMix",
    "zeroPointPrecision",
    "structureMin",
    "structureMax",
    "raymarchSteps",
    "densityGain",
    "absorption",
    "contourSharpness",
    "reactivity",
    "structurePersistence",
    "rimBloomBias",
    "rimCompression",
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
  uniforms.uAbsorption.value = controls.absorption;
  uniforms.uContourSharpness.value = controls.contourSharpness;
  uniforms.uRimBloomBias.value = controls.rimBloomBias;
  uniforms.uRimCompression.value = controls.rimCompression;
  uniforms.uRaymarchSteps.value = stepBudget;
  runtimeState.baseDensityGain = controls.densityGain;
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
      colorMode,
      chromesthesiaMix,
      threshold: uniforms.uThreshold.value,
      structureMin: uniforms.uStructureMin.value,
      structureMax: uniforms.uStructureMax.value,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoAlpha,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      densityGain: uniforms.uDensityGain.value,
      absorption: uniforms.uAbsorption.value,
      contourSharpness: uniforms.uContourSharpness.value,
      reactivity: runtimeState.reactivityTuning?.reactivity,
      motionAmount: runtimeState.reactivityTuning?.motionAmount,
      structurePersistence: runtimeState.reactivityTuning?.structurePersistence,
      rimBloomBias: uniforms.uRimBloomBias.value,
      rimCompression: uniforms.uRimCompression.value,
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

  const sceneMotion =
    runtimeState?.sceneMotion ?? createSceneMotionState(points.rotation.y ?? 0);
  const rotationMode = normalizeRotationMode(controls.rotationMode);
  const manualVelocity =
    (controls.rotationSpeed ?? RENDER_DEFAULTS.rotationSpeed) *
    MANUAL_ROTATION_RATE_SCALE;
  const motionAmount = Math.max(
    0,
    controls.motionAmount ??
      runtimeState?.reactivityTuning?.motionAmount ??
      REACTIVITY_DEFAULTS.motionAmount,
  );
  const audioActive =
    status?.isPlaying ||
    status?.isMicActive ||
    featureFrame?.fieldState === "test";
  const fieldDriven =
    featureFrame?.fieldState && featureFrame.fieldState !== "idle";
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const beatPulseId = featureFrame?.beatPulseId ?? 0;
  const beatStrength = clamp01(featureFrame?.beatStrength ?? 0);
  const beatConfidence = clamp01(featureFrame?.beatConfidence ?? 0);
  const responseEnvelope = clamp01(runtimeState?.responseEnvelope ?? 0);
  const motionSignal = clamp01(
    changeSignal * 0.56 +
      pulseSignal * 0.22 +
      energySignal * 0.14 +
      responseEnvelope * 0.08,
  );
  const motionImpulse = clamp01(
    motionSignal - (sceneMotion.lastMotionSignal ?? 0) * 0.7,
  );
  const bedSignal = clamp01(
    structureSignal * 0.14 + energySignal * 0.22 + responseEnvelope * 0.24,
  );
  const reactiveSignal = clamp01(
    changeSignal * 0.62 + motionImpulse * 0.82 + pulseSignal * 0.18,
  );
  const rotationDrive = clamp01(bedSignal * 0.4 + reactiveSignal * 0.6);
  const shapedDrive =
    rotationDrive <= AUDIO_ROTATION_DRIVE_DEADZONE
      ? 0
      : Math.pow(
          (rotationDrive - AUDIO_ROTATION_DRIVE_DEADZONE) /
            (1 - AUDIO_ROTATION_DRIVE_DEADZONE),
          1.35,
        );

  sceneMotion.yaw = points.rotation.y ?? sceneMotion.yaw ?? 0;

  if (rotationMode === "manual") {
    sceneMotion.targetAngularVelocity = manualVelocity;
    sceneMotion.angularVelocity = manualVelocity;
    sceneMotion.yaw = wrapAngle(sceneMotion.yaw + manualVelocity * deltaTime);
  } else if (rotationMode === "audio" && audioActive && fieldDriven) {
    sceneMotion.targetAngularVelocity = -clamp(
      motionAmount *
        (AUDIO_ROTATION_MIN_SPEED +
          shapedDrive * AUDIO_ROTATION_SUSTAIN_SCALE +
          reactiveSignal * 0.45),
      0,
      AUDIO_ROTATION_MAX_SPEED,
    );
    if (
      beatPulseId > 0 &&
      beatPulseId !== sceneMotion.lastBeatPulseId &&
      featureFrame?.beatDetected
    ) {
      sceneMotion.lastBeatPulseId = beatPulseId;
      sceneMotion.angularVelocity = clamp(
        sceneMotion.angularVelocity -
          motionAmount *
            AUDIO_ROTATION_BEAT_IMPULSE_SCALE *
            Math.max(0.18, beatStrength) *
            Math.max(AUDIO_ROTATION_BEAT_CONFIDENCE_FLOOR, beatConfidence),
        -AUDIO_ROTATION_MAX_SPEED,
        AUDIO_ROTATION_MAX_SPEED,
      );
    }
    if (motionImpulse > 0.04) {
      sceneMotion.angularVelocity = clamp(
        sceneMotion.angularVelocity -
          motionImpulse * motionAmount * AUDIO_ROTATION_IMPULSE_SCALE,
        -AUDIO_ROTATION_MAX_SPEED,
        AUDIO_ROTATION_MAX_SPEED,
      );
    }
    const smoothing =
      Math.abs(sceneMotion.targetAngularVelocity) >
      Math.abs(sceneMotion.angularVelocity)
        ? AUDIO_ROTATION_ATTACK
        : AUDIO_ROTATION_RELEASE;
    sceneMotion.angularVelocity = clamp(
      damp(
        sceneMotion.angularVelocity,
        sceneMotion.targetAngularVelocity,
        smoothing,
        deltaTime,
      ),
      -AUDIO_ROTATION_MAX_SPEED,
      AUDIO_ROTATION_MAX_SPEED,
    );
    sceneMotion.yaw = wrapAngle(
      sceneMotion.yaw + sceneMotion.angularVelocity * deltaTime,
    );
  } else {
    sceneMotion.targetAngularVelocity = 0;
    sceneMotion.angularVelocity = damp(
      sceneMotion.angularVelocity,
      0,
      AUDIO_ROTATION_IDLE_DAMP,
      deltaTime,
    );
    sceneMotion.yaw = wrapAngle(
      sceneMotion.yaw + sceneMotion.angularVelocity * deltaTime,
    );
    sceneMotion.yaw = dampAngle(
      sceneMotion.yaw,
      0,
      AUDIO_ROTATION_RETURN,
      deltaTime,
    );
    if (Math.abs(sceneMotion.angularVelocity) < 1e-4) {
      sceneMotion.angularVelocity = 0;
    }
    if (Math.abs(sceneMotion.yaw) < 1e-4) {
      sceneMotion.yaw = 0;
    }
  }
  sceneMotion.lastMotionSignal = motionSignal;

  points.rotation.y = sceneMotion.yaw;
  if (runtimeState?.idleOverlay?.rotation) {
    sceneMotion.idleLogoYaw = wrapAngle(
      (sceneMotion.idleLogoYaw ?? sceneMotion.yaw ?? 0) +
        manualVelocity * deltaTime,
    );
    runtimeState.idleOverlay.rotation.y = wrapAngle(
      sceneMotion.idleLogoYaw - sceneMotion.yaw,
    );
  }
  if (runtimeState) {
    runtimeState.sceneMotion = sceneMotion;
  }

  return {
    rotationMode,
    rotationSpeed: controls.rotationSpeed,
    motionAmount,
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    motionSignal,
    responseEnvelope,
    angularVelocity: sceneMotion.angularVelocity,
    targetAngularVelocity: sceneMotion.targetAngularVelocity,
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
