import * as THREE from 'three'
import { GPGPUComputation } from "./gpgpu.types"
import { ParticlesRef } from "./particle.types"

// Core audio state interface
export interface AudioManagerState {
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

// Internal audio manager types
export interface AudioObject {
  fftSize: number
  audioReader: any // TODO: Type with essentia types
  gain: GainNode | null
  essentiaNode: AudioWorkletNode | null
  soundGainNode: GainNode | null
  audioCtx: AudioContext | null
  sound: THREE.Audio | null
  micSound: THREE.Audio | null
  capacity: number
  analyser: THREE.AudioAnalyser | null
  micAnalyser: THREE.AudioAnalyser | null
  micNode: MediaStreamAudioSourceNode | null
  gumStream: MediaStream | null
  listener: THREE.AudioListener | null
  audioLoader: THREE.AudioLoader
  isAudioLoaded: boolean
  normalizedFreqData: Float32Array
}

export interface AudioAnalysisResult {
  avgAmplitude: number
  freqData: Float32Array
}

export interface AudioWorkletOptions {
  bufferSize: number
  sampleRate: number
  capacity: number
}

// Store-specific types
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

export type AudioStore = AudioManagerState & AudioActions & {
  fileName: string  // Additional store-specific state
}