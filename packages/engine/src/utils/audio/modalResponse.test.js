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

function createPreviousModalState(modalResponseEnergy) {
  return { modalResponseEnergy };
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

    expect(nearLowQ).toBeGreaterThan(0.6);
    expect(offLowQ).toBeGreaterThan(offHighQ * 6);
    expect(offHighQ).toBeLessThan(0.08);
  });

  it("requires the atlas-owned physical layer instead of inferring it from Q", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();

    expect(() =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: "unclassified",
            u: 1,
            v: 1,
            w: 1,
            naturalFrequencyHz: 110,
            qualityFactor: 64,
          },
        ],
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
      }),
    ).toThrow("Modal mode unclassified must declare a physical layer");
  });

  it("does not turn observer confidence into physical modal energy", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "observer-only",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: 220,
          layer: "source-coupled",
          qualityFactor: 40,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      inputRms: 0.5,
      normalizedInputAmplitude: 1,
      observedForcingByMode: new Map([["observer-only", 1]]),
    });

    expect(response.modalResponseEnergy).toBe(0);
    expect(response.entries).toEqual([]);
  });

  it("rejects a physical mode without apparatus-derived Q", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();

    expect(() =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: "missing-q",
            u: 1,
            v: 1,
            w: 1,
            naturalFrequencyHz: 220,
            layer: "source-coupled",
          },
        ],
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
      }),
    ).toThrow("Modal mode missing-q must declare an apparatus-derived Q");
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
      previousOscillatorStates: new Map(),
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
    const previousOscillatorStates = new Map([
      ["1:1:1", createPreviousModalState(0.42)],
      ["5:5:36", createPreviousModalState(0.42)],
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
      previousOscillatorStates,
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
          layer: "source-coupled",
          qualityFactor,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: energyTauMs,
      inputRms: 0,
      previousOscillatorStates: new Map([
        ["energy-decay", createPreviousModalState(previousEnergy)],
      ]),
      minimumEnergy: 0,
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeCloseTo(
      previousEnergy / Math.E,
      5,
    );
    expect(
      response.entries[0]?.modalResponseMemoryCoefficient ** 2,
    ).toBeCloseTo(1 / Math.E, 6);
  });

  it("restores an energy-only oscillator state", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 12;
    const naturalFrequencyHz = 120;
    const energyTauMs =
      (qualityFactor / (2 * Math.PI * naturalFrequencyHz)) * 1000;

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "energy-only",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz,
          layer: "source-coupled",
          qualityFactor,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: energyTauMs,
      inputRms: 0,
      previousOscillatorStates: new Map([
        ["energy-only", createPreviousModalState(0.25)],
      ]),
      minimumEnergy: 0,
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeCloseTo(
      0.5 ** 2 / Math.E,
      5,
    );
  });

  it("rejects obsolete previous-state shapes", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();

    expect(() =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: "obsolete-state",
            u: 1,
            v: 2,
            w: 3,
            naturalFrequencyHz: 120,
            layer: "source-coupled",
            qualityFactor: 12,
          },
        ],
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        previousOscillatorStates: new Map([
          ["obsolete-state", { amplitude: 0.5 }],
        ]),
      }),
    ).toThrow(
      "Previous modal oscillator state must declare modalResponseEnergy or a complex envelope",
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
      layer: "source-coupled",
      qualityFactor: 12,
    };
    const advance = (
      previousOscillatorStates,
      responseBudget,
      driven = false,
    ) =>
      updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: driven
          ? makeFft([[mode.naturalFrequencyHz, 1]])
          : new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs: 1,
        inputRms: driven ? 0.12 : 0,
        previousOscillatorStates,
        responseBudget,
        minimumEnergy: 0,
      });

    const budgeted = advance(
      new Map([[mode.modeKey, createPreviousModalState(0.8)]]),
      0,
    );
    const unbudgeted = advance(
      new Map([[mode.modeKey, createPreviousModalState(0.8)]]),
      1,
    );
    expect(budgeted.entries[0]?.modalResponseEnergy).toBeLessThan(
      unbudgeted.entries[0]?.modalResponseEnergy ?? 0,
    );
    expect(budgeted.oscillatorStates[0]?.modalResponseEnergy).toBeCloseTo(
      unbudgeted.oscillatorStates[0]?.modalResponseEnergy ?? 0,
      6,
    );

    const budgetedNext = advance(
      new Map([[mode.modeKey, budgeted.oscillatorStates[0]]]),
      1,
      true,
    );
    const unbudgetedNext = advance(
      new Map([[mode.modeKey, unbudgeted.oscillatorStates[0]]]),
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
            layer: "source-coupled",
            qualityFactor,
          },
        ],
        fftLinearAmplitudes: new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs: 80,
        inputRms: 0,
        previousOscillatorStates: new Map([
          [`q:${qualityFactor}`, createPreviousModalState(0.5)],
        ]),
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
    const previousOscillatorStates = new Map([
      ["1:1:1", createPreviousModalState(0.5)],
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
          qualityFactor: 32,
        },
      ],
      fftLinearAmplitudes: makeFft([[110, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 70,
      inputRms: 0.25,
      previousOscillatorStates,
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

  it("weights broadband treble by the physical modal response", async () => {
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
      previousOscillatorStates: new Map(),
    });
    const broadband = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeBroadbandFft({ totalEnergy: 1 }),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousOscillatorStates: new Map(),
    });

    expect(tonal.modalResponseResonantEnergy).toBeGreaterThan(
      broadband.modalResponseResonantEnergy * 4,
    );
    expect(broadband.modalResponseResonantEnergy).toBeGreaterThan(0);
  });

  it("keeps spectral drive continuous across the former Q class boundary", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const responseForQ = (qualityFactor) =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: `spectral-q:${qualityFactor}`,
            u: 9,
            v: 10,
            w: 11,
            naturalFrequencyHz: 4270,
            layer: "resonant",
            qualityFactor,
          },
        ],
        fftLinearAmplitudes: makeBroadbandFft({ totalEnergy: 1 }),
        sampleRate: SAMPLE_RATE,
        deltaMs: 33,
        inputRms: 0.12,
        previousOscillatorStates: new Map(),
      }).modalResponseResonantEnergy;

    expect(Math.abs(responseForQ(16.01) - responseForQ(15.99))).toBeLessThan(
      0.001,
    );
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
      sourceCouplingEnergy: 0.72,
      phaseConfidence: 0.84,
      persistence: 0.91,
    };

    const asSourceCoupled = updateModalResponseFrame({
      modes: [{ ...baseMode, layer: "source-coupled" }],
      fftLinearAmplitudes: makeFft([[880, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousOscillatorStates: new Map(),
    });
    const asResonant = updateModalResponseFrame({
      modes: [{ ...baseMode, layer: "resonant" }],
      fftLinearAmplitudes: makeFft([[880, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 33,
      inputRms: 0.12,
      previousOscillatorStates: new Map(),
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

  it("keeps observer persistence out of physical modal transfer", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const responseForPersistence = (persistence) =>
      updateModalResponseFrame({
        modes: [
          {
            modeKey: `persistence:${persistence}`,
            u: 3,
            v: 4,
            w: 5,
            naturalFrequencyHz: 880,
            layer: "source-coupled",
            qualityFactor: 10,
            sourceCouplingEnergy: 0.72,
            phaseConfidence: 0.84,
            persistence,
          },
        ],
        fftLinearAmplitudes: makeFft([[880, 1]]),
        sampleRate: SAMPLE_RATE,
        deltaMs: 33,
        inputRms: 0.12,
        previousOscillatorStates: new Map(),
      });

    const lowPersistence = responseForPersistence(0.1).entries[0];
    const highPersistence = responseForPersistence(0.9).entries[0];

    expect(lowPersistence.persistence).toBeCloseTo(0.1, 6);
    expect(highPersistence.persistence).toBeCloseTo(0.9, 6);
    expect(lowPersistence.physicalTransfer).toBeCloseTo(
      highPersistence.physicalTransfer,
      6,
    );
    expect(lowPersistence.modalResponseEnergy).toBeCloseTo(
      highPersistence.modalResponseEnergy,
      6,
    );
  });

  it("uses one oscillator for a source-projected exact-eigenvalue shell", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = (SAMPLE_RATE * 16) / BIN_COUNT;
    const common = {
      responseModeKey: "rect:36",
      naturalFrequencyHz: sourceFrequencyHz,
      layer: "source-coupled",
      qualityFactor: 8,
      sourceCouplingEnergy: 1,
      shellMemberCount: 2,
    };
    const response = updateModalResponseFrame({
      modes: [
        {
          ...common,
          modeKey: "0:0:6",
          u: 0,
          v: 0,
          w: 6,
          sourceProjectionWeight: 1 / Math.sqrt(5),
        },
        {
          ...common,
          modeKey: "2:4:4",
          u: 2,
          v: 4,
          w: 4,
          sourceProjectionWeight: 2 / Math.sqrt(5),
        },
      ],
      fftLinearAmplitudes: makeFft([[sourceFrequencyHz, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 500,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
    });

    expect(response.oscillatorStates).toHaveLength(1);
    expect(response.oscillatorStates[0].modeKey).toBe("rect:36");
    expect(response.entries).toHaveLength(2);
    expect(response.modalResponseModeCount).toBe(1);
    expect(response.modalResponseBasisTermCount).toBe(2);
    const first = response.entries.find((entry) => entry.modeKey === "0:0:6");
    const second = response.entries.find((entry) => entry.modeKey === "2:4:4");
    expect(second.modalResponseEnergy).toBeCloseTo(
      4 * first.modalResponseEnergy,
      8,
    );
    expect(
      response.entries.reduce(
        (total, entry) => total + entry.modalResponseEnergy,
        0,
      ),
    ).toBeCloseTo(response.modalResponseEnergy, 8);
  });

  it("does not attenuate diagonal modal energy with signal coherence", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "coherence-invariant",
      u: 2,
      v: 4,
      w: 6,
      naturalFrequencyHz: 440,
      layer: "source-coupled",
      qualityFactor: 8,
      sourceCouplingEnergy: 0.72,
    };
    const run = (coherence) =>
      updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: makeFft([[440, 1]]),
        sampleRate: SAMPLE_RATE,
        deltaMs: 500,
        inputRms: 0.2,
        coherence,
        previousOscillatorStates: new Map(),
      });

    expect(run(0).entries[0].modalResponseEnergy).toBeCloseTo(
      run(1).entries[0].modalResponseEnergy,
      10,
    );
  });

  it("uses explicit apparatus Q without inferring loss from mode order", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 24;
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "low",
          u: 1,
          v: 1,
          w: 2,
          naturalFrequencyHz: 220,
          layer: "source-coupled",
          qualityFactor,
        },
        {
          modeKey: "high",
          u: 20,
          v: 21,
          w: 22,
          naturalFrequencyHz: 6600,
          layer: "source-coupled",
          qualityFactor,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 0,
      inputRms: 0,
      previousOscillatorStates: new Map([
        ["low", createPreviousModalState(0.5)],
        ["high", createPreviousModalState(0.5)],
      ]),
      minimumEnergy: 0,
    });

    const low = response.entries.find((entry) => entry.modeKey === "low");
    const high = response.entries.find((entry) => entry.modeKey === "high");

    expect(low?.qualityFactor).toBe(qualityFactor);
    expect(high?.qualityFactor).toBe(qualityFactor);
    expect(low?.dampingEnvelope).toBe(1);
    expect(high?.dampingEnvelope).toBe(low?.dampingEnvelope);
    expect(high?.physicalTransfer).toBeCloseTo(low?.physicalTransfer ?? 0, 6);
  });

  it("honors a measured per-mode apparatus transfer", async () => {
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
          qualityFactor: 24,
          apparatusTransfer: 0.63,
        },
      ],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 0,
      inputRms: 0,
      previousOscillatorStates: new Map([
        ["measured", createPreviousModalState(0.5)],
      ]),
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
      previousOscillatorStates: new Map(),
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
      previousOscillatorStates: new Map(),
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

  it("uses one global field scale without changing cross-layer energy ratios", async () => {
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
    const previousOscillatorStates = new Map([
      ...sourceModes.map((mode) => [
        mode.modeKey,
        createPreviousModalState(0.35),
      ]),
      [resonantMode.modeKey, createPreviousModalState(0.16)],
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
      previousOscillatorStates,
    });
    const resonantOnly = updateModalResponseFrame({
      ...commonOptions,
      modes: [resonantMode],
      previousOscillatorStates: new Map([
        [resonantMode.modeKey, createPreviousModalState(0.16)],
      ]),
    });
    const mixedResonant = mixed.entries.find(
      (entry) => entry.modeKey === resonantMode.modeKey,
    );
    const isolatedResonant = resonantOnly.entries[0];

    expect(mixed.modalResponseBudgetScaleSourceCoupled).toBeLessThan(1);
    expect(mixed.modalResponseBudgetScaleResonant).toBeCloseTo(
      mixed.modalResponseBudgetScaleSourceCoupled,
      8,
    );
    expect(mixed.modalResponseEnergy).toBeLessThanOrEqual(1);
    expect(mixed.modalResponseResonantEnergy).toBeGreaterThan(0);
    expect(mixedResonant?.modalResponseRawEnergy).toBeCloseTo(
      isolatedResonant?.modalResponseRawEnergy ?? 0,
      6,
    );
    expect(mixedResonant?.modalResponseEnergy).toBeCloseTo(
      (mixedResonant?.modalResponseRawEnergy ?? 0) *
        mixed.modalResponseBudgetScale,
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
    const previousOscillatorStates = new Map([
      ...sourceModes.map((mode) => [
        mode.modeKey,
        createPreviousModalState(0.35),
      ]),
      [resonantMode.modeKey, createPreviousModalState(0.01)],
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
      previousOscillatorStates,
    });
    const resonantOnly = updateModalResponseFrame({
      ...commonOptions,
      modes: [resonantMode],
      previousOscillatorStates: new Map([
        [resonantMode.modeKey, createPreviousModalState(0.01)],
      ]),
    });
    const mixedResonant = mixed.entries.find(
      (entry) => entry.modeKey === resonantMode.modeKey,
    );

    expect(mixed.modalResponseSourceCoupledEnergy).toBeGreaterThan(0.9);
    expect(mixed.modalResponseResonantEnergy).toBeGreaterThan(0);
    expect(mixedResonant?.modalResponseRawEnergy).toBeCloseTo(
      resonantOnly.entries[0]?.modalResponseRawEnergy ?? 0,
      6,
    );
    expect(mixedResonant?.modalResponseEnergy).toBeGreaterThan(0);
  });

  it("preserves weak physical responses without exceeding the field budget", async () => {
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
      previousOscillatorStates: new Map(),
      responseBudget: 0.32,
    });

    const peak = response.entries.find((entry) => entry.modeKey === "peak");
    const weak = response.entries.filter((entry) =>
      entry.modeKey.startsWith("weak:"),
    );
    expect(peak).toBeDefined();
    expect(weak).toHaveLength(8);
    expect(
      weak.every(
        (entry) => entry.modalResponseEnergy < peak.modalResponseEnergy,
      ),
    ).toBe(true);
    expect(response.modalResponseResonantEnergy).toBeLessThanOrEqual(0.32);
  });

  it("reports every positive physical response before capacity projection", async () => {
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
      previousOscillatorStates: new Map(),
    });

    expect(response.entries.map((entry) => entry.modeKey)).toEqual([
      "peak",
      "weak",
    ]);
    expect(response.modalResponseModeCount).toBe(response.entries.length);
  });

  it("maps calibrated pressure amplitude to modal energy by the square law", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "pressure-law",
      u: 1,
      v: 2,
      w: 3,
      naturalFrequencyHz: 440,
      layer: "source-coupled",
      qualityFactor: 12,
      sourceCouplingEnergy: 1,
    };
    const buildResponse = (normalizedInputAmplitude) =>
      updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: makeFft([[440, 1]]),
        sampleRate: SAMPLE_RATE,
        deltaMs: 5000,
        inputRms: 0.1,
        normalizedInputAmplitude,
        previousOscillatorStates: new Map(),
        exactDriveResult: {
          responseEnergyByMode: new Float64Array([1]),
          measurements: [],
        },
      });

    const lower = buildResponse(0.0175);
    const higher = buildResponse(0.035);

    expect(higher.entries[0].modalResponseDrive).toBeCloseTo(
      lower.entries[0].modalResponseDrive * 4,
      8,
    );
    expect(higher.entries[0].displayAmplitude).toBeCloseTo(
      lower.entries[0].displayAmplitude * 2,
      6,
    );
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
      previousOscillatorStates: new Map(),
    });

    expect(response.entries[0]?.modalResponseEnergy).toBeGreaterThan(0.2);
    expect(response.entries[0]?.dampingEnvelope).toBe(1);
    expect(response.entries[0]?.displayAmplitude).toBeGreaterThan(0.5);
  });

  it("rings up and rings down on the same 2Q/ω time constant", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const qualityFactor = 164;
    const naturalFrequencyHz = 110;
    const amplitudeTauMs =
      ((2 * qualityFactor) / (2 * Math.PI * naturalFrequencyHz)) * 1000;
    const mode = {
      modeKey: "ring",
      u: 1,
      v: 1,
      w: 1,
      naturalFrequencyHz,
      layer: "source-coupled",
      qualityFactor,
    };
    const step = ({ driven, previousOscillatorStates, deltaMs }) =>
      updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: driven
          ? makeFft([[naturalFrequencyHz, 0.9]])
          : new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs,
        inputRms: driven ? 0.12 : 0,
        previousOscillatorStates,
        minimumEnergy: 0,
      });

    // One tau of drive from rest leaves the amplitude 1 - 1/e of the way to
    // steady state; one tau of silence from steady state leaves it 1/e of the
    // way back. The slowly varying envelope has one decay rate, so neither
    // side may be shortened independently.
    const settled = step({
      driven: true,
      previousOscillatorStates: new Map(),
      deltaMs: 20000,
    });
    const settledAmplitude = settled.entries[0].displayAmplitude;

    const risen = step({
      driven: true,
      previousOscillatorStates: new Map(),
      deltaMs: amplitudeTauMs,
    });
    expect(risen.entries[0].displayAmplitude / settledAmplitude).toBeCloseTo(
      1 - 1 / Math.E,
      4,
    );

    const rungDown = step({
      driven: false,
      deltaMs: amplitudeTauMs,
      previousOscillatorStates: new Map(
        settled.oscillatorStates.map((state) => [state.modeKey, state]),
      ),
    });
    expect(rungDown.entries[0].displayAmplitude / settledAmplitude).toBeCloseTo(
      1 / Math.E,
      4,
    );
  });

  it("does not rectify a modulated drive into a plateau", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const mode = {
      modeKey: "1:1:1",
      u: 1,
      v: 1,
      w: 1,
      naturalFrequencyHz: 110,
      layer: "source-coupled",
      qualityFactor: 12,
    };
    const FRAME_MS = 16;

    // A staccato bar: loud for ~120 ms, near-silent for ~380 ms. An asymmetric
    // peak-hold pins itself near the peak between hits; the linear envelope
    // must preserve a large peak-to-trough range.
    let previousOscillatorStates = new Map();
    const energies = [];
    for (let frame = 0; frame < 240; frame += 1) {
      const loud = ((frame * FRAME_MS) / 1000) % 0.5 < 0.12;
      const response = updateModalResponseFrame({
        modes: [mode],
        fftLinearAmplitudes: loud
          ? makeFft([[110, 0.9]])
          : new Float32Array(BIN_COUNT),
        sampleRate: SAMPLE_RATE,
        deltaMs: FRAME_MS,
        inputRms: loud ? 0.12 : 0,
        previousOscillatorStates,
        minimumEnergy: 0,
      });
      previousOscillatorStates = new Map(
        response.oscillatorStates.map((state) => [state.modeKey, state]),
      );
      energies.push(response.entries[0]?.modalResponseEnergy ?? 0);
    }

    const settled = energies.slice(80);
    const peak = Math.max(...settled);
    const trough = Math.min(...settled);
    expect(peak / Math.max(trough, 1e-12)).toBeGreaterThan(50);
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
        previousOscillatorStates: new Map(),
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

  it("drives detuned modes at the single source component frequency", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = 293.7;
    const timeDomainData = new Float32Array(2048);
    for (let index = 0; index < timeDomainData.length; index += 1) {
      timeDomainData[index] = Math.sin(
        (2 * Math.PI * sourceFrequencyHz * index) / SAMPLE_RATE,
      );
    }
    const modes = [
      {
        modeKey: "lower-detuned",
        u: 1,
        v: 2,
        w: 4,
        naturalFrequencyHz: 271.29,
        layer: "source-coupled",
        qualityFactor: 2,
      },
      {
        modeKey: "upper-detuned",
        u: 2,
        v: 3,
        w: 4,
        naturalFrequencyHz: 318.8,
        layer: "source-coupled",
        qualityFactor: 2,
      },
    ];

    const response = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: makeFft([[sourceFrequencyHz, 0.8]]),
      timeDomainData,
      sampleRate: SAMPLE_RATE,
      deltaMs: 500,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
    });
    const forcedFrequencies = response.entries.map(
      (entry) => entry.oscillatorAngularVelocityRadPerSec / (2 * Math.PI),
    );

    expect(response.entries).toHaveLength(modes.length);
    expect(
      response.entries.every(
        (entry) => entry.modalOscillatorDrivePhaseLocked === true,
      ),
    ).toBe(true);
    expect(forcedFrequencies[0]).toBeCloseTo(forcedFrequencies[1], 6);
    expect(Math.abs(forcedFrequencies[0] - sourceFrequencyHz)).toBeLessThan(
      SAMPLE_RATE / (BIN_COUNT * 2),
    );
    expect(response.entries.map((entry) => entry.naturalFrequencyHz)).toEqual(
      modes.map((mode) => mode.naturalFrequencyHz),
    );
    const responsePhases = response.entries.map((entry) =>
      Math.atan2(
        entry.modalOscillatorEnvelopeIm,
        entry.modalOscillatorEnvelopeRe,
      ),
    );
    expect(responsePhases[0]).toBeLessThan(-Math.PI / 2);
    expect(responsePhases[1]).toBeGreaterThan(-Math.PI / 2);

    const ringDown = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      timeDomainData: null,
      sampleRate: SAMPLE_RATE,
      deltaMs: 16,
      inputRms: 0,
      hardSilence: true,
      previousOscillatorStates: new Map(
        response.oscillatorStates.map((entry) => [entry.modeKey, entry]),
      ),
      minimumEnergy: 0,
    });
    expect(
      ringDown.entries.every(
        (entry) => entry.modalOscillatorDrivePhaseLocked === false,
      ),
    ).toBe(true);
    for (const [index, entry] of ringDown.entries.entries()) {
      expect(entry.oscillatorAngularVelocityRadPerSec).toBeCloseTo(
        2 * Math.PI * modes[index].naturalFrequencyHz,
        6,
      );
    }
  });

  it("does not add a second forced transfer to exact modal drive shares", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = 100;
    const exactDriveShare = 0.2;
    const timeDomainData = new Float32Array(2048);
    for (let index = 0; index < timeDomainData.length; index += 1) {
      timeDomainData[index] =
        0.8 * Math.cos((2 * Math.PI * sourceFrequencyHz * index) / SAMPLE_RATE);
    }

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "exact-detuned",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: 110,
          layer: "source-coupled",
          qualityFactor: 4,
        },
      ],
      fftLinearAmplitudes: makeFft([[sourceFrequencyHz, 0.8]]),
      timeDomainData,
      sampleRate: SAMPLE_RATE,
      deltaMs: 1000,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
      exactDriveResult: {
        responseEnergyByMode: new Float64Array([exactDriveShare]),
        measurements: [],
      },
    });

    expect(response.entries[0]?.modalResponseDrive).toBeCloseTo(
      exactDriveShare,
      8,
    );
  });

  it("preserves relative oscillator energy across physical layer labels", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const modes = [
      {
        modeKey: "source",
        u: 1,
        v: 1,
        w: 1,
        naturalFrequencyHz: 440,
        layer: "source-coupled",
        qualityFactor: 12,
      },
      {
        modeKey: "resonant",
        u: 1,
        v: 1,
        w: 2,
        naturalFrequencyHz: 440,
        layer: "resonant",
        qualityFactor: 12,
      },
    ];

    const response = updateModalResponseFrame({
      modes,
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: 0,
      inputRms: 0,
      previousOscillatorStates: new Map(
        modes.map((mode) => [mode.modeKey, createPreviousModalState(0.8)]),
      ),
      minimumEnergy: 0,
      responseBudget: 1,
    });

    expect(response.entries).toHaveLength(2);
    expect(response.entries[0].modalResponseEnergy).toBeCloseTo(
      response.entries[1].modalResponseEnergy,
      8,
    );
    expect(response.entries[0].displayAmplitude).toBeCloseTo(
      response.entries[1].displayAmplitude,
      8,
    );
  });

  // The engine measures no contact point, so it must not invent a per-mode
  // response phase from one. An earlier model flipped a mode by pi when its
  // declared source overlap came out negative; that sign was a property of an
  // invented coordinate, not of the audio.
  it("injects no source-derived relative phase between equally coupled modes", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = (SAMPLE_RATE * 16) / BIN_COUNT;
    const timeDomainData = new Float32Array(BIN_COUNT);
    for (let index = 0; index < timeDomainData.length; index += 1) {
      timeDomainData[index] = Math.cos(
        (2 * Math.PI * sourceFrequencyHz * index) / SAMPLE_RATE,
      );
    }
    const commonMode = {
      naturalFrequencyHz: sourceFrequencyHz,
      layer: "source-coupled",
      qualityFactor: 8,
      sourceCouplingEnergy: 0.5,
      sourceCouplingAmplitude: Math.SQRT1_2,
    };

    const response = updateModalResponseFrame({
      modes: [
        { ...commonMode, modeKey: "mode-a", u: 1, v: 1, w: 1 },
        { ...commonMode, modeKey: "mode-b", u: 1, v: 1, w: 2 },
      ],
      fftLinearAmplitudes: makeFft([[sourceFrequencyHz, 0.8]]),
      timeDomainData,
      sampleRate: SAMPLE_RATE,
      deltaMs: 500,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
    });
    const first = response.entries.find((entry) => entry.modeKey === "mode-a");
    const second = response.entries.find((entry) => entry.modeKey === "mode-b");
    const phaseOf = (entry) =>
      Math.atan2(
        entry.modalOscillatorEnvelopeIm,
        entry.modalOscillatorEnvelopeRe,
      );
    const phaseDifference = Math.abs(
      Math.atan2(
        Math.sin(phaseOf(second) - phaseOf(first)),
        Math.cos(phaseOf(second) - phaseOf(first)),
      ),
    );

    expect(first?.modalResponseEnergy).toBeCloseTo(
      second?.modalResponseEnergy,
      8,
    );
    expect(phaseDifference).toBeCloseTo(0, 5);
  });

  it("does not create modal energy for a spatially uncoupled mode", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = (SAMPLE_RATE * 16) / BIN_COUNT;
    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "uncoupled-mode",
          u: 1,
          v: 2,
          w: 3,
          naturalFrequencyHz: sourceFrequencyHz,
          layer: "source-coupled",
          qualityFactor: 8,
          sourceCouplingAmplitude: 0,
          sourceCouplingEnergy: 0,
        },
      ],
      fftLinearAmplitudes: makeFft([[sourceFrequencyHz, 1]]),
      sampleRate: SAMPLE_RATE,
      deltaMs: 500,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
    });

    expect(response.entries).toHaveLength(0);
    expect(response.oscillatorStates).toHaveLength(0);
  });

  it("does not let a negligible secondary peak change the forced carrier", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const sourceFrequencyHz = 293.7;
    const weakHarmonicFrequencyHz = sourceFrequencyHz * 2;
    const timeDomainData = new Float32Array(2048);
    for (let index = 0; index < timeDomainData.length; index += 1) {
      const timeSec = index / SAMPLE_RATE;
      timeDomainData[index] =
        0.8 * Math.sin(2 * Math.PI * sourceFrequencyHz * timeSec) +
        0.0001 * Math.sin(2 * Math.PI * weakHarmonicFrequencyHz * timeSec);
    }

    const response = updateModalResponseFrame({
      modes: [
        {
          modeKey: "lower-detuned",
          u: 1,
          v: 2,
          w: 4,
          naturalFrequencyHz: 271.29,
          layer: "source-coupled",
          qualityFactor: 2,
        },
        {
          modeKey: "upper-detuned",
          u: 2,
          v: 3,
          w: 4,
          naturalFrequencyHz: 318.8,
          layer: "source-coupled",
          qualityFactor: 2,
        },
      ],
      fftLinearAmplitudes: makeFft([
        [sourceFrequencyHz, 0.8],
        [weakHarmonicFrequencyHz, 0.0001],
      ]),
      timeDomainData,
      sampleRate: SAMPLE_RATE,
      deltaMs: 500,
      inputRms: 0.2,
      previousOscillatorStates: new Map(),
      minimumEnergy: 0,
    });

    expect(response.entries).toHaveLength(2);
    for (const entry of response.entries) {
      expect(entry.modalOscillatorDrivePhaseLocked).toBe(true);
      expect(
        Math.abs(
          entry.oscillatorAngularVelocityRadPerSec / (2 * Math.PI) -
            sourceFrequencyHz,
        ),
      ).toBeLessThan(SAMPLE_RATE / (BIN_COUNT * 2));
    }
  });

  it("assigns each mode the source component that physically drives it", async () => {
    const { updateModalResponseFrame } = await loadModalResponseModule();
    const f1 = (SAMPLE_RATE * 20) / 2048;
    const f2 = (SAMPLE_RATE * 47) / 2048;
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
          modeKey: "low-response",
          u: 1,
          v: 1,
          w: 1,
          naturalFrequencyHz: f1 * 1.04,
          layer: "source-coupled",
          qualityFactor: 16,
        },
        {
          modeKey: "high-response",
          u: 2,
          v: 3,
          w: 4,
          naturalFrequencyHz: f2 * 0.97,
          layer: "source-coupled",
          qualityFactor: 16,
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
      previousOscillatorStates: new Map(),
    });
    const lowResponse = response.entries.find(
      (entry) => entry.modeKey === "low-response",
    );
    const highResponse = response.entries.find(
      (entry) => entry.modeKey === "high-response",
    );

    expect(lowResponse?.modalOscillatorDrivePhaseLocked).toBe(true);
    expect(highResponse?.modalOscillatorDrivePhaseLocked).toBe(true);
    expect(
      lowResponse?.oscillatorAngularVelocityRadPerSec / (2 * Math.PI),
    ).toBeCloseTo(f1, 6);
    expect(
      highResponse?.oscillatorAngularVelocityRadPerSec / (2 * Math.PI),
    ).toBeCloseTo(f2, 6);
    expect(lowResponse?.modalResponseTemporalDominance).toBeGreaterThan(0.9);
    expect(highResponse?.modalResponseTemporalDominance).toBeGreaterThan(0.9);
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
      previousOscillatorStates: new Map(),
    });
    const firstEntry = first.entries[0];
    const halfPeriodMs = 1000 / (mode.naturalFrequencyHz * 2);
    const second = updateModalResponseFrame({
      modes: [mode],
      fftLinearAmplitudes: new Float32Array(BIN_COUNT),
      sampleRate: SAMPLE_RATE,
      deltaMs: halfPeriodMs,
      inputRms: 0,
      previousOscillatorStates: new Map([[mode.modeKey, firstEntry]]),
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

describe("forced modal transfer", () => {
  const LOWER = { hz: 118.4, q: 188 };

  it("rejects transfer evaluation without apparatus-derived Q", async () => {
    const { computeForcedModalTransfer } = await import("./modalTransfer.js");

    expect(() =>
      computeForcedModalTransfer({
        driveHz: 110,
        modeHz: 118.4,
      }),
    ).toThrow("Modal transfer must declare an apparatus-derived Q");
  });

  it("publishes one complex transfer whose phase and magnitude share the same pole", async () => {
    const { computeForcedModalTransfer } = await import("./modalTransfer.js");
    const below = computeForcedModalTransfer({
      driveHz: 100,
      modeHz: LOWER.hz,
      qualityFactor: LOWER.q,
    });
    const resonance = computeForcedModalTransfer({
      driveHz: LOWER.hz,
      modeHz: LOWER.hz,
      qualityFactor: LOWER.q,
    });
    const above = computeForcedModalTransfer({
      driveHz: 140,
      modeHz: LOWER.hz,
      qualityFactor: LOWER.q,
    });

    expect(below.real).toBeGreaterThan(0);
    expect(above.real).toBeLessThan(0);
    expect(resonance.real).toBeCloseTo(0, 12);
    expect(resonance.imaginary).toBeCloseTo(-1, 12);
    for (const transfer of [below, resonance, above]) {
      expect(transfer.energy).toBeCloseTo(
        transfer.real ** 2 + transfer.imaginary ** 2,
        12,
      );
      expect(transfer.phaseRad).toBeCloseTo(
        Math.atan2(transfer.imaginary, transfer.real),
        12,
      );
    }
  });

  it("uses the same canonical pole for spectral response and forced transfer", async () => {
    const { computeForcedModalTransferEnergy } =
      await import("./modalTransfer.js");
    const { computeModalFrequencyResponse } = await loadModalResponseModule();

    for (const driveHz of [20, 60, 118.4, 125, 300]) {
      expect(
        computeModalFrequencyResponse({
          binFrequencyHz: driveHz,
          modeFrequencyHz: LOWER.hz,
          qualityFactor: LOWER.q,
        }),
      ).toBeCloseTo(
        computeForcedModalTransferEnergy({
          driveHz,
          modeHz: LOWER.hz,
          qualityFactor: LOWER.q,
        }),
        12,
      );
    }
  });

  it("is unity on resonance for every mode regardless of frequency", async () => {
    const { computeForcedModalTransferEnergy } =
      await import("./modalTransfer.js");

    // The resonant reference is what stops treble being buried under bass by
    // the 1/wn^4 of a constant-force drive.
    for (const [hz, q] of [
      [59.2, 126],
      [672.4, 400],
      [4000, 1200],
    ]) {
      expect(
        computeForcedModalTransferEnergy({
          driveHz: hz,
          modeHz: hz,
          qualityFactor: q,
        }),
      ).toBeCloseTo(1, 6);
    }
  });

  it("keeps a sub-floor drive coupled to the fundamental", async () => {
    const { computeForcedModalTransferEnergy } =
      await import("./modalTransfer.js");

    // Below the cavity's lowest mode the response tends to the stiffness
    // controlled limit rather than zero, so drive under the acoustic floor
    // still forces the fundamental.
    const subFloor = computeForcedModalTransferEnergy({
      driveHz: 45,
      modeHz: 59.2,
      qualityFactor: 126,
    });

    expect(subFloor).toBeGreaterThan(0);
    expect(subFloor).toBeLessThan(1);
  });
});
