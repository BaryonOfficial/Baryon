import {
  CONTROL_DEFINITIONS,
  CONTROL_STATUSES,
  isCanonicalControlSurfaceSet,
  isControlSurface,
} from "./schema.js";

export const AUTOMATION_CONTROL_SCHEMA_VERSION = 8;
const OSC_CONTROL_PREFIX = "/baryon/control/";
const OSC_QUERY_CONTROL_ROOT = "/baryon/control";
const MIDI_MIN_VALUE = 0;
const MIDI_MAX_VALUE = 127;
export const PARAMETER_AUTOMATION_MIDI_COLOR_COMPONENTS = Object.freeze([
  "hue",
  "saturation",
  "brightness",
]);
const MIDI_COLOR_COMPONENT_SET = new Set(
  PARAMETER_AUTOMATION_MIDI_COLOR_COMPONENTS,
);

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

/**
 * @returns {"scalar" | "boolean" | "enum" | "color" | null}
 */
export function getParameterAutomationControlValueKind(definition) {
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

function canonicalizeOscFloat32(value) {
  const float32Value = Math.fround(value);
  // Nine significant decimal digits are sufficient to round-trip a float32.
  for (
    let significantDigits = 1;
    significantDigits <= 9;
    significantDigits += 1
  ) {
    const candidate = Number(value.toPrecision(significantDigits));
    if (Math.fround(candidate) === float32Value) {
      return candidate;
    }
  }
  return value;
}

function readFiniteNumber(arg) {
  if (!isNumericArg(arg)) {
    return null;
  }
  const value = Number(readArgValue(arg));
  if (!Number.isFinite(value)) {
    return null;
  }
  return readArgType(arg) === "f" ? canonicalizeOscFloat32(value) : value;
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

/** @returns {[number, number, number] | null} */
function parseHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    return null;
  }
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function rgbToHsv([red, green, blue]) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue = (((hue / 6) % 1) + 1) % 1;
  }

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    brightness: max,
  };
}

export function mapAutomationValueToOscArgs(definition, value) {
  const valueKind = getParameterAutomationControlValueKind(definition);
  if (valueKind === "scalar") {
    const normalized = normalizeScalarValue(definition, [value]);
    return normalized.ok ? [{ type: "f", value: normalized.value }] : null;
  }
  if (valueKind === "boolean") {
    return typeof value === "boolean"
      ? [{ type: "i", value: value ? 1 : 0 }]
      : null;
  }
  if (valueKind === "enum") {
    const allowedValues = Object.values(definition.binding?.options ?? {});
    return allowedValues.includes(value) ? [{ type: "s", value }] : null;
  }
  if (valueKind === "color") {
    const rgb = parseHexColor(value);
    return rgb?.map((channel) => ({ type: "f", value: channel })) ?? null;
  }
  return null;
}

function clampMidiValue(value) {
  return Math.round(clamp(value, MIDI_MIN_VALUE, MIDI_MAX_VALUE));
}

