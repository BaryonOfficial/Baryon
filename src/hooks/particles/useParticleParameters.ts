import { useMemo } from 'react'
import { ParticleParameters } from '@/types/particle.types'

const DEFAULT_PARAMETERS: ParticleParameters = {
  count: 1000000,
  radius: 3.0,
  threshold: 0.05,
  surfaceThreshold: 0.01,
  surfaceRatio: 0.33,
  rotation: 2.5
}

export function useParticleParameters() {
  return useMemo(() => DEFAULT_PARAMETERS, [])
} 