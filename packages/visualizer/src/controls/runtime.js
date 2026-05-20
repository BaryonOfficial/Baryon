import * as THREE from "three";
import { CONTROL_HANDLERS } from "./schema.js";
import {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "../visualization/types.js";
import {
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import {
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "../core/cavityGeometry.js";
import {
  normalizeOutputMode,
  normalizePerformanceProfile,
} from "../render/outputProfilePolicy.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  normalizeStepBudget,
  STEP_REFERENCE,
} from "../core/raymarch/stepStability.js";
import {
  getBoundaryModeValue,
  normalizeBoundaryMode,
} from "../core/modeFamily.js";
import {
  allowsAudioMotion,
  isRenderAuthorityCut,
} from "../core/renderAuthorityContract.js";
import {
  setRaymarchCavityGeometry,
  setRaymarchBoundaryMode,
  syncRaymarchMaterialSteps,
} from "../core/raymarch/material.js";
import {
  buildSceneSnapshot,
  createDisabledSceneSnapshot,
  createSceneMotionState,
  deriveAutoMotionAmount,
  deriveSceneSignals,
  getManualVelocity,
  getMotionAmount,
  normalizeRotationMode,
  stepAudioSceneMotion,
  stepManualSceneMotion,
  stepSettlingSceneMotion,
  stopAudioSceneMotion,
  syncIdleOverlayRotation,
} from "./sceneMotion.js";

const IDLE_LOGO_ALPHA_RATIO =
  RENDER_DEFAULTS.idleLogoIntensity > 0
    ? RENDER_DEFAULTS.idleLogoAlpha / RENDER_DEFAULTS.idleLogoIntensity
    : 1;
const TRANSPARENT_CLEAR_COLOR = new THREE.Color(0x000000);
const OUTPUT_TOPOLOGY_KEY_FIELD = "__baryonOutputTopologyKey";

function deriveIdleLogoAlpha(intensity) {
  return Math.min(1, intensity * IDLE_LOGO_ALPHA_RATIO);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function derivePerceptualSpectralMix(mix) {
  return Math.sqrt(clamp01(mix));
}

function resolveOutputTopologyKey({ bloomEnabled, outputMode }) {
  return `${bloomEnabled ? 1 : 0}:${outputMode}`;
}

function rebuildOutputNodeTopologyIfNeeded(
  pipeline,
  postNodes,
  { bloomEnabled, outputMode, bloomActive },
) {
  const nextTopologyKey = resolveOutputTopologyKey({
    bloomEnabled,
    outputMode,
  });
  if (postNodes?.[OUTPUT_TOPOLOGY_KEY_FIELD] === nextTopologyKey) {
    return false;
  }

  const { sceneColor, bloomPass, composeOutputNode } = postNodes ?? {};
  pipeline.outputNode = composeOutputNode
    ? composeOutputNode({
        bloomEnabled,
        outputMode,
      })
    : bloomActive && bloomPass
      ? sceneColor.add(bloomPass)
      : sceneColor;
  pipeline.needsUpdate = true;
  postNodes[OUTPUT_TOPOLOGY_KEY_FIELD] = nextTopologyKey;
  return true;
}

function deriveBloomResponse(controls, stepBudget) {
  const bloomResponseBias = Math.max(0, controls.bloomResponseBias ?? 0);
  const lowStepBloomGuard = deriveLowStepBloomGuard(stepBudget);
  const stepCompensation = deriveStepCompensation(stepBudget);
  return {
    bloomResponseBias,
    stepReference: STEP_REFERENCE,
    stepCompensation,
    lowStepBloomGuard,
    strength: Math.max(
      0,
      controls.bloomStrength *
        (1 - bloomResponseBias * 0.2) *
        (1 - lowStepBloomGuard * 0.12),
    ),
    radius: Math.max(0, controls.bloomRadius * (1 - bloomResponseBias * 0.16)),
    threshold: Math.min(
      1,
      controls.bloomThreshold +
        bloomResponseBias * 0.1 +
        lowStepBloomGuard * 0.05,
    ),
  };
}

export const CONTROL_RUNTIME_COVERAGE = Object.freeze({
  [CONTROL_HANDLERS.audio]: Object.freeze([
    "liveInputAnalysisClass",
    "liveInputAcousticIntent",
    "echoCancellation",
    "noiseSuppression",
    "autoGainControl",
  ]),
  [CONTROL_HANDLERS.shared]: Object.freeze([
    "backgroundColor",
    "performanceHudEnabled",
    "renderQualityPreset",
    "customPerformanceTargetFps",
    "visualizationMethod",
  ]),
  [CONTROL_HANDLERS.output]: Object.freeze([
    "outputMode",
    "outputBackgroundColor",
  ]),
  [CONTROL_HANDLERS.raymarch]: Object.freeze([
    "volumeColor",
    "surfaceColor",
    "colorMode",
    "spectralMix",
    "zeroPointPrecision",
    "structureMin",
    "structureMax",
    "boundaryMode",
    "cavityGeometry",
    "raymarchSteps",
    "densityGain",
    "absorption",
    "opacityGain",
    "contourSharpness",
    "reactivity",
    "rimBloomBias",
    "rimCompression",
    "holographicIntensity",
    "holographicShift",
    "holographicFresnelPower",
    "idleLogoIntensity",
    "idleLogoSize",
  ]),
  [CONTROL_HANDLERS.bloom]: Object.freeze([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
    "bloomResponseBias",
  ]),
  [CONTROL_HANDLERS.scene]: Object.freeze([
    "rotationMode",
    "rotationSpeed",
    "motionAmount",
  ]),
  [CONTROL_HANDLERS.audit]: Object.freeze([
    "auditEnabled",
    "freezeModeSlots",
    "forceWebGLFallbackTest",
    "lowLoadPlaybackDiagnostics",
    "injectTestTone",
    "testToneHz",
    "testToneAmplitude",
    "logEveryFrames",
  ]),
});

function getAudioControlSnapshot(controls) {
  return {
    liveInputAnalysisClass:
      controls.liveInputAnalysisClass ?? AUDIO_DEFAULTS.liveInputAnalysisClass,
    liveInputAcousticIntent:
      controls.liveInputAcousticIntent ??
      AUDIO_DEFAULTS.liveInputAcousticIntent,
    echoCancellation: Boolean(controls.echoCancellation),
    noiseSuppression: Boolean(controls.noiseSuppression),
    autoGainControl: Boolean(controls.autoGainControl),
  };
}

export async function applyAudioControls(audioSession, controls) {
  const snapshot = getAudioControlSnapshot(controls);
  if (!audioSession?.setLiveInputSettings) {
    return snapshot;
  }

  audioSession.setLiveInputAnalysisSettings?.({
    analysisClass: snapshot.liveInputAnalysisClass,
    acousticIntent: snapshot.liveInputAcousticIntent,
  });
  await audioSession.setLiveInputSettings({
    echoCancellation: snapshot.echoCancellation,
    noiseSuppression: snapshot.noiseSuppression,
    autoGainControl: snapshot.autoGainControl,
  });
  return snapshot;
}

export function applySharedControls(gl, controls) {
  gl.setClearColor(TRANSPARENT_CLEAR_COLOR, 0);
  return {
    backgroundColor: controls.backgroundColor,
    performanceHudEnabled: Boolean(controls.performanceHudEnabled),
    renderQualityPreset: normalizePerformanceProfile(
      controls.renderQualityPreset,
    ),
    customPerformanceTargetFps:
      controls.customPerformanceTargetFps ??
      RENDER_DEFAULTS.customPerformanceTargetFps,
    clearAlpha: 0,
    visualizationMethod: controls.visualizationMethod,
  };
}

export function applyOutputControls(pipelineState, controls) {
  const outputMode = normalizeOutputMode(controls.outputMode);
  const outputBackgroundColor =
    controls.outputBackgroundColor ?? RENDER_DEFAULTS.outputBackgroundColor;
  const bloomAllowed = pipelineState.renderProfileRef?.current?.bloomAllowed;
  const effectiveBloomEnabled = controls.bloomEnabled && bloomAllowed !== false;
  const pipeline = pipelineState.ensurePipeline();
  const postNodes = pipelineState.postNodesRef.current;

  if (!pipeline || !postNodes) {
    return {
      bloomEnabled: effectiveBloomEnabled,
      outputMode,
      outputBackgroundColor,
    };
  }

  postNodes.outputUniforms?.backgroundColor?.value?.set(outputBackgroundColor);
  // Output node topology is managed by applyBloomControls (runs after this),
  // which owns pipeline.outputNode and pipeline.needsUpdate.

  return {
    bloomEnabled: effectiveBloomEnabled,
    outputMode,
    outputBackgroundColor,
  };
}

function applyCommonVisualizationControls(runtimeState, controls) {
  const uniforms = runtimeState.uniforms;
  const idleLogoAlpha = deriveIdleLogoAlpha(controls.idleLogoIntensity);
  const stepBudget = normalizeStepBudget(
    controls.raymarchSteps ?? STEP_REFERENCE,
  );
  const colorMode = controls.colorMode === "spectral" ? "spectral" : "static";
  const spectralMix =
    colorMode === "spectral"
      ? derivePerceptualSpectralMix(
          controls.spectralMix ?? RENDER_DEFAULTS.spectralMix,
        )
      : 0;
  const boundaryMode = normalizeBoundaryMode(controls.boundaryMode);
  const requestedCavityGeometry = normalizeCavityGeometry(
    controls.cavityGeometry,
  );
  const effectiveCavityGeometry = resolveEffectiveCavityGeometry(
    requestedCavityGeometry,
  );

  uniforms.uColor.value.set(controls.volumeColor);
  uniforms.uSurfaceColor.value.set(controls.surfaceColor);
  uniforms.uSpectralMix.value = spectralMix;
  uniforms.uThreshold.value = controls.zeroPointPrecision;
  uniforms.uStructureMin.value = controls.structureMin;
  uniforms.uStructureMax.value = controls.structureMax;
  if (uniforms.uBoundaryMode) {
    uniforms.uBoundaryMode.value = getBoundaryModeValue(boundaryMode);
  }
  if (runtimeState?.method !== VISUALIZATION_METHODS.cymatics2d) {
    setRaymarchBoundaryMode(runtimeState?.volumeMesh, boundaryMode);
    setRaymarchCavityGeometry(
      runtimeState?.volumeMesh,
      effectiveCavityGeometry,
    );
  }
  uniforms.uIdleLogoIntensity.value = controls.idleLogoIntensity;
  uniforms.uIdleLogoAlpha.value = idleLogoAlpha;
  uniforms.uIdleLogoSize.value = controls.idleLogoSize;
  uniforms.uDensityGain.value = controls.densityGain;
  uniforms.uOpacityGain.value = controls.opacityGain;
  uniforms.uContourSharpness.value = controls.contourSharpness;
  runtimeState.baseDensityGain = controls.densityGain;
  runtimeState.baseThreshold = controls.zeroPointPrecision;
  runtimeState.baseContourSharpness = controls.contourSharpness;
  runtimeState.reactivityTuning = {
    reactivity: controls.reactivity ?? REACTIVITY_DEFAULTS.reactivity,
    motionAmount: controls.motionAmount ?? REACTIVITY_DEFAULTS.motionAmount,
  };
  runtimeState.requestedRaymarchSteps = stepBudget;
  runtimeState.requestedCavityGeometry = requestedCavityGeometry;
  runtimeState.effectiveCavityGeometry = effectiveCavityGeometry;
  runtimeState.bloomTuning = {
    ...(runtimeState.bloomTuning ?? {}),
    stepReference: STEP_REFERENCE,
    stepCompensation: deriveStepCompensation(stepBudget),
    lowStepBloomGuard: deriveLowStepBloomGuard(stepBudget),
  };
  applyEffectiveRaymarchStepBudget(runtimeState, controls, stepBudget);
  runtimeState.spectralLight = {
    ...(runtimeState.spectralLight ?? {}),
    colorMode,
    spectralMix,
  };

  if (runtimeState.idleOverlay) {
    runtimeState.idleOverlay.scale.setScalar(controls.idleLogoSize);
    if (runtimeState.idleOverlay.material?.color) {
      runtimeState.idleOverlay.material.color.set(controls.surfaceColor);
    }
    if ("opacity" in (runtimeState.idleOverlay.material ?? {})) {
      runtimeState.idleOverlay.material.opacity = idleLogoAlpha;
    }
  }

  return {
    uniforms,
    idleLogoAlpha,
    stepBudget,
    colorMode,
    spectralMix,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  };
}

export function applyEffectiveRaymarchStepBudget(
  runtimeState,
  controls,
  nextStepBudget,
) {
  if (!runtimeState) {
    return normalizeStepBudget(nextStepBudget ?? STEP_REFERENCE);
  }

  const requestedStepBudget = normalizeStepBudget(
    controls?.raymarchSteps ??
      runtimeState.requestedRaymarchSteps ??
      nextStepBudget ??
      STEP_REFERENCE,
  );
  const effectiveStepBudget = normalizeStepBudget(
    nextStepBudget ?? requestedStepBudget,
  );

  runtimeState.requestedRaymarchSteps = requestedStepBudget;
  runtimeState.effectiveRaymarchSteps = effectiveStepBudget;
  if (runtimeState.uniforms?.uRaymarchSteps) {
    runtimeState.uniforms.uRaymarchSteps.value = effectiveStepBudget;
  }
  if (runtimeState.volumeMesh?.material) {
    syncRaymarchMaterialSteps(runtimeState.volumeMesh, effectiveStepBudget);
  }

  return effectiveStepBudget;
}

function buildVisualizationControlSnapshot({
  controls,
  runtimeState,
  uniforms,
  idleLogoAlpha,
  colorMode,
  spectralMix,
  boundaryMode,
  requestedCavityGeometry,
  effectiveCavityGeometry,
  extraUniforms = {},
}) {
  return {
    uniforms: {
      volumeColor: controls.volumeColor,
      surfaceColor: controls.surfaceColor,
      colorMode,
      spectralMix,
      boundaryMode,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      threshold: uniforms.uThreshold.value,
      structureMin: uniforms.uStructureMin.value,
      structureMax: uniforms.uStructureMax.value,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoAlpha,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      densityGain: uniforms.uDensityGain.value,
      opacityGain: uniforms.uOpacityGain.value,
      contourSharpness: uniforms.uContourSharpness.value,
      reactivity: runtimeState.reactivityTuning?.reactivity,
      motionAmount: runtimeState.reactivityTuning?.motionAmount,
      ...extraUniforms,
    },
    overlay: {
      visible: runtimeState.idleOverlay?.visible ?? false,
      scale: runtimeState.idleOverlay?.scale?.x ?? controls.idleLogoSize,
    },
  };
}

export function applyRaymarchControls(runtimeState, controls) {
  const {
    uniforms,
    idleLogoAlpha,
    colorMode,
    spectralMix,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  } = applyCommonVisualizationControls(runtimeState, controls);

  uniforms.uAbsorption.value = controls.absorption;
  uniforms.uRimBloomBias.value = controls.rimBloomBias;
  uniforms.uRimCompression.value = controls.rimCompression;
  uniforms.uHolographicIntensity.value = controls.holographicIntensity;
  uniforms.uHolographicShift.value = controls.holographicShift;
  uniforms.uHolographicFresnelPower.value = controls.holographicFresnelPower;

  return buildVisualizationControlSnapshot({
    controls,
    runtimeState,
    uniforms,
    idleLogoAlpha,
    colorMode,
    spectralMix,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    extraUniforms: {
      absorption: uniforms.uAbsorption.value,
      rimBloomBias: uniforms.uRimBloomBias.value,
      rimCompression: uniforms.uRimCompression.value,
      holographicIntensity: uniforms.uHolographicIntensity.value,
      holographicShift: uniforms.uHolographicShift.value,
      holographicFresnelPower: uniforms.uHolographicFresnelPower.value,
      raymarchSteps: Math.round(runtimeState.volumeMesh.material.steps),
    },
  });
}

export function applyCymatics2dControls(runtimeState, controls) {
  const {
    uniforms,
    idleLogoAlpha,
    colorMode,
    spectralMix,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  } = applyCommonVisualizationControls(runtimeState, controls);

  return buildVisualizationControlSnapshot({
    controls,
    runtimeState,
    uniforms,
    idleLogoAlpha,
    colorMode,
    spectralMix,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    extraUniforms: {
      slicePosition: uniforms.uSlicePosition?.value ?? 0,
    },
  });
}

export function applyVisualizationControls(method, runtimeState, controls) {
  if (!runtimeState) {
    return null;
  }

  if (method === VISUALIZATION_METHODS.cymatics2d) {
    return applyCymatics2dControls(runtimeState, controls);
  }

  return applyRaymarchControls(runtimeState, controls);
}

export const applySimulationControls = (gl, runtimeState, controls) => ({
  ...applySharedControls(gl, controls),
  ...applyVisualizationControls(
    runtimeState?.method ?? DEFAULT_VISUALIZATION_METHOD,
    runtimeState,
    controls,
  ),
});

export function applyBloomControls(pipelineState, controls) {
  const stepBudget = normalizeStepBudget(
    controls.raymarchSteps ??
      pipelineState.runtimeState?.requestedRaymarchSteps ??
      pipelineState.runtimeState?.volumeMesh?.material?.steps ??
      STEP_REFERENCE,
  );
  const effective = deriveBloomResponse(controls, stepBudget);
  const bloomAllowed = pipelineState.renderProfileRef?.current?.bloomAllowed;
  const effectiveBloomEnabled = controls.bloomEnabled && bloomAllowed !== false;
  const outputMode = normalizeOutputMode(controls.outputMode);
  if (pipelineState.runtimeState) {
    pipelineState.runtimeState.bloomTuning = {
      ...(pipelineState.runtimeState.bloomTuning ?? {}),
      bloomResponseBias: effective.bloomResponseBias,
      stepReference: effective.stepReference,
      stepCompensation: effective.stepCompensation,
      lowStepBloomGuard: effective.lowStepBloomGuard,
      baseStrength: effective.strength,
      baseRadius: effective.radius,
      baseThreshold: effective.threshold,
      effectiveStrength: effective.strength,
      effectiveRadius: effective.radius,
      effectiveThreshold: effective.threshold,
    };
  }
  const pipeline = pipelineState.ensurePipeline();
  const postNodes = pipelineState.postNodesRef.current;
  if (!pipeline || !postNodes) {
    return {
      enabled: effectiveBloomEnabled,
      strength: effective.strength,
      radius: effective.radius,
      threshold: effective.threshold,
      bloomResponseBias: effective.bloomResponseBias,
      stepReference: effective.stepReference,
      stepCompensation: effective.stepCompensation,
      lowStepBloomGuard: effective.lowStepBloomGuard,
    };
  }

  const { bloomPass } = postNodes;
  const bloomActive = effectiveBloomEnabled && effective.strength > 1e-4;
  if (bloomPass) {
    bloomPass.strength.value = effective.strength;
    bloomPass.radius.value = effective.radius;
    bloomPass.threshold.value = bloomActive ? effective.threshold : 999;
  }
  // Only rebuild the output node topology when bloomEnabled or outputMode
  // actually changes. Rebuilding on every frame (e.g. during continuous slider
  // drag) keeps the WebGPU pipeline in perpetual recompile, starving the OSR.
  rebuildOutputNodeTopologyIfNeeded(pipeline, postNodes, {
    bloomEnabled: effectiveBloomEnabled,
    outputMode,
    bloomActive,
  });

  return {
    enabled: effectiveBloomEnabled,
    strength: bloomPass?.strength?.value ?? effective.strength,
    radius: bloomPass?.radius?.value ?? effective.radius,
    threshold: bloomPass?.threshold?.value ?? effective.threshold,
    bloomResponseBias: effective.bloomResponseBias,
    stepReference: effective.stepReference,
    stepCompensation: effective.stepCompensation,
    lowStepBloomGuard: effective.lowStepBloomGuard,
  };
}

export function applyAuditControls(featureState, controls) {
  if (!featureState?.audit?.settings) {
    return {};
  }

  Object.assign(featureState.audit.settings, {
    enabled: controls.auditEnabled,
    freezeModeSlots: controls.freezeModeSlots,
    forceWebGLFallbackTest: controls.forceWebGLFallbackTest,
    lowLoadPlaybackDiagnostics: controls.lowLoadPlaybackDiagnostics,
    injectTestTone: controls.injectTestTone,
    testToneHz: controls.testToneHz,
    testToneAmplitude: controls.testToneAmplitude,
    logEveryFrames: controls.logEveryFrames,
  });

  return {
    ...featureState.audit.settings,
  };
}

export function applySceneControls(
  target,
  controls,
  deltaTime,
  featureFrame,
) {
  const runtimeState = target?.points ? target : null;
  const points = runtimeState?.points ?? target;
  if (!points?.rotation) return null;
  if (runtimeState?.method === VISUALIZATION_METHODS.cymatics2d) {
    return createDisabledSceneSnapshot(
      runtimeState,
      points,
      controls,
      featureFrame,
      deltaTime,
    );
  }

  const sceneMotion =
    runtimeState?.sceneMotion ?? createSceneMotionState(points.rotation.y ?? 0);
  const rotationMode = normalizeRotationMode(controls.rotationMode);
  const manualVelocity = getManualVelocity(controls);
  const userScale = getMotionAmount(controls, runtimeState);
  const renderAuthorityCut = isRenderAuthorityCut(featureFrame);
  const audioMotionDriven = allowsAudioMotion(featureFrame);
  const signals = deriveSceneSignals(
    featureFrame,
    runtimeState?.responseEnvelope ?? 0,
    sceneMotion.lastMotionSignal,
  );

  sceneMotion.pitch = Number.isFinite(points.rotation.x)
    ? points.rotation.x
    : (sceneMotion.pitch ?? 0);
  sceneMotion.yaw = points.rotation.y ?? sceneMotion.yaw ?? 0;
  sceneMotion.roll = Number.isFinite(points.rotation.z)
    ? points.rotation.z
    : (sceneMotion.roll ?? 0);

  let effectiveMotionAmount;
  if (rotationMode === "audio" && audioMotionDriven) {
    const autoBase = deriveAutoMotionAmount(
      sceneMotion,
      signals.energySignal,
      deltaTime,
    );
    effectiveMotionAmount = userScale * autoBase;
  } else {
    effectiveMotionAmount = userScale;
  }

  if (rotationMode === "manual") {
    stepManualSceneMotion(sceneMotion, manualVelocity, deltaTime);
  } else if (rotationMode === "audio" && audioMotionDriven) {
    stepAudioSceneMotion(sceneMotion, {
      motionAmount: effectiveMotionAmount,
      shapedDrive: signals.shapedDrive,
      reactiveSignal: signals.reactiveSignal,
      motionImpulse: signals.motionImpulse,
      torqueImpulse: signals.torqueImpulse,
      attitudeImpulse: signals.attitudeImpulse,
      beatPulseId: featureFrame?.beatPulseId ?? 0,
      beatStrength: clamp01(featureFrame?.beatStrength ?? 0),
      beatConfidence: clamp01(featureFrame?.beatConfidence ?? 0),
      beatDetected: featureFrame?.beatDetected,
      deltaTime,
    });
  } else if (rotationMode === "audio" && renderAuthorityCut) {
    stopAudioSceneMotion(sceneMotion);
  } else {
    stepSettlingSceneMotion(sceneMotion, deltaTime);
  }
  sceneMotion.lastMotionSignal = signals.motionSignal;

  points.rotation.x = sceneMotion.pitch;
  points.rotation.y = sceneMotion.yaw;
  points.rotation.z = sceneMotion.roll;
  syncIdleOverlayRotation(runtimeState, sceneMotion, manualVelocity, deltaTime);
  if (runtimeState) {
    runtimeState.sceneMotion = sceneMotion;
  }

  return buildSceneSnapshot({
    rotationMode,
    rotationSpeed: controls.rotationSpeed,
    motionAmount: effectiveMotionAmount,
    signals,
    sceneMotion,
    rotationX: points.rotation.x,
    rotationY: points.rotation.y,
    rotationZ: points.rotation.z,
  });
}

function buildVisualizationInspectionAliases(visualization) {
  if (visualization === undefined) {
    return {};
  }

  return {
    visualization,
    raymarch: visualization,
    simulation: visualization,
  };
}

/**
 * @typedef {object} ControlInspectionSnapshotArgs
 * @property {string | undefined} [method]
 * @property {any} [audio]
 * @property {any} [shared]
 * @property {any} [output]
 * @property {any} [visualization]
 * @property {any} [raymarch]
 * @property {any} [bloom]
 * @property {any} [audit]
 * @property {any} [scene]
 */

/**
 * @param {ControlInspectionSnapshotArgs} args
 */
export function buildControlInspectionSnapshot({
  method = DEFAULT_VISUALIZATION_METHOD,
  audio,
  shared,
  output,
  visualization,
  raymarch,
  bloom,
  audit,
  scene,
}) {
  const resolvedVisualization = visualization ?? raymarch;

  return {
    method,
    ...(audio === undefined ? {} : { audio }),
    shared,
    output,
    ...buildVisualizationInspectionAliases(resolvedVisualization),
    bloom,
    audit,
    scene,
  };
}
