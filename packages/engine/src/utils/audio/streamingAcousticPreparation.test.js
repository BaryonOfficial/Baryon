import { describe, expect, it } from "vitest";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import {
  referenceWaterFrame,
  referenceStreamingAcousticDrive,
} from "../../testing/streamingAcousticReference.js";
import { createWaterAcousticFrameTransform } from "./waterAcousticNonlinearity.js";
import {
  createAcousticDcBlocker,
  createStreamingAcousticDrive,
} from "./streamingAcousticDrive.js";

const sampleRate = 48000;
const scale = CAVITY_ACOUSTIC_DEFAULTS;
const options = { sampleRate, channelCount: 2, cavityAcousticScale: scale };
const rmsError = (a, b) =>
  Math.sqrt(a.reduce((s, x, n) => s + (x - b[n]) ** 2, 0) / a.length);
function fixture(length) {
  return [0.7, 0.23].map((gain, a) =>
    Float64Array.from(
      { length },
      (_, n) =>
        gain * (0.1 + Math.sin(n * 0.137 + a) + 0.2 * Math.cos(n * 1.79)),
    ),
  );
}
function collect(input, partitions, settings = options) {
  const state = createStreamingAcousticDrive(settings);
  const output = input.map(() => []);
  const emissions = [];
  const emit = (channels, interval) => {
    channels.forEach((c, a) => output[a].push(...c));
    emissions.push(interval);
  };
  let offset = 0,
    part = 0;
  while (offset < input[0].length) {
    const end = Math.min(
      input[0].length,
      offset + partitions[part++ % partitions.length],
    );
    state.process(
      input.map((c) => c.subarray(offset, end)),
      emit,
    );
    offset = end;
    expect(state.read().preparedFrames).toBe(
      Math.max(0, offset - state.read().delayFrames),
    );
  }
  const beforeEnd = state.read();
  // Explicit zero extension exposes the chosen finite comparison interval.
  state.process(
    input.map(() => new Float64Array(state.read().delayFrames)),
    emit,
  );
  return { state, output, emissions, beforeEnd };
}

describe("unnormalized dealiased aperture", () => {
  it("agrees with independent direct spectral convolution including Nyquist and intermodulation", () => {
    const timeScale =
      ((1 + scale.equationOfStateNonlinearityBA / 2) *
        scale.sideLengthMeters *
        scale.incidentPeakPressurePascalAtFullScale) /
      (scale.mediumDensityKgPerM3 * scale.soundSpeedMetersPerSecond ** 3);
    const transform = createWaterAcousticFrameTransform({
      sampleRate,
      cavityAcousticScale: scale,
      size: 64,
    });
    const input = Float64Array.from(
      { length: 64 },
      (_, n) =>
        0.3 * Math.cos((2 * Math.PI * 11 * n) / 64) +
        0.2 * Math.sin((2 * Math.PI * 27 * n) / 64) +
        0.1 * (-1) ** n +
        0.05,
    );
    const output = new Float64Array(64);
    transform.transform(input, output);
    expect(
      rmsError(output, referenceWaterFrame(input, sampleRate, timeScale)),
    ).toBeLessThan(1e-13);
  });
});

