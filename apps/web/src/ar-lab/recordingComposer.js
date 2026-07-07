import { normalizeRecordingPreset } from "./recordingSession.js";

// Real pixel dimensions per aspect preset. The composer owns an actual
// capture surface at these sizes; presets are never just crop metadata.
export const RECORDING_SURFACE_DIMENSIONS = Object.freeze({
  "9:16": Object.freeze({ width: 1080, height: 1920 }),
  "1:1": Object.freeze({ width: 1080, height: 1080 }),
  "16:9": Object.freeze({ width: 1920, height: 1080 }),
});

export const RECORDING_COMPOSER_FPS = 60;

/**
 * @param {unknown} preset
 * @returns {{ width: number, height: number }}
 */
export function resolveComposedDimensions(preset) {
  return RECORDING_SURFACE_DIMENSIONS[normalizeRecordingPreset(preset)];
}

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

function defaultCreateCanvas() {
  return document.createElement("canvas");
}

function readDrawableVideoDimensions(video) {
  const sourceWidth = Number(video?.videoWidth ?? 0);
  const sourceHeight = Number(video?.videoHeight ?? 0);
  return sourceWidth > 0 && sourceHeight > 0
    ? { sourceWidth, sourceHeight }
    : null;
}

function readDrawableCanvasDimensions(canvas) {
  const sourceWidth = Number(canvas?.width ?? 0);
  const sourceHeight = Number(canvas?.height ?? 0);
  return sourceWidth > 0 && sourceHeight > 0
    ? { sourceWidth, sourceHeight }
    : null;
}

function readDrawableImageDimensions(image) {
  const sourceWidth = Number(image?.naturalWidth ?? 0);
  const sourceHeight = Number(image?.naturalHeight ?? 0);
  return image?.complete && sourceWidth > 0 && sourceHeight > 0
    ? { sourceWidth, sourceHeight }
    : null;
}

function drawCoverSource({
  context,
  source,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  mirrored = false,
}) {
  const { sx, sy, sWidth, sHeight } = resolveCoverSourceRect({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  });

  if (mirrored) {
    context.save();
    context.translate(targetWidth, 0);
    context.scale(-1, 1);
  }

  context.drawImage(
    source,
    sx,
    sy,
    sWidth,
    sHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  if (mirrored) {
    context.restore();
  }
}

/**
 * Owns the aspect-ratio capture surface: a canvas sized to the preset that
 * copies the camera presentation and Baryon canvas each animation frame with a
 * cover crop. When the segmented camera stack is present, the selected
 * background image is drawn behind the person cutout; otherwise the raw camera
 * video is used as a fallback.
 * When a camera layer is present, the Baryon canvas is composited with the same
 * screen blend the DOM preview uses.
 *
 * @param {{
 *   sourceCanvas: HTMLCanvasElement,
 *   sourceVideo?: HTMLVideoElement | null,
 *   sourcePersonCanvas?: HTMLCanvasElement | null,
 *   sourceBackgroundImage?: HTMLImageElement | null,
 *   preset: unknown,
 *   createCanvas?: () => HTMLCanvasElement,
 *   requestFrame?: (callback: () => void) => number,
 *   cancelFrame?: (handle: number) => void,
 * }} options
 */
export function createRecordingComposer({
  sourceCanvas,
  sourceVideo = null,
  sourcePersonCanvas = null,
  sourceBackgroundImage = null,
  preset,
  createCanvas = defaultCreateCanvas,
  requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
  cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
}) {
  const normalizedPreset = normalizeRecordingPreset(preset);
  const { width, height } = resolveComposedDimensions(normalizedPreset);

  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    return null;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let frameHandle = null;
  let running = false;

  function composeFrame() {
    const canvasDimensions = readDrawableCanvasDimensions(sourceCanvas);
    const videoDimensions = readDrawableVideoDimensions(sourceVideo);
    const personCanvasDimensions =
      readDrawableCanvasDimensions(sourcePersonCanvas);
    const backgroundImageDimensions = readDrawableImageDimensions(
      sourceBackgroundImage,
    );
    const hasSegmentedCamera =
      personCanvasDimensions && backgroundImageDimensions;

    if (hasSegmentedCamera) {
      context.globalCompositeOperation = "source-over";
      drawCoverSource({
        context,
        source: sourceBackgroundImage,
        sourceWidth: backgroundImageDimensions.sourceWidth,
        sourceHeight: backgroundImageDimensions.sourceHeight,
        targetWidth: width,
        targetHeight: height,
      });
      drawCoverSource({
        context,
        source: sourcePersonCanvas,
        sourceWidth: personCanvasDimensions.sourceWidth,
        sourceHeight: personCanvasDimensions.sourceHeight,
        targetWidth: width,
        targetHeight: height,
      });
      context.globalCompositeOperation = "screen";
    } else if (videoDimensions) {
      context.globalCompositeOperation = "source-over";
      drawCoverSource({
        context,
        source: sourceVideo,
        sourceWidth: videoDimensions.sourceWidth,
        sourceHeight: videoDimensions.sourceHeight,
        targetWidth: width,
        targetHeight: height,
        mirrored: true,
      });
      context.globalCompositeOperation = "screen";
    } else {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#000000";
      context.fillRect(0, 0, width, height);
    }

    if (canvasDimensions) {
      drawCoverSource({
        context,
        source: sourceCanvas,
        sourceWidth: canvasDimensions.sourceWidth,
        sourceHeight: canvasDimensions.sourceHeight,
        targetWidth: width,
        targetHeight: height,
      });
    }

    context.globalCompositeOperation = "source-over";

    if (running) {
      frameHandle = requestFrame(composeFrame);
    }
  }

  return {
    canvas,
    preset: normalizedPreset,
    width,
    height,
    start() {
      if (running) {
        return;
      }
      running = true;
      composeFrame();
    },
    stop() {
      running = false;
      if (frameHandle != null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
    },
    /**
     * @param {number} [fps]
     * @returns {MediaStream | null}
     */
    captureStream(fps = RECORDING_COMPOSER_FPS) {
      return typeof canvas.captureStream === "function"
        ? canvas.captureStream(fps)
        : null;
    },
  };
}
