import { describe, expect, it } from "vitest";
import { createFastModalDriveEstimator } from "./fastModalDriveEstimator.js";
import {
  applyFastModalDriveToStructuralState,
  buildFastCommittedModes,
  buildFastCommittedModesFromTopology,
  restoreFastModalOscillatorState,
} from "./fastModalStructuralDrive.js";
import { normalizePhaseRad } from "./modalPhaseSlots.js";

function makeStructuralState() {
  return {
    candidateForcingSlotsSource: new Float32Array([1, 1, 1, 0.4]),
    candidateResponseSlotsSource: new Float32Array([2, 2, 2, 0.3]),
    proposalSourceCoupledSlotsSource: new Float32Array([1, 1, 1, 0.4]),
    proposalResonantSlotsSource: new Float32Array([2, 2, 2, 0.3]),
    sourceCoupledPhaseSlotsSource: new Float32Array(4),
    resonantPhaseSlotsSource: new Float32Array(4),
    activeSourceCoupledModeCount: 1,
    activeResonantModeCount: 1,
    structuralMetrics: {},
  };
}

function makeEntry(overrides) {
  return {
    qualityFactor: 12,
    couplingStrength: 1,
    phaseConfidence: 1,
    dampingEnvelope: 1,
    persistence: 1,
    modalResponseEnergy: 0.1,
    amplitude: Math.sqrt(0.1),
    modalOscillatorRotationRad: 0,
    modalOscillatorEnvelopeRe: Math.sqrt(0.1),
    modalOscillatorEnvelopeIm: 0,
    modalOscillatorDriveLockRe: 0,
    modalOscillatorDriveLockIm: 0,
    ...overrides,
  };
}

function makeExcitationState() {
  const first = makeEntry({
    modeKey: "1:1:1",
    u: 1,
    v: 1,
    w: 1,
    layer: "source-coupled",
    naturalFrequencyHz: 220,
    forcingEnergy: 0.8,
  });
  const second = makeEntry({
    modeKey: "2:2:2",
    u: 2,
    v: 2,
    w: 2,
    layer: "resonant",
    naturalFrequencyHz: 440,
    forcingEnergy: 0.2,
  });
  return {
    activeModes: new Map([
      [first.modeKey, first],
      [second.modeKey, second],
    ]),
    observedModes: new Map(),
    modalOscillatorStates: new Map([
      [first.modeKey, { ...first }],
      [second.modeKey, { ...second }],
    ]),
    modalCandidateState: new Map([
      [first.modeKey, first],
      [second.modeKey, second],
    ]),
  };
}

function makeTone(frequencyHz, sampleRate = 44100) {
  const samples = new Float32Array(2048);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] =
      Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate) * 0.5;
  }
  return samples;
}

