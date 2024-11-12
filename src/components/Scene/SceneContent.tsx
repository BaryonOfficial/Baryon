import { OrbitControls } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import useGPGPU from '@/hooks/useGPGPU';
import { AudioInitializer } from './AudioInitializer';
import { useParticleParameters } from '@/hooks/particles/useParticleParameters';
import { useParticleGeometries } from '@/hooks/particles/useParticleGeometries';
import { PostProcessingEffects } from './PostProcessingEffects';
import Particles from './Particles';
import { useParticleControls } from '../Controls/LevaControls';

export function SceneContent() {
  const particlesRef = useRef<ParticlesRef>(null);
  const parameters = useParticleParameters();
  const geometries = useParticleGeometries(parameters);
  const particleSettings = useParticleControls();
  const { gpgpu } = useGPGPU(parameters, geometries, particlesRef);

  if (!gpgpu) return null;

  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <AudioInitializer />
      <Particles
        ref={particlesRef}
        gpgpu={gpgpu}
        geometries={geometries}
        parameters={parameters}
        settings={particleSettings}
      />
      <PostProcessingEffects />
    </>
  );
}
