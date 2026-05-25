import { instancedArray } from "three/tsl";
import {
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import { createIdleOverlay } from "./raymarch/material.js";
import {
  createCymatics2dSceneRoot,
  disposeCymatics2dRuntime,
  tickCymatics2dRuntime,
} from "./cymatics2d/runtime.js";
import { createFullscreenFieldMesh } from "./cymatics2d/material.js";
import { createVisualizationUniforms } from "./visualizationUniforms.js";
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

export function setupCymatics2d(baryonGeometry, parameters, audioConfig) {
  const uniforms = createVisualizationUniforms(parameters);
  const modalFieldCapacity = audioConfig.modalFieldCapacity ?? audioConfig.capacity;
  const modalFieldModeBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldColorBuffer = createModeBuffer(modalFieldCapacity);
  const fieldMesh = createFullscreenFieldMesh({
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldCapacity,
    uniforms,
  });
  const idleOverlay = createIdleOverlay({
    baryonGeometry,
    uniforms,
  });
  const { root: points, visualRoot } = createCymatics2dSceneRoot({
    fieldMesh,
    idleOverlay,
  });

  return {
    method: VISUALIZATION_METHODS.cymatics2d,
    points,
    object: points,
    visualRoot,
    volumeMesh: fieldMesh,
    fieldMesh,
    idleOverlay,
    uniforms,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldCapacity,
    fftSize: audioConfig.fftSize,
    fieldStateValues: FIELD_STATE_VALUES,
    stabilityStats: {
      avgRaySegmentLength: 0,
      missRatio: 0,
      avgSilhouetteSuppression: 0,
    },
    reactivityTuning: {
      reactivity: REACTIVITY_DEFAULTS.reactivity,
      motionAmount: REACTIVITY_DEFAULTS.motionAmount,
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
    spectralLight: {
      colorMode: RENDER_DEFAULTS.colorMode,
      spectralMix:
        RENDER_DEFAULTS.colorMode === "spectral"
          ? RENDER_DEFAULTS.spectralMix
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
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    slicePhase: 0,
    sliceVelocity: 0,
    debugSnapshot: null,
  };
}

export function tickCymatics2d(
  renderer,
  runtimeState,
  featureFrame,
  time,
  deltaTime,
) {
  void renderer;
  tickCymatics2dRuntime(runtimeState, featureFrame, time, deltaTime);
}

export function disposeCymatics2d(runtimeState) {
  disposeCymatics2dRuntime(runtimeState);
}
