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
      uBoundaryMode: { value: 1 },
      uAverageAmplitude: { value: 0 },
      uTransientEnergy: { value: 0 },
      uSpectralCentroid: { value: 0 },
      uSpectralFlux: { value: 0 },
      uSpectralMix: { value: 0.65 },
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
      renderAuthority: true,
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
    expect(runtimeState.debugSnapshot.cymatics2dDebug.boundaryMode).toBe(
      "neumann",
    );
    expect(runtimeState.debugSnapshot.cymatics2dDebug.slicePosition).not.toBe(
      0,
    );
  });

  it("keeps field mode uploads identical between static and Spectral color modes", () => {
    const createFrame = () => ({
      fieldState: "active",
      renderAuthority: true,
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
    });
    const staticRuntimeState = createRuntimeState();
    staticRuntimeState.uniforms.uSpectralMix.value = 0;
    const spectralRuntimeState = createRuntimeState();
    spectralRuntimeState.uniforms.uSpectralMix.value = 0.65;

    tickCymatics2dRuntime(
      staticRuntimeState,
      createFrame(),
      1,
      1 / 60,
    );
    tickCymatics2dRuntime(
      spectralRuntimeState,
      createFrame(),
      1,
      1 / 60,
    );

    expect(spectralRuntimeState.uniforms.uActiveModeCount.value).toBe(
      staticRuntimeState.uniforms.uActiveModeCount.value,
    );
    expect(
      Array.from(spectralRuntimeState.backboneModeBuffer.value.array.slice(0, 8)),
    ).toEqual(
      Array.from(staticRuntimeState.backboneModeBuffer.value.array.slice(0, 8)),
    );
    expect(
      Array.from(spectralRuntimeState.detailModeBuffer.value.array.slice(0, 8)),
    ).toEqual(
      Array.from(staticRuntimeState.detailModeBuffer.value.array.slice(0, 8)),
    );
    expect(
      spectralRuntimeState.detailColorBuffer.value.needsUpdate,
    ).toBe(true);
    expect(staticRuntimeState.detailColorBuffer.value.needsUpdate).toBe(false);
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

  it("hard-clamps 2D presentation when render authority is cut", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.82;
    runtimeState.accentEnvelope = 0.74;
    runtimeState.motionSignal = 0.66;
    runtimeState.scaleSignal = 0.58;
    runtimeState.bloomResponseSignal = 0.49;
    runtimeState.slicePhase = 4.2;
    runtimeState.sliceVelocity = 0.37;
    runtimeState.uniforms.uSlicePosition.value = 0.18;
    runtimeState.visualRoot.scale.x = 1.04;
    runtimeState.volumeMesh.visible = true;

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthorityCut: true,
        renderAuthority: false,
        averageAmplitude: 48,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.7,
        spectralCentroid: 0.42,
        spectralFlux: 0.28,
        structureSignal: 0.74,
        energySignal: 0.68,
        changeSignal: 0.61,
        pulseSignal: 0.32,
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uAverageAmplitude.value).toBe(0);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0);
    expect(runtimeState.responseEnvelope).toBe(0);
    expect(runtimeState.accentEnvelope).toBe(0);
    expect(runtimeState.motionSignal).toBe(0);
    expect(runtimeState.scaleSignal).toBe(0);
    expect(runtimeState.bloomResponseSignal).toBe(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.sliceVelocity).toBe(0);
    expect(runtimeState.uniforms.uSlicePosition.value).toBe(0);
    expect(Array.from(runtimeState.backboneModeBuffer.value.array)).toEqual(
      Array.from(new Float32Array(32)),
    );
    expect(Array.from(runtimeState.detailModeBuffer.value.array)).toEqual(
      Array.from(new Float32Array(32)),
    );
  });

  it("suppresses the idle overlay during live input and restores it after stop", () => {
    const runtimeState = createRuntimeState();

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        isLiveInputActive: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0.1,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0.6,
        energySignal: 0.5,
        changeSignal: 0.2,
        pulseSignal: 0.1,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.idleLogoSuppressedForLive).toBe(true);

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "idle",
        isLiveInputActive: true,
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
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(false);
    expect(runtimeState.debugSnapshot.idleLogoSuppressedForLive).toBe(true);

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "idle",
        isLiveInputActive: false,
        sourceMode: "live",
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
      3,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.debugSnapshot.idleOverlayVisible).toBe(true);
    expect(runtimeState.debugSnapshot.idleLogoSuppressedForLive).toBe(false);
  });

  it("keeps sustained material visually stable across adjacent active ticks", () => {
    const runtimeState = createRuntimeState();

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 36,
        backboneSlots: new Float32Array([3, 4, 6, 0.72]),
        detailSlots: new Float32Array([4, 5, 5, 0.24]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.28, 0.22, 0.16, 0.08]),
        transientEnergy: 0.08,
        spectralCentroid: 0.24,
        spectralFlux: 0.06,
        structureSignal: 0.62,
        energySignal: 0.44,
        changeSignal: 0.1,
        pulseSignal: 0.02,
        debug: {},
      },
      1,
      1 / 60,
    );

    const firstEnvelope = runtimeState.responseEnvelope;
    const firstScale = runtimeState.visualRoot.scale.x;

    tickCymatics2dRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 32,
        backboneSlots: new Float32Array([3, 4, 6, 0.66]),
        detailSlots: new Float32Array([4, 5, 5, 0.18]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.24, 0.18, 0.14, 0.06]),
        transientEnergy: 0.03,
        spectralCentroid: 0.22,
        spectralFlux: 0.03,
        structureSignal: 0.56,
        energySignal: 0.34,
        changeSignal: 0.03,
        pulseSignal: 0,
        debug: {},
      },
      1.016,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.responseEnvelope).toBeGreaterThan(firstEnvelope * 0.8);
    expect(runtimeState.visualRoot.scale.x).toBeGreaterThan(1);
    expect(runtimeState.visualRoot.scale.x).toBeLessThanOrEqual(firstScale);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
  });
});
