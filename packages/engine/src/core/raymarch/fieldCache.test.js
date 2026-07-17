import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import { getModalGeometryBackend } from "../modalGeometryBackend.js";
import * as raymarchFieldCache from "./fieldCache.js";
import {
  buildRaymarchFieldCacheDescriptor as buildUnifiedRaymarchFieldCacheDescriptor,
  evaluateRaymarchSignedPotentialAtPoint as evaluateUnifiedRaymarchSignedPotentialAtPoint,
} from "./fieldCache.js";

function normalizeSource(value) {
  return value.replace(/\r\n/g, "\n");
}

function copySlotPrefix(slots, count) {
  const slotCount = Math.max(0, Math.round(count || 0));
  return Array.from(slots ?? new Float32Array(0)).slice(0, slotCount * 4);
}

function resolveModalFieldSlots(options) {
  if (options.modalFieldSlots) {
    return {
      modalFieldSlots: options.modalFieldSlots,
      modalFieldCount: options.modalFieldCount,
    };
  }

  return {
    modalFieldSlots: new Float32Array([
      ...copySlotPrefix(options.backboneSlots, options.backboneCount),
      ...copySlotPrefix(options.detailSlots, options.detailCount),
    ]),
    modalFieldCount:
      Math.max(0, Math.round(options.backboneCount || 0)) +
      Math.max(0, Math.round(options.detailCount || 0)),
  };
}

function resolveModalFieldPhaseSlots(options) {
  if (options.modalFieldPhaseSlots) {
    return options.modalFieldPhaseSlots;
  }

  return new Float32Array([
    ...copySlotPrefix(options.backbonePhaseSlots, options.backboneCount),
    ...copySlotPrefix(options.detailPhaseSlots, options.detailCount),
  ]);
}

function buildRaymarchFieldCacheDescriptor(options) {
  return buildUnifiedRaymarchFieldCacheDescriptor({
    ...options,
    ...resolveModalFieldSlots(options),
  });
}

function evaluateRaymarchSignedPotentialAtPoint(options) {
  return evaluateUnifiedRaymarchSignedPotentialAtPoint({
    ...options,
    ...resolveModalFieldSlots(options),
  });
}

function buildRaymarchModalBasisCacheDescriptor(options) {
  return raymarchFieldCache.buildRaymarchModalBasisCacheDescriptor({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldPhaseSlots: resolveModalFieldPhaseSlots(options),
  });
}

function buildModalBasisAuditDiagnostics(options) {
  return raymarchFieldCache.buildModalBasisAuditDiagnostics({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldPhaseSlots: resolveModalFieldPhaseSlots(options),
  });
}

function evaluateRaymarchLiveSynthesisFieldPoint(options) {
  return raymarchFieldCache.evaluateRaymarchLiveSynthesisFieldPoint({
    ...options,
    ...resolveModalFieldSlots(options),
    modalFieldPhaseSlots: resolveModalFieldPhaseSlots(options),
  });
}

describe("live synthesis cancellation ratio", () => {
  it("returns zero when unsigned support is below the energy epsilon", () => {
    expect(raymarchFieldCache.deriveLiveSynthesisCancellationRatio(0, 0)).toBe(
      0,
    );
    expect(
      raymarchFieldCache.deriveLiveSynthesisCancellationRatio(0, 0.001),
    ).toBe(0);
  });

  it("returns high cancellation for destructive interference with support", () => {
    expect(
      raymarchFieldCache.deriveLiveSynthesisCancellationRatio(0.01, 1),
    ).toBeCloseTo(0.99, 2);
  });

  it("reports zero cancellation ratio on silent live-synthesis probes", () => {
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: new Float32Array(0),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array(0),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 0,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
    });

    expect(sample.cancellationRatio).toBe(0);
    expect(sample.unsignedSupport).toBeLessThan(
      raymarchFieldCache.MODAL_BASIS_CACHE_ENERGY_EPSILON,
    );
  });
});

describe("detector-integrated coherent modal energy", () => {
  it("precomputes detector pair weights once per frame", () => {
    const target = new Float32Array(2 * 2 * 4);

    raymarchFieldCache.writeDetectorPairIntegrationWeights({
      target,
      capacity: 2,
      activeCount: 2,
      phaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      metadataSlots: new Float32Array([440, 0, 0, 0, 470, 0, 0, 0]),
      phaseEvaluationTimeSec: 0,
      integrationTimeSec: 1 / 60,
    });

    const pairOffset = (0 * 2 + 1) * 4;
    expect(target[pairOffset]).toBeCloseTo(-4 / Math.PI, 6);
    expect(target[pairOffset + 1]).toBeCloseTo(4 / Math.PI, 6);
  });

  it("preserves incoherent residual energy when phase authority is partial", () => {
    const result = raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
      structuralContributions: [0.5, 0.5],
      phaseWeights: [0.5, 0.5],
      phases: [0, Math.PI],
      frequenciesHz: [440, 440],
    });

    expect(result.detectorIntegratedCoherentEnergy).toBeCloseTo(0);
    expect(result.incoherentResidualEnergy).toBeCloseTo(0.375);
    expect(result.detectorIntegratedEnergy).toBeCloseTo(0.375);
    expect(result.detectorIntegratedSpatialEnergy).toBeCloseTo(0.75);
  });

  it("preserves full destructive cancellation at equal frequency", () => {
    const result = raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
      structuralContributions: [0.5, 0.5],
      phaseWeights: [1, 1],
      phases: [0, Math.PI],
      frequenciesHz: [440, 440],
    });

    expect(result.detectorIntegratedCoherentEnergy).toBeCloseTo(0);
    expect(result.incoherentResidualEnergy).toBeCloseTo(0);
    expect(result.detectorIntegratedEnergy).toBeCloseTo(0);
    expect(result.detectorIntegratedSpatialEnergy).toBeCloseTo(0);
  });

  it("integrates cross-frequency cancellation over the detector shutter", () => {
    const orthogonal = raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
      structuralContributions: [0.5, 0.5],
      phaseWeights: [1, 1],
      phases: [0, Math.PI],
      frequenciesHz: [440, 500],
      integrationTimeSec: 1 / 60,
    });
    const partial = raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
      structuralContributions: [0.5, 0.5],
      phaseWeights: [1, 1],
      phases: [0, Math.PI],
      frequenciesHz: [440, 470],
      integrationTimeSec: 1 / 60,
    });

    expect(orthogonal.detectorIntegratedCoherentEnergy).toBeCloseTo(0.5, 12);
    expect(orthogonal.detectorIntegratedEnergy).toBeCloseTo(0.5, 12);
    expect(partial.detectorIntegratedCoherentEnergy).toBeCloseTo(
      0.5 - 1 / Math.PI,
      12,
    );
  });

  it("keeps spatial energy separate from the global modal-energy envelope", () => {
    const quiet = raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
      structuralContributions: [0.2, 0.2],
      phaseWeights: [1, 1],
      phases: [0, 0],
      frequenciesHz: [440, 440],
      modalEnergyReference: 1,
    });
    const louderAtFixedReference =
      raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
        structuralContributions: [0.4, 0.4],
        phaseWeights: [1, 1],
        phases: [0, 0],
        frequenciesHz: [440, 440],
        modalEnergyReference: 1,
      });
    const globallyScaled =
      raymarchFieldCache.deriveDetectorIntegratedModalEnergy({
        structuralContributions: [0.4, 0.4],
        phaseWeights: [1, 1],
        phases: [0, 0],
        frequenciesHz: [440, 440],
        modalEnergyReference: 4,
      });

    expect(louderAtFixedReference.detectorIntegratedSpatialEnergy).toBeCloseTo(
      quiet.detectorIntegratedSpatialEnergy * 4,
      12,
    );
    expect(globallyScaled.detectorIntegratedSpatialEnergy).toBeCloseTo(
      quiet.detectorIntegratedSpatialEnergy,
      12,
    );
  });
});

describe("phase-aware signed live field", () => {
  it("applies the owned rotating phase to field and gradient while keeping support unsigned", () => {
    const sampleOptions = {
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
    };
    const inPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
    });
    const inverted = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      backbonePhaseSlots: new Float32Array([Math.PI, 0, 1, 1]),
    });

    expect(inverted.field).toBeCloseTo(-inPhase.field, 6);
    expect(inverted.gradX).toBeCloseTo(-inPhase.gradX, 6);
    expect(inverted.gradY).toBeCloseTo(-inPhase.gradY, 6);
    expect(inverted.gradZ).toBeCloseTo(-inPhase.gradZ, 6);
    expect(inverted.unsignedSupport).toBeCloseTo(inPhase.unsignedSupport, 6);
  });

  it("keeps the physical pressure carrier linear while its RMS-normalized shape is scale invariant", () => {
    const sample = (amplitude) =>
      evaluateRaymarchLiveSynthesisFieldPoint({
        backboneSlots: new Float32Array([2, 3, 4, amplitude]),
        detailSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
        detailPhaseSlots: new Float32Array(0),
        backboneCount: 1,
        detailCount: 0,
        boundaryMode: "neumann",
        radius: 3,
        x: 0.41,
        y: -0.27,
        z: 0.63,
        time: 0,
      });

    const unit = sample(1);
    const doubled = sample(2);

    expect(doubled.rawPressure).toBeCloseTo(unit.rawPressure * 2, 6);
    expect(doubled.rawGradX).toBeCloseTo(unit.rawGradX * 2, 6);
    expect(doubled.rawGradY).toBeCloseTo(unit.rawGradY * 2, 6);
    expect(doubled.rawGradZ).toBeCloseTo(unit.rawGradZ * 2, 6);
    expect(doubled.modalEnergyAmplitude).toBeCloseTo(
      unit.modalEnergyAmplitude * 2,
      6,
    );
    expect(doubled.normalizedPressure).toBeCloseTo(unit.normalizedPressure, 6);
  });
});

