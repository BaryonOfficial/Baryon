import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../defaults.js";
import {} from "../utils/audioFeatures.js";
import {
  MAX_PERFORMANCE_TARGET_FPS,
  MIN_PERFORMANCE_TARGET_FPS,
  PERFORMANCE_PROFILES,
} from "../render/outputPipeline.js";
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
  mode: Object.freeze({
    title: "Mode",
    order: 15,
    expanded: false,
  }),
  shape: Object.freeze({
    title: "Shape",
    order: 20,
    expanded: false,
  }),
  color: Object.freeze({
    title: "Color",
    order: 30,
    expanded: false,
  }),
  logo: Object.freeze({
    title: "Logo",
    order: 35,
    expanded: false,
  }),
  motion: Object.freeze({
    title: "Motion",
    order: 40,
    expanded: false,
  }),
  display: Object.freeze({
    title: "Display",
    order: 50,
    expanded: false,
  }),
  // Controls rendered inline under the Presets section, not as a collapsible folder
  presetsArea: Object.freeze({
    title: "PresetsArea",
    order: 55,
    expanded: false,
  }),
  diagnostics: Object.freeze({
    title: "Diagnostics",
    order: 60,
    expanded: false,
  }),
});

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
        "How sharp the glowing ring structures appear — lower values create crisper, more defined rings; higher values soften them into blends",
      defaultValue: SIMULATION_DEFAULTS.zeroPointPrecision,
      methods: ALL_METHODS,
      binding: { min: 0.001, max: 0.3, step: 0.001 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uThreshold.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "structureMin",
      label: "Structure Min",
      title:
        "Fades out the faintest, noisiest areas of the field — raise to clean up thin wisps and noise",
      defaultValue: SIMULATION_DEFAULTS.structureMin,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uStructureMin.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "structureMax",
      label: "Structure Max",
      title:
        "Trims the densest inner regions — raise if the center looks too solid or foggy",
      defaultValue: SIMULATION_DEFAULTS.structureMax,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uStructureMax.value",
      status: CONTROL_STATUSES.live,
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
    },
    CONTROL_GROUPS.mode,
  ),
  withControlGroup(
    {
      key: "densityGain",
      label: "Density",
      title:
        "How thick and bright the overall volume glow appears — raise for a bolder, denser orb",
      defaultValue: RAYMARCH_DEFAULTS.densityGain,
      methods: methodsFor("shared"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uDensityGain.value",
      status: CONTROL_STATUSES.live,
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
    },
    CONTROL_GROUPS.shape,
  ),
  withControlGroup(
    {
      key: "contourSharpness",
      label: "Sharpness",
      title:
        "How prominent the bright ring edges are — raise for a crisper, more angular look",
      defaultValue: RAYMARCH_DEFAULTS.contourSharpness,
      methods: ALL_METHODS,
      binding: { min: 1, max: 8, step: 0.1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uContourSharpness.value",
      status: CONTROL_STATUSES.live,
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
      methods: methodsFor("raymarchOnly"),
      binding: { min: 16, max: 192, step: 1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.volumeMesh.material.steps",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.shape,
  ),

  // ── Color ──────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "volumeColor",
      label: "Volume",
      title: "Main glow color of the orb interior",
      defaultValue: RENDER_DEFAULTS.volumeColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uColor.value",
      status: CONTROL_STATUSES.live,
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
    },
    CONTROL_GROUPS.color,
  ),
  withControlGroup(
    {
      key: "colorMode",
      label: "Color Mode",
      title:
        "Static uses your chosen colors; Chromesthesia shifts colors dynamically with the music's harmonic content",
      defaultValue: RENDER_DEFAULTS.colorMode,
      methods: ALL_METHODS,
      binding: {
        options: {
          Static: "static",
          Chromesthesia: "chromesthesia",
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.chromesthesia.colorMode",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.mode,
  ),
  withControlGroup(
    {
      key: "chromesthesiaMix",
      label: "Color Mix",
      title:
        "How strongly the Chromesthesia colors tint the volume — only applies when Color Mode is set to Chromesthesia",
      defaultValue: RENDER_DEFAULTS.chromesthesiaMix,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uChromesthesiaMix.value",
      status: CONTROL_STATUSES.live,
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
    },
    CONTROL_GROUPS.mode,
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
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "structurePersistence",
      label: "Structure Persistence",
      title:
        "How long the current pattern holds before settling — set to 0 to disable persistence, raise for slower transitions",
      defaultValue: REACTIVITY_DEFAULTS.structurePersistence,
      methods: methodsFor("shared"),
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.reactivityTuning.structurePersistence",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.motion,
  ),

  // ── Display ────────────────────────────────────────────────────────────────
  withControlGroup(
    {
      key: "bloomEnabled",
      label: "Glow",
      title: "Toggle the glow/halo effect around bright parts of the orb",
      defaultValue: RENDER_DEFAULTS.bloomEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "pipeline.outputNode",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "bloomStrength",
      label: "Glow Strength",
      title: "How bright the glow halo is",
      defaultValue: RENDER_DEFAULTS.bloomStrength,
      methods: ALL_METHODS,
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.strength.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "bloomRadius",
      label: "Glow Radius",
      title: "How far the glow spreads from bright areas",
      defaultValue: RENDER_DEFAULTS.bloomRadius,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.radius.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "bloomThreshold",
      label: "Glow Threshold",
      title:
        "Minimum brightness before a region contributes to the glow — raise to limit it to the brightest highlights",
      defaultValue: RENDER_DEFAULTS.bloomThreshold,
      methods: methodsFor("shared"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.threshold.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "backgroundColor",
      label: "Background",
      title: "Backdrop color shown behind the orb in transparent output mode",
      defaultValue: RENDER_DEFAULTS.backgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.backdropColor",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "renderQualityPreset",
      label: "Performance Profile",
      title:
        "Auto targets a stable default frame rate, Custom adapts toward your chosen FPS, and None disables preset behavior so advanced display controls apply directly.",
      defaultValue: RENDER_DEFAULTS.renderQualityPreset,
      methods: ALL_METHODS,
      binding: {
        options: {
          Auto: PERFORMANCE_PROFILES.auto,
          Custom: PERFORMANCE_PROFILES.custom,
          None: PERFORMANCE_PROFILES.none,
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.renderQualityPreset",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.mode,
  ),
  withControlGroup(
    {
      key: "customPerformanceTargetFps",
      label: "Custom Target FPS",
      title:
        "Used only when the Performance Profile is Custom to set the adaptive frame-rate target.",
      defaultValue: RENDER_DEFAULTS.customPerformanceTargetFps,
      methods: ALL_METHODS,
      binding: {
        min: MIN_PERFORMANCE_TARGET_FPS,
        max: MAX_PERFORMANCE_TARGET_FPS,
        step: 1,
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.customPerformanceTargetFps",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.mode,
  ),
  withControlGroup(
    {
      key: "outputMode",
      label: "Output Mode",
      title:
        "Transparent composites over other content; Opaque renders its own solid background",
      defaultValue: RENDER_DEFAULTS.outputMode,
      methods: ALL_METHODS,
      binding: {
        options: {
          Transparent: "transparent",
          Opaque: "opaque",
        },
      },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.outputMode",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.mode,
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
    },
    CONTROL_GROUPS.display,
  ),
  withControlGroup(
    {
      key: "performanceHudEnabled",
      label: "Performance HUD",
      title: "Shows FPS and render resolution on screen",
      defaultValue: RENDER_DEFAULTS.performanceHudEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.performanceHudEnabled",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.presetsArea,
  ),
  withControlGroup(
    {
      key: "visualizationMethod",
      label: "Visualizer",
      title: "Switch between the 3D orb and a flat 2D cymatic view",
      defaultValue: VISUALIZATION_METHODS.raymarch,
      methods: ALL_METHODS,
      binding: {
        options: {
          "3D Volume": VISUALIZATION_METHODS.raymarch,
          "2D Fullscreen": VISUALIZATION_METHODS.cymatics2d,
        },
      },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "runtime.method",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.mode,
  ),

  // ── Diagnostics (debug-only) ───────────────────────────────────────────────
  withControlGroup(
    {
      key: "bloomResponseBias",
      label: "Bloom Bias",
      title:
        "Makes the glow smaller and more stable by trimming how easily bloom reacts.",
      defaultValue: RENDER_DEFAULTS.bloomResponseBias,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "runtime.bloomTuning.bloomResponseBias",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
  ),
  withControlGroup(
    {
      key: "rimBloomBias",
      label: "Rim Bias",
      title:
        "Pushes more brightness toward the outer rim before bloom is applied.",
      defaultValue: RAYMARCH_DEFAULTS.rimBloomBias,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uRimBloomBias.value",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.diagnostics,
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
      status: CONTROL_STATUSES.debugOnly,
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
      key: "fieldCacheOverride",
      label: "3D Field Eval",
      title:
        "Cached is faster and usually looks the same. Direct recomputes the field live instead of using the 3D cache, so it costs more.",
      defaultValue: AUDIT_DEFAULTS.fieldCacheOverride,
      methods: methodsFor("raymarchOnly"),
      binding: {
        options: {
          Direct: "direct",
          Cached: "cached",
        },
      },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "controls.fieldCacheOverride",
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
        "Frequency of the injected test tone in Hz. Try values like 110, 220, or 440 to compare how pitch changes the pattern.",
      defaultValue: AUDIT_DEFAULTS.testToneHz,
      methods: ALL_METHODS,
      binding: { min: 40, max: 2000, step: 1 },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "featureState.audit.settings.testToneHz",
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
  withControlGroup(
    {
      key: "structuralImplementation",
      label: "Analysis Mode",
      title:
        "Choose which analysis model drives the visuals. Modal Excitation follows the resonant-mode path, Legacy Peak keeps the older peak-driven behavior, and Dual runs both for comparison.",
      defaultValue: AUDIT_DEFAULTS.structuralImplementation,
      methods: ALL_METHODS,
      binding: {
        options: {
          "Legacy Peak": "legacy-peak",
          "Modal Excitation": "modal-excitation",
          "Dual (Compare)": "dual",
        },
      },
      targetType: CONTROL_TARGET_TYPES.audit,
      handler: CONTROL_HANDLERS.audit,
      runtimePath: "controls.structuralImplementation",
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
  return getControlsForMethod(method).filter(
    (definition) =>
      definition.sidebarHidden !== true &&
      (definition.group ?? definition.folder) === folder,
  );
}
