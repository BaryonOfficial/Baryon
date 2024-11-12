import { useControls, folder } from 'leva';
import { useEffect, useState } from 'react';
import type { ParticleSettings } from '@/types/particle.types';

export function useParticleControls(): ParticleSettings {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return useControls(
    'Particles',
    {
      Appearance: folder({
        color: { value: '#0586ff', label: 'Inner Color' },
        surfaceColor: { value: '#DEF0FA', label: 'Surface Color' },
        particleSize: { value: 0.03, min: 0.001, max: 0.1, step: 0.001, label: 'Particle Size' },
      }),
    },
    { disabled: !mounted }
  );
}
