import { describe, expect, it } from "vitest";
import {
  referenceHeldHarmonicResponse,
  referenceContinuousHarmonicResponse,
} from "./broadbandHarmonicReference.js";
import { createBroadbandModalResponse } from "../utils/audio/broadbandModalResponse.js";

const shells = [
  { naturalFrequencyHz: 118.4, qualityFactor: 15 },
  { naturalFrequencyHz: 237.1, qualityFactor: 12 },
];
const rms = (a, b) =>
  Math.sqrt(
    a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0) /
      Math.max(
        b.reduce((sum, value) => sum + value * value, 0),
        1e-30,
      ),
  );
function drive(tones, count, sampleRate) {
  return Float64Array.from({ length: count }, (_, n) =>
    tones.reduce(
      (sum, tone) =>
        sum +
        tone.amplitude *
          Math.cos(
            (2 * Math.PI * tone.frequencyHz * n) / sampleRate +
              (tone.phaseRad ?? 0),
          ),
      0,
    ),
  );
}
const quantities = [
  "pressure",
  "velocity",
  "pressureMoments",
  "velocityMoments",
];

describe("independent stationary harmonic reference", () => {
  it.each([20, 118.4, 1000, 20000, 21600])(
    "matches sample-held transfer at %s Hz after transients settle",
    (frequencyHz) => {
      const sampleRate = 48000;
      const sampleIndex = 72000;
      const tones = [{ frequencyHz, amplitude: 0.3, phaseRad: 0.37 }];
      const options = {
        shells,
        tones,
        sampleRate,
        sampleIndex,
        exposureSeconds: 0.05,
      };
      const candidate = createBroadbandModalResponse(options);
      candidate.advance([drive(tones, sampleIndex, sampleRate)]);
      const actual = candidate.read();
      const references = [256, 512, 1024].map((quadratureIntervals) =>
        referenceHeldHarmonicResponse({ ...options, quadratureIntervals }),
      );
      for (const key of quantities) {
        expect(rms(references[0][key], references[1][key])).toBeLessThan(1e-8);
        expect(rms(references[1][key], references[2][key])).toBeLessThan(1e-8);
        expect(rms(actual[key], references[2][key])).toBeLessThan(1e-6);
      }
    },
  );

  it.each([0, 1e-8, 0.5, 5, 40])(
    "retains finite-exposure cross terms across a %s Hz separation",
    (separation) => {
      const sampleRate = 44100,
        sampleIndex = 176400;
      const tones = [
        { frequencyHz: 119, amplitude: 0.3, phaseRad: 0.7 },
        { frequencyHz: 119 + separation, amplitude: 0.2, phaseRad: -0.2 },
      ];
      for (const exposureSeconds of [0.02, 0.05, 0.1]) {
        const options = {
          shells,
          tones,
          sampleRate,
          sampleIndex,
          exposureSeconds,
        };
        const candidate = createBroadbandModalResponse(options);
        candidate.advance([drive(tones, sampleIndex, sampleRate)]);
        const expected = referenceHeldHarmonicResponse(options);
        for (const key of quantities)
          expect(rms(candidate.read()[key], expected[key])).toBeLessThan(1e-6);
      }
    },
  );

  it("approaches continuous sinusoidal observation as hold intervals shrink", () => {
    const tones = [
      { frequencyHz: 113, amplitude: 0.3, phaseRad: 0.7 },
      { frequencyHz: 121, amplitude: 0.2, phaseRad: -0.2 },
    ];
    const timeSeconds = 0.723;
    const continuous = referenceContinuousHarmonicResponse({
      shells,
      tones,
      timeSeconds,
      exposureSeconds: 0.05,
    });
    const errors = [24000, 48000, 96000, 192000].map((sampleRate) => {
      const held = referenceHeldHarmonicResponse({
        shells,
        tones,
        sampleRate,
        sampleIndex: timeSeconds * sampleRate,
        exposureSeconds: 0.05,
      });
      return rms(held.pressureMoments, continuous.pressureMoments);
    });
    for (let i = 1; i < errors.length; i++)
      expect(errors[i]).toBeLessThan(errors[i - 1] * 0.6);
  });

  it("gives the square's analytic DC and double-frequency exposure terms", () => {
    // The resonant unit pressure phasor isolates the observation kernel from
    // hold reconstruction and apparatus damping.
    const options = {
      shells: [{ naturalFrequencyHz: 100, qualityFactor: 1 }],
      tones: [{ frequencyHz: 100, amplitude: 1 }],
      exposureSeconds: 0.05,
    };
    for (const timeSeconds of [0, 0.001, 0.019]) {
      const result = referenceContinuousHarmonicResponse({
        ...options,
        timeSeconds,
      });
      const q = 2 * 2 * Math.PI * 100 * options.exposureSeconds;
      const phase = 2 * 2 * Math.PI * 100 * timeSeconds;
      expect(result.pressureMoments[0]).toBeCloseTo(
        0.5 + (0.5 * (Math.cos(phase) + q * Math.sin(phase))) / (1 + q * q),
        12,
      );
    }
  });

  it.each([0.5, 0.500001])(
    "retains the critical-damping limit at Q=%s",
    (qualityFactor) => {
      const sampleRate = 48000,
        sampleIndex = 48000;
      const options = {
        shells: [{ naturalFrequencyHz: 118.4, qualityFactor }],
        tones: [{ frequencyHz: 123.4, amplitude: 0.2, phaseRad: 0.6 }],
        sampleRate,
        sampleIndex,
      };
      const candidate = createBroadbandModalResponse(options);
      candidate.advance([drive(options.tones, sampleIndex, sampleRate)]);
      const expected = referenceHeldHarmonicResponse(options);
      for (const key of quantities)
        expect(rms(candidate.read()[key], expected[key])).toBeLessThan(1e-8);
    },
  );
});