describe("normalized pressure and radiation potential", () => {
  it("derives pressure and velocity proxy from coherent modal summation before radiation material transfer", () => {
    const commonOptions = {
      backboneSlots: new Float32Array([1, 2, 3, 0.8, 2, 1, 1, 0.4]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.45,
      y: -0.2,
      z: 0.7,
      resolution: 16,
    };
    const pressureOnly = evaluateRaymarchLiveSynthesisFieldPoint(commonOptions);
    // Acoustic velocity per linearized Euler: each mode's gradient carries a
    // 1/k_m weight (k_m = scale·|(u,v,w)|), recomputed independently here.
    const waveNumberScale = Math.PI / commonOptions.radius;
    const rectangularBackend = getModalGeometryBackend("rectangular");
    const modeEntries = [
      { u: 1, v: 2, w: 3, amplitude: 0.8 },
      { u: 2, v: 1, w: 1, amplitude: 0.4 },
    ];
    let expectedVelocityX = 0;
    let expectedVelocityY = 0;
    let expectedVelocityZ = 0;
    for (const { u, v, w, amplitude } of modeEntries) {
      const family = rectangularBackend.evaluateMode({
        u,
        v,
        w,
        x: commonOptions.x,
        y: commonOptions.y,
        z: commonOptions.z,
        scale: waveNumberScale,
        boundaryMode: commonOptions.boundaryMode,
      });
      const inverseWaveNumber = 1 / (waveNumberScale * Math.hypot(u, v, w));
      expectedVelocityX += amplitude * family.gradX * inverseWaveNumber;
      expectedVelocityY += amplitude * family.gradY * inverseWaveNumber;
      expectedVelocityZ += amplitude * family.gradZ * inverseWaveNumber;
    }
    const amplitudeNorm = Math.max(
      modeEntries.reduce((total, mode) => total + mode.amplitude, 0),
      raymarchFieldCache.MODAL_BASIS_CACHE_ENERGY_EPSILON,
    );
    const expectedVelocityProxy = Math.min(
      1,
      Math.hypot(expectedVelocityX, expectedVelocityY, expectedVelocityZ) /
        amplitudeNorm,
    );

    expect(pressureOnly.normalizedPressure).toBeCloseTo(pressureOnly.field, 6);
    expect(pressureOnly.normalizedPressureProvenance).toBe(
      "coherent-signed-modal-summation",
    );
    expect(pressureOnly.normalizedVelocityProxy).toBeCloseTo(
      expectedVelocityProxy,
      6,
    );
    expect(pressureOnly.normalizedPressureEnergy).toBeCloseTo(
      Math.min(1, pressureOnly.normalizedPressure ** 2),
      6,
    );
    expect(pressureOnly.normalizedVelocityEnergy).toBeCloseTo(
      Math.min(1, expectedVelocityProxy ** 2),
      6,
    );
    expect(pressureOnly.radiationPotentialReady).toBe(false);
    expect(pressureOnly.normalizedRadiationPotential).toBe(0);
    expect(pressureOnly.radiationMaterialContrastSemantic).toBe(
      "unavailable-no-material-contrast",
    );

    const withContrast = evaluateRaymarchLiveSynthesisFieldPoint({
      ...commonOptions,
      radiationMaterialContrast:
        raymarchFieldCache.RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST,
    });
    const expectedRadiationPotential = Math.max(
      -1,
      Math.min(
        1,
        withContrast.normalizedPressureEnergy *
          raymarchFieldCache.RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST
            .pressureEnergyWeight -
          withContrast.normalizedVelocityEnergy *
            raymarchFieldCache
              .RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST
              .velocityEnergyWeight,
      ),
    );

    expect(withContrast.radiationPotentialReady).toBe(true);
    expect(withContrast.radiationMaterialContrastSemantic).toBe(
      "gorkov-normalized-rigid-mineral-tracer-in-water",
    );
    expect(withContrast.normalizedRadiationPotential).toBeCloseTo(
      expectedRadiationPotential,
      6,
    );
  });

  it("derives Gor'kov contrast weights from the named tracer material properties", () => {
    const contrast = raymarchFieldCache.computeGorkovContrastFactors();
    // Rigid mineral tracer in water: monopole f1 = 1 − κ_p/κ_0 ≈ 0.975,
    // dipole f2 = 2(ρ̃ − 1)/(2ρ̃ + 1) ≈ 0.525. Both positive: the tracer
    // collects at pressure nodes, the classic cymatic configuration.
    expect(contrast.monopole).toBeGreaterThan(0.9);
    expect(contrast.monopole).toBeLessThan(1);
    expect(contrast.dipole).toBeGreaterThan(0.4);
    expect(contrast.dipole).toBeLessThan(0.6);
    expect(
      raymarchFieldCache.RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST
        .pressureEnergyWeight,
    ).toBeCloseTo(contrast.monopole / 3, 12);
    expect(
      raymarchFieldCache.RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST
        .velocityEnergyWeight,
    ).toBeCloseTo(contrast.dipole / 2, 12);
  });
});

describe("phase interference contrast", () => {
  it("keeps one phase-authoritative mode neutral against its independent baseline", () => {
    const response =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots: new Float32Array([1, 1, 1, 1]),
        modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
        modalFieldCount: 1,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });

    expect(response.phaseInterferenceContrast).toBeCloseTo(0, 6);
    expect(response.phaseInterferenceContrast).not.toBeCloseTo(0.5, 6);
    expect(response.phaseInterferenceAuthority).toBeGreaterThan(0.9);
    expect(response.detectorIntegratedCoherentEnergy).toBeGreaterThan(0);
    expect(response.detectorIntegratedCoherentEnergy).toBeCloseTo(
      response.independentPhaseEnergy,
      6,
    );
    expect(response.maxConstructivePhaseEnergy).toBeCloseTo(
      response.independentPhaseEnergy,
      6,
    );
    expect(response.structuralSupport).toBeGreaterThan(0.9);
  });

  it("projects coherent phase as signed interference without deleting structural support", () => {
    const modalFieldSlots = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const alignedPhaseSlots = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const opposedPhaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);

    const aligned =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots: alignedPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });
    const opposed =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots: opposedPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });

    expect(aligned.phaseInterferenceContrast).toBeGreaterThan(0.95);
    expect(opposed.phaseInterferenceContrast).toBeLessThan(-0.95);
    expect(opposed.structuralSupport).toBeGreaterThan(0.9);
    expect(opposed.independentPhaseEnergy).toBeGreaterThan(0);
    expect(opposed.detectorIntegratedCoherentEnergy).toBeLessThan(
      opposed.independentPhaseEnergy,
    );
  });

  it("uses explicit evaluation time for clock-only phase motion and repeats deterministically", () => {
    const modalFieldSlots = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const modalFieldPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      0,
      Math.PI,
      1,
      1,
    ]);

    const atZero =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });
    const atOne =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 1,
        x: 0,
        y: 0,
        z: 0,
      });
    const atOneRepeat =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 1,
        x: 0,
        y: 0,
        z: 0,
      });

    expect(atZero.phaseInterferenceContrast).toBeGreaterThan(0.95);
    expect(atOne.phaseInterferenceContrast).toBeLessThan(-0.95);
    expect(atOneRepeat).toEqual(atOne);
  });

  it("gates low-coherence phase evidence with authority while preserving structural support", () => {
    const modalFieldSlots = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const weakPhaseSlots = new Float32Array([0, 0, 0.02, 1, 0, 0, 0.02, 1]);

    const response =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots,
        modalFieldPhaseSlots: weakPhaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });

    expect(response.phaseAuthorityModeCount).toBe(2);
    expect(response.phaseInterferenceAuthority).toBeLessThan(0.05);
    expect(response.structuralSupport).toBeGreaterThan(0.9);
  });

  it("keeps zero phase authority identity-equivalent in the contrast owner", () => {
    const response =
      raymarchFieldCache.evaluateRaymarchPhaseInterferenceContrastPoint({
        modalFieldSlots: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]),
        modalFieldPhaseSlots: new Float32Array([0, 0, 0, 0, Math.PI, 0, 0, 0]),
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseEvaluationTimeSec: 0,
        x: 0,
        y: 0,
        z: 0,
      });

    expect(response.phaseInterferenceAuthority).toBe(0);
    expect(response.phaseInterferenceContrast).toBe(0);
    expect(response.detectorIntegratedCoherentEnergy).toBe(0);
    expect(response.independentPhaseEnergy).toBe(0);
    expect(response.structuralSupport).toBeGreaterThan(0.9);
  });
});

describe("structural projection drive", () => {
  it("keeps equal structural energy independent of retained mode count", () => {
    const sparse = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      activeCount: 1,
      resolution: 8,
    });
    const dense = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([
        1, 1, 1, 0.5, 1, 2, 1, 0.5, 2, 1, 1, 0.5, 1, 1, 2, 0.5,
      ]),
      activeCount: 4,
      resolution: 8,
    });

    expect(sparse.amplitudeSum).toBeCloseTo(1, 6);
    expect(dense.amplitudeSum).toBeCloseTo(2, 6);
    expect(sparse.structuralEnergy).toBeCloseTo(1, 6);
    expect(dense.structuralEnergy).toBeCloseTo(1, 6);
    expect(dense.projectionEnergyDrive).toBeCloseTo(
      sparse.projectionEnergyDrive,
      6,
    );
    expect(sparse.structuralConcentration).toBeCloseTo(1, 6);
    expect(dense.structuralConcentration).toBeCloseTo(0.25, 6);
    expect(sparse.effectiveModeCount).toBeCloseTo(1, 6);
    expect(dense.effectiveModeCount).toBeCloseTo(4, 6);
    expect(sparse.rmsStructuralAmplitude).toBeCloseTo(1, 6);
    expect(dense.rmsStructuralAmplitude).toBeCloseTo(0.5, 6);
  });

  it("raises projection drive with structural energy without replacing it by concentration", () => {
    const quiet = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.25, 1, 2, 1, 0.25]),
      activeCount: 2,
      resolution: 8,
    });
    const loud = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.5, 1, 2, 1, 0.5]),
      activeCount: 2,
      resolution: 8,
    });

    expect(loud.structuralEnergy).toBeGreaterThan(quiet.structuralEnergy);
    expect(loud.projectionEnergyDrive).toBeGreaterThan(
      quiet.projectionEnergyDrive,
    );
    expect(loud.structuralConcentration).toBeCloseTo(
      quiet.structuralConcentration,
      6,
    );
    expect(quiet.effectiveModeCount).toBeCloseTo(2, 6);
    expect(loud.effectiveModeCount).toBeCloseTo(2, 6);
  });

  it("filters unrepresentable modes out of projection authority", () => {
    const projection = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.5, 9, 1, 1, 1]),
      activeCount: 2,
      resolution: 8,
    });

    expect(projection.amplitudeSum).toBeCloseTo(0.5, 6);
    expect(projection.structuralEnergy).toBeCloseTo(0.25, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1, 6);
    expect(projection.structuralConcentration).toBeCloseTo(1, 6);
  });

  it("keeps quiet coherent modes visible above the structural energy epsilon", () => {
    const projection = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.006]),
      activeCount: 1,
      resolution: 8,
    });

    expect(projection.structuralEnergy).toBeLessThan(0.0001);
    expect(projection.projectionEnergyDrive).toBeGreaterThan(0.003);
    expect(projection.structuralConcentration).toBeCloseTo(1, 6);
    expect(projection.effectiveModeCount).toBeCloseTo(1, 6);
  });

  it("derives the energy-weighted RMS spatial wavenumber of admitted modes", () => {
    const single = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      activeCount: 1,
      resolution: 8,
    });
    const weighted = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 0, 0, 1, 3, 4, 0, 1]),
      activeCount: 2,
      resolution: 32,
    });
    const empty = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: null,
      activeCount: 0,
      resolution: 8,
    });

    expect(single.rmsSpatialWavenumber).toBeCloseTo(Math.sqrt(3), 6);
    expect(weighted.rmsSpatialWavenumber).toBeCloseTo(Math.sqrt(13), 5);
    expect(empty.rmsSpatialWavenumber).toBe(0);
  });

  it("keeps over-bandwidth admitted modes inside the wavenumber statistic", () => {
    const projection = raymarchFieldCache.deriveStructuralProjectionDrive({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.5, 9, 0, 0, 1]),
      activeCount: 2,
      resolution: 8,
    });

    // (9,0,0) is filtered from structural projection authority, but any
    // over-bandwidth admission renders the whole set through analytic
    // synthesis, so it must still raise the RMS wavenumber statistic.
    expect(projection.structuralEnergy).toBeCloseTo(0.25, 6);
    expect(projection.rmsSpatialWavenumber).toBeCloseTo(
      Math.sqrt((0.25 * 3 + 1 * 81) / 1.25),
      5,
    );
  });
});

describe("spectral lane radiance accumulation", () => {
  it("accumulates lane radiance and reports total dominance and entropy", () => {
    const result = raymarchFieldCache.accumulateSpectralLaneRadianceAtPoint({
      point: [0.2, 0.25, 0.25],
      modalFieldSlots: new Float32Array([1, 1, 1, 0.8, 2, 1, 1, 0.6]),
      modalFieldSpectralLaneA: new Float32Array([1, 0, 0, 0, 0, 0, 1, 0]),
      modalFieldSpectralLaneB: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      modalFieldSpectralMeta: new Float32Array([
        0.1, 0.04, 0.9, 0.5, 0.4, 0.08, 0.75, 0.4,
      ]),
      activeCount: 2,
      cavityGeometry: "rectangular",
    });

    expect(result.lanes).toHaveLength(8);
    expect(result.lanes[0]).toBeGreaterThan(0);
    expect(result.lanes[2]).toBeGreaterThan(0);
    expect(result.lanes[1]).toBe(0);
    expect(result.total).toBeCloseTo(
      result.lanes.reduce((total, value) => total + value, 0),
      6,
    );
    expect(result.dominance).toBeGreaterThan(0.5);
    expect(result.dominance).toBeLessThan(1);
    expect(result.entropy).toBeGreaterThan(0);
    expect(result.entropy).toBeLessThan(1);
  });

  it("preserves total radiance for equal-energy packets with different lanes", () => {
    const commonOptions = {
      point: [0.2, 0.25, 0.25],
      modalFieldSlots: new Float32Array([1, 1, 1, 0.8]),
      modalFieldSpectralMeta: new Float32Array([0.1, 0.04, 0.9, 0.7]),
      activeCount: 1,
      cavityGeometry: "rectangular",
    };
    const redLane = raymarchFieldCache.accumulateSpectralLaneRadianceAtPoint({
      ...commonOptions,
      modalFieldSpectralLaneA: new Float32Array([1, 0, 0, 0]),
      modalFieldSpectralLaneB: new Float32Array([0, 0, 0, 0]),
    });
    const violetLane = raymarchFieldCache.accumulateSpectralLaneRadianceAtPoint(
      {
        ...commonOptions,
        modalFieldSpectralLaneA: new Float32Array([0, 0, 0, 0]),
        modalFieldSpectralLaneB: new Float32Array([0, 0, 1, 0]),
      },
    );

    expect(redLane.total).toBeGreaterThan(0);
    expect(violetLane.total).toBeCloseTo(redLane.total, 8);
    expect(redLane.lanes[0]).toBeCloseTo(redLane.total, 8);
    expect(violetLane.lanes[6]).toBeCloseTo(violetLane.total, 8);
  });

  it("does not let packet confidence or display energy extinguish lane radiance", () => {
    const commonOptions = {
      point: [0.2, 0.25, 0.25],
      modalFieldSlots: new Float32Array([1, 1, 1, 0.8]),
      modalFieldSpectralLaneA: new Float32Array([0.25, 0.75, 0, 0]),
      modalFieldSpectralLaneB: new Float32Array([0, 0, 0, 0]),
      activeCount: 1,
      cavityGeometry: "rectangular",
    };
    const confidentPacket =
      raymarchFieldCache.accumulateSpectralLaneRadianceAtPoint({
        ...commonOptions,
        modalFieldSpectralMeta: new Float32Array([0.1, 0.04, 0.9, 0.7]),
      });
    const lowQualityPacket =
      raymarchFieldCache.accumulateSpectralLaneRadianceAtPoint({
        ...commonOptions,
        modalFieldSpectralMeta: new Float32Array([0.1, 0.04, 0, 0]),
      });

    expect(confidentPacket.total).toBeGreaterThan(0);
    expect(lowQualityPacket.total).toBeCloseTo(confidentPacket.total, 8);
    expect(lowQualityPacket.lanes[0]).toBeCloseTo(confidentPacket.lanes[0], 8);
    expect(lowQualityPacket.lanes[1]).toBeCloseTo(confidentPacket.lanes[1], 8);
  });

  it("creates a lane texture cache with separate lane and stats textures", () => {
    const cache = raymarchFieldCache.createRaymarchSpectralLaneCache({
      resolution: 8,
    });

    expect(cache.ready).toBe(false);
    expect(cache.mode).toBe("spectral-lane-cache");
    expect(cache.resolution).toBe(8);
    expect(cache.spectralLaneTextureA).toBeTruthy();
    expect(cache.spectralLaneTextureB).toBeTruthy();
    expect(cache.spectralLaneStatsTexture).toBeTruthy();
    expect(cache.spectralLaneTextureA).not.toBe(cache.spectralLaneTextureB);
    expect(cache.spectralLaneStatsTexture).not.toBe(cache.spectralLaneTextureA);
  });

  it("builds a GPU lane-radiance cache from modal basis pages and spectral lane buffers", () => {
    const source = normalizeSource(
      readFileSync(new URL("./fieldCache.js", import.meta.url), "utf8"),
    );
    const computeStart = source.indexOf(
      "function createSpectralLaneCacheComputeKernel",
    );
    const computeEnd = source.indexOf(
      "function getOrCreateRaymarchModalBasisCacheComputeNode",
      computeStart,
    );
    const computeSource = source.slice(computeStart, computeEnd);

    expect(computeStart).toBeGreaterThan(-1);
    expect(computeEnd).toBeGreaterThan(computeStart);
    expect(computeSource).toContain("texture3D(modalBasisAtlasTexture).sample");
    expect(computeSource).toContain("modalFieldCoefficientBuffer.element(i)");
    expect(computeSource).toContain("modalFieldSpectralLaneABuffer.element(i)");
    expect(computeSource).toContain("modalFieldSpectralLaneBBuffer.element(i)");
    expect(computeSource).toContain("modalFieldSpectralMetaBuffer.element(i)");
    expect(computeSource).toContain(
      "packetConfidenceSum.addAssign(spectralConfidence.mul(modalSupport))",
    );
    expect(computeSource).toContain("spectralLaneTextureA,");
    expect(computeSource).toContain("spectralLaneTextureB,");
    expect(computeSource).toContain("spectralLaneStatsTexture,");
    expect(computeSource).toContain("dominance");
    expect(computeSource).toContain("entropy");
    expect(computeSource).not.toContain("displayEnergy");
    expect(computeSource).not.toContain(
      "const spectralSupport = modalSupport\n              .mul",
    );
    expect(computeSource).not.toContain("modalFieldColorBuffer");
    expect(computeSource).not.toContain("cachedSpectralLightEnabled");
    expect(computeSource).not.toContain("spectralLightCacheTexture");
  });

  it("computes a drawable spectral lane cache without RGB fallback state", () => {
    const cache = raymarchFieldCache.createRaymarchSpectralLaneCache({
      resolution: 8,
    });
    const renderer = { compute: vi.fn() };
    const descriptor = {
      semantic: "spectral-lane-cache",
      hash: 123,
      modalFieldCount: 1,
      spectralLaneHash: 456,
    };

    const result = raymarchFieldCache.computeRaymarchSpectralLaneCache(
      cache,
      renderer,
      {
        descriptor,
        modalBasisAtlasTexture: {},
        modalFieldCoefficientBuffer: { value: { array: new Float32Array(4) } },
        modalFieldSpectralLaneABuffer: {
          value: { array: new Float32Array([1, 0, 0, 0]) },
        },
        modalFieldSpectralLaneBBuffer: {
          value: { array: new Float32Array(4) },
        },
        modalFieldSpectralMetaBuffer: {
          value: { array: new Float32Array([0.1, 0.05, 0.9, 0.7]) },
        },
        modalFieldCapacity: 1,
        uniforms: {
          uModalFieldModeCount: { value: 1 },
          uTime: { value: 2 },
        },
        schedulerTimeSec: 2,
      },
    );

    expect(result).toMatchObject({
      computed: true,
      reason: "frame-current",
      descriptor,
    });
    expect(renderer.compute).toHaveBeenCalledTimes(1);
    expect(cache.ready).toBe(true);
    expect(cache.active).toBe(true);
    expect(cache.descriptor).toBe(descriptor);
    expect(cache.activeCacheBuiltAtSec).toBe(2);
    expect(cache.lastComputeReason).toBe("frame-current");
    expect(cache).not.toHaveProperty("spectralLightCacheTexture");
    expect(cache).not.toHaveProperty("cachedSpectralLightEnabled");
  });
});

