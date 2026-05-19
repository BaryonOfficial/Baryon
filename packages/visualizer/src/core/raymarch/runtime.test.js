import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createRaymarchSceneRoot, tickRaymarchRuntime } from "./runtime.js";
import {
  buildRaymarchFieldCacheDescriptor,
  createRaymarchPhaseOverlayCache,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
} from "./fieldCache.js";
import { RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES } from "./material.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./stepStability.js";

function createRuntimeState({ withFieldCache = false } = {}) {
  const fieldCache = withFieldCache
    ? createRaymarchFieldCache({ resolution: 8 })
    : null;
  const spectralLightCache = withFieldCache
    ? createRaymarchSpectralLightCache({ resolution: 8 })
    : null;
  const phaseOverlayCache = withFieldCache
    ? createRaymarchPhaseOverlayCache({ resolution: 8 })
    : null;
  const materialCache = withFieldCache
    ? {
        neumann: {
          direct: {},
          cached: {
            off: { rectangular: { steps: 64 } },
            direct: { rectangular: { steps: 64 } },
            cached: { rectangular: { steps: 64 } },
          },
        },
        dirichlet: {
          direct: {},
          cached: {
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
      uModalVisibilityEnergy: { value: 0 },
      uModalObserverVisibilityEnergy: { value: 0 },
      uModalVisibilityRetainedHighQEnergy: { value: 0 },
      uLowQBackboneVisibilityEnergy: { value: 0 },
      uModalPhaseOverlayStrength: { value: 0 },
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
        ? materialCache.neumann.cached.off.rectangular
        : {
            steps: 64,
          },
      userData: withFieldCache
        ? {
            raymarchMaterialCache: materialCache,
            raymarchBoundaryMode: "neumann",
            raymarchFieldEvaluationMode: "cached",
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
    fieldCache,
    spectralLightCache,
    phaseOverlayCache,
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
  if (runtimeState.fieldCache) {
    runtimeState.fieldCache.computeNodesByKey["rectangular:neumann"] = {
      id: "field",
    };
  }
  if (runtimeState.spectralLightCache) {
    runtimeState.spectralLightCache.computeNodesByKey["rectangular:neumann"] = {
      id: "spectral",
    };
  }
}

describe("tickRaymarchRuntime", () => {
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
      modalVisibilityEnergy: 0.37,
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
    expect(runtimeState.uniforms.uModalVisibilityEnergy.value).toBeCloseTo(
      0.37,
    );
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
    expect(runtimeState.phaseOverlayUploadCount).toBeUndefined();
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedPhaseOverlayModeCount,
    ).toBeUndefined();
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
      runtimeState.debugSnapshot.raymarchDebug.renderedDroppedModeCount,
    ).toBe(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.renderedRetainedEnergyRatio,
    ).toBe(1);
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
    expect(runtimeState.debugSnapshot.raymarchDebug.modalVisibilityEnergy).toBe(
      0.37,
    );
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
      runtimeState.debugSnapshot.raymarchDebug.projectionAllocatedEnergyBackbone,
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
      runtimeState.debugSnapshot.raymarchDebug.projectionOverlapPressureBackbone,
    ).toBe(0.23);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.projectionOverlapPressureDetail,
    ).toBe(0.41);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalVisibilityDensityLiftMax,
    ).toBeGreaterThan(0);
    expect(
      runtimeState.debugSnapshot.raymarchDebug.modalVisibilityVisibleDensityMax,
    ).toBeGreaterThan(0);
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

  it("updates a bounded phase overlay cache without rebuilding field or Spectral Light caches", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const featureFrame = {
      fieldState: "active",
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
    try {
      tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, renderer);
      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, featureFrame, 3.08, 1 / 60, renderer);
      await flushMicrotasks();
      const fieldRebuildCount = runtimeState.fieldCache.rebuildCount;
      const spectralRebuildCount = runtimeState.spectralLightCache.rebuildCount;
      const phaseOverlayRebuildCount =
        runtimeState.phaseOverlayCache.rebuildCount;
      const fieldDescriptor = runtimeState.fieldCache.activeDescriptor;
      const spectralDescriptor =
        runtimeState.spectralLightCache.activeDescriptor;

      featureFrame.backbonePhaseSlots = new Float32Array([
        1.2, -0.42, 0.8, 0.6, 0.1, 0.3, 0.2, 0.02,
      ]);
      featureFrame.detailPhaseSlots = new Float32Array([
        0.7, 0.25, 0.9, 0.7, -0.9, 0.1, 0.1, 0.01,
      ]);
      tickRaymarchRuntime(runtimeState, featureFrame, 3.1, 1 / 60, renderer);
      await flushMicrotasks();

      expect(runtimeState.phaseOverlayCache).toBeTruthy();
      expect(runtimeState.phaseOverlayCache.ready).toBe(true);
      expect(runtimeState.phaseOverlayCache.rebuildCount).toBe(
        phaseOverlayRebuildCount,
      );
      expect(runtimeState.phaseOverlayUploadCount).toBeGreaterThan(0);
      expect(runtimeState.uniforms.uModalPhaseOverlayStrength.value).toBe(0.5);
      expect(runtimeState.fieldCache.activeDescriptor).toEqual(fieldDescriptor);
      expect(runtimeState.spectralLightCache.activeDescriptor).toEqual(
        spectralDescriptor,
      );
      expect(runtimeState.fieldCache.rebuildCount).toBe(fieldRebuildCount);
      expect(runtimeState.spectralLightCache.rebuildCount).toBe(
        spectralRebuildCount,
      );
      expect(runtimeState.debugSnapshot.raymarchDebug.phaseOverlayReady).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.raymarchDebug.phaseOverlayPending).toBe(
        false,
      );
      expect(
        runtimeState.debugSnapshot.raymarchDebug.phaseOverlayResolution,
      ).toBe(8);
      expect(
        runtimeState.debugSnapshot.raymarchDebug.phaseOverlayModeCount,
      ).toBeGreaterThan(0);
      expect(
        runtimeState.debugSnapshot.raymarchDebug.phaseOverlaySemantic,
      ).toBe("signed-displacement");
      expect(
        runtimeState.debugSnapshot.raymarchDebug.signedPhaseOverlayActive,
      ).toBe(true);
      expect(
        runtimeState.debugSnapshot.raymarchDebug.signedPhaseOverlayModeCount,
      ).toBeGreaterThan(0);
      expect(
        runtimeState.debugSnapshot.raymarchDebug.signedPhaseOverlaySemantic,
      ).toBe("signed-displacement");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("fails phase overlay closed when cached compute is unavailable", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const featureFrame = {
      fieldState: "active",
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
    runtimeState.fieldCache.ready = true;
    runtimeState.fieldCache.activeDescriptor =
      buildRaymarchFieldCacheDescriptor({
        backboneSlots: runtimeState.backboneModeBuffer.value.array,
        detailSlots: runtimeState.detailModeBuffer.value.array,
        backboneCount: 1,
        detailCount: 1,
        boundaryMode: "neumann",
        radius: 3,
      });

    try {
      tickRaymarchRuntime(runtimeState, featureFrame, 3, 1 / 60, null);
      await flushMicrotasks();

      expect(runtimeState.phaseOverlayCache).toBeTruthy();
      expect(runtimeState.phaseOverlayCache.backend).toBe("unavailable");
      expect(runtimeState.phaseOverlayCache.ready).toBe(false);
      expect(runtimeState.uniforms.uModalPhaseOverlayStrength.value).toBe(0);
      expect(runtimeState.debugSnapshot.raymarchDebug.phaseOverlayReady).toBe(
        false,
      );
      expect(
        runtimeState.debugSnapshot.raymarchDebug.phaseOverlayLastError,
      ).toBe("Renderer computeAsync unavailable");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("reports requested spherical geometry while keeping the effective backend rectangular", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    runtimeState.requestedCavityGeometry = "spherical";

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
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
        modalVisibilityEnergy: 0.5,
      },
      1,
      1 / 60,
    );

    expect(runtimeState.volumeMesh.visible).toBe(false);
    expect(runtimeState.idleOverlay.visible).toBe(true);
    expect(runtimeState.uniforms.uActiveModeCount.value).toBe(0);
    expect(runtimeState.uniforms.uModalVisibilityEnergy.value).toBe(0);
    expect(runtimeState.backboneModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.detailModeBuffer.value.needsUpdate).toBe(false);
    expect(runtimeState.performanceGovernor).toBeNull();
    expect(runtimeState.debugSnapshot.raymarchDebug).toBeUndefined();
    expect(runtimeState.debugSnapshot.modeSlotCount).toBe(0);
  });

  it("suppresses the idle overlay during live input and restores it after stop", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
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
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const denseFrame = {
      fieldState: "active",
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

      expect(runtimeState.fieldCache.active).toBe(true);
      expect(runtimeState.fieldCache.rebuildPending).toBe(true);
      expect(runtimeState.fieldCache.ready).toBe(false);
      expect(runtimeState.fieldCache.rebuildCount).toBe(0);
      expect(renderer.computeAsync).toHaveBeenCalledTimes(0);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
      expect(runtimeState.debugSnapshot.fieldCacheReady).toBe(false);
      expect(runtimeState.debugSnapshot.fieldCacheRebuildPending).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheReady).toBe(false);
      expect(runtimeState.debugSnapshot.spectralLightCacheRebuildPending).toBe(
        true,
      );

      await flushMicrotasks();
      expect(renderer.computeAsync).toHaveBeenCalledTimes(2);

      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.fieldCache.rebuildPending).toBe(false);
      expect(runtimeState.fieldCache.ready).toBe(true);
      expect(runtimeState.fieldCache.rebuildCount).toBe(1);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(false);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.rebuildCount).toBe(1);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
      expect(runtimeState.debugSnapshot.fieldCacheActive).toBe(true);
      expect(runtimeState.debugSnapshot.fieldCacheBackend).toBe("compute");
      expect(runtimeState.debugSnapshot.fieldCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.fieldCacheRebuildPending).toBe(false);
      expect(runtimeState.debugSnapshot.fieldCacheRebuildCount).toBe(1);
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

  it("keeps cached evaluation active while the current modal descriptor rebuilds", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const cachedBackboneSlots = new Float32Array([1, 1, 1, 0.8]);
    const cachedDetailSlots = new Float32Array(32);
    const currentFrame = {
      fieldState: "active",
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
      modalVisibilityEnergy: 0,
    };

    try {
      runtimeState.backboneModeBuffer.value.array.set(cachedBackboneSlots);
      runtimeState.detailModeBuffer.value.array.set(cachedDetailSlots);
      runtimeState.uniforms.uBackboneModeCount.value = 1;
      runtimeState.uniforms.uDetailModeCount.value = 0;
      runtimeState.fieldCache.ready = true;
      runtimeState.fieldCache.activeDescriptor =
        buildRaymarchFieldCacheDescriptor({
          backboneSlots: runtimeState.backboneModeBuffer.value.array,
          detailSlots: runtimeState.detailModeBuffer.value.array,
          backboneCount: 1,
          detailCount: 0,
          boundaryMode: "neumann",
          cavityGeometry: "rectangular",
          radius: runtimeState.uniforms.uRadius.value,
        });

      tickRaymarchRuntime(runtimeState, currentFrame, 1, 1 / 60, renderer);

      expect(runtimeState.fieldCache.ready).toBe(true);
      expect(runtimeState.fieldCache.rebuildPending).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
      expect(runtimeState.debugSnapshot.fieldCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.fieldCacheRebuildPending).toBe(true);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps cached Spectral Light evaluation while cached color rebuild is still pending", async () => {
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
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const denseFrame = {
      fieldState: "active",
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
        "cached",
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
        "cached",
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

  it("defaults to cached evaluation when no override has been written yet", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({});
    const denseFrame = {
      fieldState: "active",
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

      expect(runtimeState.fieldCache.active).toBe(true);
      expect(runtimeState.fieldCache.mode).toBe("cached");
      expect(runtimeState.fieldCache.rebuildPending).toBe(true);

      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(runtimeState.debugSnapshot.fieldCacheOverride).toBe("cached");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("falls back invalid override values to cached evaluation", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "weird",
    });
    const denseFrame = {
      fieldState: "active",
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
      await flushMicrotasks();
      tickRaymarchRuntime(runtimeState, denseFrame, 2, 1 / 60, renderer);

      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(runtimeState.debugSnapshot.fieldCacheOverride).toBe("cached");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("keeps cached evaluation active while a refreshed field cache rebuild is pending", async () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const renderer = {
      computeAsync: vi.fn(async () => undefined),
    };
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });
    const denseFrame = {
      fieldState: "active",
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

      expect(runtimeState.fieldCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);

      tickRaymarchRuntime(runtimeState, changedFrame, 3, 1 / 60, renderer);

      expect(runtimeState.fieldCache.rebuildPending).toBe(true);
      expect(runtimeState.fieldCache.ready).toBe(true);
      expect(runtimeState.spectralLightCache.rebuildPending).toBe(true);
      expect(runtimeState.spectralLightCache.ready).toBe(true);
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
      expect(runtimeState.debugSnapshot.fieldCacheReady).toBe(true);
      expect(runtimeState.debugSnapshot.fieldCacheRebuildPending).toBe(true);
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

  it("keeps field mode uploads identical between static and Spectral color modes", () => {
    const createFrame = () => ({
      fieldState: "active",
      averageAmplitude: 48,
      backboneSlots: new Float32Array([1, 1, 1, 0.3]),
      detailSlots: new Float32Array([
        1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
      ]),
      backboneColorSlots: new Float32Array([1, 0.1, 0.1, 0.2]),
      detailColorSlots: new Float32Array([
        0.8, 0.1, 0.1, 0.2, 0.7, 0.2, 0.1, 0.2, 0.6, 0.2, 0.1, 0.2, 0, 1, 0,
        1,
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

    tickRaymarchRuntime(
      staticRuntimeState,
      createFrame(),
      1,
      1 / 60,
    );
    tickRaymarchRuntime(
      spectralRuntimeState,
      createFrame(),
      1,
      1 / 60,
    );

    expect(spectralRuntimeState.uniforms.uDetailModeCount.value).toBe(
      staticRuntimeState.uniforms.uDetailModeCount.value,
    );
    expect(
      Array.from(spectralRuntimeState.detailModeBuffer.value.array.slice(0, 12)),
    ).toEqual(
      Array.from(staticRuntimeState.detailModeBuffer.value.array.slice(0, 12)),
    );
    expect(
      spectralRuntimeState.performanceGovernor.detail.selectedIndices,
    ).toEqual(staticRuntimeState.performanceGovernor.detail.selectedIndices);
    expect(
      spectralRuntimeState.detailColorBuffer.value.needsUpdate,
    ).toBe(true);
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
    expect(runtimeState.debugSnapshot.spectralLightCacheQueuedDescriptorPending)
      .toBe(false);
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

  it("fails closed to cached modes when compute is unavailable", () => {
    const runtimeState = createRuntimeState({ withFieldCache: true });
    const originalWindow = globalThis.window;
    globalThis.window = /** @type {any} */ ({
      __baryonFieldCacheOverride: "cached",
    });

    try {
      tickRaymarchRuntime(
        runtimeState,
        {
          fieldState: "active",
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

      expect(runtimeState.fieldCache.backend).toBe("unavailable");
      expect(runtimeState.spectralLightCache.backend).toBe("unavailable");
      expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
        "cached",
      );
      expect(
        runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
      ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached);
      expect(runtimeState.debugSnapshot.fieldCacheFailedClosed).toBe(true);
      expect(runtimeState.debugSnapshot.spectralLightCacheFailedClosed).toBe(
        true,
      );
      expect(runtimeState.debugSnapshot.fieldCacheLastError).toBe(
        "Renderer computeAsync unavailable",
      );
      expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
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

    const newestDescriptor = runtimeState.currentFieldDescriptor;
    expect(runtimeState.fieldCache.queuedDescriptor).toEqual(newestDescriptor);
    expect(runtimeState.debugSnapshot.fieldCacheQueuedDescriptorPending).toBe(
      true,
    );
    await Promise.resolve();
    expect(computeCalls).toBe(1);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(runtimeState.fieldCache.pendingDescriptor).toEqual(newestDescriptor);
    expect(runtimeState.fieldCache.queuedDescriptor).toBeNull();
    expect(runtimeState.fieldCache.rebuildPending).toBe(true);
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
        modalVisibilityEnergy: 0.03,
        modalObserverVisibilityEnergy: 0.04,
        lowQBackboneVisibilityEnergy: 0.05,
        debug: {
          lowQBackboneVisibilityEnergy: 0.05,
        },
      },
      1,
      1 / 60,
      renderer,
    );

    expect(runtimeState.uniforms.uActiveModeCount.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uTotalSlotAmplitude.value).toBeGreaterThan(0);
    expect(runtimeState.uniforms.uLowQBackboneVisibilityEnergy.value).toBe(
      0.05,
    );
    expect(runtimeState.volumeMesh.userData.raymarchFieldEvaluationMode).toBe(
      "cached",
    );
    expect(
      runtimeState.volumeMesh.userData.raymarchSpectralLightEvaluationMode,
    ).toBe(RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off);
    expect(runtimeState.debugSnapshot.fieldEvaluationMode).toBe("cached");
    await flushMicrotasks();
    expect(runtimeState.fieldCache.activeDescriptor).toEqual(
      runtimeState.currentFieldDescriptor,
    );
  });

  it("keeps the volume active when only detail slots are populated", () => {
    const runtimeState = createRuntimeState();
    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
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
      modalVisibilityEnergy: 0.32,
      rhythmicDensity: 0,
      debug: {},
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
    expect(runtimeState.debugSnapshot.raymarchDebug.modalVisibilityEnergy).toBe(
      0.32,
    );
  });

  it("keeps retained high-Q diagnostics from changing shader-visible density", () => {
    const baselineRuntime = createRuntimeState();
    const retainedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
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
      modalVisibilityEnergy: 0.32,
      rhythmicDensity: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      retainedRuntime,
      {
        ...baseFrame,
        modalVisibilityRetainedHighQEnergy: 0.19,
      },
      2,
      1 / 60,
    );

    expect(
      retainedRuntime.uniforms.uModalVisibilityRetainedHighQEnergy.value,
    ).toBeCloseTo(0.19);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug
        .retainedHighQRidgeVisibleDensityMax,
    ).toBe(0);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug
        .retainedHighQRidgeToRetainedEnergyRatio,
    ).toBe(0);
    expect(
      retainedRuntime.debugSnapshot.raymarchDebug
        .retainedHighQPhysicalVisibleDensityMax,
    ).toBe(0);
    expect(retainedRuntime.scaleSignal).toBeCloseTo(
      baselineRuntime.scaleSignal,
      6,
    );
    expect(retainedRuntime.bloomResponseSignal).toBeCloseTo(
      baselineRuntime.bloomResponseSignal,
      6,
    );
  });

  it("passes observer ridge visibility to the shader without inflating bloom response", () => {
    const baselineRuntime = createRuntimeState();
    const observedRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
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
      modalVisibilityEnergy: 0.02,
      rhythmicDensity: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      observedRuntime,
      {
        ...baseFrame,
        modalObserverVisibilityEnergy: 0.24,
      },
      2,
      1 / 60,
    );

    expect(
      observedRuntime.uniforms.uModalObserverVisibilityEnergy.value,
    ).toBeCloseTo(0.24);
    expect(
      observedRuntime.debugSnapshot.raymarchDebug
        .observerRidgeVisibleDensityMax,
    ).toBeGreaterThan(0);
    expect(
      observedRuntime.debugSnapshot.raymarchDebug
        .observerPhysicalVisibleDensityMax,
    ).toBe(0);
    expect(observedRuntime.scaleSignal).toBeCloseTo(
      baselineRuntime.scaleSignal,
      6,
    );
    expect(observedRuntime.bloomResponseSignal).toBeCloseTo(
      baselineRuntime.bloomResponseSignal,
      6,
    );
  });

  it("surfaces low-Q backbone diagnostics without changing shader-visible density", () => {
    const baselineRuntime = createRuntimeState();
    const lowQRuntime = createRuntimeState();
    const baseFrame = {
      fieldState: "active",
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
      modalVisibilityEnergy: 0,
      rhythmicDensity: 0,
      debug: {},
    };

    tickRaymarchRuntime(baselineRuntime, baseFrame, 2, 1 / 60);
    tickRaymarchRuntime(
      lowQRuntime,
      {
        ...baseFrame,
        modalObserverVisibilityEnergy: 0.08,
        lowQBackboneVisibilityAuthority: 0.46,
        lowQBackboneVisibilityEnergy: 0.083,
        lowQBackboneTopologyFloor: 0.0064,
        lowQBackboneSourceSupport: 0.28,
        lowQBackboneVisibilityRejected: false,
      },
      2,
      1 / 60,
    );

    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.lowQBackboneVisibilityAuthority,
    ).toBeCloseTo(0.46);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.lowQBackboneVisibilityEnergy,
    ).toBeCloseTo(0.083);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.lowQBackboneTopologyFloor,
    ).toBeCloseTo(0.0064);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.lowQBackboneSourceSupport,
    ).toBeCloseTo(0.28);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug.lowQBackboneVisibilityRejected,
    ).toBe(false);
    expect(
      lowQRuntime.uniforms.uLowQBackboneVisibilityEnergy.value,
    ).toBeCloseTo(0.083);
    expect(
      lowQRuntime.debugSnapshot.raymarchDebug
        .lowQBackboneRidgeVisibleDensityMax,
    ).toBe(0);
    expect(lowQRuntime.scaleSignal).toBeCloseTo(baselineRuntime.scaleSignal, 6);
    expect(lowQRuntime.bloomResponseSignal).toBeCloseTo(
      baselineRuntime.bloomResponseSignal,
      6,
    );
  });

  it("keeps the outer radius fixed while internal response stays active", () => {
    const runtimeState = createRuntimeState();

    tickRaymarchRuntime(
      runtimeState,
      {
        fieldState: "active",
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
        averageAmplitude: 28,
        backboneSlots: new Float32Array([3, 4, 6, 0.6]),
        detailSlots: new Float32Array([4, 5, 5, 0.18]),
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
