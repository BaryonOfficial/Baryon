import { describe, expect, it } from "vitest";
import {
  analyzeBudgetedModeLayer,
  BACKBONE_ENERGY_RETENTION,
  buildRaymarchPerformanceGovernor,
  copyBudgetedModeLayer,
  deriveFieldExcitation,
  MIN_BACKBONE_RENDER_SLOTS,
} from "./performanceGovernor.js";

describe("performanceGovernor", () => {
  it("retains dominant slots while respecting the minimum floor", () => {
    const slots = new Float32Array([
      1, 1, 1, 1.0, 1, 2, 3, 0.8, 2, 2, 3, 0.4, 4, 4, 4, 0.2, 5, 5, 6, 0.1, 6,
      6, 6, 0.05,
    ]);

    const layer = analyzeBudgetedModeLayer({
      slots,
      capacity: 6,
      minSlots: MIN_BACKBONE_RENDER_SLOTS,
      energyRetention: BACKBONE_ENERGY_RETENTION,
    });

    expect(layer.originalActiveCount).toBe(6);
    expect(layer.uploadedActiveCount).toBeGreaterThanOrEqual(4);
    expect(layer.retainedEnergyRatio).toBeGreaterThanOrEqual(
      BACKBONE_ENERGY_RETENTION,
    );
  });

  it("copies only the budgeted slots into the upload buffer", () => {
    const sourceSlots = new Float32Array([
      1, 1, 1, 0.9, 2, 2, 2, 0.7, 3, 3, 3, 0.2, 4, 4, 4, 0,
    ]);
    const sourceColors = new Float32Array([
      1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0,
    ]);
    const targetSlots = new Float32Array(16);
    const targetColors = new Float32Array(16);

    copyBudgetedModeLayer({
      sourceSlots,
      sourceColorSlots: sourceColors,
      targetSlots,
      targetColorSlots: targetColors,
      selectedIndices: [0, 2],
      capacity: 4,
      includeColors: true,
    });

    expect(Array.from(targetSlots.slice(0, 8))).toEqual([
      1,
      1,
      1,
      expect.closeTo(0.9, 5),
      3,
      3,
      3,
      expect.closeTo(0.2, 5),
    ]);
    expect(Array.from(targetColors.slice(0, 8))).toEqual([
      1, 0, 0, 1, 0, 0, 1, 1,
    ]);
    expect(Array.from(targetSlots.slice(8, 16))).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("preserves amplitude-only selection when Spectral Light context is absent", () => {
    const slots = new Float32Array([
      1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
    ]);

    const baseline = analyzeBudgetedModeLayer({
      slots,
      capacity: 4,
      minSlots: 2,
      energyRetention: 0.72,
    });
    const staticMode = analyzeBudgetedModeLayer({
      slots,
      colorSlots: new Float32Array([
        0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 1, 0, 1,
      ]),
      capacity: 4,
      minSlots: 2,
      energyRetention: 0.72,
      spectralLightEnabled: false,
      featureFrame: {
        transientEnergy: 1,
        timbreSpread: 0,
      },
    });

    expect(staticMode.selectedIndices).toEqual(baseline.selectedIndices);
    expect(staticMode.uploadedActiveCount).toBe(baseline.uploadedActiveCount);
  });

  it("retains a color-salient detail slot when Spectral Light is active", () => {
    const slots = new Float32Array([
      1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
    ]);
    const colorSlots = new Float32Array([
      0.8, 0.1, 0.1, 0.2, 0.7, 0.2, 0.1, 0.2, 0.6, 0.2, 0.1, 0.2, 0, 1, 0, 1,
    ]);

    const amplitudeOnly = analyzeBudgetedModeLayer({
      slots,
      capacity: 4,
      minSlots: 2,
      energyRetention: 0.72,
    });
    const spectralLightAware = analyzeBudgetedModeLayer({
      slots,
      colorSlots,
      capacity: 4,
      minSlots: 2,
      energyRetention: 0.72,
      layerType: "detail",
      spectralLightEnabled: true,
      featureFrame: {
        transientEnergy: 0.45,
        timbreSpread: 0.1,
        trebleBroadbandEnergy: 0.08,
      },
    });

    expect(amplitudeOnly.selectedIndices).toEqual([0, 1, 2]);
    expect(spectralLightAware.selectedIndices).toContain(3);
    expect(spectralLightAware.selectedIndices).not.toContain(2);
    expect(spectralLightAware.retainedEnergyRatio).toBeGreaterThanOrEqual(0.72);
  });

  it("does not promote Spectral Light-only detail on broadband noisy frames", () => {
    const slots = new Float32Array([
      1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
    ]);
    const colorSlots = new Float32Array([
      0.8, 0.1, 0.1, 0.2, 0.7, 0.2, 0.1, 0.2, 0.6, 0.2, 0.1, 0.2, 0, 1, 0, 1,
    ]);

    const noisy = analyzeBudgetedModeLayer({
      slots,
      colorSlots,
      capacity: 4,
      minSlots: 2,
      energyRetention: 0.72,
      layerType: "detail",
      spectralLightEnabled: true,
      featureFrame: {
        transientEnergy: 0.05,
        timbreSpread: 0.92,
        trebleBroadbandEnergy: 0.9,
      },
    });

    expect(noisy.selectedIndices).toEqual([0, 1, 2]);
  });

  it("derives field excitation from modal signals", () => {
    const coreFrame = {
      averageAmplitude: 24,
      structureSignal: 0.18,
      modeCoherence: 0.48,
      modalVisibilityEnergy: 0.36,
    };

    expect(deriveFieldExcitation(coreFrame)).toBeGreaterThan(
      deriveFieldExcitation({
        ...coreFrame,
        modeCoherence: 0,
        modalVisibilityEnergy: 0,
      }),
    );
  });

  it("raises complexity when uploaded mode load and excitation increase", () => {
    const low = buildRaymarchPerformanceGovernor({
      backboneSlots: new Float32Array([1, 1, 1, 0.4, 2, 2, 2, 0.3]),
      detailSlots: new Float32Array([1, 1, 2, 0.1]),
      backboneCapacity: 8,
      detailCapacity: 8,
      featureFrame: {
        averageAmplitude: 20,
        structureSignal: 0.2,
      },
      requestedStepBudget: 64,
      requestedRenderScale: 1,
    });
    const high = buildRaymarchPerformanceGovernor({
      backboneSlots: new Float32Array([
        1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5, 0.75,
        3, 5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6,
      ]),
      detailSlots: new Float32Array([
        2, 2, 3, 0.7, 2, 3, 3, 0.65, 3, 3, 4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5,
        4, 5, 5, 0.45, 5, 5, 6, 0.4, 5, 6, 6, 0.35,
      ]),
      backboneCapacity: 8,
      detailCapacity: 8,
      featureFrame: {
        averageAmplitude: 160,
        structureSignal: 0.82,
      },
      requestedStepBudget: 64,
      requestedRenderScale: 1,
    });

    expect(high.complexityScore).toBeGreaterThan(low.complexityScore);
    expect(high.proactiveStepBudget).toBeLessThanOrEqual(64);
    expect(high.proactiveRenderScale).toBeLessThanOrEqual(1);
    expect(high.backbone.uploadedActiveCount).toBeGreaterThan(0);
    expect(high.detail.uploadedActiveCount).toBeGreaterThan(0);
  });
});
