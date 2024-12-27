import { useControls, button, levaStore } from 'leva';
import {
  ParticleParametersSchema,
  ParticleSettingsSchema,
  ParticleConfig,
} from '@/types/particle.types';

export function useParticleSettings(): ParticleConfig {
  // Define default values
  const defaultValues = {
    parameters: {
      count: 1000000,
      radius: 3.0,
      threshold: 0.05,
      surfaceThreshold: 0.01,
      surfaceRatio: 0.33,
      surfaceControl: true,
      flowFieldInfluence: 1.0,
      flowFieldStrength: 3.6,
      flowFieldFrequency: 0.64,
      particleSpeed: 32.0,
      distanceThreshold: 0.5,
    },
    settings: {
      color: '#0586ff',
      surfaceColor: '#DEF0FA',
      particleSize: 0.03,
      rotation: 1.0,
      scale: 0.3,
    },
  };

  // Add reset functionality to Leva panel
  useControls(
    {
      'Reset All': button(() => {
        Object.entries(defaultValues.parameters).forEach(([key, value]) => {
          levaStore.set({ [`Particle Parameters.${key}`]: value }, false);
        });
        Object.entries(defaultValues.settings).forEach(([key, value]) => {
          levaStore.set({ [`Visual Settings.${key}`]: value }, false);
        });
      }),
      'Reset Parameters': button(() => {
        Object.entries(defaultValues.parameters).forEach(([key, value]) => {
          levaStore.set({ [`Particle Parameters.${key}`]: value }, false);
        });
      }),
      'Reset Visual': button(() => {
        Object.entries(defaultValues.settings).forEach(([key, value]) => {
          levaStore.set({ [`Visual Settings.${key}`]: value }, false);
        });
      }),
    },
    { collapsed: false }
  );

  const rawParameters = useControls(
    'Particle Parameters',
    {
      count: { value: 1000000, label: 'Particle Count' },
      radius: { value: 3.0, min: 1.0, max: 5.0, step: 0.1, label: 'Radius' },
      threshold: { value: 0.05, min: 0.01, max: 0.1, step: 0.01, label: 'Zero Point Proximity' },
      surfaceThreshold: {
        value: 0.01,
        min: 0.001,
        max: 0.1,
        step: 0.001,
        label: 'Surface Threshold',
      },
      surfaceRatio: { value: 0.33, min: 0.1, max: 1.0, step: 0.01, label: 'Surface Ratio' },
      surfaceControl: { value: true, label: 'Surface Particles' },

      // Flow Field Controls
      flowFieldInfluence: {
        value: 1.0,
        min: 0,
        max: 3.0,
        step: 0.1,
        label: 'Flow Field Influence',
      },
      flowFieldStrength: { value: 3.6, min: 0, max: 10.0, step: 0.1, label: 'Flow Field Strength' },
      flowFieldFrequency: {
        value: 0.64,
        min: 0,
        max: 2.0,
        step: 0.01,
        label: 'Flow Field Frequency',
      },

      // Particle Movement Controls
      particleSpeed: { value: 32.0, min: 0, max: 100.0, step: 1.0, label: 'Particle Speed' },
      distanceThreshold: {
        value: 0.5,
        min: 0,
        max: 2.0,
        step: 0.1,
        label: 'Distance to Zero Points',
      },
    },
    { collapsed: true }
  );

  const rawVisualSettings = useControls(
    'Visual Settings',
    {
      color: { value: '#0586ff', label: 'Inner Color' },
      surfaceColor: { value: '#DEF0FA', label: 'Surface Color' },
      particleSize: { value: 0.03, min: 0.001, max: 0.1, step: 0.001, label: 'Particle Size' },
      rotation: { value: 1.0, min: -3.0, max: 3.0, step: 0.1, label: 'Rotation Speed' },
      scale: { value: 0.3, min: 0.1, max: 2, step: 0.1, label: 'Logo Scale' },
    },
    { collapsed: true }
  );

  try {
    // Runtime validation
    const ParticleParameters = ParticleParametersSchema.parse(rawParameters);
    const ParticleSettings = ParticleSettingsSchema.parse(rawVisualSettings);
    return { parameters: ParticleParameters, settings: ParticleSettings };
  } catch (error) {
    console.error('Particle settings validation error:', error);
    // Fallback to safe defaults
    return {
      parameters: defaultValues.parameters,
      settings: defaultValues.settings,
    };
  }
}
