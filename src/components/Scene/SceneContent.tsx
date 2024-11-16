import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import useGPGPU from '@/hooks/useGPGPU';
import { AudioInitializer } from './AudioInitializer';
import { useParticleGeometries } from '@/hooks/particles/useParticleGeometries';
import { PostProcessingEffects } from './PostProcessingEffects';
import Particles from './Particles';

export function SceneContent() {
  const particlesRef = useRef<ParticlesRef>(null);
  const geometries = useParticleGeometries();
  const { gpgpu, particlesTexture } = useGPGPU(geometries, particlesRef);

  if (!gpgpu || !particlesTexture) return null;

  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <AudioInitializer />
      <Particles
        ref={particlesRef}
        gpgpu={gpgpu}
        geometries={geometries}
        particlesTexture={particlesTexture}
      />
      <PostProcessingEffects />
    </>
  );
}
