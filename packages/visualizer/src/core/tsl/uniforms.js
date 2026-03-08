import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { RENDER_DEFAULTS, SIMULATION_DEFAULTS } from '../../defaults.js';
import { FIELD_STATE_VALUES } from '../fieldState.js';

export { FIELD_STATE_VALUES };

export function createTSLUniforms(parameters) {
  return {
    uTime: uniform(0.0),
    uDeltaTime: uniform(0.0),
    uAverageAmplitude: uniform(0.0),
    uFieldState: uniform(FIELD_STATE_VALUES.idle),
    uRadius: uniform(parameters.radius),
    uThreshold: uniform(parameters.threshold),
    uSurfaceThreshold: uniform(parameters.surfaceThreshold),
    uFlowFieldInfluence: uniform(SIMULATION_DEFAULTS.flowFieldInfluence),
    uFlowFieldStrength: uniform(SIMULATION_DEFAULTS.flowFieldStrength),
    uFlowFieldFrequency: uniform(SIMULATION_DEFAULTS.flowFieldFrequency),
    uParticleSpeed: uniform(SIMULATION_DEFAULTS.particleSpeed),
    uDistanceThreshold: uniform(SIMULATION_DEFAULTS.distanceThreshold),
    uActiveModeCount: uniform(0),
    uSurfaceControl: uniform(1),
    uParticleMovementType: uniform(1),
    uIdleLogoIntensity: uniform(RENDER_DEFAULTS.idleLogoIntensity),
    uIdleLogoAlpha: uniform(RENDER_DEFAULTS.idleLogoAlpha),
    uIdleLogoSize: uniform(RENDER_DEFAULTS.idleLogoSize),
    uColor: uniform(new THREE.Color(RENDER_DEFAULTS.color)),
    uSurfaceColor: uniform(new THREE.Color(RENDER_DEFAULTS.surfaceColor)),
    uParticleSize: uniform(RENDER_DEFAULTS.particleSize),
  };
}
