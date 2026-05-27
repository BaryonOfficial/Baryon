import { describe, expect, it } from "vitest";
import {
  deriveLineFeedProgramExcitation,
  resetLineFeedProgramActivityState,
  resolveLineFeedProgramActivity,
} from "./lineFeedProgramActivity.js";

describe("lineFeedProgramActivity", () => {
  it("detects playing vs meter-idle pause signatures", () => {
    const bandState = {};
    resetLineFeedProgramActivityState(bandState, "system");

    const playing = resolveLineFeedProgramActivity({
      bandState,
      metrics: { avgAmplitude: 24, rms: 0.16, peakAmplitude: 0.9 },
      deltaMs: 33,
      analysisSessionKey: "system",
    });
    expect(playing.programActive).toBe(true);
    expect(playing.programExcitation).toBeGreaterThan(0.28);

    for (let frame = 0; frame < 120; frame += 1) {
      resolveLineFeedProgramActivity({
        bandState,
        metrics: {
          avgAmplitude: 1.2,
          rms: 0.0068,
          peakAmplitude: 0.02,
          transportSpectrumSilent: true,
        },
        deltaMs: 33,
        analysisSessionKey: "system",
      });
    }

    const paused = resolveLineFeedProgramActivity({
      bandState,
      metrics: {
        avgAmplitude: 1.24,
        rms: 0.0157,
        peakAmplitude: 0.34,
        transportSpectrumSilent: true,
      },
      deltaMs: 33,
      analysisSessionKey: "system",
    });
    expect(paused.programActive).toBe(false);
    expect(paused.programExcitation).toBeLessThan(0.28);
  });

  it("bridges brief near-zero dropouts while program was active", () => {
    const bandState = {};
    resetLineFeedProgramActivityState(bandState, "system");

    resolveLineFeedProgramActivity({
      bandState,
      metrics: { avgAmplitude: 38, rms: 0.28, peakAmplitude: 0.95 },
      deltaMs: 33,
      analysisSessionKey: "system",
    });

    for (let frame = 0; frame < 30; frame += 1) {
      const bridge = resolveLineFeedProgramActivity({
        bandState,
        metrics: { avgAmplitude: 0, rms: 0.00001, peakAmplitude: 0 },
        deltaMs: 33,
        analysisSessionKey: "system",
      });
      expect(bridge.programActive).toBe(true);
    }
  });

  it("derives higher excitation above calibrated device floor", () => {
    const low = deriveLineFeedProgramExcitation(
      { avgAmplitude: 1.2, rms: 0.0068, peakAmplitude: 0.01 },
      { deviceFloorAvg: 1.15, deviceFloorRms: 0.006, deviceFloorPeak: 0.01 },
    );
    const high = deriveLineFeedProgramExcitation(
      { avgAmplitude: 24, rms: 0.16, peakAmplitude: 0.85 },
      { deviceFloorAvg: 1.15, deviceFloorRms: 0.006, deviceFloorPeak: 0.01 },
    );
    expect(high).toBeGreaterThan(low);
  });
});
