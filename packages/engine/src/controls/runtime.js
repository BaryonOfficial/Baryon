import * as THREE from "three";
import { BLOOM_ENHANCER_LIMITS, CONTROL_HANDLERS } from "./schema.js";
import { DEFAULT_VISUALIZATION_METHOD } from "../visualization/types.js";
import {
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import {
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "../core/cavityGeometry.js";
import { normalizeVolumeShape } from "../core/volumeShape.js";
import {
  normalizeOutputMode,
  normalizePerformanceProfile,
} from "../render/outputProfilePolicy.js";
import {
  markRenderOutputContentChange,
  syncRenderOutputBloomUniforms,
  syncRenderOutputNodeTopology,
} from "../render/outputPipeline.js";
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
import { allowsAudioMotion } from "../core/renderAuthorityContract.js";
import {
  setRaymarchCavityGeometry,
  setRaymarchBoundaryMode,
  setRaymarchVolumeShape,
  syncIdleOverlayMaterial,
  syncRaymarchMaterialSteps,
} from "../core/raymarch/material.js";
import {
  buildSceneSnapshot,
  createIdleLogoMotionState,
  createSceneMotionState,
  deriveAutoMotionAmount,
  deriveSceneSignals,
  getIdleLogoManualVelocity,
  getManualVelocity,
  getMotionAmount,
  normalizeIdleLogoRotationMode,
  normalizeRotationMode,
  stepAudioSceneMotion,
  stepIdleLogoMotion,
  stepManualSceneMotion,
  stepSettlingSceneMotion,
  stopAudioSceneMotion,
} from "./sceneMotion.js";
import { clamp, clamp01 } from "../utils/math.js";
import { clampCymaticObserverGeometryExposureSeconds } from "../core/raymarch/cymaticObserverReference.js";

const TRANSPARENT_CLEAR_COLOR = new THREE.Color(0x000000);

function deriveBloomResponse(controls, stepBudget) {
  const lowStepBloomGuard = deriveLowStepBloomGuard(stepBudget);
  const stepCompensation = deriveStepCompensation(stepBudget);
  return {
    stepReference: STEP_REFERENCE,
    stepCompensation,
    lowStepBloomGuard,
    strength: clamp(
      controls.bloomStrength * (1 - lowStepBloomGuard * 0.12),
      0,
      BLOOM_ENHANCER_LIMITS.maximumStrength,
    ),
    radius: clamp(controls.bloomRadius, 0, BLOOM_ENHANCER_LIMITS.maximumRadius),
    threshold: clamp(
      controls.bloomThreshold + lowStepBloomGuard * 0.05,
      BLOOM_ENHANCER_LIMITS.minimumThreshold,
      1,
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
    "customTargetFps",
    "traaEnabled",
    "visualizationMethod",
    "cameraLocked",
  ]),
  [CONTROL_HANDLERS.output]: Object.freeze([
    "outputBackgroundColor",
    "smaaEnabled",
  ]),
  [CONTROL_HANDLERS.raymarch]: Object.freeze([
    "volumeColor",
    "surfaceColor",
    "colorMode",
    "spectralChroma",
    "volumeShape",
    "boundaryMode",
    "cavityGeometry",
    "raymarchSteps",
    "densityGain",
    "laserDeflectionGain",
    "holographicIntensity",
    "holographicFresnelPower",
    "idleLogoIntensity",
    "idleLogoSize",
    "idleLogoColor",
    "patternPersistenceSeconds",
  ]),
  [CONTROL_HANDLERS.bloom]: Object.freeze([
    "bloomEnabled",
    "bloomStrength",
    "bloomRadius",
    "bloomThreshold",
  ]),
  [CONTROL_HANDLERS.scene]: Object.freeze([
    "rotationMode",
    "rotationSpeed",
    "idleLogoRotationMode",
    "idleLogoRotationSpeed",
    "motionAmount",
  ]),
  [CONTROL_HANDLERS.audit]: Object.freeze([
    "auditEnabled",
    "freezeModeSlots",
    "forceWebGLFallbackTest",
    "suppressPlaybackTelemetry",
    "injectTestTone",
    "testToneHz",
    "testToneSignal",
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
  const clearAlpha = 0;

  gl.setClearColor(TRANSPARENT_CLEAR_COLOR, clearAlpha);
  return {
    backgroundColor: controls.backgroundColor,
    performanceHudEnabled: Boolean(controls.performanceHudEnabled),
    renderQualityPreset: normalizePerformanceProfile(
      controls.renderQualityPreset,
    ),
    customTargetFps:
      controls.customTargetFps ?? RENDER_DEFAULTS.customTargetFps,
    traaEnabled: controls.traaEnabled === true,
    clearAlpha,
    visualizationMethod: controls.visualizationMethod,
    cameraLocked: Boolean(controls.cameraLocked),
  };
}

export function applyOutputControls(pipelineState, controls) {
  const outputMode = normalizeOutputMode(controls.outputMode);
  const outputBackgroundColor =
    controls.outputBackgroundColor ?? RENDER_DEFAULTS.outputBackgroundColor;
  const bloomAllowed = pipelineState.renderProfileRef?.current?.bloomAllowed;
  const effectiveBloomEnabled = controls.bloomEnabled && bloomAllowed !== false;
  const smaaEnabled = controls.smaaEnabled !== false;
  const pipeline = pipelineState.ensurePipeline();
  const postNodes = pipelineState.postNodesRef.current;

  if (!pipeline || !postNodes) {
    return {
      bloomEnabled: effectiveBloomEnabled,
      outputMode,
      outputBackgroundColor,
      smaaEnabled,
    };
  }

  const backgroundColorUniform = postNodes.outputUniforms?.backgroundColor;
  if (backgroundColorUniform?.value) {
    const nextBackgroundColor = new THREE.Color(outputBackgroundColor);
    if (!backgroundColorUniform.value.equals(nextBackgroundColor)) {
      backgroundColorUniform.value.copy(nextBackgroundColor);
      markRenderOutputContentChange(postNodes);
    }
  }
  // Output graph selection and bloom's presentation uniform are synchronized
  // by applyBloomControls after this snapshot is applied.

  return {
    bloomEnabled: effectiveBloomEnabled,
    outputMode,
    outputBackgroundColor,
    smaaEnabled,
  };
}

function applyCommonVisualizationControls(runtimeState, controls) {
  const uniforms = runtimeState.uniforms;
  const stepBudget = normalizeStepBudget(
    controls.raymarchSteps ?? STEP_REFERENCE,
  );
  const colorMode = controls.colorMode === "spectral" ? "spectral" : "static";
  const spectralPresentationEnabled = colorMode === "spectral" ? 1 : 0;
  const spectralChroma = clamp01(
    controls.spectralChroma ?? RENDER_DEFAULTS.spectralChroma,
  );
  const boundaryMode = normalizeBoundaryMode(controls.boundaryMode);
  const volumeShape = normalizeVolumeShape(controls.volumeShape);
  const requestedCavityGeometry = normalizeCavityGeometry(
    controls.cavityGeometry,
  );
  const effectiveCavityGeometry = resolveEffectiveCavityGeometry(
    requestedCavityGeometry,
  );

  uniforms.uColor.value.set(controls.volumeColor);
  uniforms.uCausticColor.value.set(controls.surfaceColor);
  uniforms.uSpectralPresentationEnabled.value = spectralPresentationEnabled;
  uniforms.uSpectralChroma.value = spectralChroma;
  if (uniforms.uBoundaryMode) {
    uniforms.uBoundaryMode.value = getBoundaryModeValue(boundaryMode);
  }
  setRaymarchBoundaryMode(runtimeState?.volumeMesh, boundaryMode);
  setRaymarchVolumeShape(runtimeState?.volumeMesh, volumeShape);
  setRaymarchCavityGeometry(runtimeState?.volumeMesh, effectiveCavityGeometry);
  uniforms.uIdleLogoIntensity.value = controls.idleLogoIntensity;
  uniforms.uIdleLogoSize.value = controls.idleLogoSize;
  uniforms.uIdleLogoColor.value.set(controls.idleLogoColor);
  uniforms.uDensityGain.value = controls.densityGain;
  runtimeState.baseDensityGain = controls.densityGain;
  runtimeState.reactivityTuning = {
    motionAmount: controls.motionAmount ?? REACTIVITY_DEFAULTS.motionAmount,
  };
  runtimeState.cymaticObserverTuning = {
    geometryExposureSeconds: clampCymaticObserverGeometryExposureSeconds(
      controls.patternPersistenceSeconds,
    ),
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
  if (runtimeState.idleOverlay) {
    runtimeState.idleOverlay.scale.setScalar(controls.idleLogoSize);
    syncIdleOverlayMaterial(runtimeState.idleOverlay, {
      color: controls.idleLogoColor,
      intensity: controls.idleLogoIntensity,
    });
  }

  return {
    uniforms,
    stepBudget,
    colorMode,
    spectralChroma,
    boundaryMode,
    volumeShape,
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
  const previousEffectiveStepBudget = runtimeState.effectiveRaymarchSteps;

  runtimeState.requestedRaymarchSteps = requestedStepBudget;
  runtimeState.effectiveRaymarchSteps = effectiveStepBudget;
  if (
    runtimeState.uniforms?.uRaymarchSteps &&
    runtimeState.uniforms.uRaymarchSteps.value !== effectiveStepBudget
  ) {
    runtimeState.uniforms.uRaymarchSteps.value = effectiveStepBudget;
  }
  if (
    runtimeState.volumeMesh?.material &&
    previousEffectiveStepBudget !== effectiveStepBudget
  ) {
    syncRaymarchMaterialSteps(runtimeState.volumeMesh, effectiveStepBudget);
  }

  return effectiveStepBudget;
}

function buildVisualizationControlSnapshot({
  controls,
  runtimeState,
  uniforms,
  colorMode,
  spectralChroma,
  boundaryMode,
  volumeShape,
  requestedCavityGeometry,
  effectiveCavityGeometry,
  extraUniforms = {},
}) {
  return {
    uniforms: {
      volumeColor: controls.volumeColor,
      surfaceColor: controls.surfaceColor,
      colorMode,
      spectralChroma,
      boundaryMode,
      volumeShape,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      idleLogoIntensity: uniforms.uIdleLogoIntensity.value,
      idleLogoSize: uniforms.uIdleLogoSize.value,
      idleLogoColor: controls.idleLogoColor,
      densityGain: uniforms.uDensityGain.value,
      motionAmount: runtimeState.reactivityTuning?.motionAmount,
      ...extraUniforms,
    },
    overlay: {
      visible: runtimeState.idleOverlay?.visible ?? false,
      scale: runtimeState.idleOverlay?.scale?.x ?? controls.idleLogoSize,
    },
    observer: {
      patternPersistenceSeconds:
        runtimeState.cymaticObserverTuning.geometryExposureSeconds,
    },
  };
}

export function applyRaymarchControls(runtimeState, controls) {
  const {
    uniforms,
    colorMode,
    spectralChroma,
    boundaryMode,
    volumeShape,
    requestedCavityGeometry,
    effectiveCavityGeometry,
  } = applyCommonVisualizationControls(runtimeState, controls);

  uniforms.uLaserDeflectionGain.value = controls.laserDeflectionGain;
  // The public keys are retained as preset/OSC boundary contracts. The
  // analytic optical core owns them by their physical quantities.
  uniforms.uCausticStrength.value = controls.holographicIntensity;
  uniforms.uLaserFocus.value = controls.holographicFresnelPower;

  return buildVisualizationControlSnapshot({
    controls,
    runtimeState,
    uniforms,
    colorMode,
    spectralChroma,
    boundaryMode,
    volumeShape,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    extraUniforms: {
      laserDeflectionGain: uniforms.uLaserDeflectionGain.value,
      causticStrength: uniforms.uCausticStrength.value,
      laserFocus: uniforms.uLaserFocus.value,
      raymarchSteps: Math.round(runtimeState.volumeMesh.material.steps),
    },
  });
}

export function applyVisualizationControls(method, runtimeState, controls) {
  if (!runtimeState) {
    return null;
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
      stepReference: effective.stepReference,
      stepCompensation: effective.stepCompensation,
      lowStepBloomGuard: effective.lowStepBloomGuard,
    };
  }

  // Traditional bloom is a separate additive post-process. The fixed optical
  // PSF remains immutable and is never parameterized by these controls.
  syncRenderOutputBloomUniforms(postNodes, {
    enabled: effectiveBloomEnabled,
    strength: effective.strength,
    radius: effective.radius,
    threshold: effective.threshold,
  });
  // Only actual graph changes such as output mode or SMAA rebuild topology.
  syncRenderOutputNodeTopology(pipeline, postNodes, {
    outputMode,
    smaaEnabled: controls.smaaEnabled !== false,
  });

  return {
    enabled: effectiveBloomEnabled,
    strength: effective.strength,
    radius: effective.radius,
    threshold: effective.threshold,
    stepReference: effective.stepReference,
    stepCompensation: effective.stepCompensation,
    lowStepBloomGuard: effective.lowStepBloomGuard,
  };
}

export function buildAuditControlSnapshot(controls) {
  return {
    enabled: controls.auditEnabled === true,
    freezeModeSlots: controls.freezeModeSlots === true,
    forceWebGLFallbackTest: controls.forceWebGLFallbackTest === true,
    suppressPlaybackTelemetry: controls.suppressPlaybackTelemetry === true,
    injectTestTone: controls.injectTestTone === true,
    testToneHz: controls.testToneHz,
    testToneSignal: controls.testToneSignal,
    testToneAmplitude: controls.testToneAmplitude,
    logEveryFrames: controls.logEveryFrames,
  };
}

export function applyAuditControls(featureState, controls) {
  const snapshot = buildAuditControlSnapshot(controls);
  if (!featureState?.audit?.settings) {
    return snapshot;
  }

  Object.assign(featureState.audit.settings, snapshot);
  return snapshot;
}

const SCENE_MOTION_MAX_DELTA_TIME = 1 / 30;

function normalizeSceneMotionDeltaTime(deltaTime) {
  const nextDeltaTime = Number(deltaTime);
  if (!Number.isFinite(nextDeltaTime) || nextDeltaTime <= 0) {
    return 0;
  }

  return Math.min(nextDeltaTime, SCENE_MOTION_MAX_DELTA_TIME);
}

export function applySceneControls(target, controls, deltaTime, featureFrame) {
  const runtimeState = target?.points ? target : null;
  const cymaticRoot =
    runtimeState?.cymaticRoot ?? runtimeState?.volumeMesh ?? target;
  if (!cymaticRoot?.rotation) return null;

  const sceneMotion =
    runtimeState?.sceneMotion ??
    createSceneMotionState(cymaticRoot.rotation.y ?? 0);
  const rotationMode = normalizeRotationMode(controls.rotationMode);
  const manualVelocity = getManualVelocity(controls);
  const idleLogoRotationMode = normalizeIdleLogoRotationMode(
    controls.idleLogoRotationMode,
  );
  const idleLogoManualVelocity = getIdleLogoManualVelocity(controls);
  const userScale = getMotionAmount(controls, runtimeState);
  const audioMotionDriven = allowsAudioMotion(featureFrame);
  const sceneDeltaTime = normalizeSceneMotionDeltaTime(deltaTime);
  const signals = deriveSceneSignals(
    featureFrame,
    runtimeState?.responseEnvelope ?? 0,
    sceneMotion.lastMotionSignal,
  );

  sceneMotion.pitch = Number.isFinite(cymaticRoot.rotation.x)
    ? cymaticRoot.rotation.x
    : (sceneMotion.pitch ?? 0);
  sceneMotion.yaw = cymaticRoot.rotation.y ?? sceneMotion.yaw ?? 0;
  sceneMotion.roll = Number.isFinite(cymaticRoot.rotation.z)
    ? cymaticRoot.rotation.z
    : (sceneMotion.roll ?? 0);

  let effectiveMotionAmount;
  if (rotationMode === "audio" && audioMotionDriven) {
    const autoBase = deriveAutoMotionAmount(
      sceneMotion,
      signals.energySignal,
      sceneDeltaTime,
    );
    effectiveMotionAmount = userScale * autoBase;
  } else {
    effectiveMotionAmount = userScale;
  }

  if (rotationMode === "manual") {
    stepManualSceneMotion(sceneMotion, manualVelocity, sceneDeltaTime);
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
      deltaTime: sceneDeltaTime,
    });
  } else if (rotationMode === "audio" && featureFrame && !audioMotionDriven) {
    stopAudioSceneMotion(sceneMotion);
  } else {
    stepSettlingSceneMotion(sceneMotion, sceneDeltaTime);
  }
  sceneMotion.lastMotionSignal = signals.motionSignal;

  cymaticRoot.rotation.x = sceneMotion.pitch;
  cymaticRoot.rotation.y = sceneMotion.yaw;
  cymaticRoot.rotation.z = sceneMotion.roll;

  const idleLogoRotation = runtimeState?.idleOverlay?.rotation ?? null;
  const idleLogoMotion =
    runtimeState?.idleLogoMotion ??
    createIdleLogoMotionState(idleLogoRotation?.y ?? 0);
  if (idleLogoRotation) {
    idleLogoMotion.yaw = Number.isFinite(idleLogoRotation.y)
      ? idleLogoRotation.y
      : idleLogoMotion.yaw;
    stepIdleLogoMotion(
      idleLogoMotion,
      idleLogoRotationMode,
      idleLogoManualVelocity,
      sceneDeltaTime,
    );
    idleLogoRotation.y = idleLogoMotion.yaw;
  }
  if (runtimeState) {
    runtimeState.sceneMotion = sceneMotion;
    runtimeState.idleLogoMotion = idleLogoMotion;
  }

  return buildSceneSnapshot({
    rotationMode,
    rotationSpeed: controls.rotationSpeed,
    motionAmount: effectiveMotionAmount,
    signals,
    sceneMotion,
    rotationX: cymaticRoot.rotation.x,
    rotationY: cymaticRoot.rotation.y,
    rotationZ: cymaticRoot.rotation.z,
    idleLogoRotationMode,
    idleLogoRotationSpeed:
      controls.idleLogoRotationSpeed ?? RENDER_DEFAULTS.idleLogoRotationSpeed,
    idleLogoMotion,
    idleLogoRotationY: idleLogoRotation?.y ?? idleLogoMotion.yaw,
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
