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
    uFlowFieldStrength: uniform(SIMULATION_DEFAULTS.flowFieldStrength),
    uFlowFieldFrequency: uniform(SIMULATION_DEFAULTS.flowFieldFrequency),
    uParticleSpeed: uniform(SIMULATION_DEFAULTS.particleSpeed),
    uAttractionStrength: uniform(SIMULATION_DEFAULTS.attractionStrength),
    uVelocityDamping: uniform(SIMULATION_DEFAULTS.velocityDamping),
    uFlowMix: uniform(SIMULATION_DEFAULTS.flowMix),
    uCenterSuppressionInner: uniform(
      parameters.radius * SIMULATION_DEFAULTS.centerSuppressionInner
    ),
    uCenterSuppressionOuter: uniform(
      parameters.radius * SIMULATION_DEFAULTS.centerSuppressionOuter
    ),
    uStructureMin: uniform(SIMULATION_DEFAULTS.structureMin),
    uStructureMax: uniform(SIMULATION_DEFAULTS.structureMax),
    uActiveModeCount: uniform(0),
    uSurfaceControl: uniform(1),
    uIdleLogoIntensity: uniform(RENDER_DEFAULTS.idleLogoIntensity),
    uIdleLogoAlpha: uniform(RENDER_DEFAULTS.idleLogoAlpha),
    uIdleLogoSize: uniform(RENDER_DEFAULTS.idleLogoSize),
    uColor: uniform(new THREE.Color(RENDER_DEFAULTS.volumeColor)),
    uSurfaceColor: uniform(new THREE.Color(RENDER_DEFAULTS.surfaceColor)),
    uParticleSize: uniform(RENDER_DEFAULTS.particleSize),
  };
}
