export const AUDIO_DEFAULTS = Object.freeze({
  capacity: 8,
});

export const SIMULATION_DEFAULTS = Object.freeze({
  particleCount: 1500000,
  radius: 3.0,
  threshold: 0.05,
  surfaceRatio: 0.33,
  surfaceThreshold: 0.01,
  targetFPS: 60,
  flowFieldInfluence: 1.0,
  flowFieldStrength: 3.6,
  flowFieldFrequency: 0.64,
  particleSpeed: 32,
  distanceThreshold: 0.5,
});

export const RENDER_DEFAULTS = Object.freeze({
  particleSize: 0.03,
  rotationSpeed: 2.5,
  idleLogoIntensity: 0.04,
  idleLogoAlpha: 0.08,
  idleLogoSize: 1.0,
  backgroundColor: "#000000",
  color: "#0586ff",
  surfaceColor: "#DEF0FA",
  bloomStrength: 0.36,
  bloomRadius: 0.4,
  bloomThreshold: 0.4,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  injectTestTone: false,
  pitchSourceMode: "auto",
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
