import { describe, expect, it } from "vitest";
import { CONTROL_DEFINITIONS, CONTROL_STATUSES, createControlState } from "./schema.js";
import { serializeControls, deserializeControls, createPreset } from "./persistence.js";

const liveKeys = CONTROL_DEFINITIONS
  .filter(d => d.status === CONTROL_STATUSES.live)
  .map(d => d.key);

const debugOnlyKeys = CONTROL_DEFINITIONS
  .filter(d => d.status === CONTROL_STATUSES.debugOnly)
  .map(d => d.key);

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

  it("preserves the values from the control state", () => {
    const state = createControlState();
    state.bloomStrength = 1.5;
    state.volumeColor = "#ff0000";
    const serialized = serializeControls(state, CONTROL_DEFINITIONS);
    expect(serialized.bloomStrength).toBe(1.5);
    expect(serialized.volumeColor).toBe("#ff0000");
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

  it("strips unknown keys not in the schema", () => {
    const raw = { unknownFutureProp: 42, anotherStaleKey: "foo" };
    const result = deserializeControls(raw, CONTROL_DEFINITIONS);
    expect(result).not.toHaveProperty("unknownFutureProp");
    expect(result).not.toHaveProperty("anotherStaleKey");
  });

  it("falls back to default when the stored type does not match", () => {
    const bloomDef = CONTROL_DEFINITIONS.find(d => d.key === "bloomStrength");
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
    const particleSpeedDef = CONTROL_DEFINITIONS.find(d => d.key === "particleSpeed");
    expect(result.particleSpeed).toBe(particleSpeedDef.defaultValue);
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
