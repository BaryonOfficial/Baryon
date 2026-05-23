import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  analyzeFullModeLayer,
  buildRaymarchPerformanceGovernor,
  copyFullModeLayer,
  deriveFieldExcitation,
} from "./performanceGovernor.js";

const PERFORMANCE_GOVERNOR_SOURCE_URL = new URL(
  "./performanceGovernor.js",
  import.meta.url,
);

function readPerformanceGovernorSource() {
  return readFileSync(PERFORMANCE_GOVERNOR_SOURCE_URL, {
    encoding: "utf8",
  });
}

describe("performanceGovernor", () => {
  it("preserves every active descriptor mode without modal-retention selectors", () => {
    const backboneSlots = new Float32Array([
      1, 1, 1, 1.0, 1, 2, 3, 0.1, 2, 2, 3, 0.1, 4, 4, 4, 0.1, 5, 5, 6, 0.1, 6,
      6, 6, 0.1,
    ]);
    const detailSlots = new Float32Array([
      2, 1, 1, 0.9, 2, 2, 3, 0.08, 3, 2, 3, 0.08, 4, 5, 4, 0.08, 5, 5, 6, 0.08,
      6, 7, 6, 0.08,
    ]);

    const governor = buildRaymarchPerformanceGovernor({
      backboneSlots,
      detailSlots,
      backboneCapacity: 6,
      detailCapacity: 6,
      featureFrame: {
        averageAmplitude: 96,
        structureSignal: 0.64,
        modalVisibilityEnergy: 0.42,
      },
      requestedStepBudget: 64,
      requestedRenderScale: 1,
    });

    expect(governor.originalModeCount).toBe(12);
    expect(governor.uploadedModeCount).toBe(12);
    expect(governor.backbone.originalActiveCount).toBe(6);
    expect(governor.backbone.uploadedActiveCount).toBe(6);
    expect(governor.detail.originalActiveCount).toBe(6);
    expect(governor.detail.uploadedActiveCount).toBe(6);
    expect(governor.backbone.selectedIndices).toBeUndefined();
    expect(governor.detail.selectedIndices).toBeUndefined();
    expect(governor.backbone.retainedEnergyRatio).toBeUndefined();
    expect(governor.detail.retainedEnergyRatio).toBeUndefined();
  });

  it("keeps modal retention selector artifacts out of the product owner", () => {
    const source = readPerformanceGovernorSource();

    expect(source).not.toContain("selectedIndices");
    expect(source).not.toContain("retainedEnergyRatio");
    expect(source).not.toContain("energyRetention");
    expect(source).not.toContain("analyzeBudgetedModeLayer");
    expect(source).not.toContain("copyBudgetedModeLayer");
  });

  it("counts every active slot in a descriptor layer", () => {
    const slots = new Float32Array([
      1, 1, 1, 1.0, 1, 2, 3, 0.8, 2, 2, 3, 0.4, 4, 4, 4, 0.2, 5, 5, 6, 0.1, 6,
      6, 6, 0.05,
    ]);

    const layer = analyzeFullModeLayer({
      slots,
      capacity: 6,
    });

    expect(layer.originalActiveCount).toBe(6);
    expect(layer.uploadedActiveCount).toBe(6);
    expect(layer.totalAmplitude).toBeCloseTo(2.55, 5);
    expect(layer.uploadedAmplitude).toBeCloseTo(layer.totalAmplitude, 5);
  });

  it("copies the full descriptor layer into the upload buffer", () => {
    const sourceSlots = new Float32Array([
      1, 1, 1, 0.9, 2, 2, 2, 0.7, 3, 3, 3, 0.2, 4, 4, 4, 0,
    ]);
    const sourceColors = new Float32Array([
      1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0,
    ]);
    const targetSlots = new Float32Array(16);
    const targetColors = new Float32Array(16);

    copyFullModeLayer({
      sourceSlots,
      sourceColorSlots: sourceColors,
      targetSlots,
      targetColorSlots: targetColors,
      capacity: 4,
      includeColors: true,
    });

    expect(Array.from(targetSlots)).toEqual([
      1,
      1,
      1,
      expect.closeTo(0.9, 5),
      2,
      2,
      2,
      expect.closeTo(0.7, 5),
      3,
      3,
      3,
      expect.closeTo(0.2, 5),
      4,
      4,
      4,
      0,
    ]);
    expect(Array.from(targetColors.slice(0, 12))).toEqual([
      1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1,
    ]);
  });

  it("ignores color slots when analyzing field complexity", () => {
    const slots = new Float32Array([
      1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
    ]);

    const baseline = analyzeFullModeLayer({
      slots,
      capacity: 4,
    });
    const staticMode = analyzeFullModeLayer({
      slots,
      colorSlots: new Float32Array([
        0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 1, 0, 1,
      ]),
      capacity: 4,
    });

    expect(staticMode.uploadedActiveCount).toBe(baseline.uploadedActiveCount);
    expect(staticMode.totalAmplitude).toBe(baseline.totalAmplitude);
  });

  it("does not mutate physical modal slots while deriving performance controls", () => {
    const backboneSlots = new Float32Array([
      1, 1, 1, 0.8, 2, 2, 2, 0.4, 3, 3, 3, 0.2,
    ]);
    const detailSlots = new Float32Array([
      4, 4, 4, 0.5, 5, 5, 5, 0.25, 6, 6, 6, 0.1,
    ]);
    const originalBackbone = Array.from(backboneSlots);
    const originalDetail = Array.from(detailSlots);

    const governor = buildRaymarchPerformanceGovernor({
      backboneSlots,
      detailSlots,
      backboneCapacity: 3,
      detailCapacity: 3,
      featureFrame: {
        averageAmplitude: 80,
        structureSignal: 0.6,
        modalVisibilityEnergy: 0.4,
      },
      requestedStepBudget: 64,
      requestedRenderScale: 1,
    });

    expect(Array.from(backboneSlots)).toEqual(originalBackbone);
    expect(Array.from(detailSlots)).toEqual(originalDetail);
    expect(governor.originalModeCount).toBe(6);
    expect(governor.uploadedModeCount).toBe(6);
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

  it("raises complexity when mode load and excitation increase", () => {
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
    expect(high.backbone.uploadedActiveCount).toBe(8);
    expect(high.detail.uploadedActiveCount).toBe(8);
  });
});
