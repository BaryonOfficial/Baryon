import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { tickCymatics2dRuntime } from "./runtime.js";

function createRuntimeState() {
  return {
    backboneModeBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    detailModeBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    backboneColorBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    detailColorBuffer: {
      value: {
        array: new Float32Array(32),
        needsUpdate: false,
      },
    },
    uniforms: {
      uTime: { value: 0 },
      uFieldState: { value: 0 },
      uActiveModeCount: { value: 0 },
      uBackboneModeCount: { value: 0 },
      uDetailModeCount: { value: 0 },
      uAverageAmplitude: { value: 0 },
      uTransientEnergy: { value: 0 },
      uSpectralCentroid: { value: 0 },
      uSpectralFlux: { value: 0 },
      uChromesthesiaMix: { value: 0.65 },
      uBandEnergies: { value: new THREE.Vector4() },
      uDensityGain: { value: 2.1 },
      uOpacityGain: { value: 1.3 },
      uContourSharpness: { value: 4.2 },
      uSlicePosition: { value: 0 },
    },
    visualRoot: {
      scale: {
        x: 1,
        setScalar(value) {
          this.x = value;
        },
      },
    },
    reactivityTuning: {
      reactivity: 1,
      motionAmount: 1,
      structurePersistence: 1,
    },
    bloomTuning: {},
    baseDensityGain: 2.1,
    responseEnvelope: 0,
    accentEnvelope: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    slicePhase: 0,
    sliceVelocity: 0,
    volumeMesh: {
      visible: false,
    },
    idleOverlay: {
      visible: true,
    },
    fieldStateValues: {
      idle: 0,
      active: 1,
      decay: 2,
      test: 3,
    },
    debugSnapshot: null,
  };
}

describe("tickCymatics2dRuntime", () => {
  it("writes slot buffers and slice motion into the runtime", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.6]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.4]),
      backboneColorSlots: new Float32Array([
        1, 0.1, 0.1, 0.9, 0.8, 0.2, 0.1, 0.7,
      ]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5, 0.7, 0.2, 1, 0.45]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      pulseSignal: 0.32,
      beatDetected: true,
      beatPulseId: 3,
      beatStrength: 0.82,
      beatConfidence: 0.76,
      debug: {
        dominantFrequency: 440,
      },
    };

    tickCymatics2dRuntime(runtimeState, featureFrame, 12.5, 1 / 60);

    expect(runtimeState.backboneModeBuffer.value.array[0]).toBe(3);
    expect(runtimeState.detailModeBuffer.value.array[0]).toBe(4);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(4);
    expect(runtimeState.uniforms.uSlicePosition.value).not.toBe(0);
    expect(runtimeState.sliceVelocity).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBeGreaterThan(1);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.debugSnapshot.cymatics2dDebug.modeSlotCount).toBe(4);
    expect(runtimeState.debugSnapshot.cymatics2dDebug.slicePosition).not.toBe(
      0,
    );
  });

  it("shows the idle overlay and clears visibility in idle state", () => {
    const runtimeState = createRuntimeState();
    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "idle",
        averageAmplitude: 0,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0,
        spectralFlux: 0,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.debugSnapshot.volumeVisible).toBe(false);
  });
});
