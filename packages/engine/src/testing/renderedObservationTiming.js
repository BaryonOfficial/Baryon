/**
 * Diagnostic provenance of the observer textures used by a submitted image.
 * A newer accepted audio publication cannot make an unchanged texture newer.
 * This bookkeeping never advances the observer or the audio timeline.
 *
 * @param {{renderedSourceTimeSeconds: number, renderedAvailabilityTimeSeconds: number} | null} previous
 * @param {{baked: boolean, sourceTimeSeconds: number, preparationDelaySeconds: number}} observation
 */
export function retainRenderedObservation(
  previous,
  { baked, sourceTimeSeconds, preparationDelaySeconds },
) {
  if (
    typeof baked !== "boolean" ||
    !Number.isFinite(sourceTimeSeconds) ||
    sourceTimeSeconds < 0 ||
    !Number.isFinite(preparationDelaySeconds) ||
    preparationDelaySeconds < 0
  )
    throw new Error("invalid rendered observation timing");
  if (!baked) {
    if (!previous) throw new Error("unseeded measured observer");
    return previous;
  }
  return {
    renderedSourceTimeSeconds: sourceTimeSeconds,
    renderedAvailabilityTimeSeconds:
      sourceTimeSeconds + preparationDelaySeconds,
  };
}
