import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  applyAudioControls,
  applyAuditControls,
  applyBloomControls,
  applyEffectiveRaymarchStepBudget,
  applyOutputControls,
  applyRaymarchControls,
  applyVisualizationControls,
  applySharedControls,
  applySceneControls,
  applySimulationControls,
  buildControlInspectionSnapshot,
  CONTROL_RUNTIME_COVERAGE,
} from "./runtime.js";
import { CONTROL_HANDLERS, createControlState } from "./schema.js";
import { createVisualizationRuntime } from "../visualization/runtimeFactory.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "../visualization/types.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "../core/raymarch/stepStability.js";
import { AUDIO_DEFAULTS, AUDIO_SLOT_CAPACITY } from "../defaults.js";

function createRaymarchHarness(method = DEFAULT_VISUALIZATION_METHOD) {
  const dirichletMaterial = { steps: 0 };
  const neumannMaterial = { steps: 0 };
  return {
    method,
    uniforms: {
      uColor: { value: { set: vi.fn() } },
      uSurfaceColor: { value: { set: vi.fn() } },
      uSpectralMix: { value: 0 },
      uThreshold: { value: 0 },
      uStructureMin: { value: 0 },
      uStructureMax: { value: 0 },
      uBoundaryMode: { value: 1 },
      uIdleLogoIntensity: { value: 0 },
      uIdleLogoAlpha: { value: 0 },
      uIdleLogoSize: { value: 0 },
      uDensityGain: { value: 0 },
      uAbsorption: { value: 0 },
      uOpacityGain: { value: 0 },
      uContourSharpness: { value: 0 },
      uRimBloomBias: { value: 0 },
      uRimCompression: { value: 0 },
      uHolographicIntensity: { value: 0 },
      uHolographicShift: { value: 0 },
      uHolographicFresnelPower: { value: 0 },
      uRaymarchSteps: { value: 0 },
      uSlicePosition: { value: 0 },
      uRadius: { value: 3 },
    },
    reactivityTuning: {
      reactivity: 1,
      motionAmount: 1,
      structurePersistence: 1,
    },
    bloomTuning: {
      bloomResponseBias: 0.4,
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(STEP_REFERENCE),
      lowStepBloomGuard: deriveLowStepBloomGuard(STEP_REFERENCE),
      effectiveStrength: 0.11,
      effectiveRadius: 0.09,
      effectiveThreshold: 0.44,
    },
    baseDensityGain: 0,
    spectralLight: {
      colorMode: "static",
      spectralMix: 0,
    },
    volumeMesh: {
      material: neumannMaterial,
      userData: {
        raymarchBoundaryMode: "neumann",
        raymarchFieldEvaluationMode: "direct",
        raymarchChromaEvaluationMode: "direct",
        raymarchCavityGeometry: "rectangular",
        raymarchMaterialCache: {
          dirichlet: {
            direct: { direct: { rectangular: dirichletMaterial } },
            cached: {},
          },
          neumann: {
            direct: { direct: { rectangular: neumannMaterial } },
            cached: {},
          },
        },
      },
    },
    points: {
      rotation: { x: 0, y: 0, z: 0 },
    },
    sceneMotion: {
      yaw: 0,
      pitch: 0,
      roll: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
      pitchVelocity: 0,
      rollVelocity: 0,
      lastMotionSignal: 0,
      lastBeatPulseId: 0,
      idleLogoYaw: 0,
    },
    responseEnvelope: 0,
    idleOverlay: {
      visible: false,
      rotation: { y: 0 },
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
      setLiveInputAnalysisSettings: vi.fn(),
      setLiveInputSettings: vi.fn(async () => undefined),
    };
    const snapshot = await applyAudioControls(audioSession, controls);

    expect(audioSession.setLiveInputAnalysisSettings).toHaveBeenCalledWith({
      analysisClass: "auto",
      acousticIntent: "ambient",
    });
    expect(audioSession.setLiveInputSettings).toHaveBeenCalledWith({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    });
    expect(snapshot).toEqual({
      liveInputAnalysisClass: "auto",
      liveInputAcousticIntent: "ambient",
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
    controls.boundaryMode = "dirichlet";
    controls.densityGain = 1.75;
    controls.absorption = 1.35;
    controls.opacityGain = 1.4;
    controls.contourSharpness = 5.2;
    controls.rimBloomBias = 0.65;
    controls.rimCompression = 0.72;
    controls.holographicIntensity = 0.52;
    controls.holographicShift = 0.41;
    controls.holographicFresnelPower = 4.1;
    controls.reactivity = 1.2;
    controls.motionAmount = 1.1;
    controls.raymarchSteps = 64;
    controls.colorMode = "spectral";
    controls.spectralMix = 0.6;

    const gl = {
      setClearColor: vi.fn(),
    };
    const runtimeState = createRaymarchHarness();
    const snapshot = applySimulationControls(gl, runtimeState, controls);

    expect(gl.setClearColor).toHaveBeenCalledTimes(1);
    expect(gl.setClearColor).toHaveBeenCalledWith(expect.any(THREE.Color), 0);
    expect(runtimeState.uniforms.uThreshold.value).toBe(0.033);
    expect(runtimeState.uniforms.uIdleLogoIntensity.value).toBe(0.42);
    expect(runtimeState.uniforms.uIdleLogoAlpha.value).toBe(0.84);
    expect(runtimeState.uniforms.uIdleLogoSize.value).toBe(1.4);
    expect(runtimeState.uniforms.uStructureMin.value).toBe(0.12);
    expect(runtimeState.uniforms.uStructureMax.value).toBe(0.48);
    expect(runtimeState.uniforms.uBoundaryMode.value).toBe(0);
    expect(runtimeState.volumeMesh.userData.raymarchBoundaryMode).toBe(
      "dirichlet",
    );
    expect(runtimeState.requestedCavityGeometry).toBe("rectangular");
    expect(runtimeState.effectiveCavityGeometry).toBe("rectangular");
    expect(runtimeState.volumeMesh.userData.raymarchCavityGeometry).toBe(
      "rectangular",
    );
    expect(runtimeState.uniforms.uDensityGain.value).toBe(1.75);
    expect(runtimeState.baseDensityGain).toBe(1.75);
    expect(runtimeState.uniforms.uAbsorption.value).toBe(1.35);
    expect(runtimeState.uniforms.uOpacityGain.value).toBe(1.4);
    expect(runtimeState.uniforms.uContourSharpness.value).toBe(5.2);
    expect(runtimeState.uniforms.uRimBloomBias.value).toBe(0.65);
    expect(runtimeState.uniforms.uRimCompression.value).toBe(0.72);
    expect(runtimeState.uniforms.uHolographicIntensity.value).toBe(0.52);
    expect(runtimeState.uniforms.uHolographicShift.value).toBe(0.41);
    expect(runtimeState.uniforms.uHolographicFresnelPower.value).toBe(4.1);
    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(64);
    expect(runtimeState.uniforms.uSpectralMix.value).toBeCloseTo(
      Math.sqrt(0.6),
    );
    expect(runtimeState.spectralLight).toEqual({
      colorMode: "spectral",
      spectralMix: Math.sqrt(0.6),
    });
    expect(runtimeState.reactivityTuning).toEqual({
      reactivity: 1.2,
      motionAmount: 1.1,
    });
    expect(runtimeState.reactivityTuning).not.toHaveProperty(
      "structurePersistence",
    );
    expect(runtimeState.bloomTuning.stepReference).toBe(STEP_REFERENCE);
    expect(runtimeState.bloomTuning.stepCompensation).toBeCloseTo(
      deriveStepCompensation(64),
    );
    expect(runtimeState.bloomTuning.lowStepBloomGuard).toBe(0);
    expect(runtimeState.volumeMesh.material.steps).toBe(64);
    expect(
      runtimeState.volumeMesh.userData.raymarchMaterialCache.dirichlet.direct
        .direct.rectangular.steps,
    ).toBe(64);
    expect(
      runtimeState.volumeMesh.userData.raymarchMaterialCache.neumann.direct
        .direct.rectangular.steps,
    ).toBe(64);
    expect(runtimeState.idleOverlay.scale.x).toBe(1.4);
    expect(runtimeState.idleOverlay.material.opacity).toBe(0.84);
    expect(snapshot.uniforms.idleLogoIntensity).toBe(0.42);
    expect(snapshot.uniforms.idleLogoAlpha).toBe(0.84);
    expect(snapshot.uniforms.densityGain).toBe(1.75);
    expect(snapshot.uniforms.absorption).toBe(1.35);
    expect(snapshot.uniforms.opacityGain).toBe(1.4);
    expect(snapshot.uniforms.rimBloomBias).toBe(0.65);
    expect(snapshot.uniforms.rimCompression).toBe(0.72);
    expect(snapshot.uniforms.holographicIntensity).toBe(0.52);
    expect(snapshot.uniforms.holographicShift).toBe(0.41);
    expect(snapshot.uniforms.holographicFresnelPower).toBe(4.1);
    expect(snapshot.uniforms.reactivity).toBe(1.2);
    expect(snapshot.uniforms.motionAmount).toBe(1.1);
    expect(snapshot.uniforms).not.toHaveProperty("structurePersistence");
    expect(snapshot.uniforms.raymarchSteps).toBe(64);
    expect(snapshot.uniforms.colorMode).toBe("spectral");
    expect(snapshot.uniforms.spectralMix).toBeCloseTo(Math.sqrt(0.6));
    expect(snapshot.uniforms.boundaryMode).toBe("dirichlet");
    expect(snapshot.uniforms.requestedCavityGeometry).toBe("rectangular");
    expect(snapshot.uniforms.effectiveCavityGeometry).toBe("rectangular");
    expect(snapshot.overlay.scale).toBe(1.4);
    expect(runtimeState.baseThreshold).toBe(0.033);
    expect(runtimeState.baseContourSharpness).toBe(5.2);
  });

  it("keeps requested and effective raymarch steps distinct", () => {
    const controls = createControlState();
    controls.raymarchSteps = 64;
    const runtimeState = createRaymarchHarness();

    applyRaymarchControls(runtimeState, controls);
    const effectiveStepBudget = applyEffectiveRaymarchStepBudget(
      runtimeState,
      controls,
      40,
    );

    expect(effectiveStepBudget).toBe(40);
    expect(runtimeState.requestedRaymarchSteps).toBe(64);
    expect(runtimeState.effectiveRaymarchSteps).toBe(40);
    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(40);
    expect(runtimeState.volumeMesh.material.steps).toBe(40);
    expect(runtimeState.bloomTuning.stepCompensation).toBeCloseTo(
      deriveStepCompensation(64),
    );
    expect(runtimeState.bloomTuning.lowStepBloomGuard).toBeCloseTo(
      deriveLowStepBloomGuard(64),
    );
  });

  it("keeps requested cavity geometry distinct from the effective rectangular backend", () => {
    const controls = createControlState();
    controls.cavityGeometry = "spherical";
    const runtimeState = createRaymarchHarness();

    const snapshot = applyRaymarchControls(runtimeState, controls);

    expect(runtimeState.requestedCavityGeometry).toBe("spherical");
    expect(runtimeState.effectiveCavityGeometry).toBe("rectangular");
    expect(runtimeState.volumeMesh.userData.raymarchCavityGeometry).toBe(
      "rectangular",
    );
    expect(snapshot.uniforms.requestedCavityGeometry).toBe("spherical");
    expect(snapshot.uniforms.effectiveCavityGeometry).toBe("rectangular");
  });

  it("applies shared and raymarch controls through method-aware helpers", () => {
    const controls = createControlState();
    controls.backgroundColor = "#123456";
    controls.boundaryMode = "dirichlet";

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
    expect(gl.setClearColor).toHaveBeenNthCalledWith(
      1,
      expect.any(THREE.Color),
      0,
    );
    expect(sharedSnapshot.backgroundColor).toBe("#123456");
    expect(sharedSnapshot.clearAlpha).toBe(0);
    expect(sharedSnapshot.renderQualityPreset).toBe("auto");
    expect(sharedSnapshot.customPerformanceTargetFps).toBe(60);
    expect(sharedSnapshot.visualizationMethod).toBe(
      DEFAULT_VISUALIZATION_METHOD,
    );
    expect(raymarchSnapshot.uniforms.threshold).toBe(
      controls.zeroPointPrecision,
    );
    expect(raymarchSnapshot.uniforms.boundaryMode).toBe("dirichlet");
  });

  it("applies fullscreen 2d controls without touching raymarch-only uniforms", () => {
    const controls = createControlState();
    controls.visualizationMethod = VISUALIZATION_METHODS.cymatics2d;
    controls.volumeColor = "#113355";
    controls.surfaceColor = "#ddeeff";
    controls.reactivity = 1.3;
    controls.motionAmount = 0.8;

    const runtimeState = createRaymarchHarness(
      VISUALIZATION_METHODS.cymatics2d,
    );
    const snapshot = applyVisualizationControls(
      VISUALIZATION_METHODS.cymatics2d,
      runtimeState,
      controls,
    );

    expect(runtimeState.uniforms.uColor.value.set).toHaveBeenCalledWith(
      "#113355",
    );
    expect(runtimeState.uniforms.uSurfaceColor.value.set).toHaveBeenCalledWith(
      "#ddeeff",
    );
    expect(runtimeState.uniforms.uSlicePosition.value).toBe(0);
    expect(snapshot.uniforms.reactivity).toBe(1.3);
    expect(snapshot.uniforms.motionAmount).toBe(0.8);
    expect(snapshot.uniforms).not.toHaveProperty("structurePersistence");
    expect(snapshot.uniforms.slicePosition).toBe(0);
  });

  it("applies raymarch controls directly", () => {
    const controls = createControlState();
    controls.volumeColor = "#224466";
    controls.surfaceColor = "#88ccff";
    controls.raymarchSteps = 72;
    controls.densityGain = 2.1;
    controls.absorption = 1.6;
    controls.opacityGain = 1.75;
    controls.contourSharpness = 6.4;
    controls.rimBloomBias = 0.35;
    controls.rimCompression = 0.5;
    controls.holographicIntensity = 0.61;
    controls.holographicShift = 0.24;
    controls.holographicFresnelPower = 2.8;
    controls.reactivity = 0.9;
    controls.motionAmount = 1.3;
    controls.colorMode = "static";
    controls.spectralMix = 0.88;

    const runtimeState = createRaymarchHarness();
    const snapshot = applyRaymarchControls(runtimeState, controls);

    expect(runtimeState.uniforms.uRaymarchSteps.value).toBe(72);
    expect(runtimeState.volumeMesh.material.steps).toBe(72);
    expect(runtimeState.uniforms.uDensityGain.value).toBe(2.1);
    expect(runtimeState.baseDensityGain).toBe(2.1);
    expect(runtimeState.uniforms.uAbsorption.value).toBe(1.6);
    expect(runtimeState.uniforms.uOpacityGain.value).toBe(1.75);
    expect(runtimeState.uniforms.uContourSharpness.value).toBe(6.4);
    expect(runtimeState.uniforms.uRimBloomBias.value).toBe(0.35);
    expect(runtimeState.uniforms.uRimCompression.value).toBe(0.5);
    expect(runtimeState.uniforms.uHolographicIntensity.value).toBe(0.61);
    expect(runtimeState.uniforms.uHolographicShift.value).toBe(0.24);
    expect(runtimeState.uniforms.uHolographicFresnelPower.value).toBe(2.8);
    expect(runtimeState.reactivityTuning.reactivity).toBe(0.9);
    expect(runtimeState.reactivityTuning.motionAmount).toBe(1.3);
    expect(runtimeState.reactivityTuning).not.toHaveProperty(
      "structurePersistence",
    );
    expect(runtimeState.bloomTuning.stepCompensation).toBeCloseTo(
      deriveStepCompensation(72),
    );
    expect(runtimeState.bloomTuning.lowStepBloomGuard).toBe(0);
    expect(runtimeState.uniforms.uSpectralMix.value).toBe(0);
    expect(runtimeState.idleOverlay.material.color.set).toHaveBeenCalledWith(
      "#88ccff",
    );
    expect(snapshot.uniforms.surfaceColor).toBe("#88ccff");
    expect(snapshot.uniforms.colorMode).toBe("static");
    expect(snapshot.uniforms.spectralMix).toBe(0);
    expect(snapshot.uniforms.boundaryMode).toBe("neumann");
    expect(snapshot.uniforms.opacityGain).toBe(1.75);
    expect(snapshot.uniforms.holographicIntensity).toBe(0.61);
    expect(snapshot.uniforms.holographicShift).toBe(0.24);
    expect(snapshot.uniforms.holographicFresnelPower).toBe(2.8);
  });

  it("removes stale structurePersistence from runtime tuning", () => {
    const controls = createControlState();

    const runtimeState = createRaymarchHarness();
    const snapshot = applyRaymarchControls(runtimeState, controls);

    expect(runtimeState.reactivityTuning).not.toHaveProperty(
      "structurePersistence",
    );
    expect(snapshot.uniforms).not.toHaveProperty("structurePersistence");
  });

  it("applies bloom controls to the pipeline", () => {
    const controls = createControlState();
    controls.raymarchSteps = STEP_REFERENCE;
    controls.bloomEnabled = false;
    controls.bloomStrength = 0.77;
    controls.bloomRadius = 0.31;
    controls.bloomThreshold = 0.44;
    controls.bloomResponseBias = 0.5;

    const pipeline = { outputNode: null, needsUpdate: false };
    const sceneColor = {
      tag: "sceneColor",
      add: vi.fn(() => "bloomed-output"),
    };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "transparent-output");
    const snapshot = applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: {
          current: { sceneColor, bloomPass, composeOutputNode },
        },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );

    expect(bloomPass.strength.value).toBeCloseTo(0.693);
    expect(bloomPass.radius.value).toBeCloseTo(0.2852);
    // Bloom bypass: when bloomEnabled is false, threshold is set to 999
    // to short-circuit the bloom pass computation
    expect(bloomPass.threshold.value).toBe(999);
    expect(composeOutputNode).toHaveBeenCalledWith({
      bloomEnabled: false,
      outputMode: controls.outputMode,
    });
    expect(pipeline.outputNode).toBe("transparent-output");
    expect(pipeline.needsUpdate).toBe(true);
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.bloomResponseBias).toBe(0.5);
    expect(snapshot.stepReference).toBe(STEP_REFERENCE);
    expect(snapshot.stepCompensation).toBe(1);
    expect(snapshot.lowStepBloomGuard).toBe(0);
  });

  it("enables bloom output when the control is on", () => {
    const controls = createControlState();
    controls.bloomEnabled = true;
    controls.bloomResponseBias = 0.4;

    const pipeline = { outputNode: null, needsUpdate: false };
    const sceneColor = { add: vi.fn(() => "bloomed-output") };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "transparent-output");

    const snapshot = applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: {
          current: { sceneColor, bloomPass, composeOutputNode },
        },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );

    expect(composeOutputNode).toHaveBeenCalledWith({
      bloomEnabled: true,
      outputMode: controls.outputMode,
    });
    expect(pipeline.outputNode).toBe("transparent-output");
    expect(pipeline.needsUpdate).toBe(true);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.strength).toBeCloseTo(controls.bloomStrength * 0.92);
    expect(snapshot.lowStepBloomGuard).toBe(0);
  });

  it("guards bloom response below 64 steps", () => {
    const controls = createControlState();
    controls.bloomEnabled = true;
    controls.bloomResponseBias = 0.4;
    controls.raymarchSteps = 32;

    const runtimeState = createRaymarchHarness();
    const pipeline = { outputNode: null, needsUpdate: false };
    const sceneColor = { add: vi.fn(() => "bloomed-output") };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "transparent-output");

    const snapshot = applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: {
          current: { sceneColor, bloomPass, composeOutputNode },
        },
        runtimeState,
      },
      controls,
    );

    expect(snapshot.lowStepBloomGuard).toBeCloseTo(deriveLowStepBloomGuard(32));
    expect(snapshot.stepCompensation).toBeCloseTo(deriveStepCompensation(32));
    expect(snapshot.strength).toBeCloseTo(controls.bloomStrength * 0.92 * 0.92);
    expect(snapshot.radius).toBeCloseTo(controls.bloomRadius * 0.936);
    expect(snapshot.threshold).toBeCloseTo(
      controls.bloomThreshold + 0.04 + 0.0333333333,
    );
    expect(composeOutputNode).toHaveBeenCalledWith({
      bloomEnabled: true,
      outputMode: controls.outputMode,
    });
    expect(pipeline.needsUpdate).toBe(true);
    expect(runtimeState.bloomTuning.lowStepBloomGuard).toBeCloseTo(
      deriveLowStepBloomGuard(32),
    );
  });

  it("skips pipeline topology rebuild when bloomEnabled and outputMode are unchanged", () => {
    const controls = createControlState();
    controls.bloomEnabled = true;

    const pipeline = { outputNode: "initial-output", needsUpdate: false };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "new-output");
    const postNodes = { sceneColor: {}, bloomPass, composeOutputNode };

    // First call: no topology key cached yet → rebuilds
    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );
    expect(composeOutputNode).toHaveBeenCalledTimes(1);
    expect(pipeline.needsUpdate).toBe(true);

    // Reset needsUpdate, then call again with identical topology
    pipeline.needsUpdate = false;
    composeOutputNode.mockClear();

    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );

    // Topology unchanged: no rebuild
    expect(composeOutputNode).not.toHaveBeenCalled();
    expect(pipeline.needsUpdate).toBe(false);
  });

  it("rebuilds pipeline topology when bloomEnabled changes", () => {
    const controls = createControlState();
    controls.bloomEnabled = false;

    const pipeline = { outputNode: null, needsUpdate: false };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "output");
    const postNodes = { sceneColor: {}, bloomPass, composeOutputNode };

    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );
    expect(composeOutputNode).toHaveBeenCalledTimes(1);
    pipeline.needsUpdate = false;
    composeOutputNode.mockClear();

    // Change bloomEnabled → topology must rebuild
    controls.bloomEnabled = true;
    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );
    expect(composeOutputNode).toHaveBeenCalledTimes(1);
    expect(pipeline.needsUpdate).toBe(true);
  });

  it("rebuilds pipeline topology when outputMode changes", () => {
    const controls = createControlState();
    controls.bloomEnabled = true;
    controls.outputMode = "transparent";

    const pipeline = { outputNode: null, needsUpdate: false };
    const bloomPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const composeOutputNode = vi.fn(() => "output");
    const postNodes = { sceneColor: {}, bloomPass, composeOutputNode };

    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );
    expect(composeOutputNode).toHaveBeenCalledTimes(1);
    pipeline.needsUpdate = false;
    composeOutputNode.mockClear();

    controls.outputMode = "opaque";
    applyBloomControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: { current: postNodes },
        runtimeState: createRaymarchHarness(),
      },
      controls,
    );
    expect(composeOutputNode).toHaveBeenCalledTimes(1);
    expect(pipeline.needsUpdate).toBe(true);
  });

  it("applies output controls to the program pipeline", () => {
    const controls = createControlState();
    controls.outputMode = "opaque";
    controls.outputBackgroundColor = "#123456";
    controls.bloomEnabled = true;

    const pipeline = { outputNode: null, needsUpdate: false };
    const outputUniforms = {
      backgroundColor: { value: new THREE.Color("#000000") },
    };
    const composeOutputNode = vi.fn(() => "opaque-output");
    const snapshot = applyOutputControls(
      {
        ensurePipeline: () => pipeline,
        postNodesRef: {
          current: { outputUniforms, composeOutputNode },
        },
      },
      controls,
    );

    expect(outputUniforms.backgroundColor.value.getHexString()).toBe("123456");
    // applyOutputControls no longer owns pipeline.outputNode or needsUpdate —
    // topology rebuilds are deferred to applyBloomControls to avoid rebuilding
    // the pipeline on every frame during continuous slider drag.
    expect(composeOutputNode).not.toHaveBeenCalled();
    expect(pipeline.outputNode).toBeNull();
    expect(pipeline.needsUpdate).toBe(false);
    expect(snapshot).toEqual({
      bloomEnabled: true,
      outputMode: "opaque",
      outputBackgroundColor: "#123456",
    });
  });

  it("applies audit controls to feature state", () => {
    const controls = createControlState();
    controls.auditEnabled = true;
    controls.freezeModeSlots = true;
    controls.forceWebGLFallbackTest = true;
    controls.lowLoadPlaybackDiagnostics = true;
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
          lowLoadPlaybackDiagnostics: false,
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
    expect(featureState.audit.settings.lowLoadPlaybackDiagnostics).toBe(true);
    expect(featureState.audit.settings.injectTestTone).toBe(true);
    expect(featureState.audit.settings.testToneHz).toBe(660);
    expect(featureState.audit.settings.testToneAmplitude).toBe(0.75);
    expect(featureState.audit.settings.logEveryFrames).toBe(12);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.forceWebGLFallbackTest).toBe(true);
    expect(snapshot.lowLoadPlaybackDiagnostics).toBe(true);
    expect(snapshot.testToneHz).toBe(660);
    expect(snapshot.testToneAmplitude).toBe(0.75);
    expect(snapshot.logEveryFrames).toBe(12);
  });

  it("preserves constant rotation in manual mode", () => {
    const controls = createControlState();
    controls.rotationMode = "manual";
    controls.rotationSpeed = 2;
    const runtimeState = createRaymarchHarness();
    runtimeState.points.rotation.y = 1;
    runtimeState.sceneMotion.yaw = 1;

    const snapshot = applySceneControls(runtimeState, controls, 0.5);
    expect(runtimeState.points.rotation.y).toBeCloseTo(0.5);
    expect(snapshot.rotationMode).toBe("manual");
    expect(snapshot.rotationSpeed).toBe(2);
  });

  it("settles pitch and roll attitude while preserving manual yaw control", () => {
    const controls = createControlState();
    controls.rotationMode = "manual";
    controls.rotationSpeed = 2;
    const runtimeState = createRaymarchHarness();
    runtimeState.points.rotation.x = 0.05;
    runtimeState.points.rotation.y = 1;
    runtimeState.points.rotation.z = -0.04;
    runtimeState.sceneMotion.yaw = 1;
    runtimeState.sceneMotion.pitch = 0.05;
    runtimeState.sceneMotion.roll = -0.04;
    runtimeState.sceneMotion.pitchVelocity = 0.2;
    runtimeState.sceneMotion.rollVelocity = -0.15;

    const snapshot = applySceneControls(runtimeState, controls, 0.25);

    expect(runtimeState.points.rotation.y).toBeCloseTo(0.75);
    expect(Math.abs(runtimeState.points.rotation.x)).toBeLessThan(0.05);
    expect(Math.abs(runtimeState.points.rotation.z)).toBeLessThan(0.04);
    expect(snapshot.rotationX).toBe(runtimeState.points.rotation.x);
    expect(snapshot.rotationZ).toBe(runtimeState.points.rotation.z);
  });

  it("settles rotation back to neutral in off mode", () => {
    const controls = createControlState();
    controls.rotationMode = "off";
    const runtimeState = createRaymarchHarness();
    runtimeState.points.rotation.x = 0.05;
    runtimeState.points.rotation.y = 1.2;
    runtimeState.points.rotation.z = -0.04;
    runtimeState.sceneMotion.yaw = 1.2;
    runtimeState.sceneMotion.pitch = 0.05;
    runtimeState.sceneMotion.roll = -0.04;
    runtimeState.sceneMotion.angularVelocity = -1.4;
    runtimeState.sceneMotion.pitchVelocity = 0.2;
    runtimeState.sceneMotion.rollVelocity = -0.15;

    const snapshot = applySceneControls(runtimeState, controls, 0.5);
    expect(Math.abs(runtimeState.points.rotation.x)).toBeLessThan(0.05);
    expect(Math.abs(runtimeState.points.rotation.y)).toBeLessThan(1.2);
    expect(Math.abs(runtimeState.points.rotation.z)).toBeLessThan(0.04);
    expect(Math.abs(snapshot.angularVelocity)).toBeLessThan(1.4);
    expect(snapshot.rotationMode).toBe("off");
  });

  it("adds a beat impulse on top of field-driven rotation in audio mode", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.motionAmount = 1.4;
    const beatlessRuntimeState = createRaymarchHarness();
    beatlessRuntimeState.responseEnvelope = 0.5;
    const beatRuntimeState = createRaymarchHarness();
    beatRuntimeState.responseEnvelope = 0.5;

    const baseFrame = {
      fieldState: "active",
      structureSignal: 0.55,
      energySignal: 0.72,
      changeSignal: 0.64,
      transientEnergy: 0.74,
      pulseSignal: 0.3,
    };
    const status = {
      isPlaying: true,
      isLiveInputActive: false,
    };

    const beatlessSnapshot = applySceneControls(
      beatlessRuntimeState,
      controls,
      1 / 60,
      baseFrame,
      status,
    );
    const beatSnapshot = applySceneControls(
      beatRuntimeState,
      controls,
      1 / 60,
      {
        ...baseFrame,
        beatDetected: true,
        beatPulseId: 9,
        beatStrength: 0.78,
        beatConfidence: 0.72,
      },
      status,
    );

    expect(beatSnapshot.rotationMode).toBe("audio");
    expect(beatSnapshot.motionAmount).toBeGreaterThan(1.4);
    expect(beatSnapshot.motionSignal).toBeGreaterThan(0.4);
    expect(beatSnapshot.targetAngularVelocity).toBeLessThan(0);
    expect(beatSnapshot.angularVelocity).toBeLessThan(
      beatlessSnapshot.angularVelocity,
    );
    expect(Math.abs(beatRuntimeState.points.rotation.x)).toBeGreaterThan(0);
    expect(Math.abs(beatRuntimeState.points.rotation.z)).toBeGreaterThan(0);
    expect(Math.abs(beatSnapshot.rotationX)).toBeGreaterThan(0);
    expect(Math.abs(beatSnapshot.rotationZ)).toBeGreaterThan(0);
    expect(beatRuntimeState.sceneMotion.lastBeatPulseId).toBe(9);
    expect(beatRuntimeState.points.rotation.y).toBeLessThan(0);
  });

  it("consumes each beat pulse id only once for audio rotation", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.motionAmount = 1.2;
    const freshBeatRuntimeState = createRaymarchHarness();
    freshBeatRuntimeState.responseEnvelope = 0.42;
    const consumedBeatRuntimeState = createRaymarchHarness();
    consumedBeatRuntimeState.responseEnvelope = 0.42;
    consumedBeatRuntimeState.sceneMotion.lastBeatPulseId = 17;

    const featureFrame = {
      fieldState: "active",
      structureSignal: 0.48,
      energySignal: 0.58,
      changeSignal: 0.46,
      pulseSignal: 0.22,
      beatDetected: true,
      beatPulseId: 17,
      beatStrength: 0.74,
      beatConfidence: 0.69,
    };
    const status = {
      isPlaying: true,
      isLiveInputActive: false,
    };

    const freshBeatSnapshot = applySceneControls(
      freshBeatRuntimeState,
      controls,
      1 / 60,
      featureFrame,
      status,
    );
    const consumedBeatSnapshot = applySceneControls(
      consumedBeatRuntimeState,
      controls,
      1 / 60,
      featureFrame,
      status,
    );

    expect(freshBeatRuntimeState.sceneMotion.lastBeatPulseId).toBe(17);
    expect(consumedBeatRuntimeState.sceneMotion.lastBeatPulseId).toBe(17);
    expect(freshBeatSnapshot.angularVelocity).toBeLessThan(
      consumedBeatSnapshot.angularVelocity,
    );
  });

  it("stays strongly reactive on sustained playback without a fresh beat trigger", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.motionAmount = 1;
    const runtimeState = createRaymarchHarness();
    runtimeState.responseEnvelope = 0.62;

    const snapshot = applySceneControls(
      runtimeState,
      controls,
      1 / 60,
      {
        fieldState: "active",
        structureSignal: 0.78,
        energySignal: 0.84,
        changeSignal: 0.22,
        pulseSignal: 0.05,
      },
      {
        isPlaying: true,
        isLiveInputActive: false,
      },
    );

    expect(snapshot.rotationMode).toBe("audio");
    expect(snapshot.targetAngularVelocity).toBeLessThan(-1);
    expect(snapshot.angularVelocity).toBeLessThan(-0.15);
    expect(runtimeState.points.rotation.y).toBeLessThan(0);
  });

  it("lets audio rotation settle near stillness when structural change is weak", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.motionAmount = 1;
    const runtimeState = createRaymarchHarness();
    runtimeState.responseEnvelope = 0.18;

    const snapshot = applySceneControls(
      runtimeState,
      controls,
      1 / 60,
      {
        fieldState: "active",
        structureSignal: 0.18,
        energySignal: 0.16,
        changeSignal: 0.03,
        pulseSignal: 0,
      },
      {
        isPlaying: true,
        isLiveInputActive: false,
      },
    );

    expect(snapshot.rotationMode).toBe("audio");
    expect(Math.abs(snapshot.targetAngularVelocity)).toBeLessThan(0.4);
    expect(Math.abs(snapshot.angularVelocity)).toBeLessThan(0.2);
  });

  it("keeps the idle logo synced to manual rotation speed in audio mode", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.rotationSpeed = 2;
    const runtimeState = createRaymarchHarness();

    const snapshot = applySceneControls(
      runtimeState,
      controls,
      0.5,
      {
        fieldState: "idle",
        structureSignal: 0,
        energySignal: 0,
        changeSignal: 0,
        pulseSignal: 0,
      },
      {
        isPlaying: false,
        isLiveInputActive: false,
      },
    );

    expect(snapshot.rotationMode).toBe("audio");
    expect(runtimeState.points.rotation.y).toBe(0);
    expect(runtimeState.sceneMotion.idleLogoYaw).toBeCloseTo(-0.5);
    expect(runtimeState.idleOverlay.rotation.y).toBeCloseTo(-0.5);
  });

  it("disables sustained and beat-driven audio rotation when motion amount is zero", () => {
    const controls = createControlState();
    controls.rotationMode = "audio";
    controls.motionAmount = 0;
    const runtimeState = createRaymarchHarness();
    runtimeState.responseEnvelope = 0.5;

    const snapshot = applySceneControls(
      runtimeState,
      controls,
      1 / 60,
      {
        fieldState: "active",
        structureSignal: 0.55,
        energySignal: 0.72,
        changeSignal: 0.64,
        transientEnergy: 0.74,
        pulseSignal: 0.3,
        beatDetected: true,
        beatPulseId: 9,
        beatStrength: 0.78,
        beatConfidence: 0.72,
      },
      {
        isPlaying: true,
        isLiveInputActive: false,
      },
    );

    expect(snapshot.rotationMode).toBe("audio");
    expect(snapshot.motionAmount).toBe(0);
    expect(Math.abs(snapshot.targetAngularVelocity)).toBe(0);
    expect(Math.abs(snapshot.angularVelocity)).toBe(0);
    expect(Math.abs(runtimeState.points.rotation.x)).toBe(0);
    expect(Math.abs(runtimeState.points.rotation.y)).toBe(0);
    expect(Math.abs(runtimeState.points.rotation.z)).toBe(0);
    expect(runtimeState.sceneMotion.lastBeatPulseId).toBe(9);
  });

  it("resets all scene rotation axes when scene motion is disabled for 2d", () => {
    const controls = createControlState();
    const runtimeState = createRaymarchHarness(
      VISUALIZATION_METHODS.cymatics2d,
    );
    runtimeState.points.rotation.x = 0.05;
    runtimeState.points.rotation.y = 1.2;
    runtimeState.points.rotation.z = -0.04;
    runtimeState.sceneMotion.pitch = 0.05;
    runtimeState.sceneMotion.yaw = 1.2;
    runtimeState.sceneMotion.roll = -0.04;
    runtimeState.sceneMotion.pitchVelocity = 0.2;
    runtimeState.sceneMotion.angularVelocity = -1.4;
    runtimeState.sceneMotion.rollVelocity = -0.15;

    const snapshot = applySceneControls(
      runtimeState,
      controls,
      1 / 60,
      {
        fieldState: "active",
        structureSignal: 0.55,
        energySignal: 0.72,
        changeSignal: 0.64,
        transientEnergy: 0.74,
        pulseSignal: 0.3,
      },
      {
        isPlaying: true,
        isLiveInputActive: false,
      },
    );

    expect(runtimeState.points.rotation.x).toBe(0);
    expect(runtimeState.points.rotation.y).toBe(0);
    expect(runtimeState.points.rotation.z).toBe(0);
    expect(runtimeState.sceneMotion.pitch).toBe(0);
    expect(runtimeState.sceneMotion.roll).toBe(0);
    expect(snapshot.rotationX).toBe(0);
    expect(snapshot.rotationY).toBe(0);
    expect(snapshot.rotationZ).toBe(0);
  });

  it("builds a control inspection snapshot", () => {
    const snapshot = buildControlInspectionSnapshot({
      method: DEFAULT_VISUALIZATION_METHOD,
      audio: { echoCancellation: false },
      shared: { test: 0 },
      output: { test: 0.5 },
      visualization: { test: 5 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });

    expect(snapshot).toEqual({
      method: DEFAULT_VISUALIZATION_METHOD,
      audio: { echoCancellation: false },
      shared: { test: 0 },
      output: { test: 0.5 },
      visualization: { test: 5 },
      raymarch: { test: 5 },
      simulation: { test: 5 },
      bloom: { test: 2 },
      audit: { test: 3 },
      scene: { test: 4 },
    });
  });

  it("keeps the legacy raymarch alias in inspection snapshots", () => {
    const snapshot = buildControlInspectionSnapshot({
      method: VISUALIZATION_METHODS.cymatics2d,
      raymarch: { test: 7 },
    });

    expect(snapshot.visualization).toEqual({ test: 7 });
    expect(snapshot.raymarch).toEqual({ test: 7 });
    expect(snapshot.simulation).toEqual({ test: 7 });
  });

  it("defaults the internal visualization runtime to raymarch", () => {
    const runtime = createVisualizationRuntime();
    expect(runtime.method).toBe(DEFAULT_VISUALIZATION_METHOD);
    expect(typeof runtime.setup).toBe("function");
    expect(typeof runtime.tick).toBe("function");
    expect(typeof runtime.dispose).toBe("function");
  });

  it("creates the fullscreen 2d visualization runtime on demand", () => {
    const runtime = createVisualizationRuntime(
      VISUALIZATION_METHODS.cymatics2d,
    );
    expect(runtime.method).toBe(VISUALIZATION_METHODS.cymatics2d);
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
        capacity: AUDIO_SLOT_CAPACITY,
        fftSize: 2048,
      },
    });

    expect(runtimeState.method).toBe(DEFAULT_VISUALIZATION_METHOD);
    expect(runtimeState.volumeMesh).toBeTruthy();
    expect(runtimeState.idleOverlay).toBeTruthy();
    expect(runtimeState.visualRoot.children).toContain(runtimeState.volumeMesh);
    expect(runtimeState.visualRoot.children).toContain(
      runtimeState.idleOverlay,
    );
    expect(runtimeState.points.children).toContain(runtimeState.visualRoot);
    expect(runtimeState.stabilityStats.avgRaySegmentLength).toBeGreaterThan(0);
    expect(runtimeState.stabilityStats.missRatio).toBeGreaterThan(0);
    expect(
      runtimeState.points.children.filter((child) => child.isLight),
    ).toHaveLength(2);
    expect(runtimeState.sceneLighting.primary.intensity).toBeCloseTo(0.9);
    expect(runtimeState.sceneLighting.secondary.intensity).toBeCloseTo(0.9);
    expect(runtimeState.sceneLighting.primary.position.x).toBeCloseTo(3 * 1.15);
    expect(runtimeState.sceneLighting.secondary.position.x).toBeCloseTo(
      -3 * 1.15,
    );
    expect(runtimeState.sceneLighting.primary.position.y).toBeCloseTo(3 * 0.85);
    expect(runtimeState.sceneLighting.secondary.position.y).toBeCloseTo(
      3 * 0.85,
    );
    expect(runtimeState.sceneLighting.primary.position.z).toBeCloseTo(3 * 1.8);
    expect(runtimeState.sceneLighting.secondary.position.z).toBeCloseTo(
      3 * 1.8,
    );
    expect(runtimeState.sharedModeCapacity).toBe(AUDIO_SLOT_CAPACITY);
    expect(runtimeState.capacity).toBe(runtimeState.sharedModeCapacity);
    expect(runtimeState.backboneCapacity).toBe(
      AUDIO_DEFAULTS.backboneStackSlots,
    );
    expect(runtimeState.detailCapacity).toBe(AUDIO_DEFAULTS.detailStackSlots);
    expect(runtimeState.backboneModeBuffer.value.array).toHaveLength(
      runtimeState.backboneCapacity * 4,
    );
    expect(runtimeState.detailModeBuffer.value.array).toHaveLength(
      runtimeState.detailCapacity * 4,
    );
    expect(runtimeState.backboneColorBuffer.value.array).toHaveLength(
      runtimeState.backboneCapacity * 4,
    );
    expect(runtimeState.detailColorBuffer.value.array).toHaveLength(
      runtimeState.detailCapacity * 4,
    );

    expect(() => runtime.dispose(runtimeState)).not.toThrow();
  });

  it("sets up and disposes a fullscreen 2d runtime scene root", () => {
    const runtime = createVisualizationRuntime(
      VISUALIZATION_METHODS.cymatics2d,
    );
    const runtimeState = runtime.setup({
      baryonGeometry: new THREE.IcosahedronGeometry(1, 0),
      parameters: {
        radius: 3,
      },
      audioConfig: {
        capacity: AUDIO_SLOT_CAPACITY,
        fftSize: 2048,
      },
    });

    expect(runtimeState.method).toBe(VISUALIZATION_METHODS.cymatics2d);
    expect(runtimeState.fieldMesh).toBeTruthy();
    expect(runtimeState.idleOverlay).toBeTruthy();
    expect(runtimeState.visualRoot.children).toContain(runtimeState.fieldMesh);
    expect(runtimeState.visualRoot.children).toContain(
      runtimeState.idleOverlay,
    );
    expect(runtimeState.sharedModeCapacity).toBe(AUDIO_SLOT_CAPACITY);
    expect(runtimeState.capacity).toBe(runtimeState.sharedModeCapacity);
    expect(runtimeState.backboneModeBuffer.value.array).toHaveLength(
      runtimeState.sharedModeCapacity * 4,
    );
    expect(runtimeState.detailModeBuffer.value.array).toHaveLength(
      runtimeState.sharedModeCapacity * 4,
    );

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
        capacity: AUDIO_SLOT_CAPACITY,
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
