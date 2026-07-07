import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORDING_COMPOSER_FPS,
  RECORDING_SURFACE_DIMENSIONS,
  createRecordingComposer,
  resolveComposedDimensions,
  resolveCoverSourceRect,
} from "../../src/ar-lab/recordingComposer.js";

function createFakeCanvas() {
  const drawCalls = [];
  const captureCalls = [];
  const compositeOperations = [];
  const contextOptions = [];
  const fillCalls = [];
  const transformCalls = [];
  return {
    width: 0,
    height: 0,
    drawCalls,
    captureCalls,
    compositeOperations,
    contextOptions,
    fillCalls,
    transformCalls,
    getContext(kind, options) {
      contextOptions.push(options);
      if (kind !== "2d") {
        return null;
      }
      return {
        fillStyle: "",
        globalCompositeOperation: "source-over",
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        fillRect(...args) {
          fillCalls.push(args);
        },
        drawImage(...args) {
          drawCalls.push(args);
          compositeOperations.push(this.globalCompositeOperation);
        },
        save() {
          transformCalls.push(["save"]);
        },
        translate(...args) {
          transformCalls.push(["translate", ...args]);
        },
        scale(...args) {
          transformCalls.push(["scale", ...args]);
        },
        restore() {
          transformCalls.push(["restore"]);
        },
      };
    },
    captureStream(fps) {
      captureCalls.push(fps);
      return { id: "composed-stream", fps };
    },
  };
}

test("each preset resolves to a real capture-surface size", () => {
  assert.deepEqual(resolveComposedDimensions("9:16"), {
    width: 1080,
    height: 1920,
  });
  assert.deepEqual(resolveComposedDimensions("1:1"), {
    width: 1080,
    height: 1080,
  });
  assert.deepEqual(resolveComposedDimensions("16:9"), {
    width: 1920,
    height: 1080,
  });
  // Unknown presets fall back to the 9:16 default.
  assert.deepEqual(resolveComposedDimensions("4:3"), {
    width: 1080,
    height: 1920,
  });
});

test("cover crop keeps the target aspect and stays centered", () => {
  // Wide source into a portrait 9:16 target: crop the sides.
  const portraitRect = resolveCoverSourceRect({
    sourceWidth: 1920,
    sourceHeight: 1080,
    targetWidth: 1080,
    targetHeight: 1920,
  });
  assert.ok(
    Math.abs(portraitRect.sWidth / portraitRect.sHeight - 1080 / 1920) < 1e-9,
  );
  assert.equal(portraitRect.sHeight, 1080);
  assert.ok(Math.abs(portraitRect.sx * 2 + portraitRect.sWidth - 1920) < 1e-9);

  // Portrait source into a landscape 16:9 target: crop top and bottom.
  const landscapeRect = resolveCoverSourceRect({
    sourceWidth: 1080,
    sourceHeight: 1920,
    targetWidth: 1920,
    targetHeight: 1080,
  });
  assert.ok(
    Math.abs(landscapeRect.sWidth / landscapeRect.sHeight - 1920 / 1080) < 1e-9,
  );
  assert.equal(landscapeRect.sWidth, 1080);
});

test("composer owns a canvas sized to the selected aspect ratio", () => {
  for (const preset of Object.keys(RECORDING_SURFACE_DIMENSIONS)) {
    const surface = createFakeCanvas();
    const composer = createRecordingComposer({
      sourceCanvas: { width: 1600, height: 900 },
      preset,
      createCanvas: () => surface,
      requestFrame: () => 1,
      cancelFrame: () => {},
    });

    assert.equal(
      composer.canvas.width,
      RECORDING_SURFACE_DIMENSIONS[preset].width,
    );
    assert.equal(
      composer.canvas.height,
      RECORDING_SURFACE_DIMENSIONS[preset].height,
    );
    assert.equal(composer.preset, preset);
    assert.deepEqual(surface.contextOptions, [{ alpha: false }]);
  }
});

