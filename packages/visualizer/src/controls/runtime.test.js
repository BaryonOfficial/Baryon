import { describe, expect, it, vi } from "vitest";
import {
  applyAuditControls,
  applyBloomControls,
  applyParticleControls,
  applyParticleSceneControls,
  applySharedControls,
  applySceneControls,
  applySimulationControls,
  buildControlInspectionSnapshot,
  CONTROL_RUNTIME_COVERAGE,
} from "./runtime.js";
import {
  CONTROL_HANDLERS,
  createControlState,
} from "./schema.js";
import {
  createVisualizationRuntime,
} from "../visualization/runtimeFactory.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";

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
        uRadius: { value: 3 },
        uParticleSpeed: { value: 0 },
        uParticleSize: { value: 0 },
        uThreshold: { value: 0 },
        uSurfaceControl: { value: 0 },
        uIdleLogoIntensity: { value: 0 },
        uIdleLogoAlpha: { value: 0 },
        uIdleLogoSize: { value: 0 },
        uFlowFieldStrength: { value: 0 },
        uFlowFieldFrequency: { value: 0 },
        uFlowMix: { value: 0 },
        uAttractionStrength: { value: 0 },
        uVelocityDamping: { value: 0 },
        uCenterSuppressionInner: { value: 0 },
        uCenterSuppressionOuter: { value: 0 },
        uStructureMin: { value: 0 },
        uStructureMax: { value: 0 },
      },
    },
  };
}

