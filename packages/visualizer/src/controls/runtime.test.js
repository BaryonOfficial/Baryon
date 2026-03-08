import { describe, expect, it, vi } from "vitest";
import {
  applyAuditControls,
  applyBloomControls,
  applySceneControls,
  applySimulationControls,
  buildControlInspectionSnapshot,
} from "./runtime.js";
import { createControlState } from "./schema.js";

function createSimulationHarness() {
  const setColor = vi.fn();
  return {
    gl: {
      setClearColor: vi.fn(),
    },
    tslState: {
      uniforms: {
        uColor: { value: { set: setColor } },
        uSurfaceColor: { value: { set: vi.fn() } },
        uParticleSpeed: { value: 0 },
        uParticleSize: { value: 0 },
        uThreshold: { value: 0 },
        uDistanceThreshold: { value: 0 },
        uSurfaceControl: { value: 0 },
        uParticleMovementType: { value: 0 },
        uIdleLogoIntensity: { value: 0 },
        uIdleLogoAlpha: { value: 0 },
        uIdleLogoSize: { value: 0 },
        uFlowFieldStrength: { value: 0 },
        uFlowFieldFrequency: { value: 0 },
        uFlowFieldInfluence: { value: 0 },
      },
    },
  };
}

describe("control runtime sync", () => {
  it("applies simulation controls to TSL uniforms", () => {
    const controls = createControlState();
    controls.particleSize = 0.123;
    controls.particleSpeed = 55;
    controls.zeroPointPrecision = 0.033;
    controls.targetLerpThreshold = 1.25;
    controls.surfaceParticles = false;
    controls.particleMovementType = "Quickest";
    controls.idleLogoSize = 1.4;

    const { gl, tslState } = createSimulationHarness();
    const snapshot = applySimulationControls(gl, tslState, controls);

    expect(gl.setClearColor).toHaveBeenCalledTimes(1);
    expect(tslState.uniforms.uParticleSize.value).toBe(0.123);
    expect(tslState.uniforms.uParticleSpeed.value).toBe(55);
    expect(tslState.uniforms.uThreshold.value).toBe(0.033);
    expect(tslState.uniforms.uDistanceThreshold.value).toBe(1.25);
    expect(tslState.uniforms.uSurfaceControl.value).toBe(0);
    expect(tslState.uniforms.uParticleMovementType.value).toBe(0);
    expect(tslState.uniforms.uIdleLogoSize.value).toBe(1.4);
    expect(snapshot.uniforms.particleSize).toBe(0.123);
  });

  it("applies bloom controls to the pipeline", () => {
    const controls = createControlState();
    controls.bloomEnabled = false;
    controls.bloomStrength = 0.77;
    controls.bloomRadius = 0.31;
    controls.bloomThreshold = 0.44;

    const pipeline = { outputNode: null };
    const sceneColor = { tag: "sceneColor", add: vi.fn(() => "bloomed-output") };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const snapshot = applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: { sceneColor, bloomPass } },
      },
      controls
    );

    expect(bloomPass.strength.value).toBe(0.77);
    expect(bloomPass.radius.value).toBe(0.31);
    expect(bloomPass.threshold.value).toBe(0.44);
    expect(pipeline.outputNode).toBe(sceneColor);
    expect(snapshot.enabled).toBe(false);
  });

  it("applies audit controls to feature state", () => {
    const controls = createControlState();
    controls.auditEnabled = true;
    controls.freezeModeSlots = true;
    controls.injectTestTone = true;
    controls.pitchSourceMode = "worker";

    const featureState = {
      audit: {
        settings: {
          enabled: false,
          freezeModeSlots: false,
          injectTestTone: false,
          pitchSourceMode: "auto",
          testToneHz: 440,
          testToneAmplitude: 0.5,
          logEveryFrames: 30,
        },
      },
    };

    const snapshot = applyAuditControls(featureState, controls);
    expect(featureState.audit.settings.enabled).toBe(true);
    expect(featureState.audit.settings.freezeModeSlots).toBe(true);
    expect(featureState.audit.settings.injectTestTone).toBe(true);
    expect(featureState.audit.settings.pitchSourceMode).toBe("worker");
    expect(snapshot.enabled).toBe(true);
  });

  it("applies scene controls to points rotation", () => {
    const controls = createControlState();
    controls.rotationSpeed = 2;
    const points = { rotation: { y: 1 } };

    const snapshot = applySceneControls(points, controls, 0.5);
    expect(points.rotation.y).toBeCloseTo(0.5);
    expect(snapshot.rotationSpeed).toBe(2);
  });

  it("builds a control inspection snapshot", () => {
    const snapshot = buildControlInspectionSnapshot({
      simulation: { test: 1 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });

    expect(snapshot).toEqual({
      simulation: { test: 1 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });
  });
});
