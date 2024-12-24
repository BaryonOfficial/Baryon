import { useRef } from 'react';
import { useAudioStore } from '@/store/audioStore.ts';
import type { TimeState } from '@/types/time.types';

export function useTimeHandler() {
  const lastKnownTimeRef = useRef(0);
  const { isPlaying, isMicActive, sound } = useAudioStore();

  const handleTime = (elapsedTime: number, delta: number): TimeState => {
    if (sound?.started && !isPlaying && !isMicActive)
      return {
        time: lastKnownTimeRef.current,
        deltaTime: 0,
      };

    if ((isPlaying || isMicActive) && sound?.started) {
      lastKnownTimeRef.current = sound.context.currentTime ?? elapsedTime;
      return {
        time: lastKnownTimeRef.current,
        deltaTime: sound.listener.timeDelta ?? delta,
      };
    }

    return {
      time: elapsedTime,
      deltaTime: delta,
    };
  };

  return {
    handleTime,
    refs: {
      lastKnownTime: lastKnownTimeRef,
    },
  };
}
