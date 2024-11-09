import * as THREE from 'three'
import type { GPGPUComputation } from './gpgpu.types'

export interface ParticleParameters {
  count: number
  radius: number
  threshold: number
  surfaceThreshold: number
  surfaceRatio: number
}

export interface ParticleGeometry {
  count: number
  positions: Float32Array
  colors: Float32Array
}

export interface ParticleGeometries {
  base: ParticleGeometry
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
    uRotation: { value: number }
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
  particlesTexture?: React.MutableRefObject<THREE.Texture | null>
  geometries: ParticleGeometries
} 

export interface LogoGeometry {
    geometry: THREE.BufferGeometry | null
    vertexCount: number
    isLoaded: boolean
    error?: string
  }