import { describe, expect, it } from "vitest";
import {
  AUTOMATABLE_CONTROL_KEYS,
  AUTOMATION_CONTROL_SCHEMA_VERSION,
  createParameterAutomationOscQueryHostInfo,
  createParameterAutomationOscQueryTree,
  findParameterAutomationOscQueryNode,
  getAutomatableControlDefinitions,
  mapAutomationValueToMidi,
  mapAutomationValueToOscArgs,
  normalizeAutomationValue,
  normalizeMidiAutomationCommand,
  normalizeOscAutomationCommand,
} from "./automation.js";
import {
  CONTROL_DEFINITIONS,
  CONTROL_SURFACES,
  CONTROL_STATUSES,
  LISTENER_CONTROL_SURFACES,
  PERFORMER_CONTROL_SURFACES,
  SHARED_CONTROL_SURFACES,
} from "./schema.js";

const EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS = [
  "renderQualityPreset",
  "customTargetFps",
  "performanceHudEnabled",
  "outputBackgroundColor",
  "volumeShape",
  "boundaryMode",
  "densityGain",
  "laserDeflectionGain",
  "raymarchSteps",
  "colorMode",
  "volumeColor",
  "surfaceColor",
  "spectralChroma",
  "holographicIntensity",
  "holographicFresnelPower",
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "rotationMode",
  "rotationSpeed",
  "motionAmount",
  "patternPersistenceSeconds",
  "idleLogoIntensity",
  "idleLogoSize",
  "idleLogoColor",
  "idleLogoRotationMode",
  "idleLogoRotationSpeed",
];
const EXPECTED_V7_PERFORMER_AUTOMATABLE_CONTROL_KEYS =
  EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS.filter(
    (key) => key !== "outputBackgroundColor",
  );

function getDefinition(key) {
  return CONTROL_DEFINITIONS.find((definition) => definition.key === key);
}

