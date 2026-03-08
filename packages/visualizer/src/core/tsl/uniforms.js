import * as THREE from 'three';
import { uniform } from 'three/tsl';
import { DEFAULTS } from '../../defaults.js';
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
    uFlowFieldInfluence: uniform(DEFAULTS.flowFieldInfluence),
    uFlowFieldStrength: uniform(DEFAULTS.flowFieldStrength),
    uFlowFieldFrequency: uniform(DEFAULTS.flowFieldFrequency),
    uParticleSpeed: uniform(DEFAULTS.particleSpeed),
    uDistanceThreshold: uniform(DEFAULTS.distanceThreshold),
    uActiveModeCount: uniform(0),
    uSurfaceControl: uniform(1),
    uParticleMovementType: uniform(1),
    uIdleLogoIntensity: uniform(DEFAULTS.idleLogoIntensity),
    uIdleLogoAlpha: uniform(DEFAULTS.idleLogoAlpha),
    uIdleLogoSize: uniform(DEFAULTS.idleLogoSize),
    uColor: uniform(new THREE.Color(DEFAULTS.color)),
    uSurfaceColor: uniform(new THREE.Color(DEFAULTS.surfaceColor)),
    uParticleSize: uniform(DEFAULTS.particleSize),
  };
}
