import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { LogoGeometry } from '@/types/particle.types';
import { useMemo } from 'react';
import { useControls } from 'leva';

export function useLogo(): LogoGeometry {
  const { showDebug } = useControls({
    showDebug: {
      value: false,
      label: 'Logo Debug',
    },
  });

  useGLTF.setDecoderPath('/draco/');
  const { scene } = useGLTF('/glb/Baryon_v2.glb', true);

  return useMemo(() => {
    if (showDebug) console.log('Scene loaded:', scene);

    if (!scene?.children[0]) {
      if (showDebug) console.warn('No children found in scene');
      return {
        instance: null,
        count: 0,
        isLoaded: false,
        error: 'Failed to load logo geometry',
      };
    }

    const mesh = scene.children[0];
    if (showDebug) console.log('Mesh found:', mesh);

    if (!(mesh instanceof THREE.Mesh)) {
      return {
        instance: null,
        count: 0,
        isLoaded: false,
        error: 'Logo model is not a mesh',
      };
    }

    return {
      instance: mesh.geometry,
      count: mesh.geometry.attributes.position.count,
      isLoaded: true,
    };
  }, [scene, showDebug]);
}

useGLTF.preload('/glb/Baryon_v2.glb');
