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
    uFieldState: uniform(FIELD_STATE_VALUES.idle),
    uRadius: uniform(parameters.radius),
    uBoundaryMode: uniform(
      getBoundaryModeValue(SIMULATION_DEFAULTS.boundaryMode),
    ),
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
    uSlicePosition: uniform(0.0),
  };
}
