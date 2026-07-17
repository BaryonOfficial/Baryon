export const PERSON_SEGMENTATION_MIN_INTERVAL_MS = 33;
export const PERSON_MASK_EDGE_BLUR_PX = 2.6;

const PERSON_MASK_SOFT_LOW = 0.42;
const PERSON_MASK_SOFT_HIGH = 0.84;
const PERSON_MASK_TEMPORAL_RESPONSE = 0.38;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function resolvePersonMaskAlpha(confidence) {
  const normalized = clamp01(
    (confidence - PERSON_MASK_SOFT_LOW) /
      (PERSON_MASK_SOFT_HIGH - PERSON_MASK_SOFT_LOW),
  );
  const softened = normalized * normalized * (3 - 2 * normalized);
  return Math.round(softened * 255);
}

export function smoothPersonMaskAlpha(targetAlpha, previousAlpha) {
  if (previousAlpha == null || targetAlpha < 12 || targetAlpha > 243) {
    return targetAlpha;
  }
  return Math.round(
    previousAlpha +
      (targetAlpha - previousAlpha) * PERSON_MASK_TEMPORAL_RESPONSE,
  );
}

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

export function mapVideoSourceRectToMaskSourceRect({
  videoSourceRect,
  videoWidth,
  videoHeight,
  maskWidth,
  maskHeight,
}) {
  if (
    !videoSourceRect ||
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    maskWidth <= 0 ||
    maskHeight <= 0
  ) {
    return {
      sx: 0,
      sy: 0,
      sWidth: maskWidth,
      sHeight: maskHeight,
    };
  }

  return {
    sx: (videoSourceRect.sx / videoWidth) * maskWidth,
    sy: (videoSourceRect.sy / videoHeight) * maskHeight,
    sWidth: (videoSourceRect.sWidth / videoWidth) * maskWidth,
    sHeight: (videoSourceRect.sHeight / videoHeight) * maskHeight,
  };
}
