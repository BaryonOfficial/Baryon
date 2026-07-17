import { describe, expect, it } from "vitest";
import { frequencyToBinIndex } from "./binFrequency.js";

const SAMPLE_RATE = 48000;
const BIN_COUNT = 2048;

function makeFft(peaks) {
  const fft = new Float32Array(BIN_COUNT);
  for (const [frequency, amplitude] of peaks) {
    const bin = Math.max(
      1,
      frequencyToBinIndex(frequency, BIN_COUNT, SAMPLE_RATE),
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
    frequencyToBinIndex(startFrequency, BIN_COUNT, SAMPLE_RATE),
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
    const { computeModalFrequencyResponse } = await loadModalResponseModule();

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
        layer: "source-coupled",
        qualityFactor: 4,
      },
      {
        modeKey: "5:5:36",
        u: 5,
        v: 5,
        w: 36,
        naturalFrequencyHz: 427,
        layer: "resonant",
        qualityFactor: 32,
      },
    ];

    const response = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeFft([
        [110, 0.82],
        [427, 0.48],
      ]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.039,
      previousEnergies: new Map(),
    });

    const backbone = response.entries.find(
      (entry) => entry.layer === "source-coupled",
    );
    const detail = response.entries.find((entry) => entry.layer === "resonant");
    expect(backbone?.modalResponseEnergy).toBeGreaterThan(0.3);
    expect(backbone?.displayAmplitude).toBeGreaterThan(
      detail?.displayAmplitude * 0.75,
    );
    expect(response.modalResponseSourceCoupledEnergy).toBeGreaterThan(0);
  });

  it("lets higher-Q tails decay slower under equal modal frequency", async () => {
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
          layer: "source-coupled",
          qualityFactor: 4,
        },
        {
          modeKey: "5:5:36",
          u: 5,
          v: 5,
          w: 36,
          naturalFrequencyHz: 110,
          layer: "resonant",
          qualityFactor: 40,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 20,
      inputRms: 0.02,
      previousEnergies,
      minimumEnergy: 0,
    });

    const backbone = response.entries.find(
      (entry) => entry.layer === "source-coupled",
    );
    const detail = response.entries.find((entry) => entry.layer === "resonant");
    expect(detail?.modalResponseEnergy).toBeGreaterThan(
      backbone?.modalResponseEnergy * 2.5,
    );
  });

  it("decays stored modal energy with the energy time constant", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 12;
    const naturalFrequencyHz = 120;
    const energyTauMs =
      (qualityFactor / (2 * Math.PI * naturalFrequencyHz)) * 1000;
    const previousEnergy = 0.5;

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "energy-decay",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz,
          qualityFactor,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: energyTauMs,
      inputRms: 0,
      previousEnergies: new Map([["energy-decay", previousEnergy]]),
      minimumEnergy: 0,
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeCloseTo(
      previousEnergy / Math.E,
      5,
    );
  });

  it("interprets legacy amplitude state as amplitude rather than energy", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 12;
    const naturalFrequencyHz = 120;
    const energyTauMs =
      (qualityFactor / (2 * Math.PI * naturalFrequencyHz)) * 1000;

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "legacy-amplitude",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz,
          qualityFactor,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: energyTauMs,
      inputRms: 0,
      previousEnergies: new Map([["legacy-amplitude", { amplitude: 0.5 }]]),
      minimumEnergy: 0,
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeCloseTo(
      0.5 ** 2 / Math.E,
      5,
    );
  });

  it("keeps projection budget out of the next frame's oscillator energy", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "projection-independent-ringdown",
      u: 1,
      v: 2,
      w: 3,
      naturalFrequencyHz: 120,
      qualityFactor: 12,
    };
    const advance = (previousEnergies, responseBudget, driven = false) =>
      updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: driven
          ? makeFft([[mode.naturalFrequencyHz, 1]])
          : new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs: 1,
        inputRms: driven ? 0.12 : 0,
        previousEnergies,
        responseBudget,
        minimumEnergy: 0,
      });

    const budgeted = advance(new Map([[mode.modeKey, 0.8]]), 0);
    const unbudgeted = advance(new Map([[mode.modeKey, 0.8]]), 1);
    expect(budgeted.entries[0]?.modalResponseEnergy).toBeLessThan(
      unbudgeted.entries[0]?.modalResponseEnergy ?? 0,
    );

    const budgetedNext = advance(
      new Map([[mode.modeKey, budgeted.entries[0]]]),
      1,
      true,
    );
    const unbudgetedNext = advance(
      new Map([[mode.modeKey, unbudgeted.entries[0]]]),
      1,
      true,
    );

    expect(budgetedNext.entries[0]?.modalResponseEnergy).toBeCloseTo(
      unbudgetedNext.entries[0]?.modalResponseEnergy ?? 0,
      6,
    );
  });

  it("changes retained energy continuously across old Q threshold values", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const retainedEnergyForQ = (qualityFactor) =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: `q:${qualityFactor}`,
            u: 2,
            v: 3,
            w: 5,
            naturalFrequencyHz: 440,
            qualityFactor,
          },
        ],
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs: 80,
        inputRms: 0,
        previousEnergies: new Map([[`q:${qualityFactor}`, 0.5]]),
        minimumEnergy: 0,
      }).entries[0]?.modalResponseEnergy ?? 0;

    expect(
      Math.abs(retainedEnergyForQ(7) - retainedEnergyForQ(6.9)),
    ).toBeLessThan(0.02);
    expect(
      Math.abs(retainedEnergyForQ(18) - retainedEnergyForQ(17.9)),
    ).toBeLessThan(0.02);
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
          layer: "source-coupled",
          qualityFactor: 32,
        },
      ],
      fftLinearAmplitudes: makeFft([[110, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 70,
      inputRms: 0.25,
      previousEnergies,
      hardSilence: true,
      minimumEnergy: 0,
    });

    const energyTauMs = (32 / (2 * Math.PI * 110)) * 1000;
    const retained = response.entries.find(
      (entry) => entry.modeKey === "1:1:1",
    );
    expect(response.modalResponseInputEnergy).toBe(0);
    expect(retained?.modalResponseDrive).toBe(0);
    expect(retained?.modalResponseEnergy).toBeCloseTo(
      0.5 * Math.exp(-70 / energyTauMs),
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
        layer: "resonant",
        qualityFactor: 32,
      },
    ];
    const tonal = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });
    const broadband = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeBroadbandFft({ totalEnergy: 1 }),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });

    expect(tonal.modalResponseResonantEnergy).toBeGreaterThan(
      broadband.modalResponseResonantEnergy * 4,
    );
    expect(broadband.entries[0]?.displayAmplitude ?? 0).toBeLessThan(0.12);
  });

  it("keeps modal energy role-invariant for equal physical metadata", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const baseMode = {
      modeKey: "same-physics",
      u: 3,
      v: 4,
      w: 5,
      naturalFrequencyHz: 880,
      qualityFactor: 10,
      driveWeight: 0.72,
      phaseConfidence: 0.84,
      persistence: 0.91,
    };

    const asSourceCoupled = updateModalResponseFrame({
      modes: [{ ...baseMode, layer: "source-coupled" }],
      fftLinearAmplitudes: makeFft([[880, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });
    const asResonant = updateModalResponseFrame({
      modes: [{ ...baseMode, layer: "resonant" }],
      fftLinearAmplitudes: makeFft([[880, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });

    expect(asSourceCoupled.entries[0]?.modalResponseEnergy).toBeCloseTo(
      asResonant.entries[0]?.modalResponseEnergy ?? 0,
      6,
    );
    expect(asSourceCoupled.entries[0]?.displayAmplitude).toBeCloseTo(
      asResonant.entries[0]?.displayAmplitude ?? 0,
      6,
    );
  });

  it("does not infer apparatus Q or transfer from mode frequency and order", async () => {
    const { DEFAULT_MODAL_RESPONSE_REFERENCE, updateModalResponseFrame } =
      await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "low",
          u: 1,
          v: 1,
          w: 2,
          naturalFrequencyHz: 220,
          layer: "source-coupled",
        },
        {
          modeKey: "high",
          u: 20,
          v: 21,
          w: 22,
          naturalFrequencyHz: 6600,
          layer: "source-coupled",
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 0,
      inputRms: 0,
      previousEnergies: new Map([
        ["low", 0.5],
        ["high", 0.5],
      ]),
      minimumEnergy: 0,
    });

    const low = response.entries.find((entry) => entry.modeKey === "low");
    const high = response.entries.find((entry) => entry.modeKey === "high");

    expect(DEFAULT_MODAL_RESPONSE_REFERENCE.qualityFactor).toBe(10);
    expect(DEFAULT_MODAL_RESPONSE_REFERENCE.apparatusTransfer).toBe(1);
    expect(low?.qualityFactor).toBe(
      DEFAULT_MODAL_RESPONSE_REFERENCE.qualityFactor,
    );
    expect(high?.qualityFactor).toBe(
      DEFAULT_MODAL_RESPONSE_REFERENCE.qualityFactor,
    );
    expect(low?.dampingEnvelope).toBe(
      DEFAULT_MODAL_RESPONSE_REFERENCE.apparatusTransfer,
    );
    expect(high?.dampingEnvelope).toBe(low?.dampingEnvelope);
    expect(high?.physicalTransfer).toBeCloseTo(low?.physicalTransfer ?? 0, 6);
  });

  it("honors a measured per-mode apparatus profile", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "measured",
          u: 8,
          v: 13,
          w: 21,
          naturalFrequencyHz: 6200,
          layer: "source-coupled",
          modalResponseProfile: {
            qualityFactor: 24,
            apparatusTransfer: 0.63,
          },
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 0,
      inputRms: 0,
      previousEnergies: new Map([["measured", 0.5]]),
      minimumEnergy: 0,
    });
    const measured = response.entries[0];

    expect(measured?.qualityFactor).toBe(24);
    expect(measured?.dampingEnvelope).toBeCloseTo(0.63);
  });

  it("gates zero input and conserves dense modal energy by unified budget", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const denseModes = Array.from({ length: 12 }, (_, index) => ({
      modeKey: `mode:${index}`,
      u: index + 1,
      v: index + 2,
      w: index + 3,
      naturalFrequencyHz: 180 + index * 18,
      layer: "source-coupled",
      qualityFactor: 4,
    }));

    const silent = updateModalResponseFrame({
      modes: denseModes,
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0,
      previousEnergies: new Map(),
    });
    const dense = updateModalResponseFrame({
      modes: denseModes,
      fftLinearAmplitudes: makeBroadbandFft({
        startFrequency: 180,
        binCount: 24,
        totalEnergy: 4,
      }),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.3,
      previousEnergies: new Map(),
      responseBudget: 0.5,
    });

    expect(silent.entries).toHaveLength(0);
    expect(dense.modalResponseEnergy).toBeLessThanOrEqual(0.5);
    const summedEnergy = dense.entries.reduce(
      (total, entry) => total + entry.modalResponseEnergy,
      0,
    );
    expect(summedEnergy).toBeCloseTo(dense.modalResponseEnergy, 6);
    expect(dense.modalResponseSourceCoupledEnergy).toBeLessThanOrEqual(0.5);
    expect(dense.modalResponseBudgetScale).toBeLessThan(1);
    expect(dense.modalResponseRawEnergy).toBeGreaterThan(
      dense.modalResponseEnergy,
    );
    expect(dense.modalResponseAverageDampingEnvelope).toBeGreaterThan(0);
    expect(dense.modalResponseAverageCouplingStrength).toBeGreaterThan(0);
    expect(dense.modalResponseAveragePhaseConfidence).toBeGreaterThan(0);
    expect(dense.modalResponseAveragePersistence).toBeGreaterThan(0);
  });

  it("does not let source-coupled budget pressure attenuate resonant response", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceModes = Array.from({ length: 8 }, (_, index) => ({
      modeKey: `source:${index}`,
      u: index + 1,
      v: index + 1,
      w: index + 2,
      naturalFrequencyHz: 120 + index * 24,
      layer: "source-coupled",
      qualityFactor: 4,
    }));
    const resonantMode = {
      modeKey: "resonant:ring",
      u: 8,
      v: 13,
      w: 21,
      naturalFrequencyHz: 880,
      layer: "resonant",
      qualityFactor: 40,
    };
    const previousEnergies = new Map([
      ...sourceModes.map((mode) => [mode.modeKey, 0.35]),
      [resonantMode.modeKey, 0.16],
    ]);
    const commonOptions = {
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 1,
      inputRms: 0,
      responseBudget: 1,
      minimumEnergy: 0,
    };
    const mixed = updateModalResponseFrame({
      ...commonOptions,
      modes: [...sourceModes, resonantMode],
      previousEnergies,
    });
    const resonantOnly = updateModalResponseFrame({
      ...commonOptions,
      modes: [resonantMode],
      previousEnergies: new Map([[resonantMode.modeKey, 0.16]]),
    });
    const mixedResonant = mixed.entries.find(
      (entry) => entry.modeKey === resonantMode.modeKey,
    );
    const isolatedResonant = resonantOnly.entries[0];

    expect(mixed.modalResponseBudgetScaleSourceCoupled).toBeLessThan(1);
    expect(mixed.modalResponseBudgetScaleResonant).toBe(1);
    expect(mixed.modalResponseEnergy).toBeLessThanOrEqual(1);
    expect(mixed.modalResponseResonantEnergy).toBeGreaterThan(0);
    expect(mixedResonant?.modalResponseEnergy).toBeCloseTo(
      isolatedResonant?.modalResponseEnergy ?? 0,
      6,
    );
    expect(mixedResonant?.displayAmplitude).toBeCloseTo(
      isolatedResonant?.displayAmplitude ?? 0,
      6,
    );
  });

  it("does not let source-coupled retained energy prune resonant tails", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceModes = Array.from({ length: 8 }, (_, index) => ({
      modeKey: `source:${index}`,
      u: index + 1,
      v: index + 1,
      w: index + 2,
      naturalFrequencyHz: 120 + index * 24,
      layer: "source-coupled",
      qualityFactor: 4,
    }));
    const resonantMode = {
      modeKey: "resonant:tail",
      u: 8,
      v: 13,
      w: 21,
      naturalFrequencyHz: 880,
      layer: "resonant",
      qualityFactor: 40,
    };
    const previousEnergies = new Map([
      ...sourceModes.map((mode) => [mode.modeKey, 0.35]),
      [resonantMode.modeKey, 0.01],
    ]);
    const commonOptions = {
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 1,
      inputRms: 0,
      responseBudget: 1,
      minimumEnergy: 0,
    };
    const mixed = updateModalResponseFrame({
      ...commonOptions,
      modes: [...sourceModes, resonantMode],
      previousEnergies,
    });
    const resonantOnly = updateModalResponseFrame({
      ...commonOptions,
      modes: [resonantMode],
      previousEnergies: new Map([[resonantMode.modeKey, 0.01]]),
    });
    const mixedResonant = mixed.entries.find(
      (entry) => entry.modeKey === resonantMode.modeKey,
    );

    expect(mixed.modalResponseSourceCoupledEnergy).toBeGreaterThan(0.9);
    expect(mixed.modalResponseResonantEnergy).toBeGreaterThan(0);
    expect(mixedResonant?.modalResponseEnergy).toBeCloseTo(
      resonantOnly.entries[0]?.modalResponseEnergy ?? 0,
      6,
    );
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
        layer: "resonant",
        qualityFactor: 32,
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        modeKey: `weak:${index}`,
        u: 7 + index,
        v: 8 + index,
        w: 9 + index,
        naturalFrequencyHz: 5200 + index * 420,
        layer: "resonant",
        qualityFactor: 32,
      })),
    ];

    const response = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.18,
      previousEnergies: new Map(),
      responseBudget: 0.32,
    });

    expect(response.entries.map((entry) => entry.modeKey)).toContain("peak");
    expect(
      response.entries.some((entry) => entry.modeKey.startsWith("weak:")),
    ).toBe(false);
    expect(response.modalResponseResonantEnergy).toBeLessThanOrEqual(0.32);
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
          layer: "resonant",
          qualityFactor: 32,
        },
        {
          modeKey: "weak",
          u: 12,
          v: 13,
          w: 14,
          naturalFrequencyHz: 9400,
          layer: "resonant",
          qualityFactor: 32,
        },
      ],
      fftLinearAmplitudes: makeFft([[4270, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.18,
      previousEnergies: new Map(),
    });

    expect(response.entries.map((entry) => entry.modeKey)).toEqual(["peak"]);
    expect(response.modalResponseModeCount).toBe(response.entries.length);
  });

  it("seeds fresh resonant energy through the fixed apparatus transfer", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "fresh",
          u: 8,
          v: 10,
          w: 13,
          naturalFrequencyHz: 6200,
          layer: "resonant",
          qualityFactor: 32,
        },
      ],
      fftLinearAmplitudes: makeFft([[6200, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 16,
      inputRms: 0.18,
      previousEnergies: new Map(),
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeGreaterThan(0.2);
    expect(response.entries[0]?.dampingEnvelope).toBe(1);
    expect(response.entries[0]?.displayAmplitude).toBeGreaterThan(0.5);
  });

  it("rings up from rest with the physical amplitude time constant 2Q/ω", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 4;
    const naturalFrequencyHz = 110;
    const amplitudeTauMs =
      ((2 * qualityFactor) / (2 * Math.PI * naturalFrequencyHz)) * 1000;
    const energyAfter = (deltaMs) =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: "ring-up",
            u: 1,
            v: 1,
            w: 1,
            naturalFrequencyHz,
            layer: "source-coupled",
            qualityFactor,
          },
        ],
        fftLinearAmplitudes: makeFft([[naturalFrequencyHz, 0.9]]),
        sampleRate: SAMPLE_RATE,
        deltaMs,
        inputRms: 0.12,
        previousEnergies: new Map(),
        minimumEnergy: 0,
      }).entries[0]?.modalResponseEnergy ?? 0;

    // Energy ratio between one-τ_a ring-up and saturation eliminates the
    // drive-dependent steady-state level: (1 − e^{−1})² ≈ 0.3996.
    const ratio =
      energyAfter(amplitudeTauMs) / energyAfter(100 * amplitudeTauMs);
    expect(ratio).toBeCloseTo((1 - Math.exp(-1)) ** 2, 3);
  });

  it("locks harmonic partials to the drive waveform's relative phases", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const window = 2048;
    const f1 = (SAMPLE_RATE * 20) / window; // integer cycles per window
    const f2 = 2 * f1;
    const runWithHarmonicPhase = (phase2) => {
      const timeDomainData = new Float32Array(window);
      for (let index = 0; index < window; index += 1) {
        const t = index / SAMPLE_RATE;
        timeDomainData[index] =
          0.6 * Math.cos(2 * Math.PI * f1 * t) +
          0.3 * Math.cos(2 * Math.PI * f2 * t + phase2);
      }
      return updateModalResponseFrame({
        modes: [
          {
            modeKey: "fundamental",
            u: 1,
            v: 1,
            w: 1,
            naturalFrequencyHz: f1,
            layer: "source-coupled",
            qualityFactor: 8,
          },
          {
            modeKey: "harmonic",
            u: 2,
            v: 2,
            w: 2,
            naturalFrequencyHz: f2,
            layer: "source-coupled",
            qualityFactor: 8,
          },
        ],
        fftLinearAmplitudes: makeFft([
          [f1, 0.8],
          [f2, 0.4],
        ]),
        timeDomainData,
        sampleRate: SAMPLE_RATE,
        deltaMs: 500,
        inputRms: 0.2,
        previousEnergies: new Map(),
      });
    };

    const response = runWithHarmonicPhase(-0.9);
    const fundamental = response.entries.find(
      (entry) => entry.modeKey === "fundamental",
    );
    const harmonic = response.entries.find(
      (entry) => entry.modeKey === "harmonic",
    );

    expect(fundamental?.modalOscillatorDrivePhaseLocked).toBe(true);
    expect(harmonic?.modalOscillatorDrivePhaseLocked).toBe(true);
    expect(harmonic?.modalOscillatorHarmonicOrder).toBe(2);
    // A locked harmonic oscillates at the drive frequency n·f_ref.
    expect(harmonic?.oscillatorAngularVelocityRadPerSec).toBeCloseTo(
      2 * Math.PI * f2,
      6,
    );

    // After a long frame the envelope phase settles at the drive-locked
    // target ε − π/2, so the waveform's harmonic phase reaches the field.
    const envelopePhase = Math.atan2(
      harmonic?.modalOscillatorEnvelopeIm ?? 0,
      harmonic?.modalOscillatorEnvelopeRe ?? 0,
    );
    const expectedPhase = -0.9 - Math.PI / 2;
    expect(
      Math.abs(
        Math.atan2(
          Math.sin(envelopePhase - expectedPhase),
          Math.cos(envelopePhase - expectedPhase),
        ),
      ),
    ).toBeLessThan(0.05);

    // A different harmonic phase in the source waveform lands a different
    // envelope phase: waveform shape, not just spectrum, shapes the field.
    const reshaped = runWithHarmonicPhase(1.3);
    const reshapedHarmonic = reshaped.entries.find(
      (entry) => entry.modeKey === "harmonic",
    );
    const reshapedPhase = Math.atan2(
      reshapedHarmonic?.modalOscillatorEnvelopeIm ?? 0,
      reshapedHarmonic?.modalOscillatorEnvelopeRe ?? 0,
    );
    expect(
      Math.abs(
        Math.atan2(
          Math.sin(reshapedPhase - envelopePhase),
          Math.cos(reshapedPhase - envelopePhase),
        ),
      ),
    ).toBeGreaterThan(1);
  });

  it("keeps inharmonic modes free-running without drive-phase authority", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const f1 = 440;
    const f2 = 653; // no near-integer ratio to 440
    const window = 2048;
    const timeDomainData = new Float32Array(window);
    for (let index = 0; index < window; index += 1) {
      const t = index / SAMPLE_RATE;
      timeDomainData[index] =
        0.6 * Math.cos(2 * Math.PI * f1 * t) +
        0.4 * Math.cos(2 * Math.PI * f2 * t);
    }

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "reference",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: f1,
          qualityFactor: 8,
        },
        {
          modeKey: "inharmonic",
          u: 2,
          v: 3,
          w: 4,
          naturalFrequencyHz: f2,
          qualityFactor: 8,
        },
      ],
      fftLinearAmplitudes: makeFft([
        [f1, 0.8],
        [f2, 0.5],
      ]),
      timeDomainData,
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.2,
      previousEnergies: new Map(),
    });
    const inharmonic = response.entries.find(
      (entry) => entry.modeKey === "inharmonic",
    );

    expect(inharmonic?.modalOscillatorDrivePhaseLocked).toBe(false);
    expect(inharmonic?.oscillatorAngularVelocityRadPerSec).toBeCloseTo(
      2 * Math.PI * f2,
      6,
    );
  });

  it("advances oscillator phase independently from display smoothing", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "0:0:1",
      u: 0,
      v: 0,
      w: 1,
      naturalFrequencyHz: 110,
      layer: "source-coupled",
      qualityFactor: 4,
    };
    const first = updateModalResponseFrame({
      modes: [mode],
      fftLinearAmplitudes: makeFft([[110, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousEnergies: new Map(),
    });
    const firstEntry = first.entries[0];
    const halfPeriodMs = 1000 / (mode.naturalFrequencyHz * 2);
    const second = updateModalResponseFrame({
      modes: [mode],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
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
