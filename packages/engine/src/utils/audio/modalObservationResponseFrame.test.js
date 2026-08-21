import { describe, expect, it } from "vitest";

import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";
import { LIVE_INPUT_ANALYSIS_CLASSES } from "../../core/audio/liveInputAnalysis.js";
import { isModalExcitationHardSilentFrame } from "./modalObservationResponseFrame.js";

function createPreparedInputs(overrides = {}) {
  return {
    sourceKind: AUDIO_SOURCE_KINDS.file,
    analyserRms: 0,
    fftPeakAmplitude: 0,
    fftLinearAmplitudesSource: new Float32Array(8),
    ...overrides,
  };
}

describe("isModalExcitationHardSilentFrame", () => {
  it("uses the line-feed zero-spectrum RMS allowance only at that boundary", () => {
    const lineFeed = createPreparedInputs({
      sourceKind: AUDIO_SOURCE_KINDS.system,
      resolvedLiveInputAnalysisClass: LIVE_INPUT_ANALYSIS_CLASSES.lineFeed,
      analyserRms: 0.006,
    });
    const file = createPreparedInputs({
      sourceKind: AUDIO_SOURCE_KINDS.file,
      analyserRms: 0.006,
    });

    expect(isModalExcitationHardSilentFrame(lineFeed)).toBe(true);
    expect(isModalExcitationHardSilentFrame(file)).toBe(false);
  });

  it("does not classify a line-feed frame with spectral energy as hard silent", () => {
    const fftLinearAmplitudesSource = new Float32Array(8);
    fftLinearAmplitudesSource[2] = 0.2;

    expect(
      isModalExcitationHardSilentFrame(
        createPreparedInputs({
          sourceKind: AUDIO_SOURCE_KINDS.system,
          resolvedLiveInputAnalysisClass: LIVE_INPUT_ANALYSIS_CLASSES.lineFeed,
          analyserRms: 0.002,
          fftPeakAmplitude: 0.2,
          fftLinearAmplitudesSource,
        }),
      ),
    ).toBe(false);
  });
});
