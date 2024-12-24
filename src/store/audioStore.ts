import { create } from 'zustand';
import { audioManager } from '@/audio/audioManager.ts';
import { AudioStore } from '@/types/audio.types.ts';
import { GPGPUComputation } from '@/types/gpgpu.types.ts';
import { ParticlesRef } from '@/types/particle.types.ts';
import type { RefObject } from 'react';

export const useAudioStore = create<AudioStore>((set, get) => ({
  // Initial state from audioManager
  ...audioManager.getAudio(),
  fileName: 'Upload Audio',
  error: null,

  loadFile: async (file) => {
    try {
      const fileURL = URL.createObjectURL(file);
      await audioManager.loadAudio(fileURL);
      set({ fileName: file.name, isAudioLoaded: true, isPlaying: false, error: null });
      URL.revokeObjectURL(fileURL); // Clean up the URL
    } catch (error) {
      console.error('Error loading audio:', error);
      set({
        fileName: 'Upload Audio',
        isAudioLoaded: false,
        error: error instanceof Error ? error.message : 'Failed to load audio',
      });
    }
  },

  togglePlayPause: async () => {
    try {
      const isNowPlaying = await audioManager.playPauseAudio();
      set({ isPlaying: isNowPlaying, error: null });
    } catch (error) {
      console.error('Error in play/pause:', error);
      set({
        isPlaying: false,
        error: error instanceof Error ? error.message : 'Failed to toggle playback',
      });
    }
  },

  stop: () => {
    try {
      audioManager.stopAudio();
      set({ isPlaying: false, error: null });
    } catch (error) {
      console.error('Error stopping audio:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to stop audio' });
    }
  },

  toggleMic: async () => {
    const { isMicActive } = get();

    try {
      if (isMicActive) {
        audioManager.stopMicRecordStream();
        set({ isMicActive: false, error: null });
      } else {
        await audioManager.startMicRecordStream();
        set({ isMicActive: true, error: null });
      }
    } catch (error) {
      console.error('Error toggling microphone:', error);
      set({
        isMicActive: false,
        error: error instanceof Error ? error.message : 'Failed to toggle microphone',
      });
      throw error; // Re-throw for UI handling if needed
    }
  },

  resumeAudioContext: async () => {
    try {
      await audioManager.resumeAudioContext();
      set({ ...audioManager.getAudio(), error: null });
    } catch (error) {
      console.error('Error resuming audio context:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to resume audio context' });
    }
  },

  setIsPlaying: (isPlaying: boolean) => {
    set({ isPlaying, error: null });
  },

  clearError: () => {
    set({ error: null });
  },

  processAudioData: (
    gpgpu: GPGPUComputation,
    particlesRef: RefObject<ParticlesRef>,
    showDebug?: boolean
  ) => {
    try {
      audioManager.processAudioData(gpgpu, particlesRef, showDebug);
    } catch (error) {
      console.error('Error processing audio data:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to process audio data' });
    }
  },
}));

// Subscribe to audio state changes
audioManager.subscribeToAudio((state) => {
  useAudioStore.setState((current) => ({
    ...current,
    ...state,
  }));
});
