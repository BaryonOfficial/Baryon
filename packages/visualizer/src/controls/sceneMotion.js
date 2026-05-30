import { REACTIVITY_DEFAULTS, RENDER_DEFAULTS } from "../defaults.js";

const MANUAL_ROTATION_RATE_SCALE = -0.5;
const AUDIO_ROTATION_MIN_SPEED = 0.03;
const AUDIO_ROTATION_MAX_SPEED = 4.8;
const AUDIO_ROTATION_ATTACK = 14;
const AUDIO_ROTATION_RELEASE = 4.8;
const AUDIO_ROTATION_IDLE_DAMP = 5.5;
const AUDIO_ROTATION_RETURN = 4.5;
const AUDIO_ROTATION_SUSTAIN_SCALE = 5.4;
const AUDIO_ROTATION_IMPULSE_SCALE = 2.35;
const AUDIO_ROTATION_BEAT_IMPULSE_SCALE = 1.2;
const AUDIO_ROTATION_BEAT_CONFIDENCE_FLOOR = 0.3;
const AUDIO_ROTATION_DRIVE_DEADZONE = 0.055;
const AUDIO_ROTATION_DRIVE_EXPONENT = 1.15;
const AUDIO_ROTATION_IMPULSE_OVERSHOOT_CAP = 2.0;
const AUDIO_ATTITUDE_MAX_PITCH = 0.075;
const AUDIO_ATTITUDE_MAX_ROLL = 0.06;
const AUDIO_ATTITUDE_TRANSIENT_SCALE = 0.055;
const AUDIO_ATTITUDE_BEAT_SCALE = 0.035;
const AUDIO_ATTITUDE_DAMP = 9.5;
const AUDIO_ATTITUDE_RETURN = 8.0;

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

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function ensureAttitudeState(sceneMotion) {
  sceneMotion.pitch = finiteOr(sceneMotion.pitch, 0);
  sceneMotion.roll = finiteOr(sceneMotion.roll, 0);
  sceneMotion.pitchVelocity = finiteOr(sceneMotion.pitchVelocity, 0);
  sceneMotion.rollVelocity = finiteOr(sceneMotion.rollVelocity, 0);
}

function settleAttitude(sceneMotion, deltaTime) {
  ensureAttitudeState(sceneMotion);
  const previousPitch = sceneMotion.pitch;
  const previousRoll = sceneMotion.roll;
  sceneMotion.pitchVelocity = damp(
    sceneMotion.pitchVelocity,
    0,
    AUDIO_ATTITUDE_DAMP,
    deltaTime,
  );
  sceneMotion.rollVelocity = damp(
    sceneMotion.rollVelocity,
    0,
    AUDIO_ATTITUDE_DAMP,
    deltaTime,
  );
  const returnedPitch = damp(
    sceneMotion.pitch + sceneMotion.pitchVelocity * deltaTime,
    0,
    AUDIO_ATTITUDE_RETURN,
    deltaTime,
  );
  const returnedRoll = damp(
    sceneMotion.roll + sceneMotion.rollVelocity * deltaTime,
    0,
    AUDIO_ATTITUDE_RETURN,
    deltaTime,
  );
  sceneMotion.pitch = clamp(
    previousPitch !== 0 &&
      Math.sign(returnedPitch) !== Math.sign(previousPitch) &&
      Math.abs(returnedPitch) > Math.abs(previousPitch)
      ? 0
      : returnedPitch,
    -AUDIO_ATTITUDE_MAX_PITCH,
    AUDIO_ATTITUDE_MAX_PITCH,
  );
  sceneMotion.roll = clamp(
    previousRoll !== 0 &&
      Math.sign(returnedRoll) !== Math.sign(previousRoll) &&
      Math.abs(returnedRoll) > Math.abs(previousRoll)
      ? 0
      : returnedRoll,
    -AUDIO_ATTITUDE_MAX_ROLL,
    AUDIO_ATTITUDE_MAX_ROLL,
  );
  if (Math.abs(sceneMotion.pitchVelocity) < 1e-4) {
    sceneMotion.pitchVelocity = 0;
  }
  if (Math.abs(sceneMotion.rollVelocity) < 1e-4) {
    sceneMotion.rollVelocity = 0;
  }
  if (Math.abs(sceneMotion.pitch) < 1e-4) {
    sceneMotion.pitch = 0;
  }
  if (Math.abs(sceneMotion.roll) < 1e-4) {
    sceneMotion.roll = 0;
  }
}

