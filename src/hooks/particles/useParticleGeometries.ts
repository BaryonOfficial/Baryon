import { useMemo } from 'react'
import { useLogo } from '../useLogo.tsx'
import { createParticleGeometries } from '@/utils/particles/geometryUtils.ts'
import type { ParticleGeometries } from '@/types/particle.types.ts'
import { useParticleSettingsContext } from '@/contexts/useParticleSettingsContext'

export function useParticleGeometries(): ParticleGeometries {
  const { parameters } = useParticleSettingsContext()
  const logo = useLogo()

  return useMemo(
    () => createParticleGeometries(parameters, logo),
    [parameters, logo]
  )
} 