import { describe, expect, it } from "vitest";
import { deriveRaymarchDiagnosticVisibility } from "./diagnosticVisibility.js";
import { deriveObservationTransferParameters } from "./observationTransfer.js";

describe("deriveRaymarchDiagnosticVisibility", () => {
  it("does not report visible density from sub-threshold modal amplitude without support", () => {
    const parameters = deriveObservationTransferParameters();
    const hidden = deriveRaymarchDiagnosticVisibility({
      rawDensityEstimate: parameters.densityFadeStart * 0.5,
      observationAnchor: 0,
      signedRadianceAuthority: 0,
      modalCoefficientEnergy: 0.7,
      modalResponseEnergy: 0.7,
      opacityGain: 2.3,
      stepBudget: 80,
      spectralFlux: 0.2,
      parameters,
    });
    const supported = deriveRaymarchDiagnosticVisibility({
      rawDensityEstimate: parameters.densityFadeStart * 0.5,
      observationAnchor: 1,
      signedRadianceAuthority: 1,
      modalCoefficientEnergy: 0.7,
      modalResponseEnergy: 0.7,
      opacityGain: 2.3,
      stepBudget: 80,
      spectralFlux: 0.2,
      parameters,
    });

    expect(hidden.rawDensityEstimate).toBeGreaterThan(0);
    expect(hidden.avgDensity).toBe(0);
    expect(hidden.avgOpacity).toBe(0);
    expect(supported.avgDensity).toBeGreaterThan(0);
    expect(supported.avgOpacity).toBeGreaterThan(0);
  });

  it("applies signed cancellation authority before publishing average visible density", () => {
    const parameters = deriveObservationTransferParameters();
    const canceled = deriveRaymarchDiagnosticVisibility({
      rawDensityEstimate: parameters.densityFadeEnd * 1.5,
      observationAnchor: 1,
      signedRadianceAuthority: 0,
      modalCoefficientEnergy: 1,
      modalResponseEnergy: 1,
      opacityGain: 2.3,
      stepBudget: 80,
      parameters,
    });
    const reinforcing = deriveRaymarchDiagnosticVisibility({
      rawDensityEstimate: parameters.densityFadeEnd * 1.5,
      observationAnchor: 1,
      signedRadianceAuthority: 1,
      modalCoefficientEnergy: 1,
      modalResponseEnergy: 1,
      opacityGain: 2.3,
      stepBudget: 80,
      parameters,
    });

    expect(canceled.supportedPhysicalDensity).toBe(0);
    expect(canceled.avgDensity).toBe(0);
    expect(canceled.avgOpacity).toBe(0);
    expect(reinforcing.supportedPhysicalDensity).toBeGreaterThan(0);
    expect(reinforcing.avgDensity).toBeGreaterThan(0);
    expect(reinforcing.avgOpacity).toBeGreaterThan(0);
  });

  it("does not report lower modal density when opacity exposure increases", () => {
    const referenceParameters = deriveObservationTransferParameters({
      opacityGain: 2.3,
    });
    const highOpacityParameters = deriveObservationTransferParameters({
      opacityGain: 3,
    });
    const sharedInputs = {
      rawDensityEstimate: referenceParameters.densityFadeStart * 0.5,
      observationAnchor: 0.36,
      signedRadianceAuthority: 0.63,
      modalCoefficientEnergy: 1,
      modalResponseEnergy: 1,
      stepBudget: 80,
      parameters: referenceParameters,
    };
    const reference = deriveRaymarchDiagnosticVisibility({
      ...sharedInputs,
      opacityGain: 2.3,
    });
    const highOpacity = deriveRaymarchDiagnosticVisibility({
      ...sharedInputs,
      opacityGain: 3,
      parameters: highOpacityParameters,
    });

    expect(highOpacityParameters.densityFloor).toBeCloseTo(
      referenceParameters.densityFloor,
    );
    expect(highOpacity.avgDensity).toBeCloseTo(reference.avgDensity);
    expect(highOpacity.avgOpacity).toBeGreaterThan(reference.avgOpacity);
  });
});
