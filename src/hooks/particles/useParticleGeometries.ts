import { useMemo } from 'react'
import { useLogo } from '../useLogo.tsx'
import { createParticleGeometries } from '@/utils/particles/geometryUtils.ts'
import type { ParticleParameters, ParticleGeometries, ParticleSettings } from '@/types/particle.types.ts'

export function useParticleGeometries(
  parameters: ParticleParameters,
  settings: ParticleSettings
): ParticleGeometries {
  const logo = useLogo(settings)
  return useMemo(
    () => createParticleGeometries(parameters, logo),
    [parameters.count, parameters.radius, parameters.surfaceRatio, logo]
  )
} 