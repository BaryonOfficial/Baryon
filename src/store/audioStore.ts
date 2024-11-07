import { create } from 'zustand'
import { audioManager } from '@/audio/audioManager'

interface AudioStore {
  // State
  fileName: string
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  showStats: boolean
  isAudioContextRunning: boolean
  isWorkletReady: boolean
  fftSize: number
  sampleRate: number

  // Actions
  loadFile: (file: File) => Promise<void>
  togglePlayPause: () => Promise<void>
  stop: () => void
  toggleMic: () => Promise<void>
  setShowStats: (show: boolean) => void
  resumeAudioContext: () => Promise<void>
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  fileName: 'Upload Audio',
  isPlaying: false,
  isAudioLoaded: false,
  isMicActive: false,
  showStats: false,
  isAudioContextRunning: false,
  isWorkletReady: false,
  fftSize: 4096,
  sampleRate: 44100,

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
    if (!get().isAudioLoaded) return
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
    const { isMicActive } = get()
    try {
      if (isMicActive) audioManager.stopMicRecordStream()
      else await audioManager.startMicRecordStream()
      set({ isMicActive: !isMicActive })
    } catch (error) {
      console.error('Error toggling microphone:', error)
      set({ isMicActive: false })
    }
  },

  setShowStats: (show) => set({ showStats: show }),

  resumeAudioContext: async () => {
    try {
      await audioManager.resumeAudioContext()
      const state = audioManager.getAudioState()
      set({ 
        isAudioContextRunning: state.isAudioContextRunning,
        isWorkletReady: state.isWorkletReady,
        fftSize: state.fftSize,
        sampleRate: state.sampleRate
      })
    } catch (error) {
      console.error('Error resuming audio context:', error)
    }
  }
})) 