import { useEffect, useRef } from "react";
import {
  HAND_ANCHOR_SOURCES,
  createIdleHandAnchorState,
  deriveHandAnchorState,
} from "./handAnchor.js";
import { createCameraHandSnapshots } from "./cameraHandLandmarks.js";
import { CAMERA_HAND_TRACKING_STATUS } from "./cameraHandTrackingStatus.js";
import { createCameraHandLandmarkerOptions } from "./cameraHandRuntimeConfig.js";

const HIGH_FPS_CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { min: 50, ideal: 60 },
  },
});

const COMPATIBLE_CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60 },
  },
});

const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const PERSON_SEGMENTER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const PERSON_SEGMENTATION_MIN_INTERVAL_MS = 66;
const PERSON_MASK_SOFT_LOW = 0.36;
const PERSON_MASK_SOFT_HIGH = 0.78;
const PERSON_MASK_TEMPORAL_RESPONSE = 0.46;
const PERSON_MASK_EDGE_BLUR_PX = 1.85;
const PERSON_MASK_SPATIAL_PASSES = 2;
const PERSON_MASK_ALPHA_FLOOR = 7;
const PERSON_MASK_ALPHA_CEILING = 248;

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function formatCameraError(error) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was denied.";
  }
  if (name === "NotFoundError") {
    return "No camera was found.";
  }
  if (name === "NotReadableError") {
    return "The camera is already in use or unavailable.";
  }
  return error instanceof Error ? error.message : String(error);
}

function stopMediaStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop();
  }
}

function isCameraConstraintError(error) {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  return (
    name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError"
  );
}

async function requestCameraStream(mediaDevices) {
  try {
    return await mediaDevices.getUserMedia(HIGH_FPS_CAMERA_CONSTRAINTS);
  } catch (error) {
    if (!isCameraConstraintError(error)) {
      throw error;
    }
    return mediaDevices.getUserMedia(COMPATIBLE_CAMERA_CONSTRAINTS);
  }
}

function closeLandmarker(landmarker) {
  try {
    landmarker?.close?.();
  } catch {
    // MediaPipe cleanup is best-effort; camera tracks are released separately.
  }
}

function closeSegmenter(segmenter) {
  try {
    segmenter?.close?.();
  } catch {
    // MediaPipe cleanup is best-effort; camera tracks are released separately.
  }
}

