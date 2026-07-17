import { CONTROL_DEFINITIONS, CONTROL_STATUSES } from "./schema.js";

export const AUTOMATION_CONTROL_SCHEMA_VERSION = 4;

export const AUTOMATABLE_CONTROL_KEYS = Object.freeze([
  "renderQualityPreset",
  "customTargetFps",
  "performanceHudEnabled",
  "outputMode",
  "outputBackgroundColor",
  "boundaryMode",
  "densityGain",
  "laserDeflectionGain",
  "raymarchSteps",
  "colorMode",
  "volumeColor",
  "surfaceColor",
  "spectralMix",
  "holographicIntensity",
  "holographicFresnelPower",
  "rotationMode",
  "rotationSpeed",
  "motionAmount",
  "bloomEnabled",
  "bloomStrength",
  "bloomRadius",
  "bloomThreshold",
  "idleLogoIntensity",
  "idleLogoSize",
  "idleLogoColor",
]);

const AUTOMATABLE_CONTROL_KEY_SET = new Set(AUTOMATABLE_CONTROL_KEYS);
const OSC_CONTROL_PREFIX = "/baryon/control/";
const OSC_QUERY_CONTROL_ROOT = "/baryon/control";
const MIDI_MIN_VALUE = 0;
const MIDI_MAX_VALUE = 127;

function createFailure(reason, detail = null) {
  return {
    ok: false,
    reason,
    detail,
  };
}

function clamp(
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
) {
  return Math.min(max, Math.max(min, value));
}

function getDefinitionValueKind(definition) {
  if (!definition || typeof definition !== "object") {
    return null;
  }
  if (definition.binding?.view === "color") {
    return "color";
  }
  if (
    definition.binding?.options &&
    typeof definition.binding.options === "object"
  ) {
    return "enum";
  }
  if (typeof definition.defaultValue === "boolean") {
    return "boolean";
  }
  if (
    typeof definition.defaultValue === "number" ||
    typeof definition.binding?.min === "number" ||
    typeof definition.binding?.max === "number"
  ) {
    return "scalar";
  }
  return null;
}

function readArgValue(arg) {
  return arg && typeof arg === "object" && "value" in arg ? arg.value : arg;
}

function readArgType(arg) {
  return arg && typeof arg === "object" && typeof arg.type === "string"
    ? arg.type
    : null;
}

function normalizeArgs(rawArgs) {
  if (Array.isArray(rawArgs)) {
    return rawArgs;
  }
  if (rawArgs == null) {
    return [];
  }
  return [rawArgs];
}

function isNumericArg(arg) {
  const type = readArgType(arg);
  return type == null || type === "f" || type === "i" || type === "d";
}

function isIntegerArg(arg) {
  const type = readArgType(arg);
  return type == null || type === "i";
}

function readFiniteNumber(arg) {
  if (!isNumericArg(arg)) {
    return null;
  }
  const value = Number(readArgValue(arg));
  return Number.isFinite(value) ? value : null;
}

function normalizeScalarValue(definition, args) {
  if (args.length !== 1) {
    return createFailure("invalid-arg-count");
  }
  const rawValue = readFiniteNumber(args[0]);
  if (rawValue == null) {
    return createFailure("non-finite-value");
  }

  const min =
    typeof definition.binding?.min === "number"
      ? definition.binding.min
      : Number.NEGATIVE_INFINITY;
  const max =
    typeof definition.binding?.max === "number"
      ? definition.binding.max
      : Number.POSITIVE_INFINITY;
  let value = clamp(rawValue, min, max);
  const step = definition.binding?.step;
  if (Number.isInteger(step) && step >= 1) {
    value = clamp(Math.round(value / step) * step, min, max);
  }
  return { ok: true, value, valueKind: "scalar" };
}

function normalizeBooleanValue(args) {
  if (args.length !== 1) {
    return createFailure("invalid-arg-count");
  }
  if (!isIntegerArg(args[0])) {
    return createFailure("invalid-boolean-arg");
  }
  const value = Number(readArgValue(args[0]));
  if (!Number.isFinite(value)) {
    return createFailure("non-finite-value");
  }
  return { ok: true, value: value !== 0, valueKind: "boolean" };
}

function normalizeEnumValue(definition, args) {
  if (args.length !== 1) {
    return createFailure("invalid-arg-count");
  }
  const type = readArgType(args[0]);
  if (type != null && type !== "s") {
    return createFailure("invalid-enum-arg");
  }
  const value = readArgValue(args[0]);
  const allowedValues = Object.values(definition.binding?.options ?? {});
  if (!allowedValues.includes(value)) {
    return createFailure("invalid-enum-value");
  }
  return { ok: true, value, valueKind: "enum" };
}

