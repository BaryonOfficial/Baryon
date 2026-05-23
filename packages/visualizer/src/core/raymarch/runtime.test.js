import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { createRaymarchSceneRoot, tickRaymarchRuntime } from "./runtime.js";
import {
  buildRaymarchEffectiveFieldDescriptor,
  createRaymarchEffectiveFieldCache,
  createRaymarchSpectralLightCache,
} from "./fieldCache.js";
import { RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES } from "./material.js";
import { deriveObservationTransferParameters } from "./observationTransfer.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./stepStability.js";

function createRuntimeState({ withFieldCache = false } = {}) {
  const effectiveFieldCache = withFieldCache
    ? createRaymarchEffectiveFieldCache({ resolution: 8 })
    : null;
  const spectralLightCache = withFieldCache
    ? createRaymarchSpectralLightCache({ resolution: 8 })
    : null;
  const materialCache = withFieldCache
    ? {
        neumann: {
          direct: {},
          "effective-cached": {
            off: { rectangular: { steps: 64 } },
            direct: { rectangular: { steps: 64 } },
            cached: { rectangular: { steps: 64 } },
          },
        },
        dirichlet: {
          direct: {},
          "effective-cached": {
            off: { rectangular: { steps: 64 } },
            direct: { rectangular: { steps: 64 } },
            cached: { rectangular: { steps: 64 } },
          },
        },
      }
    : null;
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
    backbonePhaseBuffer: {
      value: {
        array: new Float32Array(8),
        needsUpdate: false,
      },
    },
    detailPhaseBuffer: {
      value: {
        array: new Float32Array(24),
        needsUpdate: false,
      },
    },
    uniforms: {
      uTime: { value: 0 },
      uFieldState: { value: 0 },
      uRadius: { value: 3 },
      uActiveModeCount: { value: 0 },
      uBackboneModeCount: { value: 0 },
      uDetailModeCount: { value: 0 },
      uAverageAmplitude: { value: 0 },
      uThreshold: { value: 0.045 },
      uBoundaryMode: { value: 1 },
      uTransientEnergy: { value: 0 },
      uSpectralCentroid: { value: 0 },
      uSpectralFlux: { value: 0 },
      uSpectralMix: { value: 0.65 },
      uBandEnergies: { value: new THREE.Vector4() },
      uDensityGain: { value: 2.8 },
      uAbsorption: { value: 1.8 },
      uDensityAbsorption: { value: 2.8 * 1.8 },
      uOpacityGain: { value: 1.05 },
      uContourSharpness: { value: 6.6 },
      uRimBloomBias: { value: 0.5 },
      uRimCompression: { value: 0.48 },
      uHolographicIntensity: { value: 0.45 },
      uHolographicShift: { value: 0.35 },
      uHolographicFresnelPower: { value: 3.2 },
      uStructureSignal: { value: 0 },
      uEnergySignal: { value: 0 },
      uChangeSignal: { value: 0 },
      uPulseSignal: { value: 0 },
      uBassSalience: { value: 0 },
      uTimbreSpread: { value: 0 },
      uSpectralNovelty: { value: 0 },
      uBeatPulse: { value: 0 },
      uBeatPhase: { value: 0 },
      uTempoNorm: { value: 0 },
      uRhythmicDensity: { value: 0 },
      uKeyTint: { value: { setHSL: () => {} } },
      uKeyTintStrength: { value: 0 },
      uKeyMode: { value: 0 },
      uTrebleBroadbandEnergy: { value: 0 },
      uModeCoherence: { value: 0 },
      uTotalSlotAmplitude: { value: 0 },
      uModalResponseBackboneEnergy: { value: 0 },
      uModalResponseDetailEnergy: { value: 0 },
      uObservationDensityFadeStart: { value: 0 },
      uObservationDensityFadeEnd: { value: 0 },
      uObservationTransferGain: { value: 0 },
      uObservationDensityFloor: { value: 0 },
      uObservationContourSupportScale: { value: 0 },
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
    bloomTuning: {
      bloomResponseBias: 0.4,
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(64),
      lowStepBloomGuard: deriveLowStepBloomGuard(64),
      effectiveStrength: 0.11,
      effectiveRadius: 0.09,
      effectiveThreshold: 0.44,
    },
    baseDensityGain: 2.8,
    baseThreshold: 0.045,
    baseContourSharpness: 6.6,
    responseEnvelope: 0,
    accentEnvelope: 0,
    beatPulseEnvelope: 0,
    keyHue: 0,
    keyModeSmooth: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    volumeMesh: {
      visible: false,
      material: withFieldCache
        ? materialCache.neumann["effective-cached"].off.rectangular
        : {
            steps: 64,
          },
      userData: withFieldCache
        ? {
            raymarchMaterialCache: materialCache,
            raymarchBoundaryMode: "neumann",
            raymarchFieldEvaluationMode: "effective-cached",
            raymarchSpectralLightEvaluationMode:
              RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
            raymarchCavityGeometry: "rectangular",
          }
        : undefined,
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
    stabilityStats: {
      avgRaySegmentLength: 1.2,
      missRatio: 0.15,
      avgSilhouetteSuppression: 0,
    },
    auditEnabled: true,
    effectiveFieldCache,
    spectralLightCache,
    requestedCavityGeometry: "rectangular",
    effectiveCavityGeometry: "rectangular",
    debugSnapshot: null,
  };
}

async function flushMicrotasks(count = 3) {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
}

function seedRuntimeCacheNodes(runtimeState) {
  if (runtimeState.effectiveFieldCache) {
    runtimeState.effectiveFieldCache.computeNodesByKey["rectangular:neumann"] =
      {
        id: "field",
      };
  }
  if (runtimeState.spectralLightCache) {
    runtimeState.spectralLightCache.computeNodesByKey["rectangular:neumann"] = {
      id: "spectral",
    };
  }
}

function createActiveFeatureFrame(overrides = {}) {
  return {
    fieldState: "active",
    renderAuthority: true,
    averageAmplitude: 48,
    backboneSlots: new Float32Array([3, 4, 6, 0.8]),
    detailSlots: new Float32Array([4, 5, 5, 0.55]),
    backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
    detailColorSlots: new Float32Array([0.2, 0.5, 1, 0.5]),
    backbonePhaseSlots: new Float32Array([0.1, 0.2, 0.8, 0.9]),
    detailPhaseSlots: new Float32Array([0.3, 0.4, 0.8, 0.7]),
    bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
    transientEnergy: 0.7,
    spectralCentroid: 0.42,
    spectralFlux: 0.28,
    structureSignal: 0.74,
    energySignal: 0.68,
    changeSignal: 0.61,
    pulseSignal: 0.32,
    ...overrides,
  };
}

function makeModeSlots(count, amplitudeAt = () => 0.25) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = (index % 5) + 1;
    slots[offset + 1] = ((index + 1) % 7) + 1;
    slots[offset + 2] = ((index + 2) % 9) + 1;
    slots[offset + 3] = amplitudeAt(index);
  }
  return slots;
}

function makeColorSlots(count) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = 0.2 + index * 0.01;
    slots[offset + 1] = 0.4;
    slots[offset + 2] = 0.7;
    slots[offset + 3] = 0.8;
  }
  return slots;
}

function makePhaseSlots(count) {
  const slots = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    slots[offset] = index * 0.05;
    slots[offset + 1] = 0.2 + index * 0.01;
    slots[offset + 2] = 0.9;
    slots[offset + 3] = 0.8;
  }
  return slots;
}

