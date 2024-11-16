import * as THREE from 'three'
import { z } from 'zod'
import type { GPGPUComputation } from './gpgpu.types'

// Zod Schemas
export const ParticleParametersSchema = z.object({
  count: z.number().int().positive().max(2000000),
  radius: z.number().positive().max(5.0),
  threshold: z.number().min(0.01).max(0.1),
  surfaceThreshold: z.number().min(0.001).max(0.1),
  surfaceRatio: z.number().min(0.1).max(1.0),
  surfaceControl: z.boolean(),
  flowFieldInfluence: z.number().min(0).max(3.0),
  flowFieldStrength: z.number().min(0).max(10.0),
  flowFieldFrequency: z.number().min(0).max(2.0),
  particleSpeed: z.number().min(0).max(100.0),
  distanceThreshold: z.number().min(0).max(2.0)
})

export const ParticleSettingsSchema = z.object({
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  surfaceColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  particleSize: z.number().positive().max(0.1),
  rotation: z.number().min(-3.0).max(3.0),
  scale: z.number().min(0.1).max(2.0)
})

// Keep existing type definitions but derive from schemas
export type ParticleParameters = z.infer<typeof ParticleParametersSchema>
export type ParticleSettings = z.infer<typeof ParticleSettingsSchema>

export interface ParticleGeometries {
  base: {
    positions: Float32Array
    colors: Float32Array
  }
  secondary: {
    instance: THREE.BufferGeometry
    count: number
  }
}

export type ParticleMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uSize: { value: number }
    uTime: { value: number }
    uDeltaTime: { value: number }
    uResolution: { value: THREE.Vector2 }
    uParticlesTexture: { value: THREE.Texture | null }
    uColor: { value: THREE.Color }
    uSurfaceColor: { value: THREE.Color }
    uRadius: { value: number }
    uAverageAmplitude: { value: number }
    uSoundPlaying: { value: boolean }
  }
}

export type ParticleMaterialProps = {
  uResolution?: THREE.Vector2 | [number, number]
}

export interface ParticlesRef {
  material: ParticleMaterial | null
  points: THREE.Points | null
  updateUniforms: (uniforms: { uAverageAmplitude: number }) => void
}

export interface ParticlesProps {
  gpgpu: GPGPUComputation
  geometries: ParticleGeometries
  particlesTexture: React.RefObject<THREE.Texture>
}

export interface LogoGeometry {
  instance: THREE.BufferGeometry | null
  count: number
  isLoaded: boolean
  error?: string
}