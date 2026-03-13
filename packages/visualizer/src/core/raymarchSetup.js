import { instancedArray } from "three/tsl";
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
  const points = createRaymarchSceneRoot({
    volumeMesh,
    idleOverlay,
    radius: parameters.radius,
  });

  return {
    method: VISUALIZATION_METHODS.raymarch,
    points,
    object: points,
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
    debugSnapshot: null,
  };
}

export function tickRaymarch(renderer, raymarchState, featureFrame, time) {
  void renderer;
  tickRaymarchRuntime(raymarchState, featureFrame, time);
}

export function disposeRaymarch(raymarchState) {
  disposeRaymarchRuntime(raymarchState);
}
