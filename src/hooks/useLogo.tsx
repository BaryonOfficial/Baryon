import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { LogoGeometry, ParticleSettings } from '@/types/particle.types';
import { useMemo } from 'react';

export function useLogo({ scale }: Pick<ParticleSettings, 'scale'>): LogoGeometry {
  useGLTF.setDecoderPath('/draco/');
  const { scene } = useGLTF('/glb/Baryon_v2.glb', true);

  return useMemo(() => {
    if (!scene?.children[0])
      return {
        instance: null,
        count: 0,
        isLoaded: false,
        error: 'Failed to load logo geometry',
      };

    const mesh = scene.children[0];
    if (!(mesh instanceof THREE.Mesh))
      return {
        instance: null,
        count: 0,
        isLoaded: false,
        error: 'Logo model is not a mesh',
      };

    // Create a transform matrix
    const matrix = new THREE.Matrix4();
    matrix.makeScale(scale, scale, scale);

    // Clone and transform the geometry
    const scaledGeometry = mesh.geometry.clone();
    scaledGeometry.applyMatrix4(matrix);

    return {
      instance: scaledGeometry,
      count: scaledGeometry.attributes.position.count,
      isLoaded: true,
    };
  }, [scene, scale]);
}

useGLTF.preload('/glb/Baryon_v2.glb');