describe("control runtime sync", () => {
  it("applies simulation controls to TSL uniforms", () => {
    const controls = createControlState();
    controls.particleSpeed = 55;
    controls.idleLogoIntensity = 0.42;
    controls.zeroPointPrecision = 0.033;
    controls.surfaceParticles = false;
    controls.idleLogoSize = 1.4;
    controls.flowFieldStrength = 4.1;
    controls.flowFieldFrequency = 0.73;
    controls.flowMix = 0.21;
    controls.attractionStrength = 17.5;
    controls.velocityDamping = 0.91;
    controls.centerSuppressionInner = 0.2;
    controls.centerSuppressionOuter = 0.55;
    controls.structureMin = 0.12;
    controls.structureMax = 0.48;

    const { gl, tslState } = createSimulationHarness();
    const snapshot = applySimulationControls(gl, tslState, controls);

    expect(gl.setClearColor).toHaveBeenCalledTimes(1);
    expect(tslState.uniforms.uParticleSpeed.value).toBe(55);
    expect(tslState.uniforms.uThreshold.value).toBe(0.033);
    expect(tslState.uniforms.uSurfaceControl.value).toBe(0);
    expect(tslState.uniforms.uIdleLogoIntensity.value).toBe(0.42);
    expect(tslState.uniforms.uIdleLogoAlpha.value).toBe(0.84);
    expect(tslState.uniforms.uIdleLogoSize.value).toBe(1.4);
    expect(tslState.uniforms.uFlowFieldStrength.value).toBe(4.1);
    expect(tslState.uniforms.uFlowFieldFrequency.value).toBe(0.73);
    expect(tslState.uniforms.uFlowMix.value).toBe(0.21);
    expect(tslState.uniforms.uAttractionStrength.value).toBe(17.5);
    expect(tslState.uniforms.uVelocityDamping.value).toBe(0.91);
    expect(tslState.uniforms.uCenterSuppressionInner.value).toBeCloseTo(0.6);
    expect(tslState.uniforms.uCenterSuppressionOuter.value).toBeCloseTo(1.65);
    expect(tslState.uniforms.uStructureMin.value).toBe(0.12);
    expect(tslState.uniforms.uStructureMax.value).toBe(0.48);
    expect(snapshot.uniforms.idleLogoIntensity).toBe(0.42);
    expect(snapshot.uniforms.idleLogoAlpha).toBe(0.84);
    expect(snapshot.uniforms.flowFieldStrength).toBe(4.1);
    expect(snapshot.uniforms.attractionStrength).toBe(17.5);
    expect(snapshot.uniforms.centerSuppressionInner).toBe(0.2);
  });

  it("applies shared and particle controls through method-aware helpers", () => {
    const controls = createControlState();
    controls.backgroundColor = "#123456";

    const { gl, tslState } = createSimulationHarness();
    const sharedSnapshot = applySharedControls(gl, controls);
    const particleSnapshot = applyParticleControls(tslState, controls);

    expect(gl.setClearColor).toHaveBeenCalledTimes(1);
    expect(sharedSnapshot.backgroundColor).toBe("#123456");
    expect(particleSnapshot.uniforms.particleSpeed).toBe(controls.particleSpeed);
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

  it("enables bloom output when the control is on", () => {
    const controls = createControlState();
    controls.bloomEnabled = true;

    const pipeline = { outputNode: null };
    const sceneColor = { add: vi.fn(() => "bloomed-output") };
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

    expect(sceneColor.add).toHaveBeenCalledWith(bloomPass);
    expect(pipeline.outputNode).toBe("bloomed-output");
    expect(snapshot.enabled).toBe(true);
  });

  it("applies audit controls to feature state", () => {
    const controls = createControlState();
    controls.auditEnabled = true;
    controls.freezeModeSlots = true;
    controls.injectTestTone = true;
    controls.testToneHz = 660;
    controls.testToneAmplitude = 0.75;
    controls.logEveryFrames = 12;

    const featureState = {
      audit: {
        settings: {
          enabled: false,
          freezeModeSlots: false,
          injectTestTone: false,
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
    expect(featureState.audit.settings.testToneHz).toBe(660);
    expect(featureState.audit.settings.testToneAmplitude).toBe(0.75);
    expect(featureState.audit.settings.logEveryFrames).toBe(12);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.testToneHz).toBe(660);
    expect(snapshot.testToneAmplitude).toBe(0.75);
    expect(snapshot.logEveryFrames).toBe(12);
  });

  it("applies scene controls to points rotation", () => {
    const controls = createControlState();
    controls.rotationSpeed = 2;
    const points = { rotation: { y: 1 } };

    const snapshot = applySceneControls(points, controls, 0.5);
    expect(points.rotation.y).toBeCloseTo(0.5);
    expect(snapshot.rotationSpeed).toBe(2);
  });

  it("keeps the particle scene helper aliased through the old name", () => {
    const controls = createControlState();
    controls.rotationSpeed = 1;
    const points = { rotation: { y: 0 } };

    const particleSnapshot = applyParticleSceneControls(points, controls, 1);
    const compatSnapshot = applySceneControls(points, controls, 0);

    expect(particleSnapshot.rotationSpeed).toBe(1);
    expect(compatSnapshot.rotationSpeed).toBe(1);
  });

  it("builds a control inspection snapshot", () => {
    const snapshot = buildControlInspectionSnapshot({
      method: DEFAULT_VISUALIZATION_METHOD,
      shared: { test: 0 },
      particle: { test: 1 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });

    expect(snapshot).toEqual({
      method: DEFAULT_VISUALIZATION_METHOD,
      shared: { test: 0 },
      particle: { test: 1 },
      simulation: { test: 1 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });
  });

  it("defaults the internal visualization runtime to particle", () => {
    const runtime = createVisualizationRuntime();
    expect(runtime.method).toBe(DEFAULT_VISUALIZATION_METHOD);
    expect(typeof runtime.setup).toBe("function");
    expect(typeof runtime.tick).toBe("function");
    expect(typeof runtime.dispose).toBe("function");
  });

  it("scales center suppression controls by 3x before writing to uniforms", () => {
    // The suppression uniforms operate in a tighter internal range.
    // The 3x factor is intentional — document it so a future refactor does not silently break it.
    const controls = createControlState();
    controls.centerSuppressionInner = 0.1;
    controls.centerSuppressionOuter = 0.3;

    const { gl, tslState } = createSimulationHarness();
    applySimulationControls(gl, tslState, controls);

    expect(tslState.uniforms.uCenterSuppressionInner.value).toBeCloseTo(0.3);
    expect(tslState.uniforms.uCenterSuppressionOuter.value).toBeCloseTo(0.9);
  });

  it("does not throw when applyBloomControls is called before the pipeline is ready", () => {
    const controls = createControlState();
    expect(() =>
      applyBloomControls(
        {
          ensurePipeline: () => null,
          postNodesRef: { current: null },
        },
        controls
      )
    ).not.toThrow();
  });

  it("covers every control handler bucket used by the schema", () => {
    expect(Object.keys(CONTROL_RUNTIME_COVERAGE)).toEqual(
      expect.arrayContaining(Object.values(CONTROL_HANDLERS))
    );
  });
});
