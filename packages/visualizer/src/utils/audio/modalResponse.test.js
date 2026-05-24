import { describe, expect, it } from "vitest";

const SAMPLE_RATE = 48000;
const BIN_COUNT = 2048;
const NYQUIST = SAMPLE_RATE / 2;

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

function makeBroadbandFft({
  startFrequency = 3200,
  binCount = 96,
  totalEnergy = 1,
} = {}) {
  const fft = new Float32Array(BIN_COUNT);
  const amplitude = Math.sqrt(totalEnergy / binCount);
  const startBin = Math.max(
    1,
    Math.round((startFrequency / NYQUIST) * (BIN_COUNT - 1)),
  );
  for (let index = 0; index < binCount; index += 1) {
    fft[Math.min(BIN_COUNT - 1, startBin + index)] = amplitude;
  }
  return fft;
}

async function loadModalResponseModule() {
  const module = await import("./modalResponse.js").catch((error) => ({
    __loadError: error,
  }));
  expect(module.__loadError).toBeUndefined();
  return module;
}

describe("modal response model", () => {
  it("uses Q to make low-Q modes broad and high-Q modes selective", async () => {
    const { computeModalFrequencyResponse } =
      await loadModalResponseModule();

    const nearLowQ = computeModalFrequencyResponse({
      binFrequencyHz: 118,
      modeFrequencyHz: 110,
      qualityFactor: 4,
    });
    const offLowQ = computeModalFrequencyResponse({
      binFrequencyHz: 150,
      modeFrequencyHz: 110,
      qualityFactor: 4,
    });
    const offHighQ = computeModalFrequencyResponse({
      binFrequencyHz: 150,
      modeFrequencyHz: 110,
      qualityFactor: 32,
    });

    expect(nearLowQ).toBeGreaterThan(0.7);
    expect(offLowQ).toBeGreaterThan(offHighQ * 6);
    expect(offHighQ).toBeLessThan(0.08);
  });

  it("keeps bass backbone energy when a higher partial is also present", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const modes = [
      {
        modeKey: "1:1:1",
        u: 1,
        v: 1,
        w: 1,
        naturalFrequencyHz: 110,
        layer: "backbone",
        qProfile: "low-q",
      },
      {
        modeKey: "5:5:36",
        u: 5,
        v: 5,
        w: 36,
        naturalFrequencyHz: 427,
        layer: "detail",
        qProfile: "high-q",
      },
    ];

    const response = updateModalResponseFrame({
      modes,
      fftMagnitudes: makeFft([
        [110, 0.82],
        [427, 0.48],
      ]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.039,
      previousEnergies: new Map(),
    });

    const backbone = response.entries.find((entry) => entry.layer === "backbone");
    const detail = response.entries.find((entry) => entry.layer === "detail");
    expect(backbone?.modalResponseEnergy).toBeGreaterThan(0.3);
    expect(backbone?.displayAmplitude).toBeGreaterThan(
      detail?.displayAmplitude * 0.75,
    );
    expect(response.modalResponseBackboneEnergy).toBeGreaterThan(0);
  });

  it("lets high-Q tails decay slower than low-Q backbone energy", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const previousEnergies = new Map([
      ["1:1:1", 0.42],
      ["5:5:36", 0.42],
    ]);

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "1:1:1",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: 110,
          layer: "backbone",
          qProfile: "low-q",
        },
        {
          modeKey: "5:5:36",
          u: 5,
          v: 5,
          w: 36,
          naturalFrequencyHz: 427,
          layer: "detail",
          qProfile: "high-q",
        },
      ],
      fftMagnitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 240,
      inputRms: 0.02,
      previousEnergies,
    });

    const backbone = response.entries.find((entry) => entry.layer === "backbone");
    const detail = response.entries.find((entry) => entry.layer === "detail");
    expect(detail?.modalResponseEnergy).toBeGreaterThan(
      backbone?.modalResponseEnergy * 2.5,
    );
  });

  it("treats hard silence as zero forcing while retaining modal decay", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const previousEnergies = new Map([["1:1:1", 0.5]]);

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "1:1:1",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: 110,
          layer: "backbone",
          qProfile: "low-q",
        },
      ],
      fftMagnitudes: makeFft([[110, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 70,
      inputRms: 0.25,
      previousEnergies,
      hardSilence: true,
    });

    const retained = response.entries.find(
      (entry) => entry.modeKey === "1:1:1",
    );
    expect(response.modalResponseInputEnergy).toBe(0);
    expect(retained?.modalResponseDrive).toBe(0);
    expect(retained?.modalResponseEnergy).toBeCloseTo(
      0.5 * Math.exp(-70 / 140),
      5,
    );
  });

  it("rejects broadband treble as retained high-Q structure", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const modes = [
      {
        modeKey: "9:10:11",
        u: 9,
        v: 10,
        w: 11,
        naturalFrequencyHz: 4270,
        layer: "detail",
        qProfile: "high-q",
      },
    ];
    const tonal = updateModalResponseFrame({
      modes,
      fftMagnitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });
    const broadband = updateModalResponseFrame({
      modes,
      fftMagnitudes: makeBroadbandFft({ totalEnergy: 1 }),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });

    expect(tonal.modalResponseDetailEnergy).toBeGreaterThan(
      broadband.modalResponseDetailEnergy * 4,
    );
    expect(broadband.entries[0]?.displayAmplitude ?? 0).toBeLessThan(0.12);
  });

  it("gates zero input and conserves dense modal energy by layer budget", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const denseModes = Array.from({ length: 12 }, (_, index) => ({
      modeKey: `mode:${index}`,
      u: index + 1,
      v: index + 2,
      w: index + 3,
      naturalFrequencyHz: 180 + index * 18,
      layer: "backbone",
      qProfile: "low-q",
    }));

    const silent = updateModalResponseFrame({
      modes: denseModes,
      fftMagnitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0,
      previousEnergies: new Map(),
    });
    const dense = updateModalResponseFrame({
      modes: denseModes,
      fftMagnitudes: makeBroadbandFft({
        startFrequency: 180,
        binCount: 24,
        totalEnergy: 4,
      }),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.3,
      previousEnergies: new Map(),
      layerBudgets: { backbone: 0.5, detail: 0.3 },
    });

    expect(silent.entries).toHaveLength(0);
    expect(dense.modalResponseBackboneEnergy).toBeLessThanOrEqual(0.5);
    expect(dense.modalResponseBudgetScaleBackbone).toBeLessThan(1);
  });

  it("does not spend high-Q display budget on weak off-resonant modes", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const modes = [
      {
        modeKey: "peak",
        u: 5,
        v: 5,
        w: 36,
        naturalFrequencyHz: 4270,
        layer: "detail",
        qProfile: "high-q",
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        modeKey: `weak:${index}`,
        u: 7 + index,
        v: 8 + index,
        w: 9 + index,
        naturalFrequencyHz: 5200 + index * 420,
        layer: "detail",
        qProfile: "high-q",
      })),
    ];

    const response = updateModalResponseFrame({
      modes,
      fftMagnitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.18,
      previousEnergies: new Map(),
      layerBudgets: { backbone: 0.5, detail: 0.32 },
    });

    expect(response.entries.map((entry) => entry.modeKey)).toContain("peak");
    expect(response.entries.some((entry) => entry.modeKey.startsWith("weak:"))).toBe(
      false,
    );
    expect(response.modalResponseDetailEnergy).toBeLessThanOrEqual(0.32);
  });

  it("reports the filtered render-eligible response mode count", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "peak",
          u: 5,
          v: 5,
          w: 36,
          naturalFrequencyHz: 4270,
          layer: "detail",
          qProfile: "high-q",
        },
        {
          modeKey: "weak",
          u: 12,
          v: 13,
          w: 14,
          naturalFrequencyHz: 9400,
          layer: "detail",
          qProfile: "high-q",
        },
      ],
      fftMagnitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.18,
      previousEnergies: new Map(),
    });

    expect(response.entries.map((entry) => entry.modeKey)).toEqual(["peak"]);
    expect(response.modalResponseModeCount).toBe(response.entries.length);
  });

  it("seeds fresh resonant energy on the first audio frame", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "fresh",
          u: 8,
          v: 10,
          w: 13,
          naturalFrequencyHz: 6200,
          layer: "detail",
          qProfile: "high-q",
        },
      ],
      fftMagnitudes: makeFft([[6200, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 16,
      inputRms: 0.18,
      previousEnergies: new Map(),
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeGreaterThan(0.75);
    expect(response.entries[0]?.displayAmplitude).toBeGreaterThan(0.5);
  });

  it("advances oscillator phase independently from display smoothing", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "0:0:1",
      u: 0,
      v: 0,
      w: 1,
      naturalFrequencyHz: 110,
      layer: "backbone",
      qProfile: "low-q",
    };
    const first = updateModalResponseFrame({
      modes: [mode],
      fftMagnitudes: makeFft([[110, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });
    const firstEntry = first.entries[0];
    const halfPeriodMs = 1000 / (mode.naturalFrequencyHz * 2);
    const second = updateModalResponseFrame({
      modes: [mode],
      fftMagnitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: halfPeriodMs,
      inputRms: 0,
      previousEnergies: new Map([[mode.modeKey, firstEntry]]),
      minimumEnergy: 0,
    });
    const secondEntry = second.entries[0];

    expect(firstEntry.oscillatorAngularVelocityRadPerSec).toBeCloseTo(
      2 * Math.PI * mode.naturalFrequencyHz,
    );
    expect(secondEntry.modalResponseEnergy).toBeGreaterThan(0);
    expect(secondEntry.oscillatorPhaseRad).not.toBeCloseTo(
      firstEntry.oscillatorPhaseRad,
    );
    expect(Math.sign(secondEntry.signedModalCoefficient)).toBe(
      -Math.sign(firstEntry.signedModalCoefficient),
    );
  });
});
