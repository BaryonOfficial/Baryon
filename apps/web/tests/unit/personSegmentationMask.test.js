import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSON_SEGMENTATION_MIN_INTERVAL_MS,
  mapVideoSourceRectToMaskSourceRect,
  resolveCoverSourceRect,
  resolvePersonMaskAlpha,
  smoothPersonMaskAlpha,
} from "../../src/ar-lab/personSegmentationMask.js";

test("person segmentation targets a camera-grade frame cadence", () => {
  assert.equal(PERSON_SEGMENTATION_MIN_INTERVAL_MS, 33);
});

test("person mask alpha keeps empty and solid regions decisive", () => {
  assert.equal(resolvePersonMaskAlpha(0.1), 0);
  assert.equal(resolvePersonMaskAlpha(0.95), 255);
  assert.equal(resolvePersonMaskAlpha(0.63), 128);
});

test("person mask temporal smoothing only affects uncertain edge pixels", () => {
  assert.equal(smoothPersonMaskAlpha(0, 180), 0);
  assert.equal(smoothPersonMaskAlpha(255, 80), 255);
  assert.equal(smoothPersonMaskAlpha(128, 28), 66);
});

test("person mask uses the same cover crop as the camera frame", () => {
  const videoSourceRect = resolveCoverSourceRect({
    sourceWidth: 1920,
    sourceHeight: 1080,
    targetWidth: 1000,
    targetHeight: 1000,
  });

  assert.deepEqual(videoSourceRect, {
    sx: 420,
    sy: 0,
    sWidth: 1080,
    sHeight: 1080,
  });

  assert.deepEqual(
    mapVideoSourceRectToMaskSourceRect({
      videoSourceRect,
      videoWidth: 1920,
      videoHeight: 1080,
      maskWidth: 256,
      maskHeight: 256,
    }),
    {
      sx: 56,
      sy: 0,
      sWidth: 144,
      sHeight: 256,
    },
  );
});
