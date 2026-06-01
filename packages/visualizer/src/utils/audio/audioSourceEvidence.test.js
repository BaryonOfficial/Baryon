import { describe, expect, it } from "vitest";

import {
  AUDIO_SOURCE_EVIDENCE_VERSION,
  buildAudioSourceEvidenceFrame,
  collectAudioSourceEvidenceInputs,
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
      }),
    ).toMatchObject({
      rawSourceBoundaryState: "muted",
      renderBoundaryState: "muted",
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("does not let modal response energy create current source evidence", () => {
    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: {
          ownerVersion: AUDIO_SOURCE_EVIDENCE_VERSION,
          sourceKind: "system",
          analysisClass: "line-feed",
          sourceBoundaryState: "live",
          currentSourceEvidence: false,
          sourceEnergy: 0,
          metrics: {
            avgAmplitude: 0,
            analyserRms: 0,
            preModalFftPeak: 0,
            nonZeroFftBinCount: 0,
          },
          transport: {
            playing: false,
            liveInputActive: true,
            fileMuted: false,
            lineFeedProgramActive: true,
            micHardSilence: false,
          },
        },
        modalResponse: { modalResponseInputEnergy: 0.4 },
      }),
    ).toMatchObject({
      rawSourceBoundaryState: "live",
      renderBoundaryState: "zero",
      sourceBoundaryState: "zero",
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
        avgAmplitude: 0.04,
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
      rawSourceBoundaryState: "live",
      renderBoundaryState: "live",
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
    });
  });

  it("treats file analyser residue without meter or spectrum as zero source evidence", () => {
    const residualEvidence = buildAudioSourceEvidenceFrame({
      inputMode: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0.002138553954931318,
        preModalFftPeak: 0,
        timeDomainPeakAmplitude: 0.003,
        nonZeroFftBinCount: 0,
      },
    });

    expect(residualEvidence).toMatchObject({
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("lets the line-feed activity owner bridge brief zero-valued frames", () => {
    const evidence = buildAudioSourceEvidenceFrame({
      inputMode: "system",
      hasAnalysisSource: true,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0.00001,
        preModalFftPeak: 0,
        timeDomainPeakAmplitude: 0,
        nonZeroFftBinCount: 0,
      },
    });

    expect(evidence).toMatchObject({
      sourceKind: "system",
      analysisClass: "line-feed",
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
      }),
    ).toMatchObject({
      rawSourceBoundaryState: "zero",
      renderBoundaryState: "muted",
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("collects transport facts before semantic source evidence resolution", () => {
    const fftMagnitudes = new Float32Array([0, 0.4, 0, 0.2]);
    const collected = collectAudioSourceEvidenceInputs({
      inputMode: "system",
      status: {
        hasAnalysisSource: false,
        isPlaying: false,
        isLiveInputActive: true,
      },
      analysisSnapshot: { fftMagnitudes },
      includeSnapshotAsAnalysisSource: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 18,
        analyserRms: 0.07,
        preModalFftPeak: 0.4,
        nonZeroFftBinCount: 2,
      },
    });

    expect(collected).toMatchObject({
      inputMode: "system",
      hasAnalysisSource: true,
      isPlaying: false,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 18,
        analyserRms: 0.07,
        preModalFftPeak: 0.4,
        nonZeroFftBinCount: 2,
      },
    });
    expect(buildAudioSourceEvidenceFrame(collected)).toMatchObject({
      sourceKind: "system",
      analysisClass: "line-feed",
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
    });
  });
});
