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
import { createPortableModalUniformBuffer } from "./raymarch/portableModalUniforms.js";
import { createModalFieldCache } from "./raymarch/fieldCacheBake.js";
import { createCymaticPlasmaProfileLookup } from "./raymarch/cymaticPlasmaProfileLookup.js";
import { estimateProjectedSphereStats } from "./raymarch/intersection.js";
import { RAYMARCH_DEFAULTS } from "../defaults.js";
import {
  createRaymarchSceneRoot,
  disposeRaymarchRuntime,
  prepareRaymarchRuntime,
  tickRaymarchRuntime,
} from "./raymarch/runtime.js";
import { createVisualizationUniforms } from "./visualizationUniforms.js";
import {
  deriveLowStepBloomGuard,
  deriveStepCompensation,
  STEP_REFERENCE,
} from "./raymarch/stepStability.js";
import { VISUALIZATION_METHODS } from "../visualization/types.js";
import { CYMATIC_OBSERVER_REFERENCE } from "./raymarch/cymaticObserverReference.js";

function createModeBuffer(capacity) {
  return createPortableModalUniformBuffer(capacity);
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
 * @param {{ radius?: number, cavityGeometry?: string, volumeShape?: string }} parameters
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
  const modalFieldSpectralMomentBuffer = createModeBuffer(modalFieldCapacity);
  // One vec4 per admitted basis family carries its shell-projected pressure
  // amplitude and family scalars. The bake coherently accumulates consecutive
  // exact-eigenvalue members before squaring; detector exposure stays separate.
  const modalFieldCoefficientBuffer = createModeBuffer(modalFieldCapacity);
  // Renderer-only response metadata stays separate from the public mode
  // packet: x = response/natural frequency, y = exact-shell end marker.
  const modalFieldResponseBuffer = createModeBuffer(modalFieldCapacity);
  const volumeShape = normalizeVolumeShape(parameters.volumeShape);
  // The modal packet is evaluated once per voxel into this cache, and the
  // march reads it back. Both the bake and the march are built against the
  // same uniform buffers, so there is still exactly one modal packet.
  const fieldCache = createModalFieldCache({
    modalFieldModeUniforms: modalFieldModeBuffer.uniforms,
    modalFieldCoefficientUniforms: modalFieldCoefficientBuffer.uniforms,
    modalFieldResponseUniforms: modalFieldResponseBuffer.uniforms,
    modalFieldSpectralMomentUniforms: modalFieldSpectralMomentBuffer.uniforms,
    modalFieldModeCount: uniforms.uModalFieldModeCount,
    radius: uniforms.uRadius,
  });
  const plasmaProfileLookup = createCymaticPlasmaProfileLookup({
    // At the generic minimum one march step can span the whole radius. The
    // lookup therefore covers radius, not only the current quality profile's
    // narrower step interval.
    maximumIntervalWidthWorld: Math.max(parameters.radius, 1e-4),
  });
  const volumeMesh = createRaymarchVolumeMesh({
    radius: parameters.radius,
    fieldCache,
    plasmaProfileLookup,
    modalFieldCapacity,
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
    cymaticRoot,
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
    cymaticRoot,
    sceneLighting,
    volumeMesh,
    idleOverlay,
    uniforms,
    fieldCache,
    plasmaProfileLookup,
    modalFieldModeBuffer,
    modalFieldSpectralMomentBuffer,
    modalFieldCoefficientBuffer,
    modalFieldResponseBuffer,
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
    cymaticObserverTuning: {
      geometryExposureSeconds:
        CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
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
    sceneMotion: {
      yaw: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
      lastMotionSignal: 0,
      lastBeatPulseId: 0,
    },
    idleLogoMotion: {
      yaw: 0,
      angularVelocity: 0,
      targetAngularVelocity: 0,
    },
    responseEnvelope: 0,
    summaryResponseEnvelope: 0,
    accentEnvelope: 0,
    beatPulseEnvelope: 0,
    shaderBeatPhase: null,
    motionSignal: 0,
    scaleSignal: 0,
    bloomResponseSignal: 0,
    debugSnapshot: null,
  };
}

export function tickRaymarch(
  raymarchState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
) {
  tickRaymarchRuntime(raymarchState, featureFrame, time, deltaTime, renderer);
}

export function prepareRaymarch(
  raymarchState,
  featureFrame,
  renderer,
  { camera = null, scene = null } = {},
) {
  return prepareRaymarchRuntime(raymarchState, featureFrame, renderer, {
    camera,
    scene,
  });
}

export function failClosedRaymarch(
  raymarchState,
  { status = null, time = 0, deltaTime = 0 } = {},
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
  );
}

export function disposeRaymarch(raymarchState) {
  disposeRaymarchRuntime(raymarchState);
}
