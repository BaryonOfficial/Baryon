import { describe, expect, it } from "vitest";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  OBSERVATION_TRANSFER_REFERENCE,
  deriveObservationTransfer,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import { deriveStepCompensation } from "./stepStability.js";

function referenceParameterInputs(overrides = {}) {
  return {
    opacityGain: RAYMARCH_DEFAULTS.opacityGain,
    stepCompensation: deriveStepCompensation(RAYMARCH_DEFAULTS.raymarchSteps),
    contourSharpness: RAYMARCH_DEFAULTS.contourSharpness,
    ...overrides,
  };
}

function deriveReferenceParameters(overrides = {}) {
  return deriveObservationTransferParameters(referenceParameterInputs(overrides));
}

describe("observation transfer", () => {
  it("derives current reference parameters from default raymarch exposure", () => {
    const parameters = deriveReferenceParameters({ fieldNoiseFloor: 0 });

    expect(parameters.densityFadeStart).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.densityFadeStart,
    );
    expect(parameters.densityFadeEnd).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.densityFadeEnd,
    );
    expect(parameters.transferGain).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.transferGain,
    );
    expect(parameters.densityFloor).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.densityFloor,
    );
    expect(parameters.contourSupportScale).toBeCloseTo(
      OBSERVATION_TRANSFER_REFERENCE.contourSupportScale,
    );
    expect(parameters.exposureScale).toBeCloseTo(1);
    expect(parameters.fieldNoiseFloor).toBe(0);
  });

  it("derives exposure-sensitive thresholds without changing observation energy", () => {
    const referenceParameters = deriveReferenceParameters();
    const brighterParameters = deriveReferenceParameters({
      opacityGain: RAYMARCH_DEFAULTS.opacityGain * 1.6,
    });
    const physicalInputs = {
      density: 0.08,
      fieldGradientMagnitude: 0.46,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.61,
      modalCoefficientEnergy: 0.13,
      modalResponseBackboneEnergy: 0.21,
      modalResponseDetailEnergy: 0.04,
    };
    const referenceTransfer = deriveObservationTransfer({
      ...physicalInputs,
      parameters: referenceParameters,
    });
    const brighterTransfer = deriveObservationTransfer({
      ...physicalInputs,
      parameters: brighterParameters,
    });

    expect(brighterParameters.exposureScale).toBeGreaterThan(
      referenceParameters.exposureScale,
    );
    expect(brighterParameters.densityFadeStart).toBeLessThan(
      referenceParameters.densityFadeStart,
    );
    expect(brighterParameters.densityFloor).toBeLessThan(
      referenceParameters.densityFloor,
    );
    expect(brighterTransfer.observationEnergy).toBe(
      referenceTransfer.observationEnergy,
    );
  });

  it("lifts derived density thresholds above measured field baseline", () => {
    const referenceParameters = deriveReferenceParameters({
      fieldNoiseFloor: 0,
    });
    const noisyParameters = deriveReferenceParameters({
      fieldNoiseFloor: 0.2,
    });

    expect(noisyParameters.fieldNoiseFloor).toBe(0.12);
    expect(noisyParameters.densityFadeEnd).toBeGreaterThan(
      referenceParameters.densityFadeEnd,
    );
    expect(noisyParameters.densityFloor).toBeGreaterThan(
      referenceParameters.densityFloor,
    );
  });

  it("derives contour support from density floor and contour sharpness", () => {
    const referenceParameters = deriveReferenceParameters();
    const sharperParameters = deriveReferenceParameters({
      contourSharpness: RAYMARCH_DEFAULTS.contourSharpness * 2,
    });
    const physicalInputs = {
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalCoefficientEnergy: 0.4,
    };

    expect(sharperParameters.contourSupportScale).toBeLessThan(
      referenceParameters.contourSupportScale,
    );
    expect(
      deriveObservationTransfer({
        ...physicalInputs,
        parameters: sharperParameters,
      }).visibleDensity,
    ).toBeCloseTo(
      deriveObservationTransfer({
        ...physicalInputs,
        parameters: referenceParameters,
      }).visibleDensity,
    );
  });

  it("ignores presentation, color, beat, band, and performance fields when deriving parameters", () => {
    const physicalInputs = referenceParameterInputs({
      fieldNoiseFloor: 0.03,
    });

    expect(
      deriveObservationTransferParameters({
        ...physicalInputs,
        colorMode: "spectral",
        spectralMix: 1,
        bloomStrength: 1,
        bloomThreshold: 0,
        rimBloomBias: 1,
        beatDetected: true,
        beatPulse: 1,
        bandEnergies: [1, 1, 1, 1],
        bassSalience: 1,
        renderScale: 0.5,
        performancePressure: 1,
      }),
    ).toEqual(deriveObservationTransferParameters(physicalInputs));
  });

  it("exposes weak modal structure only where local modal anchors exist", () => {
    const anchored = deriveObservationTransfer({
      density: 0.04,
      fieldGradientMagnitude: 0.52,
      modalStructureAnchor: 0.74,
      ridgeAnchor: 0.68,
      modalCoefficientEnergy: 0.11,
      modalResponseBackboneEnergy: 0.19,
      modalResponseDetailEnergy: 0.03,
    });
    const noLocalAnchor = deriveObservationTransfer({
      density: 0.04,
      fieldGradientMagnitude: 0,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.68,
      modalCoefficientEnergy: 0.11,
      modalResponseBackboneEnergy: 0.19,
      modalResponseDetailEnergy: 0.03,
    });

    expect(OBSERVATION_TRANSFER_REFERENCE.densityFloor).toBeCloseTo(0.22);
    expect(anchored.physicalVisibleDensity).toBeLessThan(0.001);
    expect(anchored.observationAnchor).toBeGreaterThan(0);
    expect(anchored.observationEnergy).toBeCloseTo(0.19);
    expect(anchored.observationSupport).toBeGreaterThan(0);
    expect(anchored.observedDensityFloor).toBeGreaterThan(
      anchored.physicalVisibleDensity,
    );
    expect(anchored.visibleDensity).toBe(anchored.observedDensityFloor);
    expect(anchored.observedContourSupport).toBeGreaterThan(0);

    expect(noLocalAnchor.observationAnchor).toBe(0);
    expect(noLocalAnchor.observedDensityFloor).toBe(0);
    expect(noLocalAnchor.observedContourSupport).toBe(0);
    expect(noLocalAnchor.visibleDensity).toBe(
      noLocalAnchor.physicalVisibleDensity,
    );
  });

  it("observes retained modal energy instead of hard-silence flags", () => {
    const hardSilent = deriveObservationTransfer({
      density: 0.04,
      fieldGradientMagnitude: 0.9,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.9,
      modalCoefficientEnergy: 0.2,
      modalResponseBackboneEnergy: 0.3,
      hardSilence: true,
    });
    const noEnergy = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 0.9,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.9,
    });

    expect(hardSilent.observationEnergy).toBeCloseTo(0.3);
    expect(hardSilent.observationSupport).toBeGreaterThan(0);
    expect(hardSilent.observedDensityFloor).toBeGreaterThan(0);
    expect(hardSilent.visibleDensity).toBeGreaterThan(
      hardSilent.physicalVisibleDensity,
    );
    expect(noEnergy.observationEnergy).toBe(0);
    expect(noEnergy.visibleDensity).toBe(0);
  });

  it("does not let phase overlay author observation energy", () => {
    const phaseOnly = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalPhaseOverlayEnergy: 1,
    });
    const withModalResponse = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalCoefficientEnergy: 0.12,
      modalResponseBackboneEnergy: 0.28,
      modalResponseDetailEnergy: 0.04,
      modalPhaseOverlayEnergy: 1,
    });

    expect(phaseOnly.observationEnergy).toBe(0);
    expect(phaseOnly.observationSupport).toBe(0);
    expect(phaseOnly.observedDensityFloor).toBe(0);
    expect(phaseOnly.observedContourSupport).toBe(0);
    expect(phaseOnly.visibleDensity).toBe(0);

    expect(withModalResponse.observationEnergy).toBeCloseTo(0.28);
    expect(withModalResponse.observationSupport).toBeGreaterThan(0);
  });

  it("ignores presentation, color, beat, band, and performance fields", () => {
    const physicalInputs = {
      density: 0.08,
      fieldGradientMagnitude: 0.46,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.61,
      modalCoefficientEnergy: 0.13,
      modalResponseBackboneEnergy: 0.21,
      modalResponseDetailEnergy: 0.04,
      modalPhaseOverlayEnergy: 0.2,
    };

    const baseline = deriveObservationTransfer(physicalInputs);
    const polluted = deriveObservationTransfer({
      ...physicalInputs,
      colorMode: "spectral",
      spectralMix: 1,
      spectralLightWeight: 0,
      bloomStrength: 1,
      bloomThreshold: 0,
      rimBloomBias: 1,
      beatDetected: true,
      beatPulse: 1,
      beatConfidence: 1,
      bandEnergies: [1, 1, 1, 1],
      bassSalience: 1,
      spectralFlux: 1,
      spectralCentroid: 1,
      changeSignal: 1,
      performancePressure: 1,
      renderScale: 0.5,
      stepBudget: 16,
    });

    expect(polluted).toEqual(baseline);
  });

  it("does not expose old low-Q or retained high-Q visibility lanes", () => {
    const transfer = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalCoefficientEnergy: 0.4,
    });

    expect(transfer).not.toHaveProperty("lowQBackboneRidgeAnchor");
    expect(transfer).not.toHaveProperty("lowQBackboneStructureAnchor");
    expect(transfer).not.toHaveProperty("lowQBackboneRidgeLift");
    expect(transfer).not.toHaveProperty("lowQBackboneRidgeVisibleDensity");
    expect(transfer).not.toHaveProperty("lowQBackboneContourAccent");
    expect(transfer).not.toHaveProperty("retainedHighQRidgeAnchor");
    expect(transfer).not.toHaveProperty("retainedHighQStructureAnchor");
    expect(transfer).not.toHaveProperty("retainedHighQRidgeLift");
    expect(transfer).not.toHaveProperty("retainedHighQRidgeVisibleDensity");
    expect(transfer).not.toHaveProperty("retainedHighQContourAccent");
  });
});
