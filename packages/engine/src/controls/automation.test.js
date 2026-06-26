import { describe, expect, it } from "vitest";
import {
  AUTOMATABLE_CONTROL_KEYS,
  AUTOMATION_CONTROL_SCHEMA_VERSION,
  createParameterAutomationOscQueryHostInfo,
  createParameterAutomationOscQueryTree,
  findParameterAutomationOscQueryNode,
  getAutomatableControlDefinitions,
  normalizeAutomationValue,
  normalizeMidiAutomationCommand,
  normalizeOscAutomationCommand,
} from "./automation.js";
import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
} from "./schema.js";

function getDefinition(key) {
  return CONTROL_DEFINITIONS.find((definition) => definition.key === key);
}

describe("parameter automation registry", () => {
  it("publishes a versioned explicit allowlist of live public controls", () => {
    const automatableDefinitions = getAutomatableControlDefinitions();
    const automatableKeys = automatableDefinitions.map(
      (definition) => definition.key,
    );

    expect(AUTOMATION_CONTROL_SCHEMA_VERSION).toBe(1);
    expect(automatableKeys).toEqual(AUTOMATABLE_CONTROL_KEYS);
    for (const key of AUTOMATABLE_CONTROL_KEYS) {
      const definition = getDefinition(key);
      expect(definition, key).toBeTruthy();
      expect(definition.status, key).toBe(CONTROL_STATUSES.live);
      expect(definition.sidebarHidden, key).not.toBe(true);
      expect(definition.publicReferenceHidden, key).not.toBe(true);
    }
  });

  it("keeps hidden and debug-only controls out of the public registry", () => {
    const automatableKeys = new Set(AUTOMATABLE_CONTROL_KEYS);

    expect(automatableKeys.has("backgroundColor")).toBe(false);
    expect(automatableKeys.has("visualizationMethod")).toBe(false);
    expect(automatableKeys.has("cameraLocked")).toBe(false);
    expect(automatableKeys.has("auditEnabled")).toBe(false);
    expect(automatableKeys.has("smaaEnabled")).toBe(false);
  });
});

describe("parameter automation OSCQuery projection", () => {
  it("projects the automatable registry into the OSC address tree", () => {
    const tree = createParameterAutomationOscQueryTree();
    const controlContents = tree.CONTENTS.baryon.CONTENTS.control.CONTENTS;

    expect(Object.keys(controlContents)).toEqual(AUTOMATABLE_CONTROL_KEYS);
    expect(controlContents.zeroPointPrecision).toMatchObject({
      FULL_PATH: "/baryon/control/zeroPointPrecision",
      TYPE: "f",
      ACCESS: 2,
      RANGE: [{ MIN: 0.001, MAX: 0.3 }],
      BARYON_PARAMETER: {
        key: "zeroPointPrecision",
        label: "Node Threshold",
        valueKind: "scalar",
      },
    });
    expect(controlContents.bloomEnabled).toMatchObject({
      TYPE: "i",
      RANGE: [{ VALS: [0, 1] }],
      BARYON_PARAMETER: { valueKind: "boolean" },
    });
    expect(controlContents.volumeColor).toMatchObject({
      TYPE: "fff",
      RANGE: [
        { MIN: 0, MAX: 1 },
        { MIN: 0, MAX: 1 },
        { MIN: 0, MAX: 1 },
      ],
      BARYON_PARAMETER: { valueKind: "color" },
    });
  });

  it("finds OSCQuery nodes by path and publishes host info", () => {
    expect(
      findParameterAutomationOscQueryNode("/baryon/control/densityGain"),
    ).toMatchObject({
      FULL_PATH: "/baryon/control/densityGain",
      TYPE: "f",
    });
    expect(
      createParameterAutomationOscQueryHostInfo({
        oscIp: "127.0.0.1",
        oscPort: 9001,
      }),
    ).toMatchObject({
      NAME: "Baryon Parameter Automation",
      OSC_IP: "127.0.0.1",
      OSC_PORT: 9001,
      OSC_TRANSPORT: "UDP",
      EXTENSIONS: {
        ACCESS: true,
        RANGE: true,
        DESCRIPTION: true,
        TAGS: true,
        BARYON_PARAMETER: true,
      },
    });
  });
});

