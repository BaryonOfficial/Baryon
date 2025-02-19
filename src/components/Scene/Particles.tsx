import { useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useThree, extend } from '@react-three/fiber';
import { type ThreeElement } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Shaders
import vertexShader from '@/shaders/particles/vertex.glsl';
import fragmentShader from '@/shaders/particles/fragment.glsl';

import type { ParticlesProps, ParticlesRef, CustomShaderMaterial } from '@/types/particle.types';
import { useParticleSettingsContext } from '@/contexts/useParticleSettingsContext';

// Improved shader material creation with proper typing
const ParticlesMaterial = shaderMaterial(
  {
    uResolution: new THREE.Vector2(),
    uSize: 0.03,
    uParticlesTexture: null as THREE.Texture | null,
    uTime: 0,
    uDeltaTime: 0,
    uAverageAmplitude: 0.0,
    uRadius: 3.0,
    uSoundPlaying: false,
    uColor: new THREE.Color(),
    uSurfaceColor: new THREE.Color(),
  },
  vertexShader,
  fragmentShader
);

// Use ReturnType to get the type that shaderMaterial creates
declare module '@react-three/fiber' {
  interface ThreeElements {
    particlesMaterial: ThreeElement<ReturnType<typeof shaderMaterial>>;
  }
}

extend({ ParticlesMaterial });

// Hook for particle attributes
const useParticleAttributes = (gpgpu: ParticlesProps['gpgpu']) => {
  return useMemo(() => {
    const uvArray = new Float32Array(gpgpu.size * gpgpu.size * 2);
    const sizesArray = new Float32Array(gpgpu.size * gpgpu.size);

    for (let y = 0; y < gpgpu.size; y++) {
      for (let x = 0; x < gpgpu.size; x++) {
        const i = y * gpgpu.size + x;
        const i2 = i * 2;
        uvArray[i2] = (x + 0.5) / gpgpu.size;
        uvArray[i2 + 1] = (y + 0.5) / gpgpu.size;
        sizesArray[i] = Math.random();
      }
    }

    return { uvArray, sizesArray };
  }, [gpgpu.size]);
};

const Particles = forwardRef<ParticlesRef, ParticlesProps>(function Particles(
  { gpgpu, geometries },
  ref
) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<CustomShaderMaterial>(null);
  const { parameters, settings } = useParticleSettingsContext();
  const { uvArray, sizesArray } = useParticleAttributes(gpgpu);
  const { size, viewport } = useThree();

  useEffect(() => {
    if (!materialRef?.current?.uniforms) return;

    const { uniforms } = materialRef.current;
    uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    uniforms.uColor.value.set(settings.color);
    uniforms.uSurfaceColor.value.set(settings.surfaceColor);
    uniforms.uRadius.value = parameters.radius;
    uniforms.uSize.value = settings.particleSize;
  }, [
    size,
    viewport,
    settings.color,
    settings.surfaceColor,
    settings.particleSize,
    parameters.radius,
    materialRef,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      material: materialRef.current,
      points: pointsRef.current,
      updateUniforms: ({ uAverageAmplitude }) => {
        if (!materialRef.current?.uniforms) return;
        materialRef.current.uniforms.uAverageAmplitude.value = uAverageAmplitude;
      },
    }),
    [materialRef, pointsRef]
  );

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geometries.base.positions, 3]} />
        <bufferAttribute attach="attributes-aParticlesUv" args={[uvArray, 2]} />
        <bufferAttribute attach="attributes-aSize" args={[sizesArray, 1]} />
      </bufferGeometry>
      <particlesMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
});

export default Particles;
