import * as THREE from 'three'
import type { ParticleParameters, ParticleGeometries, LogoGeometry } from '@/types/particle.types'

export const DEFAULT_PARAMETERS: ParticleParameters = {
  count: 10000,
  radius: 3.0,
  threshold: 0.05,
  surfaceThreshold: 0.01,
  surfaceRatio: 0.33
}

export function createParticleGeometries(
  params: ParticleParameters, 
  logoGeometry: LogoGeometry
): ParticleGeometries {
  return {
    base: {
      count: params.count,
      positions: initializeParticlesInSphereVolumeAndSurface(
        params.count,
        params.radius,
        params.surfaceRatio
      ),
      colors: new Float32Array(params.count * 3)
    },
    secondary: {
      instance: logoGeometry.geometry ?? new THREE.BufferGeometry(),
      count: logoGeometry.vertexCount ?? params.count
    }
  }
}

 function initializeParticlesInSphereVolumeAndSurface(
  count: number,
  radius: number,
  surfaceRatio: number
): Float32Array {
  const positions = new Float32Array(count * 3);
  const surfaceCount = Math.floor(count * surfaceRatio);

  // Generate points on the surface
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount;
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = angleIncrement * i;
    const x = radius * Math.sin(inclination) * Math.cos(azimuth);
    const y = radius * Math.sin(inclination) * Math.sin(azimuth);
    const z = radius * Math.cos(inclination);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  // Generate points within the volume
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1 / 3) * radius;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
}