function resolveModalFieldRebuildOptions(options) {
  const modeBuffer =
    options.modalFieldModeBuffer ?? options.backboneModeBuffer ?? null;
  return {
    ...options,
    modalFieldModeBuffer: modeBuffer,
    modalFieldPhaseBuffer:
      options.modalFieldPhaseBuffer ?? options.backbonePhaseBuffer ?? null,
    modalFieldCapacity: options.modalFieldCapacity ?? 0,
    uniforms: {
      ...options.uniforms,
      uModalFieldModeCount: options.uniforms?.uModalFieldModeCount ??
        options.uniforms?.uBackboneModeCount ?? { value: 0 },
    },
  };
}

function getTestComputeNodeKey(capacity, cavityGeometry = "rectangular") {
  return `${cavityGeometry}:neumann:capacity=${Math.max(
    1,
    Math.round(capacity || 0),
  )}`;
}

async function flushCacheMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

function enqueueRaymarchModalBasisCacheRebuild(
  modalBasisCache,
  renderer,
  descriptor,
  rebuildReason,
  options,
) {
  return raymarchFieldCache.enqueueRaymarchModalBasisCacheRebuild(
    modalBasisCache,
    renderer,
    descriptor,
    rebuildReason,
    resolveModalFieldRebuildOptions(options),
  );
}

