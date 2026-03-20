const DEFAULT_BACKBONE_STACK_SLOTS = 8;
const DEFAULT_DETAIL_STACK_SLOTS = 8;
export const DEFAULT_FFT_SIZE = 4096;
export const DEFAULT_SAMPLE_RATE = 44100;

export const AUDIO_SLOT_CAPACITY =
  DEFAULT_BACKBONE_STACK_SLOTS + DEFAULT_DETAIL_STACK_SLOTS;
export const AUDIO_SIGNAL_NORMALIZATION_SLOTS = AUDIO_SLOT_CAPACITY;

export const AUDIO_DEFAULTS = Object.freeze({
  backboneStackSlots: DEFAULT_BACKBONE_STACK_SLOTS,
  detailStackSlots: DEFAULT_DETAIL_STACK_SLOTS,
  signalNormalizationSlots: AUDIO_SIGNAL_NORMALIZATION_SLOTS,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  liveInputAnalysisClass: "auto",
});

export const SIMULATION_DEFAULTS = Object.freeze({
  radius: 3.0,
  zeroPointPrecision: 0.22,
  structureMin: 0.12,
  structureMax: 0.46,
});

export const RENDER_DEFAULTS = Object.freeze({
  rotationMode: "audio",
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  backgroundColor: "#000000",
  renderQualityPreset: "auto",
  volumeColor: "#56d7ff",
  surfaceColor: "#f7fdff",
  colorMode: /** @type {"static" | "chromesthesia"} */ ("chromesthesia"),
  chromesthesiaMix: 1.0,
  outputMode: "transparent",
  outputBackgroundColor: "#000000",
  bloomEnabled: true,
  bloomStrength: 0.3,
  bloomRadius: 0.16,
  bloomThreshold: 0.64,
  bloomResponseBias: 0.52,
  performanceHudEnabled: false,
});

export const REACTIVITY_DEFAULTS = Object.freeze({
  reactivity: 2.5,
  motionAmount: 1.0,
  structurePersistence: 0.75,
});

export const BEAT_DEFAULTS = Object.freeze({
  beatSensitivity: 0.78,
  lowBandFloor: 0.05,
  refractoryMs: 140,
  thresholdSmoothingMs: 250,
  pulseEnabled: true,
  pulseAmount: 0.055,
  pulseDecayMs: 180,
});

export const RAYMARCH_DEFAULTS = Object.freeze({
  raymarchSteps: 64,
  densityGain: 3.01,
  absorption: 3.55,
  opacityGain: 2.52,
  contourSharpness: 7.3,
  rimBloomBias: 0.34,
  rimCompression: 0.84,
  holographicIntensity: 0.45,
  holographicShift: 0.35,
  holographicFresnelPower: 3.2,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  forceWebGLFallbackTest: false,
  lowLoadPlaybackDiagnostics: false,
  injectTestTone: false,
  testToneHz: 440,
  testToneAmplitude: 0.5,
  logEveryFrames: 30,
});

export const DEFAULTS = Object.freeze({
  ...AUDIO_DEFAULTS,
  ...SIMULATION_DEFAULTS,
  ...RENDER_DEFAULTS,
  ...REACTIVITY_DEFAULTS,
  ...BEAT_DEFAULTS,
  ...RAYMARCH_DEFAULTS,
  ...AUDIT_DEFAULTS,
});
