// Core
export {
  createAudioSession,
  getDefaultAudioSession,
  attachAudio,
  loadAudio,
  playPauseAudio,
  stopAudio,
  setAudioVolume,
  setAudioMuted,
  setMicSettings,
  startMicRecordStream,
  stopMicRecordStream,
  setAudioEndedCallback,
  getIsAudioLoaded,
  getAnalysisState,
  getStatus,
  getMicSettings,
  readClockSnapshot,
  readAnalysisSnapshot,
  disposeAudio,
} from "./core/audio/audioSetup.js";
export {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "./visualization/types.js";
export { createVisualizationRuntime } from "./visualization/runtimeFactory.js";

// Three
export * from "./three/loaders/setupLoaders.js";

// Utils
export {
  createAudioFeatureState,
  buildAudioFeatureFrame,
} from "./utils/audioFeatures.js";
export { AudioControlsView } from "./react/AudioControlsView.jsx";
export { useSharedAudioLogic } from "./react/useSharedAudioLogic.js";
export {
  CONTROL_DEFINITIONS,
  CONTROL_HANDLERS,
  CONTROL_STATUSES,
  CONTROL_TARGET_TYPES,
  createControlState,
  getControlFolders,
  getControlsForFolder,
  getControlsForMethod,
} from "./controls/schema.js";
export { auditControlSchema } from "./controls/audit.js";
export {
  serializeControls,
  deserializeControls,
  createPreset,
} from "./controls/persistence.js";
export {
  CONTROL_RUNTIME_COVERAGE,
  applyAudioControls,
  applySimulationControls,
  applySharedControls,
  applyRaymarchControls,
  applyVisualizationControls,
  applyBloomControls,
  applyAuditControls,
  applySceneControls,
  buildControlInspectionSnapshot,
} from "./controls/runtime.js";

// Constants
export * from "./defaults.js";
