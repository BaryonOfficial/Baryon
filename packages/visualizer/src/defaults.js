export const AUDIO_DEFAULTS = Object.freeze({
  capacity: 8,
});

export const SIMULATION_DEFAULTS = Object.freeze({
  particleCount: 1500000,
  radius: 3.0,
  zeroPointPrecision: 0.15,
  surfaceRatio: 0.33,
  surfaceThreshold: 0.01,
  surfaceParticles: true,
  flowFieldStrength: 3.6,
  flowFieldFrequency: 0.64,
  particleSpeed: 32,
  attractionStrength: 18,
  velocityDamping: 0.9,
  flowMix: 0.04,
  centerSuppressionInner: 0.12,
  centerSuppressionOuter: 0.45,
  structureMin: 0.08,
  structureMax: 0.4,
});

export const RENDER_DEFAULTS = Object.freeze({
  particleSize: 0.045,
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  backgroundColor: "#000000",
  volumeColor: "#0586ff",
  surfaceColor: "#DEF0FA",
  bloomEnabled: true,
  bloomStrength: 0.12,
  bloomRadius: 0.08,
  bloomThreshold: 0.4,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  injectTestTone: false,
  testToneHz: 440,
  testToneAmplitude: 0.5,
  logEveryFrames: 30,
});

export const DEFAULTS = Object.freeze({
  ...AUDIO_DEFAULTS,
  ...SIMULATION_DEFAULTS,
  ...RENDER_DEFAULTS,
  ...AUDIT_DEFAULTS,
});
