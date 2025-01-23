import type { GPGPUReturn } from '@/types/gpgpu.types';
import { DebugPlane } from '@/components/Debug/DebugPlane';
import * as THREE from 'three';

type DebugPlanesProps = Pick<
  GPGPUReturn,
  'audioDataTexture' | 'scalarFieldTexture' | 'zeroPointsTexture' | 'particlesTexture'
>;

type DebugPlaneConfig = {
  texture: React.RefObject<THREE.Texture | null>;
  position: [number, number, number];
  label?: string;
  size?: [number, number];
  visible?: boolean;
};

type DebugVisibilityConfig = {
  audioDataVisible?: boolean;
  scalarFieldVisible?: boolean;
  zeroPointsVisible?: boolean;
  particlesVisible?: boolean;
};

function useDebugPlanes(
  textures: DebugPlanesProps,
  enabled: boolean,
  visibility: DebugVisibilityConfig = {}
) {
  const planeConfigs: DebugPlaneConfig[] = [
    {
      texture: textures.audioDataTexture,
      position: [-4, 2, 5],
      label: 'Audio Data',
      size: [3, 3],
      visible: visibility.audioDataVisible ?? true,
    },
    {
      texture: textures.scalarFieldTexture,
      position: [-4, -1, 5],
      label: 'Scalar Field',
      size: [3, 3],
      visible: visibility.scalarFieldVisible ?? true,
    },
    {
      texture: textures.zeroPointsTexture,
      position: [-1, 2, 5],
      label: 'Zero Points',
      size: [3, 3],
      visible: visibility.zeroPointsVisible ?? true,
    },
    {
      texture: textures.particlesTexture,
      position: [-1, -1, 5],
      label: 'Particles',
      size: [3, 3],
      visible: visibility.particlesVisible ?? true,
    },
  ];

  if (!enabled) return null;

  return (
    <group>
      <axesHelper position={[-2.5, 0.5, 5]} args={[3]} />
      {planeConfigs.map((config, index) => {
        const texture = config.texture.current;
        if (!texture || config.visible === false) return null;

        return (
          <DebugPlane
            key={index}
            texture={texture}
            position={config.position}
            size={config.size}
            label={config.label}
          />
        );
      })}
    </group>
  );
}

export default useDebugPlanes;
