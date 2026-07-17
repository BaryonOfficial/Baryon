import { describe, expect, it } from "vitest";
import { resolveHarmonicDrivePhaseLocks } from "./modalDrivePhase.js";
import { normalizePhaseRad } from "./modalPhaseSlots.js";
import {
  FAST_MODAL_DRIVE_PROBE_LIMIT,
  FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  createFastModalDriveEstimator,
  selectFastModalProbeModeIndices,
} from "./fastModalDriveEstimator.js";

function makeModes(entries) {
  return entries.map((entry) => ({
    physicalTransfer: 1,
    targetEnergy: 0,
    ...entry,
  }));
}

function makeSignal({ sampleRate, components }) {
  const samples = new Float32Array(FAST_MODAL_DRIVE_WINDOW_SAMPLES);
  for (let index = 0; index < samples.length; index += 1) {
    for (const component of components) {
      samples[index] +=
        component.amplitude *
        Math.cos(
          (2 * Math.PI * component.frequencyHz * index) / sampleRate +
            (component.phaseRad ?? 0),
        );
    }
  }
  return samples;
}

describe("fast modal drive estimator", () => {
  it("selects the strongest 48 modes with a deterministic identity tie-break", () => {
    const modes = makeModes(
      Array.from({ length: 52 }, (_, index) => ({
        modeKey: `mode:${String(51 - index).padStart(2, "0")}`,
        naturalFrequencyHz: 80 + index * 10,
        targetEnergy: index < 4 ? 0.2 : 0.8,
      })),
    );
    const selected = selectFastModalProbeModeIndices(modes);

    expect(selected).toBeInstanceOf(Uint16Array);
    expect(selected).toHaveLength(FAST_MODAL_DRIVE_PROBE_LIMIT);
    const selectedKeys = Array.from(selected, (index) => modes[index].modeKey);
    expect(selectedKeys.slice(0, 4)).toEqual([
      "mode:00",
      "mode:01",
      "mode:02",
      "mode:03",
    ]);
    expect(selectedKeys).not.toContain("mode:51");
  });

  it("measures amplitude and phase below one 2048-sample FFT bin", () => {
    const sampleRate = 44100;
    const frequencyHz = 17.5;
    const amplitude = 0.6;
    const phaseRad = 0.8;
    const estimator = createFastModalDriveEstimator({
      committedModes: makeModes([
        {
          modeKey: "sub-bin",
          naturalFrequencyHz: frequencyHz,
          targetEnergy: 1,
        },
      ]),
      sampleRate,
    });
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz, amplitude, phaseRad }],
      }),
    );

    expect(sampleRate / FAST_MODAL_DRIVE_WINDOW_SAMPLES).toBeGreaterThan(
      frequencyHz,
    );
    expect(result.magnitudes[0]).toBeCloseTo(amplitude, 4);
    expect(normalizePhaseRad(result.phasesRad[0] - phaseRad)).toBeCloseTo(0, 4);
    expect(result.energyShares[0]).toBeCloseTo(1, 4);
  });

  it("measures a detuned low mode at its exact non-bin frequency", () => {
    const sampleRate = 48000;
    const frequencyHz = 73.2;
    const amplitude = 0.43;
    const phaseRad = -0.67;
    const estimator = createFastModalDriveEstimator({
      committedModes: makeModes([
        {
          modeKey: "detuned",
          naturalFrequencyHz: frequencyHz,
          targetEnergy: 1,
        },
      ]),
      sampleRate,
    });
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz, amplitude, phaseRad }],
      }),
    );

    expect(result.magnitudes[0]).toBeCloseTo(amplitude, 4);
    expect(normalizePhaseRad(result.phasesRad[0] - phaseRad)).toBeCloseTo(0, 4);
  });

  it("reduces forcing when the input is detuned from the committed mode", () => {
    const sampleRate = 48000;
    const modeFrequencyHz = 220;
    const estimator = createFastModalDriveEstimator({
      committedModes: makeModes([
        {
          modeKey: "detuning-response",
          naturalFrequencyHz: modeFrequencyHz,
          targetEnergy: 1,
        },
      ]),
      sampleRate,
    });
    const matchedMagnitude = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [
          { frequencyHz: modeFrequencyHz, amplitude: 0.5, phaseRad: 0.3 },
        ],
      }),
    ).magnitudes[0];
    const detuned = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [
          {
            frequencyHz: modeFrequencyHz + 20,
            amplitude: 0.5,
            phaseRad: 0.3,
          },
        ],
      }),
    );

    expect(matchedMagnitude).toBeGreaterThan(detuned.magnitudes[0] * 4);
    expect(detuned.energyShares[0]).toBeLessThan(0.05);
  });

  it("produces physical targets and harmonic-lock measurements for a polyphonic series", () => {
    const sampleRate = 48000;
    const binFrequencyHz = sampleRate / FAST_MODAL_DRIVE_WINDOW_SAMPLES;
    const fundamentalHz = binFrequencyHz * 8;
    const amplitudes = [0.5, 0.25, 0.125];
    const phases = [0.35, -0.6, 1.1];
    const inputExposure = 0.8;
    const physicalTransfers = [0.5, 0.75, 1];
    const modes = makeModes(
      amplitudes.map((_, index) => ({
        modeKey: `harmonic:${index + 1}`,
        naturalFrequencyHz: fundamentalHz * (index + 1),
        physicalTransfer: physicalTransfers[index],
        targetEnergy: 1 - index * 0.1,
      })),
    );
    const estimator = createFastModalDriveEstimator({
      committedModes: modes,
      sampleRate,
    });
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: amplitudes.map((amplitude, index) => ({
          amplitude,
          frequencyHz: fundamentalHz * (index + 1),
          phaseRad: phases[index],
        })),
      }),
      inputExposure,
    );
    const totalSquaredAmplitude = amplitudes.reduce(
      (total, amplitude) => total + amplitude * amplitude,
      0,
    );

    for (let index = 0; index < amplitudes.length; index += 1) {
      const expectedShare =
        (amplitudes[index] * amplitudes[index]) / totalSquaredAmplitude;
      expect(result.energyShares[index]).toBeCloseTo(expectedShare, 4);
      expect(result.targetEnergies[index]).toBeCloseTo(
        expectedShare * inputExposure * physicalTransfers[index],
        4,
      );
    }

    const locks = resolveHarmonicDrivePhaseLocks(result.measurements);
    expect(locks.get("harmonic:1")?.harmonicOrder).toBe(1);
    expect(locks.get("harmonic:2")?.harmonicOrder).toBe(2);
    expect(locks.get("harmonic:3")?.harmonicOrder).toBe(3);
    expect(locks.get("harmonic:2")?.lockedPhaseRad).toBeCloseTo(
      normalizePhaseRad(phases[1] - 2 * phases[0]),
      4,
    );
  });

  it("writes zero forcing for unselected modes and hard silence", () => {
    const sampleRate = 48000;
    const modes = makeModes([
      {
        modeKey: "selected",
        naturalFrequencyHz: 220,
        targetEnergy: 1,
      },
      {
        modeKey: "unselected",
        naturalFrequencyHz: 440,
        targetEnergy: 0.2,
      },
    ]);
    const estimator = createFastModalDriveEstimator({
      committedModes: modes,
      probeModeIndices: selectFastModalProbeModeIndices(modes, 1),
      sampleRate,
    });
    const active = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz: 220, amplitude: 0.5 }],
      }),
      1,
    );

    expect(active.targetEnergyByMode[0]).toBeGreaterThan(0);
    expect(active.targetEnergyByMode[1]).toBe(0);
    expect(active.energyShareByMode[0]).toBeGreaterThan(0);
    expect(active.energyShareByMode[1]).toBe(0);

    const silent = estimator.evaluate(null, 1, true);
    expect(silent.hardSilence).toBe(true);
    expect(Array.from(silent.targetEnergyByMode)).toEqual([0, 0]);
    expect(Array.from(silent.energyShareByMode)).toEqual([0, 0]);
    expect(silent.measurements[0].magnitude).toBe(0);
  });

  it("reuses every typed output buffer across steady evaluations", () => {
    const sampleRate = 48000;
    const estimator = createFastModalDriveEstimator({
      committedModes: makeModes([
        {
          modeKey: "stable",
          naturalFrequencyHz: 220,
          targetEnergy: 1,
        },
      ]),
      sampleRate,
    });
    const signal = makeSignal({
      sampleRate,
      components: [{ frequencyHz: 220, amplitude: 0.4 }],
    });
    const first = estimator.evaluate(signal);
    const identities = {
      probeModeIndices: first.probeModeIndices,
      frequenciesHz: first.frequenciesHz,
      real: first.real,
      imaginary: first.imaginary,
      magnitudes: first.magnitudes,
      phasesRad: first.phasesRad,
      energyShares: first.energyShares,
      energyShareByMode: first.energyShareByMode,
      targetEnergies: first.targetEnergies,
      targetEnergyByMode: first.targetEnergyByMode,
      measurements: first.measurements,
    };
    const second = estimator.evaluate(signal, 0.5);

    expect(second).toBe(first);
    for (const [key, identity] of Object.entries(identities)) {
      expect(second[key]).toBe(identity);
    }
  });

  it("updates live physical transfer without rebuilding recurrence buffers", () => {
    const sampleRate = 48000;
    const modes = makeModes([
      {
        modeKey: "stable",
        naturalFrequencyHz: 220,
        targetEnergy: 1,
        physicalTransfer: 0.25,
      },
    ]);
    const estimator = createFastModalDriveEstimator({
      committedModes: modes,
      sampleRate,
    });
    const signal = makeSignal({
      sampleRate,
      components: [{ frequencyHz: 220, amplitude: 0.4 }],
    });
    const first = estimator.evaluate(signal, 1).targetEnergies[0];

    estimator.updateCommittedModes([{ ...modes[0], physicalTransfer: 0.75 }]);
    const second = estimator.evaluate(signal, 1).targetEnergies[0];

    expect(second).toBeCloseTo(first * 3, 5);
  });
});
