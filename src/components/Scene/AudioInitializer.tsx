import { useThree, useFrame } from '@react-three/fiber';
import { useEffect } from 'react';
import { audioManager } from '@/audio/audioManager';
import type { AudioInitializerProps } from '@/types/audio.types';

export function AudioInitializer({ gpgpu, particles }: AudioInitializerProps) {
  const { camera } = useThree();

  useEffect(() => {
    // Setup audio system
    audioManager.setup(camera);
    audioManager.startAudioProcessing();

    return () => {
      audioManager.cleanupAudioGraph();
    };
  }, [camera]);

  // Use the essentiaData from GPGPU
  useFrame(() => {
    if (!gpgpu?.essentiaData) return;
    audioManager.processAudioData(gpgpu, particles, gpgpu.essentiaData);
  });

  return null;
}
