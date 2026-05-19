import { expect, test } from "vitest";

import { buildAnalysisSessionKey } from "./analysisSession.js";

test("file playback includes the playback session id in the analysis key", () => {
  expect(
    buildAnalysisSessionKey({
      isPlaying: true,
      playbackSessionId: "take-42",
    }),
  ).toBe("file:take-42");
});

test("file playback without a session id uses an explicit none key", () => {
  expect(buildAnalysisSessionKey({ isPlaying: true })).toBe("file:none");
});

test("active acoustic live input uses the live analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
    }),
  ).toBe("live");
});

test("active loopback live input uses the system analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
    }),
  ).toBe("system");
});

test("liveInputKind is used as the device-kind fallback", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputKind: "system",
    }),
  ).toBe("system");
});

test("inactive non-playing status falls back to the declared input mode", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: false,
      isPlaying: false,
      audioInputMode: "live",
    }),
  ).toBe("live");
});

test("missing status uses the idle analysis session", () => {
  expect(buildAnalysisSessionKey(null)).toBe("idle");
});