describe("continuous nonlinear preparation", () => {
  it("retains post-record nonlinear output and DC decay against independent zero extension", () => {
    const sourceLength = 513;
    const horizon = sourceLength + 4096;
    const input = [new Float64Array(horizon), new Float64Array(horizon)];
    input[0][sourceLength - 1] = 0.6;
    input[1][sourceLength - 1] = -0.2;
    const reference = referenceStreamingAcousticDrive(input, options);
    const actual = collect(input, [sourceLength, 71, 512]);
    for (let a = 0; a < 2; a++)
      expect(rmsError(actual.output[a], reference.prepared[a])).toBeLessThan(
        1e-12,
      );
    const rawTailEnd = Math.floor((sourceLength - 1) / 512) * 512 + 2048;
    expect(
      reference.overlapAdded[0]
        .slice(sourceLength, rawTailEnd)
        .some((x) => Math.abs(x) > 1e-12),
    ).toBe(true);
    expect(
      reference.overlapAdded[0].slice(rawTailEnd).every((x) => x === 0),
    ).toBe(true);
    expect(
      reference.prepared[0].slice(rawTailEnd).some((x) => Math.abs(x) > 1e-12),
    ).toBe(true);
  });
  it("matches an independent finite-record overlap reference with a shared stereo gain", () => {
    const input = fixture(2061);
    const reference = referenceStreamingAcousticDrive(input, options);
    const actual = collect(input, [73, 512, 29]);
    for (let a = 0; a < 2; a++)
      expect(rmsError(actual.output[a], reference.prepared[a])).toBeLessThan(
        1e-12,
      );
    expect(reference.frameGains.some((g) => g !== 1)).toBe(true);
    expect(actual.state.read()).toMatchObject({
      phase: "running",
      inputFrames: 2061 + 2048,
      preparedFrames: 2061,
      pendingFrames: 2048,
      delayFrames: 2048,
    });
  }, 30000);

  it("is partition invariant through ring wraps at a stated finite observation horizon", () => {
    const input = fixture(8197);
    const whole = collect(input, [input[0].length]);
    for (const parts of [[64], [128], [256], [512], [17, 1111, 3]]) {
      const split = collect(input, parts);
      expect(split.output).toEqual(whole.output);
      expect(split.output[0]).toHaveLength(input[0].length);
      let cursor = 0;
      for (const interval of split.emissions) {
        expect(interval.startFrame).toBe(cursor);
        cursor += interval.frameCount;
        expect(interval.availableAfterInputFrame).toBe(cursor + 2048);
      }
    }
  });

  it("preserves mono duplication, channel swap and exact silent channels without separate gain", () => {
    const x = fixture(3073)[0];
    const mono = collect([x], [512], { ...options, channelCount: 1 }).output[0];
    expect(collect([x, x], [512]).output).toEqual([mono, mono]);
    const input = fixture(3073);
    const normal = collect(input, [512]).output;
    expect(collect([...input].reverse(), [512]).output).toEqual(
      [...normal].reverse(),
    );
    const oneSided = collect([x, new Float64Array(x.length)], [512]).output;
    expect(oneSided[0]).toEqual(mono);
    expect(oneSided[1].every((v) => v === 0)).toBe(true);
  });

  it("bypasses nonlinear processing and delay at zero pressure but retains DC rejection", () => {
    const input = fixture(3073);
    const actual = collect(input, [73], {
      ...options,
      cavityAcousticScale: {
        ...scale,
        incidentPeakPressurePascalAtFullScale: 0,
      },
    });
    const expected = input.map((c) => new Float64Array(c.length));
    createAcousticDcBlocker(options).process(input, expected);
    expect(actual.output).toEqual(expected.map((c) => Array.from(c)));
    expect(actual.beforeEnd).toMatchObject({
      pendingFrames: 0,
      delayFrames: 0,
    });
  });

  it("holds during cached reads, rejects reentry and cannot resume after consumer failure", () => {
    const state = createStreamingAcousticDrive(options);
    const input = fixture(2048);
    state.process(input, () => {
      throw new Error("too early");
    });
    const before = state.read();
    for (let i = 0; i < 10; i++) expect(state.read()).toEqual(before);
    expect(() =>
      state.process(fixture(1), () => state.process(fixture(1), () => {})),
    ).toThrow("processing");
    expect(state.read().phase).toBe("faulted");
    expect(() => state.process(fixture(1), () => {})).toThrow("faulted");
  });

  it("validates complete PCM before mutation and handles empty input and exact silence", () => {
    const state = createStreamingAcousticDrive(options);
    const bad = fixture(4096);
    bad[1][4000] = NaN;
    expect(() => state.process(bad, () => {})).toThrow("finite");
    expect(state.read().inputFrames).toBe(0);
    expect(
      collect([new Float64Array(0), new Float64Array(0)], [512]).output,
    ).toEqual([[], []]);
    expect(
      collect(
        [new Float64Array(8197), new Float64Array(8197)],
        [512],
      ).output.every((c) => c.every((x) => x === 0)),
    ).toBe(true);
  });
});
