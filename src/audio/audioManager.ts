import * as THREE from 'three';
import { Camera } from '@react-three/fiber';
import type { ParticlesRef } from '@/types/particle.types';
import type { GPGPUComputation } from '@/types/gpgpu.types';
import { AudioManagerError, AudioWorkletError } from '@/types/audio.types';
import type { AudioObject, AudioAnalysisResult, AudioWorkletOptions } from '@/types/audio.types';

export class AudioManager {
  private audioObject: AudioObject;
  private finalFreqData: Uint8Array;

  constructor() {
    this.audioObject = {
      fftSize: 4096,
      audioReader: null,
      gain: null,
      essentiaNode: null,
      soundGainNode: null,
      audioCtx: null,
      sound: null,
      micSound: null,
      capacity: 5,
      analyser: null,
      micAnalyser: null,
      micNode: null,
      gumStream: null,
      listener: null,
      audioLoader: new THREE.AudioLoader(),
      isAudioLoaded: false,
    };

    // Initialize for normalized values (0-1 range)
    this.finalFreqData = new Uint8Array(this.audioObject.fftSize / 2);
  }

  public setup(camera: Camera) {
    this.audioObject.listener = new THREE.AudioListener();
    camera.add(this.audioObject.listener);

    this.audioObject.sound = new THREE.Audio(this.audioObject.listener);
    this.audioObject.sound.started = false;

    this.audioObject.audioCtx = this.audioObject.listener.context;
    this.audioObject.analyser = new THREE.AudioAnalyser(
      this.audioObject.sound,
      this.audioObject.fftSize
    );
  }

  public setAudioEndedCallback(callback: () => void) {
    if (!this.audioObject.sound) {
      console.warn('Audio object not initialized when setting ended callback');
      return;
    }

    this.audioObject.sound.onEnded = () => {
      this.audioObject.sound?.stop();
      if (this.audioObject.sound) this.audioObject.sound.started = false;
      this.audioObject.essentiaNode?.port.postMessage({
        isPlaying: this.audioObject.sound?.isPlaying,
      });
      callback();
    };
  }