test("composer draws cover-cropped source frames while running", () => {
  const surface = createFakeCanvas();
  const scheduledFrames = [];
  const composer = createRecordingComposer({
    sourceCanvas: { width: 1920, height: 1080 },
    preset: "9:16",
    createCanvas: () => surface,
    requestFrame: (callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    },
    cancelFrame: () => {},
  });

  composer.start();
  assert.equal(surface.drawCalls.length, 1);
  assert.equal(surface.fillCalls.length, 1);

  const [, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] =
    surface.drawCalls[0];
  assert.ok(Math.abs(sWidth / sHeight - 1080 / 1920) < 1e-9);
  assert.equal(sy, 0);
  assert.ok(sx > 0);
  assert.deepEqual([dx, dy, dWidth, dHeight], [0, 0, 1080, 1920]);

  // The compose loop reschedules itself until stopped.
  assert.equal(scheduledFrames.length, 1);
  scheduledFrames[0]();
  assert.equal(surface.drawCalls.length, 2);

  composer.stop();
  scheduledFrames.at(-1)?.();
  assert.equal(surface.drawCalls.length, 3);
  assert.equal(scheduledFrames.length, 2);
});

test("composer draws mirrored camera video under the Baryon canvas", () => {
  const surface = createFakeCanvas();
  const sourceCanvas = { width: 1920, height: 1080 };
  const sourceVideo = { videoWidth: 1280, videoHeight: 720 };
  const composer = createRecordingComposer({
    sourceCanvas,
    sourceVideo,
    preset: "9:16",
    createCanvas: () => surface,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });

  composer.start();

  assert.equal(surface.drawCalls.length, 2);
  assert.equal(surface.fillCalls.length, 0);
  assert.equal(surface.drawCalls[0][0], sourceVideo);
  assert.equal(surface.drawCalls[1][0], sourceCanvas);
  assert.deepEqual(surface.compositeOperations, ["source-over", "screen"]);
  assert.deepEqual(surface.transformCalls, [
    ["save"],
    ["translate", 1080, 0],
    ["scale", -1, 1],
    ["restore"],
  ]);
});

test("composer prefers the segmented camera stack when available", () => {
  const surface = createFakeCanvas();
  const sourceCanvas = { width: 1920, height: 1080 };
  const sourceVideo = { videoWidth: 1280, videoHeight: 720 };
  const sourcePersonCanvas = { width: 1240, height: 900 };
  const sourceBackgroundImage = {
    complete: true,
    naturalWidth: 1672,
    naturalHeight: 941,
  };
  const composer = createRecordingComposer({
    sourceCanvas,
    sourceVideo,
    sourcePersonCanvas,
    sourceBackgroundImage,
    preset: "16:9",
    createCanvas: () => surface,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });

  composer.start();

  assert.equal(surface.drawCalls.length, 3);
  assert.equal(surface.fillCalls.length, 0);
  assert.equal(surface.drawCalls[0][0], sourceBackgroundImage);
  assert.equal(surface.drawCalls[1][0], sourcePersonCanvas);
  assert.equal(surface.drawCalls[2][0], sourceCanvas);
  assert.deepEqual(surface.compositeOperations, [
    "source-over",
    "source-over",
    "screen",
  ]);
  assert.deepEqual(surface.transformCalls, []);
});

test("composer exposes the composed surface capture stream", () => {
  const surface = createFakeCanvas();
  const composer = createRecordingComposer({
    sourceCanvas: { width: 1600, height: 900 },
    preset: "1:1",
    createCanvas: () => surface,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });

  const stream = composer.captureStream(30);
  assert.deepEqual(stream, { id: "composed-stream", fps: 30 });
  assert.deepEqual(surface.captureCalls, [30]);

  const defaultStream = composer.captureStream();
  assert.deepEqual(defaultStream, {
    id: "composed-stream",
    fps: RECORDING_COMPOSER_FPS,
  });
  assert.deepEqual(surface.captureCalls, [30, RECORDING_COMPOSER_FPS]);
});

test("composer refuses surfaces without a 2d context", () => {
  const composer = createRecordingComposer({
    sourceCanvas: { width: 1600, height: 900 },
    preset: "9:16",
    createCanvas: () => ({ getContext: () => null }),
    requestFrame: () => 1,
    cancelFrame: () => {},
  });
  assert.equal(composer, null);
});
