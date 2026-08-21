import { describe, expect, it } from "vitest";
import {
  FAST_MODAL_DRIVE_PROBE_LIMIT,
  FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  createFastModalDriveEstimator,
} from "../utils/audio/fastModalDriveEstimator.js";
import { createFastModalBenchmarkCommittedModes } from "./fastModalBenchmarkFixture.js";

describe("fast-modal benchmark fixture", () => {
  it("builds one complete apparatus-derived estimator contract", () => {
    const sampleRate = 48000;
    const committedModes = createFastModalBenchmarkCommittedModes();
    expect(committedModes).toHaveLength(FAST_MODAL_DRIVE_PROBE_LIMIT);
    expect(
      committedModes.every(
        (mode) =>
          typeof mode.modeKey === "string" &&
          mode.naturalFrequencyHz > 0 &&
          mode.naturalFrequencyHz < sampleRate / 2 &&
          mode.qualityFactor > 0 &&
          mode.physicalTransfer >= 0 &&
          mode.physicalTransfer <= 1,
      ),
    ).toBe(true);

    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate,
    });
    const stableTargetBuffer = estimator.result.targetEnergyByMode;
    const result = estimator.evaluate(
      new Float32Array(FAST_MODAL_DRIVE_WINDOW_SAMPLES),
      0.8,
    );

    expect(result.probeCount).toBe(FAST_MODAL_DRIVE_PROBE_LIMIT);
    expect(result.targetEnergyByMode).toBe(stableTargetBuffer);
    expect(Array.from(result.targetEnergyByMode)).toEqual(
      Array(FAST_MODAL_DRIVE_PROBE_LIMIT).fill(0),
    );
  });
});