describe("fast committed modal structural drive", () => {
  it("does not synthesize committed modes past the available slot tuples", () => {
    const structuralState = makeStructuralState();
    structuralState.candidateForcingSlotsSource = new Float32Array(0);
    structuralState.candidateResponseSlotsSource = new Float32Array(0);

    expect(
      buildFastCommittedModes(structuralState, makeExcitationState()),
    ).toEqual([]);
  });

  it("does not let zero continuity metadata erase a canonical modal frequency", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const modes = buildFastCommittedModesFromTopology(
      {
        activeModalFieldModeCount: 1,
        modalFieldSlots: new Float32Array([1, 1, 1, 0.4]),
        modalFieldMetadataSlots: new Float32Array([0, 0, 0, 0]),
      },
      structuralState,
      excitationState,
    );

    expect(modes[0]?.naturalFrequencyHz).toBe(220);
    expect(modes[0]?.qualityFactor).toBe(12);
  });

  it("prefers physical candidate forcing over observer metadata", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const candidate = {
      ...excitationState.modalCandidateState.get("1:1:1"),
      forcingEnergy: 0.37,
    };
    excitationState.activeModes.delete("1:1:1");
    excitationState.modalCandidateState.set("1:1:1", candidate);
    excitationState.observedModes.set("1:1:1", {
      modeKey: "1:1:1",
      u: 1,
      v: 1,
      w: 1,
      layer: "source-coupled",
      naturalFrequencyHz: 220,
      observationConfidence: 1,
    });

    const modes = buildFastCommittedModes(structuralState, excitationState);

    expect(modes.find((mode) => mode.modeKey === "1:1:1")?.targetEnergy).toBe(
      0.37,
    );
  });

  it("forces every committed mode while preserving committed identities", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
      probeModeIndices: new Uint16Array([0]),
    });
    const timeDomainData = makeTone(220);
    const exactDriveResult = estimator.evaluate(timeDomainData, 1, false);
    const identitiesBefore = [
      ...structuralState.candidateForcingSlotsSource.slice(0, 3),
      ...structuralState.candidateResponseSlotsSource.slice(0, 3),
    ];

    const response = applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult,
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0.35,
      hardSilence: false,
      coherence: 1,
      frameTimeMs: 16,
    });

    // Forcing is a modal transfer, so a mode responds whether or not a probe
    // was spent on it. The unprobed mode is driven well off its resonance and
    // answers weakly rather than not at all.
    expect(exactDriveResult.targetEnergyByMode[0]).toBeGreaterThan(0);
    expect(exactDriveResult.targetEnergyByMode[1]).toBeGreaterThan(0);
    expect(exactDriveResult.targetEnergyByMode[1]).toBeLessThan(
      exactDriveResult.targetEnergyByMode[0],
    );
    const drivenForcing = response.entries.find(
      (entry) => entry.modeKey === "1:1:1",
    )?.modalResponseDrive;
    const offResonanceForcing = response.entries.find(
      (entry) => entry.modeKey === "2:2:2",
    )?.modalResponseDrive;
    expect(drivenForcing).toBeGreaterThan(0);
    expect(offResonanceForcing).toBeGreaterThan(0);
    expect(offResonanceForcing).toBeLessThan(drivenForcing);
    expect([
      ...structuralState.candidateForcingSlotsSource.slice(0, 3),
      ...structuralState.candidateResponseSlotsSource.slice(0, 3),
    ]).toEqual(identitiesBefore);
    const projected = excitationState.activeModes.get("1:1:1");
    expect(projected.modalOscillatorPhaseOffsetRad).toBeCloseTo(
      normalizePhaseRad(
        projected.modalOscillatorPhaseRad -
          projected.modalOscillatorAngularVelocityRadPerSec * 0.016,
      ),
      6,
    );
  });

  it("advances physical decay under hard silence instead of clearing state", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
    });
    const timeDomainData = makeTone(220);
    const driven = estimator.evaluate(timeDomainData, 1, false);
    applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult: driven,
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0.35,
      hardSilence: false,
      coherence: 1,
      frameTimeMs: 16,
    });
    const drivenAmplitude = structuralState.candidateForcingSlotsSource[3];

    const silent = estimator.evaluate(timeDomainData, 0, true);
    applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult: silent,
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0,
      hardSilence: true,
      coherence: 0,
      frameTimeMs: 32,
    });
    const silentAmplitude = structuralState.candidateForcingSlotsSource[3];

    expect(silent.targetEnergyByMode.every((value) => value === 0)).toBe(true);
    expect(silentAmplitude).toBeGreaterThan(0);
    expect(silentAmplitude).toBeLessThan(drivenAmplitude);
  });

  it("reads oscillator history from its canonical state map", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const projectedMode = excitationState.activeModes.get("1:1:1");
    projectedMode.modalResponseEnergy = 0.9;
    projectedMode.modalOscillatorEnvelopeRe = Math.sqrt(0.9);
    excitationState.modalOscillatorStates.set(
      "1:1:1",
      makeEntry({
        modeKey: "1:1:1",
        modalResponseEnergy: 0.01,
        modalOscillatorEnvelopeRe: 0.1,
      }),
    );
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
    });
    const timeDomainData = makeTone(220);
    const response = applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult: estimator.evaluate(timeDomainData, 0, true),
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0,
      hardSilence: true,
      coherence: 0,
      frameTimeMs: 16,
    });
    const modeResponse = response.entries.find(
      (entry) => entry.modeKey === "1:1:1",
    );

    expect(modeResponse?.modalResponseEnergy).toBeGreaterThan(0);
    expect(modeResponse?.modalResponseEnergy).toBeLessThan(0.1);
    expect(excitationState.modalOscillatorStates.get("1:1:1")).not.toBe(
      excitationState.activeModes.get("1:1:1"),
    );
  });

  it("does not prune oscillator history outside the current fast commit", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const retainedHistory = makeEntry({
      modeKey: "3:3:3",
      layer: "resonant",
      naturalFrequencyHz: 660,
      modalResponseEnergy: 0.05,
    });
    excitationState.modalOscillatorStates.set("3:3:3", retainedHistory);
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
    });
    const timeDomainData = makeTone(220);

    applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult: estimator.evaluate(timeDomainData, 1, false),
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0.35,
      hardSilence: false,
      coherence: 1,
      frameTimeMs: 16,
    });

    expect(excitationState.modalOscillatorStates.get("3:3:3")).toBe(
      retainedHistory,
    );
  });

  it("does not write fast response state into observed measurements", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const observedMeasurement = {
      modeKey: "1:1:1",
      layer: "source-coupled",
      observationConfidence: 0.23,
      observationCount: 7,
    };
    excitationState.observedModes.set("1:1:1", observedMeasurement);
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
    });
    const timeDomainData = makeTone(220);

    applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult: estimator.evaluate(timeDomainData, 1, false),
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0.35,
      hardSilence: false,
      coherence: 1,
      frameTimeMs: 16,
    });

    expect(excitationState.observedModes.get("1:1:1")).toBe(
      observedMeasurement,
    );
  });

  it("does not restore oscillator history into observed measurements", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const observedMeasurement = {
      modeKey: "1:1:1",
      layer: "source-coupled",
      observationConfidence: 0.23,
      observationCount: 7,
    };
    excitationState.observedModes.set("1:1:1", observedMeasurement);
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );

    restoreFastModalOscillatorState({
      modalExcitationState: excitationState,
      committedModes,
      previousOscillatorState: new Map([
        ["1:1:1", { displayAmplitude: 0.2, modalResponseEnergy: 0.04 }],
      ]),
    });

    expect(excitationState.observedModes.get("1:1:1")).toBe(
      observedMeasurement,
    );
  });

  it("replaces stale structural forcing metrics with the silent fast result", () => {
    const structuralState = makeStructuralState();
    Object.assign(structuralState.structuralMetrics, {
      modalDriveEnergy: 0.91,
      modalResponseInputEnergy: 0.92,
      modalResponseCurrentSignalEnergy: 0.93,
      modalResponseSourceCoupledCurrentSignalEnergy: 0.94,
      modalResponseResonantCurrentSignalEnergy: 0.95,
      currentSignalEnergy: 0.96,
      currentSignalAmplitude: 0.97,
      modalResponseBudgetScale: 0.21,
      modalResponseBudgetScaleSourceCoupled: 0.22,
      modalResponseBudgetScaleResonant: 0.23,
      modalResponseRenderCapEnergy: 0.98,
      modalResponseCurrentRenderSourceEvidence: true,
      modalResponseFreshCouplingEvidence: true,
      modalResponseRenderPreviewEnergy: 0.81,
      modalResponseRenderEnergy: 0.82,
      modalResponseRenderPreviewSourceCoupledEnergy: 0.83,
      modalResponseRenderPreviewResonantEnergy: 0.84,
      modalResponseRenderSourceCoupledEnergy: 0.85,
      modalResponseRenderResonantEnergy: 0.86,
      modalResponseRenderPreviewRawEnergy: 0.87,
      modalResponseRenderRawEnergy: 0.88,
      modalResponseRenderPreviewLedger: {
        sourceEnergy: 0.89,
        projectedRenderEnergy: 0.9,
        renderAuthority: true,
      },
      energyLedger: {
        sourceEnergy: 0.89,
        projectedRenderEnergy: 0.9,
        renderAuthority: true,
      },
    });
    const excitationState = makeExcitationState();
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
    });
    const timeDomainData = makeTone(220);
    const exactDriveResult = estimator.evaluate(timeDomainData, 0, true);

    const response = applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult,
      fftLinearAmplitudes: new Float32Array(1024).fill(1),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0,
      hardSilence: true,
      coherence: 0,
      frameTimeMs: 16,
    });
    const metrics = structuralState.structuralMetrics;
    const currentSignalAndForcingMetrics = [
      metrics.modalDriveEnergy,
      metrics.modalResponseInputEnergy,
      metrics.modalResponseCurrentSignalEnergy,
      metrics.modalResponseSourceCoupledCurrentSignalEnergy,
      metrics.modalResponseResonantCurrentSignalEnergy,
      metrics.currentSignalEnergy,
      metrics.currentSignalAmplitude,
      metrics.modalResponseRenderPreviewEnergy,
      metrics.modalResponseRenderEnergy,
      metrics.modalResponseRenderPreviewSourceCoupledEnergy,
      metrics.modalResponseRenderPreviewResonantEnergy,
      metrics.modalResponseRenderSourceCoupledEnergy,
      metrics.modalResponseRenderResonantEnergy,
      metrics.modalResponseRenderPreviewRawEnergy,
      metrics.modalResponseRenderRawEnergy,
    ];

    expect(currentSignalAndForcingMetrics.every((value) => value === 0)).toBe(
      true,
    );
    expect(metrics).not.toHaveProperty("modalResponseRenderCapEnergy");
    expect(metrics.modalResponseCurrentRenderSourceEvidence).toBe(false);
    expect(metrics.modalResponseFreshCouplingEvidence).toBe(false);
    expect(metrics.modalResponseBudgetScale).toBe(
      response.modalResponseBudgetScale,
    );
    expect(metrics.modalResponseBudgetScaleSourceCoupled).toBe(
      response.modalResponseBudgetScaleSourceCoupled,
    );
    expect(metrics.modalResponseBudgetScaleResonant).toBe(
      response.modalResponseBudgetScaleResonant,
    );
    expect(metrics.energyLedger).toBe(metrics.modalResponseRenderPreviewLedger);
    expect(metrics.energyLedger).toMatchObject({
      sourceBoundaryState: "muted",
      sourceEnergy: 0,
      currentSignalEnergy: 0,
      currentSignalAmplitude: 0,
      projectedRenderEnergy: 0,
      renderAuthority: false,
    });
    expect(metrics.energyLedger.storedModalEnergy).toBeGreaterThan(0);
    expect(response.modalResponseEnergy).toBeGreaterThan(0);
    expect(response.modalResponseEnergy).toBeLessThan(0.2);
  });

  it("maps exact drive evidence by committed mode instead of probe order", () => {
    const structuralState = makeStructuralState();
    const excitationState = makeExcitationState();
    const committedModes = buildFastCommittedModes(
      structuralState,
      excitationState,
    );
    const estimator = createFastModalDriveEstimator({
      committedModes,
      sampleRate: 44100,
      probeModeIndices: new Uint16Array([1]),
    });
    const timeDomainData = makeTone(440);
    const exactDriveResult = estimator.evaluate(timeDomainData, 1, false);

    const response = applyFastModalDriveToStructuralState({
      structuralState,
      modalExcitationState: excitationState,
      committedModes,
      exactDriveResult,
      fftLinearAmplitudes: new Float32Array(1024),
      timeDomainData,
      sampleRate: 44100,
      deltaMs: 16,
      inputRms: 0.35,
      hardSilence: false,
      coherence: 1,
      frameTimeMs: 16,
    });

    // The probed mode owns the resonant share; the unprobed one is still
    // forced off resonance, so identity is what separates them, not a zero.
    expect(exactDriveResult.responseEnergyByMode[1]).toBeGreaterThan(
      exactDriveResult.responseEnergyByMode[0],
    );
    const resonantForcing = response.entries.find(
      (entry) => entry.modeKey === "2:2:2",
    )?.modalResponseDrive;
    const offResonanceForcing = response.entries.find(
      (entry) => entry.modeKey === "1:1:1",
    )?.modalResponseDrive;
    expect(resonantForcing).toBeGreaterThan(0);
    expect(offResonanceForcing).toBeGreaterThan(0);
    expect(offResonanceForcing).toBeLessThan(resonantForcing);
  });
});
