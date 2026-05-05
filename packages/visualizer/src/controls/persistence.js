import { CONTROL_STATUSES } from "./schema.js";
import { normalizeLiveInputAcousticIntent } from "../core/audio/liveInputAnalysis.js";
import { normalizePerformanceProfile } from "../render/outputProfilePolicy.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLegacyReactivity(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
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

  const pulseAmount = raw.pulseAmount;
  if (
    !Object.prototype.hasOwnProperty.call(next, "reactivity") &&
    typeof pulseAmount === "number"
  ) {
    next.reactivity = clamp(pulseAmount / 0.055, 0, 3);
  }

  const beatSensitivity = raw.beatSensitivity;
  if (
    !Object.prototype.hasOwnProperty.call(next, "motionAmount") &&
    typeof beatSensitivity === "number"
  ) {
    next.motionAmount = clamp(beatSensitivity / 0.78, 0, 3);
  }

  const pulseDecayMs = raw.pulseDecayMs;
  if (
    !Object.prototype.hasOwnProperty.call(next, "structurePersistence") &&
    typeof pulseDecayMs === "number"
  ) {
    next.structurePersistence = clamp(pulseDecayMs / 180, 0.2, 3);
  }

  if (raw.pulseEnabled === false) {
    if (!Object.prototype.hasOwnProperty.call(raw, "reactivity")) {
      next.reactivity = 0;
    }
    if (!hasMotionAmount && !hasLegacyRotation) {
      next.motionAmount = 0;
    }
  }

  return next;
}

function normalizeLegacyLiveInputAnalysis(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
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

function normalizeLegacyPerformanceProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "renderQualityPreset")) {
    return raw;
  }

  return {
    ...raw,
    renderQualityPreset: normalizePerformanceProfile(raw.renderQualityPreset),
  };
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
  return Object.fromEntries(
    definitions
      .filter((d) => d.status === CONTROL_STATUSES.live)
      .map((d) => [
        d.key,
        d.key === "renderQualityPreset"
          ? normalizePerformanceProfile(controls[d.key])
          : controls[d.key],
      ]),
  );
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
  const normalizedRaw = normalizeLegacyLiveInputAnalysis(
    normalizeLegacyPerformanceProfile(normalizeLegacyReactivity(raw)),
  );
  if (
    !normalizedRaw ||
    typeof normalizedRaw !== "object" ||
    Array.isArray(normalizedRaw)
  ) {
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
  return result;
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