function toHexByte(value) {
  return Math.round(clamp(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function normalizeColorValue(args) {
  if (args.length !== 3) {
    return createFailure("invalid-arg-count");
  }
  const channels = args.map(readFiniteNumber);
  if (channels.some((value) => value == null)) {
    return createFailure("non-finite-value");
  }
  return {
    ok: true,
    value: `#${channels.map(toHexByte).join("")}`,
    valueKind: "color",
  };
}

function findControlDefinition(key, definitions = CONTROL_DEFINITIONS) {
  return definitions.find((definition) => definition.key === key) ?? null;
}

export function getAutomatableControlDefinitions(
  definitions = CONTROL_DEFINITIONS,
) {
  return AUTOMATABLE_CONTROL_KEYS.map((key) =>
    findControlDefinition(key, definitions),
  ).filter(
    (definition) =>
      definition &&
      definition.status === CONTROL_STATUSES.live &&
      definition.sidebarHidden !== true &&
      definition.publicReferenceHidden !== true &&
      getDefinitionValueKind(definition) != null,
  );
}

function createOscQueryContainerNode(fullPath, description) {
  return {
    FULL_PATH: fullPath,
    DESCRIPTION: description,
    CONTENTS: {},
  };
}

function getOscQueryType(valueKind) {
  if (valueKind === "scalar") {
    return "f";
  }
  if (valueKind === "boolean") {
    return "i";
  }
  if (valueKind === "enum") {
    return "s";
  }
  if (valueKind === "color") {
    return "fff";
  }
  return "";
}

function getOscQueryRange(definition, valueKind) {
  if (valueKind === "scalar") {
    const range = {};
    if (typeof definition.binding?.min === "number") {
      range.MIN = definition.binding.min;
    }
    if (typeof definition.binding?.max === "number") {
      range.MAX = definition.binding.max;
    }
    return [range];
  }
  if (valueKind === "boolean") {
    return [{ VALS: [0, 1] }];
  }
  if (valueKind === "enum") {
    return [{ VALS: Object.values(definition.binding?.options ?? {}) }];
  }
  if (valueKind === "color") {
    return [
      { MIN: 0, MAX: 1 },
      { MIN: 0, MAX: 1 },
      { MIN: 0, MAX: 1 },
    ];
  }
  return [];
}

function createOscQueryTags(definition, valueKind) {
  return [
    "baryon",
    "parameter-automation",
    valueKind,
    String(definition.group ?? definition.folder ?? "control")
      .toLowerCase()
      .replaceAll(" ", "-"),
  ].filter(Boolean);
}

function createOscQueryControlNode(definition) {
  const valueKind = getDefinitionValueKind(definition);
  const range = getOscQueryRange(definition, valueKind);

  return {
    FULL_PATH: `${OSC_CONTROL_PREFIX}${definition.key}`,
    TYPE: getOscQueryType(valueKind),
    ACCESS: 2,
    RANGE: range,
    DESCRIPTION: definition.title ?? definition.label ?? definition.key,
    TAGS: createOscQueryTags(definition, valueKind),
    BARYON_PARAMETER: {
      key: definition.key,
      label: definition.label ?? definition.key,
      group: definition.group ?? definition.folder ?? null,
      valueKind,
      defaultValue: definition.defaultValue,
    },
  };
}

export function createParameterAutomationOscQueryTree({
  definitions = CONTROL_DEFINITIONS,
} = {}) {
  const root = createOscQueryContainerNode(
    "/",
    "Baryon OSC parameter automation address space.",
  );
  const baryon = createOscQueryContainerNode(
    "/baryon",
    "Baryon OSC endpoints.",
  );
  const control = createOscQueryContainerNode(
    OSC_QUERY_CONTROL_ROOT,
    "Writable Baryon parameter automation controls.",
  );

  for (const definition of getAutomatableControlDefinitions(definitions)) {
    control.CONTENTS[definition.key] = createOscQueryControlNode(definition);
  }

  baryon.CONTENTS.control = control;
  root.CONTENTS.baryon = baryon;
  return root;
}

export function createParameterAutomationOscQueryHostInfo({
  name = "Baryon Parameter Automation",
  oscIp = "127.0.0.1",
  oscPort = 9001,
  oscTransport = "UDP",
} = {}) {
  return {
    NAME: name,
    OSC_IP: oscIp,
    OSC_PORT: oscPort,
    OSC_TRANSPORT: oscTransport,
    EXTENSIONS: {
      ACCESS: true,
      RANGE: true,
      DESCRIPTION: true,
      TAGS: true,
      BARYON_PARAMETER: true,
    },
  };
}

export function findParameterAutomationOscQueryNode(path = "/", options = {}) {
  const tree = createParameterAutomationOscQueryTree(options);
  const normalizedPath =
    typeof path === "string" && path.trim() ? path.trim() : "/";
  if (normalizedPath === "/") {
    return tree;
  }

  const segments = normalizedPath
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean);
  let node = tree;
  for (const segment of segments) {
    node = node.CONTENTS?.[segment];
    if (!node) {
      return null;
    }
  }
  return node;
}

export function normalizeAutomationValue(definition, rawArgs) {
  const valueKind = getDefinitionValueKind(definition);
  const args = normalizeArgs(rawArgs);

  if (valueKind === "scalar") {
    return normalizeScalarValue(definition, args);
  }
  if (valueKind === "boolean") {
    return normalizeBooleanValue(args);
  }
  if (valueKind === "enum") {
    return normalizeEnumValue(definition, args);
  }
  if (valueKind === "color") {
    return normalizeColorValue(args);
  }
  return createFailure("unsupported-value-kind");
}

function readOscControlKey(address) {
  if (typeof address !== "string" || !address.startsWith(OSC_CONTROL_PREFIX)) {
    return null;
  }
  const key = address.slice(OSC_CONTROL_PREFIX.length);
  if (!key || key.includes("/")) {
    return null;
  }
  return key;
}

function createAutomationCommand({
  key,
  value,
  transport,
  sequence = 0,
  persistMode = "none",
  receivedAtMs = 0,
}) {
  return {
    schemaVersion: AUTOMATION_CONTROL_SCHEMA_VERSION,
    sequence,
    transport,
    key,
    value,
    persistMode:
      persistMode === "immediate" || persistMode === "debounced"
        ? persistMode
        : "none",
    receivedAtMs,
  };
}

export function normalizeOscAutomationCommand(
  packet,
  {
    definitions = CONTROL_DEFINITIONS,
    sequence = 0,
    persistMode = "none",
    receivedAtMs = 0,
  } = {},
) {
  const key = readOscControlKey(packet?.address);
  if (!key) {
    return createFailure("invalid-address");
  }
  if (!AUTOMATABLE_CONTROL_KEY_SET.has(key)) {
    return createFailure("unknown-key");
  }
  const definition = findControlDefinition(key, definitions);
  if (!definition) {
    return createFailure("unknown-key");
  }

  const normalized = normalizeAutomationValue(definition, packet?.args);
  if (!normalized.ok) {
    return normalized;
  }
  return {
    ok: true,
    command: createAutomationCommand({
      key,
      value: normalized.value,
      transport: "osc",
      sequence,
      persistMode,
      receivedAtMs,
    }),
    valueKind: normalized.valueKind,
  };
}

function isMatchingMidiMapping(mapping, midiEvent) {
  if (!mapping || !midiEvent || midiEvent.type !== "controlchange") {
    return false;
  }
  if (
    mapping.inputId != null &&
    midiEvent.inputId != null &&
    mapping.inputId !== midiEvent.inputId
  ) {
    return false;
  }
  return (
    Number(mapping.channel) === Number(midiEvent.channel) &&
    Number(mapping.controller) === Number(midiEvent.controller)
  );
}

function scaleMidiValue(value, min, max) {
  const bounded = clamp(value, MIDI_MIN_VALUE, MIDI_MAX_VALUE);
  return min + (bounded / MIDI_MAX_VALUE) * (max - min);
}

function normalizeMidiMappedValue(definition, mapping, midiEvent) {
  const rawValue = Number(midiEvent?.value);
  if (!Number.isFinite(rawValue)) {
    return createFailure("non-finite-value");
  }
  const valueKind = getDefinitionValueKind(definition);
  if (valueKind === "scalar") {
    const min =
      typeof mapping.min === "number"
        ? mapping.min
        : typeof definition.binding?.min === "number"
          ? definition.binding.min
          : 0;
    const max =
      typeof mapping.max === "number"
        ? mapping.max
        : typeof definition.binding?.max === "number"
          ? definition.binding.max
          : 1;
    return normalizeScalarValue(definition, [
      scaleMidiValue(rawValue, min, max),
    ]);
  }
  if (valueKind === "boolean") {
    const threshold =
      typeof mapping.threshold === "number" ? mapping.threshold : 64;
    return {
      ok: true,
      value: rawValue >= threshold,
      valueKind: "boolean",
    };
  }
  if (valueKind === "enum") {
    const allowedValues = Object.values(definition.binding?.options ?? {});
    if (allowedValues.length === 0) {
      return createFailure("invalid-enum-value");
    }
    const index = clamp(
      Math.floor((clamp(rawValue, 0, 127) / 128) * allowedValues.length),
      0,
      allowedValues.length - 1,
    );
    return {
      ok: true,
      value: allowedValues[index],
      valueKind: "enum",
    };
  }
  return createFailure("unsupported-midi-value-kind");
}

export function normalizeMidiAutomationCommand(
  mapping,
  midiEvent,
  {
    definitions = CONTROL_DEFINITIONS,
    sequence = 0,
    persistMode = "none",
    receivedAtMs = 0,
  } = {},
) {
  if (!isMatchingMidiMapping(mapping, midiEvent)) {
    return createFailure("unmapped-midi-control");
  }
  const key = mapping.key;
  if (!AUTOMATABLE_CONTROL_KEY_SET.has(key)) {
    return createFailure("unknown-key");
  }
  const definition = findControlDefinition(key, definitions);
  if (!definition) {
    return createFailure("unknown-key");
  }
  const normalized = normalizeMidiMappedValue(definition, mapping, midiEvent);
  if (!normalized.ok) {
    return normalized;
  }
  return {
    ok: true,
    command: createAutomationCommand({
      key,
      value: normalized.value,
      transport: "midi",
      sequence,
      persistMode,
      receivedAtMs,
    }),
    valueKind: normalized.valueKind,
  };
}
