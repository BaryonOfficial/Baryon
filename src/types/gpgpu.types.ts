import * as THREE from 'three'
import { GPUComputationRenderer, Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js'

// Base GPGPU types
export interface GPGPUComputation {
  computation: GPUComputationRenderer
  audioDataVariable: Variable
  scalarFieldVariable: Variable
  zeroPointsVariable: Variable
  particlesVariable: Variable
  essentiaData: Float32Array
  size: number
}

// Uniform type helper
type UniformValue<T> = THREE.IUniform<T>

// Shader-specific uniforms
export interface GPGPUShaderUniforms {
  audioDataUniforms: {
    tPitches: UniformValue<THREE.DataTexture>
    tDataArray: UniformValue<THREE.DataTexture>
    sampleRate: UniformValue<number>
    bufferSize: UniformValue<number>
    uRadius: UniformValue<number>
    capacity: UniformValue<number>
    uRandomPitches: UniformValue<Float32Array>
  }
  scalarFieldUniforms: {
    uRadius: UniformValue<number>
    uBase: UniformValue<THREE.Texture>
    capacity: UniformValue<number>
  }
  zeroPointsUniforms: {
    uRadius: UniformValue<number>
    uThreshold: UniformValue<number>
    uSurfaceThreshold: UniformValue<number>
    uSurfaceControl: UniformValue<boolean>
    uAverageAmplitude: UniformValue<number>
  }
  particlesUniforms: {
    uRadius: UniformValue<number>
    uTime: UniformValue<number>
    uDeltaTime: UniformValue<number>
    uFlowFieldInfluence: UniformValue<number>
    uFlowFieldStrength: UniformValue<number>
    uFlowFieldFrequency: UniformValue<number>
    uBase: UniformValue<THREE.Texture>
    uAverageAmplitude: UniformValue<number>
    uParticleSpeed: UniformValue<number>
    uDistanceThreshold: UniformValue<number>
  }
}

// Hook return type
export type GPGPUReturn = {
  gpgpu: GPGPUComputation | null
}
