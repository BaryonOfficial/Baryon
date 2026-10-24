import { describe, expect, it } from "vitest";
import { createResponseHistorySpectrumProbe } from "../../testing/responseHistorySpectrumProbe.js";
import { createBroadbandResponseSpectrum } from "./broadbandResponseSpectrum.js";
import { expandBroadbandSpectralWindow } from "../../testing/broadbandSpectralWindowReference.js";
import {
  referenceBroadbandSpectralEvidence,
  referenceSpectralMatrices,
} from "../../testing/broadbandSpectralReference.js";
import { createBroadbandModalResponse } from "./broadbandModalResponse.js";
import { createBroadbandReference } from "../../testing/broadbandModalReference.js";

const settings = {
  shellCount: 3,
  channelCount: 2,
  sampleRate: 48000,
  frameSize: 64,
  hopSize: 16,
};
const pressureBasis = [0.3, -0.8, 0.7];
const velocityBasis = [
  [0.2, 0.5, -0.1],
  [-0.7, 0.1, 0.3],
  [0.4, -0.2, 0.1],
];
function project(spectrum, p = pressureBasis, v = velocityBasis) {
  const frame = referenceSpectralMatrices(spectrum);
  const count = frame.shellCount,
    size = count * count;
  return Array.from({ length: 5 }, (_, k) => {
    let result = 0;
    for (let i = 0; i < count; i++)
      for (let j = 0; j < count; j++) {
        result += 0.7 * p[i] * p[j] * frame.pressure[k * size + i * count + j];
        for (const axis of v)
          result +=
            1.2 * axis[i] * axis[j] * frame.velocity[k * size + i * count + j];
      }
    return result;
  });
}
function histories(length, channels = 2, shells = 3) {
  return [0.31, 0.17].map((frequency, q) =>
    Array.from({ length }, (_, n) =>
      Float64Array.from(
        { length: channels * shells },
        (_, row) =>
          Math.sin(n * frequency * (1 + (row % shells)) + row * 0.7) +
          0.2 * Math.cos(n * 1.71 + q),
      ),
    ),
  );
}
function run(pressure, velocity, options = settings) {
  const spectrum = createResponseHistorySpectrumProbe(options);
  for (let n = 0; n < pressure.length; n++)
    spectrum.advance(pressure[n], velocity[n]);
  return spectrum;
}

