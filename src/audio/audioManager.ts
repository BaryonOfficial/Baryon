import * as THREE from 'three';
import { Camera } from '@react-three/fiber';
import type { ParticlesRef } from '@/types/particle.types';
import type { GPGPUComputation } from '@/types/gpgpu.types';
import { AudioManagerError, AudioWorkletError } from '@/types/audio.types';
import type { AudioObject, AudioAnalysisResult, AudioWorkletOptions } from '@/types/audio.types';

/**
 * Manages audio processing and analysis using Web Audio API and AudioWorklet.
 * Handles both file playback and microphone input with real-time audio analysis.
 *
 * Features:
 * - Audio file playback with FFT analysis
 * - Microphone input processing
 * - Real-time audio visualization data
 * - Multi-source mixing (file + mic)
 * - AudioWorklet-based processing
 */
export class AudioManager {
  private audioObject: AudioObject;
  private finalFreqData: Uint8Array;
  private objectUrls = new Set<string>();
  private static registeredWorklets = new WeakMap<BaseAudioContext, boolean>();
  private static readonly WORKLET_NAME = 'audio-data-processor';
  private static readonly WORKLET_FILES = [
    './lib/essentia-wasm.umd.js',
    './lib/essentia.js-core.umd.js',
    './lib/audio-data-processor.js',
    './lib/ringbuf.js',
  ] as const;

  private registrationPromise: Promise<void> | null = null;

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

