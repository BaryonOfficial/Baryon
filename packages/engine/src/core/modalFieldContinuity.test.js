import { describe, expect, it } from "vitest";
import {
  BASIS_REASSIGN_MIN_SECONDS,
  TOPOLOGY_ADMISSION_FADE_SECONDS,
  TOPOLOGY_EVICTION_FADE_SECONDS,
  TOPOLOGY_PROMOTE_SECONDS,
  TOPOLOGY_RELEASE_SECONDS,
  createModalFieldContinuityState,
  updateModalFieldContinuity,
} from "./modalFieldContinuity.js";

const DT = 1 / 60;

function makeDescriptorSource(entries) {
  const modalFieldSlots = new Float32Array(entries.length * 4);
  const modalFieldPhaseSlots = new Float32Array(entries.length * 4);
  const modalFieldSpectralMomentSlots = new Float32Array(entries.length * 4);
  const modalFieldMetadataSlots = new Float32Array(entries.length * 4);

  entries.forEach((entry, index) => {
    const offset = index * 4;
    const [u, v, w] = entry.mode;
    modalFieldSlots[offset] = u;
    modalFieldSlots[offset + 1] = v;
    modalFieldSlots[offset + 2] = w;
    modalFieldSlots[offset + 3] = entry.coefficient;

    modalFieldPhaseSlots[offset] = entry.phaseOffsetRad ?? 0;
    modalFieldPhaseSlots[offset + 1] = entry.phaseVelocityRadPerSec ?? 0;
    modalFieldPhaseSlots[offset + 2] = entry.phaseCoherence ?? 0;
    modalFieldPhaseSlots[offset + 3] = entry.phaseAuthority ?? 0;

    modalFieldSpectralMomentSlots.set(
      entry.spectralMoment ?? [0, 0, 0, 0],
      offset,
    );

    modalFieldMetadataSlots[offset] = entry.naturalFrequencyHz ?? 0;
    modalFieldMetadataSlots[offset + 1] = entry.qualityFactor ?? 0;
    modalFieldMetadataSlots[offset + 2] =
      entry.responseFrequencyHz ?? entry.naturalFrequencyHz ?? 0;
    modalFieldMetadataSlots[offset + 3] = entry.observedSupport ?? 1;
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldSpectralMomentSlots,
    modalFieldMetadataSlots,
    activeModalFieldModeCount: entries.length,
  };
}

function update(state, entries, options = {}) {
  return updateModalFieldContinuity(state, {
    descriptorSource: makeDescriptorSource(entries),
    deltaTimeSec: options.deltaTimeSec ?? DT,
    resetToken: options.resetToken ?? "session",
    renderAuthority: options.renderAuthority ?? true,
    maxVisibleModeCount: options.maxVisibleModeCount ?? 8,
    maxHandoffModeCount: options.maxHandoffModeCount ?? 1,
  });
}

function readModeKeys(source) {
  const keys = [];
  for (let index = 0; index < source.activeModalFieldModeCount; index += 1) {
    const offset = index * 4;
    keys.push(
      `${source.modalFieldSlots[offset]}:${source.modalFieldSlots[offset + 1]}:${
        source.modalFieldSlots[offset + 2]
      }`,
    );
  }
  return keys;
}

function readCoefficient(source, modeKey) {
  for (let index = 0; index < source.activeModalFieldModeCount; index += 1) {
    const offset = index * 4;
    const key = `${source.modalFieldSlots[offset]}:${
      source.modalFieldSlots[offset + 1]
    }:${source.modalFieldSlots[offset + 2]}`;
    if (key === modeKey) {
      return source.modalFieldSlots[offset + 3];
    }
  }
  return null;
}

function readPhaseEvidence(source, modeKey) {
  for (let index = 0; index < source.activeModalFieldModeCount; index += 1) {
    const offset = index * 4;
    const key = `${source.modalFieldSlots[offset]}:${
      source.modalFieldSlots[offset + 1]
    }:${source.modalFieldSlots[offset + 2]}`;
    if (key === modeKey) {
      return {
        coherence: source.modalFieldPhaseSlots[offset + 2],
        authority: source.modalFieldPhaseSlots[offset + 3],
      };
    }
  }
  return null;
}

describe("modal field continuity", () => {
  it("bounds topology bookkeeping to one structural-analysis frame", () => {
    const structuralFrameSeconds = 1 / 30;

    expect(TOPOLOGY_PROMOTE_SECONDS).toBeLessThanOrEqual(
      structuralFrameSeconds,
    );
    expect(BASIS_REASSIGN_MIN_SECONDS).toBeLessThanOrEqual(
      structuralFrameSeconds,
    );
    expect(TOPOLOGY_ADMISSION_FADE_SECONDS).toBeLessThanOrEqual(
      structuralFrameSeconds,
    );
    expect(TOPOLOGY_EVICTION_FADE_SECONDS).toBeLessThanOrEqual(
      structuralFrameSeconds,
    );
  });

  it("requires sustained evidence before a candidate becomes basis eligible", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [1, 1, 1], coefficient: 0.4 };
    update(state, [], { deltaTimeSec: 0 });

    const early = update(state, [candidate], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS - 0.001,
    });
    expect(early.descriptorSource.activeModalFieldModeCount).toBe(0);

    const promoted = update(state, [candidate], { deltaTimeSec: 0.001 });
    expect(readModeKeys(promoted.descriptorSource)).toEqual(["1:1:1"]);
    expect(promoted.diagnostics.admittedModeKeys).toEqual(["1:1:1"]);
  });

  it("admits a positive coefficient without observer permission", () => {
    const state = createModalFieldContinuityState();
    const loudUnsupported = {
      mode: [1, 1, 1],
      coefficient: 0.9,
      observedSupport: 0,
    };

    const held = update(state, [loudUnsupported], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    expect(held.descriptorSource.activeModalFieldModeCount).toBe(1);
    expect(held.diagnostics.admittedModeKeys).toEqual(["1:1:1"]);
    expect(held.diagnostics.tailModeKeys).toEqual([]);
    expect(held.diagnostics.rawCandidateModeCount).toBe(1);
    expect(held.diagnostics.confidenceQualifiedCandidateModeCount).toBe(0);
    expect(held.diagnostics.lowConfidenceCandidateModeCount).toBe(1);
    expect(held.diagnostics.rawCandidateModalEnergy).toBeCloseTo(0.81, 6);
    expect(held.diagnostics.confidenceWeightedCandidateEnergy).toBe(0);
  });

  it("keeps observer confidence diagnostic after admission", () => {
    const state = createModalFieldContinuityState();
    const lowConfidence = {
      mode: [1, 1, 1],
      coefficient: 0.9,
      observedSupport: 0.02,
    };
    const recovered = {
      ...lowConfidence,
      observedSupport: 0.3,
    };
    update(state, [], { deltaTimeSec: 0 });

    const held = update(state, [lowConfidence], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });
    expect(held.descriptorSource.activeModalFieldModeCount).toBe(1);

    const admitted = update(state, [recovered], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    expect(readModeKeys(admitted.descriptorSource)).toEqual(["1:1:1"]);
    expect(admitted.diagnostics.admittedModeKeys).toEqual([]);
    expect(admitted.diagnostics.confidenceQualifiedCandidateModeCount).toBe(1);
    expect(admitted.diagnostics.lowConfidenceCandidateModeCount).toBe(0);
  });

  it("does not release a present coefficient when observer confidence drops", () => {
    const state = createModalFieldContinuityState();
    const supported = {
      mode: [3, 2, 1],
      coefficient: 0.6,
      observedSupport: 0.8,
    };
    update(state, [supported], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const unsupported = {
      ...supported,
      observedSupport: 0.02,
    };
    const releasing = update(state, [unsupported], { deltaTimeSec: DT });
    expect(readModeKeys(releasing.descriptorSource)).toEqual(["3:2:1"]);
    expect(releasing.diagnostics.releasingModeKeys).toEqual([]);

    const retained = update(state, [unsupported], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(readModeKeys(retained.descriptorSource)).toEqual(["3:2:1"]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
  });

  it("uses elapsed seconds rather than frame counts for promotion", () => {
    const oneStepState = createModalFieldContinuityState();
    const threeStepState = createModalFieldContinuityState();
    const candidate = { mode: [2, 1, 1], coefficient: 0.32 };

    const oneStep = update(oneStepState, [candidate], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    update(threeStepState, [candidate], { deltaTimeSec: 0.01 });
    update(threeStepState, [candidate], { deltaTimeSec: 0.02 });
    const threeStep = update(threeStepState, [candidate], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS - 0.03,
    });

    expect(readModeKeys(oneStep.descriptorSource)).toEqual(["2:1:1"]);
    expect(readModeKeys(threeStep.descriptorSource)).toEqual(["2:1:1"]);
  });

  it("keeps a low positive oscillator coefficient active", () => {
    const state = createModalFieldContinuityState();
    const loud = { mode: [3, 2, 1], coefficient: 0.45 };
    update(state, [loud], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const oneQuietStep = update(state, [{ ...loud, coefficient: 0.01 }]);
    expect(readModeKeys(oneQuietStep.descriptorSource)).toEqual(["3:2:1"]);
    expect(oneQuietStep.diagnostics.releasingModeKeys).toEqual([]);

    const retained = update(state, [{ ...loud, coefficient: 0.01 }], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(readModeKeys(retained.descriptorSource)).toEqual(["3:2:1"]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
  });

  it("decays missing topology payload until release", () => {
    const state = createModalFieldContinuityState();
    const loud = {
      mode: [3, 2, 1],
      coefficient: 0.45,
      phaseOffsetRad: 0.4,
      phaseVelocityRadPerSec: 2.5,
      phaseCoherence: 0.7,
      phaseAuthority: 0.9,
      spectralMoment: [0.2, 0.4, 0.6, 0.8],
      observedSupport: 0.45,
    };
    update(state, [loud], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const retained = update(state, [], { deltaTimeSec: DT });

    expect(readModeKeys(retained.descriptorSource)).toEqual(["3:2:1"]);
    expect(retained.diagnostics.releasingModeKeys).toEqual(["3:2:1"]);
    expect(retained.descriptorSource.modalFieldSlots[3]).toBeGreaterThan(0.3);
    expect(retained.descriptorSource.modalFieldSlots[3]).toBeLessThan(0.45);
    expect(retained.descriptorSource.modalFieldPhaseSlots[2]).toBeGreaterThan(
      0,
    );
    expect(retained.descriptorSource.modalFieldPhaseSlots[3]).toBeGreaterThan(
      0,
    );
    expect(
      Array.from(retained.descriptorSource.modalFieldSpectralMomentSlots),
    ).toEqual([
      expect.closeTo(0.2, 6),
      expect.closeTo(0.4, 6),
      expect.closeTo(0.6, 6),
      expect.closeTo(0.8, 6),
    ]);
    expect(
      retained.descriptorSource.modalFieldMetadataSlots[3],
    ).toBeGreaterThan(0);

    const released = update(state, [], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(released.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(released.diagnostics.removedModeKeys).toEqual(["3:2:1"]);
  });

  it("commits simultaneously expired releases as one basis transition", () => {
    const state = createModalFieldContinuityState();
    const activeModes = [
      { mode: [2, 1, 1], coefficient: 0.5 },
      { mode: [3, 1, 1], coefficient: 0.4 },
    ];
    update(state, activeModes, { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });
    const admissionEpoch = state.eligibilityEpoch;

    const released = update(state, [], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });

    expect(released.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(released.diagnostics.removedModeKeys).toEqual(["2:1:1", "3:1:1"]);
    expect(state.visibleModeKeys).toEqual([]);
    expect(state.eligibilityEpoch).toBe(admissionEpoch + 1);
  });

  it("retains the pitch basis while decaying acoustic support", () => {
    const state = createModalFieldContinuityState();
    const loud = {
      mode: [4, 2, 1],
      coefficient: 0.5,
      spectralMoment: [0, 0.8, -0.6, 0.4],
      observedSupport: 0.5,
    };
    update(state, [loud], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const retained = update(state, [], { deltaTimeSec: DT });

    expect(readModeKeys(retained.descriptorSource)).toEqual(["4:2:1"]);
    expect(
      Array.from(retained.descriptorSource.modalFieldSpectralMomentSlots),
    ).toEqual([
      0,
      expect.closeTo(0.8, 6),
      expect.closeTo(-0.6, 6),
      expect.closeTo(0.4, 6),
    ]);
    expect(retained.descriptorSource.modalFieldMetadataSlots[3]).toBeGreaterThan(
      0,
    );
    expect(retained.descriptorSource.modalFieldMetadataSlots[3]).toBeLessThan(
      0.5,
    );
  });

  it("caps basis-visible admission to the modal basis page budget", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [
        { mode: [1, 1, 1], coefficient: 0.5 },
        { mode: [2, 1, 1], coefficient: 0.4 },
        { mode: [3, 1, 1], coefficient: 0.3 },
        { mode: [4, 1, 1], coefficient: 0.2 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    expect(result.descriptorSource.activeModalFieldModeCount).toBe(2);
    expect(result.diagnostics.activeModeCount).toBe(2);
    expect(result.diagnostics.admittedModeKeys).toHaveLength(2);
    expect(readModeKeys(result.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);
  });

  it("keeps every admitted exact-eigenvalue shell atomic", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [
        { mode: [0, 0, 3], coefficient: 0.9, observedSupport: 0.9 },
        { mode: [1, 2, 2], coefficient: 0.88, observedSupport: 0.88 },
        { mode: [2, 1, 2], coefficient: 0.86, observedSupport: 0.86 },
        { mode: [1, 1, 1], coefficient: 0.35, observedSupport: 0.35 },
        { mode: [1, 1, 2], coefficient: 0.34, observedSupport: 0.34 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 3,
      },
    );

    expect(readModeKeys(result.descriptorSource)).toEqual([
      "0:0:3",
      "1:2:2",
      "2:1:2",
    ]);
    expect(result.diagnostics.visibleShellCount).toBe(1);
    expect(result.diagnostics.duplicateShellPressure).toBeGreaterThan(0);
    expect(result.diagnostics.tailModeKeys).toEqual(["1:1:1", "1:1:2"]);
  });

  it("replaces weak duplicate-shell topology with a missing structural shell", () => {
    const state = createModalFieldContinuityState();
    update(
      state,
      [
        { mode: [0, 0, 3], coefficient: 0.9, observedSupport: 1 },
        { mode: [1, 2, 2], coefficient: 0.82, observedSupport: 1 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    const entries = [
      { mode: [0, 0, 3], coefficient: 0.9, observedSupport: 1 },
      { mode: [1, 2, 2], coefficient: 0.82, observedSupport: 1 },
      { mode: [1, 1, 1], coefficient: 0.35, observedSupport: 1 },
    ];
    const evicting = update(state, entries, {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 2,
    });

    // Both signed modes remain in the carrier during the damping-derived
    // handoff, before any magnitude or radiance transform.
    expect(readModeKeys(evicting.descriptorSource)).toEqual([
      "0:0:3",
      "1:2:2",
      "1:1:1",
    ]);
    expect(evicting.diagnostics.evictingModeKeys).toEqual(["1:2:2"]);
    expect(evicting.diagnostics.removedModeKeys).toEqual([]);
    expect(evicting.diagnostics.admittedModeKeys).toEqual(["1:1:1"]);

    const replaced = update(state, entries, {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 2,
    });

    expect(readModeKeys(replaced.descriptorSource)).toEqual(["0:0:3", "1:1:1"]);
    expect(replaced.diagnostics.removedModeKeys).toEqual(["1:2:2"]);
    expect(replaced.diagnostics.admittedModeKeys).toEqual([]);
    expect(replaced.diagnostics.visibleShellCount).toBe(2);
  });

  it("keeps high-order analytic candidates in basis-visible topology", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [
        { mode: [1, 1, 1], coefficient: 0.4 },
        { mode: [9, 1, 1], coefficient: 0.8 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    expect(readModeKeys(result.descriptorSource)).toEqual(
      expect.arrayContaining(["1:1:1", "9:1:1"]),
    );
    expect(result.diagnostics.tailModeKeys).toEqual([]);
  });

  it("selects the strongest supported modes without an implicit order ceiling", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [
        { mode: [18, 18, 18], coefficient: 0.95, observedSupport: 1 },
        { mode: [2, 1, 1], coefficient: 0.3, observedSupport: 1 },
        { mode: [3, 1, 1], coefficient: 0.28, observedSupport: 1 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    expect(readModeKeys(result.descriptorSource)).toEqual([
      "18:18:18",
      "2:1:1",
    ]);
    expect(result.diagnostics.tailModeKeys).toContain("3:1:1");
  });

  it("admits a supported high-order mode when it is the only signal", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [{ mode: [18, 18, 18], coefficient: 0.95, observedSupport: 0.95 }],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    expect(result.descriptorSource.activeModalFieldModeCount).toBe(1);
    expect(result.diagnostics.admittedModeKeys).toEqual(["18:18:18"]);
    expect(result.diagnostics.tailModeKeys).toEqual([]);
  });

  it("does not replace a stronger active mode with a weaker low-order mode", () => {
    const state = createModalFieldContinuityState();
    const detail = {
      mode: [4, 4, 4],
      coefficient: 0.38,
      observedSupport: 1,
    };
    const structural = {
      mode: [2, 1, 1],
      coefficient: 0.32,
      observedSupport: 1,
    };

    const initial = update(state, [detail], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(initial.descriptorSource)).toEqual(["4:4:4"]);

    const evicting = update(state, [detail, structural], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 1,
    });

    expect(readModeKeys(evicting.descriptorSource)).toEqual(["4:4:4"]);
    expect(evicting.diagnostics.evictingModeKeys).toEqual([]);

    const replaced = update(state, [detail, structural], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 1,
    });

    expect(readModeKeys(replaced.descriptorSource)).toEqual(["4:4:4"]);
    expect(replaced.diagnostics.removedModeKeys).toEqual([]);
    expect(replaced.diagnostics.admittedModeKeys).toEqual([]);
  });

  it("lets a stronger high-order mode replace weaker topology", () => {
    const state = createModalFieldContinuityState();
    const structural = {
      mode: [2, 1, 1],
      coefficient: 0.3,
      observedSupport: 1,
    };
    const detail = {
      mode: [18, 18, 18],
      coefficient: 0.95,
      observedSupport: 1,
    };

    const initial = update(state, [structural], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(initial.descriptorSource)).toEqual(["2:1:1"]);

    const retained = update(state, [structural, detail], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 1,
    });

    expect(readModeKeys(retained.descriptorSource)).toEqual([
      "2:1:1",
      "18:18:18",
    ]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
    expect(retained.diagnostics.admittedModeKeys).toEqual(["18:18:18"]);
    expect(retained.diagnostics.evictingModeKeys).toEqual(["2:1:1"]);

    const replaced = update(state, [structural, detail], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(replaced.descriptorSource)).toEqual(["18:18:18"]);
  });

  it("does not let detail replace stale releasing structural pages", () => {
    const state = createModalFieldContinuityState();
    const activeStructural = {
      mode: [1, 1, 1],
      coefficient: 0.36,
      observedSupport: 1,
    };
    const staleStructural = {
      mode: [2, 1, 1],
      coefficient: 0.12,
      observedSupport: 1,
    };
    const detail = {
      mode: [18, 18, 18],
      coefficient: 0.16,
      observedSupport: 1,
    };

    const initial = update(state, [activeStructural, staleStructural], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 2,
    });
    expect(readModeKeys(initial.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);

    const earlySwitch = update(state, [activeStructural, detail], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 2,
    });
    expect(readModeKeys(earlySwitch.descriptorSource)).toEqual([
      "1:1:1",
      "2:1:1",
    ]);

    const retained = update(state, [activeStructural, detail], {
      deltaTimeSec: BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 2,
    });

    expect(readModeKeys(retained.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);
    expect(retained.diagnostics.retainedModeKeys).toEqual(["1:1:1", "2:1:1"]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
    expect(retained.diagnostics.admittedModeKeys).toEqual([]);
    expect(retained.diagnostics.tailModeKeys).toContain("18:18:18");
  });

  it("does not let phase authority promote or rank visible topology", () => {
    const phaseOnlyState = createModalFieldContinuityState();
    const phaseOnly = update(
      phaseOnlyState,
      [
        {
          mode: [1, 1, 1],
          coefficient: 0,
          phaseCoherence: 1,
          phaseAuthority: 1,
        },
      ],
      { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS },
    );

    expect(phaseOnly.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(phaseOnly.diagnostics.tailModeKeys).toEqual([]);

    const rankingState = createModalFieldContinuityState();
    const ranked = update(
      rankingState,
      [
        { mode: [1, 1, 1], coefficient: 0.3, phaseAuthority: 0 },
        {
          mode: [2, 1, 1],
          coefficient: 0.3,
          phaseCoherence: 1,
          phaseAuthority: 1,
        },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 1,
      },
    );

    expect(readModeKeys(ranked.descriptorSource)).toEqual(["1:1:1"]);
    expect(ranked.diagnostics.tailModeKeys).toEqual(["2:1:1"]);
  });

  it("replaces weak visible topology with stronger sustained candidates when full", () => {
    const state = createModalFieldContinuityState();
    update(
      state,
      [
        { mode: [1, 1, 1], coefficient: 0.12 },
        { mode: [2, 1, 1], coefficient: 0.11 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    const entries = [
      { mode: [1, 1, 1], coefficient: 0.12 },
      { mode: [2, 1, 1], coefficient: 0.11 },
      { mode: [3, 1, 1], coefficient: 0.8 },
      { mode: [4, 1, 1], coefficient: 0.7 },
    ];
    const evicting = update(state, entries, {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 2,
    });

    expect(readModeKeys(evicting.descriptorSource)).toEqual([
      "1:1:1",
      "2:1:1",
      "3:1:1",
    ]);
    expect(evicting.diagnostics.evictingModeKeys).toEqual(["2:1:1"]);

    const replacement = update(state, entries, {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 2,
    });

    expect(readModeKeys(replacement.descriptorSource)).toEqual([
      "1:1:1",
      "3:1:1",
    ]);
    expect(replacement.diagnostics.removedModeKeys).toEqual(["2:1:1"]);
    expect(replacement.diagnostics.admittedModeKeys).toEqual([]);
  });

  it("skips the admission fade when the field starts from silence", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [1, 1, 1], coefficient: 0.4 };

    const promoted = update(state, [candidate], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    expect(readModeKeys(promoted.descriptorSource)).toEqual(["1:1:1"]);
    expect(readCoefficient(promoted.descriptorSource, "1:1:1")).toBeCloseTo(
      0.4,
      6,
    );
  });

  it("fades steady-state admissions in over the admission fade window", () => {
    const state = createModalFieldContinuityState();
    const resident = { mode: [1, 1, 1], coefficient: 0.4 };
    const newcomer = { mode: [2, 1, 1], coefficient: 0.5 };

    update(state, [resident], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    // Qualify the newcomer over two fast ticks. The second tick admits it
    // partway through the one-structural-frame numerical ramp.
    update(state, [resident, newcomer], {
      deltaTimeSec: DT,
    });
    const admitted = update(state, [resident, newcomer], {
      deltaTimeSec: DT,
    });

    const partial = readCoefficient(admitted.descriptorSource, "2:1:1");
    expect(partial).not.toBeNull();
    expect(partial).toBeLessThan(0.5);
    expect(readCoefficient(admitted.descriptorSource, "1:1:1")).toBeCloseTo(
      0.4,
      6,
    );

    const settled = update(state, [resident, newcomer], {
      deltaTimeSec: TOPOLOGY_ADMISSION_FADE_SECONDS,
    });
    expect(readCoefficient(settled.descriptorSource, "2:1:1")).toBeCloseTo(
      0.5,
      6,
    );
  });

  it("fades evicted pages out within the steady plus handoff budget", () => {
    const state = createModalFieldContinuityState();
    const weak = { mode: [1, 1, 1], coefficient: 0.15, observedSupport: 1 };
    const strong = { mode: [2, 1, 1], coefficient: 0.9, observedSupport: 1 };

    update(state, [weak], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 1,
    });
    const evicting = update(state, [weak, strong], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(evicting.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);
    expect(evicting.diagnostics.evictingModeKeys).toEqual(["1:1:1"]);

    // Mid-fade the evicted page keeps its identity but decays in amplitude,
    // while the entering page rises in the one reserved handoff slot.
    const midFade = update(state, [weak, strong], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS / 2,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(midFade.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);
    expect(midFade.descriptorSource.activeModalFieldModeCount).toBe(2);
    const fading = readCoefficient(midFade.descriptorSource, "1:1:1");
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(0.15);

    const swapped = update(state, [weak, strong], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(swapped.descriptorSource)).toEqual(["2:1:1"]);
    expect(swapped.diagnostics.removedModeKeys).toEqual(["1:1:1"]);
    expect(swapped.diagnostics.admittedModeKeys).toEqual([]);
    expect(swapped.descriptorSource.activeModalFieldModeCount).toBe(1);
  });

  it("overlaps retiring and entering signed modes in one reserved handoff page", () => {
    const state = createModalFieldContinuityState();
    const weak = {
      mode: [1, 1, 1],
      coefficient: 0.15,
      observedSupport: 1,
      naturalFrequencyHz: 220,
      qualityFactor: 12,
    };
    const strong = {
      mode: [2, 1, 1],
      coefficient: 0.9,
      observedSupport: 1,
      naturalFrequencyHz: 330,
      qualityFactor: 10,
    };
    const queued = {
      mode: [3, 1, 1],
      coefficient: 0.8,
      observedSupport: 1,
      naturalFrequencyHz: 440,
      qualityFactor: 8,
    };

    update(state, [weak], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });
    const handoff = update(state, [weak, strong, queued], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });

    expect(readModeKeys(handoff.descriptorSource)).toEqual(["1:1:1", "2:1:1"]);
    expect(handoff.diagnostics.evictingModeKeys).toEqual(["1:1:1"]);
    expect(handoff.diagnostics.admittedModeKeys).toEqual(["2:1:1"]);
    expect(readCoefficient(handoff.descriptorSource, "1:1:1")).toBeGreaterThan(
      0,
    );
    expect(readCoefficient(handoff.descriptorSource, "2:1:1")).toBeGreaterThan(
      0,
    );
    expect(handoff.descriptorSource.activeModalFieldModeCount).toBe(2);

    const bounded = update(state, [weak, strong, queued], {
      deltaTimeSec: DT,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });
    expect(
      bounded.descriptorSource.activeModalFieldModeCount,
    ).toBeLessThanOrEqual(2);
    expect(readModeKeys(bounded.descriptorSource)).not.toContain("3:1:1");
  });

  it("fades physical coefficients without erasing phase evidence during handoff", () => {
    const state = createModalFieldContinuityState();
    const retiring = {
      mode: [1, 1, 1],
      coefficient: 0.15,
      observedSupport: 1,
      phaseCoherence: 0.72,
      phaseAuthority: 0.91,
    };
    const entering = {
      mode: [2, 1, 1],
      coefficient: 0.9,
      observedSupport: 1,
      phaseCoherence: 0.81,
      phaseAuthority: 0.94,
    };

    update(state, [retiring], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });
    const handoff = update(state, [retiring, entering], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });
    const midHandoff = update(state, [retiring, entering], {
      deltaTimeSec: DT,
      maxVisibleModeCount: 1,
      maxHandoffModeCount: 1,
    });

    expect(handoff.diagnostics.evictingModeKeys).toEqual(["1:1:1"]);
    expect(readCoefficient(midHandoff.descriptorSource, "1:1:1")).toBeLessThan(
      retiring.coefficient,
    );
    expect(readCoefficient(midHandoff.descriptorSource, "2:1:1")).toBeLessThan(
      entering.coefficient,
    );
    expect(readPhaseEvidence(midHandoff.descriptorSource, "1:1:1")).toEqual({
      coherence: expect.closeTo(retiring.phaseCoherence, 6),
      authority: expect.closeTo(retiring.phaseAuthority, 6),
    });
    expect(readPhaseEvidence(midHandoff.descriptorSource, "2:1:1")).toEqual({
      coherence: expect.closeTo(entering.phaseCoherence, 6),
      authority: expect.closeTo(entering.phaseAuthority, 6),
    });
  });

  it("keeps numerical handoff duration independent of physical damping", () => {
    const sampleHandoff = ({ naturalFrequencyHz, qualityFactor }) => {
      const state = createModalFieldContinuityState();
      const retiring = {
        mode: [1, 1, 1],
        coefficient: 0.3,
        observedSupport: 1,
        naturalFrequencyHz,
        qualityFactor,
      };
      const entering = {
        mode: [2, 1, 1],
        coefficient: 0.9,
        observedSupport: 1,
      };

      update(state, [retiring], {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 1,
      });
      update(state, [retiring, entering], {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS + BASIS_REASSIGN_MIN_SECONDS,
        maxVisibleModeCount: 1,
      });
      const midHandoff = update(state, [retiring, entering], {
        deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS / 2,
        maxVisibleModeCount: 1,
      });

      return readCoefficient(midHandoff.descriptorSource, "1:1:1");
    };

    const lowQ = sampleHandoff({
      naturalFrequencyHz: 1000,
      qualityFactor: 4,
    });
    const highQ = sampleHandoff({
      naturalFrequencyHz: 40,
      qualityFactor: 400,
    });

    // modalResponse already resolved the current forced coefficient and its
    // Q-dependent stored residue. This seam only prevents a page swap from
    // popping, so metadata may not damp it again.
    expect(lowQ).toBeGreaterThan(0);
    expect(lowQ).toBeLessThan(0.3);
    expect(highQ).toBeCloseTo(lowQ, 6);
  });

  it("preserves stable identity order through coefficient rank jitter", () => {
    const state = createModalFieldContinuityState();
    update(
      state,
      [
        { mode: [1, 1, 1], coefficient: 0.42 },
        { mode: [2, 2, 2], coefficient: 0.39 },
      ],
      { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS },
    );

    const jittered = update(
      state,
      [
        { mode: [2, 2, 2], coefficient: 0.51 },
        { mode: [1, 1, 1], coefficient: 0.5 },
      ],
      { deltaTimeSec: DT },
    );

    expect(readModeKeys(jittered.descriptorSource)).toEqual(["1:1:1", "2:2:2"]);
    expect(jittered.diagnostics.retainedModeKeys).toEqual(["1:1:1", "2:2:2"]);
  });

  it("passes through current coefficient, phase, pitch basis, and metadata", () => {
    const state = createModalFieldContinuityState();
    update(
      state,
      [
        {
          mode: [4, 3, 2],
          coefficient: 0.22,
          phaseOffsetRad: 0.1,
          phaseVelocityRadPerSec: 1.5,
          phaseCoherence: 0.4,
          phaseAuthority: 0.7,
          spectralMoment: [0.2, 0.3, 0.4, 0.5],
          naturalFrequencyHz: 220,
          qualityFactor: 8,
          responseFrequencyHz: 215,
          observedSupport: 0.6,
        },
      ],
      { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS },
    );

    const current = update(state, [
      {
        mode: [4, 3, 2],
        coefficient: 0.83,
        phaseOffsetRad: 2.1,
        phaseVelocityRadPerSec: 3.5,
        phaseCoherence: 0.8,
        phaseAuthority: 0.95,
        spectralMoment: [0.6, 0.7, 0.8, 0.9],
        naturalFrequencyHz: 440,
        qualityFactor: 16,
        responseFrequencyHz: 430,
        observedSupport: 0.9,
      },
    ]);

    expect(current.descriptorSource.modalFieldSlots[3]).toBeCloseTo(0.83, 6);
    expect(Array.from(current.descriptorSource.modalFieldPhaseSlots)).toEqual([
      expect.closeTo(2.1, 6),
      expect.closeTo(3.5, 6),
      expect.closeTo(0.8, 6),
      expect.closeTo(0.95, 6),
    ]);
    expect(
      Array.from(current.descriptorSource.modalFieldSpectralMomentSlots),
    ).toEqual([
      expect.closeTo(0.6, 6),
      expect.closeTo(0.7, 6),
      expect.closeTo(0.8, 6),
      expect.closeTo(0.9, 6),
    ]);
    expect(
      Array.from(current.descriptorSource.modalFieldMetadataSlots),
    ).toEqual([
      expect.closeTo(440, 6),
      expect.closeTo(16, 6),
      expect.closeTo(430, 6),
      expect.closeTo(0.9, 6),
    ]);
  });

  it("makes render-authority loss dormant without destroying retained identity state", () => {
    const state = createModalFieldContinuityState();
    const active = { mode: [5, 1, 1], coefficient: 0.5 };
    update(state, [active], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const dormant = update(state, [{ mode: [6, 1, 1], coefficient: 0.8 }], {
      renderAuthority: false,
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });
    expect(dormant.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(dormant.diagnostics.activeModeCount).toBe(1);
    expect(dormant.diagnostics.candidateModeCount).toBe(1);

    const resumed = update(state, [active], { deltaTimeSec: DT });
    expect(readModeKeys(resumed.descriptorSource)).toEqual(["5:1:1"]);
  });

  it("starts a fresh admission epoch only on an explicit reset token change", () => {
    const state = createModalFieldContinuityState();
    const previousMode = { mode: [7, 1, 1], coefficient: 0.5 };
    const resetMode = { mode: [8, 1, 1], coefficient: 0.45 };
    update(state, [previousMode], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      resetToken: "session-a",
    });
    const previousEpoch = state.eligibilityEpoch;

    const reset = update(state, [resetMode], {
      deltaTimeSec: 0,
      resetToken: "session-b",
    });
    expect(readModeKeys(reset.descriptorSource)).toEqual(["8:1:1"]);
    expect(reset.diagnostics.reset).toBe(true);
    expect(state.eligibilityEpoch).toBe(previousEpoch + 1);
  });

  it("does not replay bootstrap after an empty reset frame", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [9, 1, 1], coefficient: 0.4 };
    update(state, [], { deltaTimeSec: 0, resetToken: "session-a" });
    update(state, [], { deltaTimeSec: 0, resetToken: "session-b" });

    const sameEpoch = update(state, [candidate], {
      deltaTimeSec: 0,
      resetToken: "session-b",
    });
    expect(sameEpoch.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(sameEpoch.diagnostics.admittedModeKeys).toEqual([]);
    expect(sameEpoch.diagnostics.tailModeKeys).toEqual(["9:1:1"]);
  });

  it("does not let downstream acknowledgements or diagnostics promote topology", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [8, 1, 1], coefficient: 0.4 };
    update(state, [], { deltaTimeSec: 0 });

    const result = updateModalFieldContinuity(state, {
      descriptorSource: makeDescriptorSource([candidate]),
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS - 0.001,
      resetToken: "session",
      renderAuthority: true,
      renderAcknowledged: true,
      modeIdentityRetentionRatio: 1,
    });

    expect(result.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(result.diagnostics.admittedModeKeys).toEqual([]);
    expect(result.diagnostics.tailModeKeys).toEqual(["8:1:1"]);
  });
});