describe("parameter automation registry", () => {
  it("publishes the exact v8 cross-surface union", () => {
    const automatableDefinitions = getAutomatableControlDefinitions();
    const automatableKeys = automatableDefinitions.map(
      (definition) => definition.key,
    );

    expect(AUTOMATION_CONTROL_SCHEMA_VERSION).toBe(8);
    expect(AUTOMATABLE_CONTROL_KEYS).toEqual(
      EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS,
    );
    expect(automatableKeys).toEqual(AUTOMATABLE_CONTROL_KEYS);
    for (const key of AUTOMATABLE_CONTROL_KEYS) {
      const definition = getDefinition(key);
      expect(definition, key).toBeTruthy();
      expect(definition.status, key).toBe(CONTROL_STATUSES.live);
      expect(definition.sidebarHidden, key).not.toBe(true);
      expect(definition.publicReferenceHidden, key).not.toBe(true);
    }
  });

  it("treats omitted and null surfaces as the exact cross-surface union", () => {
    const omittedKeys = getAutomatableControlDefinitions().map(
      (definition) => definition.key,
    );
    const nullKeys = getAutomatableControlDefinitions(CONTROL_DEFINITIONS, {
      surface: null,
    }).map((definition) => definition.key);

    expect(omittedKeys).toEqual(
      EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS,
    );
    expect(nullKeys).toEqual(
      EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS,
    );
  });

  it("unions Listener-only, Performer-only, and shared candidates", () => {
    const createDefinition = (key, surfaces, controlOrder) => ({
      key,
      defaultValue: false,
      status: CONTROL_STATUSES.live,
      groupOrder: 10,
      controlOrder,
      surfaces,
    });
    const definitions = [
      createDefinition("listenerOnly", LISTENER_CONTROL_SURFACES, 10),
      createDefinition("performerOnly", PERFORMER_CONTROL_SURFACES, 20),
      createDefinition("shared", SHARED_CONTROL_SURFACES, 30),
    ];
    const keysForSurface = (surface) =>
      getAutomatableControlDefinitions(definitions, { surface }).map(
        (definition) => definition.key,
      );

    expect(
      getAutomatableControlDefinitions(definitions).map(({ key }) => key),
    ).toEqual(["listenerOnly", "performerOnly", "shared"]);
    expect(keysForSurface(null)).toEqual([
      "listenerOnly",
      "performerOnly",
      "shared",
    ]);
    expect(keysForSurface(CONTROL_SURFACES.listener)).toEqual([
      "listenerOnly",
      "shared",
    ]);
    expect(keysForSurface(CONTROL_SURFACES.performer)).toEqual([
      "performerOnly",
      "shared",
    ]);
  });

  it("publishes exact Listener and Performer surface projections", () => {
    const listenerKeys = getAutomatableControlDefinitions(CONTROL_DEFINITIONS, {
      surface: CONTROL_SURFACES.listener,
    }).map((definition) => definition.key);
    const performerKeys = getAutomatableControlDefinitions(
      CONTROL_DEFINITIONS,
      { surface: CONTROL_SURFACES.performer },
    ).map((definition) => definition.key);

    expect(listenerKeys).toEqual(
      EXPECTED_V7_CROSS_SURFACE_AUTOMATABLE_CONTROL_KEYS,
    );
    expect(performerKeys).toEqual(
      EXPECTED_V7_PERFORMER_AUTOMATABLE_CONTROL_KEYS,
    );
  });

  it("throws TypeError for an invalid non-null surface", () => {
    expect(() =>
      getAutomatableControlDefinitions(CONTROL_DEFINITIONS, {
        surface: "desktop",
      }),
    ).toThrow(TypeError);
  });

  it("keeps reasoned supported and unsupported exclusions private", () => {
    const definitions = [
      {
        key: "supportedExcluded",
        defaultValue: false,
        status: CONTROL_STATUSES.live,
        groupOrder: 10,
        controlOrder: 10,
        surfaces: SHARED_CONTROL_SURFACES,
        remoteControl: { excludedReason: "operator-only" },
      },
      {
        key: "unsupportedExcluded",
        defaultValue: "opaque-contract",
        status: CONTROL_STATUSES.live,
        groupOrder: 10,
        controlOrder: 20,
        surfaces: SHARED_CONTROL_SURFACES,
        remoteControl: { excludedReason: "unsupported-value-contract" },
      },
    ];

    expect(getAutomatableControlDefinitions(definitions)).toEqual([]);
  });

  it("keeps hidden and debug-only controls out of the public registry", () => {
    const automatableKeys = new Set(AUTOMATABLE_CONTROL_KEYS);

    expect(automatableKeys.has("backgroundColor")).toBe(false);
    expect(automatableKeys.has("visualizationMethod")).toBe(false);
    expect(automatableKeys.has("cameraLocked")).toBe(false);
    expect(automatableKeys.has("auditEnabled")).toBe(false);
    expect(automatableKeys.has("smaaEnabled")).toBe(false);
    expect(automatableKeys.has("carrierCoreFwhmWorld")).toBe(false);
  });

  it("projects descriptor changes consistently through OSCQuery, OSC, and MIDI", () => {
    const definitions = CONTROL_DEFINITIONS.map((definition) =>
      definition.key === "densityGain"
        ? {
            ...definition,
            binding: { ...definition.binding, max: 9 },
          }
        : definition,
    );
    const oscQuery = createParameterAutomationOscQueryTree({ definitions });
    const oscResult = normalizeOscAutomationCommand(
      {
        address: "/baryon/control/densityGain",
        args: [{ type: "f", value: 10 }],
      },
      { definitions },
    );
    const midiResult = normalizeMidiAutomationCommand(
      {
        channel: 1,
        controller: 21,
        key: "densityGain",
        mode: "scalar",
      },
      {
        type: "controlchange",
        channel: 1,
        controller: 21,
        value: 127,
      },
      { definitions },
    );

    expect(
      oscQuery.CONTENTS.baryon.CONTENTS.control.CONTENTS.densityGain.RANGE,
    ).toEqual([{ MIN: 0.1, MAX: 9 }]);
    expect(oscResult).toMatchObject({
      ok: true,
      command: { key: "densityGain", value: 9 },
    });
    expect(midiResult).toMatchObject({
      ok: true,
      command: { key: "densityGain", value: 9 },
    });
  });
});

