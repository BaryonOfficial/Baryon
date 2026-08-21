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
    qualityFactor: 20,
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
  it("rejects committed physical modes without apparatus-derived Q", () => {
    expect(() =>
      createFastModalDriveEstimator({
        committedModes: makeModes([
          {
            modeKey: "missing-q",
            naturalFrequencyHz: 220,
            qualityFactor: undefined,
          },
        ]),
        sampleRate: 48000,
      }),
    ).toThrow("Committed mode missing-q must declare an apparatus-derived Q");
  });

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
    expect(result.responseEnergies[0]).toBeCloseTo(1, 4);
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
    expect(detuned.responseEnergies[0]).toBeLessThan(0.05);
  });

  it("produces physical targets and harmonic-lock measurements for a polyphonic series", () => {
    const sampleRate = 48000;
    const binFrequencyHz = sampleRate / FAST_MODAL_DRIVE_WINDOW_SAMPLES;
    const fundamentalHz = binFrequencyHz * 8;
    const amplitudes = [0.5, 0.25, 0.125];
    const phases = [0.35, -0.6, 1.1];
    const inputEnergyScale = 0.8;
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
      inputEnergyScale,
    );
    const totalSquaredAmplitude = amplitudes.reduce(
      (total, amplitude) => total + amplitude * amplitude,
      0,
    );

    // Each harmonic still owns its own mode, but the modes now exchange a
    // little forcing off resonance rather than being perfectly isolated, so the
    // shares track the drive's energy split without reproducing it exactly.
    for (let index = 0; index < amplitudes.length; index += 1) {
      const expectedShare =
        (amplitudes[index] * amplitudes[index]) / totalSquaredAmplitude;
      expect(result.responseEnergies[index]).toBeCloseTo(expectedShare, 1);
      expect(result.targetEnergies[index]).toBeCloseTo(
        result.responseEnergies[index] *
          inputEnergyScale *
          physicalTransfers[index],
        4,
      );
    }
    expect(result.responseEnergies[0]).toBeGreaterThan(
      result.responseEnergies[1],
    );
    expect(result.responseEnergies[1]).toBeGreaterThan(
      result.responseEnergies[2],
    );

    const locks = resolveHarmonicDrivePhaseLocks(result.measurements);
    expect(locks.get("harmonic:1")?.harmonicOrder).toBe(1);
    expect(locks.get("harmonic:2")?.harmonicOrder).toBe(2);
    expect(locks.get("harmonic:3")?.harmonicOrder).toBe(3);
    expect(locks.get("harmonic:2")?.lockedPhaseRad).toBeCloseTo(
      normalizePhaseRad(phases[1] - 2 * phases[0]),
      4,
    );
  });

  // A cavity's low modes are sparse and its high modes are dense. Probes in the
  // dense region overlap heavily over a 42.7 ms window, so measuring each one
  // independently lets them all claim the same acoustic energy. The summed
  // share then tracks local mode density rather than the input, and the shared
  // response budget downstream turns that into a loudness bias against the
  // sparse low end.
  const CAVITY_LOW_MODES_HZ = [59.2, 83.7, 102.5, 118.4, 132.4, 145.0];
  const CAVITY_DENSE_MODES_HZ = [
    632.1, 645.9, 659.4, 672.4, 685.2, 697.7, 710.0, 722.0,
  ];

  function makeCavityEstimator(sampleRate = 48000) {
    return createFastModalDriveEstimator({
      committedModes: makeModes(
        [...CAVITY_LOW_MODES_HZ, ...CAVITY_DENSE_MODES_HZ].map(
          (naturalFrequencyHz) => ({
            modeKey: `cavity:${naturalFrequencyHz}`,
            naturalFrequencyHz,
            targetEnergy: 1,
          }),
        ),
      ),
      sampleRate,
    });
  }

  function sumResponses(result, predicate = () => true) {
    let total = 0;
    for (let probe = 0; probe < result.probeCount; probe += 1) {
      if (predicate(result.frequenciesHz[probe])) {
        total += result.responseEnergies[probe];
      }
    }
    return total;
  }

  it("preserves absolute modal response instead of normalizing transfer columns", () => {
    const sampleRate = 48000;
    const estimator = makeCavityEstimator(sampleRate);
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz: 670, amplitude: 1 }],
      }),
    );

    // The source-channel fit still partitions measured input, but several
    // physical modes may each store response to that same drive.
    expect(result.explainedEnergyShare).toBeLessThanOrEqual(1.000001);
    expect(sumResponses(result)).toBeGreaterThan(result.explainedEnergyShare);
    expect(
      Array.from(result.responseEnergyByMode).every(
        (responseEnergy) => responseEnergy >= 0 && responseEnergy <= 1,
      ),
    ).toBe(true);
  });

  it("retains the apparatus response-density difference between sparse and dense regions", () => {
    const sampleRate = 48000;
    const estimator = makeCavityEstimator(sampleRate);
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [
          { frequencyHz: 59.2, amplitude: 0.5 },
          { frequencyHz: 672.4, amplitude: 0.5 },
        ],
      }),
    );
    const low = sumResponses(result, (frequencyHz) => frequencyHz < 300);
    const high = sumResponses(result, (frequencyHz) => frequencyHz >= 300);

    expect(high).toBeGreaterThan(low);
    expect(low / (low + high)).toBeLessThan(0.3);
  });

  it("keeps fitted amplitudes within the input rather than manufacturing energy", () => {
    const sampleRate = 48000;
    const estimator = makeCavityEstimator(sampleRate);
    // Below the cavity's acoustic floor, so no committed mode can represent it.
    // An unregularized fit answers with huge cancelling amplitudes instead of
    // admitting the input is unexplainable.
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz: 45, amplitude: 0.5 }],
      }),
    );

    for (let probe = 0; probe < result.probeCount; probe += 1) {
      expect(result.magnitudes[probe]).toBeLessThanOrEqual(0.5);
    }
    // Sub-floor input is reported as unexplained rather than absorbed.
    expect(result.explainedEnergyShare).toBeLessThan(0.95);
  });

  it("publishes equal absolute responses for exactly degenerate family rows", () => {
    const sampleRate = 48000;
    const degenerateHz = 177.6;
    const estimator = createFastModalDriveEstimator({
      committedModes: makeModes([
        { modeKey: "0,0,3", naturalFrequencyHz: degenerateHz, targetEnergy: 1 },
        { modeKey: "1,2,2", naturalFrequencyHz: degenerateHz, targetEnergy: 1 },
      ]),
      sampleRate,
    });
    const result = estimator.evaluate(
      makeSignal({
        sampleRate,
        components: [{ frequencyHz: degenerateHz, amplitude: 1 }],
      }),
    );

    // No temporal measurement can separate them. Both family rows carry the
    // same response and the shell-collapse owner retains one maximum.
    expect(result.channelCount).toBe(1);
    expect(result.responseEnergies[0]).toBeCloseTo(
      result.responseEnergies[1],
      6,
    );
    expect(result.responseEnergies[0]).toBeCloseTo(1, 3);
  });

  it("forces unprobed modes off resonance and zeroes everything on hard silence", () => {
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

    // Forcing is a transfer, not a measurement, so a mode responds whether or
    // not a probe was spent on it. The 440 Hz mode is driven an octave below
    // its resonance and answers weakly rather than not at all — which is what
    // a driven cavity does, and what the old probe-budget zero denied.
    expect(active.responseEnergyByMode[0]).toBeGreaterThan(0);
    expect(active.responseEnergyByMode[1]).toBeGreaterThan(0);
    expect(active.responseEnergyByMode[1]).toBeLessThan(
      active.responseEnergyByMode[0] / 4,
    );
    expect(active.targetEnergyByMode[0]).toBeGreaterThan(0);

    const silent = estimator.evaluate(null, 1, true);
    expect(silent.hardSilence).toBe(true);
    expect(Array.from(silent.targetEnergyByMode)).toEqual([0, 0]);
    expect(Array.from(silent.responseEnergyByMode)).toEqual([0, 0]);
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
      responseEnergies: first.responseEnergies,
      responseEnergyByMode: first.responseEnergyByMode,
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
