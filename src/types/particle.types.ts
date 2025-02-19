import * as THREE from 'three';
import { z } from 'zod';
import type { GPGPUComputation } from './gpgpu.types';

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

// Core uniforms for the shader material
export interface ParticleUniforms {
  uResolution: THREE.Vector2;
  uSize: number;
  uParticlesTexture: THREE.Texture | null;
  uTime: number;
  uDeltaTime: number;
  uAverageAmplitude: number;
  uRadius: number;
  uSoundPlaying: boolean;
  uColor: THREE.Color;
  uSurfaceColor: THREE.Color;
}

export type CustomShaderMaterial = THREE.ShaderMaterial & {
  uniforms: { [K in keyof ParticleUniforms]: THREE.IUniform<ParticleUniforms[K]> };
};

// Component props
export interface ParticlesProps {
  gpgpu: Pick<GPGPUComputation, 'size'>;
  geometries: {
    base: {
      positions: Float32Array;
    };
  };
}

// Ref type for external control
export interface ParticlesRef {
  material: CustomShaderMaterial | null;
  points: THREE.Points | null;
  updateUniforms: (uniforms: { uAverageAmplitude: number }) => void;
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