describe("parameter automation MIDI output projection", () => {
  it("projects mapped scalar, boolean, enum, and color values back to MIDI", () => {
    expect(
      mapAutomationValueToMidi(
        getDefinition("densityGain"),
        { min: 0.1, max: 3 },
        3,
      ),
    ).toBe(127);
    expect(
      mapAutomationValueToMidi(getDefinition("bloomEnabled"), {}, true),
    ).toBe(127);

    const rotationDefinition = getDefinition("rotationMode");
    const rotationValues = Object.values(rotationDefinition.binding.options);
    const rotationValue = rotationValues.at(-1);
    const rotationMidiValue = mapAutomationValueToMidi(
      rotationDefinition,
      {},
      rotationValue,
    );
    const rotationRoundTrip = normalizeMidiAutomationCommand(
      {
        channel: 1,
        controller: 21,
        key: "rotationMode",
        mode: "enum",
      },
      {
        type: "controlchange",
        channel: 1,
        controller: 21,
        value: rotationMidiValue,
      },
    );
    expect(rotationRoundTrip).toMatchObject({
      ok: true,
      command: { value: rotationValue },
    });

    expect(
      mapAutomationValueToMidi(
        getDefinition("surfaceColor"),
        { colorComponent: "hue" },
        "#00ff00",
      ),
    ).toBe(43);
    expect(
      mapAutomationValueToMidi(
        getDefinition("surfaceColor"),
        { colorComponent: "saturation" },
        "#00ff00",
      ),
    ).toBe(127);
    expect(
      mapAutomationValueToMidi(
        getDefinition("surfaceColor"),
        { colorComponent: "brightness" },
        "#00ff00",
      ),
    ).toBe(127);
  });
});

describe("parameter automation OSC output projection", () => {
  it("projects scalar, boolean, enum, and color values to canonical OSC args", () => {
    expect(
      mapAutomationValueToOscArgs(getDefinition("densityGain"), 1.25),
    ).toEqual([{ type: "f", value: 1.25 }]);
    expect(
      mapAutomationValueToOscArgs(getDefinition("bloomEnabled"), true),
    ).toEqual([{ type: "i", value: 1 }]);
    expect(
      mapAutomationValueToOscArgs(getDefinition("rotationMode"), "manual"),
    ).toEqual([{ type: "s", value: "manual" }]);
    expect(
      mapAutomationValueToOscArgs(getDefinition("surfaceColor"), "#00ff80"),
    ).toEqual([
      { type: "f", value: 0 },
      { type: "f", value: 1 },
      { type: "f", value: 128 / 255 },
    ]);
    expect(
      mapAutomationValueToOscArgs(getDefinition("densityGain"), "invalid"),
    ).toBeNull();
  });
});

