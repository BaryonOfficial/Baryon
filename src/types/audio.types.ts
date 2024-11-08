
export interface AudioState {
  fileName: string
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  isAudioContextRunning: boolean
  isWorkletReady: boolean
  fftSize: number        
  sampleRate: number     
  averageAmplitude: number
  capacity: number        
}

export interface AudioActions {
  loadFile: (file: File) => Promise<void>
  togglePlayPause: () => Promise<void>
  stop: () => void
  toggleMic: () => Promise<void>
  resumeAudioContext: () => Promise<void>
}

export type AudioStore = AudioState & AudioActions