describe("fieldCache", () => {
  it("creates the canonical modal-basis cache without fixed phase cadence", () => {
    expect(raymarchFieldCache.createRaymarchModalBasisCache).toBeTypeOf(
      "function",
    );
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });

    expect(modalBasisCache.texture.isStorageTexture).toBe(true);
    expect(modalBasisCache.texture.is3DTexture).toBe(true);
    expect(modalBasisCache.texture.image.width).toBe(8);
    expect(modalBasisCache.texture.image.depth).toBe(
      8 * raymarchFieldCache.RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    );
    expect(modalBasisCache.ready).toBe(false);
    expect(modalBasisCache.backend).toBe("compute");
    expect(modalBasisCache.mode).toBe("modal-basis-cached");
    expect(modalBasisCache.semantic).toBe("modal-basis-cache");
    expect(modalBasisCache.basisPacking).toBe("z-slice-pages-v1");
    expect(modalBasisCache.liveSynthesisModeCount).toBe(
      raymarchFieldCache.RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
    );
    expect(modalBasisCache.modalBasisCacheMinSamplesPerCycle).toBe(4);
    expect(modalBasisCache.liveSynthesisSupportDiagnosticSampleCount).toBe(0);
    expect(
      modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBe(0);
    expect(modalBasisCache.liveSynthesisSupportDiagnosticCoverage).toBe(0);
    expect(modalBasisCache).not.toHaveProperty("updateIntervalMs");
  });

  it("does not allocate a companion support atlas texture", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });

    expect(modalBasisCache).not.toHaveProperty("supportTexture");
    expect(modalBasisCache).not.toHaveProperty("supportSemantic");
    expect(modalBasisCache.semantic).toBe("modal-basis-cache");
  });

  it("marks all-rejected modal-basis descriptors as non-drawable", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([99, 99, 99, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(descriptor.modalFieldCount).toBe(1);
    expect(descriptor.contributingBasisPageModeCount).toBe(0);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.modalBasisCacheDrawable).toBe(false);
    expect(descriptor.modalBasisCacheBlockedReason).toBe(
      "no-contributing-basis-pages",
    );
  });

  it("marks representable modal-basis descriptors as drawable candidates", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(descriptor.contributingBasisPageModeCount).toBe(1);
    expect(descriptor.modalBasisCacheDrawable).toBe(true);
    expect(descriptor.modalBasisCacheBlockedReason).toBeNull();
  });

  it("keeps overflowed but bounded modal-basis descriptors drawable", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      descriptorOverflow: true,
      resolution: 8,
    });

    expect(descriptor.descriptorOverflow).toBe(true);
    expect(descriptor.contributingBasisPageModeCount).toBe(1);
    expect(descriptor.modalBasisCacheDrawable).toBe(true);
    expect(descriptor.modalBasisCacheBlockedReason).toBeNull();
  });

  it("resolves modal-basis cache drawable states", () => {
    const cache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.2, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const phaseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.4, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
      time: 1,
    });
    const structuralDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 2, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0.4, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });
    const blockedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([99, 99, 99, 1]),
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    });

    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        null,
        descriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-absent",
      blockedReason: "cache-unavailable",
    });

    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        descriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-building",
      blockedReason: "cache-rebuild-pending",
      staleWhileRebuilding: false,
    });

    cache.ready = true;
    cache.activeDescriptor = descriptor;
    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        structuralDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
    });

    cache.rebuildPending = false;
    cache.activeDescriptor = descriptor;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        descriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
    });

    cache.lastRebuildSubmittedAtSec = 1;
    cache.activePhaseSampleTimeSec = 0.4;
    const phaseMotionAuthority =
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        phaseDescriptor,
      );
    expect(phaseMotionAuthority).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
      blockedReason: null,
      staleReason: null,
      staleWhileRebuilding: false,
    });

    cache.rebuildPending = true;
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        structuralDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
      blockedReason: null,
      staleReason: "modal-identity",
      staleWhileRebuilding: true,
    });

    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        cache,
        blockedDescriptor,
      ),
    ).toMatchObject({
      drawable: false,
      state: "modal-basis-cache-blocked",
      blockedReason: "no-contributing-basis-pages",
      staleWhileRebuilding: false,
    });
  });

  it("builds modal-basis compute as a coefficient-invariant basis atlas", () => {
    const source = normalizeSource(
      readFileSync(new URL("./fieldCache.js", import.meta.url), "utf8"),
    );
    const computeStart = source.indexOf(
      "function createModalBasisCacheComputeKernel",
    );
    const computeEnd = source.indexOf(
      "function createLiveFieldProjectionComputeKernel",
      computeStart,
    );
    const computeSource = source.slice(computeStart, computeEnd);

    expect(computeStart).toBeGreaterThan(-1);
    expect(computeEnd).toBeGreaterThan(computeStart);
    expect(computeSource).toContain("const pageIndex = voxelCoord.z.div");
    expect(computeSource).toContain("const localZ = voxelCoord.z.mod");
    expect(computeSource).toContain(
      "const slot = modalFieldModeBuffer.element(pageIndexInt);",
    );
    expect(computeSource).toContain("basisField.addAssign(family.field);");
    expect(computeSource).toContain(
      "vec4(basisField, basisGradX, basisGradY, basisGradZ)",
    );
    expect(computeSource).not.toContain("supportTexture");
    expect(computeSource).not.toContain("modalFieldPhaseBuffer");
    expect(computeSource).not.toContain("phaseCurrentContribution");
    expect(computeSource).not.toContain("totalAmplitude");
  });

  it("builds live field projection as a frame-current cache from cached basis pages", () => {
    const source = normalizeSource(
      readFileSync(new URL("./fieldCache.js", import.meta.url), "utf8"),
    );
    const computeStart = source.indexOf(
      "function createLiveFieldProjectionComputeKernel",
    );
    const computeEnd = source.indexOf(
      "function getOrCreateRaymarchModalBasisCacheComputeNode",
      computeStart,
    );
    const computeSource = source.slice(computeStart, computeEnd);

    expect(computeStart).toBeGreaterThan(-1);
    expect(computeEnd).toBeGreaterThan(computeStart);
    expect(computeSource).toContain(
      "const coefficient = modalFieldCoefficientBuffer.element(i).x;",
    );
    expect(computeSource).toContain("texture3D(modalBasisAtlasTexture).sample");
    expect(computeSource).toContain("const invResolution =");
    expect(computeSource).toContain("const invCapacity =");
    expect(computeSource).toContain(".mul(invResolution)");
    expect(computeSource).toContain(".mul(invCapacity)");
    expect(computeSource).toContain("fieldSum.addAssign");
    expect(computeSource).toContain("supportSum.addAssign");
    expect(computeSource).toContain("structuralSupportSum.addAssign");
    expect(computeSource).toContain("modalCoefficientEnergySum.addAssign");
    expect(computeSource).toContain("pressureRadiationTexture");
    expect(computeSource).toContain(
      "const normalizedSignedField = fieldSum.div(modalEnergyAmplitude).toVar();",
    );
    expect(computeSource).toContain("const normalizedPressure = clamp(");
    expect(computeSource).toContain("normalizedSignedField,");
    expect(computeSource).toContain("normalizedPressure");
    expect(computeSource).toContain("normalizedVelocityProxy");
    expect(computeSource).toContain("normalizedRadiationPotential");
    expect(computeSource).toContain(
      "vec4(fieldSum, gradXSum, gradYSum, gradZSum)",
    );
    expect(computeSource).not.toContain("uTotalSlotAmplitude");
    expect(computeSource).toContain(`vec4(
          normalizedPressure,
          normalizedVelocityProxy,
          normalizedRadiationPotential,
          one,
        )`);
    expect(computeSource).toContain("phaseInterferenceTexture");
    expect(computeSource).toContain("modalFieldPhaseBuffer.element(i)");
    expect(computeSource).toContain("detectorPairIntegrationBuffer.element(");
    expect(computeSource).toContain("detectorIntegratedCoherentEnergy");
    expect(computeSource).not.toContain("detectorIntegrationTime");
    expect(computeSource).not.toContain("sin(sincArgument).div(sincArgument)");
    expect(computeSource).not.toContain("modalFieldMetadataBuffer.element(");
    expect(computeSource).toContain("independentPhaseEnergySum");
    expect(computeSource).toContain("maxDetectorCrossMagnitude");
    expect(computeSource).toContain("phaseInterferenceContrast");
    expect(computeSource).toContain("uPhaseEvaluationTime");
    expect(computeSource).toContain("const rawPhase =");
    expect(computeSource).toContain("fract(rawPhase.mul(invTwoPi).add(half))");
    expect(computeSource).toContain("const phaseAwareCoefficient =");
    expect(computeSource).not.toContain("phaseSlot.y.mul(uniforms.uTime)");
    expect(computeSource).not.toContain("phaseResponseTexture");
    expect(computeSource).not.toContain("phaseResponseMagnitude");
    expect(computeSource).toContain("textureStore(");
    expect(computeSource).toContain("supportTexture");
    expect(computeSource).not.toContain("evaluateModeNode({");
  });

  it("retargets dependent compute nodes after modal-basis atlas promotion", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const liveFieldProjectionCache =
      raymarchFieldCache.createRaymarchLiveFieldProjectionCache({
        resolution: 8,
      });
    const spectralLaneCache =
      raymarchFieldCache.createRaymarchSpectralLaneCache({
        resolution: 8,
      });
    const activeTexture = modalBasisCache.texture;
    const promotedTexture = modalBasisCache.pendingTexture;
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const uniforms = {
      uModalFieldModeCount: { value: 1 },
      uPhaseEvaluationTime: { value: 0 },
      uTime: { value: 1 },
    };
    const modalFieldModeBuffer = {
      value: { array: new Float32Array([1, 2, 3, 0.5]) },
    };
    const modalFieldCoefficientBuffer = {
      value: { array: new Float32Array([1, 0, 0, 0]) },
    };
    const modalFieldPhaseBuffer = {
      value: { array: new Float32Array([0.1, 0.1, 0.6, 0.7]) },
    };
    const modalFieldSpectralLaneABuffer = {
      value: { array: new Float32Array([1, 0, 0, 0]) },
    };
    const modalFieldSpectralLaneBBuffer = {
      value: { array: new Float32Array(4) },
    };
    const modalFieldSpectralMetaBuffer = {
      value: { array: new Float32Array([0.1, 0.05, 0.9, 0.7]) },
    };
    const modalFieldMetadataBuffer = {
      value: { array: new Float32Array([440, 20, 0.025, 1]) },
    };
    const liveNodes = [];
    const spectralNodes = [];
    const liveRenderer = {
      compute: vi.fn((node) => {
        liveNodes.push(node);
      }),
    };
    const spectralRenderer = {
      compute: vi.fn((node) => {
        spectralNodes.push(node);
      }),
    };

    const firstLiveResult =
      raymarchFieldCache.computeRaymarchLiveFieldProjectionCache(
        liveFieldProjectionCache,
        liveRenderer,
        {
          modalBasisAtlasTexture: activeTexture,
          modalFieldModeBuffer,
          modalFieldCoefficientBuffer,
          modalFieldPhaseBuffer,
          modalFieldMetadataBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 1,
        },
      );
    const firstSpectralResult =
      raymarchFieldCache.computeRaymarchSpectralLaneCache(
        spectralLaneCache,
        spectralRenderer,
        {
          descriptor,
          modalBasisAtlasTexture: activeTexture,
          modalFieldCoefficientBuffer,
          modalFieldSpectralLaneABuffer,
          modalFieldSpectralLaneBBuffer,
          modalFieldSpectralMetaBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 1,
        },
      );
    const firstLiveNode = liveNodes[0];
    const firstSpectralNode = spectralNodes[0];
    firstLiveNode.dispose = vi.fn();
    firstSpectralNode.dispose = vi.fn();

    expect(firstLiveResult).toMatchObject({ computed: true });
    expect(firstSpectralResult).toMatchObject({ computed: true });
    expect(firstLiveNode.raymarchModalBasisAtlasTexture).toBe(activeTexture);
    expect(firstSpectralNode.raymarchModalBasisAtlasTexture).toBe(
      activeTexture,
    );

    modalBasisCache.pendingDescriptor = descriptor;
    modalBasisCache.pendingReady = true;
    expect(
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      ),
    ).toMatchObject({ committed: true, texture: promotedTexture });

    const secondLiveResult =
      raymarchFieldCache.computeRaymarchLiveFieldProjectionCache(
        liveFieldProjectionCache,
        liveRenderer,
        {
          modalBasisAtlasTexture: modalBasisCache.texture,
          modalFieldModeBuffer,
          modalFieldCoefficientBuffer,
          modalFieldPhaseBuffer,
          modalFieldMetadataBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 2,
        },
      );
    const secondSpectralResult =
      raymarchFieldCache.computeRaymarchSpectralLaneCache(
        spectralLaneCache,
        spectralRenderer,
        {
          descriptor,
          modalBasisAtlasTexture: modalBasisCache.texture,
          modalFieldCoefficientBuffer,
          modalFieldSpectralLaneABuffer,
          modalFieldSpectralLaneBBuffer,
          modalFieldSpectralMetaBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 2,
        },
      );
    const secondLiveNode = liveNodes[1];
    const secondSpectralNode = spectralNodes[1];

    expect(secondLiveResult).toMatchObject({ computed: true });
    expect(secondSpectralResult).toMatchObject({ computed: true });
    expect(secondLiveNode).not.toBe(firstLiveNode);
    expect(secondSpectralNode).not.toBe(firstSpectralNode);
    expect(firstLiveNode.dispose).not.toHaveBeenCalled();
    expect(firstSpectralNode.dispose).not.toHaveBeenCalled();
    expect(secondLiveNode.raymarchModalBasisAtlasTexture).toBe(promotedTexture);
    expect(secondSpectralNode.raymarchModalBasisAtlasTexture).toBe(
      promotedTexture,
    );
    expect(Object.values(liveFieldProjectionCache.computeNodesByKey)).toEqual([
      secondLiveNode,
    ]);
    expect(Object.values(spectralLaneCache.computeNodesByKey)).toEqual([
      secondSpectralNode,
    ]);
    expect(
      Object.values(liveFieldProjectionCache.standbyComputeNodesByKey),
    ).toEqual([firstLiveNode]);
    expect(Object.values(spectralLaneCache.standbyComputeNodesByKey)).toEqual([
      firstSpectralNode,
    ]);

    // Swapping back to the original atlas must reuse the retained kernel
    // instead of rebuilding it.
    modalBasisCache.pendingDescriptor = descriptor;
    modalBasisCache.pendingReady = true;
    expect(
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      ),
    ).toMatchObject({ committed: true, texture: activeTexture });

    const thirdLiveResult =
      raymarchFieldCache.computeRaymarchLiveFieldProjectionCache(
        liveFieldProjectionCache,
        liveRenderer,
        {
          modalBasisAtlasTexture: modalBasisCache.texture,
          modalFieldModeBuffer,
          modalFieldCoefficientBuffer,
          modalFieldPhaseBuffer,
          modalFieldMetadataBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 3,
        },
      );
    const thirdSpectralResult =
      raymarchFieldCache.computeRaymarchSpectralLaneCache(
        spectralLaneCache,
        spectralRenderer,
        {
          descriptor,
          modalBasisAtlasTexture: modalBasisCache.texture,
          modalFieldCoefficientBuffer,
          modalFieldSpectralLaneABuffer,
          modalFieldSpectralLaneBBuffer,
          modalFieldSpectralMetaBuffer,
          modalFieldCapacity: 1,
          uniforms,
          schedulerTimeSec: 3,
        },
      );

    expect(thirdLiveResult).toMatchObject({ computed: true });
    expect(thirdSpectralResult).toMatchObject({ computed: true });
    expect(liveNodes[2]).toBe(firstLiveNode);
    expect(spectralNodes[2]).toBe(firstSpectralNode);
    expect(firstLiveNode.dispose).not.toHaveBeenCalled();
    expect(firstSpectralNode.dispose).not.toHaveBeenCalled();
    expect(Object.values(liveFieldProjectionCache.computeNodesByKey)).toEqual([
      firstLiveNode,
    ]);
    expect(
      Object.values(liveFieldProjectionCache.standbyComputeNodesByKey),
    ).toEqual([secondLiveNode]);
    expect(Object.values(spectralLaneCache.computeNodesByKey)).toEqual([
      firstSpectralNode,
    ]);
    expect(Object.values(spectralLaneCache.standbyComputeNodesByKey)).toEqual([
      secondSpectralNode,
    ]);
  });

  it("creates and disposes named pressure/radiation and phase-interference carriers with the live projection cache", () => {
    const cache = raymarchFieldCache.createRaymarchLiveFieldProjectionCache({
      resolution: 8,
    });
    const disposePressureRadiation = vi.fn();
    const disposePhaseInterference = vi.fn();
    const disposeActiveNode = vi.fn();
    const disposeStandbyNode = vi.fn();
    cache.pressureRadiationTexture.dispose = disposePressureRadiation;
    cache.phaseInterferenceTexture.dispose = disposePhaseInterference;
    cache.computeNodesByKey["live-field-projection:capacity=1"] = {
      dispose: disposeActiveNode,
    };
    cache.standbyComputeNodesByKey = {
      "live-field-projection:capacity=1": { dispose: disposeStandbyNode },
    };

    expect(cache.pressureRadiationTexture).toBeTruthy();
    expect(cache.pressureRadiationTexture).not.toBe(cache.fieldTexture);
    expect(cache.pressureRadiationTexture).not.toBe(cache.supportTexture);
    expect(cache.phaseInterferenceTexture).toBeTruthy();
    expect(cache.phaseInterferenceTexture).not.toBe(cache.fieldTexture);
    expect(cache.phaseInterferenceTexture).not.toBe(cache.supportTexture);
    expect(cache.phaseInterferenceTexture).not.toBe(
      cache.pressureRadiationTexture,
    );
    expect(cache.pressureRadiationSemantic).toBe(
      "normalized-pressure-velocity-radiation-potential",
    );
    expect(cache).not.toHaveProperty("phaseResponseTexture");

    raymarchFieldCache.disposeRaymarchLiveFieldProjectionCache(cache);

    expect(disposePressureRadiation).toHaveBeenCalledTimes(1);
    expect(disposePhaseInterference).toHaveBeenCalledTimes(1);
    expect(disposeActiveNode).toHaveBeenCalledTimes(1);
    expect(disposeStandbyNode).toHaveBeenCalledTimes(1);
  });

  it("treats phase offsets as live-synthesis state", () => {
    expect(buildRaymarchModalBasisCacheDescriptor).toBeTypeOf("function");
    expect(raymarchFieldCache.shouldRebuildRaymarchModalBasisCache).toBeTypeOf(
      "function",
    );
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.3,
    });
    const carrierAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0.7, 0.2, 0.5, 0.6]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.3,
    });
    const phaseParameterChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        backboneSlots: slots,
        detailSlots: new Float32Array(0),
        backbonePhaseSlots: new Float32Array([0.7, 0.32, 0.5, 0.6]),
        detailPhaseSlots: new Float32Array(0),
        backboneCount: 1,
        detailCount: 0,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 0.3,
      });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 16,
    });
    const carrierAdvancedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.7, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 16,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(carrierAdvancedSample.field).not.toBeCloseTo(initialSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        initialDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        carrierAdvancedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        phaseParameterChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        activeDescriptor: initialDescriptor,
        nextDescriptor: carrierAdvancedDescriptor,
      }),
    ).toBeNull();
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        descriptorFresh: true,
        activeDescriptor: phaseParameterChangedDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBeNull();
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        rebuildPending: true,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("rebuild-pending");
    expect(
      raymarchFieldCache.getRaymarchModalBasisCacheDescriptorStaleReason({
        queuedDescriptor: phaseParameterChangedDescriptor,
        activeDescriptor: initialDescriptor,
        nextDescriptor: phaseParameterChangedDescriptor,
      }),
    ).toBe("queued-descriptor");
  });

  it("keeps clock-only phase motion live without rebuilding modal-basis topology", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const timeAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0.5,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      phaseEvaluationTimeSec: 0,
      resolution: 16,
    });
    const timeAdvancedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      phaseEvaluationTimeSec: 0.5,
      resolution: 16,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(timeAdvancedSample.field).not.toBeCloseTo(initialSample.field, 6);
    expect(timeAdvancedDescriptor.liveModalPhaseHash).not.toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps basis-cache drawable authority on clock-only phase advance", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const timeAdvancedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0.5,
    });

    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(timeAdvancedDescriptor.liveModalPhaseHash).not.toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.isRaymarchModalBasisCacheReadyForDescriptor(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toBe(true);
    expect(
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        timeAdvancedDescriptor,
      ),
    ).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-current",
    });
  });

  it("ignores inactive phase metadata when resolving modal-basis freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const inactivePhaseSlots = new Float32Array([0.1, 0.6, 0.8, 0]);
    const changedInactivePhaseSlots = new Float32Array([2.4, -1.7, 0.1, 0]);
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: inactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      time: 0,
    });
    const changedInactiveDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: changedInactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      time: 0.5,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: inactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const changedInactiveSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: changedInactivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0.5,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(changedInactiveSample.field).toBeCloseTo(initialSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        changedInactiveDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps equivalent sampled phase motion live without rebuilding topology", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialPhaseSlots = new Float32Array([0.1, 0.6, 0.8, 0.9]);
    const sameCurrentPhaseSlots = new Float32Array([0.35, 0.1, 0.8, 0.9]);
    const time = 0.5;
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time,
    });
    const sameCurrentPhaseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: sameCurrentPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      phaseEvaluationTimeSec: time,
      resolution: 8,
    });
    const sameCurrentPhaseSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: sameCurrentPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      phaseEvaluationTimeSec: time,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(sameCurrentPhaseSample.field).toBeCloseTo(initialSample.field, 6);
    expect(sameCurrentPhaseDescriptor.liveModalPhaseHash).toBe(
      initialDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        sameCurrentPhaseDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps phase freshness attached to modal tuples across upload order", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const slots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const phaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const reorderedSlots = new Float32Array([2, 2, 4, 0.4, 1, 2, 3, 0.6]);
    const reorderedPhaseSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const reassignedPhaseSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 16,
    };
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const reassignedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: reassignedPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
    });
    const reorderedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: reorderedSlots,
      modalFieldPhaseSlots: reorderedPhaseSlots,
    });
    const reassignedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: slots,
      modalFieldPhaseSlots: reassignedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = descriptor;
    const reorderedCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: reorderedSlots,
      modalFieldPhaseSlots: reorderedPhaseSlots,
      activeModalFieldModeCount: 2,
    }).slotViews;
    const reorderedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: reorderedCanonical.modalFieldSlots,
      modalFieldPhaseSlots: reorderedCanonical.modalFieldPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });

    expect(reorderedSample.field).toBeCloseTo(sample.field, 6);
    expect(reorderedSample.gradX).toBeCloseTo(sample.gradX, 6);
    expect(reorderedSample.gradY).toBeCloseTo(sample.gradY, 6);
    expect(reorderedSample.gradZ).toBeCloseTo(sample.gradZ, 6);
    expect(reorderedDescriptor.liveModalPhaseHash).toBe(
      descriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        reorderedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
    expect(reassignedSample.field).not.toBeCloseTo(sample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        reassignedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("canonicalizes duplicate modal tuples before resolving phase freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const compactSlots = new Float32Array([1, 2, 3, 0.6, 2, 2, 4, 0.4]);
    const compactPhaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const splitSlots = new Float32Array([
      1, 2, 3, 0.35, 1, 2, 3, 0.25, 2, 2, 4, 0.4,
    ]);
    const splitEquivalentPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const splitChangedPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 16,
    };
    const compactCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      activeModalFieldModeCount: 2,
    });
    const splitEquivalentCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitEquivalentPhaseSlots,
      activeModalFieldModeCount: 3,
    });
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: compactCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots: compactCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: compactCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 16,
    });
    const splitEquivalentDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitEquivalentCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitEquivalentCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitEquivalentCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 16,
    });
    const splitChangedCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 3,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      activeModalFieldModeCount: 3,
    });
    const splitChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitChangedCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitChangedCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitChangedCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
      resolution: 16,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
    });
    const splitEquivalentSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitEquivalentPhaseSlots,
      modalFieldCount: 3,
    });
    const splitChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      modalFieldCount: 3,
    });

    modalBasisCache.activeDescriptor = compactDescriptor;

    expect(splitEquivalentSample.field).toBeCloseTo(compactSample.field, 6);
    expect(splitEquivalentSample.gradX).toBeCloseTo(compactSample.gradX, 6);
    expect(splitEquivalentSample.gradY).toBeCloseTo(compactSample.gradY, 6);
    expect(splitEquivalentSample.gradZ).toBeCloseTo(compactSample.gradZ, 6);
    expect(splitEquivalentDescriptor.liveModalPhaseHash).toBe(
      compactDescriptor.liveModalPhaseHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitEquivalentDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(splitChangedSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("hashes aggregate phase motion for duplicate modal tuples without rebuilding topology", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const compactSlots = new Float32Array([1, 2, 3, 0.6]);
    const compactPhaseSlots = new Float32Array([Math.PI / 2, 0, 1, 1]);
    const splitSlots = new Float32Array([1, 2, 3, 0.3, 1, 2, 3, 0.3]);
    const splitAggregateEquivalentPhaseSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const splitChangedPhaseSlots = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const sampleOptions = {
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 16,
    };
    const compactCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      activeModalFieldModeCount: 1,
    });
    const splitAggregateEquivalentCanonical = buildCanonicalFullModalDescriptor(
      {
        maxTotalModes: 2,
        modalFieldSlots: splitSlots,
        modalFieldPhaseSlots: splitAggregateEquivalentPhaseSlots,
        activeModalFieldModeCount: 2,
      },
    );
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: compactCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots: compactCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: compactCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
      resolution: 16,
    });
    const splitAggregateEquivalentDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots:
          splitAggregateEquivalentCanonical.slotViews.modalFieldSlots,
        modalFieldPhaseSlots:
          splitAggregateEquivalentCanonical.slotViews.modalFieldPhaseSlots,
        modalFieldCount:
          splitAggregateEquivalentCanonical.counts.modalFieldModeCount,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 1,
        time: 0,
        resolution: 16,
      });
    const splitChangedCanonical = buildCanonicalFullModalDescriptor({
      maxTotalModes: 2,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      activeModalFieldModeCount: 2,
    });
    const splitChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: splitChangedCanonical.slotViews.modalFieldSlots,
      modalFieldPhaseSlots:
        splitChangedCanonical.slotViews.modalFieldPhaseSlots,
      modalFieldCount: splitChangedCanonical.counts.modalFieldModeCount,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
      resolution: 16,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 1,
    });
    const splitAggregateEquivalentSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldSlots: splitSlots,
        modalFieldPhaseSlots: splitAggregateEquivalentPhaseSlots,
        modalFieldCount: 2,
      });
    const splitChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitChangedPhaseSlots,
      modalFieldCount: 2,
    });

    modalBasisCache.activeDescriptor = compactDescriptor;

    expect(splitAggregateEquivalentSample.field).toBeCloseTo(
      compactSample.field,
      6,
    );
    expect(splitAggregateEquivalentSample.gradX).toBeCloseTo(
      compactSample.gradX,
      6,
    );
    expect(splitAggregateEquivalentSample.gradY).toBeCloseTo(
      compactSample.gradY,
      6,
    );
    expect(splitAggregateEquivalentSample.gradZ).toBeCloseTo(
      compactSample.gradZ,
      6,
    );
    expect(splitAggregateEquivalentDescriptor.identityPageAssignmentHash).toBe(
      compactDescriptor.identityPageAssignmentHash,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitAggregateEquivalentDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(splitChangedSample.field).not.toBeCloseTo(compactSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        splitChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("ignores zero-amplitude modal slots when resolving phase freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const slots = new Float32Array([1, 2, 3, 0.9, 2, 2, 2, 0]);
    const initialPhaseSlots = new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]);
    const zeroAmplitudePhaseChangedSlots = new Float32Array([
      0,
      0,
      1,
      1,
      Math.PI,
      0,
      1,
      1,
    ]);
    const contributingPhaseChangedSlots = new Float32Array([
      Math.PI,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 16,
    };
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      time: 0,
    });
    const zeroAmplitudePhaseChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: zeroAmplitudePhaseChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 1,
        time: 0,
      });
    const contributingPhaseChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: contributingPhaseChangedSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 2,
        phaseAuthority: 1,
        time: 0,
      });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: initialPhaseSlots,
    });
    const zeroAmplitudePhaseChangedSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldPhaseSlots: zeroAmplitudePhaseChangedSlots,
      });
    const contributingPhaseChangedSample =
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        modalFieldPhaseSlots: contributingPhaseChangedSlots,
      });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(zeroAmplitudePhaseChangedSample.field).toBeCloseTo(
      initialSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        zeroAmplitudePhaseChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(contributingPhaseChangedSample.field).not.toBeCloseTo(
      initialSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        contributingPhaseChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps live-synthesis phase diagnostics at finite coefficient precision", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const initialPhaseSlots = new Float32Array([1, 0, 1, 1]);
    const subBucketPhaseSlots = new Float32Array([1.002, 0, 1, 1]);
    const visiblePhaseSlots = new Float32Array([1.02, 0, 1, 1]);
    const sampleOptions = {
      modalFieldSlots: slots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 16,
    };
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: initialPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const subBucketDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: subBucketPhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const visibleDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: visiblePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      time: 0,
    });
    const initialSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: initialPhaseSlots,
    });
    const subBucketSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: subBucketPhaseSlots,
    });
    const visibleSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldPhaseSlots: visiblePhaseSlots,
    });

    modalBasisCache.activeDescriptor = initialDescriptor;

    expect(Math.abs(subBucketSample.field - initialSample.field)).toBeLessThan(
      0.005 * Math.SQRT2 ** 3,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        subBucketDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
    expect(visibleSample.field).not.toBeCloseTo(initialSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        visibleDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("weights live-synthesis phase diagnostics by normalized modal contribution", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialPhaseSlots = new Float32Array([0, 0, 0, 0, 0, 0, 1, 1]);
    const flippedPhaseSlots = new Float32Array([0, 0, 0, 0, Math.PI, 0, 1, 1]);
    const buildSlots = (secondaryAmplitude) =>
      new Float32Array([1, 1, 1, 1, 2, 2, 2, secondaryAmplitude]);
    const buildDescriptor = ({ slots, phaseSlots }) =>
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: phaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 1,
        time: 0,
        resolution: 8,
      });
    const sample = ({ slots, phaseSlots }) =>
      evaluateRaymarchLiveSynthesisFieldPoint({
        modalFieldSlots: slots,
        modalFieldPhaseSlots: phaseSlots,
        modalFieldCount: 2,
        boundaryMode: "neumann",
        radius: 3,
        x: 0,
        y: 0,
        z: 0,
        time: 0,
        resolution: 8,
      });

    const quietSlots = buildSlots(0.001);
    const quietInitialDescriptor = buildDescriptor({
      slots: quietSlots,
      phaseSlots: initialPhaseSlots,
    });
    const quietFlippedDescriptor = buildDescriptor({
      slots: quietSlots,
      phaseSlots: flippedPhaseSlots,
    });
    const quietInitialSample = sample({
      slots: quietSlots,
      phaseSlots: initialPhaseSlots,
    });
    const quietFlippedSample = sample({
      slots: quietSlots,
      phaseSlots: flippedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = quietInitialDescriptor;

    expect(
      Math.abs(quietFlippedSample.field - quietInitialSample.field),
    ).toBeLessThan(0.005 * Math.SQRT2 ** 3);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        quietFlippedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });

    const visibleSlots = buildSlots(0.03);
    const visibleInitialDescriptor = buildDescriptor({
      slots: visibleSlots,
      phaseSlots: initialPhaseSlots,
    });
    const visibleFlippedDescriptor = buildDescriptor({
      slots: visibleSlots,
      phaseSlots: flippedPhaseSlots,
    });
    const visibleInitialSample = sample({
      slots: visibleSlots,
      phaseSlots: initialPhaseSlots,
    });
    const visibleFlippedSample = sample({
      slots: visibleSlots,
      phaseSlots: flippedPhaseSlots,
    });

    modalBasisCache.activeDescriptor = visibleInitialDescriptor;

    expect(visibleFlippedSample.field).not.toBeCloseTo(
      visibleInitialSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        visibleFlippedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("does not rebuild for sine-equivalent phase carriers", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const positivePhaseSlots = new Float32Array([0.4, 0, 0.8, 0.9]);
    const negativePhaseSlots = new Float32Array([-0.4, 0, 0.8, 0.9]);
    const positiveDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: positivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const negativeDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: negativePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const positiveSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: positivePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const negativeSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: negativePhaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = positiveDescriptor;

    expect(negativeSample.field).toBeCloseTo(positiveSample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        negativeDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("keeps phase mode count diagnostic-only for cache freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.9]);
    const phaseSlots = new Float32Array([0.25, 0, 0.8, 0.9]);
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.72,
      time: 0,
    });
    const diagnosticCountDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.72,
      time: 0,
    });
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });
    const diagnosticCountSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      time: 0,
      resolution: 8,
    });

    modalBasisCache.activeDescriptor = descriptor;

    expect(diagnosticCountSample.field).toBeCloseTo(sample.field, 6);
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        diagnosticCountDescriptor,
      ),
    ).toMatchObject({ needsRebuild: false, reason: "unchanged" });
  });

  it("does not rebuild basis caches for relative coefficient envelope changes", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const firstSlots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]);
    const changedSlots = new Float32Array([1, 2, 3, 0.94, 2, 2, 4, 0.2]);
    const phaseSlots = new Float32Array([
      0.1, 0.2, 0.5, 0.6, 0.3, 0.1, 0.4, 0.5,
    ]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const firstSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 16,
    });
    const changedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 16,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      changed,
    );

    expect(changedSample.field).not.toBe(firstSample.field);
    expect(first).toHaveProperty("modalBasisCacheTopologyHash");
    expect(first.modalBasisCacheTopologyHash).toBe(
      changed.modalBasisCacheTopologyHash,
    );
    expect(first.modalBasisCacheSupportDiagnosticHash).not.toBe(
      changed.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("does not rebuild basis caches for coefficient redistribution", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 16,
    });
    const firstSlots = new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]);
    const changedSlots = new Float32Array([1, 2, 3, 0.3, 2, 2, 4, 0.8]);
    const phaseSlots = new Float32Array([
      0.1, 0.2, 0.5, 0.6, 0.3, 0.1, 0.4, 0.5,
    ]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const changed = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.7,
    });
    const firstSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: firstSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 16,
    });
    const changedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      modalFieldSlots: changedSlots,
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
      resolution: 16,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      changed,
    );

    expect(changedSample.field).not.toBeCloseTo(firstSample.field, 6);
    expect(first.modalBasisCacheTopologyHash).toBe(
      changed.modalBasisCacheTopologyHash,
    );
    expect(first.modalBasisCacheSupportDiagnosticHash).not.toBe(
      changed.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("does not rebuild modal-basis caches for aggregate phase authority changes", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const slots = new Float32Array([1, 2, 3, 0.5]);
    const first = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.2,
    });
    const second = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: slots,
      modalFieldPhaseSlots: new Float32Array([0.1, 0.2, 0.5, 0.6]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.8,
    });

    modalBasisCache.activeDescriptor = first;
    const rebuild = raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
      modalBasisCache,
      second,
    );

    expect(rebuild.needsRebuild).toBe(false);
    expect(rebuild.reason).toBe("unchanged");
  });

  it("submits modal-basis compute before live uniforms can advance", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    const observedTimes = [];
    const renderer = {
      computeAsync: async () => {
        observedTimes.push(options.uniforms.uTime.value);
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "modal-identity",
      options,
    );
    options.uniforms.uTime.value = 2;

    expect(result.enqueued).toBe(true);
    expect(observedTimes).toEqual([1]);

    await flushCacheMicrotasks();

    expect(modalBasisCache.activeDescriptor).toBeNull();
    expect(modalBasisCache.pendingDescriptor).toEqual(descriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    const commit =
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      );

    expect(commit).toMatchObject({ committed: true, descriptor });
    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
    expect(modalBasisCache.activePhaseSampleTimeSec).toBe(1);
  });

  it("promotes modal-basis rebuilds by swapping active and standby atlas textures", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialActiveTexture = modalBasisCache.texture;
    const initialStandbyTexture = modalBasisCache.pendingTexture;
    const descriptorA = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const descriptorB = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([2, 3, 4, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.2, 0.2, 0.7, 0.8]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    const renderer = {
      computeAsync: async () => {},
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "effective",
    };

    expect(initialActiveTexture).toBeTruthy();
    expect(initialStandbyTexture).toBeTruthy();
    expect(initialActiveTexture).not.toBe(initialStandbyTexture);

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptorA,
      "initial",
      options,
    );
    await flushCacheMicrotasks();

    expect(modalBasisCache.texture).toBe(initialActiveTexture);
    expect(modalBasisCache.pendingTexture).toBe(initialStandbyTexture);

    const commitA =
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      );

    expect(commitA).toMatchObject({
      committed: true,
      descriptor: descriptorA,
      texture: initialStandbyTexture,
    });
    expect(modalBasisCache.texture).toBe(initialStandbyTexture);
    expect(modalBasisCache.pendingTexture).toBe(initialActiveTexture);
    expect(modalBasisCache.activeDescriptor).toEqual(descriptorA);
    expect(modalBasisCache.pendingReady).toBe(false);

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptorB,
      "modal-identity",
      options,
    );
    await flushCacheMicrotasks();

    const commitB =
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      );

    expect(commitB).toMatchObject({
      committed: true,
      descriptor: descriptorB,
      texture: initialActiveTexture,
    });
    expect(modalBasisCache.texture).toBe(initialActiveTexture);
    expect(modalBasisCache.pendingTexture).toBe(initialStandbyTexture);
    expect(modalBasisCache.activeDescriptor).toEqual(descriptorB);
    expect(
      new Set([modalBasisCache.texture, modalBasisCache.pendingTexture]),
    ).toEqual(new Set([initialActiveTexture, initialStandbyTexture]));
    expect(modalBasisCache.lastError).toBeNull();
  });

  it("reuses retained basis kernels across ping-pong atlas promotions", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialStandbyTexture = modalBasisCache.pendingTexture;
    const initialActiveTexture = modalBasisCache.texture;
    const buildDescriptor = (modeIndex) =>
      buildRaymarchModalBasisCacheDescriptor({
        modalFieldSlots: new Float32Array([modeIndex, 2, 3, 0.5]),
        modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
        modalFieldCount: 1,
        boundaryMode: "neumann",
        radius: 3,
        phaseModeCount: 1,
        phaseAuthority: 0.42,
        basisCapacity: 1,
      });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(4) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(4) } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    const dispatchedNodes = [];
    const renderer = {
      computeAsync: async (node) => {
        dispatchedNodes.push(node);
      },
    };
    const nodeKey = getTestComputeNodeKey(1);
    const standbyTargetNode = {
      id: "kernel-standby-target",
      dispose: vi.fn(),
      raymarchModalBasisTargetTexture: initialStandbyTexture,
    };
    const activeTargetNode = {
      id: "kernel-active-target",
      dispose: vi.fn(),
      raymarchModalBasisTargetTexture: initialActiveTexture,
    };
    modalBasisCache.computeNodesByKey[nodeKey] = standbyTargetNode;
    modalBasisCache.standbyComputeNodesByKey = Object.create(null);
    modalBasisCache.standbyComputeNodesByKey[nodeKey] = activeTargetNode;

    for (const [index, expectedNode] of [
      standbyTargetNode,
      activeTargetNode,
      standbyTargetNode,
    ].entries()) {
      enqueueRaymarchModalBasisCacheRebuild(
        modalBasisCache,
        renderer,
        buildDescriptor(index + 1),
        index === 0 ? "initial" : "modal-identity",
        options,
      );
      await flushCacheMicrotasks();

      expect(dispatchedNodes[index]).toBe(expectedNode);
      expect(
        raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
          modalBasisCache,
        ),
      ).toMatchObject({ committed: true });
    }

    expect(standbyTargetNode.dispose).not.toHaveBeenCalled();
    expect(activeTargetNode.dispose).not.toHaveBeenCalled();
    expect(Object.values(modalBasisCache.computeNodesByKey)).toEqual([
      standbyTargetNode,
    ]);
    expect(Object.values(modalBasisCache.standbyComputeNodesByKey)).toEqual([
      activeTargetNode,
    ]);
  });

  it("does not promote modal-basis rebuilds when atlas textures are missing", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });

    modalBasisCache.pendingDescriptor = descriptor;
    modalBasisCache.pendingReady = true;
    modalBasisCache.texture = null;

    const commit =
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      );

    expect(commit).toEqual({
      committed: false,
      reason: "texture-missing",
    });
    expect(modalBasisCache.pendingDescriptor).toEqual(descriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    expect(modalBasisCache.lastError).toBe("cache-texture-missing");
    expect(modalBasisCache.lastRebuildReason).toBe("texture-missing");
    expect(modalBasisCache.ready).toBe(false);
  });

  it("queues semantic topology rebuilds until pending cache commit", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const activeDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 2, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const changedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 3, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const newestDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 4, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.1, 0.6, 0.7,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.42,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
      modalFieldCapacity: 2,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 2 },
      },
      schedulerTimeSec: 10.05,
    };
    let computeCalls = 0;
    const renderer = {
      computeAsync: async () => {
        computeCalls += 1;
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective",
    };
    modalBasisCache.ready = true;
    modalBasisCache.activeDescriptor = activeDescriptor;
    modalBasisCache.lastRebuildSubmittedAtSec = 10;

    const burst = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      changedDescriptor,
      "modal-identity",
      options,
    );
    expect(burst.enqueued).toBe(true);
    expect(computeCalls).toBe(1);
    await flushCacheMicrotasks();
    expect(modalBasisCache.activeDescriptor).toEqual(activeDescriptor);
    expect(modalBasisCache.pendingDescriptor).toEqual(changedDescriptor);
    expect(modalBasisCache.pendingReady).toBe(true);

    const secondSubmission = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      newestDescriptor,
      "modal-identity",
      {
        ...options,
        schedulerTimeSec: 10.06,
      },
    );
    const authority =
      raymarchFieldCache.resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        newestDescriptor,
      );

    expect(secondSubmission.enqueued).toBe(false);
    expect(secondSubmission.reason).toBe("pending");
    expect(computeCalls).toBe(1);
    expect(modalBasisCache.rebuildPending).toBe(false);
    expect(modalBasisCache.queuedDescriptor).toEqual(newestDescriptor);
    expect(authority).toMatchObject({
      drawable: true,
      state: "modal-basis-cache-ready-stale",
      staleReason: "modal-identity",
    });

    const commit =
      raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
        modalBasisCache,
      );
    expect(commit).toMatchObject({
      committed: true,
      descriptor: changedDescriptor,
    });
    expect(computeCalls).toBe(2);
    expect(modalBasisCache.rebuildPending).toBe(false);
    expect(modalBasisCache.pendingReady).toBe(true);
    expect(modalBasisCache.pendingDescriptor).toEqual(newestDescriptor);
    expect(modalBasisCache.queuedDescriptor).toBeNull();

    const submitted = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      newestDescriptor,
      "modal-identity",
      {
        ...options,
        schedulerTimeSec: 10.16,
      },
    );

    expect(submitted.enqueued).toBe(false);
    expect(submitted.reason).toBe("pending");
    expect(modalBasisCache.queuedDescriptor).toBeNull();
    expect(modalBasisCache.pendingReady).toBe(true);
    expect(computeCalls).toBe(2);
  });

  it("mirrors active modal-basis mode count from contributing modal terms", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]),
      modalFieldPhaseSlots: new Float32Array(8),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 0,
      phaseAuthority: 0,
      resolution: 8,
    });
    const renderer = {
      computeAsync: async () => {},
    };
    const options = {
      modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
      modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
      modalFieldCapacity: 2,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 2 },
      },
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "initial",
      options,
    );

    expect(descriptor.phaseModeCount).toBe(0);
    expect(descriptor.contributingBasisPageModeCount).toBe(2);
    expect(result.enqueued).toBe(true);

    await flushCacheMicrotasks();

    expect(modalBasisCache.pendingDescriptor).toEqual(descriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );

    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
    expect(modalBasisCache.activeBasisPageModeCount).toBe(2);
  });

  it("freezes modal-basis compute inputs at rebuild submission", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const modeArray = new Float32Array([1, 2, 3, 0.5]);
    const phaseArray = new Float32Array([0.1, 0.2, 0.6, 0.7]);
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: modeArray,
      modalFieldPhaseSlots: phaseArray,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const options = {
      modalFieldModeBuffer: { value: { array: modeArray } },
      modalFieldPhaseBuffer: { value: { array: phaseArray } },
      modalFieldCapacity: 1,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    };
    let resolveCompute;
    const renderer = {
      computeAsync: async () =>
        new Promise((resolve) => {
          resolveCompute = resolve;
        }),
    };
    const computeNodeKey = getTestComputeNodeKey(1);
    modalBasisCache.computeNodesByKey[computeNodeKey] = {
      id: "effective",
    };

    const result = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor,
      "initial",
      options,
    );
    modeArray.set([9, 9, 9, 0.05]);
    phaseArray.set([Math.PI, 4, 0.1, 0.2]);
    options.uniforms.uTime.value = 2;
    options.uniforms.uRadius.value = 4;
    options.uniforms.uModalFieldModeCount.value = 0;

    const inputSnapshot = modalBasisCache.computeInputsByKey?.[computeNodeKey];
    expect(result.enqueued).toBe(true);
    expect(inputSnapshot).toMatchObject({
      modalFieldModeBuffer: {
        value: {
          array: expect.any(Float32Array),
        },
      },
      modalFieldPhaseBuffer: null,
      uniforms: {
        uTime: { value: 1 },
        uRadius: { value: 3 },
        uModalFieldModeCount: { value: 1 },
      },
    });
    expect(
      Array.from(inputSnapshot.modalFieldModeBuffer.value.array.slice(0, 4)),
    ).toEqual([1, 2, 3, 0.5]);

    resolveCompute();
    await flushCacheMicrotasks();

    expect(modalBasisCache.pendingDescriptor).toEqual(descriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );

    expect(modalBasisCache.activeDescriptor).toEqual(descriptor);
  });

  it("freezes queued modal-basis compute inputs when queued behind a pending rebuild", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const initialDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.25]),
      modalFieldPhaseSlots: new Float32Array([0.05, 0.1, 0.2, 0.3]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.4,
      basisCapacity: 1,
    });
    const queuedModeArray = new Float32Array([4, 5, 6, 0.7]);
    const queuedPhaseArray = new Float32Array([0.2, 0.3, 0.8, 0.9]);
    const queuedUniforms = {
      uTime: { value: 4 },
      uRadius: { value: 5 },
      uModalFieldModeCount: { value: 1 },
    };
    const queuedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: queuedModeArray,
      modalFieldPhaseSlots: queuedPhaseArray,
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 5,
      time: 4,
      phaseModeCount: 1,
      phaseAuthority: 0.6,
      basisCapacity: 1,
    });
    const computeNodeKey = getTestComputeNodeKey(1);
    modalBasisCache.computeNodesByKey[computeNodeKey] = {
      id: "effective",
    };

    let resolveInitialCompute;
    const dispatchedNodes = [];
    const renderer = {
      computeAsync: async (node) => {
        dispatchedNodes.push(node);
        if (dispatchedNodes.length === 1) {
          return new Promise((resolve) => {
            resolveInitialCompute = resolve;
          });
        }
      },
    };

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      initialDescriptor,
      "initial",
      {
        modalFieldModeBuffer: {
          value: { array: new Float32Array([1, 2, 3, 0.25]) },
        },
        modalFieldPhaseBuffer: {
          value: { array: new Float32Array([0.05, 0.1, 0.2, 0.3]) },
        },
        modalFieldCapacity: 1,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 1 },
        },
      },
    );

    const queuedResult = enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      queuedDescriptor,
      "modal-identity",
      {
        modalFieldModeBuffer: { value: { array: queuedModeArray } },
        modalFieldPhaseBuffer: { value: { array: queuedPhaseArray } },
        modalFieldCapacity: 1,
        uniforms: queuedUniforms,
      },
    );
    queuedModeArray.set([9, 9, 9, 0.05]);
    queuedPhaseArray.set([Math.PI, 4, 0.1, 0.2]);
    queuedUniforms.uTime.value = 8;
    queuedUniforms.uRadius.value = 2;
    queuedUniforms.uModalFieldModeCount.value = 0;

    expect(queuedResult.enqueued).toBe(false);
    expect(queuedResult.reason).toBe("pending");
    expect(modalBasisCache.queuedDescriptor).toEqual(queuedDescriptor);
    expect(modalBasisCache.queuedDescriptorAtSec).toBe(4);

    resolveInitialCompute();
    await flushCacheMicrotasks();

    expect(dispatchedNodes).toHaveLength(1);
    expect(modalBasisCache.activeDescriptor).toBeNull();
    expect(modalBasisCache.pendingDescriptor).toEqual(initialDescriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );

    const inputSnapshot = modalBasisCache.computeInputsByKey?.[computeNodeKey];
    expect(dispatchedNodes).toHaveLength(2);
    const modeSnapshot = Array.from(
      inputSnapshot.modalFieldModeBuffer.value.array.slice(0, 4),
    );
    expect(modeSnapshot[0]).toBe(4);
    expect(modeSnapshot[1]).toBe(5);
    expect(modeSnapshot[2]).toBe(6);
    expect(modeSnapshot[3]).toBeCloseTo(0.7, 6);
    expect(inputSnapshot.modalFieldPhaseBuffer).toBeNull();
    expect(inputSnapshot.uniforms.uTime.value).toBe(4);
    expect(inputSnapshot.uniforms.uRadius.value).toBe(5);
    expect(inputSnapshot.uniforms.uModalFieldModeCount.value).toBe(1);

    await flushCacheMicrotasks();
    expect(modalBasisCache.pendingDescriptor).toEqual(queuedDescriptor);
    expect(modalBasisCache.pendingReady).toBe(true);
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );
    expect(modalBasisCache.activeDescriptor).toEqual(queuedDescriptor);
  });

  it("uses basis capacity as modal-basis compute-kernel identity", async () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const descriptor1 = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5]),
      modalFieldPhaseSlots: new Float32Array([0.1, 0.1, 0.6, 0.7]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 0.42,
      basisCapacity: 1,
    });
    const descriptor2 = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.5, 2, 3, 4, 0.35]),
      modalFieldPhaseSlots: new Float32Array([
        0.1, 0.1, 0.6, 0.7, 0.2, 0.2, 0.7, 0.8,
      ]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 0.49,
      basisCapacity: 2,
    });
    const dispatchedNodeIds = [];
    const renderer = {
      computeAsync: async (node) => {
        dispatchedNodeIds.push(node?.id ?? "unknown");
      },
    };

    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(1)] = {
      id: "effective-capacity-1",
    };
    modalBasisCache.computeNodesByKey[getTestComputeNodeKey(2)] = {
      id: "effective-capacity-2",
    };

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor1,
      "initial",
      {
        modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
        modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
        modalFieldCapacity: 1,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 1 },
        },
      },
    );
    await flushCacheMicrotasks();
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );

    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      descriptor2,
      "modal-identity",
      {
        modalFieldModeBuffer: { value: { array: new Float32Array(8) } },
        modalFieldPhaseBuffer: { value: { array: new Float32Array(8) } },
        modalFieldCapacity: 2,
        uniforms: {
          uTime: { value: 1 },
          uRadius: { value: 3 },
          uModalFieldModeCount: { value: 2 },
        },
      },
    );
    await flushCacheMicrotasks();
    raymarchFieldCache.commitRaymarchModalBasisCachePendingDescriptor(
      modalBasisCache,
    );

    expect(dispatchedNodeIds).toEqual([
      "effective-capacity-1",
      "effective-capacity-2",
    ]);
    expect(modalBasisCache.activeDescriptor).toEqual(descriptor2);
    expect(Object.keys(modalBasisCache.computeNodesByKey)).toContain(
      getTestComputeNodeKey(1),
    );
    expect(Object.keys(modalBasisCache.computeNodesByKey)).toContain(
      getTestComputeNodeKey(2),
    );
  });

  it("builds descriptors from topology and relative coefficient support", () => {
    const descriptorA = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const globalScaleDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.45, 2, 2, 4, 0.1]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const relativeSupportDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.94, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });
    const relativeEnvelopeDescriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.25]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(globalScaleDescriptor.modalFieldHash).toBe(
      descriptorA.modalFieldHash,
    );
    expect(relativeSupportDescriptor.modalFieldHash).not.toBe(
      descriptorA.modalFieldHash,
    );
    expect(relativeEnvelopeDescriptor.modalFieldHash).not.toBe(
      descriptorA.modalFieldHash,
    );
  });

  it("builds unified modal field descriptors without role-layer hashes", () => {
    const descriptor = buildRaymarchFieldCacheDescriptor({
      modalFieldSlots: new Float32Array([1, 2, 3, 0.9, 2, 2, 4, 0.2]),
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(descriptor.modalFieldCount).toBe(2);
    expect(descriptor.modalFieldHash).toBeTypeOf("number");
    expect(descriptor).not.toHaveProperty("backboneHash");
    expect(descriptor).not.toHaveProperty("detailHash");
    expect(descriptor).not.toHaveProperty("backboneCount");
    expect(descriptor).not.toHaveProperty("detailCount");
  });

  it("keeps field descriptors unchanged when only color slots change", () => {
    const first = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });
    const second = buildRaymarchFieldCacheDescriptor({
      backboneSlots: new Float32Array([1, 2, 3, 0.9]),
      detailSlots: new Float32Array([2, 2, 4, 0.2]),
      backboneCount: 1,
      detailCount: 1,
      boundaryMode: "neumann",
      radius: 3,
    });

    expect(second).toEqual(first);
  });

  it("applies phase inversion to the live scalar and gradient", () => {
    expect(evaluateRaymarchLiveSynthesisFieldPoint).toBeTypeOf("function");
    const slots = new Float32Array([1, 1, 1, 1]);
    const zeroPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
    });
    const invertedPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
    });

    expect(invertedPhase.field).toBeCloseTo(-zeroPhase.field, 6);
    expect(invertedPhase.gradX).toBeCloseTo(-zeroPhase.gradX, 6);
    expect(invertedPhase.gradY).toBeCloseTo(-zeroPhase.gradY, 6);
    expect(invertedPhase.gradZ).toBeCloseTo(-zeroPhase.gradZ, 6);
    expect(invertedPhase.modalBasisCachePhaseAuthority).toBe(1);
  });

  it("reports modal-basis bandwidth rejection separately from descriptor overflow", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 8, 8, 8, 0.25]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      descriptorOverflow: false,
      resolution: 8,
    });

    expect(descriptor.descriptorOverflow).toBe(false);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.bandwidthRejectedRawModalEnergy).toBeCloseTo(
      0.25 ** 2,
      6,
    );
    expect(descriptor.contributingBasisPageModeCount).toBe(1);
    expect(descriptor.contributingRawModalEnergy).toBeCloseTo(0.5 ** 2, 6);
    expect(descriptor.liveSynthesisResolvedRawModalEnergyRatio).toBeCloseTo(
      0.5 ** 2 / (0.5 ** 2 + 0.25 ** 2),
      6,
    );
    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeGreaterThan(0);
  });

  it("keeps bandwidth-rejected modes out of modal-basis freshness", () => {
    const modalBasisCache = raymarchFieldCache.createRaymarchModalBasisCache({
      resolution: 8,
    });
    const baseSlots = new Float32Array([1, 1, 1, 0.7, 9, 9, 9, 0.2]);
    const rejectedChangedSlots = new Float32Array([
      1, 1, 1, 0.7, 12, 12, 12, 0.9,
    ]);
    const representableChangedSlots = new Float32Array([
      2, 2, 2, 0.7, 9, 9, 9, 0.2,
    ]);
    const phaseSlots = new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]);
    const sampleOptions = {
      modalFieldPhaseSlots: phaseSlots,
      modalFieldCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      x: 0.2,
      y: -0.1,
      z: 0.4,
      time: 0,
      resolution: 8,
    };
    const baseDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...sampleOptions,
      modalFieldSlots: baseSlots,
    });
    const rejectedChangedDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...sampleOptions,
      modalFieldSlots: rejectedChangedSlots,
    });
    const representableChangedDescriptor =
      buildRaymarchModalBasisCacheDescriptor({
        ...sampleOptions,
        modalFieldSlots: representableChangedSlots,
      });
    const baseSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: baseSlots,
    });
    const rejectedChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: rejectedChangedSlots,
    });
    const representableChangedSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...sampleOptions,
      modalFieldSlots: representableChangedSlots,
    });

    modalBasisCache.activeDescriptor = baseDescriptor;

    expect(baseDescriptor.modalBasisCacheSupportDiagnosticHash).toBe(
      rejectedChangedDescriptor.modalBasisCacheSupportDiagnosticHash,
    );
    expect(rejectedChangedDescriptor.modalBasisCacheTopologyHash).toBe(
      baseDescriptor.modalBasisCacheTopologyHash,
    );
    expect(rejectedChangedSample.field).toBeCloseTo(baseSample.field, 6);
    expect(rejectedChangedSample.unsignedSupport).toBeCloseTo(
      baseSample.unsignedSupport,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        rejectedChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
    expect(representableChangedSample.field).not.toBeCloseTo(
      baseSample.field,
      6,
    );
    expect(
      raymarchFieldCache.shouldRebuildRaymarchModalBasisCache(
        modalBasisCache,
        representableChangedDescriptor,
      ),
    ).toMatchObject({ needsRebuild: true, reason: "modal-identity" });
  });

  it("uses structural modal energy for the live coefficient even at quadrature phase", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.contributingRawModalEnergy).toBeCloseTo(1, 6);
    expect(descriptor.contributingStructuralModalEnergy).toBeCloseTo(1, 6);
  });

  it("applies quadrature phase to the instantaneous field and support", () => {
    const slots = new Float32Array([1, 1, 1, 1]);
    const samplePoint = {
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 1.1,
      y: 0.3,
      z: -0.2,
      time: 0,
      resolution: 8,
    };
    const inPhase = evaluateRaymarchLiveSynthesisFieldPoint({
      ...samplePoint,
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
    });
    const quadrature = evaluateRaymarchLiveSynthesisFieldPoint({
      ...samplePoint,
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
    });

    expect(quadrature.field).toBeCloseTo(0, 6);
    expect(quadrature.gradX).toBeCloseTo(0, 6);
    expect(quadrature.gradY).toBeCloseTo(0, 6);
    expect(quadrature.gradZ).toBeCloseTo(0, 6);
    expect(inPhase.unsignedSupport).toBeGreaterThan(
      raymarchFieldCache.MODAL_BASIS_CACHE_ENERGY_EPSILON,
    );
    expect(quadrature.unsignedSupport).toBeLessThan(
      raymarchFieldCache.MODAL_BASIS_CACHE_ENERGY_EPSILON,
    );
    expect(inPhase.cancellationRatio).toBeLessThan(0.5);
    expect(quadrature.cancellationRatio).toBe(0);
  });

  it("uses structural gradient envelope even at quadrature phase", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([Math.PI / 2, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeGreaterThan(0);
    expect(descriptor.liveSynthesisStructuralGradientEnvelope).toBeCloseTo(
      descriptor.liveSynthesisRawGradientEnvelope,
      6,
    );
  });

  it("uses the shifted Dirichlet half-domain gradient scale in diagnostics", () => {
    const radius = 3;
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      (Math.hypot(1, 1, 1) * Math.PI) / (2 * radius),
      6,
    );
  });

  it("weights live-synthesis gradient diagnostics by modal energy", () => {
    const radius = 3;
    const primaryCoefficient = 1;
    const quietCoefficient = 0.25;
    const primaryGradientBound = (Math.hypot(1, 1, 1) * Math.PI) / radius;
    const quietGradientBound = (Math.hypot(2, 2, 2) * Math.PI) / radius;
    const expectedEnergyWeightedEnvelope =
      (primaryCoefficient ** 2 * primaryGradientBound +
        quietCoefficient ** 2 * quietGradientBound) /
      (primaryCoefficient ** 2 + quietCoefficient ** 2);
    const staleAmplitudeWeightedEnvelope =
      (primaryCoefficient * primaryGradientBound +
        quietCoefficient * quietGradientBound) /
      (primaryCoefficient + quietCoefficient);

    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([
        1,
        1,
        1,
        primaryCoefficient,
        2,
        2,
        2,
        quietCoefficient,
      ]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius,
      resolution: 8,
    });

    expect(descriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      expectedEnergyWeightedEnvelope,
      6,
    );
    expect(descriptor.liveSynthesisRawGradientEnvelope).not.toBeCloseTo(
      staleAmplitudeWeightedEnvelope,
      6,
    );
  });

  it("reports duplicate modal-basis diagnostics as canonical modal terms", () => {
    const compactSlots = new Float32Array([1, 1, 1, 0.6, 2, 2, 2, 0.4]);
    const splitSlots = new Float32Array([
      1, 1, 1, 0.35, 1, 1, 1, 0.25, 2, 2, 2, 0.4,
    ]);
    const compactPhaseSlots = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
    const splitPhaseSlots = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    const descriptorOptions = {
      boundaryMode: "neumann",
      radius: 3,
      resolution: 8,
    };
    const compactDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...descriptorOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
    });
    const splitDescriptor = buildRaymarchModalBasisCacheDescriptor({
      ...descriptorOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitPhaseSlots,
      modalFieldCount: 3,
    });
    const compactSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...descriptorOptions,
      modalFieldSlots: compactSlots,
      modalFieldPhaseSlots: compactPhaseSlots,
      modalFieldCount: 2,
      x: 0.2,
      y: 0.1,
      z: -0.15,
    });
    const splitSample = evaluateRaymarchLiveSynthesisFieldPoint({
      ...descriptorOptions,
      modalFieldSlots: splitSlots,
      modalFieldPhaseSlots: splitPhaseSlots,
      modalFieldCount: 3,
      x: 0.2,
      y: 0.1,
      z: -0.15,
    });

    expect(splitSample.field).toBeCloseTo(compactSample.field, 6);
    expect(splitDescriptor.modalFieldCount).toBe(
      compactDescriptor.modalFieldCount,
    );
    expect(splitDescriptor.contributingBasisPageModeCount).toBe(
      compactDescriptor.contributingBasisPageModeCount,
    );
    expect(splitDescriptor.contributingRawModalEnergy).toBeCloseTo(
      compactDescriptor.contributingRawModalEnergy,
      6,
    );
    expect(splitDescriptor.liveSynthesisRawGradientEnvelope).toBeCloseTo(
      compactDescriptor.liveSynthesisRawGradientEnvelope,
      6,
    );
    expect(splitSample.contributingBasisPageModeCount).toBe(
      compactSample.contributingBasisPageModeCount,
    );
    expect(splitSample.contributingRawModalEnergy).toBeCloseTo(
      compactSample.contributingRawModalEnergy,
      6,
    );
  });

  it("normalizes live field values from the representable contributing set", () => {
    const lowModeSlots = new Float32Array([1, 1, 1, 1]);
    const mixedSlots = new Float32Array([1, 1, 1, 1, 8, 8, 8, 1]);
    const lowOnly = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: lowModeSlots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });
    const mixed = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: mixedSlots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 0,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });

    expect(mixed.field).toBeCloseTo(lowOnly.field, 6);
    expect(mixed.gradX).toBeCloseTo(lowOnly.gradX, 6);
    expect(mixed.gradY).toBeCloseTo(lowOnly.gradY, 6);
    expect(mixed.gradZ).toBeCloseTo(lowOnly.gradZ, 6);
    expect(mixed.bandwidthRejectedModeCount).toBe(1);
    expect(mixed.bandwidthRejectedRawModalEnergy).toBeCloseTo(1, 6);
  });

  it("reports live-synthesis unsigned support when signed modes cancel", () => {
    const sample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
      time: 0,
      resolution: 8,
    });

    expect(Math.abs(sample.field)).toBeLessThan(0.001);
    expect(sample.unsignedSupport).toBeGreaterThan(0.9);
    expect(sample.cancellationRatio).toBeGreaterThan(0.95);
  });

  it("summarizes live-synthesis support and cancellation diagnostics", () => {
    const audit = buildModalBasisAuditDiagnostics({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(audit.liveSynthesisUnsignedSupportMean).toBeGreaterThan(0.1);
    expect(audit.liveSynthesisCancellationRatioMean).toBeGreaterThan(0.95);
    expect(audit.liveSynthesisCancellationRatioMax).toBeGreaterThan(0.95);
    expect(audit.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(audit.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(7);
    expect(audit.liveSynthesisSupportDiagnosticCoverage).toBeCloseTo(7 / 9, 6);
    expect(audit.liveSynthesisUnsignedSupportMean).toBeCloseTo(
      (7 / 9) * Math.SQRT2 ** 3,
      6,
    );
  });

  it("keeps audit support diagnostics equivalent to public field samples", () => {
    const radius = 3;
    const samplePoints = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ];
    const sampleOptions = {
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
    };
    const audit = buildModalBasisAuditDiagnostics(sampleOptions);
    const samples = samplePoints.map(([x, y, z]) =>
      evaluateRaymarchLiveSynthesisFieldPoint({
        ...sampleOptions,
        x: x * radius,
        y: y * radius,
        z: z * radius,
      }),
    );
    const supportedSamples = samples.filter(
      (sample) => sample.unsignedSupport > 0.01,
    );
    const expectedSupportMean =
      samples.reduce((sum, sample) => sum + sample.unsignedSupport, 0) /
      samples.length;
    const expectedCancellationMean =
      supportedSamples.reduce(
        (sum, sample) => sum + sample.cancellationRatio,
        0,
      ) / supportedSamples.length;
    const expectedCancellationMax = Math.max(
      ...supportedSamples.map((sample) => sample.cancellationRatio),
    );

    expect(audit.liveSynthesisSupportDiagnosticSampleCount).toBe(
      samplePoints.length,
    );
    expect(audit.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(
      supportedSamples.length,
    );
    expect(audit.liveSynthesisUnsignedSupportMean).toBeCloseTo(
      expectedSupportMean,
      6,
    );
    expect(audit.liveSynthesisCancellationRatioMean).toBeCloseTo(
      expectedCancellationMean,
      6,
    );
    expect(audit.liveSynthesisCancellationRatioMax).toBeCloseTo(
      expectedCancellationMax,
      6,
    );
  });

  it("includes unsupported diagnostic points in unsigned support mean", () => {
    const audit = buildModalBasisAuditDiagnostics({
      backboneSlots: new Float32Array([1, 1, 1, 1]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius: 3,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 8,
    });

    expect(audit.liveSynthesisSupportDiagnosticSampleCount).toBe(9);
    expect(audit.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(3);
    expect(audit.liveSynthesisSupportDiagnosticCoverage).toBeCloseTo(1 / 3, 6);
    expect(audit.liveSynthesisUnsignedSupportMean).toBeLessThan(
      Math.SQRT2 ** 3 * audit.liveSynthesisSupportDiagnosticCoverage,
    );
  });

  it("samples modal-basis support antinodes when fixed points are modal nodes", () => {
    const radius = 3;
    const slots = new Float32Array([4, 4, 4, 1]);
    const phaseSlots = new Float32Array([0, 0, 1, 1]);
    const audit = buildModalBasisAuditDiagnostics({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: phaseSlots,
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      phaseModeCount: 1,
      phaseAuthority: 1,
      resolution: 16,
    });
    const antinodeSample = evaluateRaymarchLiveSynthesisFieldPoint({
      backboneSlots: slots,
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: phaseSlots,
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 1,
      detailCount: 0,
      boundaryMode: "dirichlet",
      radius,
      x: radius * 0.25,
      y: radius * 0.25,
      z: radius * 0.25,
      time: 0,
      resolution: 16,
    });

    expect(antinodeSample.unsignedSupport).toBeGreaterThan(0.95);
    expect(audit.liveSynthesisSupportDiagnosticSampleCount).toBeGreaterThan(9);
    expect(audit.liveSynthesisSupportDiagnosticSupportedSampleCount).toBe(1);
    expect(audit.liveSynthesisUnsignedSupportMean).toBeGreaterThan(0);
  });

  it("omits sampled-support fields from the rebuild descriptor", () => {
    const options = {
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, Math.PI, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
    };
    const descriptor = buildRaymarchModalBasisCacheDescriptor(options);

    expect(descriptor.liveSynthesisUnsignedSupportMean).toBeUndefined();
    expect(descriptor.liveSynthesisCancellationRatioMean).toBeUndefined();
    expect(descriptor.liveSynthesisCancellationRatioMax).toBeUndefined();
    expect(
      descriptor.liveSynthesisSupportDiagnosticSampleCount,
    ).toBeUndefined();
    expect(
      descriptor.liveSynthesisSupportDiagnosticSupportedSampleCount,
    ).toBeUndefined();
    expect(descriptor.liveSynthesisSupportDiagnosticCoverage).toBeUndefined();

    expect(descriptor.contributingBasisPageModeCount).toBeGreaterThan(0);
    expect(
      Number.isFinite(descriptor.modalBasisCacheSupportDiagnosticHash),
    ).toBe(true);

    const audit = buildModalBasisAuditDiagnostics(options);
    expect(audit.liveSynthesisUnsignedSupportMean).toBeGreaterThan(0);
    expect(audit.liveSynthesisSupportDiagnosticSampleCount).toBeGreaterThan(0);
  });

  it("keeps rebuild hashes stable across phase and time when page assignment is unchanged", () => {
    const baseOptions = {
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 1, 1, 1, 0.5]),
      detailSlots: new Float32Array(0),
      backbonePhaseSlots: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
      detailPhaseSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 2,
      phaseAuthority: 1,
      resolution: 8,
      time: 0,
    };
    const baseline = buildRaymarchModalBasisCacheDescriptor(baseOptions);
    const advanced = buildRaymarchModalBasisCacheDescriptor({
      ...baseOptions,
      backbonePhaseSlots: new Float32Array([
        Math.PI / 2,
        0,
        1,
        1,
        Math.PI,
        0,
        1,
        1,
      ]),
      time: 2.5,
    });

    expect(advanced.identityPageAssignmentHash).toBe(
      baseline.identityPageAssignmentHash,
    );
    expect(advanced.representableDomainHash).toBe(
      baseline.representableDomainHash,
    );
    expect(advanced.modalBasisCacheSupportDiagnosticHash).toBe(
      baseline.modalBasisCacheSupportDiagnosticHash,
    );
    expect(advanced.modalBasisCacheTopologyHash).toBe(
      baseline.modalBasisCacheTopologyHash,
    );
  });

  it("reports zero-amplitude modal-basis slots skipped before representability", () => {
    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      backboneSlots: new Float32Array([
        1, 1, 1, 0.5, 2, 2, 2, 0, 3, 3, 3, 0.25,
      ]),
      detailSlots: new Float32Array([4, 4, 4, 0, 5, 5, 5, 0.1]),
      backbonePhaseSlots: new Float32Array(12),
      detailPhaseSlots: new Float32Array(8),
      backboneCount: 3,
      detailCount: 2,
      boundaryMode: "neumann",
      radius: 3,
      phaseModeCount: 3,
      phaseAuthority: 1,
      resolution: 32,
    });

    expect(descriptor.zeroAmplitudeSkippedModeCount).toBe(2);
    expect(descriptor.contributingBasisPageModeCount).toBe(3);
    expect(descriptor.bandwidthRejectedModeCount).toBe(0);
  });

  it("reports destructive interference against unsigned modal potential", () => {
    const sample = evaluateRaymarchSignedPotentialAtPoint({
      backboneSlots: new Float32Array([1, 1, 1, 0.5, 2, 2, 2, 0.5]),
      detailSlots: new Float32Array(0),
      backboneCount: 2,
      detailCount: 0,
      boundaryMode: "neumann",
      radius: 3,
      x: 3,
      y: 0,
      z: 0,
    });

    expect(Math.abs(sample.signedPotential)).toBeLessThan(0.001);
    expect(sample.unsignedPotential).toBeGreaterThan(0.9);
    expect(sample.cancellation).toBeGreaterThan(0.95);
  });
});