export function mapAutomationValueToMidi(definition, mapping, value) {
  const valueKind = getParameterAutomationControlValueKind(definition);
  if (valueKind === "boolean") {
    if (value === true) {
      return MIDI_MAX_VALUE;
    }
    if (value === false) {
      return MIDI_MIN_VALUE;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? numericValue === 0
        ? MIDI_MIN_VALUE
        : MIDI_MAX_VALUE
      : null;
  }
  if (valueKind === "enum") {
    const allowedValues = Object.values(definition.binding?.options ?? {});
    const index = allowedValues.indexOf(value);
    if (index < 0) {
      return null;
    }
    return clampMidiValue(((index + 0.5) * 128) / allowedValues.length);
  }
  if (valueKind === "color") {
    const colorComponent = mapping?.colorComponent;
    const rgb = parseHexColor(value);
    if (!MIDI_COLOR_COMPONENT_SET.has(colorComponent) || !rgb) {
      return null;
    }
    const hsv = rgbToHsv(rgb);
    return clampMidiValue(
      hsv[colorComponent] * (colorComponent === "hue" ? 128 : MIDI_MAX_VALUE),
    );
  }
  if (valueKind !== "scalar") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  const min = Number.isFinite(mapping?.min)
    ? Number(mapping.min)
    : Number(definition.binding?.min ?? 0);
  const max = Number.isFinite(mapping?.max)
    ? Number(mapping.max)
    : Number(definition.binding?.max ?? 1);
  const bounded = clamp(numericValue, Math.min(min, max), Math.max(min, max));
  if (min < 0 && max > 0) {
    return bounded <= 0
      ? clampMidiValue(((bounded - min) / -min) * 64)
      : clampMidiValue(64 + (bounded / max) * 63);
  }
  if (min === max) {
    return MIDI_MIN_VALUE;
  }
  return clampMidiValue(((bounded - min) / (max - min)) * MIDI_MAX_VALUE);
}

function hsvToRgb({ hue, saturation, brightness }) {
  const wrappedHue = ((hue % 1) + 1) % 1;
  const chroma = brightness * saturation;
  const sector = wrappedHue * 6;
  const intermediate = chroma * (1 - Math.abs((sector % 2) - 1));
  let channels;

  if (sector < 1) {
    channels = [chroma, intermediate, 0];
  } else if (sector < 2) {
    channels = [intermediate, chroma, 0];
  } else if (sector < 3) {
    channels = [0, chroma, intermediate];
  } else if (sector < 4) {
    channels = [0, intermediate, chroma];
  } else if (sector < 5) {
    channels = [intermediate, 0, chroma];
  } else {
    channels = [chroma, 0, intermediate];
  }

  const match = brightness - chroma;
  return channels.map((channel) => channel + match);
}

function normalizeMidiColorValue(mapping, rawValue, currentValue) {
  const colorComponent = mapping?.colorComponent;
  if (!MIDI_COLOR_COMPONENT_SET.has(colorComponent)) {
    return createFailure("invalid-color-component");
  }
  if (currentValue == null) {
    return createFailure("missing-current-value");
  }
  const rgb = parseHexColor(currentValue);
  if (!rgb) {
    return createFailure("invalid-current-color");
  }

  const hsv = rgbToHsv(rgb);
  hsv[colorComponent] =
    colorComponent === "hue"
      ? clamp(rawValue, MIDI_MIN_VALUE, MIDI_MAX_VALUE) / 128
      : clamp(rawValue, MIDI_MIN_VALUE, MIDI_MAX_VALUE) / MIDI_MAX_VALUE;

  return {
    ok: true,
    value: `#${hsvToRgb(hsv).map(toHexByte).join("")}`,
    valueKind: "color",
  };
}

const UNSUPPORTED_VALUE_CONTRACT_REASON = "unsupported-value-contract";

function assertParameterAutomationSurface(surface) {
  if (surface != null && !isControlSurface(surface)) {
    throw new TypeError(`Invalid control surface: ${String(surface)}`);
  }
}

function hasValidProductSurfaces(definition) {
  return isCanonicalControlSurfaceSet(definition?.surfaces);
}

function readRemoteControlExclusionReason(definition) {
  const reason = definition?.remoteControl?.excludedReason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function isParameterAutomationCandidate(definition, surface = null) {
  assertParameterAutomationSurface(surface);
  if (!hasValidProductSurfaces(definition)) {
    return false;
  }
  const belongsToSurface =
    surface == null || definition.surfaces.includes(surface);
  return (
    definition.status === CONTROL_STATUSES.live &&
    belongsToSurface &&
    definition.sidebarHidden !== true &&
    definition.publicReferenceHidden !== true
  );
}

export function getParameterAutomationDefinitionIssues(definition) {
  const key = definition?.key ?? "Unknown control";
  if (!hasValidProductSurfaces(definition)) {
    return [`Control ${key} has invalid product surfaces`];
  }
  if (!isParameterAutomationCandidate(definition)) {
    return [];
  }

  const issues = [];
  if (
    !Number.isFinite(definition.groupOrder) ||
    !Number.isFinite(definition.controlOrder)
  ) {
    issues.push(`Remote control ${key} has invalid presentation order`);
  }

  const exclusionDeclared = definition.remoteControl != null;
  const exclusionReason = readRemoteControlExclusionReason(definition);
  if (exclusionDeclared && exclusionReason == null) {
    issues.push(`Remote control ${key} has an empty excludedReason`);
  }
  if (
    getParameterAutomationControlValueKind(definition) == null &&
    exclusionReason !== UNSUPPORTED_VALUE_CONTRACT_REASON
  ) {
    issues.push(
      `Remote control ${key} has an unsupported value contract without excludedReason ${UNSUPPORTED_VALUE_CONTRACT_REASON}`,
    );
  }
  return issues;
}

function assertParameterAutomationDefinitions(definitions) {
  const issues = definitions.flatMap(getParameterAutomationDefinitionIssues);
  if (issues.length > 0) {
    throw new TypeError(issues.join("; "));
  }
}

function compareRemoteControlPresentationOrder(left, right) {
  if (left.groupOrder !== right.groupOrder) {
    return left.groupOrder - right.groupOrder;
  }
  if (left.controlOrder !== right.controlOrder) {
    return left.controlOrder - right.controlOrder;
  }
  return left.key.localeCompare(right.key);
}

export function getAutomatableControlDefinitions(
  definitions = CONTROL_DEFINITIONS,
  { surface = null } = {},
) {
  assertParameterAutomationSurface(surface);
  assertParameterAutomationDefinitions(definitions);
  return definitions
    .filter(
      (definition) =>
        isParameterAutomationCandidate(definition, surface) &&
        readRemoteControlExclusionReason(definition) == null,
    )
    .sort(compareRemoteControlPresentationOrder);
}

// Metadata union only. Runtime transports must request an explicit product
// surface; Desktop OSC and MIDI always request the Performer projection.
const CROSS_SURFACE_AUTOMATABLE_CONTROL_DEFINITIONS =
  getAutomatableControlDefinitions();
export const AUTOMATABLE_CONTROL_KEYS = Object.freeze(
  CROSS_SURFACE_AUTOMATABLE_CONTROL_DEFINITIONS.map(
    (definition) => definition.key,
  ),
);
const AUTOMATABLE_CONTROL_DEFINITION_BY_KEY = new Map(
  CROSS_SURFACE_AUTOMATABLE_CONTROL_DEFINITIONS.map((definition) => [
    definition.key,
    definition,
  ]),
);

function findAutomatableControlDefinition(
  key,
  definitions = CONTROL_DEFINITIONS,
  surface = null,
) {
  assertParameterAutomationSurface(surface);
  if (definitions === CONTROL_DEFINITIONS) {
    const definition = AUTOMATABLE_CONTROL_DEFINITION_BY_KEY.get(key) ?? null;
    return definition && isParameterAutomationCandidate(definition, surface)
      ? definition
      : null;
  }

  assertParameterAutomationDefinitions(definitions);
  const definition =
    definitions.find((candidate) => candidate.key === key) ?? null;
  return definition &&
    isParameterAutomationCandidate(definition, surface) &&
    readRemoteControlExclusionReason(definition) == null
    ? definition
    : null;
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
  const valueKind = getParameterAutomationControlValueKind(definition);
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
  surface = null,
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

  for (const definition of getAutomatableControlDefinitions(definitions, {
    surface,
  })) {
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
  const valueKind = getParameterAutomationControlValueKind(definition);
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
    surface = null,
    sequence = 0,
    persistMode = "none",
    receivedAtMs = 0,
  } = {},
) {
  const key = readOscControlKey(packet?.address);
  if (!key) {
    return createFailure("invalid-address");
  }
  const definition = findAutomatableControlDefinition(
    key,
    definitions,
    surface,
  );
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
  if (min < 0 && max > 0) {
    if (bounded <= 64) {
      return min + (bounded / 64) * -min;
    }
    return ((bounded - 64) / (MIDI_MAX_VALUE - 64)) * max;
  }
  return min + (bounded / MIDI_MAX_VALUE) * (max - min);
}

function normalizeMidiMappedValue(
  definition,
  mapping,
  midiEvent,
  currentValue,
) {
  const rawValue = Number(midiEvent?.value);
  if (!Number.isFinite(rawValue)) {
    return createFailure("non-finite-value");
  }
  const valueKind = getParameterAutomationControlValueKind(definition);
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
  if (valueKind === "color") {
    return normalizeMidiColorValue(mapping, rawValue, currentValue);
  }
  return createFailure("unsupported-midi-value-kind");
}

/**
 * @param {any} mapping
 * @param {any} midiEvent
 * @param {{
 *   definitions?: readonly any[],
 *   surface?: string | null,
 *   sequence?: number,
 *   persistMode?: string,
 *   receivedAtMs?: number,
 *   currentValue?: unknown,
 * }} [options]
 */
export function normalizeMidiAutomationCommand(
  mapping,
  midiEvent,
  {
    definitions = CONTROL_DEFINITIONS,
    surface = null,
    sequence = 0,
    persistMode = "none",
    receivedAtMs = 0,
    currentValue,
  } = {},
) {
  if (!isMatchingMidiMapping(mapping, midiEvent)) {
    return createFailure("unmapped-midi-control");
  }
  const key = mapping.key;
  const definition = findAutomatableControlDefinition(
    key,
    definitions,
    surface,
  );
  if (!definition) {
    return createFailure("unknown-key");
  }
  const normalized = normalizeMidiMappedValue(
    definition,
    mapping,
    midiEvent,
    currentValue,
  );
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
