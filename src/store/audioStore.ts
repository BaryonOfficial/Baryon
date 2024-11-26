import { create } from 'zustand'
import { audioManager } from '@/audio/audioManager.ts'
import { AudioStore } from '@/types/audio.types.ts'
import { GPGPUComputation } from '@/types/gpgpu.types.ts'
import { ParticlesRef } from '@/types/particle.types.ts'
import type { RefObject } from 'react'

export const useAudioStore = create<AudioStore>((set) => ({
  // Initial state from audioManager
  ...audioManager.getAudio(),
  fileName: 'Upload Audio',

  loadFile: async (file) => {
    try {
      const fileURL = URL.createObjectURL(file)
      await audioManager.loadAudio(fileURL)
      set({ fileName: file.name, isAudioLoaded: true, isPlaying: false })
    } catch (error) {
      console.error('Error loading audio:', error)
      set({ fileName: 'Upload Audio', isAudioLoaded: false })
    }
  },

  togglePlayPause: async () => {
    try {
      const isNowPlaying = await audioManager.playPauseAudio()
      set({ isPlaying: isNowPlaying })
    } catch (error) {
      console.error('Error in play/pause:', error)
      set({ isPlaying: false })
    }
  },

  stop: () => {
    audioManager.stopAudio()
    set({ isPlaying: false })
  },

  toggleMic: async () => {
    try {
      const currentAudio = audioManager.getAudio()
      if (currentAudio.isMicActive) {
        audioManager.stopMicRecordStream()
      } else {
        await audioManager.startMicRecordStream()
      }
      set({ isMicActive: !currentAudio.isMicActive })
    } catch (error) {
      console.error('Error toggling microphone:', error)
      set({ isMicActive: false })
    }
  },

  resumeAudioContext: async () => {
    try {
      await audioManager.resumeAudioContext()
      set(audioManager.getAudio())
    } catch (error) {
      console.error('Error resuming audio context:', error)
    }
  },

  setIsPlaying: (isPlaying: boolean) => {
    set({ isPlaying })
  },

  processAudioData: (
    gpgpu: GPGPUComputation,
    particlesRef: RefObject<ParticlesRef>,
    showDebug?: boolean
  ) => {
    audioManager.processAudioData(gpgpu, particlesRef, showDebug)
  }

}))

// Subscribe to audio state changes
audioManager.subscribeToAudio((state) => {
  useAudioStore.setState(state)
}) 