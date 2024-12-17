import { useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import useGPGPU from '@/hooks/useGPGPU';
import { useParticleGeometries } from '@/hooks/particles/useParticleGeometries';
import { PostProcessingEffects } from './PostProcessingEffects';
import Particles from './Particles';

export const ParticleSystem = () => {
  const particlesRef = useRef<ParticlesRef>(null);
  const geometries = useParticleGeometries();
  const { gpgpu, particlesTexture } = useGPGPU(geometries, particlesRef);

  if (!gpgpu || !particlesTexture?.current) return null;

  return (
    <>
      <Particles ref={particlesRef} gpgpu={gpgpu} geometries={geometries} />
      <PostProcessingEffects />
    </>
  );
};
