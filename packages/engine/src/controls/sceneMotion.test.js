import { describe, expect, it } from "vitest";
import {
  createSceneMotionState,
  deriveAutoMotionAmount,
  deriveSceneSignals,
  stepAudioSceneMotion,
  stepManualSceneMotion,
  stepSettlingSceneMotion,
} from "./sceneMotion.js";

describe("scene motion helpers", () => {
  it("derives sustained motion and a one-time onset from the canonical response envelope", () => {
    const onset = deriveSceneSignals(0.6, 0),
      steady = deriveSceneSignals(0.6, 0.6);
    expect(onset.energySignal).toBe(0.6);
    expect(onset.motionImpulse).toBe(0.6);
    expect(steady.energySignal).toBe(0.6);
    expect(steady.motionImpulse).toBe(0);
    expect(steady.shapedDrive).toBeGreaterThan(0);
    expect(onset.shapedDrive).toBeGreaterThan(steady.shapedDrive);
  });
  it("silence and a falling envelope cannot invent onset torque", () => {
    expect(deriveSceneSignals(0, 0.6)).toMatchObject({
      motionSignal: 0,
      motionImpulse: 0,
      shapedDrive: 0,
    });
    expect(deriveSceneSignals(0.2, 0.6).torqueImpulse).toBe(0);
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
      deltaTime: 1 / 60,
    });

    expect(Math.abs(motion.pitch)).toBeGreaterThan(0);
    expect(Math.abs(motion.roll)).toBeGreaterThan(0);
    expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(0.075);
    expect(Math.abs(motion.roll)).toBeLessThanOrEqual(0.06);
  });

  it("caps impulse-pushed velocity to 2× target angular velocity", () => {
    const motion = createSceneMotionState(0);
    // A large onset kick must remain bounded by the sustained target.
    stepAudioSceneMotion(motion, {
      motionAmount: 3.0,
      shapedDrive: 0.05,
      reactiveSignal: 0.05,
      motionImpulse: 0,
      torqueImpulse: 1,
      attitudeImpulse: 0,
      deltaTime: 1 / 60,
    });
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
});
