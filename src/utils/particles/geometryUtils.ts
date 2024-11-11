import * as THREE from 'three'
import type { ParticleParameters, ParticleGeometries, LogoGeometry } from '@/types/particle.types'

export function createParticleGeometries(
  parameters: ParticleParameters, 
  logo: LogoGeometry
): ParticleGeometries {
  return {
    base: {
      count: parameters.count,
      positions: initializeParticlesInSphereVolumeAndSurface(
        parameters.count,
        parameters.radius,
        parameters.surfaceRatio
      ),
      colors: new Float32Array(parameters.count * 3)
    },
    secondary: {
      instance: logo.instance ?? new THREE.BufferGeometry(),
      count: logo.count ?? parameters.count
    }
  }
}

function initializeParticlesInSphereVolumeAndSurface(
  count: number,
  radius: number,
  surfaceRatio: number
): Float32Array {
  const positions = new Float32Array(count * 3)
  const surfaceCount = Math.floor(count * surfaceRatio)

  // Surface points using golden ratio spiral
  const goldenRatio = (1 + Math.sqrt(5)) / 2
  const angleIncrement = Math.PI * 2 * goldenRatio
  
  for (let i = 0; i < surfaceCount; i++) {
    const t = i / surfaceCount
    const inclination = Math.acos(1 - 2 * t)
    const azimuth = angleIncrement * i
    
    const x = radius * Math.sin(inclination) * Math.cos(azimuth)
    const y = radius * Math.sin(inclination) * Math.sin(azimuth)
    const z = radius * Math.cos(inclination)
    
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
  }

  // Volume points
  for (let i = surfaceCount; i < count; i++) {
    const r = Math.pow(Math.random(), 1/3) * radius
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    
    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.sin(phi) * Math.sin(theta)
    const z = r * Math.cos(phi)
    
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
  }

  return positions
} 