interface AudioState {
  // State from AudioStore interface
  fileName: string
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  showStats: boolean
  isAudioContextRunning: boolean
  isWorkletReady: boolean
  fftSize: number
  sampleRate: number
  averageAmplitude: number
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