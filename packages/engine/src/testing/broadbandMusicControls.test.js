import { describe, expect, it } from "vitest";
import { createFftPlan, executeFft } from "../core/audio/fft.js";
import {
  createBroadbandMusicControl,
  BROADBAND_MUSIC_CONTROL_REFERENCE as spec,
} from "./broadbandMusicControls.js";

describe("documented broadband music qualification inputs", () => {
  it.each([44100, 48000])(
    "has equal RMS bands, exact off intervals and reproducible stereo PCM at %s Hz",
    (sampleRate) => {
      for (const [name, band] of [
        ["bass-noise", spec.bassHz],
        ["mid-noise", spec.midHz],
        ["treble-noise", spec.trebleHz],
      ]) {
        const channels = createBroadbandMusicControl(name, sampleRate);
        expect(channels).toEqual(createBroadbandMusicControl(name, sampleRate));
        for (const samples of channels) {
          expect(
            samples
              .subarray(0, spec.onsetSeconds * sampleRate)
              .every((x) => x === 0),
          ).toBe(true);
          expect(
            samples
              .subarray(spec.offsetSeconds * sampleRate)
              .every((x) => x === 0),
          ).toBe(true);
          const start = Math.ceil(spec.onsetSeconds * sampleRate);
          const period = samples.subarray(
            start,
            start + spec.periodicNoiseFrames,
          );
          const rms = Math.sqrt(
            period.reduce((sum, x) => sum + x * x, 0) / period.length,
          );
          expect(rms).toBeCloseTo(spec.bandRms, 8);
          const fft = createFftPlan(period.length);
          fft.real.set(period);
          executeFft(fft);
          let total = 0,
            outside = 0;
          for (let k = 0; k <= period.length / 2; k++) {
            const power = fft.real[k] ** 2 + fft.imaginary[k] ** 2;
            total += power;
            const hz = (k * sampleRate) / period.length;
            if (hz < band[0] || hz > band[1]) outside += power;
          }
          expect(outside / total).toBeLessThan(1e-12);
        }
        expect(channels[0]).not.toEqual(channels[1]);
      }
    },
  );
  it("adds hats and a riser without renormalizing or replacing the kick/bass input", () => {
    const sampleRate = 48000;
    const base = createBroadbandMusicControl("kick-bass", sampleRate);
    const hats = createBroadbandMusicControl("kick-bass-hats", sampleRate);
    const riser = createBroadbandMusicControl("kick-bass-riser", sampleRate);
    expect(base[0]).toEqual(base[1]);
    expect(hats[0]).not.toEqual(base[0]);
    expect(riser[0]).not.toEqual(base[0]);
    for (const channels of [base, hats, riser])
      expect(
        channels.every((c) =>
          c.every((x) => Number.isFinite(x) && Math.abs(x) < 1),
        ),
      ).toBe(true);
  });
});
