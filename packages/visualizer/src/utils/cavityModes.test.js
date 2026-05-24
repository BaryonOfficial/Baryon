import { describe, expect, it } from "vitest";
import { SIMULATION_DEFAULTS } from "../defaults.js";
import {
  getCavityAcousticFloorHz,
  getCavityModeFrequency,
  getMinimumCavityFrequency,
  resolveCavityModeFamilyForPitch,
  sampleFFTAmplitudeForFrequency,
  solveCavityModeFamilyForPitch,
  solveCavityModeForPitch,
} from "./cavityModes.js";

const RADIUS = 1;

describe("solveCavityModeForPitch", () => {
  it("returns null for invalid pitch or radius", () => {
    expect(solveCavityModeForPitch(0, RADIUS)).toBeNull();
    expect(solveCavityModeForPitch(-100, RADIUS)).toBeNull();
    expect(solveCavityModeForPitch(440, 0)).toBeNull();
    expect(solveCavityModeForPitch(440, NaN)).toBeNull();
  });

  it("maps the lowest cavity frequency to (1,1,1)", () => {
    expect(solveCavityModeForPitch(740 * Math.sqrt(3), RADIUS)).toEqual({
      u: 1,
      v: 1,
      w: 1,
    });
  });

  it("maps exact equal-sided cavity frequencies to canonical triplets", () => {
    expect(solveCavityModeForPitch(740 * Math.sqrt(6), RADIUS)).toEqual({
      u: 1,
      v: 1,
      w: 2,
    });
    expect(solveCavityModeForPitch(2220, RADIUS)).toEqual({
      u: 1,
      v: 2,
      w: 2,
    });
  });

  it("returns canonical positive integer triplets for typical audio frequencies", () => {
    for (const pitch of [110, 220, 440, 880, 1760, 3520]) {
      const mode = solveCavityModeForPitch(pitch, RADIUS);
      expect(mode, `pitch=${pitch}`).not.toBeNull();
      expect(Number.isInteger(mode.u), "u is integer").toBe(true);
      expect(Number.isInteger(mode.v), "v is integer").toBe(true);
      expect(Number.isInteger(mode.w), "w is integer").toBe(true);
      expect(mode.u).toBeGreaterThan(0);
      expect(mode.v).toBeGreaterThanOrEqual(mode.u);
      expect(mode.w).toBeGreaterThanOrEqual(mode.v);
    }
  });

  it("preserves the same cavity mode when pitch and radius scale together", () => {
    expect(solveCavityModeForPitch(440, 1)).toEqual(
      solveCavityModeForPitch(220, 2),
    );
  });
});

describe("solveCavityModeFamilyForPitch", () => {
  it("returns the nearest canonical cavity modes without permutation duplicates", () => {
    const family = solveCavityModeFamilyForPitch(440, RADIUS, 4);

    expect(family).toHaveLength(4);
    expect(
      new Set(family.map((mode) => `${mode.u}:${mode.v}:${mode.w}`)).size,
    ).toBe(4);
    for (const mode of family) {
      expect(mode.u).toBeLessThanOrEqual(mode.v);
      expect(mode.v).toBeLessThanOrEqual(mode.w);
    }
  });

  it("keeps the nearest single mode as the first family entry", () => {
    const primary = solveCavityModeForPitch(440, RADIUS);
    const family = solveCavityModeFamilyForPitch(440, RADIUS, 4);

    expect(family[0]).toMatchObject(primary);
  });

  it("orders family results by nearest cavity fit instead of diversity spacing", () => {
    const family = solveCavityModeFamilyForPitch(440, RADIUS, 4);
    const frequencyErrors = family.map((mode) => mode.frequencyError);

    expect(frequencyErrors).toEqual([...frequencyErrors].sort((a, b) => a - b));
  });
});

describe("getMinimumCavityFrequency", () => {
  it("matches the (1,1,1) cavity mode frequency across radii", () => {
    expect(getMinimumCavityFrequency(1)).toBeCloseTo(740 * Math.sqrt(3));
    expect(getMinimumCavityFrequency(3)).toBeCloseTo((740 * Math.sqrt(3)) / 3);
    expect(getMinimumCavityFrequency(5)).toBeCloseTo((740 * Math.sqrt(3)) / 5);
  });
});