describe("parameter automation OSCQuery projection", () => {
  it("projects the automatable registry into the OSC address tree", () => {
    const tree = createParameterAutomationOscQueryTree();
    const controlContents = tree.CONTENTS.baryon.CONTENTS.control.CONTENTS;

    expect(Object.keys(controlContents)).toEqual(AUTOMATABLE_CONTROL_KEYS);
    expect(controlContents).not.toHaveProperty("carrierCoreFwhmWorld");
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
    expect(controlContents.spectralChroma).toMatchObject({
      TYPE: "f",
      RANGE: [{ MIN: 0, MAX: 1 }],
      BARYON_PARAMETER: { valueKind: "scalar" },
    });
    expect(controlContents).not.toHaveProperty("spectralMix");
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
  it("canonicalizes OSC float32 noise without discarding fractional values", () => {
    expect(
      normalizeAutomationValue(getDefinition("patternPersistenceSeconds"), [
        { type: "f", value: 0.4000000059604645 },
      ]),
    ).toEqual({ ok: true, value: 0.4, valueKind: "scalar" });
    expect(
      normalizeAutomationValue(getDefinition("patternPersistenceSeconds"), [
        { type: "f", value: 0.07100000232458115 },
      ]),
    ).toEqual({ ok: true, value: 0.071, valueKind: "scalar" });
  });

  it("clamps scalars, preserves fractional values, and quantizes integer steps", () => {
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
    expect(
      normalizeAutomationValue(getDefinition("holographicFresnelPower"), [
        { type: "f", value: 24 },
      ]),
    ).toEqual({ ok: true, value: 24, valueKind: "scalar" });
    expect(
      normalizeAutomationValue(getDefinition("holographicFresnelPower"), [
        { type: "f", value: 40 },
      ]),
    ).toEqual({ ok: true, value: 32, valueKind: "scalar" });
    expect(
      normalizeAutomationValue(getDefinition("patternPersistenceSeconds"), [
        { type: "f", value: 0.071 },
      ]),
    ).toEqual({ ok: true, value: 0.071, valueKind: "scalar" });
    expect(
      normalizeAutomationValue(getDefinition("idleLogoRotationSpeed"), [
        { type: "f", value: -4.123 },
      ]),
    ).toEqual({ ok: true, value: -4.123, valueKind: "scalar" });
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
        schemaVersion: 8,
        transport: "osc",
        key: "densityGain",
        value: 1.8,
        persistMode: "none",
      },
    });
  });

  it.each([
    ["volumeShape", { type: "s", value: "cube" }, "cube"],
    ["patternPersistenceSeconds", { type: "f", value: 9 }, 2],
    ["idleLogoRotationMode", { type: "s", value: "off" }, "off"],
    ["idleLogoRotationSpeed", { type: "f", value: -20 }, -12],
  ])("accepts the v8 OSC control %s", (key, arg, expectedValue) => {
    expect(
      normalizeOscAutomationCommand({
        address: `/baryon/control/${key}`,
        args: [arg],
      }),
    ).toMatchObject({
      ok: true,
      command: {
        schemaVersion: 8,
        transport: "osc",
        key,
        value: expectedValue,
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
        schemaVersion: 8,
        transport: "midi",
        key: "densityGain",
        persistMode: "none",
      },
    });
    expect(result.command.value).toBeCloseTo(2.07);
  });

  it("maps the MIDI center detent exactly to zero for bipolar controls", () => {
    const mapping = {
      inputId: "device-a",
      channel: 1,
      controller: 21,
      key: "idleLogoRotationSpeed",
      mode: "scalar",
    };
    const midiEvent = {
      type: "controlchange",
      inputId: "device-a",
      channel: 1,
      controller: 21,
    };

    expect(
      normalizeMidiAutomationCommand(mapping, { ...midiEvent, value: 0 })
        .command.value,
    ).toBe(-12);
    expect(
      normalizeMidiAutomationCommand(mapping, { ...midiEvent, value: 64 })
        .command.value,
    ).toBe(0);
    expect(
      normalizeMidiAutomationCommand(mapping, { ...midiEvent, value: 127 })
        .command.value,
    ).toBe(12);
  });

  it.each([
    ["volumeShape", "enum", 127, "cube"],
    ["patternPersistenceSeconds", "scalar", 127, 2],
    ["idleLogoRotationMode", "enum", 127, "off"],
    ["idleLogoRotationSpeed", "scalar", 0, -12],
  ])("accepts the v8 MIDI control %s", (key, mode, value, expectedValue) => {
    expect(
      normalizeMidiAutomationCommand(
        {
          inputId: "device-a",
          channel: 1,
          controller: 21,
          key,
          mode,
        },
        {
          type: "controlchange",
          inputId: "device-a",
          channel: 1,
          controller: 21,
          value,
        },
      ),
    ).toMatchObject({
      ok: true,
      command: {
        schemaVersion: 8,
        transport: "midi",
        key,
        value: expectedValue,
      },
    });
  });

  it.each([
    {
      component: "hue",
      currentValue: "#ff0000",
      value: 64,
      expectedValue: "#00ffff",
    },
    {
      component: "saturation",
      currentValue: "#ff0000",
      value: 0,
      expectedValue: "#ffffff",
    },
    {
      component: "brightness",
      currentValue: "#00ff00",
      value: 64,
      expectedValue: "#008100",
    },
  ])(
    "maps a MIDI CC to the $component component while preserving the other color components",
    ({ component, currentValue, value, expectedValue }) => {
      const result = normalizeMidiAutomationCommand(
        {
          inputId: "device-a",
          channel: 1,
          controller: 21,
          key: "volumeColor",
          mode: "color",
          colorComponent: component,
        },
        {
          type: "controlchange",
          inputId: "device-a",
          channel: 1,
          controller: 21,
          value,
        },
        { currentValue },
      );

      expect(result).toMatchObject({
        ok: true,
        valueKind: "color",
        command: {
          transport: "midi",
          key: "volumeColor",
          value: expectedValue,
        },
      });
    },
  );

  it("rejects color MIDI normalization without a valid current color", () => {
    const mapping = {
      channel: 1,
      controller: 21,
      key: "volumeColor",
      mode: "color",
      colorComponent: "hue",
    };
    const midiEvent = {
      type: "controlchange",
      channel: 1,
      controller: 21,
      value: 64,
    };

    expect(normalizeMidiAutomationCommand(mapping, midiEvent)).toMatchObject({
      ok: false,
      reason: "missing-current-value",
    });
    expect(
      normalizeMidiAutomationCommand(mapping, midiEvent, {
        currentValue: "not-a-color",
      }),
    ).toMatchObject({ ok: false, reason: "invalid-current-color" });
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
