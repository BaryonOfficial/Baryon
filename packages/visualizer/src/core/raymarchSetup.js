import { instancedArray } from "three/tsl";
import {
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  resolveEffectiveCavityGeometry,
} from "./cavityGeometry.js";
import {
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import {
  createRaymarchVolumeMesh,
  createIdleOverlay,
} from "./raymarch/material.js";
import {
  RAYMARCH_PHASE_COHERENT_FIELD_BACKBONE_LIMIT,
  RAYMARCH_PHASE_COHERENT_FIELD_DETAIL_LIMIT,
  createRaymarchSpectralLightCache,
  createRaymarchFieldCache,
  createRaymarchPhaseCoherentFieldCache,
} from "./raymarch/fieldCache.js";
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

function resolveLayerCapacity(
  explicitCapacity,
  sharedCapacity,
  defaultCapacity,
) {
  const requestedCapacity = Number.isFinite(explicitCapacity)
    ? explicitCapacity
    : sharedCapacity;
  return Math.max(
    1,
    Math.min(Math.round(requestedCapacity || defaultCapacity), defaultCapacity),
  );
}

export function setupRaymarch(baryonGeometry, parameters, audioConfig) {
  const uniforms = createRaymarchUniforms(parameters);
  const requestedCavityGeometry =
    parameters.cavityGeometry ?? DEFAULT_REQUESTED_CAVITY_GEOMETRY;
  const effectiveCavityGeometry = resolveEffectiveCavityGeometry(
    requestedCavityGeometry,
  );
  const sharedModeCapacity = audioConfig?.capacity;
  const backboneCapacity = resolveLayerCapacity(
    audioConfig?.backboneCapacity,
    sharedModeCapacity,
    AUDIO_DEFAULTS.backboneStackSlots,
  );
  const detailCapacity = resolveLayerCapacity(
    audioConfig?.detailCapacity,
    sharedModeCapacity,
    AUDIO_DEFAULTS.detailStackSlots,
  );
  const backboneModeBuffer = createModeBuffer(backboneCapacity);
  const detailModeBuffer = createModeBuffer(detailCapacity);
  const backboneColorBuffer = createModeBuffer(backboneCapacity);
  const detailColorBuffer = createModeBuffer(detailCapacity);
  const backbonePhaseBuffer = createModeBuffer(
    RAYMARCH_PHASE_COHERENT_FIELD_BACKBONE_LIMIT,
  );
  const detailPhaseBuffer = createModeBuffer(
    RAYMARCH_PHASE_COHERENT_FIELD_DETAIL_LIMIT,
  );
  const fieldCache = createRaymarchFieldCache();
  const spectralLightCache = createRaymarchSpectralLightCache();
  const phaseCoherentFieldCache = createRaymarchPhaseCoherentFieldCache();
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    fieldCacheTexture: fieldCache.texture,
    spectralLightCacheTexture: spectralLightCache.texture,
    phaseCoherentFieldTexture: phaseCoherentFieldCache.texture,
    backboneCapacity,
    detailCapacity,
    uniforms,
    cavityGeometry: effectiveCavityGeometry,
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
    backbonePhaseBuffer,
    detailPhaseBuffer,
    fieldCache,
    spectralLightCache,
    phaseCoherentFieldCache,
    sharedModeCapacity,
    // Compatibility alias for older runtime call sites that still read `capacity`.
    capacity: sharedModeCapacity,
    backboneCapacity,
    detailCapacity,
    backbonePhaseCapacity: RAYMARCH_PHASE_COHERENT_FIELD_BACKBONE_LIMIT,
    detailPhaseCapacity: RAYMARCH_PHASE_COHERENT_FIELD_DETAIL_LIMIT,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    fftSize: audioConfig.fftSize,
    fieldStateValues: FIELD_STATE_VALUES,
    stabilityStats: estimateProjectedSphereStats({
      radius: parameters.radius,
    }),
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
  tickRaymarchRuntime(raymarchState, featureFrame, time, deltaTime, renderer);
}

export function disposeRaymarch(raymarchState) {
  disposeRaymarchRuntime(raymarchState);
}