  /**
   * Initializes the audio system with a camera for spatial audio.
   * @param camera - The camera to attach the audio listener to
   */
  public setup(camera: Camera): void {
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

  /**
   * Sets up a callback to be called when audio playback ends.
   * @param callback - Function to be called when audio ends
   */
  public setAudioEndedCallback(callback: () => void): void {
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

  /**
   * Loads an audio file from the given URL.
   * @param url - URL of the audio file to load
   * @throws {Error} If audio is not initialized or file loading fails
   */
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
  /** @unused */
  // private isAudioInitialized(): boolean {
  //   return !!(
  //     this.audioObject.sound &&
  //     this.audioObject.audioCtx &&
  //     this.audioObject.listener
  //   )
  // }

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
    const { sound, analyser, gumStream, micAnalyser } = this.audioObject;
    const soundIsActive = sound?.isPlaying ?? false;
    const micIsActive = gumStream?.active ?? false;

    // Get sound data if active
    let inputFileData = null;
    if (soundIsActive && analyser) {
      inputFileData = {
        amplitude: analyser.getAverageFrequency(),
        freq: analyser.getFrequencyData(),
      };
    }

    // Get mic data if active
    let micData = null;
    if (micIsActive && micAnalyser) {
      micData = {
        amplitude: micAnalyser.getAverageFrequency(),
        freq: micAnalyser.getFrequencyData(),
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

  /**
   * Processes audio data and updates GPGPU uniforms for visualization.
   * @param gpgpu - GPGPU computation instance
   * @param particlesRef - Reference to particle system
   * @param showDebug - Whether to show debug information
   */
  public processAudioData(
    gpgpu: GPGPUComputation,
    particlesRef: React.RefObject<ParticlesRef>,
    showDebug = false
  ): void {
    if (!gpgpu || !gpgpu.essentiaData) {
      console.warn('GPGPU not properly initialized');
      return;
    }

    const { sound, gumStream, audioReader } = this.audioObject;
    const soundIsActive = sound?.isPlaying ?? false;
    const micIsActive = gumStream?.active ?? false;
    const soundIsStopped = !sound?.started || true;

    // Reset when both sources are inactive AND sound is stopped
    if (!soundIsActive && !micIsActive && soundIsStopped) {
      this.resetGPGPUState(gpgpu, particlesRef);
      return;
    }

    // Only process audio if there's an active source
    if (!soundIsActive && !micIsActive) return;

    try {
      // Process audio data only when active
      if (audioReader && audioReader.available_read() >= 1) {
        const read = audioReader.dequeue(gpgpu.essentiaData);
        if (read && read !== 0) {
          this.updateGPGPUPitches(gpgpu);
        }
      }

      const { avgAmplitude, freqData } = this.audioAnalysis();
      this.updateGPGPUAmplitudes(gpgpu, particlesRef, avgAmplitude, freqData);

      if (showDebug) {
        this.logDebugInfo(gpgpu);
      }
    } catch (error) {
      console.error('Error processing audio data:', error);
      // Attempt recovery by resetting state
      this.resetGPGPUState(gpgpu, particlesRef);
    }
  }

  private resetGPGPUState(
    gpgpu: GPGPUComputation,
    particlesRef: React.RefObject<ParticlesRef>
  ): void {
    gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data.fill(0);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.fill(0);
    gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
    gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = 0;
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = 0;
    particlesRef.current?.updateUniforms({ uAverageAmplitude: 0 });
  }

  private updateGPGPUPitches(gpgpu: GPGPUComputation): void {
    gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data.set(gpgpu.essentiaData);
    gpgpu.audioDataVariable.material.uniforms.tPitches.value.needsUpdate = true;
  }

  private updateGPGPUAmplitudes(
    gpgpu: GPGPUComputation,
    particlesRef: React.RefObject<ParticlesRef>,
    avgAmplitude: number,
    freqData: Uint8Array
  ): void {
    gpgpu.zeroPointsVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value = avgAmplitude;
    particlesRef.current?.updateUniforms({ uAverageAmplitude: avgAmplitude });

    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data.set(freqData);
    gpgpu.audioDataVariable.material.uniforms.tDataArray.value.needsUpdate = true;
  }

  private logDebugInfo(gpgpu: GPGPUComputation): void {
    console.log('Audio Data:', {
      averageAmplitude: gpgpu.particlesVariable.material.uniforms.uAverageAmplitude.value,
      tDataArray: Array.from(gpgpu.audioDataVariable.material.uniforms.tDataArray.value.image.data),
      tPitches: Array.from(gpgpu.audioDataVariable.material.uniforms.tPitches.value.image.data),
    });
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
      const url = URL.createObjectURL(blob);
      this.objectUrls.add(url);
      return url;
    } catch (error) {
      throw new AudioWorkletError(
        `Failed to concatenate worklet files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private cleanupObjectUrls(): void {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000,
    onRetry?: (attempt: number, error: Error, nextDelay: number) => void
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) break;

        // Calculate next delay before callback
        const nextDelay = delay * 2;

        // Allow external retry monitoring
        onRetry?.(attempt, lastError, nextDelay);

        // Log retry attempt (could move this to default onRetry)
        console.warn(
          `Worklet registration attempt ${attempt} failed:`,
          lastError.message,
          `- Retrying in ${delay}ms`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = nextDelay;
      }
    }

    throw new AudioWorkletError(
      `Failed to register worklet after ${maxAttempts} attempts: ${lastError?.message}`
    );
  }

  private async ensureWorkletRegistered(context: BaseAudioContext): Promise<void> {
    // If there's an ongoing registration, wait for it
    if (this.registrationPromise) {
      try {
        await this.registrationPromise;
        return;
      } catch (error) {
        console.warn('Previous registration failed, retrying:', error);
        this.registrationPromise = null;
        AudioManager.registeredWorklets.delete(context);
      }
    }

    const registration = AudioManager.registeredWorklets.get(context);
    if (registration === true) return;

    // Create a new registration promise with retry logic
    this.registrationPromise = (async () => {
      try {
        await this.retryWithBackoff(
          async () => {
            const concatenatedCode = await this.URLFromFiles([...AudioManager.WORKLET_FILES]);
            await context.audioWorklet.addModule(concatenatedCode);
            AudioManager.registeredWorklets.set(context, true);
            this.cleanupObjectUrls();
          },
          3,
          1000,
          (attempt, error, nextDelay) => {
            // Could emit analytics/metrics here
            console.debug(`Retry ${attempt}: ${error.message}, next delay: ${nextDelay}ms`);
          }
        );
      } catch (error) {
        AudioManager.registeredWorklets.delete(context);
        this.cleanupObjectUrls();
        throw error;
      } finally {
        this.registrationPromise = null;
      }
    })();

    await this.registrationPromise;
  }

  private async cleanupNodes(): Promise<void> {
    if (this.audioObject.essentiaNode) {
      this.audioObject.essentiaNode.port.onmessageerror = null;
      this.audioObject.essentiaNode.disconnect();
    }
    this.audioObject.gain?.disconnect();
  }

  private cleanupReferences(): void {
    this.audioObject.essentiaNode = null;
    this.audioObject.gain = null;
    this.audioObject.audioReader = null;
  }

  public async cleanupAudioGraph(): Promise<void> {
    const errors: Error[] = [];

    try {
      await this.cleanupNodes();
    } catch (error) {
      errors.push(
        new AudioManagerError(
          `Failed to cleanup nodes: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }

    try {
      this.cleanupReferences();
    } catch (error) {
      errors.push(
        new AudioManagerError(
          `Failed to cleanup references: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }

    try {
      this.cleanupObjectUrls();
    } catch (error) {
      errors.push(
        new AudioManagerError(
          `Failed to cleanup object URLs: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }

    if (errors.length > 0) {
      throw new AudioManagerError(
        `Cleanup failed with ${errors.length} errors: ${errors.map((e) => e.message).join(', ')}`
      );
    }
  }

  /**
   * Validates the current state of the audio system.
   * @throws {AudioManagerError} If the audio system is in an invalid state
   */
  private validateAudioState(): void {
    const issues: string[] = [];

    if (!this.audioObject.audioCtx) {
      issues.push('AudioContext not initialized');
    } else if (this.audioObject.audioCtx.state === 'closed') {
      issues.push('AudioContext is closed');
    }

    if (!this.audioObject.listener) {
      issues.push('AudioListener not initialized');
    }

    if (issues.length > 0) {
      throw new AudioManagerError(`Invalid audio state: ${issues.join(', ')}`);
    }
  }

  public async loadAudioWorklet(): Promise<void> {
    try {
      this.validateAudioState();
      const { audioCtx } = this.audioObject;

      if (!audioCtx) {
        throw new AudioManagerError('AudioContext not initialized');
      }

      // If we already have a node, no need to proceed
      if (this.audioObject.essentiaNode) {
        return;
      }

      // Ensure worklet is registered for this context
      await this.ensureWorkletRegistered(audioCtx);

      // Create new audio graph
      await this.setupAudioGraph();
    } catch (error) {
      await this.cleanupAudioGraph();
      throw new AudioWorkletError(
        `Failed to load audio worklet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async setupAudioGraph(): Promise<void> {
    try {
      this.validateAudioState();
      const { audioCtx } = this.audioObject;

      if (!audioCtx) {
        throw new AudioManagerError('AudioContext not initialized');
      }

      if (!window.exports?.RingBuffer) {
        throw new AudioManagerError('RingBuffer exports not found');
      }

      // Clean up existing nodes before creating new ones
      await this.cleanupAudioGraph();

      // Create SharedArrayBuffer using RingBuffer's helper method
      const sab = window.exports.RingBuffer.getStorageForCapacity(
        this.audioObject.capacity,
        Float32Array
      );

      const rb = new window.exports.RingBuffer(sab, Float32Array);
      this.audioObject.audioReader = new window.exports.AudioReader(rb);

      // Create and configure AudioWorkletNode
      this.audioObject.essentiaNode = new AudioWorkletNode(audioCtx, AudioManager.WORKLET_NAME, {
        processorOptions: {
          bufferSize: this.audioObject.fftSize,
          sampleRate: audioCtx.sampleRate,
          capacity: this.audioObject.capacity,
        } satisfies AudioWorkletOptions,
      });

      // Setup error handling for AudioWorkletNode
      this.audioObject.essentiaNode.port.onmessageerror = this.handleWorkletError;

      // Initialize audio processing state
      await this.initializeAudioProcessing(sab);

      // Create and connect audio graph
      await this.connectAudioGraph();
    } catch (error) {
      await this.cleanupAudioGraph();
      throw error;
    }
  }

  private handleWorkletError = (event: MessageEvent): void => {
    console.error('AudioWorkletNode message error:', event);
    // Optionally trigger a reconnection or cleanup here
  };

  private async initializeAudioProcessing(sab: SharedArrayBuffer): Promise<void> {
    const { essentiaNode, sound, gumStream } = this.audioObject;

    if (!essentiaNode) {
      throw new AudioManagerError('Essentia Node not initialized');
    }

    try {
      essentiaNode.port.postMessage({
        sab,
        isPlaying: sound?.isPlaying ?? false,
        micActive: gumStream?.active ?? false,
      });
    } catch (error) {
      throw new AudioWorkletError(
        `SharedArrayBuffer transfer failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async connectAudioGraph(): Promise<void> {
    const { audioCtx, sound, essentiaNode } = this.audioObject;

    if (!audioCtx || !essentiaNode) {
      throw new AudioManagerError('Audio system not properly initialized');
    }

    try {
      // Connect sound output if available
      if (sound) {
        sound.getOutput().connect(essentiaNode);
      }

      // Create and connect gain node
      this.audioObject.gain = audioCtx.createGain();
      essentiaNode.connect(this.audioObject.gain);
      this.audioObject.gain.connect(audioCtx.destination);
    } catch (error) {
      throw new AudioManagerError(
        `Failed to connect audio graph: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Starts the audio processing pipeline.
   * @throws {AudioManagerError} If initialization fails
   */
  public async startAudioProcessing(): Promise<void> {
    try {
      await this.loadAudioWorklet();
    } catch (error) {
      console.error('Error starting audio processing:', error);
      await this.cleanupAudioGraph();

      // If it's already a known error type, rethrow it
      if (error instanceof AudioManagerError) {
        throw error;
      }

      throw new AudioManagerError(
        `Failed to start audio processing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Resumes the audio context if it's suspended.
   * @throws {AudioManagerError} If resume fails
   */
  public async resumeAudioContext(): Promise<void> {
    try {
      this.validateAudioState();
      const { audioCtx } = this.audioObject;

      if (!audioCtx) {
        throw new AudioManagerError('AudioContext not initialized');
      }

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch (error) {
      throw new AudioManagerError(
        `Failed to resume AudioContext: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Checks the health of the audio system.
   * @returns Object containing system health status
   */
  public checkAudioSystem(): {
    isReady: boolean;
    issues: string[];
  } {
    const { audioCtx, listener, essentiaNode } = this.audioObject;
    const issues: string[] = [];

    if (!audioCtx) {
      issues.push('AudioContext not initialized');
    } else if (audioCtx.state === 'suspended') {
      issues.push('AudioContext is suspended');
    } else if (audioCtx.state === 'closed') {
      issues.push('AudioContext is closed');
    }

    if (!listener) {
      issues.push('AudioListener not initialized');
    }

    if (!essentiaNode) {
      issues.push('AudioWorklet not initialized');
    }

    return {
      isReady: issues.length === 0,
      issues,
    };
  }

  /**
   * Gets the current state of the audio system.
   * @returns Current audio system state
   */
  public getAudio() {
    const { sound, isAudioLoaded, gumStream, audioCtx, essentiaNode, fftSize, analyser, capacity } =
      this.audioObject;

    return {
      isPlaying: sound?.isPlaying ?? false,
      isAudioLoaded,
      isMicActive: gumStream?.active ?? false,
      isAudioContextRunning: audioCtx?.state === 'running',
      isWorkletReady: !!essentiaNode,
      fftSize,
      sampleRate: audioCtx?.sampleRate ?? 44100,
      averageAmplitude: analyser?.getAverageFrequency() ?? 0,
      capacity,
      analyser,
      audioCtx,
      sound,
      data: analyser?.data ?? new Uint8Array(fftSize / 2),
    };
  }

  /**
   * Starts recording from the microphone.
   * @throws {AudioManagerError} If microphone access fails
   */
  public startMicRecordStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        reject(new AudioManagerError('getUserMedia not supported'));
        return;
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          this.setupMicrophoneStream(stream)
            .then(() => resolve())
            .catch((error) => {
              this.cleanupMicStream();
              reject(
                new AudioManagerError(
                  `Microphone access failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                )
              );
            });
        })
        .catch((error) => {
          this.cleanupMicStream();
          reject(
            new AudioManagerError(
              `Microphone access failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        });
    });
  }

  /**
   * Sets up the microphone stream with proper audio routing.
   */
  private async setupMicrophoneStream(stream: MediaStream): Promise<void> {
    try {
      this.validateAudioState();
      const { audioCtx, listener } = this.audioObject;

      if (!audioCtx || !listener) {
        throw new AudioManagerError('Audio context or listener not initialized');
      }

      this.audioObject.gumStream = stream;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Create a THREE.Audio object for the microphone
      this.audioObject.micSound = new THREE.Audio(listener);
      this.audioObject.micSound.setMediaStreamSource(stream);
      this.audioObject.micNode = audioCtx.createMediaStreamSource(stream);

      // Detach for manual connections
      this.audioObject.micSound.getOutput().disconnect();

      // Create mic analyser
      this.audioObject.micAnalyser = new THREE.AudioAnalyser(
        this.audioObject.micSound,
        this.audioObject.fftSize
      );

      await this.setupMicrophoneRouting();
    } catch (error) {
      this.cleanupMicStream();
      throw error;
    }
  }

  /**
   * Sets up the audio routing for the microphone input.
   */
  private async setupMicrophoneRouting(): Promise<void> {
    const { audioCtx, micSound, essentiaNode } = this.audioObject;

    if (!audioCtx || !micSound || !essentiaNode) {
      throw new AudioManagerError('Audio system not properly initialized for microphone');
    }

    // Create zero gain node to prevent feedback
    const zeroGainNode = audioCtx.createGain();
    zeroGainNode.gain.setValueAtTime(0, audioCtx.currentTime);

    // Connect audio pipeline
    micSound.getOutput().connect(essentiaNode).connect(zeroGainNode).connect(audioCtx.destination);

    // Update essentia node
    essentiaNode.port.postMessage({
      isPlaying: this.audioObject.sound?.isPlaying ?? false,
      micActive: this.audioObject.gumStream?.active ?? false,
    });
  }

  /**
   * Stops microphone recording and cleans up resources.
   */
  public stopMicRecordStream(): void {
    this.cleanupMicStream();

    this.audioObject.essentiaNode?.port.postMessage({
      isPlaying: this.audioObject.sound?.isPlaying ?? false,
      micActive: false,
    });
  }

  /**
   * Cleans up microphone-related resources.
   */
  private cleanupMicStream(): void {
    if (this.audioObject.gumStream) {
      this.audioObject.gumStream.getAudioTracks().forEach((track) => track.stop());
      this.audioObject.micNode?.disconnect();
      this.audioObject.micAnalyser = null;
      this.audioObject.gumStream = null;
      this.audioObject.micSound = null;
    }
  }

  /**
   * Completely disposes of the audio manager and all its resources.
   * Call this when the manager is no longer needed.
   */
  public async dispose(): Promise<void> {
    try {
      // Stop all active audio
      this.stopAudio();
      this.stopMicRecordStream();

      // Clean up audio graph and resources
      await this.cleanupAudioGraph();

      // Clean up THREE.js audio resources
      if (this.audioObject.sound) {
        this.audioObject.sound.disconnect();
        this.audioObject.sound.buffer = null;
      }

      if (this.audioObject.analyser) {
        this.audioObject.analyser.analyser.disconnect();
      }

      if (this.audioObject.listener) {
        // Remove listener from camera if still attached
        this.audioObject.listener.parent?.remove(this.audioObject.listener);
        this.audioObject.listener.context.close();
      }

      // Clear all references
      const audioObject = this.audioObject;
      audioObject.audioReader = null;
      audioObject.gain = null;
      audioObject.essentiaNode = null;
      audioObject.soundGainNode = null;
      audioObject.audioCtx = null;
      audioObject.sound = null;
      audioObject.micSound = null;
      audioObject.analyser = null;
      audioObject.micAnalyser = null;
      audioObject.micNode = null;
      audioObject.gumStream = null;
      audioObject.listener = null;
      audioObject.isAudioLoaded = false;

      // Clear frequency data
      this.finalFreqData = new Uint8Array(0);

      // Clear registration state
      this.registrationPromise = null;
      AudioManager.registeredWorklets = new WeakMap();
    } catch (error) {
      console.error('Error during disposal:', error);
      throw new AudioManagerError(
        `Failed to dispose audio manager: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export const audioManager = new AudioManager();
