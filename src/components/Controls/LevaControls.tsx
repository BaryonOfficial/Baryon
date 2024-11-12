import { useControls } from 'leva';
import type { ParticleSettings } from '@/types/particle.types';

export function useParticleControls(): ParticleSettings {
  return useControls({
    color: { value: '#0586ff', label: 'Inner Color' },
    surfaceColor: { value: '#DEF0FA', label: 'Surface Color' },
    particleSize: { value: 0.03, min: 0.001, max: 0.1, step: 0.001 },
  });
}
