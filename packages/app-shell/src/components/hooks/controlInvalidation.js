const CHROMESTHESIA_INACTIVE_STATIC_COLOR_KEYS = Object.freeze([
  "volumeColor",
  "surfaceColor",
]);

export function shouldSkipChromesthesiaStaticColorInvalidation(
  previousControls,
  nextControls,
) {
  if (!previousControls || !nextControls) {
    return false;
  }

  if (nextControls.colorMode !== "chromesthesia") {
    return false;
  }

  let changedKeyCount = 0;
  for (const key of Object.keys(nextControls)) {
    if (Object.is(previousControls[key], nextControls[key])) {
      continue;
    }

    changedKeyCount += 1;
    if (!CHROMESTHESIA_INACTIVE_STATIC_COLOR_KEYS.includes(key)) {
      return false;
    }
  }

  return changedKeyCount > 0;
}
