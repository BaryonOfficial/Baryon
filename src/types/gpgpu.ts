import * as THREE from 'three'
import { GPUComputationRenderer, Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js'

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

export interface GPGPUParameters {
  count: number
  radius: number
  threshold: number
  surfaceThreshold: number
  surfaceRatio: number
}

export interface GPGPUGeometries {
  base: {
    count: number
    positions: Float32Array
    instance: THREE.BufferGeometry
  }
  secondary: {
    count: number
    instance: THREE.BufferGeometry
  }
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