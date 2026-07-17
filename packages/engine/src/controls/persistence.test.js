import { describe, expect, it } from "vitest";
import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  createControlState,
} from "./schema.js";
import {
  serializeControls,
  deserializeControls,
  serializeControlSettings,
  deserializeControlSettings,
  normalizeControlSettingValue,
  isDefaultControlSettingValue,
  createPreset,
} from "./persistence.js";
import {
  MAX_PERFORMANCE_TARGET_FPS,
  MIN_PERFORMANCE_TARGET_FPS,
} from "../render/outputProfilePolicy.js";

const liveKeys = CONTROL_DEFINITIONS.filter(
  (d) => d.status === CONTROL_STATUSES.live,
).map((d) => d.key);

const debugOnlyKeys = CONTROL_DEFINITIONS.filter(
  (d) => d.status === CONTROL_STATUSES.debugOnly,
).map((d) => d.key);

describe("serializeControls", () => {
  it("includes all live control keys", () => {
    const state = createControlState();
    const serialized = serializeControls(state, CONTROL_DEFINITIONS);
    for (const key of liveKeys) {
      expect(serialized).toHaveProperty(key);
    }
  });

  it("excludes debug-only controls", () => {
    const state = createControlState();
    const serialized = serializeControls(state, CONTROL_DEFINITIONS);
    for (const key of debugOnlyKeys) {
      expect(serialized).not.toHaveProperty(key);
    }
  });

  it("keeps cavity geometry out of preset serialization while it is debug-only", () => {
    const state = createControlState();
    state.cavityGeometry = "spherical";

    const serialized = serializeControls(state, CONTROL_DEFINITIONS);

    expect(serialized).not.toHaveProperty("cavityGeometry");
  });

  it("preserves the values from the control state", () => {
    const state = createControlState();
    state.bloomStrength = 1.5;
    state.volumeColor = "#ff0000";
    state.spectralMix = 0.72;
    state.carrierCoreFwhmWorld = 0.106;
    const serialized = serializeControls(state, CONTROL_DEFINITIONS);
    expect(serialized.bloomStrength).toBe(1.5);
    expect(serialized.volumeColor).toBe("#ff0000");
    expect(serialized.spectralMix).toBe(0.72);
    expect(serialized).not.toHaveProperty("carrierCoreFwhmWorld");
    expect(serialized).not.toHaveProperty("zeroPointPrecision");
    expect(serialized).not.toHaveProperty("chromesthesiaMix");
  });

  it("does not serialize removed structure-window controls", () => {
    const state = {
      ...createControlState(),
      structureMin: 0.12,
      structureMax: 0.48,
    };

    const serialized = serializeControls(state, CONTROL_DEFINITIONS);

    expect(serialized).not.toHaveProperty("structureMin");
    expect(serialized).not.toHaveProperty("structureMax");
  });

  it("serializes the canonical max-quality performance profile", () => {
    const state = createControlState();
    state.renderQualityPreset = "none";

    const serialized = serializeControls(state, CONTROL_DEFINITIONS);

    expect(serialized.renderQualityPreset).toBe("max-quality");
  });
});

describe("serializeControlSettings", () => {
  it("serializes empty explicit settings as an empty v6 envelope", () => {
    expect(
      serializeControlSettings(createControlState(), CONTROL_DEFINITIONS, {
        explicitKeys: new Set(),
      }),
    ).toEqual({ version: 6, controls: {} });
  });

  it("serializes only explicit non-default settings", () => {
    const state = createControlState();
    state.bloomStrength = 1.8;
    state.volumeColor = "#ff0000";

    const serialized = serializeControlSettings(state, CONTROL_DEFINITIONS, {
      explicitKeys: new Set(["bloomStrength"]),
    });

    expect(serialized).toEqual({
      version: 6,
      controls: { bloomStrength: 1.8 },
    });
  });

  it("writes explicit default-equal settings", () => {
    const state = createControlState();

    const serialized = serializeControlSettings(state, CONTROL_DEFINITIONS, {
      explicitKeys: new Set(["backgroundColor"]),
    });

    expect(serialized).toEqual({
      version: 6,
      controls: { backgroundColor: "#000000" },
    });
  });

  it("filters debug-only and unknown explicit keys", () => {
    const state = createControlState();
    state.auditEnabled = true;

    const serialized = serializeControlSettings(state, CONTROL_DEFINITIONS, {
      explicitKeys: new Set(["auditEnabled", "missingControl"]),
    });

    expect(serialized).toEqual({ version: 6, controls: {} });
  });
});

