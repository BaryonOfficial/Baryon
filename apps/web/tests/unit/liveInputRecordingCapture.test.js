import test from "node:test";
import assert from "node:assert/strict";
import { createLiveInputRecordingCaptureStream } from "../../src/ar-lab/liveInputRecordingCapture.js";

test("opens the selected live input device for recording", async () => {
  const stoppedTracks = [];
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async (constraints) => ({
          constraints,
          getAudioTracks: () => [
            {
              stop() {
                stoppedTracks.push("audio");
              },
            },
          ],
          getTracks: () => [
            {
              stop() {
                stoppedTracks.push("track");
              },
            },
          ],
        }),
      },
    },
  });

  try {
    const capture =
      await createLiveInputRecordingCaptureStream("loopback-1");

    assert.equal(
      capture.stream.constraints.audio.deviceId.exact,
      "loopback-1",
    );
    assert.equal(capture.stream.constraints.audio.echoCancellation, false);
    assert.equal(capture.stream.constraints.audio.noiseSuppression, false);
    assert.equal(capture.stream.constraints.audio.autoGainControl, false);

    capture.stop();
    assert.deepEqual(stoppedTracks, ["track"]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});

test("returns null when selected input capture has no audio tracks", async () => {
  const stoppedTracks = [];
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getAudioTracks: () => [],
          getTracks: () => [
            {
              stop() {
                stoppedTracks.push("track");
              },
            },
          ],
        }),
      },
    },
  });

  try {
    assert.equal(await createLiveInputRecordingCaptureStream("loopback-1"), null);
    assert.deepEqual(stoppedTracks, ["track"]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  }
});
