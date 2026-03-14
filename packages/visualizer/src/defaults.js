export const AUDIO_DEFAULTS = Object.freeze({
  capacity: 8,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
});

export const SIMULATION_DEFAULTS = Object.freeze({
  radius: 3.0,
  zeroPointPrecision: 0.15,
  structureMin: 0.08,
  structureMax: 0.4,
});

export const RENDER_DEFAULTS = Object.freeze({
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  backgroundColor: "#000000",
  volumeColor: "#0586ff",
  surfaceColor: "#DEF0FA",
  bloomEnabled: true,
  bloomStrength: 0.11,
  bloomRadius: 0.09,
  bloomThreshold: 0.44,
  bloomResponseBias: 0.4,
});

export const BEAT_DEFAULTS = Object.freeze({
  beatSensitivity: 0.78,
  lowBandFloor: 0.05,
  refractoryMs: 140,
  thresholdSmoothingMs: 250,
  pulseAmount: 0.055,
  pulseDecayMs: 180,
});

export const RAYMARCH_DEFAULTS = Object.freeze({
  raymarchSteps: 96,
  densityGain: 2.8,
  absorption: 1.8,
  contourSharpness: 4.0,
  rimBloomBias: 0.5,
  rimCompression: 0.48,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  forceWebGLFallbackTest: false,
  injectTestTone: false,
  testToneHz: 440,
  testToneAmplitude: 0.5,
  logEveryFrames: 30,
});

export const DEFAULTS = Object.freeze({
  ...AUDIO_DEFAULTS,
  ...SIMULATION_DEFAULTS,
  ...RENDER_DEFAULTS,
  ...BEAT_DEFAULTS,
  ...RAYMARCH_DEFAULTS,
  ...AUDIT_DEFAULTS,
});
