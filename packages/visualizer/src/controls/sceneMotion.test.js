import { describe, expect, it } from "vitest";
import {
  createDisabledSceneSnapshot,
  createSceneMotionState,
  deriveSceneSignals,
  stepAudioSceneMotion,
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
    expect(signals.shapedDrive).toBeCloseTo(0.5314303);
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
        angularVelocity: -0.4,
        targetAngularVelocity: -0.2,
        lastMotionSignal: 0.8,
        lastBeatPulseId: 6,
        idleLogoYaw: 0.3,
      },
    };
    const points = {
      rotation: { y: 1.1 },
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

    expect(points.rotation.y).toBe(0);
    expect(runtimeState.idleOverlay.rotation.y).toBeCloseTo(-0.2);
    expect(runtimeState.sceneMotion).toEqual({
      yaw: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
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
      rotationY: 0,
    });
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
