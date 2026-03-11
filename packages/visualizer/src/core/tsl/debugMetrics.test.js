import { describe, expect, it } from "vitest";
import {
  computeNodalFieldMetrics,
  computeParticleDebugMetrics,
  computeScalarFieldGradient,
  computeScalarFieldValue,
} from "./debugMetrics.js";
import { updateAuditSnapshot } from "./auditMirror.js";

function createHarness({
  fieldState = "active",
  activeModeCount = 1,
  flowStrength = 0.25,
  flowMix = 0.08,
  particleSpeed = 8,
  attractionStrength = 14,
  centerSuppressionInner = 0.12,
  centerSuppressionOuter = 0.45,
  modeSlots = new Float32Array([1, 1, 1, 1]),
} = {}) {
  const sampleIndices = new Uint32Array([0, 1, 2, 3]);
  const basePositions = new Float32Array([
    0.1, 0.1, 0.1, 0.12, 0.08, 0.1, 0.28, 0.16, 0.18, 0.46, 0.22, 0.18,
  ]);
  const shadowParticles = new Float32Array([
    0.08, 0.06, 0.08, 0.18, 0.12, 0.2, 0.32, 0.16, 0.18, 0.46, 0.22, 0.16,
  ]);
  const shadowVelocities = new Float32Array(sampleIndices.length * 3);
  const sampleBaryon = new Float32Array([
    0.4, 0.02, 0.0, 0.5, 0.08, 0.0, 0.6, 0.1, 0.0, 0.7, 0.12, 0.0,
  ]);

  return {
    sampleIndices,
    basePositions,
    shadowParticles,
    shadowVelocities,
    sampleBaryon,
    modeSlots,
    radius: 1,
    threshold: 0.05,
    surfaceThreshold: 0.05,
    flowStrength,
    flowFrequency: 0.5,
    flowMix,
    particleSpeed,
    attractionStrength,
    velocityDamping: 0.88,
    centerSuppressionInner,
    centerSuppressionOuter,
    structureMin: 0.08,
    structureMax: 0.4,
    surfaceControl: 1,
    idleScale: 1,
    activeModeCount,
    fieldState,
    time: 0,
    deltaTime: 1 / 60,
  };
}

