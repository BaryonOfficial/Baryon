import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  applyAudioControls,
  applyAuditControls,
  applyBloomControls,
  applyRaymarchControls,
  applySharedControls,
  applySceneControls,
  applySimulationControls,
  buildControlInspectionSnapshot,
  CONTROL_RUNTIME_COVERAGE,
} from "./runtime.js";
import { CONTROL_HANDLERS, createControlState } from "./schema.js";
import { createVisualizationRuntime } from "../visualization/runtimeFactory.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";

function createRaymarchHarness() {
  return {
    method: DEFAULT_VISUALIZATION_METHOD,
    uniforms: {
      uColor: { value: { set: vi.fn() } },
      uSurfaceColor: { value: { set: vi.fn() } },
      uThreshold: { value: 0 },
      uStructureMin: { value: 0 },
      uStructureMax: { value: 0 },
      uIdleLogoIntensity: { value: 0 },
      uIdleLogoAlpha: { value: 0 },
      uIdleLogoSize: { value: 0 },
      uDensityGain: { value: 0 },
      uAbsorption: { value: 0 },
      uContourSharpness: { value: 0 },
      uRaymarchSteps: { value: 0 },
      uRadius: { value: 3 },
    },
    volumeMesh: {
      material: {
        steps: 0,
      },
    },
    idleOverlay: {
      visible: false,
      scale: {
        x: 1,
        setScalar(value) {
          this.x = value;
        },
      },
      material: {
        color: { set: vi.fn() },
        opacity: 0,
      },
    },
  };
}