describe("tickRaymarchRuntime", () => {
  it("does not own envelope-derived display radiance limiting", () => {
    const source = readFileSync(
      new URL("./runtime.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("compressDisplayRadiance");
    expect(source).not.toContain("deriveBloomRadianceScale");
    expect(source).not.toContain("DISPLAY_RADIANCE_DEFAULTS");
    expect(source).not.toMatch(
      /display(?:Bloom|Highlight|Radiance).*(?:responseEnvelope|accentEnvelope|bloomResponseSignal)/s,
    );
  });

  it("uploads every descriptor mode and phase entry up to descriptor capacity", () => {
    const runtimeState = createRuntimeState();
    runtimeState.backboneCapacity = 10;
    runtimeState.detailCapacity = 10;
    runtimeState.backbonePhaseCapacity = 10;
    runtimeState.detailPhaseCapacity = 10;
    runtimeState.backboneModeBuffer.value.array = new Float32Array(40);
    runtimeState.detailModeBuffer.value.array = new Float32Array(40);
    runtimeState.backboneColorBuffer.value.array = new Float32Array(40);
    runtimeState.detailColorBuffer.value.array = new Float32Array(40);
    runtimeState.backbonePhaseBuffer.value.array = new Float32Array(40);
    runtimeState.detailPhaseBuffer.value.array = new Float32Array(40);
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(10, (index) => (index === 0 ? 1 : 0.08)),
      detailSlots: makeModeSlots(10, (index) => (index === 0 ? 0.9 : 0.06)),
      backboneColorSlots: makeColorSlots(10),
      detailColorSlots: makeColorSlots(10),
      backbonePhaseSlots: makePhaseSlots(10),
      detailPhaseSlots: makePhaseSlots(10),
      activeBackboneModeCount: 10,
      activeDetailModeCount: 10,
      activeModeCount: 20,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(10);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(10);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(20);
    expect(runtimeState.effectiveFieldModeCount).toBe(20);
    expect(runtimeState.currentModalDescriptor).toMatchObject({
      capacity: {
        maxBackboneModes: 10,
        maxDetailModes: 10,
        maxTotalModes: 20,
      },
      counts: {
        validBackboneModeCount: 10,
        validDetailModeCount: 10,
        validModeCount: 20,
        overflowBackboneModeCount: 0,
        overflowDetailModeCount: 0,
      },
      diagnostics: {
        descriptorOverflow: false,
      },
    });
    expect(
      runtimeState.performanceGovernor.backbone.selectedIndices,
    ).toBeUndefined();
    expect(
      runtimeState.performanceGovernor.detail.selectedIndices,
    ).toBeUndefined();
  });

  it("blocks complete field authority when descriptor capacity overflows", () => {
    const runtimeState = createRuntimeState();
    runtimeState.backboneCapacity = 2;
    runtimeState.detailCapacity = 2;
    runtimeState.backbonePhaseCapacity = 2;
    runtimeState.detailPhaseCapacity = 2;
    runtimeState.backboneModeBuffer.value.array = new Float32Array(8);
    runtimeState.detailModeBuffer.value.array = new Float32Array(8);
    runtimeState.backbonePhaseBuffer.value.array = new Float32Array(8);
    runtimeState.detailPhaseBuffer.value.array = new Float32Array(8);
    const featureFrame = createActiveFeatureFrame({
      backboneSlots: makeModeSlots(3, () => 0.4),
      detailSlots: makeModeSlots(3, () => 0.35),
      backboneColorSlots: makeColorSlots(3),
      detailColorSlots: makeColorSlots(3),
      backbonePhaseSlots: makePhaseSlots(3),
      detailPhaseSlots: makePhaseSlots(3),
      activeBackboneModeCount: 3,
      activeDetailModeCount: 3,
      activeModeCount: 6,
      modalPhaseAuthority: 1,
    });

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(
      runtimeState.currentModalDescriptor.diagnostics.descriptorOverflow,
    ).toBe(true);
    expect(runtimeState.currentModalDescriptor.fieldAuthority).toBe("blocked");
    expect(runtimeState.debugSnapshot.modalDescriptorOverflow).toBe(true);
    expect(runtimeState.debugSnapshot.modalDescriptorFieldAuthority).toBe(
      "blocked",
    );
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(0);
  });

  it("creates a self-lit scene root with weak symmetric fill lights", () => {
    const volumeMesh = new THREE.Mesh();
    const idleOverlay = new THREE.LineSegments();
    const { root, visualRoot, sceneLighting } = createRaymarchSceneRoot({
      volumeMesh,
      idleOverlay,
      radius: 3,
    });

    expect(root.children).toContain(visualRoot);
    expect(root.children.filter((child) => child.isLight)).toHaveLength(2);
    expect(sceneLighting.primary.intensity).toBeCloseTo(0.9);
    expect(sceneLighting.secondary.intensity).toBeCloseTo(0.9);
    expect(sceneLighting.primary.position.x).toBeCloseTo(3 * 1.15);
    expect(sceneLighting.secondary.position.x).toBeCloseTo(-3 * 1.15);
    expect(sceneLighting.primary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.secondary.position.y).toBeCloseTo(3 * 0.85);
    expect(sceneLighting.primary.position.z).toBeCloseTo(3 * 1.8);
    expect(sceneLighting.secondary.position.z).toBeCloseTo(3 * 1.8);
  });

  it("writes backbone/detail slots and modulation metrics into the runtime", () => {
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
      backbonePhaseSlots: new Float32Array([
        0.1, 0.2, 0.7, 0.5, -0.2, 0.1, 0.6, 0.4,
      ]),
      detailPhaseSlots: new Float32Array([
        0.4, 0.32, 0.8, 0.7, -0.6, -0.2, 0.74, 0.5,
      ]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      changeBreakdown: {
        flux: 0.12,
        hit: 0.14,
        slotDelta: 0.1,
        turnover: 0.08,
        timbre: 0.07,
        hint: 0.1,
      },
      pulseSignal: 0.32,
      modeCoherence: 0.58,
      modalPhaseAuthority: 0.42,
      trebleBroadbandEnergy: 0.18,
      trebleTonalEnergy: 0.24,
      beatDetected: true,
      beatPulseId: 3,
      beatStrength: 0.82,
      beatConfidence: 0.76,
      debug: {
        dominantFrequency: 440,
        projectionEnergyBudgetBackbone: 0.74,
        projectionEnergyBudgetDetail: 0.36,
        projectionEnergyUsedBackbone: 0.52,
        projectionEnergyUsedDetail: 0.31,
        projectionCompetitionReduction: 0.18,
        projectionDenseSpectrumPressure: 0.72,
        projectionHighQProtection: 0.09,
        projectionEnergyNormalizationApplied: true,
        projectionRawEnergyBackbone: 0.68,
        projectionRawEnergyDetail: 0.57,
        projectionAllocatedEnergyBackbone: 0.52,
        projectionAllocatedEnergyDetail: 0.31,
        projectionEnergyScaleBackbone: 0.76,
        projectionEnergyScaleDetail: 0.54,
        projectionOverlapPressureBackbone: 0.23,
        projectionOverlapPressureDetail: 0.41,
        modalResponseBackboneEnergy: 0.37,
        modalResponseDetailEnergy: 0.12,
      },
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 12.5, 1 / 60);

    expect(runtimeState.backboneModeBuffer.value.array[0]).toBe(3);
    expect(runtimeState.detailModeBuffer.value.array[0]).toBe(4);
    expect(runtimeState.backboneColorBuffer.value.array[0]).toBe(1);
    expect(runtimeState.detailColorBuffer.value.array[2]).toBe(1);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(2);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(2);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(4);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.7);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0.42);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.28);
    expect(runtimeState.uniforms.uThreshold.value).toBeLessThan(0.045);
    expect(runtimeState.uniforms.uContourSharpness.value).toBeGreaterThan(6.6);
    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uModeCoherence.value).toBeCloseTo(0.58);
    expect(
      runtimeState.uniforms.uModalResponseBackboneEnergy.value,
    ).toBeCloseTo(0.37);
    expect(runtimeState.uniforms.uModalResponseDetailEnergy.value).toBeCloseTo(
      0.12,
    );
    const observationParameters = deriveObservationTransferParameters({
      opacityGain: runtimeState.uniforms.uOpacityGain.value,
      stepCompensation: runtimeState.bloomTuning.stepCompensation,
      contourSharpness: runtimeState.uniforms.uContourSharpness.value,
    });
    expect(
      runtimeState.uniforms.uObservationDensityFadeStart.value,
    ).toBeCloseTo(observationParameters.densityFadeStart);
    expect(runtimeState.uniforms.uObservationDensityFadeEnd.value).toBeCloseTo(
      observationParameters.densityFadeEnd,
    );
    expect(runtimeState.uniforms.uObservationTransferGain.value).toBeCloseTo(
      observationParameters.transferGain,
    );
    expect(runtimeState.uniforms.uObservationDensityFloor.value).toBeCloseTo(
      observationParameters.densityFloor,
    );
    expect(
      runtimeState.uniforms.uObservationContourSupportScale.value,
    ).toBeCloseTo(observationParameters.contourSupportScale);
    expect(runtimeState.uniforms.uTrebleBroadbandEnergy.value).toBeCloseTo(
      0.18,
    );
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeCloseTo(
      0.8 + 0.6 + (0.55 + 0.4) * 0.45,
    );
    const [sub, lowMid, highMid, air] =
      runtimeState.uniforms.uBandEnergies.value.toArray();
    expect(sub).toBeCloseTo(0.4);
    expect(lowMid).toBeCloseTo(0.3);
    expect(highMid).toBeCloseTo(0.2);
    expect(air).toBeCloseTo(0.1);
    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.debugSnapshot.raymarchDebug.backboneModeCount).toBe(2);
    expect(runtimeState.debugSnapshot.raymarchDebug.detailModeCount).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedBackboneModeCount,
    ).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedDetailModeCount,
    ).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedBackboneColorWeightMax,
    ).toBeCloseTo(0.9);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedDetailColorWeightMax,
    ).toBeCloseTo(0.5);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedBackboneAmplitudeTotal,
    ).toBeCloseTo(1.4);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedDetailAmplitudeTotal,
    ).toBeCloseTo(0.95);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorOverflow,
    ).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalDescriptorFieldAuthority,
    ).toBe("complete");
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalDescriptorValidBackboneModeCount,
    ).toBe(2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .modalDescriptorValidDetailModeCount,
    ).toBe(2);
    expect(runtimeState.debugSnapshot.raymarchDebug.boundaryMode).toBe(
      "neumann",
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.requestedCavityGeometry,
    ).toBe("rectangular");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveCavityGeometry,
    ).toBe("rectangular");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.materialCavityGeometry,
    ).toBe("rectangular");
    expect(runtimeState.debugSnapshot.raymarchDebug.transientEnergy).toBe(0.7);
    expect(runtimeState.debugSnapshot.raymarchDebug.structureSignal).toBe(0.74);
    expect(runtimeState.debugSnapshot.raymarchDebug.energySignal).toBe(0.68);
    expect(runtimeState.debugSnapshot.raymarchDebug.changeSignal).toBe(0.61);
    expect(runtimeState.debugSnapshot.raymarchDebug.changeBreakdown).toEqual({
      flux: 0.12,
      hit: 0.14,
      slotDelta: 0.1,
      turnover: 0.08,
      timbre: 0.07,
      hint: 0.1,
    });
    expect(runtimeState.debugSnapshot.raymarchDebug.pulseSignal).toBe(0.32);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeCoherence).toBe(0.58);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalResponseBackboneEnergy,
    ).toBe(0.37);
    expect(runtimeState.debugSnapshot.raymarchDebug.observationEnergy).toBe(1);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyBudgetBackbone,
    ).toBe(0.74);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyBudgetDetail,
    ).toBe(0.36);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyUsedBackbone,
    ).toBe(0.52);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyUsedDetail,
    ).toBe(0.31);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionCompetitionReduction,
    ).toBe(0.18);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionDenseSpectrumPressure,
    ).toBe(0.72);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionHighQProtection,
    ).toBe(0.09);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionConservationApplied,
    ).toBeUndefined();
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionEnergyNormalizationApplied,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergyBackbone,
    ).toBe(0.68);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionRawEnergyDetail,
    ).toBe(0.57);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionAllocatedEnergyBackbone,
    ).toBe(0.52);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionAllocatedEnergyDetail,
    ).toBe(0.31);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyScaleBackbone,
    ).toBe(0.76);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionEnergyScaleDetail,
    ).toBe(0.54);
    expect(
      runtimeState.debugSnapshot.raymarchDebug
        .projectionOverlapPressureBackbone,
    ).toBe(0.23);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionOverlapPressureDetail,
    ).toBe(0.41);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observedContourSupportMax,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFadeStart,
    ).toBeCloseTo(observationParameters.densityFadeStart);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFadeEnd,
    ).toBeCloseTo(observationParameters.densityFadeEnd);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationTransferGain,
    ).toBeCloseTo(observationParameters.transferGain);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationDensityFloor,
    ).toBeCloseTo(observationParameters.densityFloor);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationContourSupportScale,
    ).toBeCloseTo(observationParameters.contourSupportScale);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationExposureScale,
    ).toBeCloseTo(observationParameters.exposureScale);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationFieldNoiseFloor,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.raymarchDebug.trebleBroadbandEnergy).toBe(
      0.18,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.trebleTonalEnergy).toBe(
      0.24,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.stepReference).toBe(96);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.stepCompensation,
    ).toBeCloseTo(deriveStepCompensation(64));
    expect(runtimeState.debugSnapshot.raymarchDebug.lowStepBloomGuard).toBe(0);
    expect(runtimeState.debugSnapshot.raymarchDebug.rimBloomBias).toBe(0.5);
    expect(runtimeState.debugSnapshot.raymarchDebug.rimCompression).toBe(0.48);
    expect(runtimeState.debugSnapshot.raymarchDebug.holographicIntensity).toBe(
      0.45,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.holographicShift).toBe(
      0.35,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.holographicFresnelPower,
    ).toBe(3.2);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.avgSilhouetteSuppression,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.raymarchDebug.bloomResponseBias).toBe(
      0.4,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBeGreaterThan(0.11);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    ).toBeLessThan(0.09);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveBloomThreshold,
    ).toBeGreaterThan(0.44);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveThreshold,
    ).toBeLessThan(0.045);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveContourSharpness,
    ).toBeGreaterThan(6.6);
    expect(runtimeState.debugSnapshot.raymarchDebug.sceneLightAsymmetry).toBe(
      0,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.bloomRisk).toBeGreaterThan(
      0,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.spectralMix).toBe(0.65);
    expect(runtimeState.debugSnapshot.raymarchDebug.earlyExitEnabled).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.earlyExitThreshold).toBe(
      0.005,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.earlyExitRatio,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.holographicReferenceStrength,
    ).toBeGreaterThan(0);
  });

  it("rebuilds the effective field on phase changes without rebuilding Spectral Light", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.8, 1, 3, 7, 0.02]),
      detailSlots: new Float32Array([4, 5, 5, 0.55, 2, 2, 6, 0.01]),
      backbonePhaseSlots: new Float32Array([
        0.25, 0.14, 0.7, 0.5, 1.1, 0.9, 0.2, 0.02,
      ]),
      detailPhaseSlots: new Float32Array([
        -0.4, -0.21, 0.8, 0.64, 0.9, 0.6, 0.1, 0.01,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
      modalPhaseAuthority: 0.5,
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, featureFrame, 3.08, 1 / 60, renderer);
    await flushMicrotasks();
    const effectiveFieldRebuildCount =
      runtimeState.effectiveFieldCache.rebuildCount;
    const effectiveFieldDescriptor =
      runtimeState.effectiveFieldCache.activeDescriptor;
    const spectralRebuildCount = runtimeState.spectralLightCache.rebuildCount;
    const spectralDescriptor = runtimeState.spectralLightCache.activeDescriptor;

    featureFrame.backbonePhaseSlots = new Float32Array([
      1.2, -0.42, 0.8, 0.6, 0.1, 0.3, 0.2, 0.02,
    ]);
    featureFrame.detailPhaseSlots = new Float32Array([
      0.7, 0.25, 0.9, 0.7, -0.9, 0.1, 0.1, 0.01,
    ]);
    tickRaymarchRuntime(runtimeState, featureFrame, 3.1, 1 / 60, renderer);
    await flushMicrotasks();
    tickRaymarchRuntime(runtimeState, featureFrame, 3.12, 1 / 60, renderer);

    expect(runtimeState.effectiveFieldCache).toBeTruthy();
    expect(runtimeState.effectiveFieldCache.ready).toBe(true);
    expect(runtimeState.effectiveFieldCache.rebuildCount).toBe(
      effectiveFieldRebuildCount + 1,
    );
    expect(runtimeState.effectiveFieldCache.activeDescriptor).not.toEqual(
      effectiveFieldDescriptor,
    );
    expect(runtimeState.effectiveFieldCache.activeDescriptor).toEqual(
      runtimeState.currentEffectiveFieldDescriptor,
    );
    expect(runtimeState.spectralLightCache.activeDescriptor).toEqual(
      spectralDescriptor,
    );
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(
      spectralRebuildCount,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.effectiveFieldReady).toBe(
      true,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldRebuildPending,
    ).toBe(false);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldResolution,
    ).toBe(8);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldModeCount,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldSemantic,
    ).toBe("canonical-effective-field");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldAuthority,
    ).toBe(0.5);
    expect(runtimeState.debugSnapshot.raymarchDebug.effectiveFieldActive).toBe(
      true,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "phaseCoherentFieldSemantic",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "phaseOverlaySemantic",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "signedPhaseOverlaySemantic",
    );
  });

  it("fails the effective field closed when compute is unavailable", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.55]),
      backbonePhaseSlots: new Float32Array([0.25, 0.14, 0.7, 0.5]),
      detailPhaseSlots: new Float32Array([-0.4, -0.21, 0.8, 0.64]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
      modalPhaseAuthority: 0.5,
      debug: {},
    };
    runtimeState.backboneModeBuffer.value.array.set(featureFrame.backboneSlots);
    runtimeState.detailModeBuffer.value.array.set(featureFrame.detailSlots);
    runtimeState.uniforms.uBackboneModeCount.value = 1;
    runtimeState.uniforms.uDetailModeCount.value = 1;
    runtimeState.effectiveFieldCache.ready = true;
    runtimeState.effectiveFieldCache.activeDescriptor =
      buildRaymarchEffectiveFieldDescriptor({
        backboneSlots: runtimeState.backboneModeBuffer.value.array,
        detailSlots: runtimeState.detailModeBuffer.value.array,
        backbonePhaseSlots: runtimeState.backbonePhaseBuffer.value.array,
        detailPhaseSlots: runtimeState.detailPhaseBuffer.value.array,
        backboneCount: 1,
        detailCount: 1,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 0.5,
      });

    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, null);
    await flushMicrotasks();

    expect(runtimeState.effectiveFieldCache).toBeTruthy();
    expect(runtimeState.effectiveFieldCache.backend).toBe("unavailable");
    expect(runtimeState.effectiveFieldCache.ready).toBe(false);
    expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
      "unavailable",
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.effectiveFieldReady).toBe(
      false,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldFailedClosed,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.effectiveFieldLastError,
    ).toBe("Renderer computeAsync unavailable");
  });

  it("reports requested spherical geometry while keeping the effective backend rectangular", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    runtimeState.requestedCavityGeometry = "spherical";

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.55]),
        backboneColorSlots: new Float32Array(16),
        detailColorSlots: new Float32Array(16),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.7,
        spectralCentroid: 0.42,
        spectralFlux: 0.28,
        structureSignal: 0.74,
        energySignal: 0.68,
        changeSignal: 0.61,
        pulseSignal: 0.32,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.userData.raymarchCavityGeometry).toBe(
      "rectangular",
    );
    expect(runtimeState.debugSnapshot.requestedCavityGeometry).toBe(
      "spherical",
    );
    expect(runtimeState.debugSnapshot.effectiveCavityGeometry).toBe(
      "rectangular",
    );
  });

  it("hides the volume and shows the idle overlay in idle state", () => {
    const runtimeState = createRuntimeState();
    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    tickRaymarchRuntime(
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
        debug: { modalResponseBackboneEnergy: 0.5 },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uModalResponseBackboneEnergy.value).toBe(0);
    expect(runtimeState.uniforms.uModalResponseDetailEnergy.value).toBe(0);
    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.performanceGovernor).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug.fieldState).toBe("idle");
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationHardSilence,
    ).toBe(true);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBe(0);
    expect(runtimeState.debugSnapshot.modeSlotCount).toBe(0);
  });

  it("hides retained modal diagnostics on render-authority cut", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.6;
    runtimeState.backboneModeBuffer.value.array[3] = 0.42;
    runtimeState.uniforms.uBackboneModeCount.value = 1;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthorityCut: true,
        renderAuthority: false,
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
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
        debug: {
          modalResponseBackboneEnergy: 0.18,
          modalResponseDetailEnergy: 0,
        },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.debugSnapshot.raymarchDebug.renderAuthority).toBe(
      false,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observationHardSilence,
    ).toBe(true);
    expect(runtimeState.debugSnapshot.raymarchDebug.observationEnergy).toBe(0);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(0);
    expect(runtimeState.backboneModeBuffer.value.array[3]).toBe(0);
    expect(runtimeState.responseEnvelope).toBe(0);
  });

  it("hard-clamps presentation response on render-authority cut", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.5;
    runtimeState.accentEnvelope = 0.4;
    runtimeState.motionSignal = 0.3;
    runtimeState.scaleSignal = 0.2;
    runtimeState.bloomResponseSignal = 0.6;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthorityCut: true,
        renderAuthority: false,
        isLiveInputActive: true,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
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
        modalResponseBackboneEnergy: 0.48,
        modalResponseDetailEnergy: 0,
        debug: {
          modalResponseBackboneEnergy: 0.48,
          modalResponseDetailEnergy: 0,
        },
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.responseEnvelope).toBe(0);
    expect(runtimeState.accentEnvelope).toBe(0);
    expect(runtimeState.motionSignal).toBe(0);
    expect(runtimeState.scaleSignal).toBe(0);
    expect(runtimeState.bloomResponseSignal).toBe(0);
  });

  it("uploads fresh buffers after a render-authority cut", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "decay",
        renderAuthorityCut: true,
        renderAuthority: false,
        averageAmplitude: 0,
        backboneSlots: new Float32Array([3, 4, 6, 0.18]),
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
    expect(runtimeState.backboneModeBuffer.value.array[3]).toBe(0);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([1, 2, 3, 0.64]),
        detailSlots: new Float32Array([2, 3, 4, 0.32]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
        transientEnergy: 0.1,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0.6,
        energySignal: 0.5,
        changeSignal: 0.2,
        pulseSignal: 0.1,
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(1);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(1);
    expect(runtimeState.backboneModeBuffer.value.array[0]).toBe(1);
    expect(runtimeState.backboneModeBuffer.value.array[3]).toBeCloseTo(0.64);
    expect(runtimeState.detailModeBuffer.value.array[3]).toBeCloseTo(0.32);
  });

  it("suppresses the idle overlay during live input and restores it after stop", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
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

    tickRaymarchRuntime(
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

    tickRaymarchRuntime(
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

  it("switches to cached field evaluation after a compute-backed rebuild settles", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.active).toBe(true);
      expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
      expect(runtimeState.effectiveFieldCache.ready).toBe(false);
      expect(runtimeState.effectiveFieldCache.rebuildCount).toBe(0);
      expect(renderer.computeAsync).toHaveBeenCalledTimes(0);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.effectiveFieldReady).toBe(false);
      expect(runtimeState.debugSnapshot.effectiveFieldRebuildPending).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(false);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        true,
      );

      await flushMicrotasks();
      expect(renderer.computeAsync).toHaveBeenCalledTimes(2);

      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(false);
      expect(runtimeState.effectiveFieldCache.ready).toBe(true);
      expect(runtimeState.effectiveFieldCache.rebuildCount).toBe(1);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.rebuildCount).toBe(1);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.effectiveFieldActive).toBe(true);
      expect(runtimeState.debugSnapshot.effectiveFieldBackend).toBe("compute");
      expect(runtimeState.debugSnapshot.effectiveFieldReady).toBe(true);
      expect(runtimeState.debugSnapshot.effectiveFieldRebuildPending).toBe(
        false,
      );
      expect(runtimeState.debugSnapshot.effectiveFieldRebuildCount).toBe(1);
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        false,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildCount).toBe(1);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("ignores stale field and Spectral Light completions after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    const completions = [];
    const renderer = {
      computeAsync: async (node) =>
        new Promise((resolve) => {
          completions.push({ id: node?.id, resolve });
        }),
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(completions.map(({ id }) => id).sort()).toEqual([
      "field",
      "spectral",
    ]);
    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
        renderAuthorityCut: true,
      }),
      2,
      1 / 60,
      renderer,
    );

    completions.forEach(({ resolve }) => resolve());
    await flushMicrotasks(5);

    expect(runtimeState.effectiveFieldCache.ready).toBe(false);
    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(false);
    expect(runtimeState.effectiveFieldCache.activeDescriptor).toBeNull();
    expect(runtimeState.effectiveFieldCache.pendingDescriptor).toBeNull();
    expect(runtimeState.effectiveFieldCache.rebuildCount).toBe(0);
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.pendingDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.rebuildCount).toBe(0);
  });

  it("ignores stale field and Spectral Light failures after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    const failures = [];
    const renderer = {
      computeAsync: async (node) =>
        new Promise((resolve, reject) => {
          failures.push({ id: node?.id, reject, resolve });
        }),
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(failures.map(({ id }) => id).sort()).toEqual(["field", "spectral"]);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
        renderAuthorityCut: true,
      }),
      2,
      1 / 60,
      renderer,
    );

    failures.forEach(({ reject }) => reject(new Error("late stale rebuild")));
    await flushMicrotasks(5);

    expect(runtimeState.effectiveFieldCache.backend).toBe("compute");
    expect(runtimeState.effectiveFieldCache.ready).toBe(false);
    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(false);
    expect(runtimeState.effectiveFieldCache.activeDescriptor).toBeNull();
    expect(runtimeState.effectiveFieldCache.lastError).toBeNull();
    expect(runtimeState.spectralLightCache.backend).toBe("compute");
    expect(runtimeState.spectralLightCache.ready).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.activeDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.lastError).toBeNull();
  });

  it("ignores stale effective field completions after render-authority reset", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.effectiveFieldCache.computeNodesByKey["rectangular:neumann"] =
      {
        id: "effective",
      };
    let resolveEffectiveField;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "effective") {
          return new Promise((resolve) => {
            resolveEffectiveField = resolve;
          });
        }
        return undefined;
      },
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({ modalPhaseAuthority: 0.5 }),
      3,
      1 / 60,
      renderer,
    );
    await flushMicrotasks(2);

    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
    expect(resolveEffectiveField).toBeTypeOf("function");

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
        renderAuthorityCut: true,
        modalPhaseAuthority: 0,
      }),
      4,
      1 / 60,
      renderer,
    );

    resolveEffectiveField();
    await flushMicrotasks(5);

    expect(runtimeState.effectiveFieldCache.ready).toBe(false);
    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(false);
    expect(runtimeState.effectiveFieldCache.activeDescriptor).toBeNull();
    expect(runtimeState.effectiveFieldCache.rebuildCount).toBe(0);
  });

  it("keeps effective-cached evaluation active while the current modal descriptor rebuilds", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const cachedBackboneSlots = new Float32Array([1, 1, 1, 0.8]);
    const cachedDetailSlots = new Float32Array(32);
    const currentFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 3.2,
      backboneSlots: new Float32Array([2, 2, 2, 0.12, 2, 3, 3, 0.08]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.42, 0.18, 0.02, 0]),
      transientEnergy: 0.01,
      spectralCentroid: 0.05,
      spectralFlux: 0.01,
      structureSignal: 0.18,
      energySignal: 0.08,
      changeSignal: 0.02,
      pulseSignal: 0,
      modeCoherence: 0.52,
      debug: { modalResponseBackboneEnergy: 0, modalResponseDetailEnergy: 0 },
    };

    try {
      runtimeState.backboneModeBuffer.value.array.set(cachedBackboneSlots);
      runtimeState.detailModeBuffer.value.array.set(cachedDetailSlots);
      runtimeState.uniforms.uBackboneModeCount.value = 1;
      runtimeState.uniforms.uDetailModeCount.value = 0;
      runtimeState.effectiveFieldCache.ready = true;
      runtimeState.effectiveFieldCache.activeDescriptor =
        buildRaymarchEffectiveFieldDescriptor({
          backboneSlots: runtimeState.backboneModeBuffer.value.array,
          detailSlots: runtimeState.detailModeBuffer.value.array,
          backboneCount: 1,
          detailCount: 0,
          boundaryMode: "neumann",
          cavityGeometry: "rectangular",
          radius: runtimeState.uniforms.uRadius.value,
        });

      tickRaymarchRuntime(runtimeState, currentFrame, 1, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.ready).toBe(true);
      expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.effectiveFieldReady).toBe(true);
      expect(runtimeState.debugSnapshot.effectiveFieldRebuildPending).toBe(
        true,
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps cached Spectral Light evaluation while color rebuild is still pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    let spectralLightResolve;
    const warmRenderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const pendingRenderer = {
      computeAsync: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            spectralLightResolve = resolve;
          }),
      ),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };
    const colorChangedFrame = {
      ...denseFrame,
      backboneColorSlots: new Float32Array([
        0.9, 0.2, 0.1, 0.95, 0.8, 0.3, 0.1, 0.8,
      ]),
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, warmRenderer);
      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, warmRenderer);

      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);

      tickRaymarchRuntime(
        runtimeState,
        colorChangedFrame,
        3,
        1 / 60,
        pendingRenderer,
      );

      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);

      await Promise.resolve();
      spectralLightResolve();
      await flushMicrotasks();
      tickRaymarchRuntime(
        runtimeState,
        colorChangedFrame,
        4,
        1 / 60,
        pendingRenderer,
      );

      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("uses effective-cached evaluation without a field override diagnostic", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.active).toBe(true);
      expect(runtimeState.effectiveFieldCache.mode).toBe("effective-cached");
      expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);

      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "effective-cached",
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps effective-cached evaluation active while a refreshed effective field rebuild is pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 180,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 4, 6, 7, 0.65,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.8, 2, 3, 3, 0.75, 3, 3, 4, 0.7, 3, 4, 4, 0.65, 4, 4, 5, 0.6,
        4, 5, 5, 0.55, 5, 5, 6, 0.5, 5, 6, 6, 0.45,
      ]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.5, 0.45, 0.4, 0.35]),
      transientEnergy: 0.72,
      spectralCentroid: 0.56,
      spectralFlux: 0.41,
      structureSignal: 0.86,
      energySignal: 0.82,
      changeSignal: 0.64,
      pulseSignal: 0.34,
      timbreSpread: 0.31,
      spectralNovelty: 0.24,
    };
    const changedFrame = {
      ...denseFrame,
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.95, 2, 3, 4, 0.9, 2, 4, 5, 0.85, 3, 4, 5, 0.8,
        3, 5, 6, 0.75, 4, 5, 6, 0.7, 5, 6, 7, 0.92,
      ]),
    };

    try {
      tickRaymarchRuntime(runtimeState, denseFrame, 1, 1 / 60, renderer);
      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);

      tickRaymarchRuntime(runtimeState, changedFrame, 3, 1 / 60, renderer);

      expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
      expect(runtimeState.effectiveFieldCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "effective-cached",
      );
      expect(runtimeState.debugSnapshot.effectiveFieldReady).toBe(true);
      expect(runtimeState.debugSnapshot.effectiveFieldRebuildPending).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
      );
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        true,
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("skips color buffer uploads when Spectral Light mixing is disabled", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.backboneColorBuffer.value.array.set([9, 9, 9, 9]);
    runtimeState.detailColorBuffer.value.array.set([7, 7, 7, 7]);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
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
      1,
      1 / 60,
    );

    expect(
      Array.from(runtimeState.backboneColorBuffer.value.array.slice(0, 4)),
    ).toEqual([0, 0, 0, 0]);
    expect(
      Array.from(runtimeState.detailColorBuffer.value.array.slice(0, 4)),
    ).toEqual([0, 0, 0, 0]);
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailColorBuffer.value.needsUpdate).toBe(false);
  });

  it("skips repeated modal, color, and phase uploads without freezing uniforms", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(runtimeState, createActiveFeatureFrame(), 1, 1 / 60);

    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    runtimeState.backboneColorBuffer.value.needsUpdate = false;
    runtimeState.detailColorBuffer.value.needsUpdate = false;
    runtimeState.backbonePhaseBuffer.value.needsUpdate = false;
    runtimeState.detailPhaseBuffer.value.needsUpdate = false;

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        averageAmplitude: 96,
        transientEnergy: 0.91,
        spectralFlux: 0.52,
      }),
      2,
      1 / 60,
    );

    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.backbonePhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailPhaseBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.uniforms.uTime.value).toBe(2);
    expect(runtimeState.uniforms.uAverageAmplitude.value).toBe(96);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.91);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.52);
  });

  it("uploads again when a reused source slot array changes values", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = createActiveFeatureFrame();
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);
    const firstDescriptor = runtimeState.currentEffectiveFieldDescriptor;

    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    runtimeState.backboneColorBuffer.value.needsUpdate = false;
    runtimeState.detailColorBuffer.value.needsUpdate = false;
    featureFrame.backboneSlots[0] = 7;

    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);

    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(true);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.currentEffectiveFieldDescriptor).not.toBe(
      firstDescriptor,
    );
  });

  it("clears upload signatures on render-authority cuts", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = createActiveFeatureFrame();
    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({
        fieldState: "idle",
        renderAuthority: false,
        renderAuthorityCut: true,
      }),
      2,
      1 / 60,
    );

    runtimeState.backboneModeBuffer.value.needsUpdate = false;
    runtimeState.detailModeBuffer.value.needsUpdate = false;
    tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60);

    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(true);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(true);
  });

  it("rebuilds raymarch caches only when descriptor inputs change", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    let fieldComputeCalls = 0;
    let spectralComputeCalls = 0;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "field") {
          fieldComputeCalls += 1;
        } else if (node?.id === "spectral") {
          spectralComputeCalls += 1;
        }
      },
    };

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame(),
      1,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);

    tickRaymarchRuntime(
      runtimeState,
      createActiveFeatureFrame({ averageAmplitude: 96 }),
      2,
      1 / 60,
      renderer,
    );
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);

    const topologyFrame = createActiveFeatureFrame();
    topologyFrame.backboneSlots[0] = 8;
    tickRaymarchRuntime(runtimeState, topologyFrame, 3, 1 / 60, renderer);
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(2);
    expect(spectralComputeCalls).toBe(2);

    const colorFrame = createActiveFeatureFrame();
    colorFrame.backboneSlots[0] = 8;
    colorFrame.backboneColorSlots[0] = 0.4;
    tickRaymarchRuntime(runtimeState, colorFrame, 4, 1 / 60, renderer);
    await flushMicrotasks();
    expect(fieldComputeCalls).toBe(2);
    expect(spectralComputeCalls).toBe(3);
  });

  it("keeps field mode uploads identical between static and Spectral color modes", () => {
    const createFrame = () => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 1, 1, 0.3]),
      detailSlots: new Float32Array([
        1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
      ]),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.2]),
      detailColorSlots: new Float32Array([
        0.8, 0.1, 0.1, 0.2, 0.7, 0.2, 0.1, 0.2, 0.6, 0.2, 0.1, 0.2, 0, 1, 0, 1,
      ]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.45,
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

    tickRaymarchRuntime(staticRuntimeState, createFrame(), 1, 1 / 60);
    tickRaymarchRuntime(spectralRuntimeState, createFrame(), 1, 1 / 60);

    expect(spectralRuntimeState.uniforms.uDetailModeCount.value).toBe(
      staticRuntimeState.uniforms.uDetailModeCount.value,
    );
    expect(
      Array.from(
        spectralRuntimeState.detailModeBuffer.value.array.slice(0, 12),
      ),
    ).toEqual(
      Array.from(staticRuntimeState.detailModeBuffer.value.array.slice(0, 12)),
    );
    expect(
      spectralRuntimeState.performanceGovernor.detail.uploadedActiveCount,
    ).toBe(staticRuntimeState.performanceGovernor.detail.uploadedActiveCount);
    expect(spectralRuntimeState.detailColorBuffer.value.needsUpdate).toBe(true);
  });

  it("reuses a prepared performance governor for the matching runtime tick", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 2, 3, 0.8, 8, 9, 10, 0.9]),
      detailSlots: new Float32Array([4, 5, 6, 0.5]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.2,
      spectralCentroid: 0.3,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.2,
      pulseSignal: 0.1,
    };
    const preparedGovernor = {
      complexityScore: 0.25,
      excitation: 0.2,
      originalModeCount: 3,
      uploadedModeCount: 3,
      countLoad: 0.1,
      weightedPermutationLoad: 0.1,
      proactiveStepBudget: 64,
      proactiveRenderScale: 1,
      bloomStrengthScale: 1,
      bloomThresholdOffset: 0,
      bloomAllowed: true,
      backbone: {
        capacity: 8,
        originalActiveCount: 2,
        uploadedActiveCount: 2,
        totalAmplitude: 1.7,
        uploadedAmplitude: 1.7,
        weightedPermutationLoad: 0,
        averagePermutationCost: 0,
      },
      detail: {
        capacity: 8,
        originalActiveCount: 1,
        uploadedActiveCount: 1,
        totalAmplitude: 0.5,
        uploadedAmplitude: 0.5,
        weightedPermutationLoad: 0,
        averagePermutationCost: 0,
      },
    };
    runtimeState.pendingRaymarchPerformanceGovernor = {
      featureFrame,
      backboneCapacity: 8,
      detailCapacity: 8,
      cavityGeometry: "rectangular",
      requestedStepBudget: 64,
      requestedRenderScale: 1,
      governor: preparedGovernor,
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 1, 1 / 60);

    expect(runtimeState.performanceGovernor).toBe(preparedGovernor);
    expect(runtimeState.pendingRaymarchPerformanceGovernor).toBeNull();
    expect(
      Array.from(runtimeState.backboneModeBuffer.value.array.slice(0, 4)),
    ).toEqual([1, 2, 3, expect.closeTo(0.8, 5)]);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(2);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(1);
  });

  it("keeps static color off the Spectral Light cache path", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    runtimeState.backboneColorBuffer.value.array.set([9, 9, 9, 9]);
    runtimeState.detailColorBuffer.value.array.set([7, 7, 7, 7]);
    const renderer = {
      computeAsync: async () => undefined,
    };

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
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
      1,
      1 / 60,
      renderer,
    );

    expect(runtimeState.spectralLightBuffersUploaded).toBe(false);
    expect(runtimeState.currentSpectralLightDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.active).toBe(false);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    );
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(false);
    expect(runtimeState.backboneColorBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailColorBuffer.value.needsUpdate).toBe(false);
  });

  it("cancels queued Spectral Light rebuilds when color turns static", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0.65;
    let resolveSpectral;
    let fieldComputeCalls = 0;
    let spectralComputeCalls = 0;
    const renderer = {
      computeAsync: async (node) => {
        if (node?.id === "field") {
          fieldComputeCalls += 1;
          return undefined;
        }

        spectralComputeCalls += 1;
        return new Promise((resolve) => {
          resolveSpectral = resolve;
        });
      },
    };
    const makeFrame = (colorWeight) => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 48,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.55]),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, colorWeight]),
      detailColorSlots: new Float32Array([0.2, 0.5, 1, colorWeight]),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.7,
      spectralCentroid: 0.42,
      spectralFlux: 0.28,
      structureSignal: 0.74,
      energySignal: 0.68,
      changeSignal: 0.61,
      pulseSignal: 0.32,
    });

    tickRaymarchRuntime(runtimeState, makeFrame(0.5), 1, 1 / 60, renderer);
    await flushMicrotasks(1);
    expect(fieldComputeCalls).toBe(1);
    expect(spectralComputeCalls).toBe(1);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);

    tickRaymarchRuntime(runtimeState, makeFrame(0.7), 2, 1 / 60, renderer);
    expect(runtimeState.spectralLightCache.queuedDescriptor).toEqual(
      runtimeState.currentSpectralLightDescriptor,
    );
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(true);

    runtimeState.uniforms.uSpectralMix.value = 0;
    tickRaymarchRuntime(runtimeState, makeFrame(0.9), 3, 1 / 60, renderer);
    expect(runtimeState.currentSpectralLightDescriptor).toBeNull();
    expect(runtimeState.spectralLightCache.active).toBe(false);
    expect(runtimeState.spectralLightCache.queuedDescriptor).toBeNull();
    expect(
      runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending,
    ).toBe(false);

    resolveSpectral();
    await flushMicrotasks(5);

    expect(spectralComputeCalls).toBe(1);
    expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
    expect(runtimeState.spectralLightCache.queuedDescriptor).toBeNull();
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
  });

  it("fails closed to unavailable field mode when compute is unavailable", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});

    try {
      tickRaymarchRuntime(
        runtimeState,
        {
          fieldState: "active",
          renderAuthority: true,
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
        1,
        1 / 60,
        null,
      );

      expect(runtimeState.effectiveFieldCache.backend).toBe("unavailable");
      expect(runtimeState.spectralLightCache.backend).toBe("unavailable");
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "unavailable",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.effectiveFieldFailedClosed).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheFailedClosed).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.effectiveFieldLastError).toBe(
        "Renderer computeAsync unavailable",
      );
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
        "unavailable",
      );
      expect(runtimeState.debugSnapshot.spectralLightEvaluationMode).toBe(
        RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached,
      );
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("coalesces runtime descriptor changes while a rebuild is pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    let resolveFirst;
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      },
    };
    const makeFrame = (amplitude) => ({
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, amplitude]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.4, 0.3, 0.2, 0.1]),
      transientEnergy: 0.1,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0.4,
      energySignal: 0.3,
      changeSignal: 0.08,
      pulseSignal: 0.05,
    });

    tickRaymarchRuntime(runtimeState, makeFrame(0.5), 1, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(0.55), 2, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(0.6), 3, 1 / 60, renderer);
    tickRaymarchRuntime(runtimeState, makeFrame(0.65), 4, 1 / 60, renderer);

    const newestDescriptor = runtimeState.currentEffectiveFieldDescriptor;
    expect(runtimeState.effectiveFieldCache.queuedDescriptor).toEqual(
      newestDescriptor,
    );
    expect(
      runtimeState.debugSnapshot.effectiveFieldQueuedDescriptorPending,
    ).toBe(true);
    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtimeState.effectiveFieldCache.pendingDescriptor).toEqual(
      newestDescriptor,
    );
    expect(runtimeState.effectiveFieldCache.queuedDescriptor).toBeNull();
    expect(runtimeState.effectiveFieldCache.rebuildPending).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("keeps low-amplitude bass rendering on the cached product path", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    seedRuntimeCacheNodes(runtimeState);
    runtimeState.uniforms.uSpectralMix.value = 0;
    const renderer = {
      computeAsync: async () => undefined,
    };

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 6,
        backboneSlots: new Float32Array([1, 1, 2, 0.08]),
        detailSlots: new Float32Array([2, 1, 3, 0.04]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.38, 0.08, 0.01, 0]),
        transientEnergy: 0.02,
        spectralCentroid: 0.08,
        spectralFlux: 0.01,
        structureSignal: 0.18,
        energySignal: 0.08,
        changeSignal: 0.02,
        pulseSignal: 0,
        bassSalience: 0.38,
        modeCoherence: 0.44,
        debug: {
          modalResponseBackboneEnergy: 0.05,
          modalResponseDetailEnergy: 0,
        },
      },
      1,
      1 / 60,
      renderer,
    );

    expect(runtimeState.uniforms.uActiveModeCount.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uModalResponseBackboneEnergy.value).toBe(0.05);
    expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
      "effective-cached",
    );
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe(
      "effective-cached",
    );
    await flushMicrotasks();
    expect(runtimeState.effectiveFieldCache.activeDescriptor).toEqual(
      runtimeState.currentEffectiveFieldDescriptor,
    );
  });

  it("keeps the volume active when only detail slots are populated", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 22,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array([4, 5, 5, 0.45, 2, 2, 6, 0.3]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array([
          0.2, 0.5, 1, 0.5, 0.7, 0.2, 1, 0.45,
        ]),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0.15,
        spectralFlux: 0.05,
        structureSignal: 0.32,
        energySignal: 0.28,
        changeSignal: 0.14,
        pulseSignal: 0.05,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(true);
    expect(runtimeState.idleOverlay.visible).toBe(false);
    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(2);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(2);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeSlotCount).toBe(2);
  });

  it("applies transient and band modulation without changing mode counts", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.4, 0.2, 0.1]),
        transientEnergy: 0.85,
        spectralCentroid: 0.33,
        spectralFlux: 0.72,
        structureSignal: 0.51,
        energySignal: 0.64,
        changeSignal: 0.82,
        pulseSignal: 0.28,
        debug: {},
      },
      3,
      1 / 60,
    );

    expect(runtimeState.uniforms.uBackboneModeCount.value).toBe(1);
    expect(runtimeState.uniforms.uDetailModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(1);
    expect(runtimeState.uniforms.uTransientEnergy.value).toBe(0.85);
    expect(runtimeState.uniforms.uSpectralCentroid.value).toBe(0.33);
    expect(runtimeState.uniforms.uSpectralFlux.value).toBe(0.72);
    const [sub, lowMid, highMid, air] =
      runtimeState.uniforms.uBandEnergies.value.toArray();
    expect(sub).toBeCloseTo(0.6);
    expect(lowMid).toBeCloseTo(0.4);
    expect(highMid).toBeCloseTo(0.2);
    expect(air).toBeCloseTo(0.1);
    expect(runtimeState.debugSnapshot.raymarchDebug.modeSlotCount).toBe(1);
    expect(runtimeState.debugSnapshot.raymarchDebug.transientEnergy).toBe(0.85);
  });

  it("sharpens transient beams more than it swells the body density", () => {
    const steadyRuntimeState = createRuntimeState();
    const transientRuntimeState = createRuntimeState();
    const steadyFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 32,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array([4, 5, 5, 0.2]),
      backboneColorSlots: new Float32Array([1, 1, 1, 1]),
      detailColorSlots: new Float32Array([1, 1, 1, 1]),
      bandEnergies: new Float32Array([0.2, 0.2, 0.15, 0.1]),
      transientEnergy: 0.08,
      spectralCentroid: 0.28,
      spectralFlux: 0.06,
      structureSignal: 0.52,
      energySignal: 0.48,
      changeSignal: 0.12,
      pulseSignal: 0.08,
      debug: {},
    };
    const transientFrame = {
      ...steadyFrame,
      transientEnergy: 0.82,
      spectralFlux: 0.58,
      changeSignal: 0.76,
      pulseSignal: 0.55,
    };

    tickRaymarchRuntime(steadyRuntimeState, steadyFrame, 1, 1 / 60);
    tickRaymarchRuntime(transientRuntimeState, transientFrame, 1, 1 / 60);

    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug
        .effectiveContourSharpness,
    ).toBeGreaterThan(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveContourSharpness,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    ).toBeGreaterThan(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomStrength,
    );
    expect(
      transientRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    ).toBeLessThan(
      steadyRuntimeState.debugSnapshot.raymarchDebug.effectiveBloomRadius,
    );
    expect(transientRuntimeState.uniforms.uDensityGain.value).toBeLessThan(
      steadyRuntimeState.uniforms.uDensityGain.value * 1.08,
    );
  });

  it("keeps the continuous response alive between adjacent active frames", () => {
    const runtimeState = createRuntimeState();
    const featureFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 18,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
      transientEnergy: 0.4,
      spectralCentroid: 0.22,
      spectralFlux: 0.3,
      structureSignal: 0.62,
      energySignal: 0.58,
      changeSignal: 0.49,
      pulseSignal: 0.22,
      debug: {},
    };

    tickRaymarchRuntime(runtimeState, featureFrame, 2, 1 / 60);
    const firstEnvelope = runtimeState.responseEnvelope;

    tickRaymarchRuntime(
      runtimeState,
      {
        ...featureFrame,
        structureSignal: 0.18,
        energySignal: 0.12,
        changeSignal: 0.08,
        pulseSignal: 0,
      },
      2.016,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0);
    expect(runtimeState.responseEnvelope).toBeGreaterThanOrEqual(
      firstEnvelope * 0.8,
    );
    expect(runtimeState.visualRoot.scale.x).toBe(1);
  });

  it("disables automatic response when reactivity is zero", () => {
    const runtimeState = createRuntimeState();
    runtimeState.reactivityTuning.reactivity = 0;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
        transientEnergy: 0.4,
        spectralCentroid: 0.22,
        spectralFlux: 0.3,
        structureSignal: 0.62,
        energySignal: 0.58,
        changeSignal: 0.49,
        pulseSignal: 0.22,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBe(0);
    expect(runtimeState.accentEnvelope).toBe(0);
    expect(runtimeState.motionSignal).toBe(0);
    expect(runtimeState.scaleSignal).toBe(0);
    expect(runtimeState.bloomResponseSignal).toBe(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uDensityGain.value).toBe(2.8);
  });

  it("returns scale and density toward neutral in idle state", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.8;
    runtimeState.scaleSignal = 0.8;
    runtimeState.visualRoot.scale.setScalar(1.05);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 18,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.9]),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.6, 0.3, 0.1, 0.05]),
        transientEnergy: 0.4,
        spectralCentroid: 0.22,
        spectralFlux: 0.3,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        debug: {},
      },
      2,
      1 / 60,
    );

    expect(runtimeState.responseEnvelope).toBeLessThan(0.8);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.uniforms.uDensityGain.value).toBeGreaterThanOrEqual(
      2.8,
    );
    expect(
      runtimeState.debugSnapshot.raymarchDebug.responseEnvelope,
    ).toBeLessThan(0.8);
  });

  it("releases responseEnvelope faster for weak decay tails than active tails", () => {
    const decayRuntime = createRuntimeState();
    const activeRuntime = createRuntimeState();
    decayRuntime.responseEnvelope = 0.72;
    activeRuntime.responseEnvelope = 0.72;

    const weakTailFrame = {
      renderAuthority: true,
      averageAmplitude: 8,
      backboneSlots: new Float32Array([3, 4, 6, 0.18]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.08, 0.05, 0.03, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.16,
      spectralFlux: 0.02,
      structureSignal: 0.2,
      energySignal: 0.07,
      changeSignal: 0.03,
      pulseSignal: 0,
      rhythmicDensity: 0,
      debug: {},
    };

    tickRaymarchRuntime(
      decayRuntime,
      { ...weakTailFrame, fieldState: "decay" },
      2,
      1 / 60,
    );
    tickRaymarchRuntime(
      activeRuntime,
      { ...weakTailFrame, fieldState: "active" },
      2,
      1 / 60,
    );

    expect(decayRuntime.responseEnvelope).toBeLessThan(
      activeRuntime.responseEnvelope,
    );
  });

  it("keeps responseEnvelope active for coherent modal visibility tails", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.36;

    const resonantTailFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 1.24,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.028,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.8,
      rhythmicDensity: 0,
      debug: {
        modalResponseBackboneEnergy: 0.32,
        modalResponseDetailEnergy: 0,
      },
    };

    for (let frame = 0; frame < 36; frame += 1) {
      tickRaymarchRuntime(
        runtimeState,
        resonantTailFrame,
        2 + frame / 60,
        1 / 60,
      );
    }

    expect(runtimeState.responseEnvelope).toBeGreaterThan(0.16);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalResponseBackboneEnergy,
    ).toBe(0.32);
  });

  it("passes retained high-Q modal response through canonical observation", () => {
    const baselineRuntime = createRuntimeState();
    const retainedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 1.24,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.028,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.8,
      rhythmicDensity: 0,
      debug: {
        modalResponseBackboneEnergy: 0.02,
        modalResponseDetailEnergy: 0,
      },
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      retainedRuntime,
      {
        ...baseFrame,
        debug: {
          ...baseFrame.debug,
          modalResponseDetailEnergy: 0.19,
        },
      },
      2,
      1 / 60,
    );

    expect(
      retainedRuntime.uniforms.uModalResponseDetailEnergy.value,
    ).toBeCloseTo(0.19);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug.observationEnergy,
    ).toBeCloseTo(0.19);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    );
    expect(retainedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "retainedHighQRidgeVisibleDensityMax",
    );
  });

  it("does not let phase-coherent field author observation energy", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 0.2,
        backboneSlots: new Float32Array(32),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
        transientEnergy: 0,
        spectralCentroid: 0.18,
        spectralFlux: 0,
        structureSignal: 0.02,
        energySignal: 0.01,
        changeSignal: 0,
        pulseSignal: 0,
        modeCoherence: 0.7,
        modalPhaseAuthority: 1,
        rhythmicDensity: 0,
        debug: { modalResponseBackboneEnergy: 0, modalResponseDetailEnergy: 0 },
      },
      2,
      1 / 60,
    );

    expect(runtimeState.debugSnapshot.raymarchDebug.modalPhaseAuthority).toBe(
      1,
    );
    expect(runtimeState.debugSnapshot.raymarchDebug.observationEnergy).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBe(0);
  });

  it("passes backbone modal response to observation without old observer lanes", () => {
    const baselineRuntime = createRuntimeState();
    const observedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([3, 4, 6, 0.018]),
      detailSlots: new Float32Array([4, 5, 5, 0.012]),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.02, 0.018, 0.014, 0.01]),
      transientEnergy: 0,
      spectralCentroid: 0.18,
      spectralFlux: 0.01,
      structureSignal: 0.018,
      energySignal: 0.01,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.62,
      rhythmicDensity: 0,
      debug: { modalResponseBackboneEnergy: 0, modalResponseDetailEnergy: 0 },
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      observedRuntime,
      {
        ...baseFrame,
        debug: {
          ...baseFrame.debug,
          modalResponseBackboneEnergy: 0.24,
        },
      },
      2,
      1 / 60,
    );

    expect(
      observedRuntime.uniforms.uModalResponseBackboneEnergy.value,
    ).toBeCloseTo(0.24);
    expect(
      observedRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    );
    expect(observedRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "observerRidgeVisibleDensityMax",
    );
  });

  it("surfaces low-Q bass through backbone modal response, not topology floors", () => {
    const baselineRuntime = createRuntimeState();
    const lowQRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 0.8,
      backboneSlots: new Float32Array([1, 1, 1, 0.006, 2, 1, 1, 0.004]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array([0.12, 0.08, 0.01, 0.004]),
      transientEnergy: 0,
      spectralCentroid: 0.08,
      spectralFlux: 0.01,
      structureSignal: 0.018,
      energySignal: 0.012,
      changeSignal: 0,
      pulseSignal: 0,
      modeCoherence: 0.62,
      rhythmicDensity: 0,
      debug: { modalResponseBackboneEnergy: 0, modalResponseDetailEnergy: 0 },
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      lowQRuntime,
      {
        ...baseFrame,
        debug: {
          ...baseFrame.debug,
          modalResponseBackboneEnergy: 0.083,
        },
      },
      2,
      1 / 60,
    );

    expect(lowQRuntime.uniforms.uModalResponseBackboneEnergy.value).toBeCloseTo(
      0.083,
    );
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    ).toBeGreaterThan(
      baselineRuntime.debugSnapshot.raymarchDebug.observedDensityFloorMax,
    );
    expect(lowQRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "lowQBackboneTopologyFloor",
    );
    expect(lowQRuntime.debugSnapshot.raymarchDebug).not.toHaveProperty(
      "lowQBackboneRidgeVisibleDensityMax",
    );
  });

  it("keeps the outer radius fixed while internal response stays active", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 64,
        backboneSlots: new Float32Array([3, 4, 6, 0.7]),
        detailSlots: new Float32Array([4, 5, 5, 0.35]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.5, 0.3, 0.2, 0.1]),
        transientEnergy: 0.52,
        spectralCentroid: 0.36,
        spectralFlux: 0.31,
        structureSignal: 0.66,
        energySignal: 0.62,
        changeSignal: 0.48,
        pulseSignal: 0.22,
        modeCoherence: 0.61,
        trebleBroadbandEnergy: 0.14,
        debug: {},
      },
      1,
      1 / 60,
    );

    expect(runtimeState.scaleSignal).toBeGreaterThan(0);
    expect(runtimeState.bloomResponseSignal).toBeGreaterThan(0);
    expect(runtimeState.visualRoot.scale.x).toBe(1);
    expect(runtimeState.debugSnapshot.raymarchDebug.visualScale).toBe(1);
  });

  it("uploads rhythmicDensity to uRhythmicDensity uniform", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 24,
        backboneSlots: new Float32Array([3, 4, 6, 0.5]),
        detailSlots: new Float32Array(32),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array(4),
        transientEnergy: 0,
        spectralCentroid: 0.2,
        spectralFlux: 0.1,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        rhythmicDensity: 0.72,
        debug: {},
      },
      1,
      1 / 60,
    );
    expect(runtimeState.uniforms.uRhythmicDensity.value).toBeCloseTo(0.72);
  });

  it("treats missing rhythmicDensity as 0 without error", () => {
    const runtimeState = createRuntimeState();
    runtimeState.uniforms.uRhythmicDensity.value = 0.5;
    expect(() =>
      tickRaymarchRuntime(
        runtimeState,
        {
          fieldState: "active",
          renderAuthority: true,
          averageAmplitude: 24,
          backboneSlots: new Float32Array([3, 4, 6, 0.5]),
          detailSlots: new Float32Array(32),
          backboneColorSlots: new Float32Array(32),
          detailColorSlots: new Float32Array(32),
          bandEnergies: new Float32Array(4),
          transientEnergy: 0,
          spectralCentroid: 0.2,
          spectralFlux: 0.1,
          structureSignal: 0,
          energySignal: 0,
          changeSignal: 0,
          pulseSignal: 0,
          debug: {},
        },
        1,
        1 / 60,
      ),
    ).not.toThrow();
    expect(runtimeState.uniforms.uRhythmicDensity.value).toBe(0);
  });

  it("releases responseEnvelope faster at high rhythmicDensity than at low", () => {
    const edmRuntime = createRuntimeState();
    const ambientRuntime = createRuntimeState();
    // Pre-charge both envelopes equally
    edmRuntime.responseEnvelope = 0.7;
    ambientRuntime.responseEnvelope = 0.7;

    const baseFrame = {
      fieldState: "active",
      renderAuthority: true,
      averageAmplitude: 24,
      backboneSlots: new Float32Array([3, 4, 6, 0.5]),
      detailSlots: new Float32Array(32),
      backboneColorSlots: new Float32Array(32),
      detailColorSlots: new Float32Array(32),
      bandEnergies: new Float32Array(4),
      transientEnergy: 0,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
      structureSignal: 0,
      energySignal: 0,
      changeSignal: 0,
      pulseSignal: 0,
      debug: {},
    };

    tickRaymarchRuntime(
      edmRuntime,
      { ...baseFrame, rhythmicDensity: 1.0 },
      1,
      1 / 60,
    );
    tickRaymarchRuntime(
      ambientRuntime,
      { ...baseFrame, rhythmicDensity: 0.0 },
      1,
      1 / 60,
    );

    expect(edmRuntime.responseEnvelope).toBeLessThan(
      ambientRuntime.responseEnvelope,
    );
  });

  it("drops accent and beat envelopes faster than response on the first tail tick", () => {
    const runtimeState = createRuntimeState();
    runtimeState.responseEnvelope = 0.24;
    runtimeState.accentEnvelope = 0.18;
    runtimeState.beatPulseEnvelope = 0.12;
    const baselineResponse = runtimeState.responseEnvelope;
    const baselineAccent = runtimeState.accentEnvelope;
    const baselineBeat = runtimeState.beatPulseEnvelope;
    const baseThreshold = runtimeState.baseThreshold;

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 48,
        backboneSlots: new Float32Array([3, 4, 6, 0.8]),
        detailSlots: new Float32Array([4, 5, 5, 0.42]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.46, 0.31, 0.18, 0.08]),
        transientEnergy: 0.96,
        spectralCentroid: 0.34,
        spectralFlux: 0.88,
        structureSignal: 0.72,
        energySignal: 0.68,
        changeSignal: 1,
        pulseSignal: 1,
        beatDetected: true,
        beatStrength: 1,
        beatConfidence: 0.92,
        debug: {},
      },
      1,
      1 / 60,
    );

    const transientResponse = runtimeState.responseEnvelope;
    const transientAccent = runtimeState.accentEnvelope;
    const transientBeat = runtimeState.beatPulseEnvelope;
    const transientStrength = runtimeState.bloomTuning.effectiveStrength;
    const transientRadius = runtimeState.bloomTuning.effectiveRadius;
    const transientThreshold = runtimeState.bloomTuning.effectiveThreshold;

    expect(transientResponse).toBeGreaterThan(baselineResponse);
    expect(transientAccent).toBeGreaterThan(baselineAccent);
    expect(transientBeat).toBeGreaterThan(baselineBeat);

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
        renderAuthority: true,
        averageAmplitude: 28,
        backboneSlots: new Float32Array([3, 4, 6, 0.02]),
        detailSlots: new Float32Array([4, 5, 5, 0.01]),
        backboneColorSlots: new Float32Array(32),
        detailColorSlots: new Float32Array(32),
        bandEnergies: new Float32Array([0.22, 0.14, 0.08, 0.03]),
        transientEnergy: 0.04,
        spectralCentroid: 0.26,
        spectralFlux: 0.03,
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
        beatDetected: false,
        beatStrength: 0,
        beatConfidence: 0,
        debug: {},
      },
      1.016,
      1 / 60,
    );

    const responseDropFraction =
      (transientResponse - runtimeState.responseEnvelope) / transientResponse;
    const accentDropFraction =
      (transientAccent - runtimeState.accentEnvelope) / transientAccent;
    const beatDropFraction =
      (transientBeat - runtimeState.beatPulseEnvelope) / transientBeat;

    expect(responseDropFraction).toBeGreaterThan(0.05);
    expect(accentDropFraction).toBeGreaterThan(0.15);
    expect(beatDropFraction).toBeGreaterThan(0.11);
    expect(accentDropFraction).toBeGreaterThan(responseDropFraction);
    expect(beatDropFraction).toBeGreaterThan(responseDropFraction);
    expect(runtimeState.bloomTuning.effectiveStrength).toBeLessThan(
      transientStrength,
    );
    expect(runtimeState.bloomTuning.effectiveRadius).toBeLessThan(
      transientRadius,
    );
    expect(runtimeState.bloomTuning.effectiveThreshold).toBeGreaterThan(
      baseThreshold,
    );
    expect(runtimeState.bloomTuning.effectiveThreshold).toBeLessThanOrEqual(
      transientThreshold + 0.02,
    );
  });
});
