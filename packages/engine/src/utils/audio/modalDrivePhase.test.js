import { describe, expect, it } from "vitest";
import {
  buildModalDrivePhaseContext,
  measureModalComplexDrive,
  resolveHarmonicDrivePhaseLocks,
} from "./modalDrivePhase.js";
import { normalizePhaseRad } from "./modalPhaseSlots.js";

const SAMPLE_RATE = 48000;
const WINDOW = 2048;

function makeTone({ components, length = WINDOW, offsetSamples = 0 }) {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let value = 0;
    for (const { frequencyHz, amplitude, phaseRad = 0 } of components) {
      value +=
        amplitude *
        Math.cos(
          (2 * Math.PI * frequencyHz * (index + offsetSamples)) / SAMPLE_RATE +
            phaseRad,
        );
    }
    samples[index] = value;
  }
  return samples;
}

// Integer cycles per window so Goertzel sees no spectral leakage.
const F1 = (SAMPLE_RATE * 20) / WINDOW; // 468.75 Hz
const F2 = 2 * F1;

describe("modal drive phase measurement", () => {
  it("rejects invalid or too-short windows", () => {
    expect(
      buildModalDrivePhaseContext({ timeDomainData: null, sampleRate: 48000 }),
    ).toBeNull();
    expect(
      buildModalDrivePhaseContext({
        timeDomainData: new Float32Array(16),
        sampleRate: 48000,
      }),
    ).toBeNull();
    expect(
      buildModalDrivePhaseContext({
        timeDomainData: new Float32Array(WINDOW),
        sampleRate: 0,
      }),
    ).toBeNull();
  });

  it("measures amplitude and phase of a pure tone", () => {
    const phaseRad = 0.85;
    const context = buildModalDrivePhaseContext({
      timeDomainData: makeTone({
        components: [{ frequencyHz: F1, amplitude: 0.5, phaseRad }],
      }),
      sampleRate: SAMPLE_RATE,
    });
    const measurement = measureModalComplexDrive(context, F1);

    expect(measurement.magnitude).toBeCloseTo(0.5, 3);
    expect(normalizePhaseRad(measurement.phaseRad - phaseRad)).toBeCloseTo(
      0,
      3,
    );
  });

  it("returns null beyond Nyquist or without a context", () => {
    const context = buildModalDrivePhaseContext({
      timeDomainData: new Float32Array(WINDOW),
      sampleRate: SAMPLE_RATE,
    });
    expect(measureModalComplexDrive(context, SAMPLE_RATE)).toBeNull();
    expect(measureModalComplexDrive(null, F1)).toBeNull();
  });

  it("locks harmonics to the strongest driven mode with a shift-invariant phase", () => {
    const phase1 = 0.4;
    const phase2 = -1.1;
    const measure = (offsetSamples) => {
      const context = buildModalDrivePhaseContext({
        timeDomainData: makeTone({
          components: [
            { frequencyHz: F1, amplitude: 0.6, phaseRad: phase1 },
            { frequencyHz: F2, amplitude: 0.3, phaseRad: phase2 },
          ],
          offsetSamples,
        }),
        sampleRate: SAMPLE_RATE,
      });
      const fundamental = measureModalComplexDrive(context, F1);
      const harmonic = measureModalComplexDrive(context, F2);
      return resolveHarmonicDrivePhaseLocks([
        {
          modeKey: "fundamental",
          frequencyHz: F1,
          driveWeight: 1,
          magnitude: fundamental.magnitude,
          phaseRad: fundamental.phaseRad,
        },
        {
          modeKey: "harmonic",
          frequencyHz: F2,
          driveWeight: 0.5,
          magnitude: harmonic.magnitude,
          phaseRad: harmonic.phaseRad,
        },
      ]);
    };

    const locks = measure(0);
    expect(locks.get("fundamental")?.harmonicOrder).toBe(1);
    expect(locks.get("harmonic")?.harmonicOrder).toBe(2);
    expect(locks.get("harmonic")?.drivenAngularVelocityRadPerSec).toBeCloseTo(
      2 * Math.PI * F2,
      6,
    );
    // The harmonic invariant θ₂ − 2θ₁ encodes the waveform's shape.
    expect(locks.get("harmonic")?.lockedPhaseRad).toBeCloseTo(
      normalizePhaseRad(phase2 - 2 * phase1),
      2,
    );

    // A time shift of the whole waveform leaves the invariant unchanged —
    // this is what makes the lock immune to render-clock jitter.
    const shiftedLocks = measure(137);
    expect(shiftedLocks.get("harmonic")?.lockedPhaseRad).toBeCloseTo(
      locks.get("harmonic")?.lockedPhaseRad,
      2,
    );
  });

  it("does not lock non-harmonic modes", () => {
    const locks = resolveHarmonicDrivePhaseLocks([
      {
        modeKey: "reference",
        frequencyHz: 200,
        driveWeight: 1,
        magnitude: 0.5,
        phaseRad: 0,
      },
      {
        modeKey: "inharmonic",
        frequencyHz: 297,
        driveWeight: 0.6,
        magnitude: 0.4,
        phaseRad: 1,
      },
    ]);

    expect(locks.get("reference")?.harmonicOrder).toBe(1);
    expect(locks.has("inharmonic")).toBe(false);
  });

  it("ignores measurements below the magnitude floor", () => {
    const locks = resolveHarmonicDrivePhaseLocks([
      {
        modeKey: "silent",
        frequencyHz: 200,
        driveWeight: 1,
        magnitude: 1e-6,
        phaseRad: 0,
      },
    ]);
    expect(locks.size).toBe(0);
  });
});
