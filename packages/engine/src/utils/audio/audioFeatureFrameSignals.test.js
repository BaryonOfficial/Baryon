import { describe, expect, it } from "vitest";
import {
  composeAudioFeatureFrameSignals,
  createAudioFeatureCompositionState,
} from "./audioFeatureFrameSignals.js";
import { deriveAudioSourceNormalization } from "./audioFeatureSignals.js";

function createFrameSignalInputs(
  compositionState,
  { bandEnergies = new Float32Array([0.2, 0.1, 0.05, 0.02]) } = {},
) {
  const modeSlots = new Float32Array([0, 0, 1, 0.5]);
  return {
    compositionState,
    preparedInputs: {
      analysisSessionKey: "file:current",
      analysisInputMode: "file",
      capacity: 1,
      currentFrameAtMs: 1000,
    },
    analysisResult: {
      signalModeSlots: modeSlots,
      signalReferenceModeSlots: modeSlots,
      bandEnergies,
      analyserRms: 0.2,
      dominantAmplitude: 0.4,
      spectralCentroid: 0.2,
      spectralFlatness: 0.2,
      spectralFlux: 0.1,
      transientEnergy: 0.1,
      trebleBroadbandEnergy: 0.05,
      beatDetected: false,
      beatStrength: 0,
      beatConfidence: 0,
      beatOnsetDriver: 0,
      beatThreshold: 1,
      sourceNormalization: {
        normalizedRms: 0.4,
        normalizedCentroid: 0.2,
      },
      liveInputHardSilenceActive: false,
    },
    modalProjection: {
      allowsFeatureSignals: true,
      modalDescriptor: {
        counts: { modalFieldModeCount: 1 },
        slotViews: { modalFieldSlots: modeSlots },
      },
      energyLedger: { projectedRenderEnergy: 0.25 },
      modalObservationConfidence: 1,
      renderSources: { bandEnergies },
    },
    sourceCoupledState: { uniqueModeCount: 1, harmonicSupport: [1] },
    resonantState: { uniqueModeCount: 0, harmonicSupport: [] },
  };
}

describe("audio feature frame signals", () => {
  it("resets temporal history at the analysis-session boundary", () => {
    const freshState = createAudioFeatureCompositionState();
    const staleState = {
      analysisSessionKey: "file:previous",
      lastFrameAtMs: 990,
      signals: {
        structureSignal: 1,
        energySignal: 1,
        changeSignal: 1,
        pulseSignal: 1,
      },
      modalVisibilityEnergy: 1,
    };

    const expected = composeAudioFeatureFrameSignals(
      createFrameSignalInputs(freshState),
    );
    const actual = composeAudioFeatureFrameSignals(
      createFrameSignalInputs(staleState),
    );

    expect(actual).toMatchObject({
      structureSignal: expected.structureSignal,
      energySignal: expected.energySignal,
      changeSignal: expected.changeSignal,
      pulseSignal: expected.pulseSignal,
      modalVisibilityEnergy: expected.modalVisibilityEnergy,
    });
    expect(staleState.analysisSessionKey).toBe("file:current");
  });

  it("weights bass bands in the same direction as perceived A-weighting", () => {
    const sub = composeAudioFeatureFrameSignals(
      createFrameSignalInputs(null, {
        bandEnergies: new Float32Array([0.2, 0, 0, 0]),
      }),
    );
    const lowMid = composeAudioFeatureFrameSignals(
      createFrameSignalInputs(null, {
        bandEnergies: new Float32Array([0, 0.2, 0, 0]),
      }),
    );

    expect(sub.bassSalience).toBeGreaterThan(0);
    expect(sub.bassSalience).toBeLessThan(lowMid.bassSalience);
    expect(lowMid.bassSalience).toBeCloseTo(0.2, 6);
  });

  it("publishes one canonical source-level normalization", () => {
    const normalized = deriveAudioSourceNormalization({
      inputMode: "file",
      analyserRms: 0.2,
      spectralCentroid: 0.3,
      bandState: null,
    });

    expect(normalized.normalizedRms).toBeGreaterThan(0);
    expect(normalized).not.toHaveProperty("normalizedAmplitude");
  });
});
