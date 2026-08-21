import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  analyzeModalField,
  buildRaymarchFieldAnalysis,
  deriveFieldExcitation,
  deriveRaymarchFieldComplexity,
} from "./fieldAnalysis.js";

const RAYMARCH_FIELD_ANALYSIS_SOURCE_URL = new URL(
  "./fieldAnalysis.js",
  import.meta.url,
);

function readRaymarchFieldAnalysisSource() {
  return readFileSync(RAYMARCH_FIELD_ANALYSIS_SOURCE_URL, {
    encoding: "utf8",
  });
}

function combineSlots(...slotArrays) {
  return new Float32Array(slotArrays.flatMap((slots) => Array.from(slots)));
}

function splitModalFieldSlots(modalFieldSlots) {
  const modeCount = Math.floor((modalFieldSlots?.length ?? 0) / 4);
  const modalIdentitySlots = new Float32Array(modeCount * 3);
  const modalCoefficientSlots = new Float32Array(modeCount);

  for (let slotIndex = 0; slotIndex < modeCount; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    const identityOffset = slotIndex * 3;
    modalIdentitySlots[identityOffset] = modalFieldSlots[sourceOffset];
    modalIdentitySlots[identityOffset + 1] = modalFieldSlots[sourceOffset + 1];
    modalIdentitySlots[identityOffset + 2] = modalFieldSlots[sourceOffset + 2];
    modalCoefficientSlots[slotIndex] = modalFieldSlots[sourceOffset + 3];
  }

  return { modalIdentitySlots, modalCoefficientSlots };
}

