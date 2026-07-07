const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const CAMERA_HAND_LANDMARKER_NUM_HANDS = 2;
const CAMERA_HAND_LANDMARKER_CONFIDENCE = Object.freeze({
  detection: 0.45,
  presence: 0.4,
  tracking: 0.35,
});

/**
 * @param {{
 *   delegate?: "GPU" | "CPU",
 *   canvas?: HTMLCanvasElement | OffscreenCanvas | null,
 * }} [options]
 * @returns {Record<string, unknown>}
 */
export function createCameraHandLandmarkerOptions({
  delegate = "GPU",
  canvas = null,
} = {}) {
  return {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
      delegate,
    },
    ...(delegate === "GPU" && canvas ? { canvas } : {}),
    runningMode: "VIDEO",
    numHands: CAMERA_HAND_LANDMARKER_NUM_HANDS,
    minHandDetectionConfidence: CAMERA_HAND_LANDMARKER_CONFIDENCE.detection,
    minHandPresenceConfidence: CAMERA_HAND_LANDMARKER_CONFIDENCE.presence,
    minTrackingConfidence: CAMERA_HAND_LANDMARKER_CONFIDENCE.tracking,
  };
}
