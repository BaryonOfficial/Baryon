// Core
export {
  createAudioContext,
  getDefaultAudioContext,
  loadAudio,
  playPauseAudio,
  stopAudio,
  startMicRecordStream,
  stopMicRecordStream,
  startAudioProcessing,
  setPitchSourceMode,
  setAudioInputMode,
  setAudioEndedCallback,
  processAudioData,
  getIsAudioLoaded,
  getAnalysisState,
  disposeAnalysis,
} from './core/audio/audioSetup.js';
export { setupTSL, tickTSL, disposeTSL } from './core/tslSetup.js';

// Three
export * from './three/loaders/setupLoaders.js';

// Utils
export * from './utils/timeHandler.js';
export { findFFTPeaks } from './utils/fftPeaks.js';
export { createAudioFeatureState, buildAudioFeatureFrame } from './utils/audioFeatures.js';
export { useSharedAudioLogic } from './react/useSharedAudioLogic.js';

// Constants
export * from './defaults.js';