describe("deserializeControlSettings", () => {
  it("treats malformed v6 envelopes as empty settings, not legacy snapshots", () => {
    for (const raw of [
      { version: 6 },
      { version: 6, controls: null },
      { version: 6, controls: [] },
    ]) {
      const result = deserializeControlSettings(raw, CONTROL_DEFINITIONS);

      expect(result.controls).toEqual({});
      expect(result.explicitKeys.size).toBe(0);
      expect(result.migratedLegacy).toBe(false);
    }
  });

  it("deserializes valid v6 settings through live schema filtering", () => {
    const result = deserializeControlSettings(
      {
        version: 6,
        controls: {
          bloomStrength: 0.75,
          backgroundColor: "#000000",
          auditEnabled: true,
          structureMin: 0.12,
          customTargetFps: "fast",
          unknownFutureProp: 42,
        },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({
      bloomStrength: 0.75,
      backgroundColor: "#000000",
    });
    expect(Array.from(result.explicitKeys).sort()).toEqual([
      "backgroundColor",
      "bloomStrength",
    ]);
    expect(result.migratedLegacy).toBe(false);
  });

  it("bakes the removed v5 bloom response into the direct bloom controls", () => {
    const result = deserializeControlSettings(
      {
        version: 5,
        controls: {
          bloomStrength: 0.75,
          bloomResponseBias: 0.5,
          absorption: 2,
          opacityGain: 1.4,
          reactivity: 1.2,
        },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toMatchObject({
      bloomStrength: 0.675,
      bloomRadius: 0.1656,
      bloomThreshold: 0.3,
    });
    expect(result.controls).not.toHaveProperty("bloomResponseBias");
    expect(result.controls).not.toHaveProperty("absorption");
    expect(result.controls).not.toHaveProperty("opacityGain");
    expect(result.controls).not.toHaveProperty("reactivity");
    expect(result.migratedLegacy).toBe(true);
  });

  it("discards the dimensionless legacy node-thickness threshold", () => {
    const result = deserializeControlSettings(
      {
        version: 2,
        controls: { zeroPointPrecision: 0.106 },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({});
    expect(Array.from(result.explicitKeys)).toEqual([]);
    expect(result.migratedLegacy).toBe(true);
    expect(result.controls).not.toHaveProperty("zeroPointPrecision");
  });

  it("discards every thickness setting written by the interim v2 cutover", () => {
    const result = deserializeControlSettings(
      {
        version: 2,
        controls: {
          carrierCoreFwhmWorld: 0.142,
          zeroPointPrecision: 0.2,
        },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({});
    expect(result.migratedLegacy).toBe(true);
  });

  it("discards widths already rewritten into the interim v3 envelope", () => {
    const result = deserializeControlSettings(
      {
        version: 3,
        controls: { carrierCoreFwhmWorld: 0.142 },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({});
    expect(Array.from(result.explicitKeys)).toEqual([]);
    expect(result.migratedLegacy).toBe(true);
  });

  it("discards the interim v4 width while migrating to fixed apparatus sharpness", () => {
    const result = deserializeControlSettings(
      {
        version: 4,
        controls: { carrierCoreFwhmWorld: 0.072 },
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({});
    expect(Array.from(result.explicitKeys)).toEqual([]);
    expect(result.migratedLegacy).toBe(true);
  });

  it("normalizes renderQualityPreset values at the settings boundary", () => {
    expect(
      normalizeControlSettingValue(
        "renderQualityPreset",
        "none",
        CONTROL_DEFINITIONS,
      ),
    ).toBe("max-quality");
    expect(
      isDefaultControlSettingValue(
        "renderQualityPreset",
        "auto",
        CONTROL_DEFINITIONS,
      ),
    ).toBe(true);
    expect(
      isDefaultControlSettingValue(
        "renderQualityPreset",
        "none",
        CONTROL_DEFINITIONS,
      ),
    ).toBe(false);
  });

  it("drops known old bloom defaults from legacy settings", () => {
    const result = deserializeControlSettings(
      {
        bloomStrength: 1.02,
        bloomRadius: 0.04,
        bloomThreshold: 0.08,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({});
    expect(result.explicitKeys.size).toBe(0);
    expect(result.migratedLegacy).toBe(true);
  });

  it("preserves custom legacy bloom settings as explicit overrides", () => {
    const result = deserializeControlSettings(
      {
        bloomStrength: 1.03,
        bloomRadius: 0.05,
        bloomThreshold: 0.09,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.controls).toEqual({
      bloomStrength: 1.03,
      bloomRadius: 0.05,
      bloomThreshold: 0.09,
    });
    expect(Array.from(result.explicitKeys).sort()).toEqual([
      "bloomRadius",
      "bloomStrength",
      "bloomThreshold",
    ]);
    expect(result.migratedLegacy).toBe(true);
  });
});

describe("deserializeControls", () => {
  it("fills all keys with defaults when given an empty object", () => {
    const result = deserializeControls({}, CONTROL_DEFINITIONS);
    for (const def of CONTROL_DEFINITIONS) {
      expect(result).toHaveProperty(def.key, def.defaultValue);
    }
  });

  it("applies known keys from the raw object", () => {
    const raw = { bloomStrength: 0.75, volumeColor: "#ff0000" };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);
    expect(result.bloomStrength).toBe(0.75);
    expect(result.volumeColor).toBe("#ff0000");
  });

  it("strips legacy and interim thickness controls from presets", () => {
    const result = deserializeControls(
      { zeroPointPrecision: 0.072, carrierCoreFwhmWorld: 0.142 },
      CONTROL_DEFINITIONS,
    );

    expect(result).not.toHaveProperty("zeroPointPrecision");
    expect(result).not.toHaveProperty("carrierCoreFwhmWorld");
  });

  it("strips unknown keys not in the schema", () => {
    const raw = { unknownFutureProp: 42, anotherStaleKey: "foo" };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);
    expect(result).not.toHaveProperty("unknownFutureProp");
    expect(result).not.toHaveProperty("anotherStaleKey");
  });

  it("strips legacy structure-window fields at the boundary", () => {
    const result = deserializeControls(
      {
        structureMin: 0.12,
        structureMax: 0.48,
        bloomStrength: 0.75,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.bloomStrength).toBe(0.75);
    expect(result).not.toHaveProperty("structureMin");
    expect(result).not.toHaveProperty("structureMax");
  });

  it("does not restore saved contour sharpness as a visibility tuning owner", () => {
    const result = deserializeControls(
      {
        contourSharpness: 1,
        densityGain: 3.4,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result).not.toHaveProperty("contourSharpness");
    expect(result.densityGain).toBe(3.4);
  });

  it("migrates legacy live input profile settings to acoustic intent", () => {
    const raw = { liveInputProfile: "voice-tone", bloomStrength: 0.75 };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);

    expect(result.liveInputAnalysisClass).toBe("auto");
    expect(result.liveInputAcousticIntent).toBe("vocal");
    expect(result.bloomStrength).toBe(0.75);
  });

  it("migrates legacy none performance profile values to max-quality", () => {
    const result = deserializeControls(
      { renderQualityPreset: "none" },
      CONTROL_DEFINITIONS,
    );

    expect(result.renderQualityPreset).toBe("max-quality");
  });

  it("migrates legacy custom performance targets to normalized target FPS controls", () => {
    const result = deserializeControls(
      { customPerformanceTargetFps: 500 },
      CONTROL_DEFINITIONS,
    );

    expect(result.customTargetFps).toBe(MAX_PERFORMANCE_TARGET_FPS);
    expect(result).not.toHaveProperty("customPerformanceTargetFps");
  });

  it("normalizes persisted custom target FPS controls at the storage boundary", () => {
    expect(
      deserializeControls({ customTargetFps: 5 }, CONTROL_DEFINITIONS)
        .customTargetFps,
    ).toBe(MIN_PERFORMANCE_TARGET_FPS);

    expect(
      deserializeControls({ customTargetFps: 72.4 }, CONTROL_DEFINITIONS)
        .customTargetFps,
    ).toBe(72);
  });

  it("collapses removed visualization methods onto raymarch", () => {
    expect(
      deserializeControls(
        { visualizationMethod: "cymatics-2d" },
        CONTROL_DEFINITIONS,
      ).visualizationMethod,
    ).toBe("raymarch");
    expect(
      deserializeControls(
        { visualizationMethod: "fullscreen-volume" },
        CONTROL_DEFINITIONS,
      ).visualizationMethod,
    ).toBe("raymarch");
  });

  it("migrates old chromesthesia settings to Spectral Light at the boundary", () => {
    const result = deserializeControls(
      { colorMode: "chromesthesia", chromesthesiaMix: 0.6 },
      CONTROL_DEFINITIONS,
    );

    expect(result.colorMode).toBe("spectral");
    expect(result.spectralMix).toBe(0.6);
    expect(result).not.toHaveProperty("chromesthesiaMix");
  });

  it("activates Spectral Light with the default mix when stored mix is zero", () => {
    const result = deserializeControls(
      { colorMode: "spectral", spectralMix: 0 },
      CONTROL_DEFINITIONS,
    );

    expect(result.colorMode).toBe("spectral");
    expect(result.spectralMix).toBe(0.96);
  });

  it("falls back to default when the stored type does not match", () => {
    const bloomDef = CONTROL_DEFINITIONS.find((d) => d.key === "bloomStrength");
    // bloomStrength default is a number — pass a string instead
    const raw = { bloomStrength: "not-a-number" };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);
    expect(result.bloomStrength).toBe(bloomDef.defaultValue);
  });

  it("falls back to defaults for null / non-object input", () => {
    for (const bad of [null, undefined, 42, "string", []]) {
      const result = deserializeControls(bad, CONTROL_DEFINITIONS);
      for (const def of CONTROL_DEFINITIONS) {
        expect(result[def.key]).toBe(def.defaultValue);
      }
    }
  });

  it("fills missing keys with schema defaults (forward-compatibility)", () => {
    // Simulate a save that only has one key — newer controls should get defaults
    const raw = { bloomStrength: 0.5 };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);
    // A key that was not in raw should still be present with its default
    const densityGainDef = CONTROL_DEFINITIONS.find(
      (d) => d.key === "densityGain",
    );
    expect(result.densityGain).toBe(densityGainDef.defaultValue);
  });

  it("maps legacy rotation settings into the consolidated motion control", () => {
    const result = deserializeControls(
      {
        rotationAudioAmount: 1.35,
        beatSensitivity: 0.9,
        pulseAmount: 0.11,
        pulseDecayMs: 270,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result.motionAmount).toBe(1.35);
    expect(result).not.toHaveProperty("reactivity");
    expect(result).not.toHaveProperty("structurePersistence");
  });

  it("preserves legacy rotation when pulse was disabled", () => {
    const result = deserializeControls(
      {
        pulseEnabled: false,
        rotationAudioAmount: 1.5,
        pulseAmount: 0.08,
        beatSensitivity: 1.1,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result).not.toHaveProperty("reactivity");
    expect(result.motionAmount).toBe(1.5);
  });

  it("keeps inferred motion disabled when legacy pulse was off without rotation", () => {
    const result = deserializeControls(
      {
        pulseEnabled: false,
        pulseAmount: 0.08,
        beatSensitivity: 1.1,
      },
      CONTROL_DEFINITIONS,
    );

    expect(result).not.toHaveProperty("reactivity");
    expect(result.motionAmount).toBe(0);
  });
});

describe("createPreset", () => {
  it("produces an object with name, createdAt, and controls", () => {
    const state = createControlState();
    const preset = createPreset("My Preset", state, CONTROL_DEFINITIONS);
    expect(preset.name).toBe("My Preset");
    expect(typeof preset.createdAt).toBe("number");
    expect(preset.createdAt).toBeGreaterThan(0);
    expect(typeof preset.controls).toBe("object");
  });

  it("only includes live controls in the preset (no debug-only)", () => {
    const state = createControlState();
    const preset = createPreset("test", state, CONTROL_DEFINITIONS);
    for (const key of debugOnlyKeys) {
      expect(preset.controls).not.toHaveProperty(key);
    }
    for (const key of liveKeys) {
      expect(preset.controls).toHaveProperty(key);
    }
    expect(preset.controls).not.toHaveProperty("structureMin");
    expect(preset.controls).not.toHaveProperty("structureMax");
  });

  it("round-trips through deserializeControls cleanly", () => {
    const state = createControlState();
    state.bloomStrength = 0.99;
    state.volumeColor = "#aabbcc";
    const preset = createPreset("round-trip", state, CONTROL_DEFINITIONS);
    const restored = deserializeControls(preset.controls, CONTROL_DEFINITIONS);
    expect(restored.bloomStrength).toBe(0.99);
    expect(restored.volumeColor).toBe("#aabbcc");
  });
});
