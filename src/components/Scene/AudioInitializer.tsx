import { useThree } from '@react-three/fiber';
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

  return null;
}
