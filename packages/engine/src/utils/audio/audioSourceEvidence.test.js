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
        sourceKind: "file",
        hasAnalysisSource: true,
        isPlaying: true,
        metrics: {
          avgAmplitude: 84,
          analyserRms: 0.24,
          fftPeakAmplitude: 0.42,
          spectralEffectiveBinCount: 8,
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
        sourceKind: "file",
        hasAnalysisSource: true,
        isPlaying: false,
        fileMuted: true,
        metrics: {
          avgAmplitude: 84,
          analyserRms: 0.24,
          fftPeakAmplitude: 0.42,
          spectralEffectiveBinCount: 8,
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
        sourceKind: "system",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isAcousticLiveInput: true,
        liveInputHardSilenceActive: true,
        metrics: {
          avgAmplitude: 0.2,
          analyserRms: 0.001,
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
        },
      },
      {
        sourceKind: "system",
        analysisClass: "acoustic-mic",
        sourceBoundaryState: "muted",
        currentSourceEvidence: false,
      },
    ],
    [
      "system line-feed active",
      {
        sourceKind: "system",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isLineFeedLiveInput: true,
        lineFeedProgramActive: true,
        metrics: {
          avgAmplitude: 52,
          analyserRms: 0.08,
          fftPeakAmplitude: 0.26,
          spectralEffectiveBinCount: 6,
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
        sourceKind: "system",
        hasAnalysisSource: true,
        isLiveInputActive: true,
        isLineFeedLiveInput: true,
        lineFeedProgramActive: false,
        metrics: {
          avgAmplitude: 1.2,
          analyserRms: 0.01,
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
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
        sourceKind: "file",
        hasAnalysisSource: false,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
        },
      },
      {
        sourceKind: "file",
        analysisClass: "file",
        sourceBoundaryState: "absent",
        currentSourceEvidence: false,
      },
    ],
    [
      "test tone",
      {
        sourceKind: "file",
        hasAnalysisSource: false,
        injectTestTone: true,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
        },
      },
      {
        sourceKind: "file",
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
      sourceKind: "system",
      hasAnalysisSource: true,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 1.2,
        analyserRms: 0.01,
        fftPeakAmplitude: 0,
        spectralEffectiveBinCount: 0,
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
            fftPeakAmplitude: 0,
            spectralEffectiveBinCount: 0,
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

  it("uses modal response only after spectral source evidence remains live", () => {
    const quietLiveEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0.04,
        analyserRms: 0.001,
        fftPeakAmplitude: 0.004,
        credibleSpectralPeakCount: 1,
        spectralEffectiveBinCount: 1,
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

  it("treats weak file meter-only fade residue as zero source evidence", () => {
    const fadeResidueEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 2.5,
        analyserRms: 0.01,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0,
        spectralEffectiveBinCount: 0,
      },
    });

    expect(fadeResidueEvidence).toMatchObject({
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: fadeResidueEvidence,
        modalResponse: {
          modalResponseEnergy: 0.35,
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

  it("keeps waveform-backed file evidence live after FFT detail disappears", () => {
    const waveformEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0.18,
        analyserRms: 0.0008,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0.006,
        spectralEffectiveBinCount: 0,
      },
    });

    expect(waveformEvidence).toMatchObject({
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
    });
    expect(waveformEvidence.sourceEnergy).toBeGreaterThan(0);
  });

  it("treats file analyser residue without meter or spectrum as zero source evidence", () => {
    const residualEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0.002138553954931318,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0.003,
        spectralEffectiveBinCount: 0,
      },
    });

    expect(residualEvidence).toMatchObject({
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("owns weak file modal suppression policy at the source boundary", () => {
    const weakFileEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 8,
        analyserRms: 0.018,
        fftPeakAmplitude: 0.02,
        spectralEffectiveBinCount: 12,
      },
    });
    const strongFileEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 18,
        analyserRms: 0.06,
        fftPeakAmplitude: 0.2,
        spectralEffectiveBinCount: 12,
      },
    });
    const lineFeedEvidence = buildAudioSourceEvidenceFrame({
      sourceKind: "system",
      hasAnalysisSource: true,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: true,
      metrics: {
        avgAmplitude: 8,
        analyserRms: 0.018,
        fftPeakAmplitude: 0.02,
        spectralEffectiveBinCount: 12,
      },
    });

    expect(weakFileEvidence.modalObservationPolicy).toMatchObject({
      suppressWeakSpectralFallbackDrive: true,
    });
    expect(strongFileEvidence.modalObservationPolicy).toMatchObject({
      suppressWeakSpectralFallbackDrive: false,
    });
    expect(lineFeedEvidence.modalObservationPolicy).toMatchObject({
      suppressWeakSpectralFallbackDrive: false,
    });
  });

  it("lets the line-feed activity owner bridge brief zero-valued frames", () => {
    const evidence = buildAudioSourceEvidenceFrame({
      sourceKind: "system",
      hasAnalysisSource: true,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0.00001,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0,
        spectralEffectiveBinCount: 0,
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
      sourceKind: "file",
      hasAnalysisSource: true,
      isPlaying: true,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0,
        fftPeakAmplitude: 0,
        spectralEffectiveBinCount: 0,
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

  it("keeps a naturally completed file open as zero force during modal ring-down", () => {
    const collected = collectAudioSourceEvidenceInputs({
      sourceKind: "file",
      status: {
        hasAnalysisSource: true,
        isPlaying: false,
        lastPlaybackEndReason: "natural",
        naturalRingdownActive: true,
      },
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0,
        spectralEffectiveBinCount: 0,
      },
    });
    const evidence = buildAudioSourceEvidenceFrame(collected);

    expect(collected.naturalRingdownActive).toBe(true);
    expect(evidence).toMatchObject({
      sourceKind: "file",
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      transport: {
        naturalRingdownActive: true,
        fileMuted: false,
      },
    });
    expect(
      resolveAudioRenderBoundary({
        sourceEvidence: evidence,
        modalResponse: {
          modalResponseEnergy: 0.4,
          modalResponseInputEnergy: 0,
        },
      }),
    ).toMatchObject({
      rawSourceBoundaryState: "zero",
      renderBoundaryState: "zero",
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    });
  });

  it("collects transport facts before semantic source evidence resolution", () => {
    const fftLinearAmplitudes = new Float32Array([0, 0.4, 0, 0.2]);
    const collected = collectAudioSourceEvidenceInputs({
      sourceKind: "system",
      status: {
        hasAnalysisSource: false,
        isPlaying: false,
        isLiveInputActive: true,
      },
      analysisSnapshot: { fftLinearAmplitudes },
      includeSnapshotAsAnalysisSource: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 18,
        analyserRms: 0.07,
        fftPeakAmplitude: 0.4,
        spectralEffectiveBinCount: 2,
      },
    });

    expect(collected).toMatchObject({
      sourceKind: "system",
      hasAnalysisSource: true,
      isPlaying: false,
      isLiveInputActive: true,
      isLineFeedLiveInput: true,
      lineFeedProgramActive: false,
      metrics: {
        avgAmplitude: 18,
        analyserRms: 0.07,
        fftPeakAmplitude: 0.4,
        spectralEffectiveBinCount: 2,
      },
    });
    expect(buildAudioSourceEvidenceFrame(collected)).toMatchObject({
      sourceKind: "system",
      analysisClass: "line-feed",
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
    });
  });

  it("carries explicit playback stop through transport evidence", () => {
    const collected = collectAudioSourceEvidenceInputs({
      sourceKind: "file",
      status: {
        hasAnalysisSource: false,
        isPlaying: false,
        isLiveInputActive: false,
        lastPlaybackEndReason: "stopped",
      },
    });

    expect(collected).toMatchObject({
      sourceKind: "file",
      hasAnalysisSource: false,
      isPlaying: false,
      isLiveInputActive: false,
      playbackEndReason: "stopped",
    });
    expect(buildAudioSourceEvidenceFrame(collected)).toMatchObject({
      sourceKind: "file",
      sourceBoundaryState: "absent",
      currentSourceEvidence: false,
      transport: {
        playing: false,
        liveInputActive: false,
        playbackEndReason: "stopped",
      },
    });
  });
});
