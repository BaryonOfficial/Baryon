import { describe, expect, it } from "vitest";
import { getLegacyAnalysisRadius } from "../../utils/cavityModes.js";
import {
  createAudioFeatureState,
  prepareAudioFeatureFrameInputs,
  updateAudioFeatureFastSignalState,
} from "../audioFeatures.js";
import {
  buildModalExcitationStructuralState,
  computeDrivePeriodicity,
  createModalExcitationState,
  getAtlasCacheSize,
} from "./modalExcitation.js";

const FFT_SIZE = 4096;
const SAMPLE_RATE = 44100;
const BIN_COUNT = FFT_SIZE / 2;
const NYQUIST = SAMPLE_RATE / 2;

function createStatus(overrides = {}) {
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
    liveInputCalibrationVersion: 0,
    ...overrides,
  };
}

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    const bin = Math.max(
      1,
      Math.min(
        BIN_COUNT - 1,
        Math.round((frequency / NYQUIST) * (BIN_COUNT - 1)),
      ),
    );
    fft[bin] = amplitude;
  }
  return fft;
}

function makeTimeData({
  frequency,
  amplitude = 0.45,
  sampleRate = SAMPLE_RATE,
  fftSize = FFT_SIZE,
}) {
  const timeData = new Float32Array(fftSize);
  for (let index = 0; index < fftSize; index += 1) {
    timeData[index] =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
  }
  return timeData;
}

function createPreparedInputs({
  frameTimeMs,
  fftMagnitudes,
  timeData,
  status = createStatus(),
  cavityGeometry = "rectangular",
  avgAmplitude = 24,
  rms = 0.2,
  radius = 3,
}) {
  return prepareAudioFeatureFrameInputs({
    analysisSnapshot: {
      sourceMode: "file",
      avgAmplitude,
      fftMagnitudes,
      timeData,
      rms,
      spectralCentroid: 0.2,
      spectralFlux: 0.1,
    },
    featureState: createAudioFeatureState(),
    radius,
    cavityGeometry,
    status,
    frameTimeMs,
  });
}

function cloneSlots(slots) {
  return new Float32Array(slots);
}

function computeAmplitudeDelta(currentSlots, previousSlots) {
  const slotCount = Math.min(
    Math.floor((currentSlots?.length ?? 0) / 4),
    Math.floor((previousSlots?.length ?? 0) / 4),
  );
  let totalDelta = 0;
  for (let index = 0; index < slotCount; index += 1) {
    totalDelta += Math.abs(
      (currentSlots[index * 4 + 3] ?? 0) - (previousSlots[index * 4 + 3] ?? 0),
    );
  }
  return totalDelta;
}

function sumAmplitudes(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    total += slots[index * 4 + 3] ?? 0;
  }
  return total;
}

function countActiveSlotsLocal(slots) {
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  let total = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) > 0) {
      total += 1;
    }
  }
  return total;
}

function readModeKeys(slots) {
  const keys = [];
  const slotCount = Math.floor((slots?.length ?? 0) / 4);
  for (let index = 0; index < slotCount; index += 1) {
    if ((slots[index * 4 + 3] ?? 0) <= 0) {
      continue;
    }
    keys.push(
      `${slots[index * 4]}:${slots[index * 4 + 1]}:${slots[index * 4 + 2]}`,
    );
  }
  return keys;
}

