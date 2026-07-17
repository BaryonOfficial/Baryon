import { DEFAULT_REQUESTED_CAVITY_GEOMETRY } from "./core/cavityGeometry.js";
import { VOLUME_SHAPES } from "./core/volumeShape.js";
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

export const TEST_TONE_SIGNALS = Object.freeze({
  pureSine: "pure-sine",
  harmonicSeries: "harmonic-series",
});

export const CAVITY_ACOUSTIC_DEFAULTS = Object.freeze({
  sideLengthMeters: 12.5,
  soundSpeedMetersPerSecond: 1480,
  subfloorPolicy: "project-subfundamental",
});

export const SIMULATION_DEFAULTS = Object.freeze({
  radius: 3.0,
  cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
  // Fixed world-space FWHM of the resolved cymatic carrier core. This is a
  // reference-apparatus dimension, not an audio- or frame-dependent threshold.
  // The analytic interval integral resolves this width below the field-cache
  // cell size without making the carrier depend on cache resolution.
  carrierCoreFwhmWorld: 0.024,
  boundaryMode: "neumann",
  cavityGeometry: DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  volumeShape: VOLUME_SHAPES.sphere,
});

export const RENDER_DEFAULTS = Object.freeze({
  rotationMode: "off",
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  idleLogoColor: "#f7fdff",
  backgroundColor: "#000000",
  renderQualityPreset: DEFAULT_PERFORMANCE_PROFILE,
  customTargetFps: 60,
  volumeColor: "#5be3f4",
  surfaceColor: "#5be3f4",
  colorMode: /** @type {"static" | "spectral"} */ ("static"),
  spectralMix: 0.96,
  outputMode: "transparent",
  outputBackgroundColor: "#000000",
  bloomEnabled: true,
  bloomStrength: 1.18,
  bloomRadius: 0,
  bloomThreshold: 0.5,
  smaaEnabled: true,
  performanceHudEnabled: false,
  traaEnabled: true,
  cameraLocked: false,
});

export const REACTIVITY_DEFAULTS = Object.freeze({
  motionAmount: 0.88,
});

/** Fixed response shaping retained after consolidating public response controls. */
export const AUDIO_RESPONSE_GAIN = 2.5;

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
  raymarchSteps: 72,
  densityGain: 4,
  laserDeflectionGain: 1.2,
  contourSharpness: 8,
  holographicIntensity: 1,
  holographicFresnelPower: 2.4,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  forceWebGLFallbackTest: false,
  lowLoadPlaybackDiagnostics: false,
  injectTestTone: false,
  testToneSignal: TEST_TONE_SIGNALS.pureSine,
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
