export { AppFrame } from "./App.jsx";
export { AudioProvider } from "./context/AudioProvider.jsx";
export {
  createPlaybackAudioCaptureStream,
  readPlaybackAudioCaptureStatus,
} from "./context/audioCapture.js";
export {
  AudioContext,
  AudioSceneContext,
  useAudio,
  useAudioScene,
} from "./context/AudioContext.jsx";
export {
  createLiveInputRuntimeStatus,
  getLiveInputStatusLabel,
  isLiveInputTransitionLocked,
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_SIGNAL_STATES,
} from "./context/liveInputRuntimeStatus.js";
export { default as SceneSurface } from "./components/ThreeScene.jsx";
export {
  BaryonScene,
  CAMERA_CONTROL_MODES,
} from "./components/BaryonScene.jsx";
export { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";
export { default as AdvancedControlsDock } from "./components/AdvancedControlsDock.jsx";
export { useFullscreenUiPreference } from "./components/hooks/useFullscreenUiPreference.js";
export { useFullscreen } from "./components/hooks/useFullScreenToggle.jsx";
export { OutputStageSurface } from "./components/OutputStageSurface.jsx";
export { ListenerControls } from "./components/AudioControls.jsx";
export { default as LiveInputStatusPanel } from "./components/LiveInputStatusPanel.jsx";
export {
  TOP_RIGHT_OVERLAY_DESKTOP_STACK_GAP,
  TOP_RIGHT_OVERLAY_PANEL_WIDTH,
} from "./components/topRightOverlayLayout.js";
export { default as FloatingCameraControls } from "./components/FloatingCameraControls.jsx";
export { default as PerformanceHud } from "./components/PerformanceHud.jsx";
export { resolvePreviewOverlayState } from "./components/threeSceneState.js";
export { composeAuthoritativePerformanceHudMetrics } from "./components/threeSceneState.js";
export { commitOrbitControlsCameraPose } from "./components/baryonSceneCameraSync.js";
export {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./components/rendererDiagnostics.js";
export { RendererErrorBoundary } from "./components/RendererErrorBoundary.jsx";
export { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
export {
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
  DEFAULT_LIVE_PERFORMER_CAMERA_POSE,
  resolveCameraPresetFromPose,
  resolvePresetCameraPose,
} from "./components/cameraPosePresets.js";
export {
  createCameraPresetCommand,
  createCameraResetCommand,
  deriveCameraControlState,
  normalizeCameraControlPreset,
} from "./components/cameraControlModel.js";
export { createControlsStore } from "./controls/controlsStore.js";
export { ControlsProvider } from "./controls/ControlsProvider.jsx";
export {
  dispatchControlsChanged,
  dispatchControlsCommand,
  subscribeControlsChanged,
  subscribeControlsCommand,
} from "./controls/controlsEvents.js";
export {
  useControlsActions,
  useControlsSnapshot,
  useControlsStore,
} from "./controls/useControlsStore.js";
