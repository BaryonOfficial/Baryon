import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveSpectralPhaseEvidence,
  resolveSpectralPhaseField,
  seedSpectralPhaseField,
} from "./spectralPhaseFieldReference.js";

const angle = (direction) => Math.atan2(direction[1], direction[0]);
const directionMagnitude = (direction) => Math.hypot(...direction);

describe("spectral phase field reference", () => {
  it("keeps the TSL resolver on the same constants and no-growth packing", () => {
    const observerSource = readFileSync(
      new URL("./cymaticObserverNode.js", import.meta.url),
      "utf8",
    );
    for (const key of [
      "directionEpsilon",
      "firstMomentGateStart",
      "firstMomentGateEnd",
      "secondMomentGateStart",
      "secondMomentGateEnd",
      "secondMomentWeight",
    ]) {
      expect(observerSource).toContain(`SPECTRAL_PHASE_FIELD_REFERENCE.${key}`);
    }
    expect(observerSource).not.toContain("historyAxes");
    expect(observerSource).not.toContain("neighborNumerator");
    expect(observerSource).not.toContain("neighborGain");
    expect(observerSource).toContain(
      "modal moments have already crossed the fixed world-space resolving",
    );
    expect(observerSource).toContain("source.spectralPresence");
    expect(observerSource).toContain("spectralDirection.x");
    expect(observerSource).toContain("spectralDirection.y");
    expect(observerSource).toContain("resolveSpectralChromaticityNode");
    expect(observerSource).toContain("spectralChromaticity.r");
    expect(observerSource).toContain("spectralChromaticity.g");
    expect(observerSource).toContain("spectralChromaticity.b");
    expect(observerSource).toContain("deriveFineDetailAuthorityNode");
    const halfAxisBlock = observerSource.slice(
      observerSource.indexOf("function orientSecondMomentAxisNode"),
      observerSource.indexOf("function deriveSpectralEvidenceNode"),
    );
    expect(halfAxisBlock).toContain("sqrt(");
    expect(halfAxisBlock).not.toContain("atan(");
    expect(halfAxisBlock).not.toContain("cos(");
    expect(halfAxisBlock).not.toContain("sin(");
    expect(observerSource).not.toContain("recoverSpectralDirectionNode");
    expect(observerSource).not.toContain("source.color");
    expect(observerSource).not.toContain("spectralAuthority");
  });

  it("lets trusted first-moment evidence dominate", () => {
    const resolved = resolveSpectralPhaseField({
      firstMoment: [1, 0],
      secondMoment: [-1, 0],
      presence: 1,
      priorDirection: [0, 1],
      historyValid: true,
      deltaTimeSeconds: 1,
    });

    expect(resolved.evidenceGate).toBeCloseTo(1, 12);
    expect(resolved.direction[0]).toBeGreaterThan(0.999);
    expect(Math.abs(resolved.direction[1])).toBeLessThan(1e-3);
  });

  it("orients the second-moment half-axis against advected history", () => {
    const positive = deriveSpectralPhaseEvidence({
      secondMoment: [0, 1],
      priorDirection: [1, 1],
    });
    const negative = deriveSpectralPhaseEvidence({
      secondMoment: [0, 1],
      priorDirection: [-1, -1],
    });

    expect(positive.secondMomentAxis[0]).toBeGreaterThan(0);
    expect(positive.secondMomentAxis[1]).toBeGreaterThan(0);
    expect(negative.secondMomentAxis[0]).toBeLessThan(0);
    expect(negative.secondMomentAxis[1]).toBeLessThan(0);
  });

  it("uses the declared first-moment seed boundary", () => {
    const seed = [0, 1];
    const below = seedSpectralPhaseField({
      firstMoment: [0.06 - 1e-6, 0],
      seedDirection: seed,
      presence: 1,
    });
    const above = seedSpectralPhaseField({
      firstMoment: [0.06 + 1e-6, 0],
      seedDirection: seed,
      presence: 1,
    });

    expect(below.direction).toEqual(seed);
    expect(below.source).toBe("response-seed");
    expect(above.direction[0]).toBeCloseTo(1, 12);
    expect(above.source).toBe("first-moment");
  });

  it("uses the response-derived seed for exact circular cancellation", () => {
    const direction = [Math.SQRT1_2, -Math.SQRT1_2];
    const resolved = seedSpectralPhaseField({
      firstMoment: [0, 0],
      secondMoment: [0, 0],
      seedDirection: direction,
      presence: 1,
    });

    expect(resolved.direction[0]).toBeCloseTo(direction[0], 12);
    expect(resolved.direction[1]).toBeCloseTo(direction[1], 12);
    expect(resolved.source).toBe("response-seed");
  });

  it("keeps twelve equal pitch classes deterministic, finite, and unit length", () => {
    const phases = Array.from(
      { length: 12 },
      (_, index) => (index / 12) * 2 * Math.PI,
    );
    const firstMoment = phases.reduce(
      (sum, phase) => [sum[0] + Math.cos(phase), sum[1] + Math.sin(phase)],
      [0, 0],
    );
    const secondMoment = phases.reduce(
      (sum, phase) => [
        sum[0] + Math.cos(2 * phase),
        sum[1] + Math.sin(2 * phase),
      ],
      [0, 0],
    );
    const seedDirection = [Math.cos(0.7), Math.sin(0.7)];
    const seeded = resolveSpectralPhaseField({
      firstMoment,
      secondMoment,
      presence: 1,
      seedDirection,
      historyValid: false,
    });
    const history = resolveSpectralPhaseField({
      firstMoment,
      secondMoment,
      presence: 1,
      priorDirection: seeded.direction,
      historyValid: true,
      deltaTimeSeconds: 1 / 60,
    });

    expect(seeded.source).toBe("response-seed");
    expect(seeded.direction.every(Number.isFinite)).toBe(true);
    expect(history.direction.every(Number.isFinite)).toBe(true);
    expect(directionMagnitude(seeded.direction)).toBeCloseTo(1, 12);
    expect(directionMagnitude(history.direction)).toBeCloseTo(1, 12);
    expect(angle(history.direction)).toBeCloseTo(angle(seedDirection), 12);
  });

  it("keeps zero-support direction finite and visually irrelevant", () => {
    const resolved = seedSpectralPhaseField({
      seedDirection: [Number.NaN, 0],
      presence: 0,
    });

    expect(resolved.direction).toEqual([1, 0]);
    expect(resolved.presence).toBe(0);
    expect(resolved.direction.every(Number.isFinite)).toBe(true);
  });

  it("retains stable transported history when aperture-resolved evidence is weak", () => {
    const prior = [Math.cos(1.2), Math.sin(1.2)];
    const resolved = resolveSpectralPhaseField({
      priorDirection: prior,
      presence: 1,
      historyValid: true,
      deltaTimeSeconds: 1 / 60,
    });

    expect(angle(resolved.direction)).toBeCloseTo(angle(prior), 12);
    expect(resolved.evidenceGate).toBe(0);
  });

  it("does not advance on pause or a duplicate authoritative step", () => {
    const prior = [0, 1];
    for (const deltaTimeSeconds of [0, -1, Number.NaN]) {
      const resolved = resolveSpectralPhaseField({
        firstMoment: [1, 0],
        priorDirection: prior,
        presence: 1,
        historyValid: true,
        deltaTimeSeconds,
      });
      expect(resolved.direction[0]).toBeCloseTo(prior[0], 12);
      expect(resolved.direction[1]).toBeCloseTo(prior[1], 12);
      expect(resolved.beta).toBe(0);
    }
  });

  it("depends on field evidence and audio time, not camera or frame rate", () => {
    const common = {
      firstMoment: [0.5, 0.5],
      secondMoment: [0, 1],
      priorDirection: [1, 0],
      presence: 1,
      historyValid: true,
    };
    const baseline = resolveSpectralPhaseField({
      ...common,
      deltaTimeSeconds: 1 / 30,
    });
    const presentationVariant = resolveSpectralPhaseField({
      ...common,
      deltaTimeSeconds: 1 / 30,
      cameraPosition: [20, -5, 100],
      renderDeltaTimeSeconds: 1 / 240,
      outputResolution: [7680, 4320],
    });

    expect(presentationVariant).toEqual(baseline);
  });
});
