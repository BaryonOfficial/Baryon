import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildAudioFeatureFrame,
  createAudioFeatureState,
} from "./buildFeatureFrame.js";
import { reviveSerializedReplayFrames } from "./replayFixture.js";

function loadDensePolyphonicFixture() {
  return JSON.parse(
    readFileSync(
      new URL("./fixtures/dense-polyphonic-12s.json", import.meta.url),
      "utf8",
    ),
  );
}

describe("replay fixtures", () => {
  it("ships the dense polyphonic visual-acceptance fixture named by the caustic spec", () => {
    const fixture = loadDensePolyphonicFixture();
    const frames = reviveSerializedReplayFrames(fixture.frames);

    expect(fixture.name).toBe("dense-polyphonic-12s");
    expect(fixture.durationMs).toBe(12000);
    expect(frames).toHaveLength(3);
    expect(frames[0].frameTimeMs).toBe(0);
    expect(frames.at(-1).frameTimeMs).toBe(12000);

    for (const frame of frames) {
      expect(frame.status.isPlaying).toBe(true);
      expect(frame.status.analysisSource).toBe("file");
      expect(frame.analysisSnapshot.fftMagnitudes).toBeInstanceOf(Float32Array);
      expect(frame.analysisSnapshot.timeData).toBeInstanceOf(Uint8Array);
      expect(frame.analysisSnapshot.fftMagnitudes.length).toBeGreaterThan(64);
      expect(frame.analysisSnapshot.timeData.length).toBeGreaterThan(64);
      expect(
        frame.analysisSnapshot.fftMagnitudes.filter((value) => value > 0.2)
          .length,
      ).toBeGreaterThanOrEqual(8);
    }
  });

  it("replays the dense polyphonic fixture as active file-driven feature frames", () => {
    const fixture = loadDensePolyphonicFixture();
    const frames = reviveSerializedReplayFrames(fixture.frames);
    const featureState = createAudioFeatureState();

    for (const frame of frames) {
      const featureFrame = buildAudioFeatureFrame({
        analysisSnapshot: frame.analysisSnapshot,
        featureState,
        radius: 3,
        status: frame.status,
        frameTimeMs: frame.frameTimeMs,
      });

      expect(featureFrame.debug.analysisSourceUsed).toBe("file");
      expect(featureFrame.fieldState).toBe("active");
      expect(featureFrame.debug.modeSlotCount).toBeGreaterThan(0);
      // Loosened from 0.035 after correcting FFT bin↔frequency mapping.
      expect(featureFrame.modalVisibilityEnergy).toBeGreaterThan(0.03);
      expect(featureFrame.modalResponseEnergy).toBeGreaterThan(0);
      expect(
        featureFrame.debug.modalResponseSourceCoupledEnergy,
      ).toBeGreaterThan(0);
    }
  });
});
