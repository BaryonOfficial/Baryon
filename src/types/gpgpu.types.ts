import * as THREE from 'three'
import { GPUComputationRenderer, Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import type { ParticleParameters, ParticleGeometries } from '@/types/particle.types'

export interface GPGPUComputation {
    computation: GPUComputationRenderer
    audioDataVariable: Variable
    scalarFieldVariable: Variable
    zeroPointsVariable: Variable
    particlesVariable: Variable
    essentiaData: Float32Array
    size: number
  }

export interface GPGPUReturn {
  audioDataTexture: React.MutableRefObject<THREE.Texture | null>
  scalarTexture: React.MutableRefObject<THREE.Texture | null>
  zeroPointsTexture: React.MutableRefObject<THREE.Texture | null>
  particlesTexture: React.MutableRefObject<THREE.Texture | null>
  gpgpu: GPGPUComputation | null
}

export interface GPGPUAudioObject {
  isReady: boolean
  capacity: number
  fftSize: number
  analyser: {
    data: Uint8Array
  }
  audioCtx: {
    sampleRate: number
  }
  sound: {
    started: boolean
  }
  gumStream?: MediaStream
}

export interface GPGPUShaderUniforms {
  audioDataUniforms: {
    tPitches: THREE.IUniform<THREE.DataTexture>
    tDataArray: THREE.IUniform<THREE.DataTexture>
    uRadius: THREE.IUniform<number>
    sampleRate: THREE.IUniform<number>
    bufferSize: THREE.IUniform<number>
    capacity: THREE.IUniform<number>
  }
  scalarFieldUniforms: {
    uRadius: THREE.IUniform<number>
    uBase: THREE.IUniform<THREE.Texture>
    capacity: THREE.IUniform<number>
  }
  zeroPointsUniforms: {
    uThreshold: THREE.IUniform<number>
    uRadius: THREE.IUniform<number>
    uSurfaceThreshold: THREE.IUniform<number>
    uSurfaceControl: THREE.IUniform<boolean>
    uAverageAmplitude: THREE.IUniform<number>
  }
  particlesUniforms: {
    uTime: THREE.IUniform<number>
    uDeltaTime: THREE.IUniform<number>
    uFlowFieldInfluence: THREE.IUniform<number>
    uFlowFieldStrength: THREE.IUniform<number>
    uFlowFieldFrequency: THREE.IUniform<number>
    uThreshold: THREE.IUniform<number>
    uBase: THREE.IUniform<THREE.Texture>
    uAverageAmplitude: THREE.IUniform<number>
    uParticleSpeed: THREE.IUniform<number>
    uStarted: THREE.IUniform<boolean>
    uParticleMovementType: THREE.IUniform<number>
    uRadius: THREE.IUniform<number>
    uDistanceThreshold: THREE.IUniform<number>
    uMicActive: THREE.IUniform<boolean>
  }
}