describe("acoustic cavity scale", () => {
  it("uses the default acoustic scale to keep bass in resolved cavity families", () => {
    const options = {
      acousticScale: SIMULATION_DEFAULTS.cavityAcousticScale,
      boundaryMode: SIMULATION_DEFAULTS.boundaryMode,
    };
    const mappings = [60, 80, 120, 180, 220, 320].map(
      (pitch) => resolveCavityModeFamilyForPitch(pitch, options, 1)[0],
    );

    expect(getCavityAcousticFloorHz(options)).toBeLessThanOrEqual(60);
    expect(
      new Set(mappings.map((mode) => `${mode.u}:${mode.v}:${mode.w}`)).size,
    ).toBeGreaterThan(3);
    expect(mappings.every((mode) => mode.subfloorProjectionActive)).toBe(false);
  });

  it("uses boundary-aware zero index modes for the neumann acoustic floor", () => {
    const options = {
      acousticScale: {
        radiusMeters: 3,
        soundSpeedMetersPerSecond: 1480,
        subfloorPolicy: "project-low-q",
      },
      boundaryMode: "neumann",
    };

    expect(getCavityAcousticFloorHz(options)).toBeCloseTo(1480 / 6);
    expect(resolveCavityModeFamilyForPitch(1480 / 6, options, 1)[0]).toMatchObject(
      {
        u: 0,
        v: 0,
        w: 1,
        subfloorProjectionActive: false,
      },
    );
  });

  it("reports subfloor projection instead of silently pretending bass is resolved", () => {
    const options = {
      acousticScale: {
        radiusMeters: 3,
        soundSpeedMetersPerSecond: 1480,
        subfloorPolicy: "project-low-q",
      },
      boundaryMode: "dirichlet",
    };
    const [mode] = resolveCavityModeFamilyForPitch(60, options, 1);

    expect(getCavityAcousticFloorHz(options)).toBeGreaterThan(60);
    expect(mode).toMatchObject({
      u: 1,
      v: 1,
      w: 1,
      subfloorProjectionActive: true,
      subfloorPolicy: "project-low-q",
    });
    expect(mode.subfloorFrequencyHz).toBeCloseTo(getCavityAcousticFloorHz(options));
  });
});

describe("getCavityModeFrequency", () => {
  it("returns the expected frequency for a known cavity triplet", () => {
    expect(getCavityModeFrequency(1, 2, 2, RADIUS)).toBeCloseTo(2220);
  });

  it("returns 0 for invalid triplets or radius", () => {
    expect(getCavityModeFrequency(NaN, 1, 1, RADIUS)).toBe(0);
    expect(getCavityModeFrequency(1, 1, 1, 0)).toBe(0);
  });
});

describe("sampleFFTAmplitudeForFrequency", () => {
  const sampleRate = 44100;
  const fftSize = 32;

  it("returns the amplitude at the nearest FFT bin", () => {
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[2] = 0.75;
    const result = sampleFFTAmplitudeForFrequency(
      2940,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    expect(result).toBeCloseTo(0.75);
  });

  it("returns 0 for frequency 0", () => {
    const fftMagnitudes = new Float32Array(16).fill(0.5);
    expect(
      sampleFFTAmplitudeForFrequency(0, fftMagnitudes, sampleRate, fftSize),
    ).toBe(0);
  });

  it("clamps above-Nyquist frequencies to the last bin", () => {
    const fftMagnitudes = new Float32Array(16);
    fftMagnitudes[15] = 0.9;
    const result = sampleFFTAmplitudeForFrequency(
      99999,
      fftMagnitudes,
      sampleRate,
      fftSize,
    );
    expect(result).toBeCloseTo(0.9);
  });

  it("returns 0 for null or empty fftMagnitudes", () => {
    expect(sampleFFTAmplitudeForFrequency(440, null, sampleRate, fftSize)).toBe(
      0,
    );
    expect(
      sampleFFTAmplitudeForFrequency(
        440,
        new Float32Array(0),
        sampleRate,
        fftSize,
      ),
    ).toBe(0);
  });

  it("returns 0 for invalid sampling inputs", () => {
    const fftMagnitudes = new Float32Array(16).fill(0.5);
    expect(
      sampleFFTAmplitudeForFrequency(-1, fftMagnitudes, sampleRate, fftSize),
    ).toBe(0);
    expect(sampleFFTAmplitudeForFrequency(440, fftMagnitudes, 0, fftSize)).toBe(
      0,
    );
    expect(
      sampleFFTAmplitudeForFrequency(440, fftMagnitudes, sampleRate, 0),
    ).toBe(0);
  });
});

describe("solveCavityModeFamilyForPitch", () => {
  it("returns an empty family for invalid inputs", () => {
    expect(solveCavityModeFamilyForPitch(0, RADIUS, 4)).toStrictEqual([]);
    expect(solveCavityModeFamilyForPitch(440, 0, 4)).toStrictEqual([]);
    expect(solveCavityModeFamilyForPitch(440, RADIUS, 0)).toStrictEqual([]);
  });
});
