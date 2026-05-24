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
  CAVITY_ACOUSTIC_DEFAULTS,
} from "./defaults.js";
import { BUILT_IN_VISUAL_PRESETS } from "./controls/visualPresets.js";

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
    expect(DEFAULT_FFT_SIZE).toBe(8192);
    expect(DEFAULT_SAMPLE_RATE).toBe(44100);
    expect(AUDIO_SLOT_CAPACITY).toBe(
      AUDIO_DEFAULTS.backboneStackSlots + AUDIO_DEFAULTS.detailStackSlots,
    );
    expect(AUDIO_DEFAULTS.maxBackboneDescriptorModes).toBe(
      AUDIO_DEFAULTS.backboneStackSlots,
    );
    expect(AUDIO_DEFAULTS.maxDetailDescriptorModes).toBe(
      AUDIO_DEFAULTS.detailStackSlots,
    );
    expect(AUDIO_DEFAULTS.maxTotalDescriptorModes).toBe(AUDIO_SLOT_CAPACITY);
    expect(AUDIO_DEFAULTS.signalNormalizationSlots).toBe(
      Math.max(
        AUDIO_DEFAULTS.maxBackboneDescriptorModes,
        AUDIO_DEFAULTS.maxDetailDescriptorModes,
      ),
    );
  });

  it("keeps DEFAULTS exactly aligned with the merged domain defaults", () => {
    const mergedDefaults = Object.assign({}, ...domainDefaults);

    expect(DEFAULTS).toEqual(mergedDefaults);
    expect(Object.keys(DEFAULTS).sort()).toEqual(
      Object.keys(mergedDefaults).sort(),
    );
    expect(DEFAULTS).not.toHaveProperty("structurePersistence");
  });

  it("keeps promoted live raymarch defaults aligned with baryon-7", () => {
    const baryon7Preset = BUILT_IN_VISUAL_PRESETS.find(
      (preset) => preset.name === "baryon-7",
    );

    expect(baryon7Preset).toBeTruthy();
    for (const [key, value] of Object.entries(baryon7Preset?.controls ?? {})) {
      expect(DEFAULTS[key]).toBe(value);
    }
    expect(SIMULATION_DEFAULTS.structureMin).toBeLessThan(
      SIMULATION_DEFAULTS.structureMax,
    );
    expect(RENDER_DEFAULTS.performanceHudEnabled).toBe(false);
    expect(DEFAULTS.cavityGeometry).toBe(SIMULATION_DEFAULTS.cavityGeometry);
  });

  it("keeps acoustic cavity scale explicit and separate from visual radius", () => {
    expect(Object.isFrozen(CAVITY_ACOUSTIC_DEFAULTS)).toBe(true);
    expect(SIMULATION_DEFAULTS.cavityAcousticScale).toBe(
      CAVITY_ACOUSTIC_DEFAULTS,
    );
    expect(SIMULATION_DEFAULTS.cavityAcousticScale).toMatchObject({
      radiusMeters: expect.any(Number),
      soundSpeedMetersPerSecond: 1480,
      subfloorPolicy: "project-low-q",
    });
    expect(SIMULATION_DEFAULTS.cavityAcousticScale.radiusMeters).toBeGreaterThan(
      SIMULATION_DEFAULTS.radius,
    );
  });
});
