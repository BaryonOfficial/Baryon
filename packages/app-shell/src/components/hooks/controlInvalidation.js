const SPECTRAL_INACTIVE_STATIC_COLOR_KEYS = Object.freeze([
  "volumeColor",
  "surfaceColor",
]);
const SPECTRAL_INACTIVE_STATIC_COLOR_KEY_SET = new Set(
  SPECTRAL_INACTIVE_STATIC_COLOR_KEYS,
);

export function shouldSkipSpectralStaticColorInvalidation(
  previousControls,
  nextControls,
) {
  if (!previousControls || !nextControls) {
    return false;
  }

  if (nextControls.colorMode !== "spectral") {
    return false;
  }

  let changedKeyCount = 0;
  for (const key of Object.keys(nextControls)) {
    if (Object.is(previousControls[key], nextControls[key])) {
      continue;
    }

    changedKeyCount += 1;
    if (!SPECTRAL_INACTIVE_STATIC_COLOR_KEY_SET.has(key)) {
      return false;
    }
  }

  return changedKeyCount > 0;
}
