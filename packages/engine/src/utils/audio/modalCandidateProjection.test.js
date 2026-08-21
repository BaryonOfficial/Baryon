import { describe, expect, it } from "vitest";

import { buildModalCandidateState } from "./modalCandidateProjection.js";

describe("modal candidate projection", () => {
  it("normalizes semantic modal evidence without consuming display scores", () => {
    const candidateState = buildModalCandidateState([
      {
        u: 1,
        v: 2,
        w: 3,
        naturalFrequencyHz: 440,
        qualityFactor: 4,
        storedEnergy: 0.8,
        retainedEnergy: 0.2,
        forcingEnergy: 0.3,
        currentDriveEnergy: 0.1,
        observedSupport: 0.5,
        displayProjectionAmplitude: 1,
        phaseOffsetRad: 0.25,
        phaseVelocityRadPerSec: 12,
        phaseCoherence: 0.6,
        phaseAuthority: 0.7,
      },
    ]);
    const candidate = candidateState.get("1:2:3");

    expect(candidate).toEqual({
      modeKey: "1:2:3",
      u: 1,
      v: 2,
      w: 3,
      naturalFrequencyHz: 440,
      qualityFactor: 4,
      dampingRatio: 0.125,
      forcingEnergy: 0.3,
      observedSupport: 0.7,
    });
    expect(candidate).not.toHaveProperty("displayProjectionAmplitude");
    expect(candidate).not.toHaveProperty("projectionWeight");
  });

  it("preserves oscillator phase authority as observed support", () => {
    const candidateState = buildModalCandidateState([
      {
        modeKey: "phase-supported",
        qualityFactor: 12,
        coherence: 0.1,
        modalOscillatorPhaseAuthority: 0.75,
        modalOscillatorPhaseCoherence: 0.6,
      },
    ]);
    const candidate = candidateState.get("phase-supported");

    expect(candidate.observedSupport).toBe(0.75);
  });

  it("builds one canonical state across candidate groups", () => {
    const candidateState = buildModalCandidateState(
      [
        {
          modeKey: "source",
          qualityFactor: 12,
          storedEnergy: 0.8,
          observedSupport: 0.5,
        },
      ],
      [
        {
          modeKey: "resonant",
          qualityFactor: 18,
          retainedEnergy: 0.4,
          coherence: 0.25,
        },
      ],
    );

    expect([...candidateState.keys()]).toEqual(["source", "resonant"]);
    expect(candidateState.get("source").observedSupport).toBe(0.5);
    expect(candidateState.get("resonant").observedSupport).toBe(0.25);
  });

  it("leaves observed support closed when no evidence is present", () => {
    const candidateState = buildModalCandidateState([
      { modeKey: "empty", qualityFactor: 12 },
    ]);

    expect(candidateState.get("empty").observedSupport).toBe(0);
  });

  it("rejects candidate state without apparatus-derived Q", () => {
    expect(() => buildModalCandidateState([{ modeKey: "missing-q" }])).toThrow(
      "Modal candidate missing-q must declare an apparatus-derived Q",
    );
  });
});
