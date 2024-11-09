import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { audioManager } from '@/audio/audioManager';
import { useAudioStore } from '@/store/audioStore';
import type { AudioInitializerProps } from '@/types/audio.types';

export function AudioInitializer({ gpgpu, particles }: AudioInitializerProps) {
  const { camera } = useThree();
  const { setIsPlaying } = useAudioStore();

  useEffect(() => {
    // Setup audio system
    audioManager.setup(camera);
    audioManager.startAudioProcessing();

    // Set up audio ended callback
    audioManager.setAudioEndedCallback(() => {
      setIsPlaying(false);
    });

    return () => {
      audioManager.cleanupAudioGraph();
    };
  }, [camera, setIsPlaying]);

  return null;
}
