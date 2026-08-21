import { describe, expect, it } from "vitest";
import {
  advanceObservedModalModes,
  getModalObserverProfile,
} from "./modalObservedState.js";

describe("modal observed state", () => {
  it("resolves each observer profile by its canonical render-layer name", () => {
    expect(getModalObserverProfile("source-coupled").layer).toBe(
      "source-coupled",
    );
    expect(getModalObserverProfile("resonant").layer).toBe("resonant");
  });

  it("rejects unknown observer layers instead of treating them as resonant", () => {
    expect(() => getModalObserverProfile("sourceCoupled")).toThrow(
      "Unknown modal observer layer: sourceCoupled",
    );
  });

  it("releases stale confidence within a few windows independently of modal Q", () => {
    const createMode = (modeKey, qualityFactor) => ({
      modeKey,
      familyId: `family:${modeKey}`,
      u: 1,
      v: 1,
      w: 1,
      naturalFrequencyHz: 220,
      layer: "source-coupled",
      renderLayer: "source-coupled",
      sourceCouplingEnergy: 1,
      qualityFactor,
    });
    const modes = [createMode("low-q", 8), createMode("high-q", 800)];
    const previousModes = new Map(
      modes.map((mode) => [
        mode.modeKey,
        {
          ...mode,
          observationConfidence: 1,
          coherence: 1,
          phase: 0,
          firstObservedAtMs: 0,
          lastObservedAtMs: 0,
        },
      ]),
    );

    const result = advanceObservedModalModes({
      previousModes,
      atlas: modes,
      driveAnalysis: {
        driveBuffer: new Float32Array(1024),
        drivePeak: 0,
        driveSource: "time-domain",
        periodicity: 0,
        tonalness: 0,
        distributedExcitation: 0,
        dominantDriveFrequencyHz: 0,
        dominantDriveSpectralSupport: 0,
      },
      fftLinearAmplitudes: new Float32Array(2048),
      sampleRate: 48000,
      fftSize: 4096,
      currentFrameAtMs: 96,
      deltaMs: 96,
      sourceCoupledCapacity: 2,
      resonantCapacity: 1,
      allowBassHarmonicDriver: false,
      hardSilentFrame: true,
      suppressWeakSpectralFallbackDrive: false,
    });

    const lowQConfidence =
      result.observedModes.get("low-q")?.observationConfidence ?? 0;
    const highQConfidence =
      result.observedModes.get("high-q")?.observationConfidence ?? 0;

    expect(lowQConfidence).toBeLessThan(0.08);
    expect(highQConfidence).toBeCloseTo(lowQConfidence, 12);
    expect(result.observedModes.get("low-q")).not.toHaveProperty("amplitude");
    expect(result.observedModes.get("low-q")).not.toHaveProperty(
      "displayProjectionAmplitude",
    );
    expect(result.observedModes.get("low-q")).not.toHaveProperty(
      "retainedEnergy",
    );
  });
});
