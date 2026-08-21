import { describe, expect, it } from "vitest";
import {
  advancePhaseAnchorState,
  computePhaseAnchorAngularVelocityRadPerSec,
  deriveObservedModalPhaseState,
  normalizePhaseRad,
  writePhaseSlotsForVisibleModes,
} from "./modalPhaseSlots.js";

const RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC = Math.PI * 1.25;
const OBSERVATION_PROFILE = Object.freeze({
  minObservationConfidence: 0.001,
  minObservedDrive: 0.002,
  minObservationCoherence: 0.2,
  snrStart: 1,
  snrFull: 4,
});

function buildOscillatorEntry({
  modeKey,
  layer = "source-coupled",
  frequencyHz,
  phaseRad = 0,
  phaseOffsetRad = null,
  observedAtSec = 0,
  coherence = 0.8,
  authority = 0.9,
}) {
  const angularVelocityRadPerSec = 2 * Math.PI * frequencyHz;
  return {
    modeKey,
    layer,
    modalOscillatorPhaseRad: phaseRad,
    modalOscillatorPhaseOffsetRad: Number.isFinite(phaseOffsetRad)
      ? phaseOffsetRad
      : normalizePhaseRad(phaseRad - angularVelocityRadPerSec * observedAtSec),
    modalOscillatorAngularVelocityRadPerSec: angularVelocityRadPerSec,
    modalOscillatorPhaseObservedAtSec: observedAtSec,
    modalOscillatorPhaseCoherence: coherence,
    modalOscillatorPhaseAuthority: authority,
  };
}

