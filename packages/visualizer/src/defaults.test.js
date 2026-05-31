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
import { DEFAULT_PERFORMANCE_PROFILE } from "./render/outputProfilePolicy.js";

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
    expect(AUDIO_SLOT_CAPACITY).toBe(AUDIO_DEFAULTS.modalFieldCapacity);
    expect(AUDIO_DEFAULTS.maxModalFieldDescriptorModes).toBe(
      AUDIO_DEFAULTS.modalFieldCapacity,
    );
    expect(AUDIO_DEFAULTS.signalNormalizationSlots).toBe(
      AUDIO_DEFAULTS.modalFieldCapacity,
    );
    expect(AUDIO_DEFAULTS).not.toHaveProperty("backboneStackSlots");
    expect(AUDIO_DEFAULTS).not.toHaveProperty("detailStackSlots");
    expect(AUDIO_DEFAULTS).not.toHaveProperty("maxBackboneDescriptorModes");
    expect(AUDIO_DEFAULTS).not.toHaveProperty("maxDetailDescriptorModes");
    expect(AUDIO_DEFAULTS).not.toHaveProperty("maxTotalDescriptorModes");
  });

  it("keeps DEFAULTS exactly aligned with the merged domain defaults", () => {
    const mergedDefaults = Object.assign({}, ...domainDefaults);

    expect(DEFAULTS).toEqual(mergedDefaults);
    expect(Object.keys(DEFAULTS).sort()).toEqual(
      Object.keys(mergedDefaults).sort(),
    );
    expect(SIMULATION_DEFAULTS).not.toHaveProperty("structureMin");
    expect(SIMULATION_DEFAULTS).not.toHaveProperty("structureMax");
    expect(DEFAULTS).not.toHaveProperty("structureMin");
    expect(DEFAULTS).not.toHaveProperty("structureMax");
    expect(DEFAULTS).not.toHaveProperty("structurePersistence");
  });

  it("uses the canonical max-quality render profile for live defaults", () => {
    expect(RENDER_DEFAULTS.renderQualityPreset).toBe(
      DEFAULT_PERFORMANCE_PROFILE,
    );
    expect(DEFAULTS.renderQualityPreset).toBe(DEFAULT_PERFORMANCE_PROFILE);
  });

  it("keeps promoted live raymarch defaults aligned with baryon-7", () => {
    const baryon7Preset = BUILT_IN_VISUAL_PRESETS.find(
      (preset) => preset.name === "baryon-7",
    );

    expect(baryon7Preset).toEqual(
      expect.objectContaining({
        name: "baryon-7",
        builtIn: true,
        controls: expect.any(Object),
      }),
    );
    for (const [key, value] of Object.entries(baryon7Preset.controls)) {
      expect(DEFAULTS[key]).toBe(value);
    }
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
      subfloorPolicy: "project-subfundamental",
    });
    expect(SIMULATION_DEFAULTS.cavityAcousticScale.radiusMeters).toBeGreaterThan(
      SIMULATION_DEFAULTS.radius,
    );
  });
});
