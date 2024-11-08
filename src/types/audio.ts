interface AudioState {
  // UI-relevant state
  fileName: string
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  showStats: boolean
  isAudioContextRunning: boolean
  isWorkletReady: boolean
  
  // Fixed audio parameters (unless made configurable)
  fftSize: number        
  sampleRate: number     // From audio context
  averageAmplitude: number  // Computed from analysis
  capacity: number        
}

interface AudioActions {
  loadFile: (file: File) => Promise<void>
  togglePlayPause: () => Promise<void>
  stop: () => void
  toggleMic: () => Promise<void>
  setShowStats: (show: boolean) => void
  resumeAudioContext: () => Promise<void>
}

export type AudioStore = AudioState & AudioActions 