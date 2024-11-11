import { OrbitControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import useGPGPU from '@/hooks/useGPGPU';
import { AudioInitializer } from './AudioInitializer';
import { useParticleParameters } from '@/hooks/particles/useParticleParameters';
import { useParticleGeometries } from '@/hooks/particles/useParticleGeometries';
import { PostProcessingEffects } from './PostProcessingEffects';
import Particles from './Particles';

export function SceneContent() {
  const particlesRef = useRef<ParticlesRef>(null);
  const parameters = useParticleParameters();
  const geometries = useParticleGeometries(parameters);
  const { gpgpu } = useGPGPU(parameters, geometries, particlesRef);

  // Debug logging
  useEffect(() => {
    if (particlesRef.current) {
      console.log('Particles Debug:', {
        points: particlesRef.current.points,
        material: particlesRef.current.material,
        geometries,
        gpgpu,
      });

      // Log specific geometry attributes
      if (particlesRef.current.points) {
        const geometry = particlesRef.current.points.geometry;
        console.log('Geometry Attributes:', {
          uvs: geometry.getAttribute('aParticlesUv'),
          sizes: geometry.getAttribute('aSize'),
          vertexCount: geometry.getAttribute('aParticlesUv').count,
        });
      }
    }
  }, [particlesRef.current, geometries, gpgpu]);

  if (!gpgpu) return null;

  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <AudioInitializer />
      <Particles ref={particlesRef} gpgpu={gpgpu} geometries={geometries} parameters={parameters} />
      <PostProcessingEffects />
    </>
  );
}
