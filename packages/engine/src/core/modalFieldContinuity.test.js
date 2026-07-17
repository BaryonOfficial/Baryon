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
  const modalFieldColorSlots = new Float32Array(entries.length * 4);
  const modalFieldSpectralLaneA = new Float32Array(entries.length * 4);
  const modalFieldSpectralLaneB = new Float32Array(entries.length * 4);
  const modalFieldSpectralMeta = new Float32Array(entries.length * 4);
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

    modalFieldColorSlots[offset] = entry.colorR ?? 0;
    modalFieldColorSlots[offset + 1] = entry.colorG ?? 0;
    modalFieldColorSlots[offset + 2] = entry.colorB ?? 0;
    modalFieldColorSlots[offset + 3] = entry.colorWeight ?? 0;

    modalFieldSpectralLaneA.set(entry.spectralLaneA ?? [0, 0, 0, 0], offset);
    modalFieldSpectralLaneB.set(entry.spectralLaneB ?? [0, 0, 0, 0], offset);
    modalFieldSpectralMeta.set(entry.spectralMeta ?? [0, 0, 0, 0], offset);

    modalFieldMetadataSlots[offset] = entry.naturalFrequencyHz ?? 0;
    modalFieldMetadataSlots[offset + 1] = entry.qualityFactor ?? 0;
    modalFieldMetadataSlots[offset + 2] = entry.dampingRatio ?? 0;
    modalFieldMetadataSlots[offset + 3] = entry.observedSupport ?? 1;
  });

  return {
    modalFieldSlots,
    modalFieldPhaseSlots,
    modalFieldColorSlots,
    modalFieldSpectralLaneA,
    modalFieldSpectralLaneB,
    modalFieldSpectralMeta,
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
    maxBasisModeOrder: options.maxBasisModeOrder ?? Infinity,
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

describe("modal field continuity", () => {
  it("requires sustained evidence before a candidate becomes basis eligible", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [1, 1, 1], coefficient: 0.4 };

    const early = update(state, [candidate], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS - 0.001,
    });
    expect(early.descriptorSource.activeModalFieldModeCount).toBe(0);

    const promoted = update(state, [candidate], { deltaTimeSec: 0.001 });
    expect(readModeKeys(promoted.descriptorSource)).toEqual(["1:1:1"]);
    expect(promoted.diagnostics.admittedModeKeys).toEqual(["1:1:1"]);
  });

  it("does not admit topology from coefficient alone without observation support", () => {
    const state = createModalFieldContinuityState();
    const loudUnsupported = {
      mode: [1, 1, 1],
      coefficient: 0.9,
      observedSupport: 0,
    };

    const held = update(state, [loudUnsupported], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    expect(held.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(held.diagnostics.admittedModeKeys).toEqual([]);
    expect(held.diagnostics.tailModeKeys).toEqual(["1:1:1"]);
    expect(held.diagnostics.rawCandidateModeCount).toBe(1);
    expect(held.diagnostics.confidenceQualifiedCandidateModeCount).toBe(0);
    expect(held.diagnostics.lowConfidenceCandidateModeCount).toBe(1);
    expect(held.diagnostics.rawCandidateModalEnergy).toBeCloseTo(0.81, 6);
    expect(held.diagnostics.confidenceWeightedCandidateEnergy).toBe(0);
  });

  it("admits the same candidate when observation support recovers", () => {
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

    const held = update(state, [lowConfidence], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });
    expect(held.descriptorSource.activeModalFieldModeCount).toBe(0);

    const admitted = update(state, [recovered], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });

    expect(readModeKeys(admitted.descriptorSource)).toEqual(["1:1:1"]);
    expect(admitted.diagnostics.admittedModeKeys).toEqual(["1:1:1"]);
    expect(admitted.diagnostics.confidenceQualifiedCandidateModeCount).toBe(1);
    expect(admitted.diagnostics.lowConfidenceCandidateModeCount).toBe(0);
  });

  it("releases retained topology through low confidence instead of amplitude loss", () => {
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
    expect(releasing.diagnostics.releasingModeKeys).toEqual(["3:2:1"]);

    const released = update(state, [unsupported], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(released.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(released.diagnostics.removedModeKeys).toEqual(["3:2:1"]);
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

  it("keeps an active identity through short low-evidence release windows", () => {
    const state = createModalFieldContinuityState();
    const loud = { mode: [3, 2, 1], coefficient: 0.45 };
    update(state, [loud], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const oneQuietStep = update(state, [{ ...loud, coefficient: 0.01 }]);
    expect(readModeKeys(oneQuietStep.descriptorSource)).toEqual(["3:2:1"]);
    expect(oneQuietStep.diagnostics.releasingModeKeys).toEqual(["3:2:1"]);

    const released = update(state, [{ ...loud, coefficient: 0.01 }], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(released.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(released.diagnostics.removedModeKeys).toEqual(["3:2:1"]);
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
      colorR: 0.2,
      colorG: 0.4,
      colorB: 0.6,
      colorWeight: 0.8,
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
    expect(retained.descriptorSource.modalFieldColorSlots[3]).toBeGreaterThan(
      0,
    );
    expect(
      retained.descriptorSource.modalFieldMetadataSlots[3],
    ).toBeGreaterThan(0);

    const released = update(state, [], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS,
    });
    expect(released.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(released.diagnostics.removedModeKeys).toEqual(["3:2:1"]);
  });

  it("retains Spectral lane buffers while decaying live packet weights", () => {
    const state = createModalFieldContinuityState();
    const loud = {
      mode: [4, 2, 1],
      coefficient: 0.5,
      colorR: 1,
      colorG: 0,
      colorB: 0,
      colorWeight: 0.9,
      spectralPhase: 0.25,
      spectralWavelength: 530,
      spectralHarmonicConfidence: 0.8,
      spectralAccentEnergy: 0.4,
      spectralLaneA: [0, 1, 0, 0],
      spectralLaneB: [0, 0, 0, 0],
      spectralMeta: [0.25, 0.06, 0.8, 0.5],
      observedSupport: 0.5,
    };
    update(state, [loud], { deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS });

    const retained = update(state, [], { deltaTimeSec: DT });

    expect(readModeKeys(retained.descriptorSource)).toEqual(["4:2:1"]);
    expect(
      Array.from(retained.descriptorSource.modalFieldSpectralLaneA),
    ).toEqual([0, 1, 0, 0]);
    expect(
      Array.from(retained.descriptorSource.modalFieldSpectralLaneB),
    ).toEqual([0, 0, 0, 0]);
    expect(retained.descriptorSource.modalFieldSpectralMeta[0]).toBeCloseTo(
      0.25,
      6,
    );
    expect(retained.descriptorSource.modalFieldSpectralMeta[1]).toBeCloseTo(
      0.06,
      6,
    );
    expect(retained.descriptorSource.modalFieldSpectralMeta[2]).toBeGreaterThan(
      0,
    );
    expect(retained.descriptorSource.modalFieldSpectralMeta[2]).toBeLessThan(
      0.8,
    );
    expect(retained.descriptorSource.modalFieldSpectralMeta[3]).toBeGreaterThan(
      0,
    );
    expect(retained.descriptorSource.modalFieldSpectralMeta[3]).toBeLessThan(
      0.5,
    );
    expect(retained.descriptorSource.modalFieldColorSlots[0]).toBe(1);
    expect(retained.descriptorSource.modalFieldColorSlots[3]).toBeGreaterThan(
      0,
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

  it("reserves finite basis slots for distinct 3D wavenumber shells", () => {
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
      "1:1:1",
      "1:1:2",
    ]);
    expect(result.diagnostics.visibleShellCount).toBe(3);
    expect(result.diagnostics.duplicateShellPressure).toBe(0);
    expect(result.diagnostics.tailModeKeys).toEqual(["1:2:2", "2:1:2"]);
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

  it("keeps unrepresentable high-order candidates out of basis-visible topology", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [
        { mode: [1, 1, 1], coefficient: 0.4 },
        { mode: [9, 1, 1], coefficient: 0.8 },
      ],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxBasisModeOrder: 4,
        maxVisibleModeCount: 2,
      },
    );

    expect(readModeKeys(result.descriptorSource)).toEqual(["1:1:1"]);
    expect(result.diagnostics.tailModeKeys).toEqual(["9:1:1"]);
  });

  it("admits finite-bandwidth structural modes before louder high-order detail", () => {
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

    expect(readModeKeys(result.descriptorSource)).toEqual(["2:1:1", "3:1:1"]);
    expect(result.diagnostics.tailModeKeys).toContain("18:18:18");
  });

  it("does not admit loud high-order detail solely because slots are free", () => {
    const state = createModalFieldContinuityState();
    const result = update(
      state,
      [{ mode: [18, 18, 18], coefficient: 0.95, observedSupport: 0.95 }],
      {
        deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
        maxVisibleModeCount: 2,
      },
    );

    expect(result.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(result.diagnostics.admittedModeKeys).toEqual([]);
    expect(result.diagnostics.tailModeKeys).toEqual(["18:18:18"]);
  });

  it("lets sustained structural candidates replace active upper-band detail", () => {
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

    expect(readModeKeys(evicting.descriptorSource)).toEqual(["4:4:4", "2:1:1"]);
    expect(evicting.diagnostics.evictingModeKeys).toEqual(["4:4:4"]);

    const replaced = update(state, [detail, structural], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 1,
    });

    expect(readModeKeys(replaced.descriptorSource)).toEqual(["2:1:1"]);
    expect(replaced.diagnostics.removedModeKeys).toEqual(["4:4:4"]);
    expect(replaced.diagnostics.admittedModeKeys).toEqual([]);
  });

  it("does not let loud high-order detail evict structural topology", () => {
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

    expect(readModeKeys(retained.descriptorSource)).toEqual(["2:1:1"]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
    expect(retained.diagnostics.admittedModeKeys).toEqual([]);
    expect(retained.diagnostics.tailModeKeys).toContain("18:18:18");
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

  it("does not replace releasing structural pages with unrepresentable detail", () => {
    const state = createModalFieldContinuityState();
    const structural = {
      mode: [1, 1, 1],
      coefficient: 0.12,
      observedSupport: 1,
    };
    const unrepresentableDetail = {
      mode: [9, 9, 9],
      coefficient: 0.95,
      observedSupport: 1,
    };

    const initial = update(state, [structural], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxBasisModeOrder: 4,
      maxVisibleModeCount: 1,
    });
    expect(readModeKeys(initial.descriptorSource)).toEqual(["1:1:1"]);

    update(state, [unrepresentableDetail], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxBasisModeOrder: 4,
      maxVisibleModeCount: 1,
    });
    const retained = update(state, [unrepresentableDetail], {
      deltaTimeSec: BASIS_REASSIGN_MIN_SECONDS,
      maxBasisModeOrder: 4,
      maxVisibleModeCount: 1,
    });

    expect(readModeKeys(retained.descriptorSource)).toEqual(["1:1:1"]);
    expect(retained.diagnostics.removedModeKeys).toEqual([]);
    expect(retained.diagnostics.admittedModeKeys).toEqual([]);
    expect(retained.diagnostics.tailModeKeys).toContain("9:9:9");
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
    expect(phaseOnly.diagnostics.tailModeKeys).toEqual(["1:1:1"]);

    const rankingState = createModalFieldContinuityState();
    const ranked = update(
      rankingState,
      [
        { mode: [2, 1, 1], coefficient: 0.3, phaseAuthority: 0 },
        {
          mode: [1, 2, 1],
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

    expect(readModeKeys(ranked.descriptorSource)).toEqual(["2:1:1"]);
    expect(ranked.diagnostics.tailModeKeys).toEqual(["1:2:1"]);
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

    // Qualify the newcomer, then let the reassign window open.
    update(state, [resident, newcomer], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
    });
    const admitted = update(state, [resident, newcomer], {
      deltaTimeSec: BASIS_REASSIGN_MIN_SECONDS,
    });

    // Wait — the newcomer may have been admitted on the qualifying update if
    // the window was already open; find the first output that includes it.
    const source = readModeKeys(admitted.descriptorSource).includes("2:1:1")
      ? admitted.descriptorSource
      : update(state, [resident, newcomer], { deltaTimeSec: DT })
          .descriptorSource;
    const partial = readCoefficient(source, "2:1:1");
    expect(partial).not.toBeNull();
    expect(partial).toBeLessThan(0.5);
    expect(readCoefficient(source, "1:1:1")).toBeCloseTo(0.4, 6);

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

    expect(readModeKeys(handoff.descriptorSource)).toEqual([
      "1:1:1",
      "2:1:1",
    ]);
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
    expect(bounded.descriptorSource.activeModalFieldModeCount).toBeLessThanOrEqual(
      2,
    );
    expect(readModeKeys(bounded.descriptorSource)).not.toContain("3:1:1");
  });

  it("derives eviction windows from damping metadata and admits a successor when capacity frees", () => {
    const state = createModalFieldContinuityState();
    // Low-frequency high-Q metadata gives tau = Q / (pi * f), which clamps to
    // the bookkeeping max (0.25s), longer than the metadata-free fallback.
    const ringing = {
      mode: [1, 1, 1],
      coefficient: 0.3,
      observedSupport: 1,
      naturalFrequencyHz: 40,
      qualityFactor: 100,
    };
    const resident = { mode: [2, 1, 1], coefficient: 0.8, observedSupport: 1 };
    const residentQuiet = {
      ...resident,
      coefficient: 0.005,
      observedSupport: 0.01,
    };
    const strong = { mode: [3, 1, 1], coefficient: 0.9, observedSupport: 1 };

    update(state, [ringing, resident], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      maxVisibleModeCount: 2,
    });

    // Full budget: the strong candidate evicts the weakest page, which fades
    // on its own (clamped) ring-down window instead of the default one.
    const evicting = update(state, [ringing, resident, strong], {
      deltaTimeSec: BASIS_REASSIGN_MIN_SECONDS,
      maxVisibleModeCount: 2,
    });
    expect(evicting.diagnostics.evictingModeKeys).toEqual(["1:1:1"]);

    // After the metadata-free fallback window, the ringing page must still be
    // fading.
    const pastFallback = update(state, [ringing, residentQuiet, strong], {
      deltaTimeSec: TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 2,
    });
    expect(readModeKeys(pastFallback.descriptorSource)).toContain("1:1:1");

    // The resident releases through low evidence, freeing a slot; the
    // successor is admitted while the evicted page is still ringing down.
    const releasing = update(state, [ringing, residentQuiet, strong], {
      deltaTimeSec: TOPOLOGY_RELEASE_SECONDS - TOPOLOGY_EVICTION_FADE_SECONDS,
      maxVisibleModeCount: 2,
    });
    const overlap = releasing.diagnostics.admittedModeKeys.includes("3:1:1")
      ? releasing
      : update(state, [ringing, residentQuiet, strong], {
          deltaTimeSec: BASIS_REASSIGN_MIN_SECONDS,
          maxVisibleModeCount: 2,
        });

    const overlapKeys = readModeKeys(overlap.descriptorSource);
    expect(overlapKeys).toContain("1:1:1");
    expect(overlapKeys).toContain("3:1:1");
    expect(overlap.diagnostics.evictingModeKeys).toEqual(["1:1:1"]);
    const fadingOut = readCoefficient(overlap.descriptorSource, "1:1:1");
    expect(fadingOut).toBeGreaterThan(0);
    expect(fadingOut).toBeLessThan(0.3);
    expect(
      overlap.descriptorSource.activeModalFieldModeCount,
    ).toBeLessThanOrEqual(2);
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

  it("passes through current coefficient, phase, color, and metadata payloads", () => {
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
          colorR: 0.2,
          colorG: 0.3,
          colorB: 0.4,
          colorWeight: 0.5,
          naturalFrequencyHz: 220,
          qualityFactor: 8,
          dampingRatio: 0.125,
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
        colorR: 0.6,
        colorG: 0.7,
        colorB: 0.8,
        colorWeight: 0.9,
        naturalFrequencyHz: 440,
        qualityFactor: 16,
        dampingRatio: 0.0625,
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
    expect(Array.from(current.descriptorSource.modalFieldColorSlots)).toEqual([
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
      expect.closeTo(0.0625, 6),
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

  it("clears admission state only on an explicit reset token change", () => {
    const state = createModalFieldContinuityState();
    const active = { mode: [7, 1, 1], coefficient: 0.5 };
    update(state, [active], {
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS,
      resetToken: "session-a",
    });

    const reset = update(state, [active], {
      deltaTimeSec: DT,
      resetToken: "session-b",
    });
    expect(reset.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(reset.diagnostics.reset).toBe(true);
  });

  it("does not let downstream acknowledgements or diagnostics promote topology", () => {
    const state = createModalFieldContinuityState();
    const candidate = { mode: [8, 1, 1], coefficient: 0.4 };

    const result = updateModalFieldContinuity(state, {
      descriptorSource: makeDescriptorSource([candidate]),
      deltaTimeSec: TOPOLOGY_PROMOTE_SECONDS - 0.001,
      resetToken: "session",
      renderAuthority: true,
      cacheRebuildAcknowledged: true,
      renderAcknowledged: true,
      modeIdentityRetentionRatio: 1,
      modalBasisCacheDescriptorFresh: true,
    });

    expect(result.descriptorSource.activeModalFieldModeCount).toBe(0);
    expect(result.diagnostics.admittedModeKeys).toEqual([]);
    expect(result.diagnostics.tailModeKeys).toEqual(["8:1:1"]);
  });
});
