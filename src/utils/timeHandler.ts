import * as THREE from 'three'
import { useRef } from 'react'
import type { AudioManagerState } from '@/types/audio.types'

interface TimeState {
  time: number
  deltaTime: number
}

interface TimeRefs {
  lastKnownTime: React.MutableRefObject<number>
}

export function createTimeHandler() {
  const lastKnownTimeRef = useRef(0)

  function handleTime(
    elapsedTime: number, 
    delta: number, 
    audio: AudioManagerState
  ): TimeState {
    // If audio is started but paused, freeze time at last known position
    if ((audio.sound as any)?.started && !audio.isPlaying) return {
      time: lastKnownTimeRef.current,
      deltaTime: 0
    }

    // If audio is playing and started, use audio context time
    if (audio.isPlaying && (audio.sound as any)?.started) {
      lastKnownTimeRef.current = audio.sound?.context?.currentTime ?? elapsedTime
      return {
        time: lastKnownTimeRef.current,
        deltaTime: (audio.sound?.listener as any)?.timeDelta ?? delta
      }
    }

    // For mic or default case, use frame time values directly
    return { 
      time: elapsedTime, 
      deltaTime: delta 
    }
  }

  return {
    handleTime,
    refs: {
      lastKnownTime: lastKnownTimeRef
    }
  }
} 