// Core
export {
  createAudioSession,
  getDefaultAudioSession,
  attachAudio,
  loadAudio,
  loadStream,
  playPauseAudio,
  stopAudio,
  getTransportState,
  seekTo,
  setAudioVolume,
  setAudioMuted,
  setLiveInputSettings,
  startLiveInputStream,
  stopLiveInputStream,
  setAudioEndedCallback,
  getIsAudioLoaded,
  getAnalysisState,
  getStatus,
  getLiveInputSettings,
  getLiveInputAnalysisSettings,
  readClockSnapshot,
  readAnalysisSnapshot,
  disposeAudio,
} from "./core/audio/audioSetup.js";
export {
  LIVE_INPUT_ANALYSIS_CLASSES,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  normalizeLiveInputAnalysisClass,
  normalizeLiveInputAnalysisOverrides,
  isLikelyLineFeedDeviceLabel,
  resolveLiveInputAnalysisClass,
} from "./core/audio/liveInputAnalysis.js";
export {
  DEFAULT_VISUALIZATION_METHOD,
  VISUALIZATION_METHODS,
} from "./visualization/types.js";
export {
  RAYMARCH_FIELD_CACHE_OVERRIDE_MODES,
  normalizeRaymarchFieldCacheOverride,
  resolveRaymarchFieldCacheOverride,
} from "./visualization/fieldEvaluation.js";
export { createVisualizationRuntime } from "./visualization/runtimeFactory.js";

// Three
export * from "./three/loaders/setupLoaders.js";

// Utils
export {
  createAudioFeatureState,
  buildAudioFeatureFrame,
  createAudioFeatureAnalyzer,
  createAudioFeatureEngine,
  createNoopAudioFeatureAnalyzer,
  createNoopAudioFeatureEngine,
  DEFAULT_FEATURE_ANALYSIS_SETTINGS,
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
  applyOutputControls,
  applyRaymarchControls,
  applyVisualizationControls,
  applyBloomControls,
  applyAuditControls,
  applySceneControls,
  buildControlInspectionSnapshot,
} from "./controls/runtime.js";

// Constants
export * from "./defaults.js";
