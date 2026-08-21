import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
  TEST_TONE_SIGNALS,
} from "../defaults.js";
import {
  MAX_PERFORMANCE_TARGET_FPS,
  MIN_PRESENTATION_RAYMARCH_STEPS,
  MIN_PERFORMANCE_TARGET_FPS,
  PERFORMANCE_PROFILES,
} from "../render/outputProfilePolicy.js";
import { VISUALIZATION_METHODS } from "../visualization/types.js";
import {
  CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS,
  CYMATIC_OBSERVER_REFERENCE,
} from "../core/raymarch/cymaticObserverReference.js";

export const CONTROL_TARGET_TYPES = Object.freeze({
  uniform: "uniform",
  pipeline: "pipeline",
  object: "object",
  audio: "audio",
  audit: "audit",
});

export const CONTROL_STATUSES = Object.freeze({
  live: "live",
  debugOnly: "debug-only",
});

export const CONTROL_HANDLERS = Object.freeze({
  shared: "shared",
  output: "output",
  raymarch: "raymarch",
  bloom: "bloom",
  scene: "scene",
  audio: "audio",
  audit: "audit",
});

export const CONTROL_SURFACES = Object.freeze({
  listener: "listener",
  performer: "performer",
});

export const SHARED_CONTROL_SURFACES = Object.freeze([
  CONTROL_SURFACES.listener,
  CONTROL_SURFACES.performer,
]);
export const LISTENER_CONTROL_SURFACES = Object.freeze([
  CONTROL_SURFACES.listener,
]);
export const PERFORMER_CONTROL_SURFACES = Object.freeze([
  CONTROL_SURFACES.performer,
]);

const CONTROL_SURFACE_SET = new Set(Object.values(CONTROL_SURFACES));
const CANONICAL_CONTROL_SURFACE_SET = new Set([
  SHARED_CONTROL_SURFACES,
  LISTENER_CONTROL_SURFACES,
  PERFORMER_CONTROL_SURFACES,
]);

export function isControlSurface(surface) {
  return CONTROL_SURFACE_SET.has(surface);
}

export function isCanonicalControlSurfaceSet(surfaces) {
  return CANONICAL_CONTROL_SURFACE_SET.has(surfaces);
}

export const BLOOM_ENHANCER_LIMITS = Object.freeze({
  maximumStrength: 3,
  maximumRadius: 1,
  minimumThreshold: 0,
});

const ALL_METHODS = Object.freeze(Object.values(VISUALIZATION_METHODS));
const METHOD_SCOPES = Object.freeze({
  shared: ALL_METHODS,
  volume: ALL_METHODS,
  raymarchOnly: Object.freeze([VISUALIZATION_METHODS.raymarch]),
});

function methodsFor(scope) {
  return METHOD_SCOPES[scope];
}

const CONTROL_GROUPS = Object.freeze({
  input: Object.freeze({
    title: "Mic Settings",
    order: 10,
    expanded: false,
  }),
  performance: Object.freeze({
    title: "Performance",
    order: 15,
    expanded: false,
  }),
  output: Object.freeze({
    title: "Output",
    order: 20,
    expanded: false,
  }),
  volume: Object.freeze({
    title: "Volume",
    order: 30,
    expanded: false,
  }),
  appearance: Object.freeze({
    title: "Appearance",
    order: 40,
    expanded: false,
  }),
  motion: Object.freeze({
    title: "Motion",
    order: 50,
    expanded: false,
  }),
  logo: Object.freeze({
    title: "Logo",
    order: 70,
    expanded: false,
  }),
  // Controls rendered inline under the Presets section, not as a collapsible folder
  presetsArea: Object.freeze({
    title: "PresetsArea",
    order: 75,
    expanded: false,
  }),
  diagnostics: Object.freeze({
    title: "Diagnostics",
    order: 80,
    expanded: false,
  }),
});

function sortControlsByPresentationOrder(left, right) {
  const leftOrder = left.controlOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.controlOrder ?? Number.MAX_SAFE_INTEGER;
  return leftOrder - rightOrder;
}

