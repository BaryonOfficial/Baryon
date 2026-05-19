import { describe, expect, it } from "vitest";
import {
  AUDIO_DEFAULTS,
  AUDIO_SLOT_CAPACITY,
  AUDIT_DEFAULTS,
  BEAT_DEFAULTS,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
  DEFAULTS,
  RAYMARCH_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "./defaults.js";

describe("defaults compatibility surface", () => {
  const domainDefaults = [
    AUDIO_DEFAULTS,
    SIMULATION_DEFAULTS,
    RENDER_DEFAULTS,
    REACTIVITY_DEFAULTS,
    BEAT_DEFAULTS,
    RAYMARCH_DEFAULTS,
    AUDIT_DEFAULTS,
  ];

  it("exports immutable named domain bags with explicit defaults", () => {
    for (const defaults of domainDefaults) {
      expect(Object.isFrozen(defaults)).toBe(true);
      expect(Object.keys(defaults).length).toBeGreaterThan(0);
    }
  });

  it("keeps scalar audio constants aligned with slot-domain defaults", () => {
    expect(DEFAULT_FFT_SIZE).toBe(4096);
    expect(DEFAULT_SAMPLE_RATE).toBe(44100);
    expect(AUDIO_SLOT_CAPACITY).toBe(
      AUDIO_DEFAULTS.backboneStackSlots + AUDIO_DEFAULTS.detailStackSlots,
    );
    expect(AUDIO_DEFAULTS.signalNormalizationSlots).toBe(AUDIO_SLOT_CAPACITY);
  });

  it("keeps DEFAULTS exactly aligned with the merged domain defaults", () => {
    const mergedDefaults = Object.assign({}, ...domainDefaults);

    expect(DEFAULTS).toEqual(mergedDefaults);
    expect(Object.keys(DEFAULTS).sort()).toEqual(
      Object.keys(mergedDefaults).sort(),
    );
    expect(DEFAULTS).not.toHaveProperty("fieldCacheOverride");
    expect(DEFAULTS).not.toHaveProperty("structurePersistence");
  });

  it("keeps promoted live raymarch defaults on the tuned UI panel values", () => {
    expect(SIMULATION_DEFAULTS.structureMin).toBeLessThan(
      SIMULATION_DEFAULTS.structureMax,
    );
    expect(SIMULATION_DEFAULTS.zeroPointPrecision).toBe(0.02);
    expect(SIMULATION_DEFAULTS.structureMax).toBe(0.48);
    expect(RAYMARCH_DEFAULTS.raymarchSteps).toBe(88);
    expect(RAYMARCH_DEFAULTS.densityGain).toBe(3.25);
    expect(RAYMARCH_DEFAULTS.absorption).toBe(3.37);
    expect(RENDER_DEFAULTS.bloomThreshold).toBe(0.3);
    expect(RENDER_DEFAULTS.renderQualityPreset).toBe("auto");
    expect(RENDER_DEFAULTS.performanceHudEnabled).toBe(false);
    expect(DEFAULTS.cavityGeometry).toBe(SIMULATION_DEFAULTS.cavityGeometry);
  });
});
