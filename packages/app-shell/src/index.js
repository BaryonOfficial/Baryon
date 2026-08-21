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
export {
  AUDIO_SOURCE_KINDS,
  AUDIO_SOURCE_PHASES,
} from "@baryon/engine/audio";
export { default as AdvancedControlsDock } from "./components/AdvancedControlsDock.jsx";
export { useFullscreenUiPreference } from "./components/hooks/useFullscreenUiPreference.js";
export { useFullscreen } from "./components/hooks/useFullScreenToggle.jsx";
export { OutputStageSurface } from "./components/OutputStageSurface.jsx";
export { ListenerControls } from "./components/AudioControls.jsx";
export { default as MobileDemoControls } from "./components/MobileDemoControls.jsx";
export { default as MetalFxFrame } from "./components/MetalFxFrame.jsx";
export { usePrefersReducedMotion } from "./components/hooks/usePrefersReducedMotion.js";
export { isMobileDevice } from "./components/browserSupport.js";
export { default as LiveInputStatusPanel } from "./components/LiveInputStatusPanel.jsx";
export { TOP_RIGHT_OVERLAY_DESKTOP_STACK_GAP } from "./components/topRightOverlayLayout.js";
export { default as FloatingCameraControls } from "./components/FloatingCameraControls.jsx";
export { default as PerformanceHud } from "./components/PerformanceHud.jsx";
export { resolvePreviewOverlayState } from "./components/threeSceneState.js";
export { composeAuthoritativePerformanceHudMetrics } from "./components/threeSceneState.js";
export {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
  WEBGPU_RENDERER_RUNTIME_LOSS_ERROR,
} from "./components/rendererDiagnostics.js";
export { RendererErrorBoundary } from "./components/RendererErrorBoundary.jsx";
export { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
export {
  DEFAULT_ACTIVE_CAMERA_POSE,
  DEFAULT_IDLE_PERFORMER_CAMERA_POSE,
  DEFAULT_LIVE_PERFORMER_CAMERA_POSE,
  MOBILE_DEMO_CAMERA_DISTANCE_SCALE,
  resolvePresetCameraPose,
} from "./components/cameraPosePresets.js";
export { createCameraPresetCommand } from "./components/cameraControlModel.js";
export {
  createCameraControlCommand,
  dispatchCameraControlCommand,
} from "./components/cameraControlEvents.js";
export { createControlsStore } from "./controls/controlsStore.js";
export { ControlsProvider } from "./controls/ControlsProvider.jsx";
export {
  dispatchControlsChanged,
  dispatchControlsCommand,
} from "./controls/controlsEvents.js";
export {
  useControlsActions,
  useControlsSnapshot,
  useControlsStore,
} from "./controls/useControlsStore.js";
