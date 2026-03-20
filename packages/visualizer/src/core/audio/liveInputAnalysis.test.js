import { describe, expect, it } from "vitest";
import {
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAnalysisClass,
  resolveLiveInputAnalysisClass,
} from "./liveInputAnalysis.js";

describe("live input analysis classification", () => {
  it("migrates legacy profiles to the acoustic mic class", () => {
    expect(normalizeLiveInputAnalysisClass("voice-tone")).toBe(
      LIVE_INPUT_ANALYSIS_CLASSES.acousticMic,
    );
    expect(normalizeLiveInputAnalysisClass("ambient")).toBe(
      LIVE_INPUT_ANALYSIS_CLASSES.acousticMic,
    );
  });

  it("always resolves system capture to line-feed", () => {
    expect(
      resolveLiveInputAnalysisClass({
        liveInputKind: "system",
      }),
    ).toBe(LIVE_INPUT_ANALYSIS_CLASSES.lineFeed);
  });

  it("treats known virtual devices as line-feed in auto mode", () => {
    expect(
      resolveLiveInputAnalysisClass({
        liveInputKind: "live",
        selectedDeviceLabel: "BlackHole 2ch",
      }),
    ).toBe(LIVE_INPUT_ANALYSIS_CLASSES.lineFeed);
  });

  it("defaults unknown physical devices to acoustic-mic in auto mode", () => {
    expect(
      resolveLiveInputAnalysisClass({
        liveInputKind: "live",
        selectedDeviceLabel: "MacBook Pro Microphone",
      }),
    ).toBe(LIVE_INPUT_ANALYSIS_CLASSES.acousticMic);
  });

  it("lets per-device overrides win over heuristics", () => {
    expect(
      resolveLiveInputAnalysisClass({
        liveInputKind: "live",
        selectedDeviceId: "device-1",
        selectedDeviceLabel: "BlackHole 2ch",
        overrides: {
          "device-1": LIVE_INPUT_ANALYSIS_CLASSES.acousticMic,
        },
      }),
    ).toBe(LIVE_INPUT_ANALYSIS_CLASSES.acousticMic);
  });
});
