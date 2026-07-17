import { describe, expect, it, vi } from "vitest";
import {
  createNodeAnalyser,
  sampleAnalyser,
} from "../../core/audio/analyserSampler.js";
import {
  createFeatureWorkerState,
  processFeatureWorkerFrame,
} from "./audioFeatureEngine.worker.js";
import { AUDIO_SLOT_CAPACITY } from "../../defaults.js";

const SAMPLE_RATE = 44100;

function createStatus(sessionKey) {
  return {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: 8192,
    fastFftSize: 2048,
    capacity: AUDIO_SLOT_CAPACITY,
    sampleRate: SAMPLE_RATE,
    isAudioLoaded: true,
    isPlaying: true,
    isPlaybackPaused: false,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    playbackSourceSessionId: 1,
    playbackSessionId: 1,
    sessionKey,
    lastPlaybackEndReason: null,
  };
}

function createDbAnalyserSnapshot({
  fftSize,
  frequencyHz,
  peakDecibels,
  floorDecibels = -90,
}) {
  const frequencyBinCount = fftSize / 2;
  const centerBin = Math.max(
    1,
    Math.min(
      frequencyBinCount - 2,
      Math.round((frequencyHz * fftSize) / SAMPLE_RATE),
    ),
  );
  const signalAmplitude = 10 ** (peakDecibels / 20);
  const analyserNode = {
    fftSize: 0,
    frequencyBinCount,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -30,
    getFloatFrequencyData(data) {
      data.fill(floorDecibels);
      data[centerBin - 1] = peakDecibels - 6;
      data[centerBin] = peakDecibels;
      data[centerBin + 1] = peakDecibels - 8;
    },
    getFloatTimeDomainData(data) {
      for (let index = 0; index < data.length; index += 1) {
        data[index] =
          Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE) *
          signalAmplitude;
      }
    },
  };
  const analyser = createNodeAnalyser(
    { createAnalyser: () => analyserNode },
    { connect: vi.fn() },
    fftSize,
  );
  return { sourceMode: "file", ...sampleAnalyser(analyser) };
}

function createBroadbandDbSnapshot(fftSize, seed = 0x51a7e) {
  const frequencyBinCount = fftSize / 2;
  const amplitudes = new Float32Array(frequencyBinCount);
  let state = seed >>> 0;
  for (let index = 0; index < amplitudes.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    amplitudes[index] = -60 + (state / 0x100000000 - 0.5) * 3;
  }
  const analyserNode = {
    fftSize: 0,
    frequencyBinCount,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -30,
    getFloatFrequencyData(data) {
      data.set(amplitudes);
    },
    getFloatTimeDomainData(data) {
      let waveformState = (seed ^ 0x9e3779b9) >>> 0;
      for (let index = 0; index < data.length; index += 1) {
        waveformState = (Math.imul(waveformState, 1664525) + 1013904223) >>> 0;
        data[index] =
          (waveformState / 0x100000000 - 0.5) * 2 * 10 ** (-60 / 20);
      }
    },
  };
  const analyser = createNodeAnalyser(
    { createAnalyser: () => analyserNode },
    { connect: vi.fn() },
    fftSize,
  );
  return { sourceMode: "file", ...sampleAnalyser(analyser) };
}

function runStructuralSequence({
  sessionKey,
  fastSnapshot,
  structuralSnapshot,
  frameCount = 8,
}) {
  const state = createFeatureWorkerState();
  state.sourceGeneration = 1;
  state.workerGeneration = 1;
  state.configuration = { radius: 1, includeSpectralLight: true };
  let result = null;
  let latestTopology = null;
  for (let index = 0; index < frameCount; index += 1) {
    result = processFeatureWorkerFrame(state, {
      frameId: index + 1,
      sourceGeneration: 1,
      workerGeneration: 1,
      captureTimestampMs: (index + 1) * 66,
      fastPayload: fastSnapshot,
      structuralPayload: structuralSnapshot,
      structuralRequested: true,
      status: createStatus(sessionKey),
    });
    latestTopology = result.topologyPacket ?? latestTopology;
  }
  return { state, result, latestTopology };
}

describe("linear spectrum worker integration", () => {
  for (const frequencyHz of [102.537, 477.286, 1346.068]) {
    it(`keeps an equal-level ${frequencyHz} Hz tone render-authoritative`, () => {
      const run = runStructuralSequence({
        sessionKey: `file:tone:${frequencyHz}`,
        fastSnapshot: createDbAnalyserSnapshot({
          fftSize: 2048,
          frequencyHz,
          peakDecibels: -48,
        }),
        structuralSnapshot: createDbAnalyserSnapshot({
          fftSize: 8192,
          frequencyHz,
          peakDecibels: -48,
        }),
      });

      expect(run.latestTopology).not.toBeNull();
      expect(["complete", "capacity-limited"]).toContain(
        run.state.latestFeatureFrame.modalDescriptor.fieldAuthority,
      );
      expect(run.result.drivePacket.activeModeCount).toBeGreaterThan(0);
      expect(
        Array.from(run.result.drivePacket.modalCoefficients).some(
          (coefficient) => Math.abs(coefficient) > 0,
        ),
      ).toBe(true);
      expect(run.result.drivePacket.renderState.renderAuthority).toBe(true);
      expect(
        run.state.committedModes.every(
          (mode) =>
            Number.isFinite(mode.naturalFrequencyHz) &&
            mode.naturalFrequencyHz > 0,
        ),
      ).toBe(true);
    });
  }

  it("keeps a quiet soprano-range cavity mode alive on the linear scale", () => {
    const run = runStructuralSequence({
      sessionKey: "file:soprano:quiet",
      fastSnapshot: createDbAnalyserSnapshot({
        fftSize: 2048,
        frequencyHz: 1346.068,
        peakDecibels: -54,
      }),
      structuralSnapshot: createDbAnalyserSnapshot({
        fftSize: 8192,
        frequencyHz: 1346.068,
        peakDecibels: -54,
      }),
    });

    expect(run.state.latestAnalysisResult.fftPeakAmplitude).toBeLessThan(0.09);
    expect(run.result.drivePacket.activeModeCount).toBeGreaterThan(0);
    expect(run.result.drivePacket.renderState.renderAuthority).toBe(true);
  });

  it("does not promote seeded broadband analyser noise into render authority", () => {
    const run = runStructuralSequence({
      sessionKey: "file:broadband-noise",
      fastSnapshot: createBroadbandDbSnapshot(2048),
      structuralSnapshot: createBroadbandDbSnapshot(8192),
    });

    expect(
      run.state.latestAnalysisResult.preparedInputs.sourceEvidence,
    ).toMatchObject({
      sourceBoundaryState: "zero",
      currentSourceEvidence: false,
    });
    expect(run.result.drivePacket.activeModeCount).toBe(0);
    expect(run.result.drivePacket.renderState.energyLedger).toMatchObject({
      projectedRenderEnergy: 0,
      renderAuthority: false,
    });
    expect(run.result.drivePacket.renderState.renderAuthority).toBe(false);
  });

  it("survives repeated structural frames with zero continuity metadata", () => {
    expect(() =>
      runStructuralSequence({
        sessionKey: "file:metadata-regression",
        fastSnapshot: createDbAnalyserSnapshot({
          fftSize: 2048,
          frequencyHz: 440,
          peakDecibels: -18,
        }),
        structuralSnapshot: createDbAnalyserSnapshot({
          fftSize: 8192,
          frequencyHz: 440,
          peakDecibels: -18,
        }),
        frameCount: 4,
      }),
    ).not.toThrow();
  });
});
