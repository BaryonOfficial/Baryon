import { useMemo, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useThree, extend, type Object3DNode } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Shaders
import vertexShader from '@/shaders/particles/vertex.glsl';
import fragmentShader from '@/shaders/particles/fragment.glsl';

import type {
  ParticleMaterial,
  ParticleMaterialProps,
  ParticlesProps,
  ParticlesRef,
} from '@/types/particle.types';

const ParticlesMaterial = shaderMaterial(
  {
    uSize: 0.03,
    uTime: 0,
    uDeltaTime: 0,
    uResolution: new THREE.Vector2(),
    uParticlesTexture: null,
    uColor: new THREE.Color(),
    uSurfaceColor: new THREE.Color(),
    uRadius: 3.0,
    uAverageAmplitude: 0.0,
    uSoundPlaying: false,
  },
  vertexShader,
  fragmentShader
) as unknown as new () => ParticleMaterial;

extend({ ParticlesMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    particlesMaterial: Object3DNode<ParticleMaterial, ParticleMaterialProps> &
      ParticleMaterialProps;
  }
}

const Particles = forwardRef<ParticlesRef, ParticlesProps>(function Particles(
  { gpgpu, geometries, parameters, settings },
  ref
) {
  const { size, viewport } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<ParticleMaterial>(null);

  useImperativeHandle(
    ref,
    () => ({
      material: materialRef.current,
      points: pointsRef.current,
      updateUniforms: ({ uAverageAmplitude }: { uAverageAmplitude: number }) => {
        if (!materialRef.current) return;
        materialRef.current.uniforms.uAverageAmplitude.value = uAverageAmplitude;
      },
    }),
    [materialRef, pointsRef]
  );

  const [uvArray, sizesArray] = useMemo(() => {
    const uvArray = new Float32Array(geometries.base.count * 2);
    const sizesArray = new Float32Array(geometries.base.count);

    for (let y = 0; y < gpgpu.size; y++) {
      for (let x = 0; x < gpgpu.size; x++) {
        const i = y * gpgpu.size + x;
        const i2 = i * 2;

        const uvX = (x + 0.5) / gpgpu.size;
        const uvY = (y + 0.5) / gpgpu.size;

        uvArray[i2 + 0] = uvX;
        uvArray[i2 + 1] = uvY;

        sizesArray[i] = Math.random();
      }
    }

    return [uvArray, sizesArray];
  }, [gpgpu.size, geometries.base.count]);

  // Material updates
  useEffect(() => {
    if (!materialRef.current?.uniforms) return;

    const { uniforms } = materialRef.current;
    uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    uniforms.uColor.value.set(settings.color);
    uniforms.uSurfaceColor.value.set(settings.surfaceColor);
    uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(
      gpgpu.particlesVariable
    ).texture;
    uniforms.uRadius.value = parameters.radius;
    uniforms.uSize.value = settings.particleSize;
  }, [
    size,
    viewport,
    settings.color,
    settings.surfaceColor,
    settings.particleSize,
    parameters.radius,
    gpgpu,
  ]);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={geometries.base.count}
          array={geometries.base.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aParticlesUv"
          count={uvArray.length / 2}
          array={uvArray}
          itemSize={2}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={sizesArray.length}
          array={sizesArray}
          itemSize={1}
        />
      </bufferGeometry>
      <particlesMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
});

export default Particles;