  public loadAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.audioObject.sound) {
        reject(new Error('Audio not initialized'));
        return;
      }

      if (this.audioObject.sound.started) {
        this.audioObject.sound.stop();
        this.audioObject.sound.started = false;
      }

      this.audioObject.isAudioLoaded = false;
      this.audioObject.audioLoader.load(
        url,
        (buffer) => {
          if (!this.audioObject.sound) {
            reject(new Error('Audio not initialized'));
            return;
          }

          this.audioObject.sound.setBuffer(buffer);
          this.audioObject.sound.setLoop(false);
          this.audioObject.sound.setVolume(1.0);
          this.audioObject.isAudioLoaded = true;
          resolve();
        },
        undefined,
        (err) => {
          console.error('Error loading audio file:', err);
          reject(err);
        }
      );
    });
  }

  // Add validation helper
  private validateAudioState(): void {
    if (!this.audioObject.audioCtx) throw new AudioManagerError('AudioContext not initialized');

    if (this.audioObject.audioCtx.state === 'closed')
      throw new AudioManagerError('AudioContext is closed');

    if (!this.audioObject.listener) throw new AudioManagerError('AudioListener not initialized');
  }

  public async playPauseAudio(): Promise<boolean> {
    try {
      this.validateAudioState();

      if (!this.audioObject.sound) throw new AudioManagerError('Sound not initialized');

      if (this.audioObject.sound.isPlaying) {
        this.audioObject.sound.pause();
      } else if (!this.audioObject.sound.isPlaying && this.audioObject.isAudioLoaded) {
        if (this.audioObject.audioCtx!.state === 'suspended') {
          await this.audioObject.audioCtx!.resume();
        }
        this.audioObject.sound.play();
        this.audioObject.sound.started = true;
      } else {
        return false;
      }

      this.audioObject.essentiaNode?.port.postMessage({
        isPlaying: this.audioObject.sound.isPlaying,
      });

      return this.audioObject.sound.isPlaying;
    } catch (error) {
      if (error instanceof AudioManagerError) throw error;

      throw new AudioManagerError(
        `Playback error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public stopAudio(): void {
    if (!this.audioObject.sound) {
      console.warn('Audio not initialized');
      return;
    }

    this.audioObject.sound.stop();
    this.audioObject.sound.started = false;
    this.audioObject.essentiaNode?.port.postMessage({ isPlaying: false });
  }

  // Helper method to check audio state
  /** @unused */
  // private isAudioInitialized(): boolean {
  //   return !!(
  //     this.audioObject.sound &&
  //     this.audioObject.audioCtx &&
  //     this.audioObject.listener
  //   )
  // }

  public startMicRecordStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        reject(new Error('getUserMedia not supported'));
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(async (stream) => {
          try {
            this.audioObject.gumStream = stream;

            if (this.audioObject.audioCtx?.state === 'suspended') {
              await this.audioObject.audioCtx.resume();
              console.log('Audio Context resumed successfully');
            }

            if (!this.audioObject.listener || !this.audioObject.audioCtx) {
              throw new Error('Audio context or listener not initialized');
            }

            // Create a THREE.Audio object for the microphone
            this.audioObject.micSound = new THREE.Audio(this.audioObject.listener);
            this.audioObject.micSound.setMediaStreamSource(stream);
            this.audioObject.micNode = this.audioObject.audioCtx.createMediaStreamSource(stream);

            // Detach for manual connections
            this.audioObject.micSound.getOutput().disconnect();

            // Create mic analyser
            this.audioObject.micAnalyser = new THREE.AudioAnalyser(
              this.audioObject.micSound,
              this.audioObject.fftSize
            );

            // Create zero gain node to prevent feedback
            const zeroGainNode = this.audioObject.audioCtx.createGain();
            zeroGainNode.gain.setValueAtTime(0, this.audioObject.audioCtx.currentTime);

            // Connect audio pipeline
            if (!this.audioObject.essentiaNode) {
              throw new Error('Essentia node not initialized');
            }

            this.audioObject.micSound
              .getOutput()
              .connect(this.audioObject.essentiaNode)
              .connect(zeroGainNode)
              .connect(this.audioObject.audioCtx.destination);

            // Update essentia node
            this.audioObject.essentiaNode.port.postMessage({
              isPlaying: this.audioObject.sound?.isPlaying ?? false,
              micActive: this.audioObject.gumStream?.active ?? false,
            });

            resolve();
          } catch (error) {
            this.cleanupMicStream();
            reject(error);
          }
        })
        .catch((err) => {
          console.error('Error accessing microphone:', err);
          reject(err);
        });
    });
  }

  public stopMicRecordStream(): void {
    this.cleanupMicStream();

    this.audioObject.essentiaNode?.port.postMessage({
      isPlaying: this.audioObject.sound?.isPlaying ?? false,
      micActive: false,
    });
  }

  private cleanupMicStream(): void {
    if (this.audioObject.gumStream) {
      this.audioObject.gumStream.getAudioTracks().forEach((track) => track.stop());
      this.audioObject.micNode?.disconnect();
      this.audioObject.micAnalyser = null;
      this.audioObject.gumStream = null;
      this.audioObject.micSound = null;
    }
  }

  // Optional: Debug method for checking mic levels
  /** @unused */
  // private checkMicInputLevels(): boolean {
  //   if (!this.audioObject.micAnalyser) return false

  //   const data = this.audioObject.micAnalyser.getFrequencyData()
  //   return data.some(value => value > 0)
  // }

  private combineFrequencyData(freqData1: Uint8Array, freqData2: Uint8Array): Uint8Array {
    // Pre-allocate the result array for better performance
    const result = new Uint8Array(freqData1.length);
    for (let i = 0; i < freqData1.length; i++) {
      result[i] = Math.sqrt(freqData1[i] ** 2 + freqData2[i] ** 2);
    }
    return result;
  }

  private audioAnalysis(): AudioAnalysisResult {
    const soundIsActive = this.audioObject.sound?.isPlaying ?? false;
    const micIsActive = this.audioObject.gumStream?.active ?? false;

    // Get sound data if active
    let inputFileData = null;
    if (soundIsActive && this.audioObject.analyser) {
      inputFileData = {
        amplitude: this.audioObject.analyser.getAverageFrequency(),
        freq: this.audioObject.analyser.getFrequencyData(),
      };
    }

    // Get mic data if active
    let micData = null;
    if (micIsActive && this.audioObject.micAnalyser) {
      micData = {
        amplitude: this.audioObject.micAnalyser.getAverageFrequency(),
        freq: this.audioObject.micAnalyser.getFrequencyData(),
      };
    }

    // Calculate final values
    if (inputFileData && micData) {
      const avgAmplitude = Math.sqrt(inputFileData.amplitude ** 2 + micData.amplitude ** 2);
      this.finalFreqData = this.combineFrequencyData(inputFileData.freq, micData.freq);
      return { avgAmplitude, freqData: this.finalFreqData };
    }

    // Single source handling
    const activeData = inputFileData || micData;

    // Return zero values if no active data
    if (!activeData) {
      return {
        avgAmplitude: 0,
        freqData: new Uint8Array(this.audioObject.fftSize / 2),
      };
    }

    this.finalFreqData.set(activeData.freq);
    return {
      avgAmplitude: activeData.amplitude,
      freqData: this.finalFreqData,
    };
  }

  public processAudioData(
    gpgpu: GPGPUComputation,
    particlesRef: React.RefObject<ParticlesRef>,
    showDebug = false
  ): void {
    const soundIsActive = this.audioObject.sound?.isPlaying ?? false;
    const micIsActive = this.audioObject.gumStream?.active ?? false;
    const soundIsStopped = !this.audioObject.sound?.started || true;

    // Reset when both sources are inactive AND sound is stopped
    if (!soundIsActive && !micIsActive && soundIsStopped) {
      gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data.fill(0);
      gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.fill(0);
      gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
      gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
      gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = 0;
      gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
      particlesRef.current?.updateUniforms({ uAverageAmplitude: 0 });
      return;
    }

    // Only process audio if there's an active source
    if (!soundIsActive && !micIsActive) return;

    // Process audio data only when active
    if (this.audioObject.audioReader?.available_read() >= 1) {
      const read = this.audioObject.audioReader.dequeue(gpgpu.essentiaData);
      if (read !== 0) {
        gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data.set(gpgpu.essentiaData);
        gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
      }
    }

    const { avgAmplitude, freqData } = this.audioAnalysis();

    // Update GPGPU uniforms
    gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    particlesRef.current?.updateUniforms({ uAverageAmplitude: avgAmplitude });

    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;

    // Debug logging
    if (showDebug) {
      console.log('Audio Data:', {
        averageAmplitude: gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value,
        tDataArray: Array.from(
          gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data
        ),
        tPitches: Array.from(gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data),
      });
    }
  }

  private async URLFromFiles(files: string[]): Promise<string> {
    try {
      const texts = await Promise.all(
        files.map((file) => fetch(file).then((response) => response.text()))
      );

      // Add the exports hack at the beginning
      texts.unshift('var exports = {};');

      const concatenatedCode = texts.join('\n');
      const blob = new Blob([concatenatedCode], { type: 'application/javascript' });
      return URL.createObjectURL(blob);
    } catch (error) {
      throw new AudioWorkletError(
        `Failed to concatenate worklet files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public async loadAudioWorklet(): Promise<void> {
    try {
      this.validateAudioState();

      if (this.audioObject.essentiaNode) {
        console.log('AudioWorkletProcessor is already registered');
        return;
      }

      const workletProcessorCode = [
        './lib/essentia-wasm.umd.js',
        './lib/essentia.js-core.umd.js',
        './lib/audio-data-processor.js',
        './lib/ringbuf.js',
      ];

      const concatenatedCode = await this.URLFromFiles(workletProcessorCode);
      await this.audioObject.audioCtx!.audioWorklet.addModule(concatenatedCode);
    } catch (error) {
      if (error instanceof AudioManagerError) throw error;

      throw new AudioWorkletError(
        `Failed to load audio worklet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public setupAudioGraph(): void {
    try {
      this.validateAudioState();

      const { audioCtx } = this.audioObject;
      if (!audioCtx) throw new AudioManagerError('AudioContext not initialized');

      if (!window.exports) {
        throw new Error('RingBuffer exports not found');
      }

      // Create SharedArrayBuffer using RingBuffer's helper method
      const sab = window.exports.RingBuffer.getStorageForCapacity(
        this.audioObject.capacity,
        Float32Array
      );

      const rb = new window.exports.RingBuffer(sab, Float32Array);
      this.audioObject.audioReader = new window.exports.AudioReader(rb);

      // Create and configure AudioWorkletNode
      this.audioObject.essentiaNode = new AudioWorkletNode(audioCtx, 'audio-data-processor', {
        processorOptions: {
          bufferSize: this.audioObject.fftSize,
          sampleRate: audioCtx.sampleRate,
          capacity: this.audioObject.capacity,
        } satisfies AudioWorkletOptions,
      });

      // Setup error handling for AudioWorkletNode
      this.audioObject.essentiaNode.port.onmessageerror = (event: MessageEvent) => {
        console.error('AudioWorkletNode message error:', event);
      };

      // Initialize audio processing state
      try {
        this.audioObject.essentiaNode.port.postMessage({
          sab,
          isPlaying: this.audioObject.sound?.isPlaying ?? false,
          micActive: this.audioObject.gumStream?.active ?? false,
        });
      } catch (error) {
        throw new AudioWorkletError(
          `SharedArrayBuffer transfer failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Connect audio nodes
      if (this.audioObject.sound) {
        this.audioObject.sound.getOutput().connect(this.audioObject.essentiaNode);
        console.log('Sound output connected to Essentia Node');
      }

      // Create and connect gain node
      this.audioObject.gain = audioCtx.createGain();
      if (!this.audioObject.essentiaNode)
        throw new AudioManagerError('Essentia Node not initialized');

      this.audioObject.essentiaNode.connect(this.audioObject.gain);
      console.log('Essentia Node connected to Gain');

      this.audioObject.gain.connect(audioCtx.destination);
      console.log('Gain connected to Destination');
    } catch (error) {
      if (error instanceof AudioManagerError) throw error;

      throw new AudioManagerError(
        `Failed to setup audio graph: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public async startAudioProcessing(): Promise<void> {
    try {
      await this.loadAudioWorklet();
      this.setupAudioGraph();
    } catch (error) {
      console.error('Error starting audio processing:', error);
      throw error;
    }
  }

  public cleanupAudioGraph(): void {
    // Disconnect and cleanup audio nodes
    this.audioObject.essentiaNode?.disconnect();
    this.audioObject.gain?.disconnect();

    // Cleanup references
    this.audioObject.essentiaNode = null;
    this.audioObject.gain = null;
    this.audioObject.audioReader = null;
  }

  // Add method to check audio system health
  public checkAudioSystem(): {
    isReady: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (!this.audioObject.audioCtx) issues.push('AudioContext not initialized');
    else if (this.audioObject.audioCtx.state === 'suspended')
      issues.push('AudioContext is suspended');

    if (!this.audioObject.listener) issues.push('AudioListener not initialized');

    if (!this.audioObject.essentiaNode) issues.push('AudioWorklet not initialized');

    return {
      isReady: issues.length === 0,
      issues,
    };
  }

  // Add state management methods
  public getAudio() {
    return {
      isPlaying: this.audioObject.sound?.isPlaying ?? false,
      isAudioLoaded: this.audioObject.isAudioLoaded,
      isMicActive: this.audioObject.gumStream?.active ?? false,
      isAudioContextRunning: this.audioObject.audioCtx?.state === 'running',
      isWorkletReady: !!this.audioObject.essentiaNode,
      fftSize: this.audioObject.fftSize,
      sampleRate: this.audioObject.audioCtx?.sampleRate ?? 44100,
      averageAmplitude: this.audioObject.analyser?.getAverageFrequency() ?? 0,
      capacity: this.audioObject.capacity,
      analyser: this.audioObject.analyser,
      audioCtx: this.audioObject.audioCtx,
      sound: this.audioObject.sound,
      data: this.audioObject.analyser?.data ?? new Uint8Array(this.audioObject.fftSize / 2),
    };
  }

  public async resumeAudioContext(): Promise<void> {
    try {
      this.validateAudioState();
      const { audioCtx } = this.audioObject;
      if (!audioCtx) throw new AudioManagerError('AudioContext not initialized');

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch (error) {
      throw new AudioManagerError(
        `Failed to resume AudioContext: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  public subscribeToAudio(callback: (state: ReturnType<typeof this.getAudio>) => void): () => void {
    const interval = setInterval(() => {
      callback(this.getAudio());
    }, 100); // Update every 100ms

    return () => clearInterval(interval);
  }
}

export const audioManager = new AudioManager();
