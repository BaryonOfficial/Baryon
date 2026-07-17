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

test("file analysis identity follows the loaded source across playback attempts", () => {
  const status = {
    playbackSourceSessionId: "source-7",
    playbackSessionId: "attempt-1",
    isAudioLoaded: true,
    isPlaying: true,
  };

  expect(buildAnalysisSessionKey(status)).toBe("file:source-7");
  expect(
    buildAnalysisSessionKey({
      ...status,
      playbackSessionId: "attempt-2",
    }),
  ).toBe("file:source-7");
});

test("a loaded file owns its analysis identity before playback starts", () => {
  expect(
    buildAnalysisSessionKey({
      playbackSourceSessionId: "source-8",
      isAudioLoaded: true,
      isPlaying: false,
      audioInputMode: "file",
    }),
  ).toBe("file:source-8");
});

test("file playback without a session id uses an explicit none key", () => {
  expect(buildAnalysisSessionKey({ isPlaying: true })).toBe("file:none");
});

test("active acoustic live input uses the live analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
      liveInputSessionId: 7,
    }),
  ).toBe("live:7");
});

test("active loopback live input uses the system analysis session", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      liveInputSessionId: 8,
    }),
  ).toBe("system:8");
});

test("liveInputKind is used as the device-kind fallback", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputKind: "system",
      liveInputSessionId: 9,
    }),
  ).toBe("system:9");
});

test("inactive non-playing status falls back to the declared input mode", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: false,
      isPlaying: false,
      audioInputMode: "live",
      liveInputSessionId: 10,
    }),
  ).toBe("live:10");
});

test("live and system sessions without an owner id use an explicit none key", () => {
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "live",
    }),
  ).toBe("live:none");
  expect(
    buildAnalysisSessionKey({
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
    }),
  ).toBe("system:none");
});

test("a live-input reconnect changes the analysis session key", () => {
  const status = {
    isLiveInputActive: true,
    liveInputDeviceKind: "system",
  };

  expect(
    buildAnalysisSessionKey({ ...status, liveInputSessionId: 11 }),
  ).not.toBe(buildAnalysisSessionKey({ ...status, liveInputSessionId: 12 }));
});

test("missing status uses the idle analysis session", () => {
  expect(buildAnalysisSessionKey(null)).toBe("idle");
});
