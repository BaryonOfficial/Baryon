import { describe, expect, it } from "vitest";
import {
  createDisabledSceneSnapshot,
  createSceneMotionState,
  deriveAutoMotionAmount,
  deriveSceneSignals,
  stepAudioSceneMotion,
  stepManualSceneMotion,
  stepSettlingSceneMotion,
  syncIdleOverlayRotation,
} from "./sceneMotion.js";

describe("scene motion helpers", () => {
  it("derives stable scene signals for a representative active frame", () => {
    const signals = deriveSceneSignals(
      {
        structureSignal: 0.55,
        energySignal: 0.72,
        changeSignal: 0.64,
        pulseSignal: 0.3,
      },
      0.5,
      0.1,
    );

    expect(signals.structureSignal).toBeCloseTo(0.55);
    expect(signals.energySignal).toBeCloseTo(0.72);
    expect(signals.changeSignal).toBeCloseTo(0.64);
    expect(signals.pulseSignal).toBeCloseTo(0.3);
    expect(signals.responseEnvelope).toBeCloseTo(0.5);
    expect(signals.motionSignal).toBeCloseTo(0.5652);
    expect(signals.motionImpulse).toBeCloseTo(0.4952);
    expect(signals.rotationDrive).toBeCloseTo(0.6562784);
    expect(signals.shapedDrive).toBeCloseTo(0.5955535);
  });

  it("keeps 2d field rotation disabled while the idle logo keeps manual spin", () => {
    const runtimeState = {
      motionSignal: 0.6,
      responseEnvelope: 0.7,
      reactivityTuning: {
        motionAmount: 1.2,
      },
      idleOverlay: {
        rotation: { y: 1.4 },
      },
      sceneMotion: {
        yaw: 0.9,
        pitch: 0.04,
        roll: -0.03,
        angularVelocity: -0.4,
        targetAngularVelocity: -0.2,
        pitchVelocity: 0.3,
        rollVelocity: -0.2,
        lastMotionSignal: 0.8,
        lastBeatPulseId: 6,
        idleLogoYaw: 0.3,
      },
    };
    const points = {
      rotation: { x: 0.04, y: 1.1, z: -0.03 },
    };

    const snapshot = createDisabledSceneSnapshot(
      runtimeState,
      points,
      { motionAmount: undefined, rotationSpeed: 2 },
      {
        structureSignal: 0.2,
        energySignal: 0.4,
        changeSignal: 0.5,
        pulseSignal: 0.6,
      },
      0.5,
    );

    expect(points.rotation.x).toBe(0);
    expect(points.rotation.y).toBe(0);
    expect(points.rotation.z).toBe(0);
    expect(runtimeState.idleOverlay.rotation.y).toBeCloseTo(-0.2);
    expect(runtimeState.sceneMotion).toEqual({
      yaw: 0,
      pitch: 0,
      roll: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
      pitchVelocity: 0,
      rollVelocity: 0,
      lastMotionSignal: 0,
      lastBeatPulseId: 0,
      idleLogoYaw: -0.2,
    });
    expect(snapshot).toEqual({
      rotationMode: "disabled",
      rotationSpeed: 0,
      motionAmount: 1.2,
      structureSignal: 0.2,
      energySignal: 0.4,
      changeSignal: 0.5,
      pulseSignal: 0.6,
      motionSignal: 0.6,
      responseEnvelope: 0.7,
      angularVelocity: 0,
      targetAngularVelocity: 0,
      pitchVelocity: 0,
      rollVelocity: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    });
  });

  it("derives transient torque and lower-deadzone audio drive from current frame signals", () => {
    const signals = deriveSceneSignals(
      {
        structureSignal: 0.05,
        energySignal: 0.08,
        changeSignal: 0.07,
        pulseSignal: 0,
        transientEnergy: 0.7,
      },
      0.03,
      0,
    );

    expect(signals.transientSignal).toBeCloseTo(0.7);
    expect(signals.torqueImpulse).toBeGreaterThan(signals.motionImpulse);
    expect(signals.attitudeImpulse).toBeGreaterThan(0.45);
    expect(signals.rotationDrive).toBeGreaterThan(0.055);
    expect(signals.shapedDrive).toBeGreaterThan(0);
  });

  it("falls back to the hit change breakdown when transient energy is absent", () => {
    const signals = deriveSceneSignals(
      {
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0.1,
        changeBreakdown: { hit: 0.13 },
        pulseSignal: 0,
      },
      0,
      0,
    );

    expect(signals.transientSignal).toBeCloseTo(0.5);
    expect(signals.attitudeImpulse).toBeGreaterThan(0.3);
  });

  it("consumes each beat pulse id only once in the audio step helper", () => {
    const freshSceneMotion = createSceneMotionState(0);
    const consumedSceneMotion = createSceneMotionState(0);
    consumedSceneMotion.lastBeatPulseId = 17;

    const args = {
      motionAmount: 1.2,
      shapedDrive: 0.51,
      reactiveSignal: 0.48,
      motionImpulse: 0.22,
      torqueImpulse: 0.38,
      attitudeImpulse: 0.42,
      beatPulseId: 17,
      beatStrength: 0.74,
      beatConfidence: 0.69,
      beatDetected: true,
      deltaTime: 1 / 60,
    };

    stepAudioSceneMotion(freshSceneMotion, args);
    stepAudioSceneMotion(consumedSceneMotion, args);

    expect(freshSceneMotion.lastBeatPulseId).toBe(17);
    expect(consumedSceneMotion.lastBeatPulseId).toBe(17);
    expect(freshSceneMotion.angularVelocity).toBeLessThan(
      consumedSceneMotion.angularVelocity,
    );
    expect(Math.abs(freshSceneMotion.pitch)).toBeGreaterThan(
      Math.abs(consumedSceneMotion.pitch),
    );
    expect(Math.abs(freshSceneMotion.roll)).toBeGreaterThan(
      Math.abs(consumedSceneMotion.roll),
    );
  });

  it("adds capped pitch and roll attitude from transient torque", () => {
    const motion = createSceneMotionState(0.6);
    stepAudioSceneMotion(motion, {
      motionAmount: 1.5,
      shapedDrive: 0.6,
      reactiveSignal: 0.55,
      motionImpulse: 0.22,
      torqueImpulse: 0.8,
      attitudeImpulse: 0.8,
      beatPulseId: 0,
      beatStrength: 0,
      beatConfidence: 0,
      beatDetected: false,
      deltaTime: 1 / 60,
    });

    expect(Math.abs(motion.pitch)).toBeGreaterThan(0);
    expect(Math.abs(motion.roll)).toBeGreaterThan(0);
    expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(0.075);
    expect(Math.abs(motion.roll)).toBeLessThanOrEqual(0.06);
  });

  it("caps impulse-pushed velocity to 2× target angular velocity", () => {
    const motion = createSceneMotionState(0);
    // Use a high motionAmount + max beat to produce a kick that would exceed 2× target
    stepAudioSceneMotion(motion, {
      motionAmount: 3.0,
      shapedDrive: 0.05,
      reactiveSignal: 0.05,
      motionImpulse: 0,
      torqueImpulse: 0,
      attitudeImpulse: 0,
      beatPulseId: 42,
      beatStrength: 1.0,
      beatConfidence: 1.0,
      beatDetected: true,
      deltaTime: 1 / 60,
    });
    // targetAngularVelocity ≈ -0.878; uncapped impulse would push velocity to ~-3.6
    expect(motion.targetAngularVelocity).toBeLessThan(0);
    expect(motion.angularVelocity).toBeGreaterThanOrEqual(
      motion.targetAngularVelocity * 2.0,
    );
  });

  it("settles audio attitude toward neutral in manual and off paths", () => {
    const manualMotion = createSceneMotionState(0);
    manualMotion.pitch = 0.05;
    manualMotion.roll = -0.04;
    manualMotion.pitchVelocity = 0.2;
    manualMotion.rollVelocity = -0.15;

    stepManualSceneMotion(manualMotion, -1, 0.25);

    expect(Math.abs(manualMotion.pitch)).toBeLessThan(0.05);
    expect(Math.abs(manualMotion.roll)).toBeLessThan(0.04);

    const settlingMotion = createSceneMotionState(0.5);
    settlingMotion.pitch = 0.05;
    settlingMotion.roll = -0.04;
    settlingMotion.pitchVelocity = 0.2;
    settlingMotion.rollVelocity = -0.15;

    stepSettlingSceneMotion(settlingMotion, 0.25);

    expect(Math.abs(settlingMotion.pitch)).toBeLessThan(0.05);
    expect(Math.abs(settlingMotion.roll)).toBeLessThan(0.04);
  });

  it("keeps dense-frame audio torque moving in the same yaw direction", () => {
    const motion = createSceneMotionState(0);

    for (let index = 0; index < 16; index += 1) {
      stepAudioSceneMotion(motion, {
        motionAmount: 1.4,
        shapedDrive: 0.78,
        reactiveSignal: 0.72,
        motionImpulse: 0.42,
        torqueImpulse: 0.74,
        attitudeImpulse: 0.68,
        beatPulseId: index + 1,
        beatStrength: 0.82,
        beatConfidence: 0.8,
        beatDetected: true,
        deltaTime: 1 / 60,
      });

      expect(motion.angularVelocity).toBeLessThanOrEqual(0);
      expect(Math.abs(motion.angularVelocity)).toBeLessThanOrEqual(4.8);
    }
  });

  it("deriveAutoMotionAmount rises quickly on fast attack", () => {
    const sceneMotion = createSceneMotionState(0);
    sceneMotion.motionAmountEnvelope = 0.5;
    const before = sceneMotion.motionAmountEnvelope;
    const result = deriveAutoMotionAmount(sceneMotion, 0.9, 1 / 60);
    expect(sceneMotion.motionAmountEnvelope).toBeGreaterThan(before);
    expect(result).toBeGreaterThanOrEqual(0.6);
    expect(result).toBeLessThanOrEqual(2.0);
  });

  it("deriveAutoMotionAmount decays slowly on release", () => {
    const sceneMotion = createSceneMotionState(0);
    // Prime envelope to high value
    for (let i = 0; i < 120; i++) {
      deriveAutoMotionAmount(sceneMotion, 0.9, 1 / 60);
    }
    const primed = sceneMotion.motionAmountEnvelope;
    // One frame of release toward low signal
    deriveAutoMotionAmount(sceneMotion, 0.1, 1 / 60);
    const change = primed - sceneMotion.motionAmountEnvelope;
    // Release should move the envelope very little per frame (< 0.01)
    expect(change).toBeLessThan(0.01);
  });

  it("keeps the idle overlay synced to manual velocity", () => {
    const runtimeState = {
      idleOverlay: {
        rotation: { y: 0 },
      },
    };
    const sceneMotion = createSceneMotionState(0);

    syncIdleOverlayRotation(runtimeState, sceneMotion, -1, 0.5);

    expect(sceneMotion.idleLogoYaw).toBeCloseTo(-0.5);
    expect(runtimeState.idleOverlay.rotation.y).toBeCloseTo(-0.5);
  });
});
