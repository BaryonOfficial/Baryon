import { CONTROL_STATUSES } from './schema.js';

/**
 * Serialize a control state object to a plain JSON-safe object.
 * Only live (non-debug) controls are included so that audit/dev settings
 * are never stored in presets or auto-saved settings.
 *
 * @param {Record<string, unknown>} controls - Current control state
 * @param {object[]} definitions - Schema definitions
 * @returns {Record<string, unknown>}
 */
export function serializeControls(controls, definitions) {
  return Object.fromEntries(
    definitions
      .filter(d => d.status === CONTROL_STATUSES.live)
      .map(d => [d.key, controls[d.key]])
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
 * @param {object[]} definitions - Schema definitions
 * @returns {Record<string, unknown>}
 */
export function deserializeControls(raw, definitions) {
  const result = Object.fromEntries(definitions.map(d => [d.key, d.defaultValue]));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const def of definitions) {
    if (Object.prototype.hasOwnProperty.call(raw, def.key)) {
      const val = /** @type {Record<string, unknown>} */ (raw)[def.key];
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
 * @param {object[]} definitions - Schema definitions
 * @returns {{ name: string, createdAt: number, controls: Record<string, unknown> }}
 */
export function createPreset(name, controls, definitions) {
  return {
    name,
    createdAt: Date.now(),
    controls: serializeControls(controls, definitions),
  };
}
