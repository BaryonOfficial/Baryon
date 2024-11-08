import { create } from 'zustand'
import { audioManager } from '@/audio/audioManager'
import type { AudioStore } from '@/types/audio'

export const useAudioStore = create<AudioStore>((set) => ({
  // Initial state from audioManager
  ...audioManager.getAudioState(),
  fileName: 'Upload Audio',
  showStats: false,
  averageAmplitude: 0, 

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
      const currentState = audioManager.getAudioState()
      if (currentState.isMicActive) {
        audioManager.stopMicRecordStream()
      } else {
        await audioManager.startMicRecordStream()
      }
      set({ isMicActive: !currentState.isMicActive })
    } catch (error) {
      console.error('Error toggling microphone:', error)
      set({ isMicActive: false })
    }
  },

  setShowStats: (show) => set({ showStats: show }),

  resumeAudioContext: async () => {
    try {
      await audioManager.resumeAudioContext()
      set(audioManager.getAudioState())
    } catch (error) {
      console.error('Error resuming audio context:', error)
    }
  }
}))

// Subscribe to audio state changes
audioManager.subscribeToAudioState((state) => {
  useAudioStore.setState(state)
}) 