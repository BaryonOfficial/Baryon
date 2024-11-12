import { useControls } from 'leva'
import type { ParticleParameters, ParticleSettings } from '@/types/particle.types'

export function useParticleSettings() {
    const parameters = useControls('Particle Parameters', {
        count: { value: 1000000, label: 'Particle Count' },
        radius: { value: 3.0, min: 1.0, max: 5.0, step: 0.1 },
        threshold: { value: 0.05, min: 0.01, max: 0.1, step: 0.01 },
        surfaceThreshold: { value: 0.01, min: 0.001, max: 0.1, step: 0.001 },
        surfaceRatio: { value: 0.33, min: 0.1, max: 1.0, step: 0.01 }
    })

    const settings = useControls('Visual Settings', {
        color: { value: '#0586ff', label: 'Inner Color' },
        surfaceColor: { value: '#DEF0FA', label: 'Surface Color' },
        particleSize: { value: 0.03, min: 0.001, max: 0.1, step: 0.001 },
        rotation: { value: 1.0, min: -3.0, max: 3.0, step: 0.1, label: 'Rotation Speed' }
    })

    return { parameters, settings }
} 