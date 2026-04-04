import { describe, expect, it } from "vitest";
import {
  AUDIO_DEFAULTS,
  AUDIO_SIGNAL_NORMALIZATION_SLOTS,
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
  it("exports the current named domain bags", () => {
    expect(AUDIO_DEFAULTS).toBeDefined();
    expect(SIMULATION_DEFAULTS).toBeDefined();
    expect(RENDER_DEFAULTS).toBeDefined();
    expect(REACTIVITY_DEFAULTS).toBeDefined();
    expect(BEAT_DEFAULTS).toBeDefined();
    expect(RAYMARCH_DEFAULTS).toBeDefined();
    expect(AUDIT_DEFAULTS).toBeDefined();
  });

  it("exports the current scalar defaults", () => {
    expect(DEFAULT_FFT_SIZE).toBe(4096);
    expect(DEFAULT_SAMPLE_RATE).toBe(44100);
    expect(AUDIO_SLOT_CAPACITY).toBe(16);
    expect(AUDIO_SIGNAL_NORMALIZATION_SLOTS).toBe(AUDIO_SLOT_CAPACITY);
  });

  it("keeps DEFAULTS aligned with the merged domain defaults", () => {
    expect(DEFAULTS).toMatchObject({
      ...AUDIO_DEFAULTS,
      ...SIMULATION_DEFAULTS,
      ...RENDER_DEFAULTS,
      ...REACTIVITY_DEFAULTS,
      ...BEAT_DEFAULTS,
      ...RAYMARCH_DEFAULTS,
      ...AUDIT_DEFAULTS,
    });

    expect(DEFAULTS.renderQualityPreset).toBe(
      RENDER_DEFAULTS.renderQualityPreset,
    );
    expect(DEFAULTS.raymarchSteps).toBe(RAYMARCH_DEFAULTS.raymarchSteps);
    expect(DEFAULTS.echoCancellation).toBe(AUDIO_DEFAULTS.echoCancellation);
    expect(DEFAULTS.fieldCacheOverride).toBe(AUDIT_DEFAULTS.fieldCacheOverride);
    expect(DEFAULTS.cavityGeometry).toBe(SIMULATION_DEFAULTS.cavityGeometry);
  });
});
