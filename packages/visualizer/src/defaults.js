import { DEFAULT_REQUESTED_CAVITY_GEOMETRY } from "./core/cavityGeometry.js";
import { DEFAULT_PERFORMANCE_PROFILE } from "./render/outputProfilePolicy.js";

const DEFAULT_MODAL_FIELD_CAPACITY = 160;
export const DEFAULT_FFT_SIZE = 8192;
export const DEFAULT_SAMPLE_RATE = 44100;

export const AUDIO_SLOT_CAPACITY = DEFAULT_MODAL_FIELD_CAPACITY;

export const AUDIO_DEFAULTS = Object.freeze({
  modalFieldCapacity: DEFAULT_MODAL_FIELD_CAPACITY,
  maxModalFieldDescriptorModes: DEFAULT_MODAL_FIELD_CAPACITY,
  signalNormalizationSlots: DEFAULT_MODAL_FIELD_CAPACITY,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  liveInputAnalysisClass: "auto",
  liveInputAcousticIntent: "ambient",
});

export const CAVITY_ACOUSTIC_DEFAULTS = Object.freeze({
  radiusMeters: 12.5,
  soundSpeedMetersPerSecond: 1480,
  subfloorPolicy: "project-subfundamental",
});

export const SIMULATION_DEFAULTS = Object.freeze({
  radius: 3.0,
  cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
  zeroPointPrecision: 0.064,
  boundaryMode: "neumann",
  cavityGeometry: DEFAULT_REQUESTED_CAVITY_GEOMETRY,
});

export const RENDER_DEFAULTS = Object.freeze({
  rotationMode: "off",
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  backgroundColor: "#000000",
  renderQualityPreset: DEFAULT_PERFORMANCE_PROFILE,
  customPerformanceTargetFps: 60,
  volumeColor: "#56d7ff",
  surfaceColor: "#f7fdff",
  colorMode: /** @type {"static" | "spectral"} */ ("spectral"),
  spectralMix: 0.96,
  outputMode: "transparent",
  outputBackgroundColor: "#000000",
  bloomEnabled: true,
  bloomStrength: 0.8,
  bloomRadius: 0,
  bloomThreshold: 0.24,
  bloomResponseBias: 1,
  performanceHudEnabled: false,
  traaEnabled: true,
});

export const REACTIVITY_DEFAULTS = Object.freeze({
  reactivity: 2.5,
  motionAmount: 0.88,
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

/** Matches audio feature-frame avgAmplitude normalization (see getSourceNormalization). */
export const RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE = 96;

export const RAYMARCH_DEFAULTS = Object.freeze({
  raymarchSteps: 80,
  densityGain: 2.5,
  absorption: 1.45,
  opacityGain: 2.3,
  contourSharpness: 8,
  rimBloomBias: 0.39,
  rimCompression: 1.2,
  holographicIntensity: 0.52,
  holographicShift: 0.42,
  holographicFresnelPower: 4.8,
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
