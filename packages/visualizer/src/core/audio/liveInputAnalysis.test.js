import { describe, expect, it } from "vitest";
import {
  LIVE_INPUT_ACOUSTIC_INTENTS,
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisClass,
  resolveLiveInputAnalysisClass,
} from "./liveInputAnalysis.js";

describe("live input analysis classification", () => {
  it("normalizes first-class acoustic mic intents", () => {
    expect(normalizeLiveInputAcousticIntent()).toBe(
      LIVE_INPUT_ACOUSTIC_INTENTS.ambient,
    );
    expect(normalizeLiveInputAcousticIntent("vocal")).toBe(
      LIVE_INPUT_ACOUSTIC_INTENTS.vocal,
    );
    expect(normalizeLiveInputAcousticIntent("voice-tone")).toBe(
      LIVE_INPUT_ACOUSTIC_INTENTS.vocal,
    );
  });

  it("keeps legacy acoustic profile names out of analysis classification", () => {
    expect(normalizeLiveInputAnalysisClass("voice-tone")).toBe(
      LIVE_INPUT_ANALYSIS_CLASSES.auto,
    );
    expect(normalizeLiveInputAnalysisClass("ambient")).toBe(
      LIVE_INPUT_ANALYSIS_CLASSES.auto,
    );
  });

  it("always resolves system capture to line-feed", () => {
    expect(
      resolveLiveInputAnalysisClass({
        liveInputDeviceKind: "system",
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
