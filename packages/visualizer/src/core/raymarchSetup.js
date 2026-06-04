import { instancedArray } from "three/tsl";
import {
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "./cavityGeometry.js";
import {
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RENDER_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import {
  createRaymarchVolumeMesh,
  createIdleOverlay,
} from "./raymarch/material.js";
import {
  createRaymarchLiveFieldProjectionCache,
  createRaymarchModalBasisCache,
} from "./raymarch/fieldCache.js";
import { estimateProjectedSphereStats } from "./raymarch/intersection.js";
import { RAYMARCH_DEFAULTS } from "../defaults.js";
import {
  createRaymarchSceneRoot,
  disposeRaymarchRuntime,
  tickRaymarchRuntime,
} from "./raymarch/runtime.js";
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

/**
 * @param {object | null} baryonGeometry
 * @param {{ radius?: number, threshold?: number, cavityGeometry?: string }} parameters
 * @param {{ capacity?: number, modalFieldCapacity?: number, fftSize?: number, sampleRate?: number }} audioConfig
 * @param {{ method?: string }} [options]
 */
export function setupRaymarch(
  baryonGeometry,
  parameters,
  audioConfig,
  options = {},
) {
  const method = options.method ?? VISUALIZATION_METHODS.raymarch;
  const uniforms = createVisualizationUniforms(parameters);
  const requestedCavityGeometry = normalizeCavityGeometry(
    parameters.cavityGeometry ?? DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  );
  const effectiveCavityGeometry = resolveEffectiveCavityGeometry(
    requestedCavityGeometry,
  );
  const modalFieldCapacity = resolveLayerCapacity(
    audioConfig?.modalFieldCapacity ?? audioConfig?.capacity,
    AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
  );
  const modalFieldModeBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldColorBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldSpectralBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldPhaseBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldCoefficientBuffer = createModeBuffer(modalFieldCapacity);
  const modalBasisCache = createRaymarchModalBasisCache();
  const liveFieldProjectionCache = createRaymarchLiveFieldProjectionCache({
    resolution: modalBasisCache.resolution,
  });
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    modalBasisAtlasTexture: modalBasisCache.texture,
    modalLiveFieldTexture: liveFieldProjectionCache.fieldTexture,
    modalLiveSupportTexture: liveFieldProjectionCache.supportTexture,
    modalPhaseInterferenceTexture:
      liveFieldProjectionCache.phaseInterferenceTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldCapacity: modalBasisCache.liveSynthesisModeCount,
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
    method,
    points,
    object: points,
    visualRoot,
    sceneLighting,
    volumeMesh,
    idleOverlay,
    uniforms,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldSpectralBuffer,
    modalFieldPhaseBuffer,
    modalFieldCoefficientBuffer,
    modalBasisCache,
    liveFieldProjectionCache,
    modalFieldCapacity,
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
    visibilityDriveEnvelope: 0,
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
