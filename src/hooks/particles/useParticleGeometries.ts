import { useMemo } from 'react'
import { useLogo } from '../useLogo'
import { createParticleGeometries } from '@/utils/particles/geometryUtils'
import type { ParticleParameters, ParticleGeometries } from '@/types/particle.types'

export function useParticleGeometries(parameters: ParticleParameters): ParticleGeometries {
  const logo = useLogo()
  return useMemo(
    () => createParticleGeometries(parameters, logo),
    [parameters.count, parameters.radius, parameters.surfaceRatio, logo]
  )
} 