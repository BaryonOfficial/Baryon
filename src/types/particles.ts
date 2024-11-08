import * as THREE from 'three'

// Material types
export type ParticlesMaterialImpl = THREE.ShaderMaterial & {
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

export type ParticlesMaterialProps = {
  uResolution?: THREE.Vector2 | [number, number]
  uParticlesTexture?: THREE.Texture | null
}

// Add this interface for the ref
export interface ParticlesRef {
  updateUniforms: (uniforms: { uAverageAmplitude: number }) => void
}

// Component props types
export interface GPGPU {
  size: number
  particlesVariable?: {
    renderTargets: { texture: THREE.Texture }[]
  }
}

export interface ParticleGeometries {
  base: {
    count: number
    positions: Float32Array
    colors: Float32Array
  }
  secondary: {
    instance: THREE.BufferGeometry
    count: number
  }
}

export interface ParticlesProps {
  gpgpu: GPGPU
  geometries: ParticleGeometries
  parameters: {
    radius: number
    count: number
    threshold: number
    surfaceThreshold: number
    surfaceRatio: number
  }
}