describe("control runtime sync", () => {
  it("applies audio controls to the shared audio session", async () => {
    const controls = createControlState();
    controls.echoCancellation = true;
    controls.noiseSuppression = true;
    controls.autoGainControl = false;

    const audioSession = {
      setMicSettings: vi.fn(async () => undefined),
    };
    const snapshot = await applyAudioControls(audioSession, controls);

    expect(audioSession.setMicSettings).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(snapshot).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
  });

  it("applies raymarch controls through the default simulation helper", () => {
    const controls = createControlState();
    controls.idleLogoIntensity = 0.42;
    controls.zeroPointPrecision = 0.033;
    controls.idleLogoSize = 1.4;
    controls.structureMin = 0.12;
    controls.structureMax = 0.48;
    controls.densityGain = 1.75;
    controls.absorption = 1.35;
    controls.contourSharpness = 5.2;
    controls.raymarchSteps = 64;

    const gl = {
      setClearColor: vi.fn(),
    };
    const runtimeState = createRaymarchHarness();
    const snapshot = applySimulationControls(gl, runtimeState, controls);

    expect(gl.setClearColor).toHaveBeenCalledTimes(1);
    expect(runtimeState.uniforms.uThreshold.value).toBe(0.033);
    expect(runtimeState.uniforms.uIdleLogoIntensity.value).toBe(0.42);
    expect(runtimeState.uniforms.uIdleLogoAlpha.value).toBe(0.84);
    expect(runtimeState.uniforms.uIdleLogoSize.value).toBe(1.4);
    expect(runtimeState.uniforms.uStructureMin.value).toBe(0.12);
    expect(runtimeState.uniforms.uStructureMax.value).toBe(0.48);
    expect(runtimeState.uniforms.uDensityGain.value).toBe(1.75);
    expect(runtimeState.uniforms.uAbsorption.value).toBe(1.35);
    expect(runtimeState.uniforms.uContourSharpness.value).toBe(5.2);
    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(64);
    expect(runtimeState.volumeMesh.material.steps).toBe(64);
    expect(runtimeState.idleOverlay.scale.x).toBe(1.4);
    expect(runtimeState.idleOverlay.material.opacity).toBe(0.84);
    expect(snapshot.uniforms.idleLogoIntensity).toBe(0.42);
    expect(snapshot.uniforms.idleLogoAlpha).toBe(0.84);
    expect(snapshot.uniforms.densityGain).toBe(1.75);
    expect(snapshot.uniforms.absorption).toBe(1.35);
    expect(snapshot.uniforms.raymarchSteps).toBe(64);
    expect(snapshot.overlay.scale).toBe(1.4);
  });

  it("applies shared and raymarch controls through method-aware helpers", () => {
    const controls = createControlState();
    controls.backgroundColor = "#123456";

    const gl = {
      setClearColor: vi.fn(),
    };
    const runtimeState = createRaymarchHarness();
    const sharedSnapshot = applySharedControls(gl, controls);
    const raymarchSnapshot = applySimulationControls(
      gl,
      runtimeState,
      controls,
    );

    expect(gl.setClearColor).toHaveBeenCalledTimes(2);
    expect(sharedSnapshot.backgroundColor).toBe("#123456");
    expect(raymarchSnapshot.uniforms.threshold).toBe(
      controls.zeroPointPrecision,
    );
  });

  it("applies raymarch controls directly", () => {
    const controls = createControlState();
    controls.volumeColor = "#224466";
    controls.surfaceColor = "#88ccff";
    controls.raymarchSteps = 72;
    controls.densityGain = 2.1;
    controls.absorption = 1.6;
    controls.contourSharpness = 6.4;

    const runtimeState = createRaymarchHarness();
    const snapshot = applyRaymarchControls(runtimeState, controls);

    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(72);
    expect(runtimeState.volumeMesh.material.steps).toBe(72);
    expect(runtimeState.uniforms.uDensityGain.value).toBe(2.1);
    expect(runtimeState.uniforms.uAbsorption.value).toBe(1.6);
    expect(runtimeState.uniforms.uContourSharpness.value).toBe(6.4);
    expect(runtimeState.idleOverlay.material.color.set).toHaveBeenCalledWith(
      "#88ccff",
    );
    expect(snapshot.uniforms.surfaceColor).toBe("#88ccff");
  });

  it("applies bloom controls to the pipeline", () => {
    const controls = createControlState();
    controls.bloomEnabled = false;
    controls.bloomStrength = 0.77;
    controls.bloomRadius = 0.31;
    controls.bloomThreshold = 0.44;

    const pipeline = { outputNode: null };
    const sceneColor = {
      tag: "sceneColor",
      add: vi.fn(() => "bloomed-output"),
    };
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
      controls,
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
      controls,
    );

    expect(sceneColor.add).toHaveBeenCalledWith(bloomPass);
    expect(pipeline.outputNode).toBe("bloomed-output");
    expect(snapshot.enabled).toBe(true);
  });

  it("applies audit controls to feature state", () => {
    const controls = createControlState();
    controls.auditEnabled = true;
    controls.freezeModeSlots = true;
    controls.forceWebGLFallbackTest = true;
    controls.injectTestTone = true;
    controls.testToneHz = 660;
    controls.testToneAmplitude = 0.75;
    controls.logEveryFrames = 12;

    const featureState = {
      audit: {
        settings: {
          enabled: false,
          freezeModeSlots: false,
          forceWebGLFallbackTest: false,
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
    expect(featureState.audit.settings.forceWebGLFallbackTest).toBe(true);
    expect(featureState.audit.settings.injectTestTone).toBe(true);
    expect(featureState.audit.settings.testToneHz).toBe(660);
    expect(featureState.audit.settings.testToneAmplitude).toBe(0.75);
    expect(featureState.audit.settings.logEveryFrames).toBe(12);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.forceWebGLFallbackTest).toBe(true);
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

  it("builds a control inspection snapshot", () => {
    const snapshot = buildControlInspectionSnapshot({
      method: DEFAULT_VISUALIZATION_METHOD,
      audio: { echoCancellation: false },
      shared: { test: 0 },
      raymarch: { test: 5 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });

    expect(snapshot).toEqual({
      method: DEFAULT_VISUALIZATION_METHOD,
      audio: { echoCancellation: false },
      shared: { test: 0 },
      raymarch: { test: 5 },
      simulation: { test: 5 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });
  });

  it("defaults the internal visualization runtime to raymarch", () => {
    const runtime = createVisualizationRuntime();
    expect(runtime.method).toBe(DEFAULT_VISUALIZATION_METHOD);
    expect(typeof runtime.setup).toBe("function");
    expect(typeof runtime.tick).toBe("function");
    expect(typeof runtime.dispose).toBe("function");
  });

  it("sets up and disposes a raymarch runtime scene root", () => {
    const runtime = createVisualizationRuntime();
    const runtimeState = runtime.setup({
      baryonGeometry: new THREE.IcosahedronGeometry(1, 0),
      parameters: {
        radius: 3,
      },
      audioConfig: {
        capacity: 8,
        fftSize: 2048,
      },
    });

    expect(runtimeState.method).toBe(DEFAULT_VISUALIZATION_METHOD);
    expect(runtimeState.volumeMesh).toBeTruthy();
    expect(runtimeState.idleOverlay).toBeTruthy();
    expect(runtimeState.points.children).toContain(runtimeState.volumeMesh);
    expect(runtimeState.points.children).toContain(runtimeState.idleOverlay);
    expect(runtimeState.stabilityStats.avgRaySegmentLength).toBeGreaterThan(0);
    expect(runtimeState.stabilityStats.missRatio).toBeGreaterThan(0);

    expect(() => runtime.dispose(runtimeState)).not.toThrow();
  });

  it("keeps the live raymarch step budget in sync with controls after setup", () => {
    const runtime = createVisualizationRuntime();
    const runtimeState = runtime.setup({
      baryonGeometry: new THREE.IcosahedronGeometry(1, 0),
      parameters: {
        radius: 3,
      },
      audioConfig: {
        capacity: 8,
        fftSize: 2048,
      },
    });
    const controls = createControlState();
    controls.raymarchSteps = 144;

    applyRaymarchControls(runtimeState, controls);

    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(144);
    expect(runtimeState.volumeMesh.material.steps).toBe(144);

    runtime.dispose(runtimeState);
  });

  it("does not throw when applyBloomControls is called before the pipeline is ready", () => {
    const controls = createControlState();
    expect(() =>
      applyBloomControls(
        {
          ensurePipeline: () => null,
          postNodesRef: { current: null },
        },
        controls,
      ),
    ).not.toThrow();
  });

  it("covers every control handler bucket used by the schema", () => {
    expect(Object.keys(CONTROL_RUNTIME_COVERAGE)).toEqual(
      expect.arrayContaining(Object.values(CONTROL_HANDLERS)),
    );
  });
});
