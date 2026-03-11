// Core
export {
  createAudioSession,
  getDefaultAudioSession,
  attachAudio,
  loadAudio,
  playPauseAudio,
  stopAudio,
  startMicRecordStream,
  stopMicRecordStream,
  setAudioEndedCallback,
  getIsAudioLoaded,
  getAnalysisState,
  getStatus,
  readClockSnapshot,
  readAnalysisSnapshot,
  disposeAudio,
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
export { createAudioFeatureState, buildAudioFeatureFrame } from './utils/audioFeatures.js';
export { AudioControlsView } from './react/AudioControlsView.jsx';
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
  CONTROL_RUNTIME_COVERAGE,
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
