import { useControls } from 'leva'
import type { ParticleParameters, ParticleSettings } from '@/types/particle.types.ts'

export function useParticleSettings(): { parameters: ParticleParameters, settings: ParticleSettings } {
    const parameters = useControls(
        'Particle Parameters',
        {
            count: { value: 1000000, label: 'Particle Count' },
            radius: { value: 3.0, min: 1.0, max: 5.0, step: 0.1, label: 'Radius' },
            threshold: { value: 0.05, min: 0.01, max: 0.1, step: 0.01, label: 'Zero Point Proximity' },
            surfaceThreshold: { value: 0.01, min: 0.001, max: 0.1, step: 0.001, label: 'Surface Threshold' },
            surfaceRatio: { value: 0.33, min: 0.1, max: 1.0, step: 0.01, label: 'Surface Ratio' },
            surfaceControl: { value: true, label: 'Surface Particles' },

            // Flow Field Controls
            flowFieldInfluence: { value: 1.0, min: 0, max: 3.0, step: 0.1, label: 'Flow Field Influence' },
            flowFieldStrength: { value: 3.6, min: 0, max: 10.0, step: 0.1, label: 'Flow Field Strength' },
            flowFieldFrequency: { value: 0.64, min: 0, max: 2.0, step: 0.01, label: 'Flow Field Frequency' },

            // Particle Movement Controls
            particleSpeed: { value: 32.0, min: 0, max: 100.0, step: 1.0, label: 'Particle Speed' },
            distanceThreshold: { value: 0.5, min: 0, max: 2.0, step: 0.1, label: 'Distance to Zero Points' }
        },
        { collapsed: true }
    )

    const visualSettings = useControls(
        'Visual Settings',
        {
            color: { value: '#0586ff', label: 'Inner Color' },
            surfaceColor: { value: '#DEF0FA', label: 'Surface Color' },
            particleSize: { value: 0.03, min: 0.001, max: 0.1, step: 0.001, label: 'Particle Size' },
            rotation: { value: 1.0, min: -3.0, max: 3.0, step: 0.1, label: 'Rotation Speed' },
            scale: { value: 0.3, min: 0.1, max: 2, step: 0.1, label: 'Logo Scale' }
        },
        { collapsed: true }
    )

    return { parameters, settings: visualSettings };
} 