describe("sumLiveSynthesisRepresentableUploadWeight", () => {
  it("rejects the cell-centered Neumann Nyquist null from cache admission", () => {
    const resolution = raymarchFieldCache.RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
    const radius = 3;
    const nyquistModeIndex = resolution / 2;
    const nyquistSlots = new Float32Array([
      nyquistModeIndex,
      nyquistModeIndex,
      nyquistModeIndex,
      1,
    ]);
    let maxScalarMagnitude = 0;

    for (let voxelIndex = 0; voxelIndex < resolution; voxelIndex += 1) {
      const x = (((voxelIndex + 0.5) / resolution) * 2 - 1) * radius;
      const sample = evaluateRaymarchSignedPotentialAtPoint({
        modalFieldSlots: nyquistSlots,
        modalFieldCount: 1,
        boundaryMode: "neumann",
        radius,
        x,
        y: x,
        z: x,
      });
      maxScalarMagnitude = Math.max(
        maxScalarMagnitude,
        Math.abs(sample.signedPotential),
      );
    }

    expect(maxScalarMagnitude).toBeLessThan(1e-10);
    expect(raymarchFieldCache.RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE).toBe(
      4,
    );
    expect(
      raymarchFieldCache.getModalBasisCacheMaxRepresentableModeIndex(
        resolution,
      ),
    ).toBe(16);
    expect(
      raymarchFieldCache.sumLiveSynthesisRepresentableUploadWeight({
        modalFieldSlots: nyquistSlots,
        activeCount: 1,
        resolution,
      }),
    ).toBe(0);

    const descriptor = buildRaymarchModalBasisCacheDescriptor({
      modalFieldSlots: nyquistSlots,
      modalFieldPhaseSlots: new Float32Array([0, 0, 1, 1]),
      modalFieldCount: 1,
      boundaryMode: "neumann",
      radius,
      resolution,
    });
    expect(descriptor.contributingBasisPageModeCount).toBe(0);
    expect(descriptor.modalBasisCacheMinSamplesPerCycle).toBe(4);
    expect(descriptor.contributingRawModalEnergy).toBe(0);
    expect(descriptor.bandwidthRejectedModeCount).toBe(1);
    expect(descriptor.bandwidthRejectedRawModalEnergy).toBeCloseTo(1, 6);
    expect(descriptor.liveSynthesisResolvedRawModalEnergyRatio).toBe(0);
    expect(descriptor.modalBasisCacheDrawable).toBe(false);
    expect(descriptor.modalBasisCacheBlockedReason).toBe(
      "no-contributing-basis-pages",
    );
  });

  it("counts only bandwidth-representable uploaded modes", () => {
    const resolution = raymarchFieldCache.RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
    const maxModeIndex =
      raymarchFieldCache.getModalBasisCacheMaxRepresentableModeIndex(
        resolution,
      );
    const slots = new Float32Array(16);
    slots[3] = 0.5;
    slots[0] = maxModeIndex + 8;
    slots[7] = 0.25;
    slots[4] = 2;
    slots[5] = 2;
    slots[6] = 2;

    expect(
      raymarchFieldCache.sumLiveSynthesisRepresentableUploadWeight({
        modalFieldSlots: slots,
        activeCount: 2,
        resolution,
      }),
    ).toBeCloseTo(0.25);
  });
});
