import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import {
  CARRIER_COLUMN_DENSITY_MIN_SCALE,
  CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER,
  HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED,
  HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN,
  HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_STEP_INDEX,
  LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION,
  LASER_CAUSTIC_ACCENT_GAIN_SEED,
  LASER_CAUSTIC_COMPRESSION_KNEE_SEED,
  LASER_ENERGY_CORE_SATURATION_MIX,
  LASER_ENERGY_FRESNEL_EMISSION_GAIN,
  LASER_ENERGY_INTRINSIC_EMISSION_GAIN,
  OBSERVATION_DENSITY_CALIBRATION_SCALE,
  OBSERVATION_TRANSFER_REFERENCE,
  REFERENCE_ABSORPTION_COEFFICIENT,
  REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT,
  REFERENCE_SCATTERING_COEFFICIENT,
  deriveAcousticEnergyMaterialTransfer,
  deriveBoundedCausticAccentAuthority,
  deriveCarrierColumnDensityScale,
  deriveObservationTransfer,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import { deriveStepCompensation } from "./stepStability.js";

function referenceParameterInputs(overrides = {}) {
  return {
    stepCompensation: deriveStepCompensation(RAYMARCH_DEFAULTS.raymarchSteps),
    contourSharpness: RAYMARCH_DEFAULTS.contourSharpness,
    ...overrides,
  };
}

function deriveReferenceParameters(overrides = {}) {
  return deriveObservationTransferParameters(
    referenceParameterInputs(overrides),
  );
}

describe("observation transfer", () => {
  it("maps zero detector-integrated energy to zero optical material", () => {
    const transfer = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0,
      coreDensity: 0.776,
      sheathDensity: 0.024,
      materialColor: [0.2, 0.6, 1],
      laserIrradiance: 7,
      laserTransportReady: true,
    });

    expect(transfer.organizedCoreDensity).toBe(0);
    expect(transfer.organizedSheathDensity).toBe(0);
    expect(transfer.organizedDensity).toBe(0);
    expect(transfer.emissionSourceStrength).toBe(0);
    expect(transfer.sigmaS).toBe(0);
    expect(transfer.sigmaA).toBe(0);
    expect(transfer.extinction).toBe(0);
    expect(transfer.sourceRadiance).toEqual([0, 0, 0]);
  });

  it("is linear and invariant for equal organized acoustic energy", () => {
    const denseQuiet = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.4,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialColor: [0.3, 0.6, 0.9],
    });
    const sparseLoud = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 1,
      coreDensity: 0.194,
      sheathDensity: 0.006,
      materialColor: [0.3, 0.6, 0.9],
    });
    const doubledEnergy = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.8,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialColor: [0.3, 0.6, 0.9],
    });

    expect(denseQuiet.organizedDensity).toBeCloseTo(0.2);
    expect(sparseLoud.organizedDensity).toBeCloseTo(0.2);
    expect(sparseLoud.sigmaS).toBeCloseTo(denseQuiet.sigmaS);
    expect(sparseLoud.sigmaA).toBeCloseTo(denseQuiet.sigmaA);
    expect(sparseLoud.extinction).toBeCloseTo(denseQuiet.extinction);
    expect(sparseLoud.emissionSourceStrength).toBeCloseTo(
      denseQuiet.emissionSourceStrength,
    );
    expect(sparseLoud.sourceRadiance).toEqual(denseQuiet.sourceRadiance);
    expect(doubledEnergy.organizedDensity).toBeCloseTo(
      denseQuiet.organizedDensity * 2,
    );
    expect(doubledEnergy.sigmaS).toBeCloseTo(denseQuiet.sigmaS * 2);
    expect(doubledEnergy.sigmaA).toBeCloseTo(denseQuiet.sigmaA * 2);
    expect(doubledEnergy.extinction).toBeCloseTo(denseQuiet.extinction * 2);
    expect(doubledEnergy.emissionSourceStrength).toBeCloseTo(
      denseQuiet.emissionSourceStrength * 2,
    );
    expect(doubledEnergy.sourceRadiance[2]).toBeCloseTo(
      denseQuiet.sourceRadiance[2] * 2,
    );
  });

  it("keeps content at or below the reference wavenumber at the calibrated scale", () => {
    expect(deriveCarrierColumnDensityScale(0)).toBe(1);
    expect(deriveCarrierColumnDensityScale(Math.sqrt(3))).toBe(1);
    expect(
      deriveCarrierColumnDensityScale(
        CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER,
      ),
    ).toBe(1);
    expect(deriveCarrierColumnDensityScale(Number.NaN)).toBe(1);
    expect(deriveCarrierColumnDensityScale(undefined)).toBe(1);
  });

  it("normalizes denser spectral content as reference over RMS wavenumber", () => {
    expect(
      deriveCarrierColumnDensityScale(
        CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER * 2,
      ),
    ).toBeCloseTo(0.5, 6);
    expect(
      deriveCarrierColumnDensityScale(
        CARRIER_COLUMN_DENSITY_REFERENCE_WAVENUMBER * 4,
      ),
    ).toBeCloseTo(0.25, 6);
    expect(deriveCarrierColumnDensityScale(1e9)).toBe(
      CARRIER_COLUMN_DENSITY_MIN_SCALE,
    );
  });

  it("scales emission and extinction together so the source function is invariant", () => {
    const inputs = {
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialColor: [0.2, 0.5, 1],
      holographicBaseRadianceGain: 1,
    };
    const baseline = deriveAcousticEnergyMaterialTransfer(inputs);
    const normalized = deriveAcousticEnergyMaterialTransfer({
      ...inputs,
      carrierColumnDensityScale: 0.25,
    });

    expect(normalized.carrierColumnDensityScale).toBe(0.25);
    expect(normalized.organizedDensity).toBeCloseTo(
      baseline.organizedDensity * 0.25,
    );
    expect(normalized.extinction).toBeCloseTo(baseline.extinction * 0.25);
    expect(normalized.emissionSourceStrength).toBeCloseTo(
      baseline.emissionSourceStrength * 0.25,
    );
    expect(normalized.baseRadiance[2]).toBeCloseTo(
      baseline.baseRadiance[2] * 0.25,
    );
    expect(normalized.baseRadiance[2] / normalized.extinction).toBeCloseTo(
      baseline.baseRadiance[2] / baseline.extinction,
    );
  });

  it("bounds the column-density scale to [0, 1] and fails closed to one", () => {
    const inputs = {
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialColor: [0.2, 0.5, 1],
    };
    const baseline = deriveAcousticEnergyMaterialTransfer(inputs);
    const amplified = deriveAcousticEnergyMaterialTransfer({
      ...inputs,
      carrierColumnDensityScale: 4,
    });
    const negated = deriveAcousticEnergyMaterialTransfer({
      ...inputs,
      carrierColumnDensityScale: -2,
    });
    const invalid = deriveAcousticEnergyMaterialTransfer({
      ...inputs,
      carrierColumnDensityScale: Number.NaN,
    });

    expect(amplified.carrierColumnDensityScale).toBe(1);
    expect(amplified.organizedDensity).toBeCloseTo(baseline.organizedDensity);
    expect(negated.carrierColumnDensityScale).toBe(0);
    expect(negated.organizedDensity).toBe(0);
    expect(invalid.carrierColumnDensityScale).toBe(1);
    expect(invalid.organizedDensity).toBeCloseTo(baseline.organizedDensity);
  });

  it("accounts for scattering and absorption as additive extinction", () => {
    const transfer = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.4,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialColor: [1, 1, 1],
      scatteringCoefficient: 0.16,
      absorptionCoefficient: 0.04,
    });

    expect(transfer.organizedDensity).toBeCloseTo(0.2);
    expect(transfer.sigmaS).toBeCloseTo(0.032);
    expect(transfer.sigmaA).toBeCloseTo(0.008);
    expect(transfer.extinction).toBeCloseTo(0.04);
    expect(transfer.extinction).toBeCloseTo(transfer.sigmaS + transfer.sigmaA);
  });

  it("applies material density once before fixed optical coefficients", () => {
    const baseline = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialDensityScale: 1,
      materialColor: [0.2, 0.5, 1],
      holographicBaseRadianceGain: 1,
    });
    const doubled = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.485,
      sheathDensity: 0.015,
      materialDensityScale: 2,
      materialColor: [0.2, 0.5, 1],
      holographicBaseRadianceGain: 1,
    });

    expect(doubled.organizedDensity).toBeCloseTo(baseline.organizedDensity * 2);
    expect(doubled.sigmaS).toBeCloseTo(baseline.sigmaS * 2);
    expect(doubled.sigmaA).toBeCloseTo(baseline.sigmaA * 2);
    expect(doubled.emissionSourceStrength).toBeCloseTo(
      baseline.emissionSourceStrength * 2,
    );
    expect(doubled.sourceRadiance[2]).toBeCloseTo(
      baseline.sourceRadiance[2] * 2,
    );
  });

  it("combines a white-hot narrow core with the chromatic sheath", () => {
    const transfer = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.2, 0.5, 1],
      scatteringCoefficient: 0.3,
      laserExcitedEmissionCoefficient: 0.07,
      holographicBaseRadianceGain: 2.5,
    });

    expect(transfer.holographicFresnel).toBe(0);
    expect(transfer.coreEmissionColor[0]).toBeGreaterThan(0.2);
    expect(transfer.coreEmissionColor[1]).toBeGreaterThan(0.5);
    expect(transfer.coreEmissionColor[2]).toBe(1);
    expect(transfer.sourceRadiance).toEqual(
      transfer.intrinsicEmissionRadiance.map((channel) =>
        expect.closeTo(channel * LASER_ENERGY_INTRINSIC_EMISSION_GAIN * 2.5),
      ),
    );
    expect(transfer.sourceRadiance[2]).toBeGreaterThan(
      transfer.sourceRadiance[1],
    );
    expect(transfer.sourceRadiance[1]).toBeGreaterThan(
      transfer.sourceRadiance[0],
    );
  });

  it("keeps intrinsic emission independent of scattering and unrelated metadata", () => {
    const baseline = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.2, 0.5, 1],
      scatteringCoefficient: 0.1,
      laserExcitedEmissionCoefficient: 0.07,
      holographicBaseRadianceGain: 2.5,
    });
    const alteredExtinctionAndView = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.2, 0.5, 1],
      scatteringCoefficient: 0.9,
      laserExcitedEmissionCoefficient: 0.07,
      holographicBaseRadianceGain: 2.5,
      cameraDistance: 99,
    });

    expect(alteredExtinctionAndView.organizedDensity).toBe(
      baseline.organizedDensity,
    );
    expect(alteredExtinctionAndView.sigmaS).toBeGreaterThan(baseline.sigmaS);
    expect(alteredExtinctionAndView.extinction).toBeGreaterThan(
      baseline.extinction,
    );
    expect(alteredExtinctionAndView.emissionSourceStrength).toBe(
      baseline.emissionSourceStrength,
    );
    expect(alteredExtinctionAndView.sourceRadiance).toEqual(
      baseline.sourceRadiance,
    );
  });

  it("adds a bounded holographic Fresnel emission lane without changing extinction", () => {
    const faceOn = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.15, 0.7, 1],
      surfaceColor: [0.35, 0.95, 1],
      holographicIntensity: 1,
      holographicFresnelPower: 4.8,
      normalDotRay: 1,
      holographicBaseRadianceGain: 1,
    });
    const grazing = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.15, 0.7, 1],
      surfaceColor: [0.35, 0.95, 1],
      holographicIntensity: 1,
      holographicFresnelPower: 4.8,
      normalDotRay: 0.05,
      holographicBaseRadianceGain: 1,
    });

    expect(faceOn.holographicFresnel).toBe(0);
    expect(faceOn.fresnelEmissionSourceStrength).toBe(0);
    expect(grazing.holographicFresnel).toBeGreaterThan(0.7);
    expect(grazing.fresnelEmissionSourceStrength).toBeGreaterThan(
      grazing.emissionSourceStrength,
    );
    expect(grazing.baseRadiance[2]).toBeGreaterThan(faceOn.baseRadiance[2] * 2);
    expect(grazing.organizedDensity).toBe(faceOn.organizedDensity);
    expect(grazing.extinction).toBe(faceOn.extinction);
  });

  it("lets zero holographic intensity disable only the Fresnel lane", () => {
    const physicalInputs = {
      detectorIntegratedEnergy: 0.75,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.15, 0.7, 1],
      surfaceColor: [0.35, 0.95, 1],
      holographicIntensity: 0,
      holographicFresnelPower: 4.8,
      holographicBaseRadianceGain: 1,
    };
    const faceOn = deriveAcousticEnergyMaterialTransfer({
      ...physicalInputs,
      normalDotRay: 1,
    });
    const grazing = deriveAcousticEnergyMaterialTransfer({
      ...physicalInputs,
      normalDotRay: 0.05,
    });

    expect(grazing.fresnelBase).toBeGreaterThan(faceOn.fresnelBase);
    expect(grazing.holographicFresnel).toBe(0);
    expect(grazing.fresnelEmissionSourceStrength).toBe(0);
    expect(grazing.baseRadiance).toEqual(faceOn.baseRadiance);
  });

  it("keeps the holographic base independent of transport readiness", () => {
    const baseOnly = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.776,
      sheathDensity: 0.024,
      materialColor: [0.4, 0.7, 1],
      holographicBaseRadianceGain: 3,
      laserAccentAuthority: 0,
    });
    const pollutedByUnreadyTransport = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.776,
      sheathDensity: 0.024,
      materialColor: [0.4, 0.7, 1],
      holographicBaseRadianceGain: 3,
      laserAccentAuthority: 0,
      laserIrradiance: 99,
      laserTransportReady: true,
    });
    const accented = deriveAcousticEnergyMaterialTransfer({
      detectorIntegratedEnergy: 0.5,
      coreDensity: 0.776,
      sheathDensity: 0.024,
      materialColor: [0.4, 0.7, 1],
      holographicBaseRadianceGain: 3,
      laserAccentAuthority: 0.5,
    });

    expect(baseOnly.baseRadiance).toEqual(
      pollutedByUnreadyTransport.baseRadiance,
    );
    expect(baseOnly.accentRadiance).toEqual([0, 0, 0]);
    expect(pollutedByUnreadyTransport.accentRadiance).toEqual([0, 0, 0]);
    expect(accented.baseRadiance).toEqual(baseOnly.baseRadiance);
    expect(accented.extinction).toBe(baseOnly.extinction);
    expect(accented.accentRadiance[2]).toBeGreaterThan(0);
    expect(accented.accentRadiance[2] / accented.baseRadiance[2]).toBeCloseTo(
      0.1,
    );
  });

  it("derives a bounded readiness-gated accent from positive caustic excess", () => {
    const shadow = deriveBoundedCausticAccentAuthority({
      totalIrradiance: 0.4,
      zeroOrderIrradiance: 0.12,
      zeroOrderPowerFraction: 0.2,
      transportReady: 1,
    });
    const unready = deriveBoundedCausticAccentAuthority({
      totalIrradiance: 4,
      zeroOrderIrradiance: 0.12,
      zeroOrderPowerFraction: 0.2,
      transportReady: 0,
    });
    const moderate = deriveBoundedCausticAccentAuthority({
      totalIrradiance: 1.2,
      zeroOrderIrradiance: 0.12,
      zeroOrderPowerFraction: 0.2,
      transportReady: 1,
    });
    const concentrated = deriveBoundedCausticAccentAuthority({
      totalIrradiance: 4,
      zeroOrderIrradiance: 0.12,
      zeroOrderPowerFraction: 0.2,
      transportReady: 1,
    });

    expect(LASER_CAUSTIC_COMPRESSION_KNEE_SEED).toBe(0.1);
    expect(LASER_CAUSTIC_CONNECTED_RESPONSE_FRACTION).toBe(0.75);
    expect(shadow.attenuatedStraightReference).toBeCloseTo(0.6);
    expect(shadow.positiveCausticExcess).toBe(0);
    expect(shadow.accentAuthority).toBe(0);
    expect(unready.accentAuthority).toBe(0);
    expect(moderate.accentAuthority).toBeGreaterThan(0);
    expect(concentrated.accentAuthority).toBeGreaterThan(
      moderate.accentAuthority,
    );
    expect(concentrated.accentAuthority).toBeLessThan(1);
    expect(moderate.connectedPeakResponse).toBeGreaterThan(
      moderate.compressedCausticExcess ** 2,
    );
    expect(concentrated.connectedPeakResponse).toBeLessThan(
      concentrated.compressedCausticExcess,
    );
  });

  it("keeps visibility and projected-caustic controls outside material transfer", () => {
    const physicalInputs = {
      detectorIntegratedEnergy: 0.6,
      coreDensity: 0.388,
      sheathDensity: 0.012,
      materialColor: [0.25, 0.5, 1],
      laserIrradiance: 2,
      laserTransportReady: true,
    };
    const baseline = deriveAcousticEnergyMaterialTransfer(physicalInputs);
    const polluted = deriveAcousticEnergyMaterialTransfer({
      ...physicalInputs,
      projectedCausticRadianceDensity: 1,
      densityFloor: 100,
      visibilityGate: 0,
      pitch: 12000,
      beat: 1,
    });

    expect(polluted).toEqual(baseline);
  });

  it("publishes separate extinction and laser-excited emission coefficients", () => {
    expect(REFERENCE_SCATTERING_COEFFICIENT).toBe(0.16);
    expect(REFERENCE_ABSORPTION_COEFFICIENT).toBe(0.02);
    expect(REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT).toBe(0.05);
    expect(LASER_ENERGY_CORE_SATURATION_MIX).toBe(0.04);
    expect(LASER_ENERGY_INTRINSIC_EMISSION_GAIN).toBe(0.45);
    expect(LASER_ENERGY_FRESNEL_EMISSION_GAIN).toBe(3.2);
    expect(
      REFERENCE_SCATTERING_COEFFICIENT + REFERENCE_ABSORPTION_COEFFICIENT,
    ).toBeCloseTo(0.18);
  });

  it("mirrors the linear emission-extinction contract in the GPU owner", () => {
    const nodeSource = readFileSync(
      new URL("./observationTransferNode.js", import.meta.url),
      "utf8",
    );
    const materialOwner = nodeSource.slice(
      nodeSource.indexOf(
        "export function deriveAcousticEnergyMaterialTransferNode",
      ),
      nodeSource.indexOf(
        "// Acoustic energy material transfer node owner end.",
      ),
    );

    expect(materialOwner).toContain(
      "const organizedCoreDensity = safeCoreDensity",
    );
    expect(materialOwner).toContain(".mul(safeMaterialDensityScale)");
    expect(materialOwner).toContain(".mul(safeCarrierColumnDensityScale);");
    expect(materialOwner).toContain(
      "const organizedSheathDensity = safeSheathDensity",
    );
    expect(materialOwner).toContain(
      "const organizedDensity = organizedCoreDensity.add(organizedSheathDensity);",
    );
    expect(materialOwner).toContain(
      "const sigmaS = organizedDensity.mul(safeScatteringCoefficient);",
    );
    expect(materialOwner).toContain(
      "const sigmaA = organizedDensity.mul(safeAbsorptionCoefficient);",
    );
    expect(materialOwner).toContain("const extinction = sigmaS.add(sigmaA);");
    expect(materialOwner).toContain(
      "const emissionSourceStrength = organizedDensity.mul(",
    );
    expect(materialOwner).toContain(
      "sourceRadiance: baseRadiance.add(accentRadiance)",
    );
    expect(materialOwner).toContain("baseRadiance,");
    expect(materialOwner).toContain("accentRadiance,");
    expect(materialOwner).toContain("sourceRadiance:");
    expect(materialOwner).toContain("laserExcitedEmissionCoefficient");
    expect(materialOwner).toContain("normalDotRay");
    expect(materialOwner).toContain("holographicFresnel");
    expect(materialOwner).toContain("fresnelEmissionSourceStrength");
    expect(materialOwner).not.toContain("scatteringPhaseResponse");
    expect(materialOwner).not.toContain("incidentLaserIrradiance");
    expect(materialOwner).not.toContain("energyResponse");
    expect(materialOwner).not.toContain("exp(");
  });

  it("publishes calibration seeds without treating them as a selected gain", () => {
    expect(HOLOGRAPHIC_BASE_RADIANCE_CALIBRATION_SEED).toBe(2 ** -8);
    expect(HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_STEP_INDEX).toBe(17);
    expect(HOLOGRAPHIC_BASE_RADIANCE_LIVE_PREVIEW_GAIN).toBeCloseTo(Math.SQRT2);
    expect(LASER_CAUSTIC_ACCENT_GAIN_SEED).toBe(0.2);
    expect(OBSERVATION_TRANSFER_REFERENCE).not.toHaveProperty(
      "holographicBaseRadianceGain",
    );
  });

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

  it("calibrates the detector gate in unboosted structure-density units", () => {
    const parameters = deriveReferenceParameters({ fieldNoiseFloor: 0 });
    const outerStructure = deriveObservationTransfer({
      density: 0.06,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      signedRadianceAuthority: 1,
      modalCoefficientEnergy: 0,
      parameters,
    });

    // The former material path multiplied structure density by 4.6 before
    // this gate. Incident irradiance now owns that scale, so the detector
    // thresholds must be expressed in the unboosted density unit instead of
    // erasing the same low-density outer structure before light reaches it.
    expect(parameters.densityFadeStart).toBeLessThan(0.06);
    expect(parameters.densityFadeEnd).toBeGreaterThan(0.06);
    expect(outerStructure.physicalVisibilityGate).toBeGreaterThan(0);
    expect(outerStructure.physicalVisibleDensity).toBeGreaterThan(0);
  });

  it("publishes observationDensity as the canonical material-core density", () => {
    const transfer = deriveObservationTransfer({
      density: 0.28,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      signedRadianceAuthority: 1,
      modalCoefficientEnergy: 0.7,
      parameters: deriveReferenceParameters(),
    });

    expect(transfer.observationDensity).toBe(
      Math.max(transfer.physicalVisibleDensity, transfer.observedDensityFloor),
    );
    expect(transfer).not.toHaveProperty("visibleDensity");
  });

  it("keeps detector exposure independent of audio visibility drive", () => {
    const wellDriven = deriveReferenceParameters({ visibilityDrive: 1 });
    const weaklyDriven = deriveReferenceParameters({ visibilityDrive: 0.15 });
    const quiet = deriveReferenceParameters({ visibilityDrive: 0 });

    expect(weaklyDriven).toEqual(wellDriven);
    expect(quiet).toEqual(wellDriven);
    expect(OBSERVATION_TRANSFER_REFERENCE).not.toHaveProperty(
      "lowDriveVisibilityStart",
    );
    expect(OBSERVATION_TRANSFER_REFERENCE).not.toHaveProperty(
      "lowDriveVisibilityEnd",
    );
    expect(OBSERVATION_TRANSFER_REFERENCE).not.toHaveProperty(
      "maxLowDriveExposureBoost",
    );
  });

  it("lifts derived density thresholds above measured field baseline", () => {
    const referenceParameters = deriveReferenceParameters({
      fieldNoiseFloor: 0,
    });
    const noisyParameters = deriveReferenceParameters({
      fieldNoiseFloor: 0.2,
    });

    expect(noisyParameters.fieldNoiseFloor).toBeCloseTo(
      0.12 / OBSERVATION_DENSITY_CALIBRATION_SCALE,
    );
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
      }).observationDensity,
    ).toBeCloseTo(
      deriveObservationTransfer({
        ...physicalInputs,
        parameters: referenceParameters,
      }).observationDensity,
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
      modalStructureAnchor: 0.74,
      ridgeAnchor: 0.68,
      modalCoefficientEnergy: 0.11,
    });
    const noLocalAnchor = deriveObservationTransfer({
      density: 0.04,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.68,
      modalCoefficientEnergy: 0.11,
    });

    expect(OBSERVATION_TRANSFER_REFERENCE.densityFloor).toBeCloseTo(
      0.22 / OBSERVATION_DENSITY_CALIBRATION_SCALE,
    );
    expect(anchored.physicalVisibleDensity).toBeLessThan(0.001);
    expect(anchored.observationAnchor).toBeGreaterThan(0);
    expect(anchored.observationEnergy).toBeCloseTo(0.11);
    expect(anchored.observationSupport).toBeGreaterThan(0);
    expect(anchored.observedDensityFloor).toBeGreaterThan(
      anchored.physicalVisibleDensity,
    );
    expect(anchored.observationDensity).toBe(anchored.observedDensityFloor);
    expect(anchored.observedContourSupport).toBeGreaterThan(0);

    expect(noLocalAnchor.observationAnchor).toBe(0);
    expect(noLocalAnchor.observedDensityFloor).toBe(0);
    expect(noLocalAnchor.observedContourSupport).toBe(0);
    expect(noLocalAnchor.observationDensity).toBe(
      noLocalAnchor.physicalVisibleDensity,
    );
  });

  it("compresses quiet coherent modal response into a visible observation floor", () => {
    const quietCoherent = deriveObservationTransfer({
      density: 0.02,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.8,
      modalCoefficientEnergy: 0.05,
    });
    const noEnergy = deriveObservationTransfer({
      density: 0.02,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.8,
      modalCoefficientEnergy: 0,
    });

    expect(quietCoherent.observationEnergy).toBeCloseTo(0.05);
    expect(quietCoherent.observationResponse).toBeGreaterThan(
      quietCoherent.observationEnergy,
    );
    expect(quietCoherent.observationDensity).toBeGreaterThan(
      0.03 / OBSERVATION_DENSITY_CALIBRATION_SCALE,
    );
    expect(noEnergy.observationResponse).toBe(0);
    expect(noEnergy.observationDensity).toBe(0);
  });

  it("does not spend local modal support twice for full-energy ridges", () => {
    const parameters = deriveReferenceParameters();
    const fullAnchor = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalCoefficientEnergy: 1,
      parameters,
    });
    const narrowAnchor = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 0.36,
      ridgeAnchor: 0.36,
      modalCoefficientEnergy: 1,
      parameters,
    });

    expect(narrowAnchor.observationResponse).toBe(1);
    expect(narrowAnchor.observationSupport).toBeCloseTo(
      fullAnchor.observationSupport,
      6,
    );
    expect(narrowAnchor.observedDensityFloor).toBeCloseTo(
      fullAnchor.observedDensityFloor * narrowAnchor.observationAnchor,
      6,
    );
  });

  it("does not let support-only contours resurrect canceled signed fields", () => {
    const canceled = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 0.8,
      modalCoefficientEnergy: 1,
      signedRadianceAuthority: 0,
    });
    const physicalRidge = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 0.8,
      modalCoefficientEnergy: 1,
      signedRadianceAuthority: 1,
    });

    expect(canceled.observationAnchor).toBe(0);
    expect(canceled.observedDensityFloor).toBe(0);
    expect(canceled.observationDensity).toBe(0);
    expect(physicalRidge.observationAnchor).toBeGreaterThan(0);
    expect(physicalRidge.observationDensity).toBeGreaterThan(0);
  });

  it("does not let raw gradient resurrect support without a modal structure anchor", () => {
    const gradientOnly = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.72,
      modalCoefficientEnergy: 1,
      signedRadianceAuthority: 1,
    });
    const causticAnchored = deriveObservationTransfer({
      density: 0,
      fieldGradientMagnitude: 1,
      modalStructureAnchor: 1,
      ridgeAnchor: 0.72,
      modalCoefficientEnergy: 1,
      signedRadianceAuthority: 1,
    });

    expect(gradientOnly.observationAnchor).toBe(0);
    expect(gradientOnly.observedDensityFloor).toBe(0);
    expect(gradientOnly.observationDensity).toBe(0);
    expect(causticAnchored.observationAnchor).toBeGreaterThan(0);
    expect(causticAnchored.observationDensity).toBeGreaterThan(0);
  });

  it("keeps ridge contour authority out of observation density identity", () => {
    const lowRidge = deriveObservationTransfer({
      density: 0.02,
      modalStructureAnchor: 0.62,
      ridgeAnchor: 0.18,
      modalCoefficientEnergy: 0.22,
      signedRadianceAuthority: 0.9,
    });
    const highRidge = deriveObservationTransfer({
      density: 0.02,
      modalStructureAnchor: 0.62,
      ridgeAnchor: 0.94,
      modalCoefficientEnergy: 0.22,
      signedRadianceAuthority: 0.9,
    });

    expect(lowRidge.observationAnchor).toBeCloseTo(
      highRidge.observationAnchor,
      6,
    );
    expect(lowRidge.observedDensityFloor).toBeCloseTo(
      highRidge.observedDensityFloor,
      6,
    );
    expect(lowRidge.observedContourSupport).toBeLessThan(
      highRidge.observedContourSupport,
    );
  });

  it("gates observation density floors by signed radiance authority", () => {
    const reinforcing = deriveObservationTransfer({
      density: 0.03,
      modalStructureAnchor: 0.88,
      ridgeAnchor: 0.84,
      modalCoefficientEnergy: 0.46,
      signedRadianceAuthority: 1,
    });
    const canceling = deriveObservationTransfer({
      density: 0.03,
      modalStructureAnchor: 0.88,
      ridgeAnchor: 0.84,
      modalCoefficientEnergy: 0.46,
      signedRadianceAuthority: 0.24,
    });

    expect(reinforcing.observedDensityFloor).toBeGreaterThan(
      reinforcing.physicalVisibleDensity,
    );
    expect(canceling.observationAnchor).toBeLessThan(
      reinforcing.observationAnchor * 0.3,
    );
    expect(canceling.observationDensity).toBeLessThan(
      reinforcing.observationDensity * 0.35,
    );
    expect(canceling.observedContourSupport).toBeCloseTo(
      reinforcing.observedContourSupport *
        (canceling.observationAnchor / reinforcing.observationAnchor),
      6,
    );
  });

  it("gates observation contour support by the local signed spatial mask", () => {
    const strongAnchor = deriveObservationTransfer({
      density: 0.01,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.86,
      modalCoefficientEnergy: 0.4,
      signedRadianceAuthority: 1,
    });
    const weakSignedAnchor = deriveObservationTransfer({
      density: 0.01,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.86,
      modalCoefficientEnergy: 0.4,
      signedRadianceAuthority: 0.25,
    });
    const supportOnlyRidge = deriveObservationTransfer({
      density: 0.01,
      modalStructureAnchor: 0,
      ridgeAnchor: 0.86,
      modalCoefficientEnergy: 0.4,
      signedRadianceAuthority: 1,
    });

    expect(weakSignedAnchor.observationSupport).toBeCloseTo(
      strongAnchor.observationSupport,
      6,
    );
    expect(weakSignedAnchor.observedContourSupport).toBeCloseTo(
      strongAnchor.observedContourSupport *
        (weakSignedAnchor.observationAnchor / strongAnchor.observationAnchor),
      6,
    );
    expect(supportOnlyRidge.observedContourSupport).toBe(0);
  });

  it("observes retained modal energy instead of hard-silence flags", () => {
    const hardSilent = deriveObservationTransfer({
      density: 0.04,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.9,
      modalCoefficientEnergy: 0.2,
      hardSilence: true,
    });
    const noEnergy = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 0.9,
      ridgeAnchor: 0.9,
    });

    expect(hardSilent.observationEnergy).toBeCloseTo(0.2);
    expect(hardSilent.observationSupport).toBeGreaterThan(0);
    expect(hardSilent.observedDensityFloor).toBeGreaterThan(0);
    expect(hardSilent.observationDensity).toBeGreaterThan(
      hardSilent.physicalVisibleDensity,
    );
    expect(noEnergy.observationEnergy).toBe(0);
    expect(noEnergy.observationDensity).toBe(0);
  });

  it("keeps detector-integrated coefficient energy as the sole observation-energy input", () => {
    const phaseOnly = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      phaseCoherentFieldEnergy: 1,
    });
    const responseOnly = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalResponseEnergy: 0.28,
      phaseCoherentFieldEnergy: 1,
    });
    const detectorIntegrated = deriveObservationTransfer({
      density: 0,
      modalStructureAnchor: 1,
      ridgeAnchor: 1,
      modalCoefficientEnergy: 0.12,
      modalResponseEnergy: 1,
    });

    expect(phaseOnly.observationEnergy).toBe(0);
    expect(phaseOnly.observationSupport).toBe(0);
    expect(phaseOnly.observedDensityFloor).toBe(0);
    expect(phaseOnly.observedContourSupport).toBe(0);
    expect(phaseOnly.observationDensity).toBe(0);

    expect(responseOnly.observationEnergy).toBe(0);
    expect(responseOnly.observationSupport).toBe(0);
    expect(responseOnly.observationDensity).toBe(0);
    expect(detectorIntegrated.observationEnergy).toBeCloseTo(0.12);
    expect(detectorIntegrated.observationSupport).toBeGreaterThan(0);

    const cpuSource = readFileSync(
      new URL("./observationTransfer.js", import.meta.url),
      "utf8",
    );
    const nodeSource = readFileSync(
      new URL("./observationTransferNode.js", import.meta.url),
      "utf8",
    );
    expect(cpuSource).not.toContain("modalResponseEnergy");
    expect(nodeSource).not.toContain("modalResponseEnergy");
  });

  it("ignores presentation, color, beat, band, and performance fields", () => {
    const physicalInputs = {
      density: 0.08,
      modalStructureAnchor: 0.8,
      ridgeAnchor: 0.61,
      modalCoefficientEnergy: 0.13,
      phaseCoherentFieldEnergy: 0.2,
    };

    const baseline = deriveObservationTransfer(physicalInputs);
    const polluted = deriveObservationTransfer({
      ...physicalInputs,
      colorMode: "spectral",
      spectralMix: 1,
      spectralLightWeight: 0,
      bloomStrength: 1,
      bloomThreshold: 0,
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
