import { describe, expect, it } from "vitest";

import {
  AUDIO_SOURCE_EVIDENCE_VERSION,
  buildAudioSourceEvidenceFrame,
  resolveAudioRenderBoundary,
} from "./audioSourceEvidence.js";

describe("audio source evidence", () => {
  it.each([
    [
      "file playing",
      {
        inputMode: "file",
        hasAnalysisSource: true,
        isPlaying: true,
        metrics: {
          avgAmplitude: 84,
          analyserRms: 0.24,
          preModalFftPeak: 0.42,
          nonZeroFftBinCount: 8,
        },
      },
      {
        sourceKind: "file",
        analysisClass: "file",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
      },
    ],
    [
      "file paused",
      {
        inputMode: "file",
        hasAnalysisSource: true,
        isPlaying: false,
        fileMuted: true,
        metrics: {
          avgAmplitude: 84,
          analyserRms: 0.24,
          preModalFftPeak: 0.42,
          nonZeroFftBinCount: 8,
        },
      },
      {
        sourceKind: "file",
        analysisClass: "file",
        sourceBoundaryState: "muted",
        currentSourceEvidence: false,
      },
    ],
    [
      "acoustic mic hard silence",
      {
        inputMode: "live",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isAcousticLiveInput: true,
        liveInputHardSilenceActive: true,
        metrics: {
          avgAmplitude: 0.2,
          analyserRms: 0.001,
          preModalFftPeak: 0,
          nonZeroFftBinCount: 0,
        },
      },
      {
        sourceKind: "mic",
        analysisClass: "acoustic-mic",
        sourceBoundaryState: "muted",
        currentSourceEvidence: false,
      },
    ],
    [
      "system line-feed active",
      {
        inputMode: "system",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isLineFeedLiveInput: true,
        lineFeedProgramActive: true,
        metrics: {
          avgAmplitude: 52,
          analyserRms: 0.08,
          preModalFftPeak: 0.26,
          nonZeroFftBinCount: 6,
        },
      },
      {
        sourceKind: "system",
        analysisClass: "line-feed",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
      },
    ],
    [
      "system line-feed paused",
      {
        inputMode: "system",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isLineFeedLiveInput: true,
        lineFeedProgramActive: false,
        metrics: {
          avgAmplitude: 1.2,
          analyserRms: 0.01,
          preModalFftPeak: 0,
          nonZeroFftBinCount: 0,
        },
      },
      {
        sourceKind: "system",
        analysisClass: "line-feed",
        sourceBoundaryState: "muted",
        currentSourceEvidence: false,
      },
    ],
    [
      "absent input",
      {
        inputMode: "idle",
        hasAnalysisSource: false,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          preModalFftPeak: 0,
          nonZeroFftBinCount: 0,
        },
      },
      {
        sourceKind: "none",
        analysisClass: "none",
        sourceBoundaryState: "absent",
        currentSourceEvidence: false,
      },
    ],
    [
      "test tone",
      {
        inputMode: "idle",
        hasAnalysisSource: false,
        injectTestTone: true,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          preModalFftPeak: 0,
          nonZeroFftBinCount: 0,
        },
      },
      {
        sourceKind: "test",
        analysisClass: "test",
        sourceBoundaryState: "live",
        currentSourceEvidence: true,
      },
    ],
  ])("normalizes %s", (_name, input, expected) => {
    const evidence = buildAudioSourceEvidenceFrame(input);

    expect(evidence.ownerVersion).toBe(AUDIO_SOURCE_EVIDENCE_VERSION);
    expect(evidence).toMatchObject(expected);
    if (expected.currentSourceEvidence) {
      expect(evidence.sourceEnergy).toBeGreaterThan(0);
    } else {
      expect(evidence.sourceEnergy).toBe(0);
    }
  });

  it("does not let observer continuity reopen a muted system boundary", () => {
    const evidence = buildAudioSourceEvidenceFrame({
      inputMode: "system",
      hasAnalysisSource: true,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 1.2,
        analyserRms: 0.01,
        preModalFftPeak: 0,
        nonZeroFftBinCount: 0,
      },
    });

    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: evidence,
        modalResponse: { modalResponseInputEnergy: 0.4 },
        observerContinuity: true,
      }),
    ).toMatchObject({
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("uses modal response only after the source boundary remains live", () => {
    const quietLiveEvidence = buildAudioSourceEvidenceFrame({
      inputMode: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0.01,
        analyserRms: 0,
        preModalFftPeak: 0,
        nonZeroFftBinCount: 0,
      },
    });

    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: quietLiveEvidence,
        modalResponse: { modalResponseInputEnergy: 0.2 },
      }),
    ).toMatchObject({
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
    });
  });

  it("keeps retained modal energy diagnostic-only when current source evidence is zero", () => {
    const zeroEvidence = buildAudioSourceEvidenceFrame({
      inputMode: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0,
        preModalFftPeak: 0,
        nonZeroFftBinCount: 0,
      },
    });

    expect(zeroEvidence.sourceBoundaryState).toBe("zero");
    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: zeroEvidence,
        modalResponse: {
          modalResponseEnergy: 0.4,
          modalResponseInputEnergy: 0,
        },
        observerContinuity: true,
      }),
    ).toMatchObject({
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });
});
