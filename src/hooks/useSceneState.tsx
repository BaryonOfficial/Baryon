import { create } from 'zustand'

interface SceneState {
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  fileName: string
  showStats: boolean
  setIsPlaying: (state: boolean) => void
  setIsAudioLoaded: (state: boolean) => void
  setIsMicActive: (state: boolean) => void
  setFileName: (name: string) => void
  setShowStats: (state: boolean) => void
}

export const useSceneState = create<SceneState>((set) => ({
  // Audio state
  isPlaying: false,
  isAudioLoaded: false,
  isMicActive: false,
  fileName: 'Upload Audio',
  
  // Scene state
  showStats: false,
  
  // Actions
  setIsPlaying: (state) => set({ isPlaying: state }),
  setIsAudioLoaded: (state) => set({ isAudioLoaded: state }),
  setIsMicActive: (state) => set({ isMicActive: state }),
  setFileName: (name) => set({ fileName: name }),
  setShowStats: (state) => set({ showStats: state }),
})) 