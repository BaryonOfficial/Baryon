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
export {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from './visualization/types.js';
export { createVisualizationRuntime } from './visualization/runtimeFactory.js';

// Three
export * from './three/loaders/setupLoaders.js';

// Utils
export * from './utils/timeHandler.js';
export { findFFTPeaks } from './utils/fftPeaks.js';
export { createAudioFeatureState, buildAudioFeatureFrame } from './utils/audioFeatures.js';
export { useSharedAudioLogic } from './react/useSharedAudioLogic.js';
export {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
  getControlsForMethod,
} from './controls/schema.js';
export { auditControlSchema } from './controls/audit.js';
export {
  applySimulationControls,
  applySharedControls,
  applyParticleControls,
  applyBloomControls,
  applyAuditControls,
  applySceneControls,
  applyParticleSceneControls,
  buildControlInspectionSnapshot,
} from './controls/runtime.js';

// Constants
export * from './defaults.js';
