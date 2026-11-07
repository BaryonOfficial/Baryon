import { createFftPlan, executeFft } from "../core/audio/fft.js";

// Qualification signals only. These levels define the input experiment; they
// never equalize the response, normalize a music excerpt or change the engine.
export const BROADBAND_MUSIC_CONTROL_NAMES = Object.freeze([
  "bass-noise",
  "mid-noise",
  "treble-noise",
  "kick-bass",
  "kick-bass-hats",
  "kick-bass-riser",
]);
export const BROADBAND_MUSIC_CONTROL_REFERENCE = Object.freeze({
  durationSeconds: 6,
  onsetSeconds: 0.5,
  offsetSeconds: 4.5,
  periodicNoiseFrames: 16384,
  noiseSeedBase: 72135,
  noiseChannelSeedOffset: 3871,
  bandRms: 0.1,
  bassHz: Object.freeze([20, 200]),
  midHz: Object.freeze([200, 2000]),
  trebleHz: Object.freeze([2000, 18000]),
  bassToneHz: 60,
  bassTonePeak: 0.08,
  kickPeak: 0.2,
  hatsNoiseRms: 0.06,
  riserFinalNoiseRms: 0.05,
});

function periodicNoise(sampleRate, channel, band) {
  const spec = BROADBAND_MUSIC_CONTROL_REFERENCE;
  const plan = createFftPlan(spec.periodicNoiseFrames);
  const low = Math.ceil((band[0] * plan.size) / sampleRate);
  const high = Math.min(
    Math.floor((band[1] * plan.size) / sampleRate),
    plan.size / 2 - 1,
  );
  const amplitude = plan.size / Math.sqrt(2 * (high - low + 1));
  let seed = spec.noiseSeedBase + channel * spec.noiseChannelSeedOffset;
  for (let k = low; k <= high; k++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const phase = (2 * Math.PI * seed) / 2 ** 32;
    plan.real[k] = plan.real[plan.size - k] = amplitude * Math.cos(phase);
    plan.imaginary[k] = amplitude * Math.sin(phase);
    plan.imaginary[plan.size - k] = -plan.imaginary[k];
  }
  executeFft(plan, true);
  return plan.real;
}

export function createBroadbandMusicControl(
  name,
  sampleRate,
  channelCount = 2,
) {
  if (
    !BROADBAND_MUSIC_CONTROL_NAMES.includes(name) ||
    ![44100, 48000].includes(sampleRate) ||
    ![1, 2].includes(channelCount)
  )
    throw new RangeError("unsupported qualification control");
  const spec = BROADBAND_MUSIC_CONTROL_REFERENCE;
  const band =
    name === "bass-noise"
      ? spec.bassHz
      : name === "mid-noise"
        ? spec.midHz
        : spec.trebleHz;
  return Array.from({ length: channelCount }, (_, channel) => {
    const noise = periodicNoise(sampleRate, channel, band);
    return Float32Array.from(
      { length: spec.durationSeconds * sampleRate + 13 },
      (_, n) => {
        const time = n / sampleRate - spec.onsetSeconds;
        if (time < 0 || time >= spec.offsetSeconds - spec.onsetSeconds)
          return 0;
        const value = noise[n % noise.length];
        if (name.endsWith("noise")) return value * spec.bandRms;
        const beatTime = time % 0.5;
        // A reproducible 160->45 Hz downward kick plus a 60 Hz sustained bass.
        const kickPhase =
          2 *
          Math.PI *
          (45 * beatTime + 115 * 0.03 * (1 - Math.exp(-beatTime / 0.03)));
        const kick =
          spec.kickPeak * Math.exp(-beatTime / 0.08) * Math.sin(kickPhase);
        const bass =
          spec.bassTonePeak * Math.sin(2 * Math.PI * spec.bassToneHz * time);
        if (name === "kick-bass-hats")
          return (
            kick +
            bass +
            spec.hatsNoiseRms * value * Math.exp(-(time % 0.125) / 0.02)
          );
        if (name === "kick-bass-riser")
          return (
            kick +
            bass +
            (spec.riserFinalNoiseRms * value * time) /
              (spec.offsetSeconds - spec.onsetSeconds)
          );
        return kick + bass;
      },
    );
  });
}
