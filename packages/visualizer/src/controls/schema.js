import {
  AUDIT_DEFAULTS,
  AUDIO_DEFAULTS,
  BEAT_DEFAULTS,
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
  raymarch: "raymarch",
  bloom: "bloom",
  scene: "scene",
  audio: "audio",
  audit: "audit",
});

const RAYMARCH_METHODS = [VISUALIZATION_METHODS.raymarch];

export const CONTROL_DEFINITIONS = Object.freeze([
  {
    key: "echoCancellation",
    folder: "Input",
    label: "Echo Cancel",
    title:
      "Suppress speaker bleed and room echo from the mic input; useful with speakers, but it colors the spectrum",
    defaultValue: AUDIO_DEFAULTS.echoCancellation,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audio,
    handler: CONTROL_HANDLERS.audio,
    runtimePath: "audioSession.micSettings.echoCancellation",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "noiseSuppression",
    folder: "Input",
    label: "Noise Suppress",
    title:
      "Reduce steady background noise before analysis; helps in noisy rooms, but can smear quieter harmonics",
    defaultValue: AUDIO_DEFAULTS.noiseSuppression,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audio,
    handler: CONTROL_HANDLERS.audio,
    runtimePath: "audioSession.micSettings.noiseSuppression",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "autoGainControl",
    folder: "Input",
    label: "Auto Gain",
    title:
      "Continuously normalize mic level for audibility; convenient for speech, but it flattens dynamics for visualization",
    defaultValue: AUDIO_DEFAULTS.autoGainControl,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audio,
    handler: CONTROL_HANDLERS.audio,
    runtimePath: "audioSession.micSettings.autoGainControl",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "bloomEnabled",
    folder: "Effects",
    label: "Enabled",
    title: "Toggle the bloom (glow) post-processing effect on or off",
    defaultValue: RENDER_DEFAULTS.bloomEnabled,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "pipeline.outputNode",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "bloomStrength",
    folder: "Effects",
    label: "Strength",
    title:
      "How bright and intense the bloom glow is — higher values create a more pronounced halo around bright highlights",
    defaultValue: RENDER_DEFAULTS.bloomStrength,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 3, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "bloomPass.strength.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "bloomRadius",
    folder: "Effects",
    label: "Radius",
    title:
      "How far the bloom glow spreads outward from bright areas — higher values create a softer, wider glow",
    defaultValue: RENDER_DEFAULTS.bloomRadius,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "bloomPass.radius.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "bloomThreshold",
    folder: "Effects",
    label: "Threshold",
    title:
      "Minimum brightness required for a pixel to contribute to bloom — raise this to limit glow to the strongest contour bands",
    defaultValue: RENDER_DEFAULTS.bloomThreshold,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "bloomPass.threshold.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "bloomResponseBias",
    folder: "Effects",
    label: "Bloom Bias",
    title:
      "Shift bloom toward a smaller, more stable halo by slightly raising threshold and trimming response strength",
    defaultValue: RENDER_DEFAULTS.bloomResponseBias,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "runtime.bloomTuning.bloomResponseBias",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "backgroundColor",
    folder: "Color",
    label: "Background",
    title:
      "Scene background color — use deep black for the most contrast with the volumetric cymatic orb",
    defaultValue: RENDER_DEFAULTS.backgroundColor,
    methods: RAYMARCH_METHODS,
    binding: { view: "color" },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.shared,
    runtimePath: "renderer.clearColor",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "volumeColor",
    folder: "Color",
    label: "Volume",
    title:
      "Base color of the interior volumetric emission for the cymatic field",
    defaultValue: RENDER_DEFAULTS.volumeColor,
    methods: RAYMARCH_METHODS,
    binding: { view: "color" },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uColor.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "surfaceColor",
    folder: "Color",
    label: "Contour",
    title:
      "Highlight color for the sharpest nodal contour bands inside the volume",
    defaultValue: RENDER_DEFAULTS.surfaceColor,
    methods: RAYMARCH_METHODS,
    binding: { view: "color" },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uSurfaceColor.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "rotationSpeed",
    folder: "Volume",
    label: "Rotation",
    title:
      "Speed and direction of the orb's Y-axis rotation — negative values reverse direction, zero disables rotation",
    defaultValue: RENDER_DEFAULTS.rotationSpeed,
    methods: RAYMARCH_METHODS,
    binding: { min: -12, max: 12, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.scene,
    runtimePath: "object.rotation.y",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "zeroPointPrecision",
    folder: "Volume",
    label: "Node Threshold",
    title:
      "How tightly the field must approach zero for a sample to contribute to a nodal band — lower values create sharper structure",
    defaultValue: SIMULATION_DEFAULTS.zeroPointPrecision,
    methods: RAYMARCH_METHODS,
    binding: { min: 0.001, max: 0.3, step: 0.001 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uThreshold.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "structureMin",
    folder: "Volume",
    label: "Structure Min",
    title:
      "Lower field-structure cutoff — trims the weakest, least legible regions of the volume",
    defaultValue: SIMULATION_DEFAULTS.structureMin,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uStructureMin.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "structureMax",
    folder: "Volume",
    label: "Structure Max",
    title:
      "Upper field-structure cutoff — helps suppress the densest regions before they flatten into fog",
    defaultValue: SIMULATION_DEFAULTS.structureMax,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uStructureMax.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "raymarchSteps",
    folder: "Volume",
    label: "Steps",
    title:
      "Number of raymarch samples used through the volume — higher values improve fidelity but cost more GPU time",
    defaultValue: RAYMARCH_DEFAULTS.raymarchSteps,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 16, max: 192, step: 1 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.volumeMesh.material.steps",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "densityGain",
    folder: "Volume",
    label: "Density",
    title:
      "Overall density and emission gain for the raymarched volume — higher values make the cymatic body thicker and brighter",
    defaultValue: RAYMARCH_DEFAULTS.densityGain,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0.1, max: 4, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uDensityGain.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "absorption",
    folder: "Volume",
    label: "Absorption",
    title:
      "Extinction strength of the volume — increase this to sharpen internal depth and reduce washed-out haze",
    defaultValue: RAYMARCH_DEFAULTS.absorption,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0.1, max: 4, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uAbsorption.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "contourSharpness",
    folder: "Volume",
    label: "Sharpness",
    title:
      "How aggressively the renderer favors narrow nodal bands over softer field regions",
    defaultValue: RAYMARCH_DEFAULTS.contourSharpness,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 1, max: 8, step: 0.1 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uContourSharpness.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "rimBloomBias",
    folder: "Volume",
    label: "Rim Bias",
    title:
      "How much the outer shell can bias emissive brightness toward the rim before bloom picks it up",
    defaultValue: RAYMARCH_DEFAULTS.rimBloomBias,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0, max: 1.2, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uRimBloomBias.value",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "rimCompression",
    folder: "Volume",
    label: "Rim Compress",
    title:
      "Compress grazing-angle highlight spikes before they reach the bloom pass",
    defaultValue: RAYMARCH_DEFAULTS.rimCompression,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0, max: 1.2, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uRimCompression.value",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "beatSensitivity",
    folder: "Volume",
    label: "Beat Sense",
    title:
      "Adaptive threshold multiplier for beat onset detection — higher values make pulse triggers more selective",
    defaultValue: BEAT_DEFAULTS.beatSensitivity,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0.4, max: 1.8, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.beatTuning.beatSensitivity",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "pulseAmount",
    folder: "Volume",
    label: "Pulse Amount",
    title:
      "Scale gain applied to beat pulses — higher values make the orb expand more aggressively on each onset",
    defaultValue: BEAT_DEFAULTS.pulseAmount,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 0, max: 0.15, step: 0.001 },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.beatTuning.pulseAmount",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "pulseDecayMs",
    folder: "Volume",
    label: "Pulse Decay",
    title:
      "Release time in milliseconds for the beat pulse envelope — lower values snap back faster after each hit",
    defaultValue: BEAT_DEFAULTS.pulseDecayMs,
    methods: [VISUALIZATION_METHODS.raymarch],
    binding: { min: 40, max: 600, step: 5 },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.beatTuning.pulseDecayMs",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "idleLogoIntensity",
    folder: "Effects",
    label: "Logo Intensity",
    title: "Strength of the idle logo overlay when no audio is playing",
    defaultValue: RENDER_DEFAULTS.idleLogoIntensity,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 0.25, step: 0.005 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.uniforms.uIdleLogoIntensity.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "idleLogoSize",
    folder: "Effects",
    label: "Logo Size",
    title:
      "Scale of the idle logo overlay shown when the field falls back to idle",
    defaultValue: RENDER_DEFAULTS.idleLogoSize,
    methods: RAYMARCH_METHODS,
    binding: { min: 0.1, max: 2, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.raymarch,
    runtimePath: "runtime.idleOverlay.scale",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "auditEnabled",
    folder: "Audit",
    label: "Enabled",
    title:
      "Enable frame-by-frame debug logging for the audio and active visualization pipeline",
    defaultValue: AUDIT_DEFAULTS.auditEnabled,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.enabled",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "freezeModeSlots",
    folder: "Audit",
    label: "Freeze Slots",
    title:
      "Lock the current modal frequency slots so they stop updating from live audio — useful for inspecting a specific cymatic pattern",
    defaultValue: AUDIT_DEFAULTS.freezeModeSlots,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.freezeModeSlots",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "forceWebGLFallbackTest",
    folder: "Audit",
    label: "Force WebGL2",
    title:
      "Reinitialize the renderer on the WebGL2 fallback backend for compatibility testing — this is a diagnostic toggle and will remount the canvas",
    defaultValue: AUDIT_DEFAULTS.forceWebGLFallbackTest,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.forceWebGLFallbackTest",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "injectTestTone",
    folder: "Audit",
    label: "Inject Tone",
    title:
      "Replace live audio input with a synthetic test tone — use with Tone Hz and Tone Amp to diagnose specific frequency responses",
    defaultValue: AUDIT_DEFAULTS.injectTestTone,
    methods: RAYMARCH_METHODS,
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.injectTestTone",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "testToneHz",
    folder: "Audit",
    label: "Tone Hz",
    title:
      "Frequency in Hz of the injected test tone — try values like 110, 220, 440 to see how different pitches shape the cymatic field",
    defaultValue: AUDIT_DEFAULTS.testToneHz,
    methods: RAYMARCH_METHODS,
    binding: { min: 40, max: 2000, step: 1 },
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.testToneHz",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "testToneAmplitude",
    folder: "Audit",
    label: "Tone Amp",
    title:
      "Amplitude of the injected test tone — lower values produce subtler pattern excitation",
    defaultValue: AUDIT_DEFAULTS.testToneAmplitude,
    methods: RAYMARCH_METHODS,
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.testToneAmplitude",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "logEveryFrames",
    folder: "Audit",
    label: "Log Frames",
    title:
      "Log a debug snapshot every N frames to the browser console — set to 1 to log every frame, higher to reduce noise",
    defaultValue: AUDIT_DEFAULTS.logEveryFrames,
    methods: RAYMARCH_METHODS,
    binding: { min: 1, max: 240, step: 1 },
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.logEveryFrames",
    status: CONTROL_STATUSES.debugOnly,
  },
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
  return [
    ...new Set(
      getControlsForMethod(method).map((definition) => definition.folder),
    ),
  ];
}

export function getControlsForFolder(
  folder,
  method = VISUALIZATION_METHODS.raymarch,
) {
  return getControlsForMethod(method).filter(
    (definition) => definition.folder === folder,
  );
}