describe("particle debug metrics", () => {
  it("computes scalar field values deterministically", () => {
    const value = computeScalarFieldValue(
      0.2,
      0.0,
      0.2,
      new Float32Array([1, 1, 1, 1]),
      1,
    );
    expect(value).toBeCloseTo(0);
  });

  it("computes analytic gradients deterministically", () => {
    const gradient = computeScalarFieldGradient(
      0.5,
      0.5,
      0.5,
      new Float32Array([1, 1, 1, 1]),
      1,
    );
    expect(gradient.x).toBeCloseTo(0, 5);
    expect(gradient.y).toBeCloseTo(0, 5);
    expect(gradient.z).toBeCloseTo(0, 5);
  });

  it("reports no field occupancy when no active modes exist", () => {
    const snapshot = computeParticleDebugMetrics(
      createHarness({ activeModeCount: 0 }),
    );
    expect(snapshot.fieldPopulated).toBe(false);
    expect(snapshot.fieldPopulationRatio).toBe(0);
    expect(snapshot.highPotentialOccupancy).toBe(0);
    expect(snapshot.idleFallbackActive).toBe(true);
  });

  it("reports populated nodal structure for a steady valid modal stack", () => {
    const snapshot = computeParticleDebugMetrics(createHarness());
    expect(snapshot.fieldPopulationRatio).toBeGreaterThan(0);
    expect(snapshot.highPotentialOccupancy).toBeGreaterThanOrEqual(0);
    expect(snapshot.fieldDriven).toBe(true);
    expect(snapshot.avgAttractionContribution).toBeGreaterThan(0);
  });

  it("reduces origin potential when center suppression is enabled", () => {
    const modeSlots = new Float32Array([1, 1, 1, 1]);
    const unsuppressed = computeNodalFieldMetrics({
      x: 0.1,
      y: 0.1,
      z: 0.1,
      modeSlots,
      radius: 1,
      threshold: 0.05,
      surfaceThreshold: 0.05,
      surfaceControl: 1,
      centerSuppressionInner: 0,
      centerSuppressionOuter: 0,
      structureMin: 0.08,
      structureMax: 0.4,
    });
    const suppressed = computeNodalFieldMetrics({
      x: 0.1,
      y: 0.1,
      z: 0.1,
      modeSlots,
      radius: 1,
      threshold: 0.05,
      surfaceThreshold: 0.05,
      surfaceControl: 1,
      centerSuppressionInner: 0.12,
      centerSuppressionOuter: 0.45,
      structureMin: 0.08,
      structureMax: 0.4,
    });

    expect(suppressed.potential).toBeLessThan(unsuppressed.potential);
  });

  it("keeps idle fallback numerically distinct from field-driven states", () => {
    const idleSnapshot = computeParticleDebugMetrics(
      createHarness({ fieldState: "idle", activeModeCount: 0 }),
    );
    const activeSnapshot = computeParticleDebugMetrics(createHarness());

    expect(idleSnapshot.idleFallbackActive).toBe(true);
    expect(activeSnapshot.idleFallbackActive).toBe(false);
    expect(idleSnapshot.avgAttractionContribution).toBe(0);
    expect(activeSnapshot.avgAttractionContribution).toBeGreaterThan(0);
  });

  it("keeps attraction dominant over flow during stable active motion", () => {
    const snapshot = computeParticleDebugMetrics(
      createHarness({
        flowStrength: 1,
        flowMix: 0.04,
        attractionStrength: 20,
      }),
    );

    expect(snapshot.avgFlowContribution).toBeGreaterThan(0);
    expect(snapshot.attractionDominant).toBe(true);
    expect(snapshot.attractionToFlowRatio).toBeGreaterThan(1);
  });

  it("pushes center-heavy particles outward during active motion", () => {
    const harness = createHarness();
    harness.shadowParticles.set([
      0.02, 0.02, 0.02, 0.03, 0.02, 0.03, 0.04, 0.03, 0.03, 0.05, 0.03, 0.04,
    ]);

    const initialRadius =
      harness.shadowParticles.reduce((sum, value, index) => {
        if (index % 3 !== 2) return sum;
        const offset = index - 2;
        return (
          sum +
          Math.hypot(
            harness.shadowParticles[offset],
            harness.shadowParticles[offset + 1],
            harness.shadowParticles[offset + 2],
          )
        );
      }, 0) / 4;

    let snapshot = null;
    for (let i = 0; i < 12; i++) {
      snapshot = computeParticleDebugMetrics(harness);
    }

    expect(snapshot.avgCenterEscapeContribution).toBeGreaterThan(0);
    expect(snapshot.avgParticleRadius).toBeGreaterThan(initialRadius);
  });

  it("reports an empty field and no attraction when all mode slots are zero", () => {
    const snapshot = computeParticleDebugMetrics(
      createHarness({ modeSlots: new Float32Array(4), activeModeCount: 0 }),
    );

    expect(snapshot.fieldPopulated).toBe(false);
    expect(snapshot.avgAttractionContribution).toBe(0);
    expect(snapshot.idleFallbackActive).toBe(true);
  });

  it("reflects continuity lifecycle flags without broad resets", () => {
    const snapshot = computeParticleDebugMetrics({
      ...createHarness(),
      lifecycle: {
        modeSlotsChanged: true,
        resetTriggered: false,
        resetReason: "none",
      },
    });

    expect(snapshot.modeSlotsChanged).toBe(true);
    expect(snapshot.resetTriggered).toBe(false);
    expect(snapshot.continuityMode).toBe("inertia");
  });

  it("propagates nodal-flow diagnostics through updateAuditSnapshot", () => {
    const audit = {
      frame: 0,
      sampleIndices: new Uint32Array([0, 1, 2, 3]),
      shadowParticles: new Float32Array([
        0.08, 0.06, 0.08, 0.11, 0.07, 0.09, 0.14, 0.09, 0.1, 0.18, 0.1, 0.12,
      ]),
      shadowVelocities: new Float32Array(12),
      sampleBaryon: new Float32Array([
        0.2, 0.02, 0.0, 0.24, 0.03, 0.0, 0.28, 0.04, 0.0, 0.32, 0.05, 0.0,
      ]),
      lastSnapshot: null,
    };
    const tslState = {
      audit,
      basePositions: new Float32Array([
        0.1, 0.1, 0.1, 0.12, 0.08, 0.1, 0.16, 0.1, 0.12, 0.2, 0.12, 0.14,
      ]),
      uniforms: {
        uRadius: { value: 1 },
        uThreshold: { value: 0.05 },
        uSurfaceThreshold: { value: 0.05 },
        uFlowFieldStrength: { value: 0.1 },
        uFlowFieldFrequency: { value: 0.5 },
        uFlowMix: { value: 0.08 },
        uParticleSpeed: { value: 6 },
        uAttractionStrength: { value: 14 },
        uVelocityDamping: { value: 0.88 },
        uCenterSuppressionInner: { value: 0.12 },
        uCenterSuppressionOuter: { value: 0.45 },
        uStructureMin: { value: 0.08 },
        uStructureMax: { value: 0.4 },
        uSurfaceControl: { value: 1 },
        uIdleLogoSize: { value: 1 },
        uActiveModeCount: { value: 1 },
        uTime: { value: 0 },
      },
    };
    const featureFrame = {
      fieldState: "active",
      modeSlots: new Float32Array([1, 1, 1, 1]),
    };

    const snapshot = updateAuditSnapshot(tslState, featureFrame, 1 / 60, {
      modeSlotsChanged: true,
      resetTriggered: false,
      resetReason: "none",
    });

    expect(snapshot.resetTriggered).toBe(false);
    expect(snapshot.continuityMode).toBe("inertia");
    expect(snapshot.fieldPopulationRatio).toBeGreaterThan(0);
    expect(snapshot.centerParticleOccupancy).toBeGreaterThan(0);
    expect(snapshot.avgAttractionContribution).toBeGreaterThan(0);
    expect(audit.lastSnapshot).toEqual(snapshot);
  });
});
