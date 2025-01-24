import { useRef } from 'react';
import { ParticlesRef } from '@/types/particle.types';
import { useGPGPU } from '@/hooks/useGPGPU';
import { useParticleGeometries } from '@/hooks/particles/useParticleGeometries';
import { useAsyncResource } from '@/hooks/useAsyncResource';
import Particles from './Particles';
import { useControls } from 'leva';
import useDebugPlanes from '@/hooks/useDebugPlanes';

export const ParticleSystem = () => {
  const particlesRef = useRef<ParticlesRef>(null);
  const geometries = useParticleGeometries();
  const { gpgpu, audioDataTexture, scalarFieldTexture, zeroPointsTexture, particlesTexture } =
    useGPGPU(geometries, particlesRef);

  const { gpgpuTextures: showGPGPUDebug } = useControls('Debug Views', {
    gpgpuTextures: {
      value: false,
      label: 'Show GPGPU Textures',
    },
  });

  useAsyncResource({ gpgpu, geometries }, { suspense: true });

  const debugPlanes = useDebugPlanes(
    {
      audioDataTexture,
      scalarFieldTexture,
      zeroPointsTexture,
      particlesTexture,
    },
    showGPGPUDebug
  );

  return (
    <>
      <Particles ref={particlesRef} gpgpu={gpgpu} geometries={geometries} />
      {debugPlanes}
    </>
  );
};
