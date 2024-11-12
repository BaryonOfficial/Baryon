import * as THREE from 'three'
import { GPGPUComputation } from "./gpgpu.types"
import { ParticlesRef } from "./particle.types"
import { AudioManager } from '@/audio/audioManager'

// Add custom error types
export class AudioManagerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AudioManagerError'
  }
}

export class AudioWorkletError extends AudioManagerError {
  constructor(message: string) {
    super(message)
    this.name = 'AudioWorkletError'
  }
}

// Define the return type based on the actual implementation
export type AudioManagerState = ReturnType<typeof AudioManager.prototype.getAudio>

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
}

export interface AudioAnalysisResult {
  avgAmplitude: number
  freqData: Uint8Array
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
  processAudioData: typeof AudioManager.prototype.processAudioData
}

export interface AudioInitializerProps {
  gpgpu: GPGPUComputation | null
  particles: React.RefObject<ParticlesRef>
}

export type AudioStore = AudioManagerState & AudioActions & {
  fileName: string  // Additional store-specific state
}