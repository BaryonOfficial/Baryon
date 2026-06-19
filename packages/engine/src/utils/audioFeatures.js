export {
  createAudioFeatureState,
  buildAudioFeatureFrame,
  buildAudioFeatureAnalysisSnapshot,
  buildCurrentAudioFeatureAnalysisResult,
  buildFastSignalPatchedAudioFeatureAnalysisResult,
  composeAudioFeatureFrame,
  prepareAudioFeatureFrameInputs,
  runHeavyAudioFeatureAnalysis,
  updateAudioFeatureFastSignalState,
  updateAudioFeatureStructuralState,
  updateAudioFeatureChromaState,
  updateAudioFeatureTempoState,
} from "./audio/buildFeatureFrame.js";
export { buildAnalysisSessionKey } from "./audio/analysisSession.js";
export {
  reviveSerializedReplayFrame,
  reviveSerializedReplayFrames,
} from "./audio/replayFixture.js";
export {
  buildAudioFeatureTransportFrame,
  createAudioFeatureEngine,
  createNoopAudioFeatureEngine,
  DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS,
  normalizeAudioFeatureEngineSettings,
} from "./audio/audioFeatureEngine.js";
