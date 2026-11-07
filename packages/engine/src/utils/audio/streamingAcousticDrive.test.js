import { describe, expect, it } from "vitest";
import { createAcousticDcBlocker } from "./streamingAcousticDrive.js";

describe("streaming acoustic DC preparation", () => {
  it("matches its sample-held analog state and does not subtract independent window means", () => {
    const sampleRate = 48000;
    const blocker = createAcousticDcBlocker({ sampleRate, channelCount: 1 });
    const input = new Float64Array(512).fill(0.7);
    const output = new Float64Array(512);
    blocker.process([input], [output]);
    for (let n = 0; n < output.length; n++) {
      expect(output[n]).toBeCloseTo(
        0.7 * Math.exp((-2 * Math.PI * 5 * n) / sampleRate),
        13,
      );
    }
  });

  it("is partition invariant, linear and preserves independent channel gain", () => {
    const input = Float64Array.from({ length: 1003 }, (_, n) =>
      Math.sin(n * 0.01),
    );
    const whole = createAcousticDcBlocker({
      sampleRate: 44100,
      channelCount: 2,
    });
    const split = createAcousticDcBlocker({
      sampleRate: 44100,
      channelCount: 2,
    });
    const channels = [input, input.map((v) => -3 * v)];
    const one = channels.map((c) => new Float64Array(c.length));
    const many = channels.map((c) => new Float64Array(c.length));
    whole.process(channels, one);
    for (let n = 0; n < input.length; n += 73) {
      split.process(
        channels.map((c) => c.subarray(n, n + 73)),
        many.map((c) => c.subarray(n, n + 73)),
      );
    }
    expect(many).toEqual(one);
    for (let n = 0; n < input.length; n++) {
      expect(one[1][n]).toBeCloseTo(-3 * one[0][n], 13);
    }
  });

  it("validates the complete input before changing filter state", () => {
    const options = { sampleRate: 48000, channelCount: 1 };
    const a = createAcousticDcBlocker(options);
    const b = createAcousticDcBlocker(options);
    expect(() =>
      a.process([new Float32Array([1, NaN])], [new Float64Array(2)]),
    ).toThrow();
    const input = [new Float32Array([1, 2])];
    const x = [new Float64Array(2)];
    const y = [new Float64Array(2)];
    a.process(input, x);
    b.process(input, y);
    expect(x).toEqual(y);
  });
});
