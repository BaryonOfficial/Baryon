import { describe, expect, it } from "vitest";
import {
  LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ,
  getLegacyAnalysisFloorHz,
  getLegacyAnalysisRadius,
  getMinimumCavityFrequency,
} from "../../utils/cavityModes.js";
import { createModalTargetBuild } from "./modalStack.js";
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromPeakDrivers,
  buildModalSlotsFromSpectralPeaks,
  writeModalSlotsFromFundamental,
  writeModalSlotsFromPeakDrivers,
  writeModalSlotsFromSpectralPeaks,
} from "./modalResolvers.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;

function freqToBin(frequency) {
  return Math.round((frequency / NYQUIST) * (BIN_COUNT - 1));
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    fft[Math.max(1, freqToBin(frequency))] = amplitude;
  }
  return fft;
}

function expectTargetBuildToMatch(actual, expected) {
  expect(Array.from(actual.slots)).toEqual(Array.from(expected.slots));
  expect(Array.from(actual.referenceSlots)).toEqual(
    Array.from(expected.referenceSlots),
  );
  expect(Array.from(actual.colorSlots)).toEqual(
    Array.from(expected.colorSlots),
  );
  expect(Array.from(actual.harmonicSupport)).toEqual(
    Array.from(expected.harmonicSupport),
  );
  expect(actual.uniqueModeCount).toBe(expected.uniqueModeCount);
  expect(actual.components).toEqual(expected.components);
  expect(actual.peaks).toEqual(expected.peaks);
}

function readModeKeys(targetBuild) {
  const modeKeys = [];
  for (let index = 0; index < targetBuild.slots.length; index += 4) {
    const amplitude = targetBuild.slots[index + 3] ?? 0;
    if (amplitude <= 0) {
      continue;
    }
    modeKeys.push(
      `${targetBuild.slots[index]}:${targetBuild.slots[index + 1]}:${targetBuild.slots[index + 2]}`,
    );
  }
  return modeKeys;
}

