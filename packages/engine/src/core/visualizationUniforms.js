import * as THREE from "three";
import { uniform } from "three/tsl";
import {
  RAYMARCH_DEFAULTS,
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "../defaults.js";
import { FIELD_STATE_VALUES } from "./fieldState.js";
import { getBoundaryModeValue } from "./modeFamily.js";

export function createVisualizationUniforms(parameters) {
  return {
    uTime: uniform(0.0),
    uAverageAmplitude: uniform(0.0),
    uFieldState: uniform(FIELD_STATE_VALUES.idle),
    uRadius: uniform(parameters.radius),
    uBoundaryMode: uniform(
      getBoundaryModeValue(SIMULATION_DEFAULTS.boundaryMode),
    ),
    uModalFieldModeCount: uniform(0),
    uIdleLogoIntensity: uniform(RENDER_DEFAULTS.idleLogoIntensity),
    uIdleLogoSize: uniform(RENDER_DEFAULTS.idleLogoSize),
    uIdleLogoColor: uniform(new THREE.Color(RENDER_DEFAULTS.idleLogoColor)),
    uColor: uniform(new THREE.Color(RENDER_DEFAULTS.volumeColor)),
    uCausticColor: uniform(new THREE.Color(RENDER_DEFAULTS.surfaceColor)),
    uSpectralPresentationEnabled: uniform(
      RENDER_DEFAULTS.colorMode === "spectral" ? 1 : 0,
    ),
    uSpectralChroma: uniform(RENDER_DEFAULTS.spectralChroma),
    uDensityGain: uniform(RAYMARCH_DEFAULTS.densityGain),
    uLaserDeflectionGain: uniform(RAYMARCH_DEFAULTS.laserDeflectionGain),
    uCausticStrength: uniform(RAYMARCH_DEFAULTS.holographicIntensity),
    uLaserFocus: uniform(RAYMARCH_DEFAULTS.holographicFresnelPower),
    uRaymarchSteps: uniform(RAYMARCH_DEFAULTS.raymarchSteps),
    uBandEnergies: uniform(new THREE.Vector4(0, 0, 0, 0)),
    uTransientEnergy: uniform(0.0),
    uSpectralCentroid: uniform(0.0),
    uSpectralFlux: uniform(0.0),
    uSlicePosition: uniform(0.0),
    uStructureSignal: uniform(0.0),
    uEnergySignal: uniform(0.0),
    uChangeSignal: uniform(0.0),
    uBassSalience: uniform(0.0),
    uTimbreSpread: uniform(0.0),
    uSpectralNovelty: uniform(0.0),
    uBeatPulse: uniform(0.0),
    uBeatPhase: uniform(0.0),
    uTempoNorm: uniform(0.0),
    uRhythmicDensity: uniform(0.0),
    uTrebleBroadbandEnergy: uniform(0.0),
    uModeCoherence: uniform(0.0),
    uTotalSlotAmplitude: uniform(0.0),
    uModalResponseEnergy: uniform(0.0),
    uPhaseProjectionMix: uniform(0.0),
    uPhaseProjectionStrength: uniform(0.0),
    uLaserCausticActive: uniform(0.0),
  };
}
