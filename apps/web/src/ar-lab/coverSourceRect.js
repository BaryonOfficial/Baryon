/**
 * Cover-crop: the largest centered source rect matching the target aspect,
 * so composed frames fill the surface without letterboxing.
 *
 * @param {{
 *   sourceWidth: number,
 *   sourceHeight: number,
 *   targetWidth: number,
 *   targetHeight: number,
 * }} input
 * @returns {{ sx: number, sy: number, sWidth: number, sHeight: number }}
 */
export function resolveCoverSourceRect({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}) {
  const targetAspect = targetWidth / targetHeight;
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > targetAspect) {
    const sWidth = sourceHeight * targetAspect;
    return {
      sx: (sourceWidth - sWidth) / 2,
      sy: 0,
      sWidth,
      sHeight: sourceHeight,
    };
  }

  const sHeight = sourceWidth / targetAspect;
  return {
    sx: 0,
    sy: (sourceHeight - sHeight) / 2,
    sWidth: sourceWidth,
    sHeight,
  };
}
