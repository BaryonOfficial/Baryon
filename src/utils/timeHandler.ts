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
    if (audio.sound?.started && !audio.isPlaying) return {
      time: lastKnownTimeRef.current,
      deltaTime: 0
    }

    if (audio.isPlaying && audio.sound?.started) {
      lastKnownTimeRef.current = audio.sound.context.currentTime ?? elapsedTime
      return {
        time: lastKnownTimeRef.current,
        deltaTime: audio.sound.listener.timeDelta ?? delta
      }
    }

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