describe("modal phase slots", () => {
  it("maps exact +π to -π in the canonical half-open range", () => {
    expect(normalizePhaseRad(Math.PI)).toBe(-Math.PI);
    expect(normalizePhaseRad(-Math.PI)).toBe(-Math.PI);
  });

  it("derives a bounded, evidence-authorized observed phase state", () => {
    const currentFrameAtMs = 100;
    const phaseState = deriveObservedModalPhaseState({
      layer: "resonant",
      previous: {
        phase: 0.1,
        phaseOffsetRad: 0.1,
        phaseVelocityRadPerSec: 0,
        phaseCoherence: 0,
        phaseAuthority: 0,
        lastPhaseObservedAtMs: 0,
      },
      observedPhaseRad: 0.4,
      observedDrive: 0.02,
      observationConfidence: 0.02,
      observedSnr: 4,
      observerCoherence: 0.8,
      currentFrameAtMs,
      observationProfile: OBSERVATION_PROFILE,
    });

    expect(Math.abs(phaseState.phaseVelocityRadPerSec)).toBeLessThanOrEqual(
      RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC,
    );
    expect(phaseState.phaseAuthority).toBeGreaterThan(0);
    expect(phaseState.phaseCoherence).toBeGreaterThan(0);
    expect(
      normalizePhaseRad(
        phaseState.phaseOffsetRad +
          phaseState.phaseVelocityRadPerSec * (currentFrameAtMs / 1000),
      ),
    ).toBeCloseTo(phaseState.phase);
    expect(phaseState.lastPhaseObservedAtMs).toBe(currentFrameAtMs);
  });

  it("closes observed phase authority under hard silence", () => {
    const previous = {
      phase: 0.2,
      phaseOffsetRad: 0.1,
      phaseVelocityRadPerSec: 1.5,
      phaseCoherence: 0.8,
      phaseAuthority: 0.9,
      lastPhaseObservedAtMs: 50,
    };
    const phaseState = deriveObservedModalPhaseState({
      layer: "resonant",
      previous,
      observedPhaseRad: 0.4,
      observedDrive: 0.02,
      observationConfidence: 0.02,
      observedSnr: 4,
      observerCoherence: 0.8,
      currentFrameAtMs: 100,
      observationProfile: OBSERVATION_PROFILE,
      hardSilentFrame: true,
    });

    expect(phaseState.phaseAuthority).toBe(0);
    expect(phaseState.phaseCoherence).toBe(0);
    expect(Math.abs(phaseState.phaseVelocityRadPerSec)).toBeLessThan(
      Math.abs(previous.phaseVelocityRadPerSec),
    );
    expect(phaseState.lastPhaseObservedAtMs).toBe(
      previous.lastPhaseObservedAtMs,
    );
  });

  it("does not publish observer-shaped phase state as physical detector motion", () => {
    const target = new Float32Array(4);

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots: new Float32Array([0, 0, 1, 0.7]),
      capacity: 1,
      activeModes: new Map([
        [
          "0:0:1",
          {
            modeKey: "0:0:1",
            phaseOffsetRad: 0.4,
            phaseVelocityRadPerSec: RESONANT_PHASE_MAX_VELOCITY_RAD_PER_SEC,
            phaseCoherence: 1,
            phaseAuthority: 1,
          },
        ],
      ]),
    });

    expect(count).toBe(0);
    expect(Array.from(target)).toEqual([0, 0, 0, 0]);
  });

  it("renders a single pure tone as a standing pattern in the rotating frame", () => {
    const target = new Float32Array(4);
    const visibleSlots = new Float32Array([0, 0, 1, 0.7]);
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({
          modeKey: "0:0:1",
          frequencyHz: 440,
          phaseRad: 1.1,
          observedAtSec: 2,
        }),
      ],
    ]);

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 1,
      activeModes,
    });

    expect(count).toBe(1);
    // A lone mode is its own frame anchor: ν = ω − ω̄ = 0, so the standing
    // pattern does not spin, matching a physical single-tone cymatic figure.
    expect(target[1]).toBe(0);
    // Phase continuity at the observation instant is preserved.
    expect(normalizePhaseRad(target[0] + target[1] * 2)).toBeCloseTo(1.1);
    expect(target[2]).toBeCloseTo(0.8);
    expect(target[3]).toBeCloseTo(0.9);
  });

  it("publishes physical oscillator phase even when diagnostic authority is zero", () => {
    const target = new Float32Array(4);
    const entry = buildOscillatorEntry({
      modeKey: "0:0:1",
      frequencyHz: 440,
      phaseRad: 1.1,
      observedAtSec: 2,
    });
    entry.modalOscillatorPhaseAuthority = 0;
    entry.modalOscillatorPhaseCoherence = 0;

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots: new Float32Array([0, 0, 1, 0.7]),
      capacity: 1,
      activeModes: new Map([["0:0:1", entry]]),
    });

    expect(count).toBe(0);
    expect(target[0]).toBeCloseTo(1.1);
    expect(target[1]).toBeCloseTo(2 * Math.PI * 440, 3);
    expect(target[2]).toBe(0);
    expect(target[3]).toBe(0);
  });

  it("removes a shared physical carrier from successive phase uploads", () => {
    const carrierFrequencyHz = 293.7;
    const carrierAngularVelocityRadPerSec = 2 * Math.PI * carrierFrequencyHz;
    const physicalPhaseOffsetRad = -0.73;
    const uploadedOffsets = [];

    for (const observedAtSec of [0.417, 0.863]) {
      const target = new Float32Array(4);
      const phaseRad = normalizePhaseRad(
        physicalPhaseOffsetRad +
          carrierAngularVelocityRadPerSec * observedAtSec,
      );
      const activeModes = new Map([
        [
          "0:0:1",
          buildOscillatorEntry({
            modeKey: "0:0:1",
            frequencyHz: carrierFrequencyHz,
            phaseRad,
            phaseOffsetRad: physicalPhaseOffsetRad,
            observedAtSec,
          }),
        ],
      ]);

      writePhaseSlotsForVisibleModes({
        target,
        visibleSlots: new Float32Array([0, 0, 1, 0.7]),
        capacity: 1,
        activeModes,
        anchorAngularVelocityRadPerSec: carrierAngularVelocityRadPerSec,
      });

      expect(target[0]).toBeCloseTo(physicalPhaseOffsetRad, 5);
      expect(target[1]).toBe(0);
      uploadedOffsets.push(target[0]);
    }

    expect(uploadedOffsets[1]).toBeCloseTo(uploadedOffsets[0], 6);
  });

  it("preserves a detuned mode's physical phase in the rotating frame", () => {
    const carrierFrequencyHz = 293.7;
    const modeFrequencyHz = 293.9;
    const carrierAngularVelocityRadPerSec = 2 * Math.PI * carrierFrequencyHz;
    const modeAngularVelocityRadPerSec = 2 * Math.PI * modeFrequencyHz;
    const physicalPhaseOffsetRad = 0.41;
    const observedAtSec = 0.731;
    const target = new Float32Array(4);

    writePhaseSlotsForVisibleModes({
      target,
      visibleSlots: new Float32Array([0, 0, 1, 0.7]),
      capacity: 1,
      activeModes: new Map([
        [
          "0:0:1",
          buildOscillatorEntry({
            modeKey: "0:0:1",
            frequencyHz: modeFrequencyHz,
            phaseRad: normalizePhaseRad(
              physicalPhaseOffsetRad +
                modeAngularVelocityRadPerSec * observedAtSec,
            ),
            phaseOffsetRad: physicalPhaseOffsetRad,
            observedAtSec,
          }),
        ],
      ]),
      anchorAngularVelocityRadPerSec: carrierAngularVelocityRadPerSec,
    });

    const relativeAngularVelocityRadPerSec =
      modeAngularVelocityRadPerSec - carrierAngularVelocityRadPerSec;
    expect(target[0]).toBeCloseTo(physicalPhaseOffsetRad, 5);
    expect(target[1]).toBeCloseTo(relativeAngularVelocityRadPerSec, 5);

    const renderAtSec = 1.113;
    expect(normalizePhaseRad(target[0] + target[1] * renderAtSec)).toBeCloseTo(
      normalizePhaseRad(
        physicalPhaseOffsetRad + relativeAngularVelocityRadPerSec * renderAtSec,
      ),
      5,
    );
  });

  it("preserves exact physical beat rates between near-degenerate modes", () => {
    const target = new Float32Array(8);
    const visibleSlots = new Float32Array([0, 0, 1, 0.5, 0, 1, 0, 0.5]);
    const detuneHz = 0.2;
    const activeModes = new Map([
      ["0:0:1", buildOscillatorEntry({ modeKey: "0:0:1", frequencyHz: 440 })],
      [
        "0:1:0",
        buildOscillatorEntry({
          modeKey: "0:1:0",
          frequencyHz: 440 + detuneHz,
        }),
      ],
    ]);

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 2,
      activeModes,
    });

    expect(count).toBe(2);
    // Relative phase velocity equals the true acoustic beat rate 2πΔf,
    // to Float32 slot-storage precision.
    expect(target[5] - target[1]).toBeCloseTo(2 * Math.PI * detuneHz, 6);
    // The transport retains physical relative angular velocity. Frame-rate
    // presentation may derive a bounded accent later, but detector coherence
    // must receive the exact beat rate.
    expect(target[5] - target[1]).toBeCloseTo(2 * Math.PI * detuneHz, 6);
  });

  it("does not manufacture detector coherence by clamping far modes", () => {
    const target = new Float32Array(8);
    const visibleSlots = new Float32Array([0, 0, 1, 0.9, 1, 2, 3, 0.1]);
    const activeModes = new Map([
      ["0:0:1", buildOscillatorEntry({ modeKey: "0:0:1", frequencyHz: 60 })],
      [
        "1:2:3",
        buildOscillatorEntry({
          modeKey: "1:2:3",
          layer: "source-coupled",
          frequencyHz: 4000,
          phaseRad: -0.8,
          observedAtSec: 1.5,
        }),
      ],
    ]);
    activeModes.get("1:2:3").renderLayer = "resonant";

    const count = writePhaseSlotsForVisibleModes({
      target,
      visibleSlots,
      capacity: 2,
      activeModes,
    });

    expect(count).toBe(2);
    const anchorAngularVelocityRadPerSec =
      (0.9 * 2 * Math.PI * 60 + 0.1 * 2 * Math.PI * 4000) / (0.9 + 0.1);
    expect(target[1]).toBeCloseTo(
      2 * Math.PI * 60 - anchorAngularVelocityRadPerSec,
      3,
    );
    expect(target[5]).toBeCloseTo(
      2 * Math.PI * 4000 - anchorAngularVelocityRadPerSec,
      2,
    );
    expect(target[5] - target[1]).toBeCloseTo(2 * Math.PI * (4000 - 60), 2);
    // Phase continuity still holds at the observation instant.
    expect(normalizePhaseRad(target[4] + target[5] * 1.5)).toBeCloseTo(-0.8);
  });

  it("computes an amplitude-and-authority-weighted anchor across slot sets", () => {
    const slotsA = new Float32Array([0, 0, 1, 1]);
    const slotsB = new Float32Array([0, 1, 0, 0.25]);
    const activeModes = new Map([
      [
        "0:0:1",
        buildOscillatorEntry({
          modeKey: "0:0:1",
          frequencyHz: 100,
          authority: 0.8,
        }),
      ],
      [
        "0:1:0",
        buildOscillatorEntry({
          modeKey: "0:1:0",
          frequencyHz: 300,
          authority: 0.8,
        }),
      ],
    ]);

    const anchor = computePhaseAnchorAngularVelocityRadPerSec({
      slotSets: [
        { visibleSlots: slotsA, capacity: 1 },
        { visibleSlots: slotsB, capacity: 1 },
      ],
      activeModes,
    });

    // Weights are amplitude·authority: (1·0.8·ω₁ + 0.25·0.8·ω₂) / (0.8 + 0.2)
    const omega1 = 2 * Math.PI * 100;
    const omega2 = 2 * Math.PI * 300;
    expect(anchor).toBeCloseTo((0.8 * omega1 + 0.2 * omega2) / 1.0, 9);
  });

  it("integrates a changing phase anchor without re-gauging the field", () => {
    const firstAngularVelocityRadPerSec = 2 * Math.PI * 293.7;
    const nextAngularVelocityRadPerSec = 2 * Math.PI * 293.9;
    const first = advancePhaseAnchorState({
      angularVelocityRadPerSec: firstAngularVelocityRadPerSec,
      observedAtSec: 1,
    });
    const transitioned = advancePhaseAnchorState({
      previous: first,
      angularVelocityRadPerSec: nextAngularVelocityRadPerSec,
      observedAtSec: 1.5,
    });

    expect(transitioned.phaseRad).toBeCloseTo(
      normalizePhaseRad(first.phaseRad + firstAngularVelocityRadPerSec * 0.5),
      9,
    );
    expect(transitioned.phaseRad).not.toBeCloseTo(
      normalizePhaseRad(nextAngularVelocityRadPerSec * 1.5),
      3,
    );

    const modeFrequencyHz = 293.8;
    const modeAngularVelocityRadPerSec = 2 * Math.PI * modeFrequencyHz;
    const phaseAt = (timeSec) =>
      normalizePhaseRad(0.37 + modeAngularVelocityRadPerSec * timeSec);
    const visibleSlots = new Float32Array([0, 0, 1, 0.8]);
    const writeAt = (anchorState, timeSec) => {
      const target = new Float32Array(4);
      writePhaseSlotsForVisibleModes({
        target,
        visibleSlots,
        capacity: 1,
        activeModes: new Map([
          [
            "0:0:1",
            buildOscillatorEntry({
              modeKey: "0:0:1",
              frequencyHz: modeFrequencyHz,
              phaseRad: phaseAt(timeSec),
              observedAtSec: timeSec,
            }),
          ],
        ]),
        anchorAngularVelocityRadPerSec: anchorState.angularVelocityRadPerSec,
        anchorPhaseRadAtObserved: anchorState.phaseRad,
        phaseObservedAtSec: timeSec,
      });
      return target;
    };
    const beforeTransition = writeAt(first, 1);
    const afterTransition = writeAt(transitioned, 1.5);
    const priorProjectionAtTransition = normalizePhaseRad(
      beforeTransition[0] + beforeTransition[1] * 1.5,
    );
    const nextProjectionAtTransition = normalizePhaseRad(
      afterTransition[0] + afterTransition[1] * 1.5,
    );

    expect(nextProjectionAtTransition).toBeCloseTo(
      priorProjectionAtTransition,
      5,
    );
  });

  it("returns a zero anchor when no mode carries oscillator authority", () => {
    expect(
      computePhaseAnchorAngularVelocityRadPerSec({
        slotSets: [
          { visibleSlots: new Float32Array([0, 0, 1, 0.5]), capacity: 1 },
        ],
        activeModes: new Map(),
      }),
    ).toBe(0);
  });
});