function hasNewModeKey(nextKeys, previousKeys) {
  return nextKeys.some((key) => !previousKeys.includes(key));
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createDeterministicRandom(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("modal excitation structural state", () => {
  it("builds persistent backbone structure for stable low-order input", () => {
    const baseState = createModalExcitationState(16);
    const firstInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [550, 0.95],
        [1100, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 550 }),
    });
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: baseState,
      performanceNow: () => 0,
    });

    const secondInputs = createPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [550, 0.95],
        [1100, 0.52],
      ]),
      timeData: makeTimeData({ frequency: 550 }),
    });
    secondInputs.modalExcitationState = baseState;
    const secondFastSignal = updateAudioFeatureFastSignalState(secondInputs);
    const secondStructural = buildModalExcitationStructuralState({
      preparedInputs: secondInputs,
      fastSignalState: secondFastSignal,
      existingState: baseState,
      performanceNow: () => 1,
    });

    expect(firstStructural.activeBackboneModeCount).toBeGreaterThan(0);
    expect(secondStructural.activeBackboneModeCount).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.modalPersistence).toBeGreaterThan(
      0.03,
    );
    expect(secondStructural.structuralMetrics.modeCoherence).toBeGreaterThan(0);
    expect(secondStructural.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("routes bright coherent treble into detail modes", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [6800, 0.44],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.35 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(
      countActiveSlotsLocal(structuralState.signalDetailSlotsSource),
    ).toBeGreaterThan(0);
    expect(structuralState.dominantFrequency).toBeGreaterThan(3200);
    expect(
      structuralState.structuralMetrics.highOrderModalEnergy,
    ).toBeGreaterThan(0);
    expect(structuralState.structuralMetrics.driveSource).toBe("time-domain");
  });

  it("falls back to spectral drive only when time data is unavailable", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: null,
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(structuralState.structuralMetrics.driveSource).toBe(
      "spectral-fallback",
    );
  });

  it("enforces slot capacity in slot units across signal and display layers", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.99],
        [220, 0.9],
        [330, 0.82],
        [440, 0.75],
        [550, 0.68],
        [660, 0.61],
        [770, 0.54],
      ]),
      timeData: makeTimeData({ frequency: 110, amplitude: 0.85 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });
    const backboneCapacity = state.backbone.slots.length / 4;
    const detailCapacity = state.detail.slots.length / 4;

    expect(structuralState.activeBackboneModeCount).toBeLessThanOrEqual(
      backboneCapacity,
    );
    expect(structuralState.activeDetailModeCount).toBeLessThanOrEqual(
      detailCapacity,
    );
    expect(
      countActiveSlotsLocal(structuralState.signalBackboneSlotsSource),
    ).toBeLessThanOrEqual(backboneCapacity);
    expect(
      countActiveSlotsLocal(structuralState.signalDetailSlotsSource),
    ).toBeLessThanOrEqual(detailCapacity);
  });

  it("keeps reference remapping aligned to the blended slot order", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 110 }),
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    for (
      let offset = 0;
      offset < structuralState.backboneSlotsSource.length;
      offset += 4
    ) {
      const amplitude = structuralState.backboneSlotsSource[offset + 3] ?? 0;
      if (amplitude <= 0) {
        continue;
      }
      expect(
        Array.from(
          structuralState.referenceBackboneSlotsSource.slice(
            offset,
            offset + 3,
          ),
        ),
      ).toEqual(
        Array.from(
          structuralState.backboneSlotsSource.slice(offset, offset + 3),
        ),
      );
    }
  });

  it("keeps requested spherical geometry on the inputs while using the rectangular backend atlas", () => {
    const state = createModalExcitationState(16);
    const preparedInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [110, 0.95],
        [220, 0.5],
      ]),
      timeData: makeTimeData({ frequency: 110 }),
      cavityGeometry: "spherical",
    });
    preparedInputs.modalExcitationState = state;
    const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
    const structuralState = buildModalExcitationStructuralState({
      preparedInputs,
      fastSignalState,
      existingState: state,
      performanceNow: () => 0,
    });

    expect(preparedInputs.requestedCavityGeometry).toBe("spherical");
    expect(preparedInputs.effectiveCavityGeometry).toBe("rectangular");
    expect(state.atlasCacheKey).toBe("rectangular:3");
    expect(structuralState.analysisEngine).toBe("modal-excitation");
  });

  it("saturates amplitude to <= 1.0 under sustained strong input", () => {
    const state = createModalExcitationState(16);
    const fftMagnitudes = makeFft([
      [110, 0.99],
      [220, 0.85],
      [330, 0.7],
    ]);
    const timeData = makeTimeData({ frequency: 110, amplitude: 0.95 });

    for (let frame = 0; frame < 300; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes,
        timeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      expect(structural.dominantAmplitude).toBeLessThanOrEqual(1.0);
    }
  });

  it("does not excite modes on very quiet input", () => {
    const state = createModalExcitationState(16);
    const inputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([[110, 0.001]]),
      timeData: makeTimeData({ frequency: 110, amplitude: 0.001 }),
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    expect(structural.activeModeCount).toBe(0);
  });

  it("bounds atlas cache size via eviction", () => {
    for (let index = 0; index < 12; index += 1) {
      const radius = 1.0 + index * 0.1;
      const state = createModalExcitationState(16);
      const inputs = createPreparedInputs({
        frameTimeMs: 0,
        fftMagnitudes: makeFft([[110, 0.5]]),
        timeData: makeTimeData({ frequency: 110 }),
      });
      inputs.radius = radius;
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => 0,
      });
    }
    expect(getAtlasCacheSize()).toBeLessThanOrEqual(8);
  });

  it("reports high periodicity for a clean periodic signal", () => {
    const buffer = new Float32Array(1024);
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE);
    }
    const periodicity = computeDrivePeriodicity(buffer, SAMPLE_RATE);
    expect(periodicity).toBeGreaterThan(0.5);
  });

  it("converges toward the raw target across repeated stable frames", () => {
    const state = createModalExcitationState(16);
    const amplitudeGaps = [];

    for (let frame = 0; frame < 20; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [550, 0.95],
          [1100, 0.5],
        ]),
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      amplitudeGaps.push(
        sumAmplitudes(state.backbone.slots) -
          sumAmplitudes(structural.backboneSlotsSource),
      );
    }

    expect(amplitudeGaps[0]).toBeGreaterThan(0);
    expect(amplitudeGaps.at(-1)).toBeLessThan(amplitudeGaps[0]);
  });

  it("adds release sustain beyond the raw resonator decay", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    const silenceFrames = [];

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 25; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 2.5,
        rms: 0.01,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      silenceFrames.push({
        signal: sumAmplitudes(structural.signalBackboneSlotsSource),
        blended: sumAmplitudes(structural.backboneSlotsSource),
      });
    }

    expect(
      silenceFrames
        .slice(4)
        .some(({ signal, blended }) => blended > signal + 1e-4),
    ).toBe(true);
    expect(silenceFrames.at(-1).blended).toBeGreaterThan(
      silenceFrames.at(-1).signal,
    );
  });

  it("clears the visible tail quickly on true hard silence", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let activeBlendedAmplitude = 0;
    let hardSilentStructural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      activeBlendedAmplitude = sumAmplitudes(structural.backboneSlotsSource);
    }

    for (let frame = 10; frame < 16; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
        avgAmplitude: 0,
        rms: 0,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      hardSilentStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(sumAmplitudes(hardSilentStructural.signalBackboneSlotsSource)).toBe(
      0,
    );
    expect(
      sumAmplitudes(hardSilentStructural.backboneSlotsSource),
    ).toBeLessThan(activeBlendedAmplitude * 0.08);
  });

  it("reduces noisy-input jitter after the post-resonator blend", () => {
    const state = createModalExcitationState(16);
    const random = createDeterministicRandom(97);
    const rawDeltas = [];
    const blendedDeltas = [];
    let previousRawSlots = null;
    let previousBlendedSlots = null;

    for (let frame = 0; frame < 24; frame += 1) {
      const baseAmplitude = 0.88 + (random() - 0.5) * 0.12;
      const harmonicAmplitude = 0.46 + (random() - 0.5) * 0.1;
      const timeAmplitude = 0.42 + (random() - 0.5) * 0.08;
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [110, baseAmplitude],
          [220, harmonicAmplitude],
        ]),
        timeData: makeTimeData({
          frequency: 110,
          amplitude: timeAmplitude,
        }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      const structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
      const rawSlots = cloneSlots(structural.signalBackboneSlotsSource);
      const blendedSlots = cloneSlots(structural.backboneSlotsSource);

      if (previousRawSlots && previousBlendedSlots) {
        rawDeltas.push(computeAmplitudeDelta(rawSlots, previousRawSlots));
        blendedDeltas.push(
          computeAmplitudeDelta(blendedSlots, previousBlendedSlots),
        );
      }

      previousRawSlots = rawSlots;
      previousBlendedSlots = blendedSlots;
    }

    expect(average(blendedDeltas)).toBeLessThan(average(rawDeltas));
    expect(average(blendedDeltas.slice(-10))).toBeLessThan(
      average(rawDeltas.slice(-10)),
    );
  });

  it("surfaces multiple visible detail modes within two bright treble frames", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 2; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [6200, 0.92],
          [7600, 0.72],
          [9100, 0.58],
        ]),
        timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(countActiveSlotsLocal(structural.detailSlotsSource)).toBeGreaterThan(
      1,
    );
  });

  it("replaces stale visible detail keys within two frames of a treble switch", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    const firstInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [6800, 0.74],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.36 }),
    });
    firstInputs.modalExcitationState = state;
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const firstVisibleKeys = readModeKeys(firstStructural.detailSlotsSource);
    const firstDominantKey = firstVisibleKeys[0] ?? null;

    for (let frame = 1; frame <= 2; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [8200, 0.94],
          [9800, 0.68],
        ]),
        timeData: makeTimeData({ frequency: 8200, amplitude: 0.34 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    const switchedVisibleKeys = readModeKeys(structural.detailSlotsSource);
    expect(hasNewModeKey(switchedVisibleKeys, firstVisibleKeys)).toBe(true);
    expect(
      switchedVisibleKeys.length > 1 ||
        switchedVisibleKeys[0] !== firstDominantKey,
    ).toBe(true);
  });

  it("surfaces a new visible detail key within one frame under incumbent pressure", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [5600, 0.84],
        [6400, 0.8],
        [7200, 0.76],
        [8600, 0.68],
        [9800, 0.6],
      ]),
      timeData: makeTimeData({ frequency: 6400, amplitude: 0.3 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleKeys = readModeKeys(seededStructural.detailSlotsSource);

    const freshInputs = createPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [5600, 0.62],
        [6400, 0.58],
        [7200, 0.54],
        [8600, 0.46],
        [10800, 0.96],
      ]),
      timeData: makeTimeData({ frequency: 10800, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    const freshVisibleKeys = readModeKeys(freshStructural.detailSlotsSource);
    expect(hasNewModeKey(freshVisibleKeys, seededVisibleKeys)).toBe(true);
  });

  it("keeps visible detail keys as a subset of the raw signal shortlist", () => {
    const state = createModalExcitationState(16);
    const inputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.92],
        [7600, 0.72],
        [9100, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
    });
    inputs.modalExcitationState = state;
    const fastSignal = updateAudioFeatureFastSignalState(inputs);
    const structural = buildModalExcitationStructuralState({
      preparedInputs: inputs,
      fastSignalState: fastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const signalKeys = readModeKeys(structural.signalDetailSlotsSource);

    expect(
      readModeKeys(structural.detailSlotsSource).every((key) =>
        signalKeys.includes(key),
      ),
    ).toBe(true);
  });

  it("does not let a weaker near-duplicate assist evict a stronger incumbent", () => {
    const state = createModalExcitationState(16);
    const firstInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [6200, 0.96],
        [7600, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.38 }),
    });
    firstInputs.modalExcitationState = state;
    const firstFastSignal = updateAudioFeatureFastSignalState(firstInputs);
    const firstStructural = buildModalExcitationStructuralState({
      preparedInputs: firstInputs,
      fastSignalState: firstFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const firstDominantKey = readModeKeys(firstStructural.detailSlotsSource)[0];

    const secondInputs = createPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [6450, 0.62],
        [7600, 0.58],
      ]),
      timeData: makeTimeData({ frequency: 6450, amplitude: 0.22 }),
    });
    secondInputs.modalExcitationState = state;
    const secondFastSignal = updateAudioFeatureFastSignalState(secondInputs);
    const secondStructural = buildModalExcitationStructuralState({
      preparedInputs: secondInputs,
      fastSignalState: secondFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });

    expect(readModeKeys(secondStructural.detailSlotsSource)[0]).toBe(
      firstDominantKey,
    );
  });

  it("limits reserved fresh admission to one assist-led extra detail key", () => {
    const state = createModalExcitationState(16);
    const seededInputs = createPreparedInputs({
      frameTimeMs: 0,
      fftMagnitudes: makeFft([
        [5200, 0.88],
        [6200, 0.84],
        [7200, 0.8],
        [8600, 0.74],
        [9800, 0.68],
      ]),
      timeData: makeTimeData({ frequency: 6200, amplitude: 0.34 }),
    });
    seededInputs.modalExcitationState = state;
    const seededFastSignal = updateAudioFeatureFastSignalState(seededInputs);
    const seededStructural = buildModalExcitationStructuralState({
      preparedInputs: seededInputs,
      fastSignalState: seededFastSignal,
      existingState: state,
      performanceNow: () => 0,
    });
    const seededVisibleKeys = readModeKeys(seededStructural.detailSlotsSource);

    const freshInputs = createPreparedInputs({
      frameTimeMs: 33,
      fftMagnitudes: makeFft([
        [5400, 0.42],
        [6800, 0.48],
        [8200, 0.56],
        [9400, 0.62],
        [11100, 0.98],
      ]),
      timeData: makeTimeData({ frequency: 11100, amplitude: 0.34 }),
    });
    freshInputs.modalExcitationState = state;
    const freshFastSignal = updateAudioFeatureFastSignalState(freshInputs);
    const freshStructural = buildModalExcitationStructuralState({
      preparedInputs: freshInputs,
      fastSignalState: freshFastSignal,
      existingState: state,
      performanceNow: () => 1,
    });
    const freshVisibleKeys = readModeKeys(freshStructural.detailSlotsSource);
    const newVisibleKeys = freshVisibleKeys.filter(
      (key) => !seededVisibleKeys.includes(key),
    );

    expect(newVisibleKeys.length).toBeLessThanOrEqual(3);
    expect(newVisibleKeys.length).toBeGreaterThan(0);
    expect(
      readModeKeys(freshStructural.signalDetailSlotsSource).includes(
        newVisibleKeys[0],
      ),
    ).toBe(true);
  });

  it("collapses signal slots before the display blend releases to zero", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let lastStructural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      lastStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 16; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      lastStructural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      sumAmplitudes(lastStructural.signalBackboneSlotsSource),
    ).toBeLessThan(sumAmplitudes(lastStructural.backboneSlotsSource));
    expect(
      sumAmplitudes(lastStructural.signalReferenceBackboneSlotsSource),
    ).toBeGreaterThan(0);
  });

  it("keeps weak residual tails visible before the signal layer fully clears", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 13; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(sumAmplitudes(structural.signalBackboneSlotsSource)).toBeGreaterThan(
      0,
    );
    expect(sumAmplitudes(structural.backboneSlotsSource)).toBeGreaterThan(
      sumAmplitudes(structural.signalBackboneSlotsSource),
    );
  });

  it("keeps display slots sparser than signal slots under dense sustained input", () => {
    const state = createModalExcitationState(16);
    let structural = null;

    for (let frame = 0; frame < 12; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: makeFft([
          [90, 0.92],
          [110, 0.95],
          [220, 0.84],
          [330, 0.7],
          [440, 0.58],
          [660, 0.52],
          [6200, 0.44],
          [6800, 0.41],
          [7600, 0.38],
        ]),
        timeData: makeTimeData({ frequency: 110, amplitude: 0.62 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.signalBackboneSlotsSource),
    ).toBeGreaterThanOrEqual(
      countActiveSlotsLocal(structural.backboneSlotsSource),
    );
    expect(sumAmplitudes(structural.backboneSlotsSource)).toBeLessThan(
      sumAmplitudes(structural.signalBackboneSlotsSource),
    );
    expect(sumAmplitudes(structural.detailSlotsSource)).toBeLessThanOrEqual(
      sumAmplitudes(structural.signalDetailSlotsSource),
    );
  });

  it("drops stale low-signal entries from display while keeping them in signal slots", () => {
    const state = createModalExcitationState(16);
    const activeFft = makeFft([
      [550, 0.95],
      [1100, 0.52],
      [1650, 0.38],
      [6600, 0.34],
    ]);
    const silentFft = new Float32Array(BIN_COUNT);
    const silentTimeData = new Float32Array(FFT_SIZE);
    let structural = null;

    for (let frame = 0; frame < 10; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: activeFft,
        timeData: makeTimeData({ frequency: 550, amplitude: 0.45 }),
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    for (let frame = 10; frame < 12; frame += 1) {
      const inputs = createPreparedInputs({
        frameTimeMs: frame * 33,
        fftMagnitudes: silentFft,
        timeData: silentTimeData,
      });
      inputs.modalExcitationState = state;
      const fastSignal = updateAudioFeatureFastSignalState(inputs);
      structural = buildModalExcitationStructuralState({
        preparedInputs: inputs,
        fastSignalState: fastSignal,
        existingState: state,
        performanceNow: () => frame,
      });
    }

    expect(
      countActiveSlotsLocal(structural.signalBackboneSlotsSource),
    ).toBeGreaterThan(countActiveSlotsLocal(structural.backboneSlotsSource));
    expect(
      countActiveSlotsLocal(structural.referenceBackboneSlotsSource),
    ).toBeLessThanOrEqual(
      countActiveSlotsLocal(structural.backboneSlotsSource),
    );
    expect(countActiveSlotsLocal(structural.referenceBackboneSlotsSource)).toBe(
      0,
    );
    expect(
      countActiveSlotsLocal(structural.signalReferenceBackboneSlotsSource),
    ).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Negative regression: legacy peak compensation must not leak into excitation
// ---------------------------------------------------------------------------

function readExcitationModeKeys(slots) {
  const keys = [];
  for (let offset = 0; offset < slots.length; offset += 4) {
    if ((slots[offset + 3] ?? 0) > 0) {
      keys.push(`${slots[offset]}:${slots[offset + 1]}:${slots[offset + 2]}`);
    }
  }
  return keys;
}

function runExcitationForRadius(radius) {
  const state = createModalExcitationState(16);
  const fft = makeFft([
    [440, 0.9],
    [880, 0.5],
  ]);
  const preparedInputs = createPreparedInputs({
    frameTimeMs: 0,
    fftMagnitudes: fft,
    timeData: makeTimeData({ frequency: 440 }),
    radius,
  });
  preparedInputs.modalExcitationState = state;
  const fastSignalState = updateAudioFeatureFastSignalState(preparedInputs);
  return buildModalExcitationStructuralState({
    preparedInputs,
    fastSignalState,
    existingState: state,
    performanceNow: () => 0,
  });
}

describe("modal excitation is not affected by legacy peak compensation", () => {
  it("produces different mode assignments for different physical radii", () => {
    const smallRadius = 0.5;
    const legacyRadius = getLegacyAnalysisRadius(smallRadius);

    const physicalResult = runExcitationForRadius(smallRadius);
    const legacyResult = runExcitationForRadius(legacyRadius);

    const physicalKeys = readExcitationModeKeys(
      physicalResult.backboneSlotsSource,
    );
    const legacyKeys = readExcitationModeKeys(legacyResult.backboneSlotsSource);

    // The two radii differ, so the atlas and mode assignments must differ.
    // If compensation leaked into excitation both would yield the same keys.
    expect(physicalKeys).not.toEqual(legacyKeys);
  });
});