describe("broadband response color evidence", () => {
  it("keeps recurrence observations read-only and rejects invalid input before advancing", () => {
    const options = {
      transitions: [[0.9, -0.1, 0.1, 0.9, 0.2, 0.1]],
      sampleRate: 48000,
      channelCount: 2,
      frameSize: 8,
      hopSize: 4,
    };
    const state = createBroadbandResponseSpectrum(options);
    const control = createBroadbandResponseSpectrum(options);
    const zero = new Float64Array(2);
    const silence = [Float64Array.of(0), Float64Array.of(0)];
    const initial = state.read();
    initial.inputSpectrum.fill(99);
    initial.boundaryDelta.fill(99);
    initial.transitions.fill(99);
    expect(state.read().inputSpectrum.every((x) => x === 0)).toBe(true);
    expect(state.read().boundaryDelta.every((x) => x === 0)).toBe(true);
    expect(state.read().transitions[0]).toBe(0.9);
    expect(() =>
      state.advance(zero, zero, [silence[0], Float64Array.of(NaN)], 0),
    ).toThrow("finite input");
    const invalid = Float64Array.of(0, Infinity);
    expect(() => state.advance(invalid, zero, silence, 0)).toThrow(
      "finite state",
    );
    for (let n = 0; n < 4; n++) {
      const before = state.read();
      for (let read = 0; read < 3; read++) expect(state.read()).toEqual(before);
      state.advance(zero, zero, silence, 0);
      control.advance(zero, zero, silence, 0);
    }
    expect(state.read()).toEqual(control.read());
    expect(state.read().frameEndSample).toBe(4);
    expect(
      expandBroadbandSpectralWindow(state.read()).coefficients.every(
        (x) => x === 0,
      ),
    ).toBe(true);
    expect(() =>
      createBroadbandResponseSpectrum({
        ...options,
        transitions: [[1, 0, 0, 1, 0, 0]],
      }),
    ).toThrow("singular");
  });

  it.each([44100, 48000])(
    "matches complete response-history FFTs through startup, impulses and ring-down at %s Hz",
    (sampleRate) => {
      // Analytic transitions are local test data, not production transition
      // helpers. The direct field DFT test below supplies independent evidence.
      const transitions = [
        [20, 0.5],
        [118.4, 0.500001],
        [375, 15],
        [375.001, 1000],
        [sampleRate / 128, 50000],
        [0.45 * sampleRate, 0.5],
        [sampleRate / 2, 30],
        [sampleRate / 2, 50000],
      ].map(([frequency, quality]) => {
        const w = 2 * Math.PI * frequency,
          d = w / quality,
          dt = 1 / sampleRate;
        const wd = Math.sqrt(Math.max(0, w * w - (d * d) / 4));
        const c = Math.cos(wd * dt),
          s = wd === 0 ? dt : Math.sin(wd * dt) / wd;
        const decay = Math.exp((-d * dt) / 2);
        const f = [
          decay * (c - (d * s) / 2),
          -decay * w * s,
          decay * w * s,
          decay * (c + (d * s) / 2),
        ];
        return [...f, (-f[1] * d) / w, ((1 - f[3]) * d) / w];
      });
      for (const gain of [1, 1e-12]) {
        const options = {
          sampleRate,
          channelCount: 2,
          frameSize: 256,
          hopSize: 64,
        };
        const fast = createBroadbandResponseSpectrum({
          ...options,
          transitions,
        });
        const direct = createResponseHistorySpectrumProbe({
          ...options,
          shellCount: transitions.length,
        });
        const p = new Float64Array(2 * transitions.length),
          v = p.slice();
        let seed = 7281;
        for (let n = 0; n < 1024; n++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const x = n < 300 ? gain * (seed / 2 ** 32 - 0.5) : 0;
          const channels = [
            Float64Array.of(x),
            Float64Array.of(n === 77 ? gain : -x / 3),
          ];
          direct.advance(p, v);
          for (let a = 0; a < 2; a++)
            for (let m = 0; m < transitions.length; m++) {
              const i = a * transitions.length + m,
                f = transitions[m];
              const oldP = p[i],
                oldV = v[i];
              p[i] = f[0] * oldP + f[1] * oldV + f[4] * channels[a][0];
              v[i] = f[2] * oldP + f[3] * oldV + f[5] * channels[a][0];
            }
          fast.advance(p, v, channels, 0);
          if ((n + 1) % options.hopSize) continue;
          const actual = expandBroadbandSpectralWindow(fast.read()),
            expected = direct.read();
          expect(actual.frameEndSample).toBe(expected.frameEndSample);
          // Check each shell separately: a strong response cannot hide a weak
          // high-Q or near-Nyquist response behind a global error denominator.
          const stride = 4 * (options.frameSize / 2 + 1);
          for (let row = 0; row < p.length; row++) {
            let error = 0,
              energy = 0;
            for (let i = row * stride; i < (row + 1) * stride; i++) {
              error += (actual.coefficients[i] - expected.coefficients[i]) ** 2;
              energy += expected.coefficients[i] ** 2;
            }
            if (energy === 0) expect(error).toBe(0);
            else expect(Math.sqrt(error / energy)).toBeLessThan(1e-8);
          }
        }
      }
    },
  );

  it("observes actual response histories with the declared sample alignment", () => {
    const shells = [118.4, 237.1, 710].map((naturalFrequencyHz) => ({
      naturalFrequencyHz,
      qualityFactor: 15,
    }));
    const input = [0.4, -0.7].map((gain) =>
      Float64Array.from(
        { length: 2301 },
        (_, n) => gain * (Math.sin(n * 0.04) + 0.3 * Math.cos(n * 0.11)),
      ),
    );
    const response = createBroadbandModalResponse({
      shells,
      sampleRate: 48000,
      channelCount: 2,
    });
    const reference = createBroadbandReference({
      shells,
      sampleRate: 48000,
      channelCount: 2,
      substeps: 16,
    });
    const pressure = [],
      velocity = [];
    for (let n = 0; n < input[0].length; n++) {
      const current = reference.read();
      pressure.push(current.pressure);
      velocity.push(current.velocity);
      reference.advance(input.map((c) => c.subarray(n, n + 1)));
    }
    response.advance(input);
    const spectral = expandBroadbandSpectralWindow(response.read().spectral);
    expect(spectral.frameEndSample).toBe(2048);
    const expected = referenceBroadbandSpectralEvidence({
      pressure,
      velocity,
      frameEndSample: 2048,
      sampleRate: 48000,
      channelCount: 2,
      pressureBasis,
      velocityBasis,
      pressureWeight: 0.7,
      velocityWeight: 1.2,
    });
    project(spectral).forEach((x, i) =>
      expect(Math.abs(x - expected[i])).toBeLessThan(1e-10),
    );
  });
  it("matches direct field DFT including signed shell interference, stereo and every bin", () => {
    const [pressure, velocity] = histories(171);
    const state = createResponseHistorySpectrumProbe(settings);
    for (let n = 0; n < pressure.length; n++) {
      state.advance(pressure[n], velocity[n]);
      if ((n + 1) % settings.hopSize) continue;
      const actual = project(state.read());
      const expected = referenceBroadbandSpectralEvidence({
        ...settings,
        pressure,
        velocity,
        frameEndSample: n + 1,
        pressureBasis,
        velocityBasis,
        pressureWeight: 0.7,
        velocityWeight: 1.2,
      });
      actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
      expect(Math.hypot(actual[1], actual[2])).toBeLessThanOrEqual(
        actual[0] * (1 + 1e-12),
      );
      expect(Math.hypot(actual[3], actual[4])).toBeLessThanOrEqual(
        actual[0] * (1 + 1e-12),
      );
    }
  });

  it("uses power normalization with DC excluded and Nyquist counted once", () => {
    for (const kind of ["constant", "nyquist", "tone", "impulse"]) {
      const samples = Float64Array.from({ length: 64 }, (_, n) =>
        kind === "constant"
          ? 1
          : kind === "nyquist"
            ? (-1) ** n
            : kind === "tone"
              ? Math.cos((2 * Math.PI * 7 * n) / 64)
              : +(n === 31),
      );
      const p = Array.from(samples, (x) => Float64Array.of(x));
      const zero = p.map(() => Float64Array.of(0));
      const frame = referenceSpectralMatrices(
        run(p, zero, { ...settings, shellCount: 1, channelCount: 1 }).read(),
      );
      const w = Array.from(
        samples,
        (_, n) =>
          0.42 -
          0.5 * Math.cos((2 * Math.PI * n) / 64) +
          0.08 * Math.cos((4 * Math.PI * n) / 64),
      );
      const energy = w.reduce((s, x) => s + x * x, 0);
      const dc = w.reduce((s, x, n) => s + x * samples[n], 0);
      const expected =
        w.reduce((s, x, n) => s + (x * samples[n]) ** 2, 0) / energy -
        dc ** 2 / (64 * energy);
      expect(frame.pressure[0]).toBeCloseTo(expected, 13);
      if (kind === "nyquist") expect(frame.pressure[0]).toBeCloseTo(1, 13);
    }
  });

  it("preserves stereo ensemble identities and raw quadratic gain scaling", () => {
    const [p, v] = histories(128, 1);
    const options = { ...settings, channelCount: 1 };
    const mono = referenceSpectralMatrices(run(p, v, options).read());
    for (const sign of [1, -1]) {
      const duplicate = (cs) =>
        cs.map((c) => Float64Array.from([...c, ...c.map((x) => sign * x)]));
      const stereo = referenceSpectralMatrices(
        run(duplicate(p), duplicate(v)).read(),
      );
      for (const key of ["pressure", "velocity"])
        stereo[key].forEach((x, i) => expect(x).toBeCloseTo(mono[key][i], 13));
    }
    const silentRight = (cs) =>
      cs.map((c) => Float64Array.from([...c, ...c.map(() => 0)]));
    const oneSided = referenceSpectralMatrices(
      run(silentRight(p), silentRight(v)).read(),
    );
    for (const key of ["pressure", "velocity"])
      oneSided[key].forEach((x, i) =>
        expect(x).toBeCloseTo(mono[key][i] / 2, 13),
      );
    const [stereoP, stereoV] = histories(128);
    const swap = (cs) =>
      cs.map((c) => Float64Array.from([...c.slice(3), ...c.slice(0, 3)]));
    const forward = referenceSpectralMatrices(run(stereoP, stereoV).read());
    const reverse = referenceSpectralMatrices(
      run(swap(stereoP), swap(stereoV)).read(),
    );
    for (const key of ["pressure", "velocity"])
      reverse[key].forEach((x, i) =>
        expect(x).toBeCloseTo(forward[key][i], 13),
      );
    const scaled = referenceSpectralMatrices(
      run(
        p.map((c) => c.map((x) => x * 3)),
        v.map((c) => c.map((x) => x * 3)),
        options,
      ).read(),
    );
    for (const key of ["pressure", "velocity"])
      scaled[key].forEach((x, i) =>
        expect(x).toBeCloseTo(9 * mono[key][i], 12),
      );
  });

  it("owns its history and publication copies; reads cannot advance analysis", () => {
    const [p, v] = histories(79);
    const spectrum = run(p, v);
    const before = spectrum.read();
    expect(before.frameEndSample).toBe(64);
    for (let i = 0; i < 10; i++) expect(spectrum.read()).toEqual(before);
    before.coefficients.fill(1000);
    expect(spectrum.read().coefficients[0]).not.toBe(1000);
    const bad = p[0].slice();
    bad[3] = NaN;
    expect(() => spectrum.advance(bad, v[0])).toThrow("finite");
    expect(spectrum.read().frameEndSample).toBe(64);
    spectrum.advance(p[0], v[0]);
    expect(spectrum.read().frameEndSample).toBe(80);
  });

  it("keeps signed harmonic matrices and exact zero support instead of PSD-clamping color", () => {
    const [p, v] = histories(128);
    const frame = referenceSpectralMatrices(run(p, v).read());
    expect(
      [...frame.pressure.slice(9), ...frame.velocity.slice(9)].some(
        (x) => x < 0,
      ),
    ).toBe(true);
    const z = Array.from({ length: 128 }, () => new Float64Array(6));
    const zero = referenceSpectralMatrices(run(z, z).read());
    expect([...zero.pressure, ...zero.velocity].every((x) => x === 0)).toBe(
      true,
    );
    const tone = Array.from({ length: 64 }, (_, n) =>
      Float64Array.of(Math.cos((2 * Math.PI * 8 * n) / 64)),
    );
    const signed = referenceSpectralMatrices(
      run(tone, tone, {
        ...settings,
        shellCount: 1,
        channelCount: 1,
        sampleRate: 440 * Math.sqrt(2) * 8,
      }).read(),
    );
    // A negative diagonal is an explicit counterexample to PSD color storage.
    expect(signed.pressure[1]).toBeLessThan(0);
  });
});
