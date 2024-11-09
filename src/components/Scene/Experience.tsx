import { OrbitControls } from '@react-three/drei';
import Particles from './Particles';
import { useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import useGPGPU from '@/hooks/useGPGPU';
import { AudioInitializer } from './AudioInitializer';
import { useAudioStore } from '@/store/audioStore';
import { DEFAULT_PARAMETERS } from '@/utils/particleConfig';
import { useParticleGeometries } from '@/hooks/useParticleGeometries';
import { Effects as PostProcessingEffects } from './Effects';

export default function Experience() {
  const particlesRef = useRef<ParticlesRef>(null);
  const { isAudioContextRunning } = useAudioStore();

  const geometries = useParticleGeometries(DEFAULT_PARAMETERS);
  const { gpgpu, particlesTexture } = useGPGPU(DEFAULT_PARAMETERS, geometries, particlesRef);

  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />
      {gpgpu && (
        <>
          {isAudioContextRunning && (
            <AudioInitializer gpgpu={gpgpu} particles={particlesRef.current!} />
          )}
          <Particles
            ref={particlesRef}
            gpgpu={gpgpu}
            particlesTexture={particlesTexture}
            geometries={geometries}
          />
        </>
      )}
      <PostProcessingEffects />
    </>
  );
}