describe("modal resolver writers", () => {
  it("matches the allocating fundamental resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.86],
      [220, 0.44],
      [330, 0.23],
    ]);
    const expected = buildModalSlotsFromFundamental({
      frequency: 110,
      confidence: 0.9,
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 5,
      spectralCentroid: 0.24,
      includeChromesthesia: true,
    });
    const actual = writeModalSlotsFromFundamental(createModalTargetBuild(5), {
      frequency: 110,
      confidence: 0.9,
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 5,
      spectralCentroid: 0.24,
      includeChromesthesia: true,
    });

    expectTargetBuildToMatch(actual, expected);
  });

  it("matches the allocating spectral resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.92],
      [220, 0.51],
      [330, 0.3],
      [440, 0.18],
    ]);
    const peaks = [
      { frequency: 110, amplitude: 0.92 },
      { frequency: 220, amplitude: 0.51 },
      { frequency: 330, amplitude: 0.3 },
    ];
    const expected = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.28,
      includeChromesthesia: true,
      peaks,
    });
    const actual = writeModalSlotsFromSpectralPeaks(createModalTargetBuild(6), {
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.28,
      includeChromesthesia: true,
      peaks,
    });

    expectTargetBuildToMatch(actual, expected);
  });

  it("matches the allocating peak-driver resolver", () => {
    const fftMagnitudes = makeFft([
      [110, 0.94],
      [220, 0.56],
      [330, 0.32],
      [440, 0.24],
    ]);
    const peaks = [
      { frequency: 110, amplitude: 0.94 },
      { frequency: 220, amplitude: 0.56 },
      { frequency: 330, amplitude: 0.32 },
    ];
    const expected = buildModalSlotsFromPeakDrivers({
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.31,
      includeChromesthesia: true,
      peaks,
    });
    const actual = writeModalSlotsFromPeakDrivers(createModalTargetBuild(6), {
      fftMagnitudes,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.31,
      includeChromesthesia: true,
      peaks,
      scratchTarget: createModalTargetBuild(6),
    });

    expectTargetBuildToMatch(actual, expected);
  });

  it("adds above-floor bridge families for sub-floor backbone peaks", () => {
    const sparse = writeModalSlotsFromPeakDrivers(createModalTargetBuild(8), {
      fftMagnitudes: makeFft([[120, 0.92]]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 8,
      slotLimit: 8,
      spectralCentroid: 0.18,
      includeChromesthesia: true,
      peaks: [{ frequency: 120, amplitude: 0.92 }],
      scratchTarget: createModalTargetBuild(8),
    });
    const enriched = writeModalSlotsFromPeakDrivers(createModalTargetBuild(8), {
      fftMagnitudes: makeFft([
        [120, 0.92],
        [480, 0.82],
        [600, 0.74],
        [720, 0.68],
      ]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 8,
      slotLimit: 8,
      spectralCentroid: 0.18,
      includeChromesthesia: true,
      peaks: [{ frequency: 120, amplitude: 0.92 }],
      scratchTarget: createModalTargetBuild(8),
    });

    expect(enriched.subfloorBridgeMeta).toMatchObject({
      dominantPeakFrequency: 120,
      dominantPeakAmplitude: 0.92,
      dominantPeakBridgeCount: 3,
      meaningfulAboveFloorPeakCount: 1,
    });
    expect(readModeKeys(enriched)).not.toEqual(readModeKeys(sparse));
  });

  it("keeps sub-floor peaks sparse when above-floor harmonics are absent", () => {
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(8), {
      fftMagnitudes: makeFft([[60, 0.88]]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 8,
      slotLimit: 8,
      spectralCentroid: 0.15,
      includeChromesthesia: true,
      peaks: [{ frequency: 60, amplitude: 0.88 }],
      scratchTarget: createModalTargetBuild(8),
    });

    expect(target.subfloorBridgeMeta).toMatchObject({
      dominantPeakFrequency: 60,
      dominantPeakAmplitude: 0.88,
      dominantPeakBridgeCount: 0,
      meaningfulAboveFloorPeakCount: 0,
    });
  });

  it("counts native above-floor backbone peaks as meaningful support", () => {
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(8), {
      fftMagnitudes: makeFft([
        [60, 0.86],
        [600, 0.7],
      ]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: 3,
      capacity: 8,
      slotLimit: 8,
      spectralCentroid: 0.2,
      includeChromesthesia: true,
      peaks: [
        { frequency: 60, amplitude: 0.86 },
        { frequency: 600, amplitude: 0.7 },
      ],
      scratchTarget: createModalTargetBuild(8),
    });

    expect(target.subfloorBridgeMeta).toMatchObject({
      dominantPeakFrequency: 60,
      dominantPeakAmplitude: 0.86,
      dominantPeakBridgeCount: 0,
      meaningfulAboveFloorPeakCount: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Legacy peak-family compensation regressions
// ---------------------------------------------------------------------------

// Small radius where the physical water cavity floor is well above musical content.
// Without compensation, all peaks collapse into mode (1,1,1).
const SMALL_WATER_RADIUS = 0.5;

describe("legacy peak-driver mapping regression (water physics compensation)", () => {
  it("440 / 1760 / 3200 Hz peaks map to distinct families with a small water radius", () => {
    const peaks = [
      { frequency: 440, amplitude: 0.9 },
      { frequency: 1760, amplitude: 0.75 },
      { frequency: 3200, amplitude: 0.6 },
    ];
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(12), {
      fftMagnitudes: makeFft([
        [440, 0.9],
        [1760, 0.75],
        [3200, 0.6],
      ]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: SMALL_WATER_RADIUS,
      capacity: 12,
      slotLimit: 12,
      spectralCentroid: 0.3,
      includeChromesthesia: false,
      peaks,
      scratchTarget: createModalTargetBuild(12),
    });

    const keys = readModeKeys(target);
    expect(keys.length).toBeGreaterThan(0);
    // All keys collapsed to (1,1,1) would mean a single unique key dominating.
    const unique = new Set(keys);
    expect(unique.size).toBeGreaterThan(1);
    // The minimum cavity mode should not be the only family present.
    expect(keys.every((k) => k === "1:1:1")).toBe(false);
  });

  it("mixed low-mid-high fixture populates backbone slots with spread modes", () => {
    const peaks = [
      { frequency: 220, amplitude: 0.85 },
      { frequency: 880, amplitude: 0.7 },
      { frequency: 2200, amplitude: 0.5 },
    ];
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(12), {
      fftMagnitudes: makeFft([
        [220, 0.85],
        [880, 0.7],
        [2200, 0.5],
      ]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: SMALL_WATER_RADIUS,
      capacity: 12,
      slotLimit: 12,
      spectralCentroid: 0.25,
      includeChromesthesia: false,
      peaks,
      scratchTarget: createModalTargetBuild(12),
    });

    expect(target.uniqueModeCount).toBeGreaterThan(0);
    expect(new Set(readModeKeys(target)).size).toBeGreaterThan(1);
  });

  it("stores legacyAnalysisFloorHz in subfloorBridgeMeta close to 180 Hz for small radii", () => {
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(6), {
      fftMagnitudes: makeFft([[440, 0.8]]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: SMALL_WATER_RADIUS,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.2,
      includeChromesthesia: false,
      peaks: [{ frequency: 440, amplitude: 0.8 }],
      scratchTarget: createModalTargetBuild(6),
    });

    expect(target.subfloorBridgeMeta).toBeDefined();
    expect(target.subfloorBridgeMeta.legacyAnalysisFloorHz).toBeCloseTo(
      LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ,
      1,
    );
    expect(target.subfloorBridgeMeta.legacyAnalysisFloorHz).toBeCloseTo(
      getLegacyAnalysisFloorHz(SMALL_WATER_RADIUS),
      4,
    );
  });
});

describe("legacy sub-floor residual regression", () => {
  it("ordinary midrange peaks are not classified as sub-floor-only with small water radius", () => {
    // 440 Hz is above the 180 Hz legacy floor even when physical floor > 440 Hz.
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(6), {
      fftMagnitudes: makeFft([[440, 0.8]]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: SMALL_WATER_RADIUS,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.2,
      includeChromesthesia: false,
      peaks: [{ frequency: 440, amplitude: 0.8 }],
      scratchTarget: createModalTargetBuild(6),
    });

    // 440 Hz should be above the legacy floor → at least one meaningful above-floor peak.
    expect(
      target.subfloorBridgeMeta.meaningfulAboveFloorPeakCount,
    ).toBeGreaterThanOrEqual(1);
  });

  it("peaks below 180 Hz are still classified as sub-floor with the compensated floor", () => {
    const target = writeModalSlotsFromPeakDrivers(createModalTargetBuild(6), {
      fftMagnitudes: makeFft([[60, 0.8]]),
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: SMALL_WATER_RADIUS,
      capacity: 6,
      slotLimit: 6,
      spectralCentroid: 0.1,
      includeChromesthesia: false,
      peaks: [{ frequency: 60, amplitude: 0.8 }],
      scratchTarget: createModalTargetBuild(6),
    });

    expect(target.subfloorBridgeMeta.dominantPeakFrequency).toBe(60);
    // 60 Hz < 180 Hz legacy floor → still a sub-floor peak.
    expect(target.subfloorBridgeMeta.dominantPeakFrequency).toBeLessThan(
      target.subfloorBridgeMeta.legacyAnalysisFloorHz,
    );
  });
});

describe("legacy spectral peak mapping regression (water physics compensation)", () => {
  it("440 / 1760 / 3200 Hz peaks map to distinct families via spectral resolver", () => {
    const peaks = [
      { frequency: 440, amplitude: 0.9 },
      { frequency: 1760, amplitude: 0.75 },
      { frequency: 3200, amplitude: 0.6 },
    ];
    const target = writeModalSlotsFromSpectralPeaks(
      createModalTargetBuild(12),
      {
        fftMagnitudes: makeFft([
          [440, 0.9],
          [1760, 0.75],
          [3200, 0.6],
        ]),
        sampleRate: SAMPLE_RATE,
        fftSize: FFT_SIZE,
        radius: SMALL_WATER_RADIUS,
        capacity: 12,
        slotLimit: 12,
        spectralCentroid: 0.3,
        includeChromesthesia: false,
        peaks,
      },
    );

    const keys = readModeKeys(target);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k === "1:1:1")).toBe(false);
    expect(new Set(keys).size).toBeGreaterThan(1);
  });
});

describe("legacy compensation no-op preserve-feel regression", () => {
  it("compensation is a no-op for large radii (physical floor already <= 180 Hz)", () => {
    // radius=10 → physical floor ≈ 128 Hz < 180 Hz → legacyRadius = radius → no change
    const largeRadius = 10;
    expect(getLegacyAnalysisRadius(largeRadius)).toBe(largeRadius);
    expect(getMinimumCavityFrequency(largeRadius)).toBeLessThan(
      LEGACY_PEAK_ANALYSIS_MAX_FLOOR_HZ,
    );

    const peaks = [
      { frequency: 440, amplitude: 0.88 },
      { frequency: 880, amplitude: 0.6 },
    ];
    const fft = makeFft([
      [440, 0.88],
      [880, 0.6],
    ]);

    const withCompensation = writeModalSlotsFromPeakDrivers(
      createModalTargetBuild(8),
      {
        fftMagnitudes: fft,
        sampleRate: SAMPLE_RATE,
        fftSize: FFT_SIZE,
        radius: largeRadius,
        capacity: 8,
        slotLimit: 8,
        spectralCentroid: 0.22,
        includeChromesthesia: false,
        peaks,
        scratchTarget: createModalTargetBuild(8),
      },
    );

    // Mode assignments should match a direct call using the same (unchanged) radius.
    const direct = writeModalSlotsFromPeakDrivers(createModalTargetBuild(8), {
      fftMagnitudes: fft,
      sampleRate: SAMPLE_RATE,
      fftSize: FFT_SIZE,
      radius: largeRadius,
      capacity: 8,
      slotLimit: 8,
      spectralCentroid: 0.22,
      includeChromesthesia: false,
      peaks,
      scratchTarget: createModalTargetBuild(8),
    });

    expect(readModeKeys(withCompensation)).toEqual(readModeKeys(direct));
    expect(withCompensation.uniqueModeCount).toBe(direct.uniqueModeCount);
  });
});
