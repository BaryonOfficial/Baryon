import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  REACTIVITY_DEFAULTS,
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../defaults.js";
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
    title: "Mic Processing",
    order: 10,
    expanded: false,
  }),
  field: Object.freeze({
    title: "Field",
    order: 20,
    expanded: false,
  }),
  look: Object.freeze({
    title: "Look",
    order: 30,
    expanded: false,
  }),
  motion: Object.freeze({
    title: "Motion",
    order: 40,
    expanded: false,
  }),
  advancedField: Object.freeze({
    title: "Advanced Field",
    order: 50,
    expanded: false,
  }),
  advancedLook: Object.freeze({
    title: "Advanced Look",
    order: 60,
    expanded: false,
  }),
  diagnostics: Object.freeze({
    title: "Diagnostics",
    order: 70,
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
  withControlGroup(
    {
      key: "echoCancellation",
      label: "Echo Cancel",
      title:
        "Suppress speaker bleed and room echo from the mic input; useful with speakers, but it colors the spectrum",
      defaultValue: AUDIO_DEFAULTS.echoCancellation,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.micSettings.echoCancellation",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "noiseSuppression",
      label: "Noise Suppress",
      title:
        "Reduce steady background noise before analysis; helps in noisy rooms, but can smear quieter harmonics",
      defaultValue: AUDIO_DEFAULTS.noiseSuppression,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.micSettings.noiseSuppression",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "autoGainControl",
      label: "Auto Gain",
      title:
        "Continuously normalize mic level for audibility; convenient for speech, but it flattens dynamics for visualization",
      defaultValue: AUDIO_DEFAULTS.autoGainControl,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.audio,
      handler: CONTROL_HANDLERS.audio,
      runtimePath: "audioSession.micSettings.autoGainControl",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.input,
  ),
  withControlGroup(
    {
      key: "bloomEnabled",
      label: "Enabled",
      title: "Toggle the bloom (glow) post-processing effect on or off",
      defaultValue: RENDER_DEFAULTS.bloomEnabled,
      methods: ALL_METHODS,
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "pipeline.outputNode",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "bloomStrength",
      label: "Bloom Strength",
      title:
        "How bright and intense the bloom glow is — higher values create a more pronounced halo around bright highlights",
      defaultValue: RENDER_DEFAULTS.bloomStrength,
      methods: ALL_METHODS,
      binding: { min: 0, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.strength.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "bloomRadius",
      label: "Bloom Radius",
      title:
        "How far the bloom glow spreads outward from bright areas — higher values create a softer, wider glow",
      defaultValue: RENDER_DEFAULTS.bloomRadius,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.radius.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "bloomThreshold",
      label: "Bloom Threshold",
      title:
        "Minimum brightness required for a pixel to contribute to bloom — raise this to limit glow to the strongest contour bands",
      defaultValue: RENDER_DEFAULTS.bloomThreshold,
      methods: methodsFor("shared"),
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "bloomPass.threshold.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "bloomResponseBias",
      label: "Bloom Bias",
      title:
        "Shift bloom toward a smaller, more stable halo by slightly raising threshold and trimming response strength",
      defaultValue: RENDER_DEFAULTS.bloomResponseBias,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.bloom,
      runtimePath: "runtime.bloomTuning.bloomResponseBias",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.advancedLook,
  ),
  withControlGroup(
    {
      key: "backgroundColor",
      label: "Background",
      title:
        "Presentation backdrop color shown behind the transparent volumetric render",
      defaultValue: RENDER_DEFAULTS.backgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.shared,
      runtimePath: "ui.backdropColor",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "outputMode",
      label: "Program Output",
      title:
        "Use Transparent when Baryon needs to sit over video, graphics, or another scene; use Opaque when Baryon should render its own solid background for fullscreen or stage output",
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
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "outputBackgroundColor",
      label: "Program Fill",
      title:
        "Background color used only when the program output is set to opaque",
      defaultValue: RENDER_DEFAULTS.outputBackgroundColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.pipeline,
      handler: CONTROL_HANDLERS.output,
      runtimePath: "program.backgroundColor",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "visualizationMethod",
      label: "Visualizer",
      title:
        "Choose between the volumetric 3D orb and the fullscreen 2D cymatic projection",
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
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "volumeColor",
      label: "Volume",
      title:
        "Base color of the interior volumetric emission for the cymatic field",
      defaultValue: RENDER_DEFAULTS.volumeColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uColor.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "surfaceColor",
      label: "Contour",
      title:
        "Highlight color for the sharpest nodal contour bands inside the volume",
      defaultValue: RENDER_DEFAULTS.surfaceColor,
      methods: ALL_METHODS,
      binding: { view: "color" },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uSurfaceColor.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "colorMode",
      label: "Color Mode",
      title:
        "Choose whether the volume uses the fixed palette or the chromesthesia-driven spectral color field",
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
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "chromesthesiaMix",
      label: "Color Mix",
      title:
        "How vividly the chromesthesia spectral hues are expressed when chromesthesia mode is enabled",
      defaultValue: RENDER_DEFAULTS.chromesthesiaMix,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uChromesthesiaMix.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "rotationMode",
      label: "Rotation Mode",
      title:
        "Choose whether the orb rotates from live audio, a fixed manual speed, or stays still",
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
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "rotationSpeed",
      label: "Manual Rotation",
      title:
        "Fixed Y-axis rotation speed used only in manual mode — negative values reverse direction, zero disables rotation",
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
        "Overall sensitivity of the visual response to sound structure, intensity, and change",
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
      key: "zeroPointPrecision",
      label: "Node Threshold",
      title:
        "How tightly the field must approach zero for a sample to contribute to a nodal band — lower values create sharper structure",
      defaultValue: SIMULATION_DEFAULTS.zeroPointPrecision,
      methods: ALL_METHODS,
      binding: { min: 0.001, max: 0.3, step: 0.001 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uThreshold.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "structureMin",
      label: "Structure Min",
      title:
        "Lower field-structure cutoff — trims the weakest, least legible regions of the volume",
      defaultValue: SIMULATION_DEFAULTS.structureMin,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uStructureMin.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "structureMax",
      label: "Structure Max",
      title:
        "Upper field-structure cutoff — helps suppress the densest regions before they flatten into fog",
      defaultValue: SIMULATION_DEFAULTS.structureMax,
      methods: ALL_METHODS,
      binding: { min: 0, max: 1, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uStructureMax.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "raymarchSteps",
      label: "Steps",
      title:
        "Number of raymarch samples used through the volume — higher values improve fidelity but cost more GPU time",
      defaultValue: RAYMARCH_DEFAULTS.raymarchSteps,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 16, max: 192, step: 1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.volumeMesh.material.steps",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.advancedField,
  ),
  withControlGroup(
    {
      key: "densityGain",
      label: "Density",
      title:
        "Overall density and emission gain for the raymarched volume — higher values make the cymatic body thicker and brighter",
      defaultValue: RAYMARCH_DEFAULTS.densityGain,
      methods: methodsFor("shared"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uDensityGain.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "absorption",
      label: "Absorption",
      title:
        "Extinction strength of the volume — increase this to sharpen internal depth and reduce washed-out haze",
      defaultValue: RAYMARCH_DEFAULTS.absorption,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0.1, max: 4, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uAbsorption.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "opacityGain",
      label: "Opacity",
      title:
        "Additional alpha gain for the transparent volume — increase this to make the orb read more solid without over-brightening emission",
      defaultValue: RAYMARCH_DEFAULTS.opacityGain,
      methods: ALL_METHODS,
      binding: { min: 0.1, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uOpacityGain.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "contourSharpness",
      label: "Sharpness",
      title:
        "How aggressively the renderer favors narrow nodal bands over softer field regions",
      defaultValue: RAYMARCH_DEFAULTS.contourSharpness,
      methods: ALL_METHODS,
      binding: { min: 1, max: 8, step: 0.1 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uContourSharpness.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.field,
  ),
  withControlGroup(
    {
      key: "rimBloomBias",
      label: "Rim Bias",
      title:
        "How much the outer shell can bias emissive brightness toward the rim before bloom picks it up",
      defaultValue: RAYMARCH_DEFAULTS.rimBloomBias,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uRimBloomBias.value",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.advancedLook,
  ),
  withControlGroup(
    {
      key: "rimCompression",
      label: "Rim Compress",
      title:
        "Compress grazing-angle highlight spikes before they reach the bloom pass",
      defaultValue: RAYMARCH_DEFAULTS.rimCompression,
      methods: methodsFor("raymarchOnly"),
      binding: { min: 0, max: 1.2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uRimCompression.value",
      status: CONTROL_STATUSES.debugOnly,
    },
    CONTROL_GROUPS.advancedLook,
  ),
  withControlGroup(
    {
      key: "motionAmount",
      label: "Motion Amount",
      title:
        "How much rotation and accent motion react when the field structure changes",
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
        "How long structural response lingers between changes before settling back toward stillness",
      defaultValue: REACTIVITY_DEFAULTS.structurePersistence,
      methods: methodsFor("shared"),
      binding: { min: 0.2, max: 3, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.object,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.reactivityTuning.structurePersistence",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.motion,
  ),
  withControlGroup(
    {
      key: "idleLogoIntensity",
      label: "Logo Intensity",
      title: "Strength of the idle logo overlay when no audio is playing",
      defaultValue: RENDER_DEFAULTS.idleLogoIntensity,
      methods: ALL_METHODS,
      binding: { min: 0, max: 0.25, step: 0.005 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.uniforms.uIdleLogoIntensity.value",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "idleLogoSize",
      label: "Logo Size",
      title:
        "Scale of the idle logo overlay shown when the field falls back to idle",
      defaultValue: RENDER_DEFAULTS.idleLogoSize,
      methods: ALL_METHODS,
      binding: { min: 0.1, max: 2, step: 0.01 },
      targetType: CONTROL_TARGET_TYPES.uniform,
      handler: CONTROL_HANDLERS.raymarch,
      runtimePath: "runtime.idleOverlay.scale",
      status: CONTROL_STATUSES.live,
    },
    CONTROL_GROUPS.look,
  ),
  withControlGroup(
    {
      key: "auditEnabled",
      label: "Enabled",
      title:
        "Enable frame-by-frame debug logging for the audio and active visualization pipeline",
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
      label: "Freeze Slots",
      title:
        "Lock the current modal frequency slots so they stop updating from live audio — useful for inspecting a specific cymatic pattern",
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
        "Reinitialize the renderer on the WebGL2 fallback backend for compatibility testing — this is a diagnostic toggle and will remount the canvas",
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
        "Reduce render overhead during playback diagnostics by forcing a lower pixel ratio and suppressing non-essential audit work while audio is active",
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
      key: "injectTestTone",
      label: "Inject Tone",
      title:
        "Replace live audio input with a synthetic test tone — use with Tone Hz and Tone Amp to diagnose specific frequency responses",
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
        "Frequency in Hz of the injected test tone — try values like 110, 220, 440 to see how different pitches shape the cymatic field",
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
      title:
        "Amplitude of the injected test tone — lower values produce subtler pattern excitation",
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
        "Log a debug snapshot every N frames to the browser console — set to 1 to log every frame, higher to reduce noise",
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
    (definition) => (definition.group ?? definition.folder) === folder,
  );
}
