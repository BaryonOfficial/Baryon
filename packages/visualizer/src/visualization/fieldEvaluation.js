export const RAYMARCH_FIELD_CACHE_OVERRIDE_MODES = Object.freeze({
  analytic: "analytic",
  cached: "cached",
});

export function normalizeRaymarchFieldCacheOverride(value) {
  return value === RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.analytic
    ? RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.analytic
    : RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.cached;
}

export function resolveRaymarchFieldCacheOverride(value) {
  return value == null
    ? RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.cached
    : normalizeRaymarchFieldCacheOverride(value);
}
