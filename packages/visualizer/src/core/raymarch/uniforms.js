import * as THREE from "three";
import { uniform } from "three/tsl";
import {
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../../defaults.js";
import { FIELD_STATE_VALUES } from "../fieldState.js";

export { FIELD_STATE_VALUES };

export function createRaymarchUniforms(parameters) {
  return {
    uTime: uniform(0.0),
    uAverageAmplitude: uniform(0.0),
    uFieldState: uniform(FIELD_STATE_VALUES.idle),
    uRadius: uniform(parameters.radius),
    uThreshold: uniform(parameters.threshold),
    uStructureMin: uniform(SIMULATION_DEFAULTS.structureMin),
    uStructureMax: uniform(SIMULATION_DEFAULTS.structureMax),
    uActiveModeCount: uniform(0),
    uBackboneModeCount: uniform(0),
    uDetailModeCount: uniform(0),
    uIdleLogoIntensity: uniform(RENDER_DEFAULTS.idleLogoIntensity),
    uIdleLogoAlpha: uniform(RENDER_DEFAULTS.idleLogoAlpha),
    uIdleLogoSize: uniform(RENDER_DEFAULTS.idleLogoSize),
    uColor: uniform(new THREE.Color(RENDER_DEFAULTS.volumeColor)),
    uSurfaceColor: uniform(new THREE.Color(RENDER_DEFAULTS.surfaceColor)),
    uChromesthesiaMix: uniform(
      RENDER_DEFAULTS.colorMode === "chromesthesia"
        ? RENDER_DEFAULTS.chromesthesiaMix
        : 0,
    ),
    uDensityGain: uniform(RAYMARCH_DEFAULTS.densityGain),
    uAbsorption: uniform(RAYMARCH_DEFAULTS.absorption),
    uDensityAbsorption: uniform(
      RAYMARCH_DEFAULTS.densityGain * RAYMARCH_DEFAULTS.absorption,
    ),
    uOpacityGain: uniform(RAYMARCH_DEFAULTS.opacityGain),
    uContourSharpness: uniform(RAYMARCH_DEFAULTS.contourSharpness),
    uRimBloomBias: uniform(RAYMARCH_DEFAULTS.rimBloomBias),
    uRimCompression: uniform(RAYMARCH_DEFAULTS.rimCompression),
    uHolographicIntensity: uniform(RAYMARCH_DEFAULTS.holographicIntensity),
    uHolographicShift: uniform(RAYMARCH_DEFAULTS.holographicShift),
    uHolographicFresnelPower: uniform(
      RAYMARCH_DEFAULTS.holographicFresnelPower,
    ),
    uRaymarchSteps: uniform(RAYMARCH_DEFAULTS.raymarchSteps),
    uBandEnergies: uniform(new THREE.Vector4(0, 0, 0, 0)),
    uTransientEnergy: uniform(0.0),
    uSpectralCentroid: uniform(0.0),
    uSpectralFlux: uniform(0.0),
    uSlicePosition: uniform(0.0),
    uStructureSignal: uniform(0.0),
    uEnergySignal: uniform(0.0),
    uChangeSignal: uniform(0.0),
    uPulseSignal: uniform(0.0),
    uHarmonicity: uniform(0.0),
    uBassSalience: uniform(0.0),
    uTextureSpread: uniform(0.0),
    uNovelty: uniform(0.0),
    uBeatPulse: uniform(0.0),
    uBeatPhase: uniform(0.0),
    uTempoNorm: uniform(0.0),
    uRhythmicDensity: uniform(0.0),
    uKeyTint: uniform(new THREE.Color(0x56d7ff)),
    uKeyTintStrength: uniform(0.0),
    uKeyMode: uniform(0.0),
  };
}
