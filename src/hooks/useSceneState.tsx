import create from 'zustand'

export const useSceneState = create((set) => ({
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