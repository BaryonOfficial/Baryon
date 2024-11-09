import { GPGPUComputation } from "./gpgpu.types"
import { ParticlesRef } from "./particle.types"
import * as THREE from 'three'

export interface AudioState {
  fileName?: string
  isPlaying: boolean
  isAudioLoaded: boolean
  isMicActive: boolean
  isAudioContextRunning: boolean
  isWorkletReady: boolean
  fftSize: number        
  sampleRate: number     
  averageAmplitude: number
  capacity: number        
  analyser: THREE.AudioAnalyser | null
  audioCtx: AudioContext | null
  sound: THREE.Audio | null
  data: Uint8Array
}

export interface AudioActions {
  loadFile: (file: File) => Promise<void>
  togglePlayPause: () => Promise<void>
  stop: () => void
  toggleMic: () => Promise<void>
  resumeAudioContext: () => Promise<void>
  setIsPlaying: (isPlaying: boolean) => void
}

export interface AudioInitializerProps {
  gpgpu: GPGPUComputation | null
  particles: ParticlesRef
}

export type AudioStore = AudioState & AudioActions