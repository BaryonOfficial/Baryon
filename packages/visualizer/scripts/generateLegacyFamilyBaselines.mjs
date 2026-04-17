import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildAudioFeatureFrame,
  createAudioFeatureState,
} from "../src/utils/audio/buildFeatureFrame.js";
import { LEGACY_FAMILY_FIXTURES } from "../src/utils/audio/__fixtures__/legacyFamilyFixtureDefinitions.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;
const FRAME_STEP_MS = 33;
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/utils/audio/__fixtures__/legacy-family-baselines.json",
);

function createStatus() {
  return {
    audioInputMode: "file",
    analysisSource: "file",
    pitchSourceMode: "spectral",
    fftSize: FFT_SIZE,
    capacity: 16,
    sampleRate: SAMPLE_RATE,
    isAudioLoaded: true,
    isPlaying: true,
    isLiveInputActive: false,
    hasAnalysisSource: true,
    workerStatus: null,
    liveInputCalibrationVersion: 0,
  };
}

function createSnapshot(overrides = {}) {
  return {
    sourceMode: "file",
    avgAmplitude: 24,
    fftMagnitudes: new Float32Array(BIN_COUNT),
    timeData: new Float32Array(FFT_SIZE),
    rms: 0.2,
    ...overrides,
  };
}

function freqToBin(freq) {
  return Math.round((freq / NYQUIST) * (BIN_COUNT - 1));
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    fft[Math.max(1, freqToBin(frequency))] = amplitude;
  }
  return fft;
}

function makeTimeData({
  frequency,
  amplitude = 0.45,
  harmonics = [],
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    const t = index / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t) * amplitude;
    for (const [multiple, harmonicAmplitude] of harmonics) {
      sample +=
        Math.sin(2 * Math.PI * frequency * multiple * t) * harmonicAmplitude;
    }
    timeData[index] = Math.max(-1, Math.min(1, sample));
  }
  return timeData;
}

function runFixtureBaseline(fixture) {
  const featureState = createAudioFeatureState();
  let frame = null;

  for (
    let frameIndex = 0;
    frameIndex < (fixture.frameCount ?? 4);
    frameIndex += 1
  ) {
    frame = buildAudioFeatureFrame({
      analysisSnapshot: createSnapshot({
        avgAmplitude: fixture.avgAmplitude,
        fftMagnitudes: makeFft(fixture.peaks),
        timeData: fixture.timeData
          ? makeTimeData(fixture.timeData)
          : new Float32Array(FFT_SIZE),
        rms: fixture.rms,
      }),
      featureState,
      radius: 3,
      status: createStatus(),
      frameTimeMs: frameIndex * FRAME_STEP_MS,
      structuralImplementation: "dual",
      legacyPeakSelectionMode: "raw",
      analysisHints: fixture.analysisHints ?? null,
    });
  }

  return {
    activeModeCountDelta:
      frame?.debug?.structuralComparison?.activeModeCountDelta ?? 0,
    lowOrderModalEnergyDelta:
      frame?.debug?.structuralComparison?.lowOrderModalEnergyDelta ?? 0,
    modalPersistenceDelta:
      frame?.debug?.structuralComparison?.modalPersistenceDelta ?? 0,
    modeCoherenceDelta:
      frame?.debug?.structuralComparison?.modeCoherenceDelta ?? 0,
  };
}

const baselines = {
  generatedAt: new Date().toISOString(),
  baselineSelectionMode: "raw",
  fixtures: Object.fromEntries(
    LEGACY_FAMILY_FIXTURES.map((fixture) => [
      fixture.name,
      runFixtureBaseline(fixture),
    ]),
  ),
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(
  `${OUTPUT_PATH}`,
  `${JSON.stringify(baselines, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote ${OUTPUT_PATH}`);
