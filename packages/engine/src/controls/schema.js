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
  MIN_PERFORMANCE_TARGET_FPS,
  PERFORMANCE_PROFILES,
} from "../render/outputProfilePolicy.js";
import { VISUALIZATION_METHODS } from "../visualization/types.js";

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
  shape: Object.freeze({
    title: "Shape",
    order: 30,
    expanded: false,
  }),
  color: Object.freeze({
    title: "Color",
    order: 40,
    expanded: false,
  }),
  motion: Object.freeze({
    title: "Motion",
    order: 50,
    expanded: false,
  }),
  bloom: Object.freeze({
    title: "Bloom",
    order: 60,
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

  // ── Shape ──────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "zeroPointPrecision",
      label: "Node Threshold",
      title:
        "How sharp the bright ring structures appear — lower values create crisper, more defined rings; higher values soften them into blends",
      defaultValue: SIMULATION_DEFAULTS.zeroPointPrecision,
      methods: ALL_METHODS,
      binding: { min: 0.001, max: 0.3, step: 0.001 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uThreshold.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "boundaryMode",
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
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "densityGain",
      label: "Density",
      title:
        "How thick and bright the overall volume body appears — raise for a bolder, denser orb",
      defaultValue: RAYMARCH_DEFAULTS.densityGain,
      methods: methodsFor("shared"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uDensityGain.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "absorption",
      label: "Absorption",
      title:
        "Depth contrast inside the orb — raise for crisper internal layers and less haze",
      defaultValue: RAYMARCH_DEFAULTS.absorption,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uAbsorption.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 40,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "opacityGain",
      label: "Opacity",
      title:
        "How solid the orb appears — raise for a stronger presence, especially when compositing over video",
      defaultValue: RAYMARCH_DEFAULTS.opacityGain,
      methods: ALL_METHODS,
      binding: { min: 0.1, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uOpacityGain.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 50,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "raymarchSteps",
      label: "Steps",
      title:
        "Rendering quality vs. speed — higher values look smoother but may reduce frame rate on slower GPUs",
      defaultValue: RAYMARCH_DEFAULTS.raymarchSteps,
      methods: methodsFor("volume"),
      binding: { min: 16, max: 192, step: 1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.volumeMesh.material.steps",
      status: CONTROL_STATUSES.live,
      controlOrder: 60,
    },
    CONTROL_GROUPS.shape,
  ),

  // ── Color ──────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "volumeColor",
      label: "Volume",
      title: "Main volume color of the orb interior",
      defaultValue: RENDER_DEFAULTS.volumeColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uColor.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "surfaceColor",
      label: "Contour",
      title: "Color of the sharpest ring edges and contour highlights",
      defaultValue: RENDER_DEFAULTS.surfaceColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uSurfaceColor.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "outputBackgroundColor",
      label: "Output Color",
      title: "Background fill color used in Opaque output mode",
      defaultValue: RENDER_DEFAULTS.outputBackgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.backgroundColor",
      status: CONTROL_STATUSES.live,
      visibleWhen: { key: "outputMode", value: "opaque" },
      controlOrder: 20,
    },
    CONTROL_GROUPS.output,
  ),
  withControlGroup(
    {
      key: "colorMode",
      label: "Color Mode",
      title:
        "Static uses your chosen colors; Spectral colors promoted cymatic modes from the audio spectrum",
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
      runtimePath: "runtime.spectralLight.colorMode",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "spectralMix",
      label: "Color Mix",
      title:
        "How strongly Spectral Light colors tint the volume when Color Mode is set to Spectral",
      defaultValue: RENDER_DEFAULTS.spectralMix,
      methods: ALL_METHODS,
      binding: { min: 0.01, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uSpectralMix.value",
      status: CONTROL_STATUSES.live,
      visibleWhen: { key: "colorMode", value: "spectral" },
      controlOrder: 40,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "holographicIntensity",
      label: "Sheen",
      title: "Adds a holographic sheen to the orb's surface edges",
      defaultValue: RAYMARCH_DEFAULTS.holographicIntensity,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uHolographicIntensity.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 50,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "holographicShift",
      label: "Sheen Color",
      title: "How far the sheen color shifts toward cool blue-green tones",
      defaultValue: RAYMARCH_DEFAULTS.holographicShift,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uHolographicShift.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 60,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "holographicFresnelPower",
      label: "Sheen Edge",
      title:
        "How tight the sheen is to the very edge — higher values confine it to a thinner rim",
      defaultValue: RAYMARCH_DEFAULTS.holographicFresnelPower,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0.5, max: 8, step: 0.1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uHolographicFresnelPower.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 70,
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "idleLogoIntensity",
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
      label: "Logo Size",
      title: "Size of the idle logo overlay shown when no audio is playing",
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

  // ── Motion ─────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "rotationMode",
      label: "Rotation Mode",
      title:
        "Audio = orb rotates with the music; Manual = set a fixed speed below; Off = stationary",
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
      label: "Manual Rotation",
      title:
        "Spin speed in Manual rotation mode — negative values reverse direction",
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
      key: "reactivity",
      label: "Reactivity",
      title:
        "How strongly the visuals respond to the audio — raise for more dramatic reactions",
      defaultValue: REACTIVITY_DEFAULTS.reactivity,
      methods: ALL_METHODS,
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.reactivityTuning.reactivity",
      status: CONTROL_STATUSES.live,
      controlOrder: 40,
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "motionAmount",
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
  // ── Bloom ──────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "bloomEnabled",
      label: "Bloom",
      title: "Toggle the bloom/halo effect around bright parts of the orb",
      defaultValue: RENDER_DEFAULTS.bloomEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "pipeline.outputNode",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "bloomStrength",
      label: "Bloom Strength",
      title: "How bright the bloom halo is",
      defaultValue: RENDER_DEFAULTS.bloomStrength,
      methods: ALL_METHODS,
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.strength.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 20,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "bloomRadius",
      label: "Bloom Radius",
      title: "How far the bloom spreads from bright areas",
      defaultValue: RENDER_DEFAULTS.bloomRadius,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.radius.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "bloomThreshold",
      label: "Bloom Threshold",
      title:
        "Minimum brightness before a region contributes to bloom — raise to limit it to the brightest highlights",
      defaultValue: RENDER_DEFAULTS.bloomThreshold,
      methods: methodsFor("shared"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.threshold.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 40,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "backgroundColor",
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
      label: "Profile",
      title:
        "Auto adapts raymarch steps toward 60 FPS, Custom uses your Target FPS, and Max Quality leaves raymarch steps ungoverned.",
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
      key: "outputMode",
      label: "Mode",
      title:
        "Transparent composites over other content; Opaque renders its own solid background",
      defaultValue: RENDER_DEFAULTS.outputMode,
      methods: ALL_METHODS,
      binding: {
        view: "segmented",
        options: {
          Transparent: "transparent",
          Opaque: "opaque",
        },
      },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.outputMode",
      status: CONTROL_STATUSES.live,
      controlOrder: 10,
    },
    CONTROL_GROUPS.output,
  ),
  withControlGroup(
    {
      key: "performanceHudEnabled",
      label: "HUD",
      title: "Shows FPS and render resolution on screen",
      defaultValue: RENDER_DEFAULTS.performanceHudEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.performanceHudEnabled",
      status: CONTROL_STATUSES.live,
      controlOrder: 30,
    },
    CONTROL_GROUPS.performance,
  ),
  withControlGroup(
    {
      key: "visualizationMethod",
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

  // ── Fine-grained bloom shaping ─────────────────────────────────────────────
  withControlGroup(
    {
      key: "bloomResponseBias",
      label: "Bloom Response",
      title:
        "Makes the bloom smaller and more stable by trimming how easily bloom reacts during crowded frames.",
      defaultValue: RENDER_DEFAULTS.bloomResponseBias,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "runtime.bloomTuning.bloomResponseBias",
      status: CONTROL_STATUSES.live,
      controlOrder: 50,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "rimBloomBias",
      label: "Rim Bloom",
      title:
        "Pushes more brightness toward the outer rim before bloom is applied.",
      defaultValue: RAYMARCH_DEFAULTS.rimBloomBias,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uRimBloomBias.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 60,
    },
    CONTROL_GROUPS.bloom,
  ),
  withControlGroup(
    {
      key: "rimCompression",
      label: "Rim Compression",
      title: "Tames sharp edge spikes before they reach the bloom pass.",
      defaultValue: RAYMARCH_DEFAULTS.rimCompression,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uRimCompression.value",
      status: CONTROL_STATUSES.live,
      controlOrder: 70,
    },
    CONTROL_GROUPS.bloom,
  ),

  // ── Diagnostics (debug-only) ───────────────────────────────────────────────
  withControlGroup(
    {
      key: "traaEnabled",
      label: "TRAA",
      title:
        "Toggle temporal anti-aliasing for diagnostics. Disable only when isolating render latency, shimmer, or post-process cost.",
      defaultValue: RENDER_DEFAULTS.traaEnabled,
      methods: ALL_METHODS,
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
      label: "SMAA",
      title:
        "Toggle screen-space morphological anti-aliasing on the final output for visual A/B comparison.",
      defaultValue: RENDER_DEFAULTS.smaaEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.smaaEnabled",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "auditEnabled",
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
      key: "lowLoadPlaybackDiagnostics",
      label: "Low-load Playback",
      title:
        "Reduce render overhead during playback diagnostics so you can inspect behavior on slower systems or heavier songs.",
      defaultValue: AUDIT_DEFAULTS.lowLoadPlaybackDiagnostics,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.lowLoadPlaybackDiagnostics",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "cavityGeometry",
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
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "injectTestTone",
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