describe("raymarchFieldAnalysis", () => {
  it("preserves every active descriptor mode without modal-retention selectors", () => {
    const structuralSlots = new Float32Array([
      1, 1, 1, 1.0, 1, 2, 3, 0.1, 2, 2, 3, 0.1, 4, 4, 4, 0.1, 5, 5, 6, 0.1, 6,
      6, 6, 0.1,
    ]);
    const supportedDetailSlots = new Float32Array([
      2, 1, 1, 0.9, 2, 2, 3, 0.08, 3, 2, 3, 0.08, 4, 5, 4, 0.08, 5, 5, 6, 0.08,
      6, 7, 6, 0.08,
    ]);
    const modalFieldSlots = combineSlots(structuralSlots, supportedDetailSlots);

    const analysis = buildRaymarchFieldAnalysis({
      ...splitModalFieldSlots(modalFieldSlots),
      modalFieldCapacity: 12,
      featureFrame: {
        averageAmplitude: 96,
        structureSignal: 0.64,
        modalVisibilityEnergy: 0.42,
      },
    });

    expect(analysis.originalModeCount).toBe(12);
    expect(analysis.uploadedModeCount).toBe(12);
    expect(analysis.modalField.originalActiveCount).toBe(12);
    expect(analysis.modalField.uploadedActiveCount).toBe(12);
    expect(analysis.modalField.selectedIndices).toBeUndefined();
    expect(analysis.modalField.retainedEnergyRatio).toBeUndefined();
  });

  it("keeps modal retention selector artifacts out of the product owner", () => {
    const source = readRaymarchFieldAnalysisSource();

    expect(source).not.toContain("selectedIndices");
    expect(source).not.toContain("retainedEnergyRatio");
    expect(source).not.toContain("energyRetention");
    expect(source).not.toContain("analyzeBudgetedModeLayer");
    expect(source).not.toContain("copyBudgetedModeLayer");
    expect(source).not.toContain("modalFieldSlots");
  });

  it("counts every active slot in the modal field", () => {
    const slots = new Float32Array([
      1, 1, 1, 1.0, 1, 2, 3, 0.8, 2, 2, 3, 0.4, 4, 4, 4, 0.2, 5, 5, 6, 0.1, 6,
      6, 6, 0.05,
    ]);

    const modalField = analyzeModalField({
      ...splitModalFieldSlots(slots),
      capacity: 6,
    });

    expect(modalField.originalActiveCount).toBe(6);
    expect(modalField.uploadedActiveCount).toBe(6);
    expect(modalField.totalAmplitude).toBeCloseTo(2.55, 5);
    expect(modalField.uploadedAmplitude).toBeCloseTo(
      modalField.totalAmplitude,
      5,
    );
  });

  it("ignores committed coefficients beyond the active descriptor prefix", () => {
    const modalField = analyzeModalField({
      modalIdentitySlots: new Float32Array([1, 1, 1, 2, 2, 2]),
      modalCoefficientSlots: new Float32Array([0.6, 0.4, 8, 8]),
      activeModeCount: 2,
      capacity: 4,
    });

    expect(modalField.capacity).toBe(4);
    expect(modalField.originalActiveCount).toBe(2);
    expect(modalField.uploadedActiveCount).toBe(2);
    expect(modalField.totalAmplitude).toBeCloseTo(1, 5);
  });

  it("uploads through the last occupied slot when stable modal slots are sparse", () => {
    const slots = new Float32Array([
      0, 0, 0, 0, 2, 2, 2, 0.7, 0, 0, 0, 0, 4, 4, 4, 0.2,
    ]);

    const modalField = analyzeModalField({
      ...splitModalFieldSlots(slots),
      capacity: 4,
    });

    expect(modalField.originalActiveCount).toBe(2);
    expect(modalField.uploadedActiveCount).toBe(4);
    expect(modalField.totalAmplitude).toBeCloseTo(0.9, 5);
  });

  it("ignores color slots when analyzing field complexity", () => {
    const slots = new Float32Array([
      1, 1, 1, 0.5, 2, 2, 2, 0.4, 3, 3, 3, 0.3, 4, 4, 4, 0.09,
    ]);

    const baseline = analyzeModalField({
      ...splitModalFieldSlots(slots),
      capacity: 4,
    });
    const staticMode = analyzeModalField({
      ...splitModalFieldSlots(slots),
      colorSlots: new Float32Array([
        0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 0, 0, 0.1, 0, 1, 0, 1,
      ]),
      capacity: 4,
    });

    expect(staticMode.uploadedActiveCount).toBe(baseline.uploadedActiveCount);
    expect(staticMode.totalAmplitude).toBe(baseline.totalAmplitude);
  });

  it("does not mutate physical modal slots while deriving field analysis", () => {
    const structuralSlots = new Float32Array([
      1, 1, 1, 0.8, 2, 2, 2, 0.4, 3, 3, 3, 0.2,
    ]);
    const supportedDetailSlots = new Float32Array([
      4, 4, 4, 0.5, 5, 5, 5, 0.25, 6, 6, 6, 0.1,
    ]);
    const modalFieldSlots = combineSlots(structuralSlots, supportedDetailSlots);
    const originalModalField = Array.from(modalFieldSlots);

    const analysis = buildRaymarchFieldAnalysis({
      ...splitModalFieldSlots(modalFieldSlots),
      modalFieldCapacity: 6,
      featureFrame: {
        averageAmplitude: 80,
        structureSignal: 0.6,
        modalVisibilityEnergy: 0.4,
      },
    });

    expect(Array.from(modalFieldSlots)).toEqual(originalModalField);
    expect(analysis.originalModeCount).toBe(6);
    expect(analysis.uploadedModeCount).toBe(6);
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
    const low = buildRaymarchFieldAnalysis({
      ...splitModalFieldSlots(
        new Float32Array([1, 1, 1, 0.4, 2, 2, 2, 0.3, 1, 1, 2, 0.1]),
      ),
      modalFieldCapacity: 16,
      featureFrame: {
        averageAmplitude: 20,
        structureSignal: 0.2,
      },
    });
    const high = buildRaymarchFieldAnalysis({
      ...splitModalFieldSlots(
        new Float32Array([
          1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5,
          0.75, 3, 5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6, 2, 2, 3, 0.7, 2, 3,
          3, 0.65, 3, 3, 4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5, 4, 5, 5, 0.45, 5,
          5, 6, 0.4, 5, 6, 6, 0.35,
        ]),
      ),
      modalFieldCapacity: 16,
      featureFrame: {
        averageAmplitude: 160,
        structureSignal: 0.82,
      },
    });

    expect(high.complexityScore).toBeGreaterThan(low.complexityScore);
    expect(high.modalField.uploadedActiveCount).toBe(16);
    expect(high).not.toHaveProperty("requestedStepBudget");
    expect(high).not.toHaveProperty("requestedRenderScale");
  });

  it("keeps performance adaptation fields out of the field analysis", () => {
    const modalFieldSlots = new Float32Array([
      1, 2, 3, 1.0, 1, 3, 4, 0.9, 2, 3, 4, 0.85, 2, 4, 5, 0.8, 3, 4, 5, 0.75, 3,
      5, 6, 0.7, 4, 5, 6, 0.65, 4, 6, 7, 0.6, 2, 2, 3, 0.7, 2, 3, 3, 0.65, 3, 3,
      4, 0.6, 3, 4, 4, 0.55, 4, 4, 5, 0.5, 4, 5, 5, 0.45, 5, 5, 6, 0.4, 5, 6, 6,
      0.35,
    ]);
    const analysis = buildRaymarchFieldAnalysis({
      ...splitModalFieldSlots(modalFieldSlots),
      modalFieldCapacity: 16,
      featureFrame: {
        averageAmplitude: 255,
        structureSignal: 1,
        modalVisibilityEnergy: 1,
      },
    });

    expect(analysis.complexityScore).toBeGreaterThan(0.8);
    expect(analysis).not.toHaveProperty("requestedStepBudget");
    expect(analysis).not.toHaveProperty("requestedRenderScale");
    expect(analysis).not.toHaveProperty("proactiveStepBudget");
    expect(analysis).not.toHaveProperty("proactiveRenderScale");
    expect(analysis).not.toHaveProperty("stepScaleAdaptationActive");
    expect(analysis).not.toHaveProperty("bloomAdaptationActive");
    expect(analysis).not.toHaveProperty("bloomStrengthScale");
    expect(analysis).not.toHaveProperty("bloomThresholdOffset");
    expect(analysis).not.toHaveProperty("bloomAllowed");
  });

  it("derives complexity without effective-budget side channels", () => {
    const saturatedModalField = {
      capacity: 16,
      uploadedActiveCount: 16,
      originalActiveCount: 16,
      weightedPermutationLoad: 16,
    };
    const featureFrame = {
      averageAmplitude: 255,
      structureSignal: 1,
      modalVisibilityEnergy: 1,
    };

    const analysis = deriveRaymarchFieldComplexity({
      modalField: saturatedModalField,
      featureFrame,
    });

    expect(analysis.complexityScore).toBeGreaterThan(0.95);
    expect(analysis).not.toHaveProperty("requestedStepBudget");
    expect(analysis).not.toHaveProperty("requestedRenderScale");
    expect(analysis).not.toHaveProperty("effectiveStepBudget");
    expect(analysis).not.toHaveProperty("effectiveRenderScale");
  });
});