async function createCameraHandLandmarker(HandLandmarker, vision) {
  try {
    return await HandLandmarker.createFromOptions(
      vision,
      createCameraHandLandmarkerOptions({
        delegate: "GPU",
        canvas: document.createElement("canvas"),
      }),
    );
  } catch {
    return HandLandmarker.createFromOptions(
      vision,
      createCameraHandLandmarkerOptions({ delegate: "CPU" }),
    );
  }
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function resolvePersonMaskAlpha(confidence) {
  const normalized = clamp01(
    (confidence - PERSON_MASK_SOFT_LOW) /
      (PERSON_MASK_SOFT_HIGH - PERSON_MASK_SOFT_LOW),
  );
  const softened = normalized * normalized * (3 - 2 * normalized);
  return Math.round(softened * 255);
}

function smoothPersonMaskAlpha(targetAlpha, previousAlpha) {
  if (previousAlpha == null || targetAlpha < 12 || targetAlpha > 243) {
    return targetAlpha;
  }
  return Math.round(
    previousAlpha +
      (targetAlpha - previousAlpha) * PERSON_MASK_TEMPORAL_RESPONSE,
  );
}

function allocateMaskBuffers(maskState, alphaLength) {
  if (
    maskState.alpha?.length !== alphaLength ||
    maskState.spatialAlpha?.length !== alphaLength ||
    maskState.spatialScratch?.length !== alphaLength
  ) {
    maskState.alpha = new Uint8ClampedArray(alphaLength);
    maskState.spatialAlpha = new Uint8ClampedArray(alphaLength);
    maskState.spatialScratch = new Uint8ClampedArray(alphaLength);
    maskState.imageData = null;
  }
}

function copyAlpha(source, target) {
  target.set(source);
}

function smoothAlphaPass({ source, target, width, height }) {
  for (let y = 0; y < height; y += 1) {
    const previousY = Math.max(0, y - 1);
    const nextY = Math.min(height - 1, y + 1);

    for (let x = 0; x < width; x += 1) {
      const previousX = Math.max(0, x - 1);
      const nextX = Math.min(width - 1, x + 1);
      const centerIndex = y * width + x;
      const northIndex = previousY * width + x;
      const southIndex = nextY * width + x;
      const westIndex = y * width + previousX;
      const eastIndex = y * width + nextX;

      const weightedAlpha =
        source[centerIndex] * 4 +
        source[northIndex] * 2 +
        source[southIndex] * 2 +
        source[westIndex] * 2 +
        source[eastIndex] * 2 +
        source[previousY * width + previousX] +
        source[previousY * width + nextX] +
        source[nextY * width + previousX] +
        source[nextY * width + nextX];

      const alpha = Math.round(weightedAlpha / 16);
      target[centerIndex] =
        alpha <= PERSON_MASK_ALPHA_FLOOR
          ? 0
          : alpha >= PERSON_MASK_ALPHA_CEILING
            ? 255
            : alpha;
    }
  }
}

function smoothPersonMaskSpatially({ maskState, width, height }) {
  copyAlpha(maskState.alpha, maskState.spatialAlpha);

  let source = maskState.spatialAlpha;
  let target = maskState.spatialScratch;
  for (let pass = 0; pass < PERSON_MASK_SPATIAL_PASSES; pass += 1) {
    smoothAlphaPass({ source, target, width, height });
    [source, target] = [target, source];
  }

  if (source !== maskState.spatialAlpha) {
    copyAlpha(source, maskState.spatialAlpha);
  }
}

function resolveCoverSourceRect({
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

function resizePersonCanvas(canvas, video) {
  const cssWidth = Math.max(
    1,
    Math.round(
      canvas.clientWidth || video.clientWidth || video.videoWidth || 1,
    ),
  );
  const cssHeight = Math.max(
    1,
    Math.round(
      canvas.clientHeight || video.clientHeight || video.videoHeight || 1,
    ),
  );
  const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return { width, height };
}

function clearCanvas(canvas) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
}

function writePersonMask(maskCanvas, confidenceMask, maskState) {
  const maskWidth = Number(confidenceMask?.width ?? 0);
  const maskHeight = Number(confidenceMask?.height ?? 0);
  if (maskWidth <= 0 || maskHeight <= 0) {
    return false;
  }

  const confidence = confidenceMask.getAsFloat32Array();
  if (confidence.length !== maskWidth * maskHeight) {
    return false;
  }

  const alphaLength = maskWidth * maskHeight;
  if (
    maskCanvas.width !== maskWidth ||
    maskCanvas.height !== maskHeight ||
    maskState.alpha?.length !== alphaLength
  ) {
    maskCanvas.width = maskWidth;
    maskCanvas.height = maskHeight;
  }
  allocateMaskBuffers(maskState, alphaLength);

  const context = maskCanvas.getContext("2d");
  if (!context) {
    return false;
  }

  const imageData =
    maskState.imageData ?? context.createImageData(maskWidth, maskHeight);
  maskState.imageData = imageData;
  for (let pixelIndex = 0; pixelIndex < confidence.length; pixelIndex += 1) {
    const previousAlpha = maskState.alpha[pixelIndex];
    const targetAlpha = resolvePersonMaskAlpha(confidence[pixelIndex]);
    const alpha = smoothPersonMaskAlpha(targetAlpha, previousAlpha);
    maskState.alpha[pixelIndex] = alpha;
  }

  smoothPersonMaskSpatially({
    maskState,
    width: maskWidth,
    height: maskHeight,
  });

  for (
    let pixelIndex = 0;
    pixelIndex < maskState.spatialAlpha.length;
    pixelIndex += 1
  ) {
    const dataIndex = pixelIndex * 4;
    imageData.data[dataIndex] = 255;
    imageData.data[dataIndex + 1] = 255;
    imageData.data[dataIndex + 2] = 255;
    imageData.data[dataIndex + 3] = maskState.spatialAlpha[pixelIndex];
  }
  context.putImageData(imageData, 0, 0);
  return true;
}

function drawPersonCutout({ canvas, video, maskCanvas, maskReady }) {
  if (!canvas || !video?.videoWidth || !video?.videoHeight) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const { width, height } = resizePersonCanvas(canvas, video);
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, width, height);

  if (!maskReady || !maskCanvas?.width || !maskCanvas.height) {
    canvas.dataset.segmentationReady = "false";
    return;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawCoverSource({
    context,
    source: video,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    targetWidth: width,
    targetHeight: height,
    mirrored: true,
  });

  context.globalCompositeOperation = "destination-in";
  context.save();
  context.filter = `blur(${PERSON_MASK_EDGE_BLUR_PX}px)`;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  drawCoverSource({
    context,
    source: maskCanvas,
    sourceWidth: maskCanvas.width,
    sourceHeight: maskCanvas.height,
    targetWidth: width,
    targetHeight: height,
    mirrored: true,
  });
  context.restore();
  context.globalCompositeOperation = "source-over";
  canvas.dataset.segmentationReady = "true";
}

/**
 * Owns the desktop camera hand-tracking runtime. It starts only when `active`
 * is true, writes only to `anchorStateRef`, and releases camera/model resources
 * on stop or unmount.
 *
 * @param {{
 *   active: boolean,
 *   videoRef: import("react").RefObject<HTMLVideoElement | null>,
 *   personCanvasRef?: import("react").RefObject<HTMLCanvasElement | null>,
 *   personSegmentationEnabled?: boolean,
 *   anchorStateRef: { current: import("./handAnchor.js").HandAnchorState },
 *   onStatusChange?: (status: { phase: string, error: string | null }) => void,
 * }} props
 */
export default function BaryonCameraHandBridge({
  active,
  videoRef,
  personCanvasRef,
  personSegmentationEnabled = false,
  anchorStateRef,
  onStatusChange = () => {},
}) {
  const personSegmentationEnabledRef = useRef(personSegmentationEnabled);

  useEffect(() => {
    personSegmentationEnabledRef.current = personSegmentationEnabled;
    if (!personSegmentationEnabled) {
      const personCanvas = personCanvasRef?.current ?? null;
      clearCanvas(personCanvas);
      if (personCanvas) {
        personCanvas.dataset.segmentationReady = "false";
      }
    }
  }, [personCanvasRef, personSegmentationEnabled]);

  useEffect(() => {
    if (!active) {
      anchorStateRef.current = createIdleHandAnchorState();
      onStatusChange({
        phase: CAMERA_HAND_TRACKING_STATUS.idle,
        error: null,
      });
      return undefined;
    }

    let cancelled = false;
    let frameHandle = 0;
    let stream = null;
    let landmarker = null;
    let ImageSegmenterTask = null;
    let vision = null;
    let segmenter = null;
    let segmenterPromise = null;
    let maskCanvas = document.createElement("canvas");
    let maskState = { alpha: null };
    let maskReady = false;
    let personCutoutCleared = true;
    let previousFrameAtMs = null;
    let lastSegmentedAtMs = 0;
    let lastPublishedPhase = null;
    let lastPublishedError = null;

    const publishStatus = (phase, error = null) => {
      if (phase === lastPublishedPhase && error === lastPublishedError) {
        return;
      }
      lastPublishedPhase = phase;
      lastPublishedError = error;
      onStatusChange({ phase, error });
    };

    const resetAnchor = () => {
      anchorStateRef.current = createIdleHandAnchorState();
    };

    const clearPersonCanvas = () => {
      const personCanvas = personCanvasRef?.current ?? null;
      clearCanvas(personCanvas);
      if (personCanvas) {
        personCanvas.dataset.segmentationReady = "false";
      }
      personCutoutCleared = true;
    };

    const releaseSegmenter = () => {
      if (
        !segmenter &&
        !maskReady &&
        maskCanvas.width === 0 &&
        maskCanvas.height === 0 &&
        maskState.alpha == null &&
        maskState.spatialAlpha == null &&
        maskState.spatialScratch == null &&
        maskState.imageData == null
      ) {
        return;
      }

      closeSegmenter(segmenter);
      segmenter = null;
      maskReady = false;
      maskCanvas.width = 0;
      maskCanvas.height = 0;
      maskState = { alpha: null };
    };

    const ensureSegmenter = () => {
      if (
        !personSegmentationEnabledRef.current ||
        segmenter ||
        segmenterPromise ||
        !vision ||
        !ImageSegmenterTask
      ) {
        return;
      }

      segmenterPromise = ImageSegmenterTask.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: PERSON_SEGMENTER_MODEL_URL,
        },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      })
        .then((nextSegmenter) => {
          segmenterPromise = null;
          if (cancelled || !personSegmentationEnabledRef.current) {
            closeSegmenter(nextSegmenter);
            return null;
          }
          segmenter = nextSegmenter;
          return segmenter;
        })
        .catch(() => {
          segmenterPromise = null;
          maskReady = false;
          clearPersonCanvas();
          return null;
        });
    };

    const cleanup = () => {
      cancelled = true;
      if (frameHandle) {
        cancelAnimationFrame(frameHandle);
        frameHandle = 0;
      }
      closeLandmarker(landmarker);
      landmarker = null;
      releaseSegmenter();
      stopMediaStream(stream);
      const video = videoRef.current;
      if (video && video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
      stream = null;
      clearPersonCanvas();
      resetAnchor();
    };

    const runFrame = (timestampMs) => {
      if (cancelled || !landmarker) {
        return;
      }

      const video = videoRef.current;
      if (
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        const dtMs =
          previousFrameAtMs == null
            ? 0
            : Math.max(0, timestampMs - previousFrameAtMs);
        previousFrameAtMs = timestampMs;

        try {
          const result = landmarker.detectForVideo(video, timestampMs);
          const hands = createCameraHandSnapshots(result, {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            displayWidth: video.clientWidth,
            displayHeight: video.clientHeight,
          });
          anchorStateRef.current = deriveHandAnchorState({
            previous: anchorStateRef.current,
            hands,
            nowMs: timestampMs,
            dtMs,
            handSourceAvailable: true,
            source: HAND_ANCHOR_SOURCES.cameraHand,
          });
          publishStatus(
            hands.length > 0
              ? CAMERA_HAND_TRACKING_STATUS.tracking
              : CAMERA_HAND_TRACKING_STATUS.ready,
          );
        } catch (error) {
          publishStatus(
            CAMERA_HAND_TRACKING_STATUS.error,
            formatCameraError(error),
          );
          resetAnchor();
        }

        if (personSegmentationEnabledRef.current) {
          ensureSegmenter();
          if (
            segmenter &&
            timestampMs - lastSegmentedAtMs >=
              PERSON_SEGMENTATION_MIN_INTERVAL_MS
          ) {
            lastSegmentedAtMs = timestampMs;
            let result = null;
            try {
              result = segmenter.segmentForVideo(video, timestampMs);
              maskReady = writePersonMask(
                maskCanvas,
                result.confidenceMasks?.[0],
                maskState,
              );
            } catch {
              maskReady = false;
            } finally {
              result?.close?.();
            }
          }

          drawPersonCutout({
            canvas: personCanvasRef?.current ?? null,
            video,
            maskCanvas,
            maskReady,
          });
          personCutoutCleared = false;
        } else {
          lastSegmentedAtMs = 0;
          releaseSegmenter();
          if (!personCutoutCleared) {
            clearPersonCanvas();
          }
        }
      }

      frameHandle = requestAnimationFrame(runFrame);
    };

    const start = async () => {
      const video = videoRef.current;
      if (!video) {
        throw new Error("Camera preview video element is not mounted.");
      }
      const mediaDevices = globalThis.navigator?.mediaDevices;
      if (typeof mediaDevices?.getUserMedia !== "function") {
        throw new Error("This browser does not expose camera capture.");
      }

      publishStatus(CAMERA_HAND_TRACKING_STATUS.requestingCamera);
      stream = await requestCameraStream(mediaDevices);
      if (cancelled) {
        stopMediaStream(stream);
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (cancelled) {
        return;
      }

      publishStatus(CAMERA_HAND_TRACKING_STATUS.loadingModel);
      const { FilesetResolver, HandLandmarker, ImageSegmenter } =
        await import("@mediapipe/tasks-vision");
      ImageSegmenterTask = ImageSegmenter;
      vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      if (cancelled) {
        return;
      }

      landmarker = await createCameraHandLandmarker(HandLandmarker, vision);
      if (cancelled) {
        closeLandmarker(landmarker);
        landmarker = null;
        return;
      }

      previousFrameAtMs = nowMs();
      publishStatus(CAMERA_HAND_TRACKING_STATUS.ready);
      frameHandle = requestAnimationFrame(runFrame);
    };

    void start().catch((error) => {
      cleanup();
      publishStatus(
        CAMERA_HAND_TRACKING_STATUS.error,
        formatCameraError(error),
      );
    });

    return cleanup;
  }, [active, anchorStateRef, onStatusChange, personCanvasRef, videoRef]);

  return null;
}
