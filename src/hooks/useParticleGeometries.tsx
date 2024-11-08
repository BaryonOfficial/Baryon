import { useMemo } from 'react';
import { useLogo } from './useLogo';
import { createParticleGeometries } from '@/utils/particleConfig';
import type { ParticleParameters, ParticleGeometries } from '@/types/particle.types';

export function useParticleGeometries(parameters: ParticleParameters): ParticleGeometries {
  const logoGeometry = useLogo();

  return useMemo(
    () => createParticleGeometries(parameters, logoGeometry),
    [parameters, logoGeometry]
  );
}
