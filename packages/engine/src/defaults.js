import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
} from "./core/audio/liveInputAnalysis.js";
import { DEFAULT_REQUESTED_CAVITY_GEOMETRY } from "./core/cavityGeometry.js";
import { VOLUME_SHAPES } from "./core/volumeShape.js";
import {
  DEFAULT_PERFORMANCE_PROFILE,
  DEFAULT_TRAA_ENABLED,
} from "./render/outputProfilePolicy.js";

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
  liveInputAnalysisClass: DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  liveInputAcousticIntent: DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
});

export const TEST_TONE_SIGNALS = Object.freeze({
  pureSine: "pure-sine",
  harmonicSeries: "harmonic-series",
});

export const CAVITY_ACOUSTIC_DEFAULTS = Object.freeze({
  acousticMedium: "water",
  sideLengthMeters: 12.5,
  soundSpeedMetersPerSecond: 1480,
  mediumDensityKgPerM3: 998,
  // Distilled water near 20 C. B/A declares the quadratic equation-of-state
  // nonlinearity; beta = 1 + B/(2A) is derived by the modal-drive owner.
  equationOfStateNonlinearityBA: 5,
  // Declared incident plane-wave peak pressure at the virtual drive plane for
  // a full-scale captured waveform. 100 kPa is 220 dB re 1 µPa pressure
  // amplitude; it is neither source level at 1 m nor a hardware measurement.
  // Explicit null or zero disables finite-amplitude propagation and preserves
  // the exact linear drive path.
  incidentPeakPressurePascalAtFullScale: 100_000,
  // Damping is part of the declared virtual apparatus. Side length and sound
  // speed determine eigenfrequencies, but cannot determine Q without wall,
  // support, transducer, and radiation-loss measurements. The declared load
  // preserves the established broadband musical response; the fixed-aperture
  // persistent cymatic observer owns visual legibility without changing modal
  // admission.
  modalIntrinsicQualityFactorAt100Hz: 164,
  modalLoadLinewidthHz: 7,
});

export const SIMULATION_DEFAULTS = Object.freeze({
  radius: 3.0,
  cavityAcousticScale: CAVITY_ACOUSTIC_DEFAULTS,
  boundaryMode: "neumann",
  cavityGeometry: DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  volumeShape: VOLUME_SHAPES.sphere,
});

export const RENDER_DEFAULTS = Object.freeze({
  rotationMode: "off",
  rotationSpeed: 4.78,
  idleLogoIntensity: 0.04,
  idleLogoSize: 1.0,
  idleLogoColor: "#f7fdff",
  idleLogoRotationMode: "manual",
  idleLogoRotationSpeed: 2.5,
  backgroundColor: "#000000",
  renderQualityPreset: DEFAULT_PERFORMANCE_PROFILE,
  customTargetFps: 60,
  volumeColor: "#5be3f4",
  surfaceColor: "#5be3f4",
  colorMode: /** @type {"static" | "spectral"} */ ("spectral"),
  spectralChroma: 1,
  outputMode: "opaque",
  outputBackgroundColor: "#000000",
  bloomEnabled: true,
  bloomStrength: 0.5,
  bloomRadius: 0,
  bloomThreshold: 1,
  smaaEnabled: true,
  performanceHudEnabled: false,
  traaEnabled: DEFAULT_TRAA_ENABLED,
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
  // Maximum presentation-quadrature budget on a diameter camera ray. Shorter
  // chords and adaptive profiles may use fewer samples. The modal loop runs
  // once per retained field-cache voxel and camera samples reconstruct that
  // field, so this value controls only camera-integration accuracy, not
  // physical spatial resolution or cache fidelity.
  raymarchSteps: 70,
  densityGain: 3.5,
  // Lens strength trades fold definition against saturation: gentle
  // displacement keeps the transmitted flood smooth and forms one clean fold
  // per feature, while too strong a gain displaces all light and collapses the
  // partial-stop observable into a structureless bright plate. 1.2 is the
  // hand-tuned setting from the "New Default 02" look (2026-07-26); the
  // transmission-photograph rework originally landed on 0.5.
  laserDeflectionGain: 1.2,
  holographicIntensity: 1,
  holographicFresnelPower: 10,
});

export const AUDIT_DEFAULTS = Object.freeze({
  auditEnabled: false,
  freezeModeSlots: false,
  forceWebGLFallbackTest: false,
  suppressPlaybackTelemetry: false,
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
