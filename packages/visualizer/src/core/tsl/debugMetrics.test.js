import { describe, expect, it } from "vitest";
import {
  computeParticleDebugMetrics,
  computeScalarFieldValue,
} from "./debugMetrics.js";
import { updateAuditSnapshot } from "./auditMirror.js";

function createHarness({
  fieldState = "active",
  activeModeCount = 1,
  flowStrength = 0.25,
  particleSpeed = 8,
  modeSlots = new Float32Array([1, 1, 1, 1]),
} = {}) {
  const sampleIndices = new Uint32Array([0, 1, 2, 3]);
  const basePositions = new Float32Array([
    0.2, 0.0, 0.2,
    0.35, 0.0, 0.35,
    0.55, 0.0, 0.1,
    0.82, 0.0, 0.0,
  ]);
  const shadowParticles = new Float32Array([
    0.02, 0.0, 0.02,
    0.08, 0.0, 0.08,
    0.25, 0.0, 0.1,
    0.7, 0.0, 0.0,
  ]);
  const retainedTargets = new Float32Array(sampleIndices.length * 4);
  const sampleBaryon = new Float32Array([
    0.4, 0.0, 0.0,
    0.5, 0.0, 0.0,
    0.6, 0.0, 0.0,
    0.7, 0.0, 0.0,
  ]);

  const radius = 1;
  const common = {
    sampleIndices,
    basePositions,
    shadowParticles,
    retainedTargets,
    sampleBaryon,
    modeSlots,
    radius,
    threshold: 0.05,
    surfaceThreshold: 0.05,
    flowInfluence: 0.5,
    flowStrength,
    flowFrequency: 0.5,
    particleSpeed,
    distanceThreshold: 1,
    movementType: 1,
    surfaceControl: 1,
    idleScale: 1,
    activeModeCount,
    fieldState,
    time: 0,
    deltaTime: 1 / 60,
  };

  return common;
}

describe("particle debug metrics", () => {
  it("computes scalar field values deterministically", () => {
    const value = computeScalarFieldValue(0.2, 0.0, 0.2, new Float32Array([1, 1, 1, 1]), 1);
    expect(value).toBeCloseTo(0);
  });

  it("reports zero occupancy when no active modes exist", () => {
    const snapshot = computeParticleDebugMetrics(createHarness({ activeModeCount: 0 }));
    expect(snapshot.zeroPointOccupancy).toBe(0);
    expect(snapshot.zeroPointValidCount).toBe(0);
    expect(snapshot.idleFallbackActive).toBe(false);
  });

  it("reports non-zero occupancy for a steady valid modal stack", () => {
    const snapshot = computeParticleDebugMetrics(createHarness());
    expect(snapshot.zeroPointOccupancy).toBeGreaterThan(0);
    expect(snapshot.zeroPointValidCount).toBeGreaterThan(0);
    expect(snapshot.fieldDriven).toBe(true);
  });

  it("detects center-heavy particles and targets", () => {
    const harness = createHarness({ activeModeCount: 0 });
    harness.shadowParticles.set([
      0.01, 0.0, 0.01,
      0.03, 0.0, 0.03,
      0.05, 0.0, 0.05,
      0.07, 0.0, 0.07,
    ]);
    harness.retainedTargets.set([
      0.02, 0.0, 0.02, 2,
      0.03, 0.0, 0.03, 2,
      0.04, 0.0, 0.04, 2,
      0.05, 0.0, 0.05, 2,
    ]);
    const snapshot = computeParticleDebugMetrics(harness);
    expect(snapshot.centerParticleOccupancy).toBeGreaterThanOrEqual(0.5);
    expect(snapshot.centerTargetOccupancy).toBeGreaterThanOrEqual(0.5);
  });

  it("distinguishes idle fallback from field-driven state", () => {
    const idleSnapshot = computeParticleDebugMetrics(createHarness({ fieldState: "idle", activeModeCount: 0 }));
    const activeSnapshot = computeParticleDebugMetrics(createHarness());

    expect(idleSnapshot.idleFallbackActive).toBe(true);
    expect(activeSnapshot.idleFallbackActive).toBe(false);
    expect(idleSnapshot.avgTargetRadius).not.toBe(activeSnapshot.avgTargetRadius);
  });

  it("measures flow and lerp motion separately", () => {
    const highFlow = computeParticleDebugMetrics(createHarness({ flowStrength: 6, particleSpeed: 1 }));
    const highLerp = computeParticleDebugMetrics(createHarness({ flowStrength: 0, particleSpeed: 40 }));

    expect(highFlow.avgFlowMovement).toBeGreaterThan(0);
    expect(highFlow.flowToLerpRatio).toBeGreaterThan(highLerp.flowToLerpRatio);
    expect(highLerp.avgLerpMovement).toBeGreaterThan(0);
  });

  it("reflects reset lifecycle flags in the snapshot", () => {
    const snapshot = computeParticleDebugMetrics({
      ...createHarness(),
      lifecycle: {
        modeSlotsChanged: true,
        resetTriggered: true,
        resetReason: "mode-change",
      },
    });

    expect(snapshot.modeSlotsChanged).toBe(true);
    expect(snapshot.resetTriggered).toBe(true);
    expect(snapshot.resetReason).toBe("mode-change");
  });

  it("propagates lifecycle and retained-target state through updateAuditSnapshot", () => {
    const audit = {
      frame: 0,
      sampleIndices: new Uint32Array([0, 1, 2, 3]),
      shadowParticles: new Float32Array([
        0.02, 0.0, 0.02,
        0.03, 0.0, 0.03,
        0.04, 0.0, 0.04,
        0.05, 0.0, 0.05,
      ]),
      retainedTargets: new Float32Array(16).fill(0.01),
      sampleBaryon: new Float32Array(12).fill(0.2),
      lastSnapshot: null,
    };
    const tslState = {
      audit,
      basePositions: new Float32Array([
        0.2, 0.0, 0.2,
        0.25, 0.0, 0.25,
        0.3, 0.0, 0.3,
        0.35, 0.0, 0.35,
      ]),
      uniforms: {
        uRadius: { value: 1 },
        uThreshold: { value: 0.001 },
        uSurfaceThreshold: { value: 0.05 },
        uFlowFieldInfluence: { value: 0.5 },
        uFlowFieldStrength: { value: 0.1 },
        uFlowFieldFrequency: { value: 0.5 },
        uParticleSpeed: { value: 6 },
        uDistanceThreshold: { value: 1 },
        uParticleMovementType: { value: 1 },
        uSurfaceControl: { value: 1 },
        uIdleLogoSize: { value: 1 },
        uActiveModeCount: { value: 0 },
        uTime: { value: 0 },
      },
    };
    const featureFrame = {
      fieldState: "active",
      modeSlots: new Float32Array([1, 1, 1, 1]),
    };

    const snapshot = updateAuditSnapshot(tslState, featureFrame, 1 / 60, {
      modeSlotsChanged: true,
      resetTriggered: true,
      resetReason: "mode-change",
    });

    expect(snapshot.resetTriggered).toBe(true);
    expect(snapshot.resetReason).toBe("mode-change");
    expect(snapshot.centerTargetOccupancy).toBeGreaterThan(0);
    expect(snapshot.retainedZeroPointCount).toBeGreaterThan(0);
    expect(audit.lastSnapshot).toEqual(snapshot);
  });
});
