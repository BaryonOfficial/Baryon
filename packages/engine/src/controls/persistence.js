import { CONTROL_STATUSES } from "./schema.js";
import {
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisClass,
} from "../core/audio/liveInputAnalysis.js";
import {
  normalizePerformanceTargetFps,
  normalizePersistedPerformanceProfile,
} from "../render/outputProfilePolicy.js";
import { normalizeVisualizationMethod } from "../visualization/types.js";
import { clamp } from "../utils/math.js";

export const CONTROL_SETTINGS_VERSION = 6;
const LEGACY_OLD_DEFAULT_CONTROL_SETTING_VALUES = Object.freeze({
  bloomStrength: 1.02,
  bloomRadius: 0.04,
  bloomThreshold: 0.08,
});

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPreviousControlSettingsVersion(value) {
  return value === 2 || value === 3 || value === 4 || value === 5;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function findLiveControlDefinition(definitions, key) {
  return (
    definitions.find(
      (definition) =>
        definition.key === key && definition.status === CONTROL_STATUSES.live,
    ) ?? null
  );
}

function isControlSettingValueTypeValid(definition, value) {
  if (typeof value !== typeof definition.defaultValue) {
    return false;
  }
  if (typeof definition.defaultValue === "number") {
    return Number.isFinite(value);
  }
  return true;
}

function isLegacyOldDefaultControlSettingValue(key, value) {
  if (!hasOwn(LEGACY_OLD_DEFAULT_CONTROL_SETTING_VALUES, key)) {
    return false;
  }
  return Object.is(LEGACY_OLD_DEFAULT_CONTROL_SETTING_VALUES[key], value);
}

function normalizeLegacyReactivity(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const next = { ...raw };
  const hasMotionAmount = Object.prototype.hasOwnProperty.call(
    raw,
    "motionAmount",
  );
  const hasLegacyRotation = typeof raw.rotationAudioAmount === "number";
  const legacyRotation = raw.rotationAudioAmount;
  if (
    !Object.prototype.hasOwnProperty.call(next, "motionAmount") &&
    typeof legacyRotation === "number"
  ) {
    next.motionAmount = clamp(legacyRotation, 0, 3);
  }

  const beatSensitivity = raw.beatSensitivity;
  if (
    !Object.prototype.hasOwnProperty.call(next, "motionAmount") &&
    typeof beatSensitivity === "number"
  ) {
    next.motionAmount = clamp(beatSensitivity / 0.78, 0, 3);
  }

  if (raw.pulseEnabled === false) {
    if (!hasMotionAmount && !hasLegacyRotation) {
      next.motionAmount = 0;
    }
  }

  return next;
}

function normalizeLegacyLiveInputAnalysis(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const next = { ...raw };
  if (
    !Object.prototype.hasOwnProperty.call(next, "liveInputAcousticIntent") &&
    typeof raw.liveInputProfile === "string"
  ) {
    next.liveInputAcousticIntent = normalizeLiveInputAcousticIntent(
      raw.liveInputProfile,
    );
  }

  return next;
}

function normalizeLegacyPerformanceControls(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const next = { ...raw };
  if (Object.prototype.hasOwnProperty.call(raw, "renderQualityPreset")) {
    next.renderQualityPreset = normalizePersistedPerformanceProfile(
      raw.renderQualityPreset,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(next, "customTargetFps") &&
    typeof next.customTargetFps === "number"
  ) {
    next.customTargetFps = normalizePerformanceTargetFps(next.customTargetFps);
  } else if (typeof raw.customFrameBudgetFps === "number") {
    next.customTargetFps = normalizePerformanceTargetFps(
      raw.customFrameBudgetFps,
    );
  } else if (typeof raw.customPerformanceTargetFps === "number") {
    next.customTargetFps = normalizePerformanceTargetFps(
      raw.customPerformanceTargetFps,
    );
  }

  delete next.customFrameBudgetFps;
  delete next.customPerformanceTargetFps;
  return next;
}

function normalizeLegacySpectralLight(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const next = { ...raw };
  if (raw.colorMode === "chromesthesia") {
    next.colorMode = "spectral";
  }

  if (
    !Object.prototype.hasOwnProperty.call(next, "spectralMix") &&
    typeof raw.chromesthesiaMix === "number"
  ) {
    next.spectralMix = clamp(raw.chromesthesiaMix, 0, 1);
  }

  return next;
}

function normalizeLegacyBloomResponse(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const hasLegacyBias = hasOwn(raw, "bloomResponseBias");
  const hasLegacyBloomValue = [
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
  ].some((key) => hasOwn(raw, key));
  if (!hasLegacyBias && !hasLegacyBloomValue) {
    return raw;
  }

  const next = { ...raw };
  const bias = Math.max(
    0,
    typeof raw.bloomResponseBias === "number" &&
      Number.isFinite(raw.bloomResponseBias)
      ? raw.bloomResponseBias
      : 1,
  );
  const strength =
    typeof raw.bloomStrength === "number" && Number.isFinite(raw.bloomStrength)
      ? raw.bloomStrength
      : 1.05;
  const radius =
    typeof raw.bloomRadius === "number" && Number.isFinite(raw.bloomRadius)
      ? raw.bloomRadius
      : 0.18;
  const threshold =
    typeof raw.bloomThreshold === "number" &&
    Number.isFinite(raw.bloomThreshold)
      ? raw.bloomThreshold
      : 0.25;

  if (hasLegacyBias || hasOwn(raw, "bloomStrength")) {
    next.bloomStrength = Math.max(0, strength * (1 - bias * 0.2));
  }
  if (hasLegacyBias || hasOwn(raw, "bloomRadius")) {
    next.bloomRadius = Math.max(0, radius * (1 - bias * 0.16));
  }
  if (hasLegacyBias || hasOwn(raw, "bloomThreshold")) {
    next.bloomThreshold = Math.min(1, threshold + bias * 0.1);
  }
  delete next.bloomResponseBias;
  return next;
}

function normalizeLegacyRaymarchPresentation(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  const next = { ...raw };
  // Both legacy node threshold and the interim core-width setting changed
  // apparent sheet thickness. Sharpness is now fixed apparatus calibration,
  // so neither value crosses into the canonical control state.
  delete next.zeroPointPrecision;
  delete next.carrierCoreFwhmWorld;
  delete next.contourSharpness;
  return next;
}

function normalizeLegacyVisualizationMethod(raw) {
  if (!isPlainRecord(raw)) {
    return raw;
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "visualizationMethod")) {
    return raw;
  }

  return {
    ...raw,
    visualizationMethod: normalizeVisualizationMethod(raw.visualizationMethod),
  };
}

function normalizeLegacyControls(raw) {
  return normalizeLegacyVisualizationMethod(
    normalizeLegacySpectralLight(
      normalizeLegacyRaymarchPresentation(
        normalizeLegacyLiveInputAnalysis(
          normalizeLegacyPerformanceControls(normalizeLegacyReactivity(raw)),
        ),
      ),
    ),
  );
}

function normalizePreV6ControlSettings(raw) {
  return normalizeLegacyBloomResponse(normalizeLegacyControls(raw));
}

function readNormalizedControlSettingValue(
  rawControls,
  definition,
  definitions,
) {
  const value = rawControls[definition.key];
  if (!isControlSettingValueTypeValid(definition, value)) {
    return { ok: false, value: undefined };
  }

  const normalizedValue = normalizeControlSettingValue(
    definition.key,
    value,
    definitions,
  );
  if (!isControlSettingValueTypeValid(definition, normalizedValue)) {
    return { ok: false, value: undefined };
  }

  return { ok: true, value: normalizedValue };
}

function resolveDefaultControlValue(definitions, key, fallback) {
  const definition = definitions.find((item) => item.key === key);
  return definition?.defaultValue ?? fallback;
}

function hasPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function normalizeSpectralLightActivationControls(
  controls,
  definitions,
) {
  if (!isPlainRecord(controls)) {
    return controls;
  }

  if (controls.colorMode !== "spectral") {
    return controls;
  }

  if (hasPositiveNumber(controls.spectralMix)) {
    return controls;
  }

  return {
    ...controls,
    spectralMix: resolveDefaultControlValue(definitions, "spectralMix", 1),
  };
}

/**
 * Normalize a single persisted settings value using the control's storage rules.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {ReadonlyArray<{ key: string, defaultValue: unknown, status: string }>} definitions
 * @returns {unknown}
 */
export function normalizeControlSettingValue(key, value, definitions) {
  const definition = findLiveControlDefinition(definitions, key);
  if (!definition) {
    return undefined;
  }

  if (key === "liveInputAnalysisClass") {
    return normalizeLiveInputAnalysisClass(value);
  }
  if (key === "liveInputAcousticIntent") {
    return normalizeLiveInputAcousticIntent(value);
  }
  if (key === "renderQualityPreset") {
    return normalizePersistedPerformanceProfile(value);
  }
  if (key === "customTargetFps") {
    return normalizePerformanceTargetFps(value);
  }
  if (key === "visualizationMethod") {
    return normalizeVisualizationMethod(value);
  }

  return value;
}

/**
 * Check whether a value equals the shipped default after storage normalization.
 *
 * @param {string} key
 * @param {unknown} value
 * @param {ReadonlyArray<{ key: string, defaultValue: unknown, status: string }>} definitions
 * @returns {boolean}
 */
export function isDefaultControlSettingValue(key, value, definitions) {
  const definition = findLiveControlDefinition(definitions, key);
  if (!definition || !isControlSettingValueTypeValid(definition, value)) {
    return false;
  }

  const normalizedValue = normalizeControlSettingValue(key, value, definitions);
  const normalizedDefault = normalizeControlSettingValue(
    key,
    definition.defaultValue,
    definitions,
  );
  return (
    isControlSettingValueTypeValid(definition, normalizedValue) &&
    Object.is(normalizedValue, normalizedDefault)
  );
}

/**
 * Serialize explicit settings into the v6 sparse settings envelope.
 *
 * @param {Record<string, unknown>} controls
 * @param {ReadonlyArray<{ key: string, defaultValue: unknown, status: string }>} definitions
 * @param {{ explicitKeys: ReadonlySet<string> }} options
 * @returns {{ version: 6, controls: Record<string, unknown> }}
 */
export function serializeControlSettings(
  controls,
  definitions,
  { explicitKeys } = { explicitKeys: new Set() },
) {
  /** @type {Record<string, unknown>} */
  const serializedControls = {};

  for (const definition of definitions) {
    if (
      definition.status !== CONTROL_STATUSES.live ||
      !explicitKeys?.has?.(definition.key)
    ) {
      continue;
    }

    const normalizedValue = normalizeControlSettingValue(
      definition.key,
      controls[definition.key],
      definitions,
    );
    if (!isControlSettingValueTypeValid(definition, normalizedValue)) {
      continue;
    }
    serializedControls[definition.key] = normalizedValue;
  }

  return {
    version: CONTROL_SETTINGS_VERSION,
    controls: serializedControls,
  };
}

/**
 * Deserialize persisted settings into sparse normalized overrides plus the
 * explicit-key ownership set that made those overrides sticky.
 *
 * @param {unknown} raw
 * @param {ReadonlyArray<{ key: string, defaultValue: unknown, status: string }>} definitions
 * @returns {{ controls: Record<string, unknown>, explicitKeys: Set<string>, migratedLegacy: boolean }}
 */
export function deserializeControlSettings(raw, definitions) {
  /** @type {Record<string, unknown>} */
  const controls = {};
  const explicitKeys = new Set();

  if (!isPlainRecord(raw)) {
    return { controls, explicitKeys, migratedLegacy: false };
  }

  if (
    raw.version === CONTROL_SETTINGS_VERSION ||
    isPreviousControlSettingsVersion(raw.version)
  ) {
    const migratedLegacy = raw.version !== CONTROL_SETTINGS_VERSION;
    if (!isPlainRecord(raw.controls)) {
      return { controls, explicitKeys, migratedLegacy };
    }

    const normalizedSettingsControls = migratedLegacy
      ? normalizePreV6ControlSettings(raw.controls)
      : raw.controls;

    for (const definition of definitions) {
      if (
        definition.status !== CONTROL_STATUSES.live ||
        !hasOwn(normalizedSettingsControls, definition.key)
      ) {
        continue;
      }

      const normalized = readNormalizedControlSettingValue(
        normalizedSettingsControls,
        definition,
        definitions,
      );
      if (!normalized.ok) {
        continue;
      }

      controls[definition.key] = normalized.value;
      explicitKeys.add(definition.key);
    }

    return {
      controls,
      explicitKeys,
      migratedLegacy,
    };
  }

  const normalizedLegacyControls = normalizeSpectralLightActivationControls(
    normalizeLegacyControls(raw),
    definitions,
  );
  if (!isPlainRecord(normalizedLegacyControls)) {
    return { controls, explicitKeys, migratedLegacy: true };
  }

  for (const definition of definitions) {
    if (
      definition.status !== CONTROL_STATUSES.live ||
      !hasOwn(normalizedLegacyControls, definition.key)
    ) {
      continue;
    }

    const normalized = readNormalizedControlSettingValue(
      normalizedLegacyControls,
      definition,
      definitions,
    );
    if (
      !normalized.ok ||
      isDefaultControlSettingValue(
        definition.key,
        normalized.value,
        definitions,
      ) ||
      isLegacyOldDefaultControlSettingValue(definition.key, normalized.value)
    ) {
      continue;
    }

    controls[definition.key] = normalized.value;
    explicitKeys.add(definition.key);
  }

  return { controls, explicitKeys, migratedLegacy: true };
}

/**
 * Serialize a control state object to a plain JSON-safe object.
 * Only live (non-debug) controls are included so that audit/dev settings
 * are never stored in presets or auto-saved settings.
 *
 * @param {Record<string, unknown>} controls - Current control state
 * @param {ReadonlyArray<{ key: string, status: string }>} definitions - Schema definitions
 * @returns {Record<string, unknown>}
 */
export function serializeControls(controls, definitions) {
  /** @type {Record<string, unknown>} */
  const serialized = {};

  for (const definition of definitions) {
    if (definition.status !== CONTROL_STATUSES.live) {
      continue;
    }

    serialized[definition.key] =
      definition.key === "renderQualityPreset"
        ? normalizePersistedPerformanceProfile(controls[definition.key])
        : controls[definition.key];
  }

  return serialized;
}

/**
 * Deserialize a raw object (e.g. from localStorage) back into a full control state.
 * Starts from schema defaults so that:
 * - Missing keys (newer controls added after the save) fall back to defaults
 * - Unknown keys (old controls removed from schema) are stripped
 * - Type-mismatched values (corrupted storage) are ignored in favour of defaults
 *
 * @param {unknown} raw - Raw parsed value from storage
 * @param {ReadonlyArray<{ key: string, defaultValue: unknown }>} definitions - Schema definitions
 * @returns {Record<string, unknown>}
 */
export function deserializeControls(raw, definitions) {
  const result = Object.fromEntries(
    definitions.map((d) => [d.key, d.defaultValue]),
  );
  const normalizedRaw = normalizeLegacyControls(raw);
  if (!isPlainRecord(normalizedRaw)) {
    return result;
  }
  for (const def of definitions) {
    if (Object.prototype.hasOwnProperty.call(normalizedRaw, def.key)) {
      const val = /** @type {Record<string, unknown>} */ (normalizedRaw)[
        def.key
      ];
      // Accept the stored value only if its type matches the default value's type
      if (typeof val === typeof def.defaultValue) {
        result[def.key] = val;
      }
    }
  }
  return normalizeSpectralLightActivationControls(result, definitions);
}

/**
 * Create a named preset object ready to be stored.
 *
 * @param {string} name - Human-readable preset name
 * @param {Record<string, unknown>} controls - Current control state
 * @param {ReadonlyArray<{ key: string, status: string }>} definitions - Schema definitions
 * @returns {{ name: string, createdAt: number, controls: Record<string, unknown> }}
 */
export function createPreset(name, controls, definitions) {
  return {
    name,
    createdAt: Date.now(),
    controls: serializeControls(controls, definitions),
  };
}
