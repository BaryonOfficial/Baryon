import { describe, expect, it } from "vitest";
import {
  createSpectralMomentBasis,
  deriveSpectralSeedDirection,
  foldAudioFrequencyToSpectralPitchPhase,
  resolveSpectralResponseFrequency,
} from "./spectralPhase.js";

describe("spectral phase contract", () => {
  it("is octave invariant and finite for invalid input", () => {
    expect(foldAudioFrequencyToSpectralPitchPhase(440)).toBeCloseTo(
      foldAudioFrequencyToSpectralPitchPhase(880),
      12,
    );
    expect(foldAudioFrequencyToSpectralPitchPhase(220)).toBeCloseTo(
      foldAudioFrequencyToSpectralPitchPhase(440),
      12,
    );
    expect(foldAudioFrequencyToSpectralPitchPhase(0)).toBe(0);
    expect(foldAudioFrequencyToSpectralPitchPhase(Number.NaN)).toBe(0);
  });

  it("prefers response frequency and falls back to natural frequency", () => {
    expect(
      resolveSpectralResponseFrequency({
        responseFrequencyHz: 660,
        naturalFrequencyHz: 440,
      }),
    ).toBe(660);
    expect(
      resolveSpectralResponseFrequency({
        responseFrequencyHz: 0,
        naturalFrequencyHz: 440,
      }),
    ).toBe(440);
    expect(resolveSpectralResponseFrequency({})).toBe(0);
  });

  it("encodes first and second circular moments without RGB", () => {
    const frequencyHz = 440 * Math.sqrt(2);
    const phase = foldAudioFrequencyToSpectralPitchPhase(frequencyHz);
    const basis = createSpectralMomentBasis({ frequencyHz });
    const angle = phase * Math.PI * 2;

    expect(basis).toHaveLength(4);
    expect(basis[0]).toBeCloseTo(Math.cos(angle), 6);
    expect(basis[1]).toBeCloseTo(Math.sin(angle), 6);
    expect(basis[2]).toBeCloseTo(Math.cos(angle * 2), 6);
    expect(basis[3]).toBeCloseTo(Math.sin(angle * 2), 6);
    expect(createSpectralMomentBasis({ frequencyHz: 0 })).toEqual([1, 0, 1, 0]);
  });

  it("derives an order-independent live-response seed direction", () => {
    const entries = [
      { responseFrequencyHz: 880, naturalFrequencyHz: 220 },
      { responseFrequencyHz: 330, naturalFrequencyHz: 110 },
      { responseFrequencyHz: 660, naturalFrequencyHz: 440 },
    ];
    const forward = deriveSpectralSeedDirection(entries);
    const reverse = deriveSpectralSeedDirection([...entries].reverse());
    const expected = createSpectralMomentBasis({ frequencyHz: 330 });

    expect(forward).toEqual(reverse);
    expect(forward[0]).toBeCloseTo(expected[0], 6);
    expect(forward[1]).toBeCloseTo(expected[1], 6);
    expect(deriveSpectralSeedDirection([])).toEqual([1, 0]);
  });
});
