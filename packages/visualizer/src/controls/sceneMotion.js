import { REACTIVITY_DEFAULTS, RENDER_DEFAULTS } from "../defaults.js";

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
const AUDIO_ROTATION_IMPULSE_OVERSHOOT_CAP = 2.0;

const AUTO_MOTION_ENVELOPE_ATTACK = 3.0;
const AUTO_MOTION_ENVELOPE_RELEASE = 0.22;
const AUTO_MOTION_AMOUNT_MIN = 0.6;
const AUTO_MOTION_AMOUNT_MAX = 2.0;

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

export function normalizeRotationMode(mode) {
  if (mode === "manual" || mode === "off") {
    return mode;
  }
  return "audio";
}

export function createSceneMotionState(initialYaw = 0) {
  return {
    yaw: initialYaw,
    angularVelocity: 0,
    targetAngularVelocity: 0,
    lastMotionSignal: 0,
    lastBeatPulseId: 0,
    idleLogoYaw: initialYaw,
    motionAmountEnvelope: 0.5,
  };
}

export function deriveAutoMotionAmount(sceneMotion, energySignal, deltaTime) {
  const energy = clamp01(energySignal ?? 0);
  const currentEnvelope = sceneMotion.motionAmountEnvelope ?? 0.5;
  const smoothing =
    energy > currentEnvelope
      ? AUTO_MOTION_ENVELOPE_ATTACK
      : AUTO_MOTION_ENVELOPE_RELEASE;
  sceneMotion.motionAmountEnvelope = clamp01(
    damp(currentEnvelope, energy, smoothing, deltaTime),
  );
  return (
    AUTO_MOTION_AMOUNT_MIN +
    sceneMotion.motionAmountEnvelope *
      (AUTO_MOTION_AMOUNT_MAX - AUTO_MOTION_AMOUNT_MIN)
  );
}

export function getMotionAmount(controls, runtimeState) {
  return Math.max(
    0,
    controls.motionAmount ??
      runtimeState?.reactivityTuning?.motionAmount ??
      REACTIVITY_DEFAULTS.motionAmount,
  );
}

export function getManualVelocity(controls) {
  return (
    (controls.rotationSpeed ?? RENDER_DEFAULTS.rotationSpeed) *
    MANUAL_ROTATION_RATE_SCALE
  );
}

export function deriveSceneSignals(
  featureFrame,
  responseEnvelope,
  lastMotionSignal,
) {
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const normalizedResponseEnvelope = clamp01(responseEnvelope ?? 0);
  const motionSignal = clamp01(
    changeSignal * 0.56 +
      pulseSignal * 0.22 +
      energySignal * 0.14 +
      normalizedResponseEnvelope * 0.08,
  );
  const motionImpulse = clamp01(motionSignal - (lastMotionSignal ?? 0) * 0.7);
  const bedSignal = clamp01(
    structureSignal * energySignal * 0.2 +
      energySignal * 0.22 +
      normalizedResponseEnvelope * 0.24,
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

  return {
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    responseEnvelope: normalizedResponseEnvelope,
    motionSignal,
    motionImpulse,
    bedSignal,
    reactiveSignal,
    rotationDrive,
    shapedDrive,
  };
}

export function stepManualSceneMotion(sceneMotion, manualVelocity, deltaTime) {
  sceneMotion.targetAngularVelocity = manualVelocity;
  sceneMotion.angularVelocity = manualVelocity;
  sceneMotion.yaw = wrapAngle(sceneMotion.yaw + manualVelocity * deltaTime);
}

export function stepAudioSceneMotion(
  sceneMotion,
  {
    motionAmount,
    shapedDrive,
    reactiveSignal,
    motionImpulse,
    beatPulseId,
    beatStrength,
    beatConfidence,
    beatDetected,
    deltaTime,
  },
) {
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
    beatDetected
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

  if (sceneMotion.targetAngularVelocity < 0) {
    const impulseCap =
      sceneMotion.targetAngularVelocity * AUDIO_ROTATION_IMPULSE_OVERSHOOT_CAP;
    sceneMotion.angularVelocity = Math.max(
      sceneMotion.angularVelocity,
      impulseCap,
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
}

export function stepSettlingSceneMotion(sceneMotion, deltaTime) {
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

export function syncIdleOverlayRotation(
  runtimeState,
  sceneMotion,
  manualVelocity,
  deltaTime,
) {
  if (!runtimeState?.idleOverlay?.rotation) {
    return;
  }

  sceneMotion.idleLogoYaw = wrapAngle(
    (sceneMotion.idleLogoYaw ?? sceneMotion.yaw ?? 0) +
      manualVelocity * deltaTime,
  );
  runtimeState.idleOverlay.rotation.y = wrapAngle(
    sceneMotion.idleLogoYaw - sceneMotion.yaw,
  );
}

export function buildSceneSnapshot({
  rotationMode,
  rotationSpeed,
  motionAmount,
  signals,
  sceneMotion,
  rotationY,
}) {
  return {
    rotationMode,
    rotationSpeed,
    motionAmount,
    structureSignal: signals.structureSignal,
    energySignal: signals.energySignal,
    changeSignal: signals.changeSignal,
    pulseSignal: signals.pulseSignal,
    motionSignal: signals.motionSignal,
    responseEnvelope: signals.responseEnvelope,
    angularVelocity: sceneMotion.angularVelocity,
    targetAngularVelocity: sceneMotion.targetAngularVelocity,
    rotationY,
  };
}

export function createDisabledSceneSnapshot(
  runtimeState,
  points,
  controls,
  featureFrame,
  deltaTime = 0,
) {
  const sceneMotion =
    runtimeState?.sceneMotion ?? createSceneMotionState(points.rotation.y ?? 0);

  points.rotation.y = 0;
  sceneMotion.yaw = 0;
  sceneMotion.angularVelocity = 0;
  sceneMotion.targetAngularVelocity = 0;
  sceneMotion.lastMotionSignal = 0;
  sceneMotion.lastBeatPulseId = 0;
  syncIdleOverlayRotation(
    runtimeState,
    sceneMotion,
    getManualVelocity(controls),
    deltaTime,
  );
  if (runtimeState) {
    runtimeState.sceneMotion = sceneMotion;
  }

  return buildSceneSnapshot({
    rotationMode: "disabled",
    rotationSpeed: 0,
    motionAmount: getMotionAmount(controls, runtimeState),
    signals: {
      structureSignal: clamp01(featureFrame?.structureSignal ?? 0),
      energySignal: clamp01(featureFrame?.energySignal ?? 0),
      changeSignal: clamp01(featureFrame?.changeSignal ?? 0),
      pulseSignal: clamp01(featureFrame?.pulseSignal ?? 0),
      motionSignal: clamp01(runtimeState?.motionSignal ?? 0),
      responseEnvelope: clamp01(runtimeState?.responseEnvelope ?? 0),
    },
    sceneMotion,
    rotationY: 0,
  });
}
