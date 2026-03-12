import {
  AUDIT_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../defaults.js";
import { VISUALIZATION_METHODS } from "../visualization/types.js";

export const CONTROL_TARGET_TYPES = Object.freeze({
  uniform: "uniform",
  pipeline: "pipeline",
  object: "object",
  audit: "audit",
});

export const CONTROL_STATUSES = Object.freeze({
  live: "live",
  debugOnly: "debug-only",
});

export const CONTROL_HANDLERS = Object.freeze({
  shared: "shared",
  particle: "particle",
  bloom: "bloom",
  scene: "scene",
  audit: "audit",
});

export const CONTROL_DEFINITIONS = Object.freeze([
  {
    key: "bloomEnabled",
    folder: "Effects",
    label: "Enabled",
    title: "Toggle the bloom (glow) post-processing effect on or off",
    defaultValue: RENDER_DEFAULTS.bloomEnabled,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "How bright and intense the bloom glow is — higher values create a more pronounced halo around bright particles",
    defaultValue: RENDER_DEFAULTS.bloomStrength,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "Minimum brightness required for a pixel to contribute to the bloom effect — raise this to limit glow to only the brightest particles",
    defaultValue: RENDER_DEFAULTS.bloomThreshold,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.pipeline,
    handler: CONTROL_HANDLERS.bloom,
    runtimePath: "bloomPass.threshold.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "backgroundColor",
    folder: "Color",
    label: "Background",
    title:
      "Scene background color — use deep black for the most contrast with glowing particles",
    defaultValue: RENDER_DEFAULTS.backgroundColor,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "Color of particles inside the resonant volume — these particles fill the interior of the cymatics pattern",
    defaultValue: RENDER_DEFAULTS.volumeColor,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { view: "color" },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uColor.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "surfaceColor",
    folder: "Color",
    label: "Surface",
    title:
      "Color of particles that sit on the nodal surface boundaries of the cymatics structure",
    defaultValue: RENDER_DEFAULTS.surfaceColor,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { view: "color" },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uSurfaceColor.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "particleSpeed",
    folder: "Particles",
    label: "Speed",
    title:
      "Overall speed multiplier for particle movement — higher values make particles respond faster to the field but can feel chaotic",
    defaultValue: SIMULATION_DEFAULTS.particleSpeed,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 1, max: 100, step: 1 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uParticleSpeed.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "rotationSpeed",
    folder: "Particles",
    label: "Rotation",
    title:
      "Speed and direction of the particle cloud's Y-axis rotation — negative values reverse direction, zero disables rotation",
    defaultValue: RENDER_DEFAULTS.rotationSpeed,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: -12, max: 12, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.object,
    handler: CONTROL_HANDLERS.scene,
    runtimePath: "points.rotation.y",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "flowFieldStrength",
    folder: "Granular",
    label: "Flow Strength",
    title:
      "Strength of the turbulent 3D noise field that adds organic, swirling motion to particles — combine with Flow Mix to blend with structured cymatics",
    defaultValue: SIMULATION_DEFAULTS.flowFieldStrength,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 10, step: 0.1 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uFlowFieldStrength.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "flowFieldFrequency",
    folder: "Granular",
    label: "Flow Frequency",
    title:
      "Spatial frequency of the noise flow field — lower values create broad, slow swirls; higher values produce fine, tight eddies",
    defaultValue: SIMULATION_DEFAULTS.flowFieldFrequency,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0.01, max: 5, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uFlowFieldFrequency.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "zeroPointPrecision",
    folder: "Granular",
    label: "Node Threshold",
    title:
      "How tightly the field must approach zero for a point to be considered a nodal target — lower values create sharper, more defined structures",
    defaultValue: SIMULATION_DEFAULTS.zeroPointPrecision,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0.001, max: 0.3, step: 0.001 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uThreshold.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "flowMix",
    folder: "Granular",
    label: "Flow Mix",
    title:
      "Blend between structured cymatics (0) and freeform noise-field motion (1) — mid values produce organic formations that still follow the audio pattern",
    defaultValue: SIMULATION_DEFAULTS.flowMix,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uFlowMix.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "attractionStrength",
    folder: "Granular",
    label: "Attraction",
    title:
      "How strongly particles are pulled toward their target nodal positions — higher values snap particles into sharp formations faster",
    defaultValue: SIMULATION_DEFAULTS.attractionStrength,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 30, step: 0.1 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uAttractionStrength.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "velocityDamping",
    folder: "Granular",
    label: "Damping",
    title:
      "How quickly particle velocity decays each frame — higher values slow particles more aggressively, reducing overshooting and jitter",
    defaultValue: SIMULATION_DEFAULTS.velocityDamping,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uVelocityDamping.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "centerSuppressionInner",
    folder: "Granular",
    label: "Center Inner",
    title:
      "Inner radius of the dead zone at the origin — particles inside this radius are pushed outward to prevent a bright central clump",
    defaultValue: SIMULATION_DEFAULTS.centerSuppressionInner,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uCenterSuppressionInner.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "centerSuppressionOuter",
    folder: "Granular",
    label: "Center Outer",
    title:
      "Outer boundary of the center-suppression gradient — particles between inner and outer radius experience a graduated push away from center",
    defaultValue: SIMULATION_DEFAULTS.centerSuppressionOuter,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uCenterSuppressionOuter.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "structureMin",
    folder: "Granular",
    label: "Structure Min",
    title:
      "Lower field-potential cutoff — particles targeting nodes below this threshold are excluded, trimming the weakest/noisiest parts of the pattern",
    defaultValue: SIMULATION_DEFAULTS.structureMin,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uStructureMin.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "structureMax",
    folder: "Granular",
    label: "Structure Max",
    title:
      "Upper field-potential cutoff — particles targeting nodes above this threshold are excluded, removing the densest interior regions",
    defaultValue: SIMULATION_DEFAULTS.structureMax,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 1, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uStructureMax.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "surfaceParticles",
    folder: "Aesthetics",
    label: "Surface",
    title:
      "Toggle particles that sit on the outer nodal surface boundary — disabling this shows only the interior volume particles",
    defaultValue: SIMULATION_DEFAULTS.surfaceParticles,
    methods: [VISUALIZATION_METHODS.particle],
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uSurfaceControl.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "idleLogoIntensity",
    folder: "Effects",
    label: "Logo Intensity",
    title:
      "Strength of the logo particle attraction when no audio is playing — higher values make the idle logo formation more defined",
    defaultValue: RENDER_DEFAULTS.idleLogoIntensity,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0, max: 0.25, step: 0.005 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uIdleLogoIntensity.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "idleLogoSize",
    folder: "Effects",
    label: "Logo Size",
    title:
      "Scale of the logo formation that particles drift toward when idle — adjust to match the visual weight of your logo",
    defaultValue: RENDER_DEFAULTS.idleLogoSize,
    methods: [VISUALIZATION_METHODS.particle],
    binding: { min: 0.1, max: 2, step: 0.01 },
    targetType: CONTROL_TARGET_TYPES.uniform,
    handler: CONTROL_HANDLERS.particle,
    runtimePath: "tsl.uniforms.uIdleLogoSize.value",
    status: CONTROL_STATUSES.live,
  },
  {
    key: "auditEnabled",
    folder: "Audit",
    label: "Enabled",
    title:
      "Enable frame-by-frame debug logging for the audio and particle pipeline",
    defaultValue: AUDIT_DEFAULTS.auditEnabled,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "Lock the current modal frequency slots so they stop updating from live audio — useful for inspecting a specific cymatics pattern",
    defaultValue: AUDIT_DEFAULTS.freezeModeSlots,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
    targetType: CONTROL_TARGET_TYPES.audit,
    handler: CONTROL_HANDLERS.audit,
    runtimePath: "featureState.audit.settings.freezeModeSlots",
    status: CONTROL_STATUSES.debugOnly,
  },
  {
    key: "injectTestTone",
    folder: "Audit",
    label: "Inject Tone",
    title:
      "Replace live audio input with a synthetic test tone — use with Tone Hz and Tone Amp to diagnose specific frequency responses",
    defaultValue: AUDIT_DEFAULTS.injectTestTone,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "Frequency in Hz of the injected test tone — try values like 110, 220, 440 to see how different pitches shape the cymatics pattern",
    defaultValue: AUDIT_DEFAULTS.testToneHz,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
      "Amplitude (volume) of the injected test tone — lower values produce subtler pattern excitation",
    defaultValue: AUDIT_DEFAULTS.testToneAmplitude,
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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
    methods: [VISUALIZATION_METHODS.particle, VISUALIZATION_METHODS.raymarch],
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

export function getControlsForMethod(method = VISUALIZATION_METHODS.particle) {
  return CONTROL_DEFINITIONS.filter((definition) =>
    definition.methods.includes(method),
  );
}

export function getControlFolders(method = VISUALIZATION_METHODS.particle) {
  return [
    ...new Set(
      getControlsForMethod(method).map((definition) => definition.folder),
    ),
  ];
}

export function getControlsForFolder(
  folder,
  method = VISUALIZATION_METHODS.particle,
) {
  return getControlsForMethod(method).filter(
    (definition) => definition.folder === folder,
  );
}
