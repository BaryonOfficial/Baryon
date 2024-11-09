import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { LogoGeometry } from '@/types/particle.types';
import { useMemo } from 'react';

export function useLogo(): LogoGeometry {
  useGLTF.setDecoderPath('/draco/');
  const { scene } = useGLTF('/glb/Baryon_v2.glb', true);

  return useMemo(() => {
    console.log('Scene loaded:', scene); // Log 1: Check if scene is loaded

    if (!scene?.children[0]) {
      console.warn('No children found in scene'); // Log 2: Debug missing children
      return {
        instance: null,
        count: 0,
        isLoaded: false,
        error: 'Failed to load logo geometry',
      };
    }

    const mesh = scene.children[0];
    console.log('Mesh found:', mesh); // Log 3: Check mesh properties

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
  }, [scene]);
}

useGLTF.preload('/glb/Baryon_v2.glb');
