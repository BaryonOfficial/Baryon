import { instancedArray } from "three/tsl";
import {
  BEAT_DEFAULTS,
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
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    backboneModeBuffer,
    detailModeBuffer,
    capacity: audioConfig.capacity,
    uniforms,
  });
  const idleOverlay = createIdleOverlay({
    baryonGeometry,
    uniforms,
  });
  const { root: points, visualRoot } = createRaymarchSceneRoot({
    volumeMesh,
    idleOverlay,
    radius: parameters.radius,
  });

  return {
    method: VISUALIZATION_METHODS.raymarch,
    points,
    object: points,
    visualRoot,
    volumeMesh,
    idleOverlay,
    uniforms,
    backboneModeBuffer,
    detailModeBuffer,
    capacity: audioConfig.capacity,
    fftSize: audioConfig.fftSize,
    fieldStateValues: FIELD_STATE_VALUES,
    stabilityStats: estimateProjectedSphereStats({
      radius: parameters.radius,
    }),
    beatTuning: {
      beatSensitivity: BEAT_DEFAULTS.beatSensitivity,
      pulseAmount: BEAT_DEFAULTS.pulseAmount,
      pulseDecayMs: BEAT_DEFAULTS.pulseDecayMs,
    },
    bloomTuning: {
      bloomResponseBias: RENDER_DEFAULTS.bloomResponseBias,
      stepReference: STEP_REFERENCE,
      stepCompensation: deriveStepCompensation(RAYMARCH_DEFAULTS.raymarchSteps),
      lowStepBloomGuard: deriveLowStepBloomGuard(
        RAYMARCH_DEFAULTS.raymarchSteps,
      ),
      effectiveStrength: RENDER_DEFAULTS.bloomStrength,
      effectiveRadius: RENDER_DEFAULTS.bloomRadius,
      effectiveThreshold: RENDER_DEFAULTS.bloomThreshold,
    },
    baseDensityGain: uniforms.uDensityGain.value,
    pulseEnvelope: 0,
    lastConsumedBeatPulseId: 0,
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
