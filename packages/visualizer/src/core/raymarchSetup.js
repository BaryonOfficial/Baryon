import { instancedArray } from "three/tsl";
import {
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import {
  createRaymarchVolumeMesh,
  createIdleOverlay,
} from "./raymarch/material.js";
import { estimateProjectedSphereStats } from "./raymarch/intersection.js";
import {
  createRaymarchSceneRoot,
  disposeRaymarchRuntime,
  tickRaymarchRuntime,
} from "./raymarch/runtime.js";
import { createRaymarchUniforms } from "./raymarch/uniforms.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./raymarch/stepStability.js";
import { VISUALIZATION_METHODS } from "../visualization/types.js";

function createModeBuffer(capacity) {
  const modeBuffer = instancedArray(capacity, "vec4");
  modeBuffer.value.array.fill(0);
  modeBuffer.value.needsUpdate = true;
  return modeBuffer;
}

export function setupRaymarch(baryonGeometry, parameters, audioConfig) {
  const uniforms = createRaymarchUniforms(parameters);
  const backboneModeBuffer = createModeBuffer(audioConfig.capacity);
  const detailModeBuffer = createModeBuffer(audioConfig.capacity);
  const backboneColorBuffer = createModeBuffer(audioConfig.capacity);
  const detailColorBuffer = createModeBuffer(audioConfig.capacity);
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    capacity: audioConfig.capacity,
    uniforms,
  });
  const idleOverlay = createIdleOverlay({
    baryonGeometry,
    uniforms,
  });
  const {
    root: points,
    visualRoot,
    sceneLighting,
  } = createRaymarchSceneRoot({
    volumeMesh,
    idleOverlay,
    radius: parameters.radius,
  });

  return {
    method: VISUALIZATION_METHODS.raymarch,
    points,
    object: points,
    visualRoot,
    sceneLighting,
    volumeMesh,
    idleOverlay,
    uniforms,
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    capacity: audioConfig.capacity,
    fftSize: audioConfig.fftSize,
    fieldStateValues: FIELD_STATE_VALUES,
    stabilityStats: estimateProjectedSphereStats({
      radius: parameters.radius,
    }),
    reactivityTuning: {
      reactivity: REACTIVITY_DEFAULTS.reactivity,
      motionAmount: REACTIVITY_DEFAULTS.motionAmount,
      structurePersistence: REACTIVITY_DEFAULTS.structurePersistence,
    },
    bloomTuning: {
      bloomResponseBias: RENDER_DEFAULTS.bloomResponseBias,
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(RAYMARCH_DEFAULTS.raymarchSteps),
      lowStepBloomGuard: deriveLowStepBloomGuard(
        RAYMARCH_DEFAULTS.raymarchSteps,
      ),
      baseStrength: RENDER_DEFAULTS.bloomStrength,
      baseRadius: RENDER_DEFAULTS.bloomRadius,
      baseThreshold: RENDER_DEFAULTS.bloomThreshold,
      effectiveStrength: RENDER_DEFAULTS.bloomStrength,
      effectiveRadius: RENDER_DEFAULTS.bloomRadius,
      effectiveThreshold: RENDER_DEFAULTS.bloomThreshold,
    },
    baseDensityGain: uniforms.uDensityGain.value,
    baseThreshold: uniforms.uThreshold.value,
    baseContourSharpness: uniforms.uContourSharpness.value,
    chromesthesia: {
      colorMode: RENDER_DEFAULTS.colorMode,
      chromesthesiaMix:
        RENDER_DEFAULTS.colorMode === "chromesthesia"
          ? RENDER_DEFAULTS.chromesthesiaMix
          : 0,
    },
    sceneMotion: {
      yaw: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
      lastMotionSignal: 0,
      lastBeatPulseId: 0,
      idleLogoYaw: 0,
    },
    responseEnvelope: 0,
    accentEnvelope: 0,
    beatPulseEnvelope: 0,
    keyHue: 0,
    keyModeSmooth: 0,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    debugSnapshot: null,
  };
}

export function tickRaymarch(
  renderer,
  raymarchState,
  featureFrame,
  time,
  deltaTime,
) {
  void renderer;
  tickRaymarchRuntime(raymarchState, featureFrame, time, deltaTime);
}

export function disposeRaymarch(raymarchState) {
  disposeRaymarchRuntime(raymarchState);
}
