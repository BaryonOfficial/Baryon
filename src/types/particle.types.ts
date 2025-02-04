import * as THREE from 'three';
import { z } from 'zod';
import type { GPGPUComputation } from './gpgpu.types';
import type { Object3DNode } from '@react-three/fiber';

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
  distanceThreshold: z.number().min(0).max(2.0),
});

export const ParticleSettingsSchema = z.object({
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  surfaceColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
  particleSize: z.number().positive().max(0.1),
  rotation: z.number().min(-3.0).max(3.0),
  scale: z.number().min(0.1).max(2.0),
});

// Keep existing type definitions but derive from schemas
export type ParticleParameters = z.infer<typeof ParticleParametersSchema>;
export type ParticleSettings = z.infer<typeof ParticleSettingsSchema>;

export interface ParticleGeometries {
  base: {
    positions: Float32Array;
    colors: Float32Array;
  };
  secondary: {
    instance: THREE.BufferGeometry;
    count: number;
  };
}

// Simplify UniformValue type (Three.js already provides this)
type UniformValue<T> = THREE.IUniform<T>;

// Particle material uniforms
export interface ParticlesMaterialUniforms {
  uResolution: UniformValue<THREE.Vector2>;
  uSize: UniformValue<number>;
  uParticlesTexture: UniformValue<THREE.Texture | null>;
  uTime: UniformValue<number>;
  uDeltaTime: UniformValue<number>;
  uAverageAmplitude: UniformValue<number>;
  uRadius: UniformValue<number>;
  uSoundPlaying: UniformValue<boolean>;
  uColor: UniformValue<THREE.Color>;
  uSurfaceColor: UniformValue<THREE.Color>;
}

// Base material type from Three.js
export type ParticlesMaterial = THREE.ShaderMaterial & {
  uniforms: ParticlesMaterialUniforms;
};

// Props that can be passed to the material in JSX
export interface ParticlesMaterialProps {
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
  toneMapped?: boolean;
  // Allow setting initial uniform values directly
  uniforms?: Partial<{
    [K in keyof ParticlesMaterialUniforms]: ParticlesMaterialUniforms[K]['value'];
  }>;
}

// Three.js Fiber module augmentation
declare module '@react-three/fiber' {
  interface ThreeElements {
    particlesMaterial: Object3DNode<ParticlesMaterial, ParticlesMaterialProps>;
  }
}

// Strengthen ParticlesRef type
export interface ParticlesRef {
  material: ParticlesMaterial | null;
  points: THREE.Points | null;
  updateUniforms: (uniforms: { uAverageAmplitude: number }) => void;
}

export interface ParticlesProps {
  gpgpu: GPGPUComputation;
  geometries: ParticleGeometries;
}

export interface LogoGeometry {
  instance: THREE.BufferGeometry | null;
  count: number;
  isLoaded: boolean;
  error?: string;
}

// The complete config type should be added for us in particleSettingsContextValue.ts:
export interface ParticleConfig {
  parameters: ParticleParameters;
  settings: ParticleSettings;
}