describe("normalizeAutomationValue", () => {
  it("clamps scalar values and quantizes integer-step controls", () => {
    expect(
      normalizeAutomationValue(getDefinition("densityGain"), [
        { type: "f", value: 10 },
      ]),
    ).toEqual({ ok: true, value: 4, valueKind: "scalar" });
    expect(
      normalizeAutomationValue(getDefinition("raymarchSteps"), [
        { type: "f", value: 32.7 },
      ]),
    ).toEqual({ ok: true, value: 33, valueKind: "scalar" });
  });

  it("normalizes booleans from integer args only", () => {
    expect(
      normalizeAutomationValue(getDefinition("bloomEnabled"), [
        { type: "i", value: 1 },
      ]),
    ).toEqual({ ok: true, value: true, valueKind: "boolean" });
    expect(
      normalizeAutomationValue(getDefinition("bloomEnabled"), [
        { type: "s", value: "true" },
      ]).ok,
    ).toBe(false);
  });

  it("accepts exact enum values and rejects labels", () => {
    expect(
      normalizeAutomationValue(getDefinition("colorMode"), [
        { type: "s", value: "spectral" },
      ]),
    ).toEqual({ ok: true, value: "spectral", valueKind: "enum" });
    expect(
      normalizeAutomationValue(getDefinition("colorMode"), [
        { type: "s", value: "Spectral" },
      ]).ok,
    ).toBe(false);
  });

  it("converts normalized RGB args to CSS hex", () => {
    expect(
      normalizeAutomationValue(getDefinition("volumeColor"), [
        { type: "f", value: 0 },
        { type: "f", value: 0.5 },
        { type: "f", value: 1 },
      ]),
    ).toEqual({ ok: true, value: "#0080ff", valueKind: "color" });
  });
});

describe("normalizeOscAutomationCommand", () => {
  it("normalizes canonical OSC control messages", () => {
    const result = normalizeOscAutomationCommand({
      address: "/baryon/control/densityGain",
      args: [{ type: "f", value: 1.8 }],
    });

    expect(result).toMatchObject({
      ok: true,
      command: {
        schemaVersion: 1,
        transport: "osc",
        key: "densityGain",
        value: 1.8,
        persistMode: "none",
      },
    });
  });

  it("rejects unknown and malformed OSC addresses", () => {
    expect(
      normalizeOscAutomationCommand({
        address: "/baryon/control/modalCoefficient",
        args: [{ type: "f", value: 1 }],
      }),
    ).toMatchObject({ ok: false, reason: "unknown-key" });
    expect(
      normalizeOscAutomationCommand({
        address: "/baryon/control/densityGain/extra",
        args: [{ type: "f", value: 1 }],
      }),
    ).toMatchObject({ ok: false, reason: "invalid-address" });
  });
});

describe("normalizeMidiAutomationCommand", () => {
  it("maps a MIDI CC value through the shared command contract", () => {
    const result = normalizeMidiAutomationCommand(
      {
        inputId: "device-a",
        channel: 1,
        controller: 21,
        key: "densityGain",
        mode: "scalar",
        min: 0.1,
        max: 4,
      },
      {
        type: "controlchange",
        inputId: "device-a",
        channel: 1,
        controller: 21,
        value: 64,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      command: {
        schemaVersion: 1,
        transport: "midi",
        key: "densityGain",
        persistMode: "none",
      },
    });
    expect(result.command.value).toBeCloseTo(2.07);
  });

  it("rejects unmapped or mismatched MIDI CC messages", () => {
    expect(
      normalizeMidiAutomationCommand(null, {
        type: "controlchange",
        channel: 1,
        controller: 21,
        value: 64,
      }),
    ).toMatchObject({ ok: false, reason: "unmapped-midi-control" });
    expect(
      normalizeMidiAutomationCommand(
        {
          inputId: "device-a",
          channel: 1,
          controller: 21,
          key: "densityGain",
          mode: "scalar",
        },
        {
          type: "controlchange",
          inputId: "device-a",
          channel: 1,
          controller: 22,
          value: 64,
        },
      ),
    ).toMatchObject({ ok: false, reason: "unmapped-midi-control" });
  });
});
