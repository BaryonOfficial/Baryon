export const RAYMARCH_FIELD_CACHE_OVERRIDE_MODES = Object.freeze({
  direct: "direct",
  cached: "cached",
});

export function normalizeRaymarchFieldCacheOverride(value) {
  return value === RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.direct
    ? RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.direct
    : RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.cached;
}

export function resolveRaymarchFieldCacheOverride(value) {
  return value == null
    ? RAYMARCH_FIELD_CACHE_OVERRIDE_MODES.cached
    : normalizeRaymarchFieldCacheOverride(value);
}