function applyAttitudeKick(sceneMotion, kick) {
  ensureAttitudeState(sceneMotion);
  const yaw = finiteOr(sceneMotion.yaw, 0);
  sceneMotion.pitchVelocity += Math.cos(yaw) * kick;
  sceneMotion.rollVelocity += Math.sin(yaw + Math.PI / 4) * kick;
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
    pitch: 0,
    roll: 0,
    angularVelocity: 0,
    targetAngularVelocity: 0,
    pitchVelocity: 0,
    rollVelocity: 0,
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
  const fallbackTransientSignal = clamp01(
    finiteOr(featureFrame?.changeBreakdown?.hit, 0) / 0.26,
  );
  const transientSignal = clamp01(
    Number.isFinite(featureFrame?.transientEnergy)
      ? featureFrame.transientEnergy
      : fallbackTransientSignal,
  );
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
  const torqueImpulse = clamp01(
    Math.max(
      motionImpulse,
      transientSignal * 0.7 + pulseSignal * 0.18 + changeSignal * 0.12,
    ),
  );
  const attitudeImpulse = clamp01(
    transientSignal * 0.65 + motionImpulse * 0.2 + pulseSignal * 0.15,
  );
  const rotationDrive = clamp01(bedSignal * 0.4 + reactiveSignal * 0.6);
  const shapedDrive =
    rotationDrive <= AUDIO_ROTATION_DRIVE_DEADZONE
      ? 0
      : Math.pow(
          (rotationDrive - AUDIO_ROTATION_DRIVE_DEADZONE) /
            (1 - AUDIO_ROTATION_DRIVE_DEADZONE),
          AUDIO_ROTATION_DRIVE_EXPONENT,
        );

  return {
    structureSignal,
    energySignal,
    changeSignal,
    pulseSignal,
    responseEnvelope: normalizedResponseEnvelope,
    transientSignal,
    motionSignal,
    motionImpulse,
    torqueImpulse,
    attitudeImpulse,
    bedSignal,
    reactiveSignal,
    rotationDrive,
    shapedDrive,
  };
}

export function stepManualSceneMotion(sceneMotion, manualVelocity, deltaTime) {
  ensureAttitudeState(sceneMotion);
  sceneMotion.targetAngularVelocity = manualVelocity;
  sceneMotion.angularVelocity = manualVelocity;
  sceneMotion.yaw = wrapAngle(sceneMotion.yaw + manualVelocity * deltaTime);
  settleAttitude(sceneMotion, deltaTime);
}

export function stepAudioSceneMotion(
  sceneMotion,
  {
    motionAmount,
    shapedDrive,
    reactiveSignal,
    motionImpulse,
    torqueImpulse,
    attitudeImpulse,
    beatPulseId,
    beatStrength,
    beatConfidence,
    beatDetected,
    deltaTime,
  },
) {
  ensureAttitudeState(sceneMotion);
  sceneMotion.targetAngularVelocity = -clamp(
    motionAmount *
      (AUDIO_ROTATION_MIN_SPEED +
        shapedDrive * AUDIO_ROTATION_SUSTAIN_SCALE +
        reactiveSignal * 0.55),
    0,
    AUDIO_ROTATION_MAX_SPEED,
  );

  const beatDrive =
    Math.max(0.18, finiteOr(beatStrength, 0)) *
    Math.max(AUDIO_ROTATION_BEAT_CONFIDENCE_FLOOR, finiteOr(beatConfidence, 0));
  if (
    beatPulseId > 0 &&
    beatPulseId !== sceneMotion.lastBeatPulseId &&
    beatDetected
  ) {
    sceneMotion.lastBeatPulseId = beatPulseId;
    sceneMotion.angularVelocity = clamp(
      sceneMotion.angularVelocity -
        motionAmount * AUDIO_ROTATION_BEAT_IMPULSE_SCALE * beatDrive,
      -AUDIO_ROTATION_MAX_SPEED,
      AUDIO_ROTATION_MAX_SPEED,
    );
    applyAttitudeKick(
      sceneMotion,
      motionAmount * AUDIO_ATTITUDE_BEAT_SCALE * beatDrive,
    );
  }

  const effectiveTorqueImpulse = clamp01(torqueImpulse ?? motionImpulse ?? 0);
  if (effectiveTorqueImpulse > 0.04) {
    sceneMotion.angularVelocity = clamp(
      sceneMotion.angularVelocity -
        effectiveTorqueImpulse * motionAmount * AUDIO_ROTATION_IMPULSE_SCALE,
      -AUDIO_ROTATION_MAX_SPEED,
      AUDIO_ROTATION_MAX_SPEED,
    );
  }
  const effectiveAttitudeImpulse = clamp01(attitudeImpulse ?? 0);
  if (effectiveAttitudeImpulse > 0.04) {
    applyAttitudeKick(
      sceneMotion,
      effectiveAttitudeImpulse * motionAmount * AUDIO_ATTITUDE_TRANSIENT_SCALE,
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
  settleAttitude(sceneMotion, deltaTime);
}

export function stepSettlingSceneMotion(sceneMotion, deltaTime) {
  ensureAttitudeState(sceneMotion);
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
  settleAttitude(sceneMotion, deltaTime);
}

export function stopAudioSceneMotion(sceneMotion) {
  ensureAttitudeState(sceneMotion);
  sceneMotion.targetAngularVelocity = 0;
  sceneMotion.angularVelocity = 0;
  sceneMotion.pitchVelocity = 0;
  sceneMotion.rollVelocity = 0;
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
  rotationX,
  rotationY,
  rotationZ,
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
    pitchVelocity: sceneMotion.pitchVelocity,
    rollVelocity: sceneMotion.rollVelocity,
    rotationX: rotationX ?? sceneMotion.pitch ?? 0,
    rotationY,
    rotationZ: rotationZ ?? sceneMotion.roll ?? 0,
  };
}
