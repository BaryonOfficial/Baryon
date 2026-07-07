import test from "node:test";
import assert from "node:assert/strict";
import { createCameraHandLandmarkerOptions } from "../../src/ar-lab/cameraHandRuntimeConfig.js";

test("camera hand landmarker defaults to low-latency video tracking", () => {
  const canvas = {};
  const options = createCameraHandLandmarkerOptions({ canvas });

  assert.equal(options.runningMode, "VIDEO");
  assert.equal(options.numHands, 2);
  assert.equal(options.baseOptions.delegate, "GPU");
  assert.equal(options.canvas, canvas);
  assert.equal(options.minHandDetectionConfidence, 0.45);
  assert.equal(options.minHandPresenceConfidence, 0.4);
  assert.equal(options.minTrackingConfidence, 0.35);
});

test("camera hand landmarker CPU fallback does not keep a GPU canvas", () => {
  const options = createCameraHandLandmarkerOptions({
    delegate: "CPU",
    canvas: {},
  });

  assert.equal(options.baseOptions.delegate, "CPU");
  assert.equal("canvas" in options, false);
});
