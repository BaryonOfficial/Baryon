import * as THREE from 'three';
import { GPGPUComputation } from './gpgpu.types';
import { ParticlesRef } from './particle.types';
import { AudioManager } from '@/audio/audioManager';

// RingBuffer types
export type RingBuffer = object; // or Record<string, unknown>

export interface AudioReader {
  available_read: () => number;
  dequeue: (array: Float32Array) => number;
}

// Extend Window interface
declare global {
  interface Window {
    exports: {
      RingBuffer: {
        getStorageForCapacity(capacity: number, type: typeof Float32Array): SharedArrayBuffer;
        new (sab: SharedArrayBuffer, type: typeof Float32Array): RingBuffer;
      };
      AudioReader: {
        new (rb: RingBuffer): AudioReader;
      };
    };
  }
}

// Error types
export class AudioManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioManagerError';
  }
}

export class AudioWorkletError extends AudioManagerError {
  constructor(message: string) {
    super(message);
    this.name = 'AudioWorkletError';
  }
}

// Define the return type based on the actual implementation
export type AudioManagerState = ReturnType<typeof AudioManager.prototype.getAudio>;

// Internal audio manager types
export interface AudioObject {
  fftSize: number;
  audioReader: AudioReader | null;
  gain: GainNode | null;
  essentiaNode: AudioWorkletNode | null;
  soundGainNode: GainNode | null;
  audioCtx: AudioContext | null;
  sound: THREE.Audio | null;
  micSound: THREE.Audio | null;
  capacity: number;
  analyser: THREE.AudioAnalyser | null;
  micAnalyser: THREE.AudioAnalyser | null;
  micNode: MediaStreamAudioSourceNode | null;
  gumStream: MediaStream | null;
  listener: THREE.AudioListener | null;
  audioLoader: THREE.AudioLoader;
  isAudioLoaded: boolean;
}

export interface AudioAnalysisResult {
  avgAmplitude: number;
  freqData: Uint8Array;
}

export interface AudioWorkletOptions {
  bufferSize: number;
  sampleRate: number;
  capacity: number;
}

// Store-specific types
export interface AudioActions {
  loadFile: (file: File) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  stop: () => void;
  toggleMic: () => Promise<void>;
  resumeAudioContext: () => Promise<void>;
  setIsPlaying: (isPlaying: boolean) => void;
  clearError: () => void;
  processAudioData: typeof AudioManager.prototype.processAudioData;
}

export interface AudioInitializerProps {
  gpgpu: GPGPUComputation | null;
  particles: React.RefObject<ParticlesRef | null>;
}

export type AudioStore = AudioManagerState &
  AudioActions & {
    fileName: string; // Additional store-specific state
    error: string | null; // Error state
  };
