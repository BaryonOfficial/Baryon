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
import { normalizeVolumeShape } from "./volumeShape.js";
import {
  createRaymarchVolumeMesh,
  createIdleOverlay,
} from "./raymarch/material.js";
import {
  createRaymarchLiveFieldProjectionCache,
  createRaymarchModalBasisCache,
  createRaymarchSpectralLaneCache,
} from "./raymarch/fieldCache.js";
import { createRaymarchLaserTransportCache } from "./raymarch/laserTransport.js";
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
 * @param {{ radius?: number, carrierCoreFwhmWorld?: number, cavityGeometry?: string, volumeShape?: string }} parameters
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
  const modalFieldSpectralLaneABuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldSpectralLaneBBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldSpectralMetaBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldMetadataBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldPhaseBuffer = createModeBuffer(modalFieldCapacity);
  const modalFieldCoefficientBuffer = createModeBuffer(modalFieldCapacity);
  const modalBasisCache = createRaymarchModalBasisCache();
  const liveFieldProjectionCache = createRaymarchLiveFieldProjectionCache({
    resolution: modalBasisCache.resolution,
  });
  const spectralLaneCache = createRaymarchSpectralLaneCache({
    resolution: modalBasisCache.resolution,
  });
  const volumeShape = normalizeVolumeShape(parameters.volumeShape);
  const laserTransportCache = createRaymarchLaserTransportCache({
    resolution: modalBasisCache.resolution,
    volumeShape,
  });
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    modalBasisAtlasTexture: modalBasisCache.texture,
    modalLiveFieldTexture: liveFieldProjectionCache.fieldTexture,
    modalLiveSupportTexture: liveFieldProjectionCache.supportTexture,
    modalPressureRadiationTexture:
      liveFieldProjectionCache.pressureRadiationTexture,
    modalPhaseInterferenceTexture:
      liveFieldProjectionCache.phaseInterferenceTexture,
    laserIrradianceTexture: laserTransportCache.irradianceTexture,
    spectralLaneTextureA: spectralLaneCache.spectralLaneTextureA,
    spectralLaneTextureB: spectralLaneCache.spectralLaneTextureB,
    spectralLaneStatsTexture: spectralLaneCache.spectralLaneStatsTexture,
    modalFieldModeBuffer,
    modalFieldCoefficientBuffer,
    modalFieldCapacity: modalBasisCache.liveSynthesisModeCount,
    uniforms,
    cavityGeometry: effectiveCavityGeometry,
    volumeShape,
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
    modalFieldSpectralLaneABuffer,
    modalFieldSpectralLaneBBuffer,
    modalFieldSpectralMetaBuffer,
    modalFieldMetadataBuffer,
    modalFieldPhaseBuffer,
    modalFieldCoefficientBuffer,
    modalBasisCache,
    liveFieldProjectionCache,
    spectralLaneCache,
    laserTransportCache,
    modalFieldCapacity,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    fftSize: audioConfig.fftSize,
    fieldStateValues: FIELD_STATE_VALUES,
    stabilityStats: estimateProjectedSphereStats({
      radius: parameters.radius,
    }),
    reactivityTuning: {
      motionAmount: REACTIVITY_DEFAULTS.motionAmount,
    },
    bloomTuning: {
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
    baseCarrierCoreFwhmWorld: uniforms.uCarrierCoreFwhmWorld.value,
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
    shaderBeatPhase: null,
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

export function failClosedRaymarch(
  raymarchState,
  { status = null, time = 0, deltaTime = 0, renderer = null } = {},
) {
  tickRaymarchRuntime(
    raymarchState,
    {
      fieldState: "idle",
      renderAuthority: false,
      renderAuthorityRevoked: true,
      isLiveInputActive: status?.isLiveInputActive === true,
      sourceEvidence: {
        transport: {
          playing: status?.isPlaying === true,
          liveInputActive: status?.isLiveInputActive === true,
        },
      },
    },
    time,
    deltaTime,
    renderer,
  );
}

export function disposeRaymarch(raymarchState) {
  disposeRaymarchRuntime(raymarchState);
}
