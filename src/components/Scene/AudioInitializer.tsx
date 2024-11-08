import { useThree, useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { audioManager } from '@/audio/audioManager'
import type { GPGPUComputation } from '@/types/gpgpu.types'
import type { ParticlesRef } from '@/types/particle.types'

interface AudioInitializerProps {
  gpgpu: GPGPUComputation | null
  particles: ParticlesRef
}

export function AudioInitializer({ gpgpu, particles }: AudioInitializerProps) {
  const { camera } = useThree()

  useEffect(() => {
    // Setup audio system
    audioManager.setup(camera)
    audioManager.startAudioProcessing()

    return () => {
      audioManager.cleanupAudioGraph()
    }
  }, [camera])

  // Use the essentiaData from GPGPU
  useFrame(() => {
    if (!gpgpu?.essentiaData) return
    audioManager.processAudioData(gpgpu, particles, gpgpu.essentiaData)
  })

  return null
} 