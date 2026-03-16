import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BaryonScene } from "./BaryonScene";
import AudioControls from "./AudioControls";
import ParticleDebugOverlay from "./ParticleDebugOverlay.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useBaryonControls } from "./hooks/useBaryonControls";
import { useBrowserSupportState } from "./hooks/useBrowserSupportState.js";
import { useRendererModeState } from "./hooks/useRendererModeState.js";
import { useAudioScene } from "../context/AudioContext";

const AdvancedControlsSidebar = lazy(
  () => import("./AdvancedControlsSidebar.jsx"),
);
const ADVANCED_CONTROLS_DOCK_WIDTH = "min(17.5rem, calc(100vw - 2.4rem))";

function ControlsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ThreeScene = () => {
  const containerRef = useRef(null);
  const {
    controlsRef,
    controlsState,
    controlGroups,
    presets,
    presetName,
    selectedPresetName,
    isControlsPanelLoaded,
    isControlsPanelOpen,
    setPresetName,
    updateControl,
    resetControls,
    savePreset,
    loadPreset,
    deletePreset,
    closeControlsPanel,
    toggleControlsPanel,
  } = useBaryonControls();
  const initialRendererFallback = Boolean(
    /** @type {any} */ (controlsRef.current).forceWebGLFallbackTest,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // fullscreen targets the outer container div
  useFullscreen(containerRef);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const {
    setIsPlaying,
    setIsAudioLoaded,
    setIsEngineReady,
    setMicRuntimeStatus,
    micProfile,
    resetAudioSession,
  } = useAudioScene();

  const {
    forceWebGLFallbackTest,
    activeRendererFallback,
    canvasEpoch,
    showCanvas,
    setShowCanvas,
  } = useRendererModeState({
    initialRendererFallback,
    resetAudioSession,
    setIsEngineReady,
  });
  const {
    supportProbe,
    unsupportedReason,
    isUnsupported,
    isSupportReady,
    markRendererInitUnsupported,
  } = useBrowserSupportState(forceWebGLFallbackTest);
  const showOverlayUi = isSupportReady && !isFullscreen;

  const handleCanvasError = (error) => {
    if (error?.name !== WEBGPU_RENDERER_INIT_ERROR) {
      return;
    }

    void resetAudioSession();
    setIsEngineReady(false);
    setShowCanvas(false);
    markRendererInitUnsupported(error);
  };

  /** @type {import("react").CSSProperties} */
  const controlsToggleStyle = isControlsPanelOpen
    ? {
        position: "absolute",
        top: "0.9rem",
        left: `calc(${ADVANCED_CONTROLS_DOCK_WIDTH} + 0.15rem)`,
        zIndex: 61,
        width: "2rem",
        height: "2.35rem",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        borderRadius: "0 0.9rem 0.9rem 0",
        borderLeft: "0",
        background:
          "linear-gradient(180deg, rgba(17, 21, 27, 0.9), rgba(9, 12, 17, 0.88))",
        color: "rgba(255, 255, 255, 0.82)",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.2)",
        cursor: "pointer",
      }
    : {
        position: "absolute",
        top: "var(--app-floating-control-top)",
        left: "var(--app-floating-control-left)",
        zIndex: 61,
        width: "var(--app-floating-control-size)",
        height: "var(--app-floating-control-size)",
        border: "var(--app-floating-control-border)",
        borderRadius: "var(--app-floating-control-radius)",
        background: "var(--app-floating-control-background)",
        color: "var(--app-floating-control-color)",
        backdropFilter: "var(--app-floating-control-backdrop)",
        boxShadow: "var(--app-floating-control-shadow)",
        cursor: "pointer",
      };

  return (
    <div
      ref={containerRef}
      data-testid="baryon-scene-root"
      style={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        zIndex: 1,
        background: controlsState.backgroundColor,
      }}
    >
      {showCanvas && isSupportReady && (
        <RendererErrorBoundary
          resetKey={`${activeRendererFallback ? "force-webgl-fallback" : "webgpu-default"}-${canvasEpoch}`}
          onError={handleCanvasError}
        >
          <Canvas
            key={`${activeRendererFallback ? "force-webgl-fallback" : "webgpu-default"}-${canvasEpoch}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 10,
              background: "transparent",
            }}
            dpr={[1, 2]}
            camera={{ position: [0, 0, 9], fov: 65, near: 0.1, far: 100 }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={(glDefaults) =>
              createBaryonRenderer(glDefaults, activeRendererFallback)
            }
          >
            <Suspense fallback={null}>
              <BaryonScene
                setIsPlaying={setIsPlaying}
                setIsAudioLoaded={setIsAudioLoaded}
                setIsEngineReady={setIsEngineReady}
                setMicRuntimeStatus={setMicRuntimeStatus}
                micProfile={micProfile}
                controlsRef={controlsRef}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}

      {showOverlayUi && (
        <button
          type="button"
          aria-label="Toggle advanced controls"
          data-testid="advanced-controls-trigger"
          aria-expanded={isControlsPanelOpen}
          onClick={toggleControlsPanel}
          title={
            isControlsPanelOpen
              ? "Hide advanced controls"
              : "Show advanced controls"
          }
          style={controlsToggleStyle}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          >
            <ControlsIcon />
          </span>
        </button>
      )}

      {showOverlayUi && isControlsPanelLoaded ? (
        <Suspense fallback={null}>
          <AdvancedControlsSidebar
            controlGroups={controlGroups}
            controlsState={controlsState}
            presets={presets}
            presetName={presetName}
            selectedPresetName={selectedPresetName}
            isOpen={isControlsPanelOpen}
            setPresetName={setPresetName}
            updateControl={updateControl}
            resetControls={resetControls}
            savePreset={savePreset}
            loadPreset={loadPreset}
            deletePreset={deletePreset}
            onClose={closeControlsPanel}
            dockWidth={ADVANCED_CONTROLS_DOCK_WIDTH}
          />
        </Suspense>
      ) : null}

      {showOverlayUi && <AudioControls />}
      {!isFullscreen && <ParticleDebugOverlay />}

      {isUnsupported && (
        <UnsupportedWarning reason={unsupportedReason} probe={supportProbe} />
      )}
    </div>
  );
};

export default ThreeScene;