function withControlGroup(definition, group) {
  if (!isCanonicalControlSurfaceSet(definition?.surfaces)) {
    throw new TypeError(
      `[Baryon controls] ${definition?.key ?? "Unknown control"} must declare one canonical product-surface set`,
    );
  }
  return {
    ...definition,
    folder: group.title,
    group: group.title,
    groupOrder: group.order,
    groupExpanded: group.expanded,
  };
}

export const CONTROL_DEFINITIONS = Object.freeze([
  // ── Live Input ─────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "liveInputAnalysisClass",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Live Input Mode",
      title:
        "Choose how unknown live devices should be analyzed. Auto uses heuristics, Line Feed pushes live devices through the file-style path, and Acoustic Mic keeps the forgiving mic-specific path.",
      defaultValue: AUDIO_DEFAULTS.liveInputAnalysisClass,
      methods: ALL_METHODS,
      binding: {
        options: {
          Auto: "auto",
          "Line Feed": "line-feed",
          "Acoustic Mic": "acoustic-mic",
        },
      },
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.liveInputAnalysisSettings.analysisClass",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "liveInputAcousticIntent",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Mic Intent",
      title:
        "Choose how acoustic mic input should be interpreted. Ambient is forgiving for rooms and instruments; Vocal emphasizes singing and lead pitch.",
      defaultValue: AUDIO_DEFAULTS.liveInputAcousticIntent,
      methods: ALL_METHODS,
      binding: {
        options: {
          Ambient: "ambient",
          Vocal: "vocal",
        },
      },
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.liveInputAnalysisSettings.acousticIntent",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "echoCancellation",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Echo Cancel",
      title:
        "Suppress speaker bleed and room echo from mic input — helpful when using speakers, but may color the audio spectrum",
      defaultValue: AUDIO_DEFAULTS.echoCancellation,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.liveInputSettings.echoCancellation",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "noiseSuppression",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Noise Suppress",
      title:
        "Filter out steady background noise before analysis — good for noisy rooms, but can soften quieter harmonics",
      defaultValue: AUDIO_DEFAULTS.noiseSuppression,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.liveInputSettings.noiseSuppression",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "autoGainControl",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Auto Gain",
      title:
        "Automatically normalize mic volume — convenient for speech, but flattens dynamics for visualization",
      defaultValue: AUDIO_DEFAULTS.autoGainControl,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.liveInputSettings.autoGainControl",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
    },
    CONTROL_GROUPS.input,
  ),

  // ── Volume ─────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "volumeShape",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Shape",
      title:
        "Clip the rectangular cymatic field to a sphere, or reveal its full cubic domain",
      defaultValue: SIMULATION_DEFAULTS.volumeShape,
      methods: methodsFor("shared"),
      binding: {
        options: {
          Sphere: "sphere",
          Cube: "cube",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.volumeMesh.userData.raymarchVolumeShape",
      status: CONTROL_STATUSES.live,
      controlOrder: 5,
    },
    CONTROL_GROUPS.volume,
  ),
  withControlGroup(
    {
      key: "boundaryMode",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Boundary",
      title:
        "Choose whether the modal family behaves like a reflective boundary (Neumann) or a fixed node at the boundary (Dirichlet)",
      defaultValue: SIMULATION_DEFAULTS.boundaryMode,
      methods: methodsFor("shared"),
      binding: {
        options: {
          Neumann: "neumann",
          Dirichlet: "dirichlet",
        },
      },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uBoundaryMode.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.volume,
  ),
  withControlGroup(
    {
      key: "densityGain",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Material Density",
      title:
        "Scales the luminous cymatic carrier's emission and extinction without changing acoustic topology",
      defaultValue: RAYMARCH_DEFAULTS.densityGain,
      methods: methodsFor("shared"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uDensityGain.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.volume,
  ),
  withControlGroup(
    {
      key: "laserDeflectionGain",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Laser Bending",
      title:
        "How strongly laser rays bend through the acoustic pressure field, changing caustic placement and concentration",
      defaultValue: RAYMARCH_DEFAULTS.laserDeflectionGain,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uLaserDeflectionGain.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 45,
    },
    CONTROL_GROUPS.volume,
  ),
  withControlGroup(
    {
      key: "raymarchSteps",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Max Samples",
      title:
        "Maximum analytic camera-ray sample budget; Auto and Custom profiles may use fewer samples to hold their target frame rate",
      defaultValue: RAYMARCH_DEFAULTS.raymarchSteps,
      methods: methodsFor("volume"),
      binding: {
        min: MIN_PRESENTATION_RAYMARCH_STEPS,
        max: 192,
        step: 1,
      },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.volumeMesh.material.steps",
      status: CONTROL_STATUSES.live,
      controlOrder: 60,
    },
    CONTROL_GROUPS.volume,
  ),

  // ── Appearance ─────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "volumeColor",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Volume Color",
      title: "Main color of the volume interior",
      defaultValue: RENDER_DEFAULTS.volumeColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uColor.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "surfaceColor",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Caustic Color",
      title: "Color of focused laser irradiance revealed by the tracer",
      defaultValue: RENDER_DEFAULTS.surfaceColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uCausticColor.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "outputBackgroundColor",
      surfaces: LISTENER_CONTROL_SURFACES,
      label: "Output Color",
      title: "Background fill color for opaque output",
      defaultValue: RENDER_DEFAULTS.outputBackgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.backgroundColor",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.output,
  ),
  withControlGroup(
    {
      key: "colorMode",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Color Mode",
      title:
        "Static uses your chosen colors; Spectral maps the persistent cymatic phase field through its cyclic palette",
      defaultValue: RENDER_DEFAULTS.colorMode,
      methods: ALL_METHODS,
      binding: {
        options: {
          Static: "static",
          Spectral: "spectral",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uSpectralPresentationEnabled.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "spectralChroma",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Spectral Chroma",
      title:
        "Controls spectral color vividness at constant luminance without blending in static colors",
      defaultValue: RENDER_DEFAULTS.spectralChroma,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uSpectralChroma.value",
      status: CONTROL_STATUSES.live,
      visibleWhen: { key: "colorMode", value: "spectral" },
      controlOrder: 40,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "holographicIntensity",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Caustic Strength",
      title:
        "Scales the camera-visible focused-light lane without changing the acoustic field, ray bending, or material extinction",
      defaultValue: RAYMARCH_DEFAULTS.holographicIntensity,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uCausticStrength.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 50,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "holographicFresnelPower",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Laser Focus",
      title:
        "Controls finite-source angular spread: higher focus produces narrower caustic folds without changing the acoustic field",
      defaultValue: RAYMARCH_DEFAULTS.holographicFresnelPower,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0.5, max: 32, step: 0.1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uLaserFocus.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 70,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "idleLogoIntensity",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Logo Intensity",
      title: "Brightness of the idle logo shown when no audio is playing",
      defaultValue: RENDER_DEFAULTS.idleLogoIntensity,
      methods: ALL_METHODS,
      binding: { min: 0, max: 0.25, step: 0.005 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uIdleLogoIntensity.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.logo,
  ),
  withControlGroup(
    {
      key: "idleLogoSize",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Logo Size",
      title: "Size of the 3D idle logo shown when no audio is playing",
      defaultValue: RENDER_DEFAULTS.idleLogoSize,
      methods: ALL_METHODS,
      binding: { min: 0.1, max: 2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.idleOverlay.scale",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.logo,
  ),
  withControlGroup(
    {
      key: "idleLogoColor",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Logo Color",
      title: "Color of the 3D idle logo shown when no audio is playing",
      defaultValue: RENDER_DEFAULTS.idleLogoColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uIdleLogoColor.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.logo,
  ),
  withControlGroup(
    {
      key: "idleLogoRotationMode",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Logo Rotation",
      title:
        "Manual = rotate the idle logo at the speed below; Off = keep the idle logo stationary",
      defaultValue: RENDER_DEFAULTS.idleLogoRotationMode,
      methods: ALL_METHODS,
      binding: {
        options: {
          Manual: "manual",
          Off: "off",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.scene,
      runtimePath: "runtime.idleLogoMotion.rotationMode",
      status: CONTROL_STATUSES.live,
      controlOrder: 40,
    },
    CONTROL_GROUPS.logo,
  ),
  withControlGroup(
    {
      key: "idleLogoRotationSpeed",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Logo Rotation Speed",
      title:
        "Idle-logo spin speed in Manual mode — negative values reverse direction",
      defaultValue: RENDER_DEFAULTS.idleLogoRotationSpeed,
      methods: ALL_METHODS,
      binding: { min: -12, max: 12, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.scene,
      runtimePath: "runtime.idleLogoMotion.angularVelocity",
      status: CONTROL_STATUSES.live,
      visibleWhen: { key: "idleLogoRotationMode", value: "manual" },
      controlOrder: 50,
    },
    CONTROL_GROUPS.logo,
  ),

  // ── Motion ─────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "rotationMode",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Rotation Mode",
      title:
        "Audio = cymatic render rotates with the music; Manual = set a fixed speed below; Off = stationary",
      defaultValue: RENDER_DEFAULTS.rotationMode,
      methods: methodsFor("raymarchOnly"),
      binding: {
        options: {
          Audio: "audio",
          Manual: "manual",
          Off: "off",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.scene,
      runtimePath: "runtime.sceneMotion.rotationMode",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "rotationSpeed",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Manual Rotation",
      title:
        "Cymatic-render spin speed in Manual rotation mode — negative values reverse direction",
      defaultValue: RENDER_DEFAULTS.rotationSpeed,
      methods: methodsFor("raymarchOnly"),
      binding: { min: -12, max: 12, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.scene,
      runtimePath: "object.rotation.y",
      status: CONTROL_STATUSES.live,
      visibleWhen: { key: "rotationMode", value: "manual" },
      controlOrder: 20,
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "motionAmount",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Motion Scale",
      title:
        "Scales the auto-calibrated rotation in Audio mode (1 = fully automatic; lower = calmer, higher = more intense). Has no effect in Manual rotation mode.",
      defaultValue: REACTIVITY_DEFAULTS.motionAmount,
      methods: ALL_METHODS,
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.scene,
      runtimePath: "runtime.reactivityTuning.motionAmount",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "patternPersistenceSeconds",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Pattern Persistence",
      title:
        "How long cymatic geometry remains visible while it deforms into the next pattern. Higher values are steadier but can overlap more.",
      defaultValue: CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
      methods: methodsFor("raymarchOnly"),
      binding: {
        min: CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.minimumSeconds,
        max: CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.maximumSeconds,
        step: 0.05,
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.cymaticObserverTuning.geometryExposureSeconds",
      status: CONTROL_STATUSES.live,
      controlOrder: 40,
    },
    CONTROL_GROUPS.motion,
  ),
  // Bloom follows color and surface-light controls in the Appearance section.
  withControlGroup(
    {
      key: "bloomEnabled",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Bloom",
      title:
        "Optional soft optical halo. Leave off for the sharp scene-radiance render.",
      defaultValue: RENDER_DEFAULTS.bloomEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "pipeline.outputNode",
      status: CONTROL_STATUSES.live,
      controlOrder: 110,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "bloomStrength",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Bloom Strength",
      title: "How bright the bounded highlight halo is",
      defaultValue: RENDER_DEFAULTS.bloomStrength,
      methods: ALL_METHODS,
      binding: {
        min: 0,
        max: BLOOM_ENHANCER_LIMITS.maximumStrength,
        step: 0.01,
      },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.strength.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 120,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "bloomRadius",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Bloom Radius",
      title: "How far the bounded highlight halo spreads",
      defaultValue: RENDER_DEFAULTS.bloomRadius,
      methods: ALL_METHODS,
      binding: {
        min: 0,
        max: BLOOM_ENHANCER_LIMITS.maximumRadius,
        step: 0.01,
      },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.radius.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 130,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "bloomThreshold",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Bloom Threshold",
      title:
        "Minimum brightness before a region contributes to bloom — raise to limit it to the brightest highlights",
      defaultValue: RENDER_DEFAULTS.bloomThreshold,
      methods: methodsFor("shared"),
      binding: {
        min: BLOOM_ENHANCER_LIMITS.minimumThreshold,
        max: 1,
        step: 0.01,
      },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.threshold.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 140,
    },
    CONTROL_GROUPS.appearance,
  ),
  withControlGroup(
    {
      key: "backgroundColor",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Background",
      title: "Legacy transparent-preview backdrop retained for saved presets",
      defaultValue: RENDER_DEFAULTS.backgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.backdropColor",
      status: CONTROL_STATUSES.live,
      sidebarHidden: true,
      publicReferenceHidden: true,
    },
    CONTROL_GROUPS.output,
  ),
  withControlGroup(
    {
      key: "renderQualityPreset",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Profile",
      title:
        "Auto adapts analytic camera-ray samples toward 60 FPS, Custom uses your Target FPS, and Max Quality leaves the sample budget ungoverned.",
      defaultValue: RENDER_DEFAULTS.renderQualityPreset,
      methods: ALL_METHODS,
      binding: {
        view: "segmented",
        options: {
          Auto: PERFORMANCE_PROFILES.auto,
          Custom: PERFORMANCE_PROFILES.custom,
          Max: PERFORMANCE_PROFILES.maxQuality,
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.renderQualityPreset",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.performance,
  ),
  withControlGroup(
    {
      key: "customTargetFps",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Target FPS",
      title:
        "Used when Profile is Custom to set performer cadence and the adaptive raymarch target.",
      defaultValue: RENDER_DEFAULTS.customTargetFps,
      methods: ALL_METHODS,
      binding: {
        min: MIN_PERFORMANCE_TARGET_FPS,
        max: MAX_PERFORMANCE_TARGET_FPS,
        step: 1,
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.customTargetFps",
      status: CONTROL_STATUSES.live,
      visibleWhen: {
        key: "renderQualityPreset",
        value: PERFORMANCE_PROFILES.custom,
      },
      controlOrder: 20,
    },
    CONTROL_GROUPS.performance,
  ),
  withControlGroup(
    {
      key: "performanceHudEnabled",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "HUD",
      title: "Shows FPS and render resolution on screen",
      defaultValue: RENDER_DEFAULTS.performanceHudEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.performanceHudEnabled",
      status: CONTROL_STATUSES.live,
      pinnedPlacement: "section-header",
      controlOrder: 30,
    },
    CONTROL_GROUPS.performance,
  ),
  withControlGroup(
    {
      key: "visualizationMethod",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Visualizer",
      title: "Visualization method (single 3D Volume raymarch renderer)",
      defaultValue: VISUALIZATION_METHODS.raymarch,
      methods: ALL_METHODS,
      sidebarHidden: true,
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "runtime.method",
      status: CONTROL_STATUSES.live,
      publicReferenceHidden: true,
    },
    CONTROL_GROUPS.output,
  ),
  withControlGroup(
    {
      key: "cameraLocked",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Lock Camera",
      title: "Lock the camera so orbit drag cannot accidentally move the view",
      defaultValue: RENDER_DEFAULTS.cameraLocked,
      methods: ALL_METHODS,
      sidebarHidden: true,
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.cameraLocked",
      status: CONTROL_STATUSES.live,
      publicReferenceHidden: true,
    },
    CONTROL_GROUPS.motion,
  ),

  // ── Diagnostics (debug-only) ───────────────────────────────────────────────
  withControlGroup(
    {
      key: "traaEnabled",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "TRAA",
      title:
        "Toggle temporal anti-aliasing for diagnostics. Disable only when isolating render latency, shimmer, or post-process cost.",
      defaultValue: RENDER_DEFAULTS.traaEnabled,
      methods: methodsFor("raymarchOnly"),
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.traaEnabled",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "smaaEnabled",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "SMAA",
      title:
        "Toggle screen-space morphological anti-aliasing on the final output for visual A/B comparison.",
      defaultValue: RENDER_DEFAULTS.smaaEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.smaaEnabled",
      status: CONTROL_STATUSES.live,
      publicReferenceHidden: true,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "auditEnabled",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Capture Debug Data",
      title:
        "Record per-frame debug data for the active analysis and renderer.",
      defaultValue: AUDIT_DEFAULTS.auditEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.enabled",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "freezeModeSlots",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Freeze Pattern",
      title:
        "Hold the current modal pattern in place instead of updating it from live audio.",
      defaultValue: AUDIT_DEFAULTS.freezeModeSlots,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.freezeModeSlots",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "forceWebGLFallbackTest",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Force WebGL2",
      title:
        "Restart the renderer on the WebGL2 fallback path for compatibility testing. This remounts the canvas.",
      defaultValue: AUDIT_DEFAULTS.forceWebGLFallbackTest,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.forceWebGLFallbackTest",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "suppressPlaybackTelemetry",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Suppress Playback Telemetry",
      title:
        "Pause per-frame devtools snapshots and console audit logs during playback. Rendering quality and frame cadence are unchanged.",
      defaultValue: AUDIT_DEFAULTS.suppressPlaybackTelemetry,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.suppressPlaybackTelemetry",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "cavityGeometry",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Cavity Geometry",
      title:
        "Choose which cavity geometry to request for diagnostics. Spherical is wired through the pipeline, but the renderer still falls back to the rectangular basis today.",
      defaultValue: SIMULATION_DEFAULTS.cavityGeometry,
      methods: methodsFor("raymarchOnly"),
      binding: {
        options: {
          Rectangular: "rectangular",
          Spherical: "spherical",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.requestedCavityGeometry",
      status: CONTROL_STATUSES.debugOnly,
      sidebarHidden: true,
      publicReferenceHidden: true,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "injectTestTone",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Inject Tone",
      title:
        "Replace live audio with a synthetic test tone so you can inspect a known, repeatable input.",
      defaultValue: AUDIT_DEFAULTS.injectTestTone,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.injectTestTone",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "testToneHz",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Tone Hz",
      title:
        "Frequency of the injected test tone in Hz. Low values inspect renderable patterns; high values exercise bandwidth-limit diagnostics.",
      defaultValue: AUDIT_DEFAULTS.testToneHz,
      methods: ALL_METHODS,
      binding: { min: 40, max: 16000, step: 1 },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.testToneHz",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "testToneSignal",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Tone Signal",
      title:
        "Choose whether the injected test signal is a pure sine or an explicit harmonic series.",
      defaultValue: AUDIT_DEFAULTS.testToneSignal,
      methods: ALL_METHODS,
      binding: {
        options: {
          "Pure Sine": TEST_TONE_SIGNALS.pureSine,
          "Harmonic Series": TEST_TONE_SIGNALS.harmonicSeries,
        },
      },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.testToneSignal",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "testToneAmplitude",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Tone Amp",
      title: "How strongly the injected test tone excites the pattern.",
      defaultValue: AUDIT_DEFAULTS.testToneAmplitude,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.testToneAmplitude",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "logEveryFrames",
      surfaces: SHARED_CONTROL_SURFACES,
      label: "Log Frames",
      title:
        "Write a debug snapshot to the browser console every N frames. Use 1 for every frame.",
      defaultValue: AUDIT_DEFAULTS.logEveryFrames,
      methods: ALL_METHODS,
      binding: { min: 1, max: 240, step: 1 },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.logEveryFrames",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
]);

export function createControlState() {
  return CONTROL_DEFINITIONS.reduce((state, definition) => {
    state[definition.key] = definition.defaultValue;
    return state;
  }, {});
}

export function getControlsForMethod(method = VISUALIZATION_METHODS.raymarch) {
  return CONTROL_DEFINITIONS.filter((definition) =>
    definition.methods.includes(method),
  );
}

export function getControlFolders(method = VISUALIZATION_METHODS.raymarch) {
  return getControlsForMethod(method)
    .filter((definition) => definition.sidebarHidden !== true)
    .slice()
    .sort((left, right) => {
      const leftOrder = left.groupOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.groupOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return (left.group ?? left.folder).localeCompare(
        right.group ?? right.folder,
      );
    })
    .reduce((folders, definition) => {
      const group = definition.group ?? definition.folder;
      if (!folders.includes(group)) {
        folders.push(group);
      }
      return folders;
    }, []);
}

export function getControlsForFolder(
  folder,
  method = VISUALIZATION_METHODS.raymarch,
) {
  return getControlsForMethod(method)
    .filter(
      (definition) =>
        definition.sidebarHidden !== true &&
        (definition.group ?? definition.folder) === folder,
    )
    .sort(sortControlsByPresentationOrder);
}
