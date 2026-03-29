import {
  Suspense,
  cloneElement,
  isValidElement,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene";
import {
  CAMERA_VIEW_PRESETS,
  getCameraConfigForPreset,
  resolveDefaultCameraViewPreset,
} from "./cameraViewPresets.js";
import ParticleDebugOverlay from "./ParticleDebugOverlay.jsx";
import PerformanceHud from "./PerformanceHud.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import LiveInputStatusPanel from "./LiveInputStatusPanel.jsx";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useBaryonControls } from "./hooks/useBaryonControls";
import { useBrowserSupportState } from "./hooks/useBrowserSupportState.js";
import { useRendererModeState } from "./hooks/useRendererModeState.js";
import { useAudio, useAudioScene } from "../context/AudioContext";

const AdvancedControlsSidebar = lazy(
  () => import("./AdvancedControlsSidebar.jsx"),
);
const ADVANCED_CONTROLS_DOCK_WIDTH = "min(17.5rem, calc(100vw - 2.4rem))";

export function resolveLiveInputPanelConfig({ liveInputPanel = null } = {}) {
  return {
    forceVisible: Boolean(liveInputPanel?.forceVisible),
    showAction: Boolean(liveInputPanel?.showAction),
    deviceSelectTestId:
      typeof liveInputPanel?.deviceSelectTestId === "string" &&
      liveInputPanel.deviceSelectTestId
        ? liveInputPanel.deviceSelectTestId
        : "live-input-device-select",
  };
}

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

function CameraIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h4l1.5-2h5L16 7h4v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/**
 * @param {{
 *   controlsOverlay?: import("react").ReactNode,
 *   topRightOverlay?: import("react").ReactNode,
 *   liveInputPanel?: {
 *     forceVisible?: boolean,
 *     showAction?: boolean,
 *     deviceSelectTestId?: string,
 *   } | null,
 *   debugOverlayExtraItems?: Array<{ label: string, value: string | number | boolean }> | null,
 *   outputFrameConfig?: { enabled: boolean, width: number, height: number } | null,
 *   onOutputFrame?: (frame: { width: number, height: number, rgba: ArrayBuffer }) => Promise<void> | void,
 *   onFrameState?: (state: Record<string, unknown>) => void,
 *   sharedPreviewMode?: {
 *     enabled?: boolean,
 *     renderMode?: "legacy-double-render" | "single-render-shared-preview",
 *     omitLocalScene?: boolean,
 *     canvasId?: string | null,
 *   } | null,
 * }} props
 */
const ThreeScene = ({
  controlsOverlay = null,
  topRightOverlay = null,
  liveInputPanel = null,
  debugOverlayExtraItems = null,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  sharedPreviewMode = null,
}) => {
  const containerRef = useRef(null);
  const advancedControlsTriggerRef = useRef(null);
  const {
    controlsRef,
    controlsState,
    folderGroups,
    presetsAreaControls,
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
  const [performanceHudMetrics, setPerformanceHudMetrics] = useState(null);
  const [cameraViewPreset, setCameraViewPreset] = useState(
    CAMERA_VIEW_PRESETS.topDown,
  );
  const [cameraResetNonce, setCameraResetNonce] = useState(0);
  const [frameFieldState, setFrameFieldState] = useState("idle");

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
    setIsEngineReady,
    setLiveInputRuntimeStatus,
    liveInputUiState,
    liveInputErrorCode,
    resetAudioSession,
  } = useAudioScene();
  const { selectedSource } = useAudio();
  const defaultCameraViewPreset = resolveDefaultCameraViewPreset({
    liveInputUiState,
    fieldState: frameFieldState,
  });
  const effectiveCameraViewPreset =
    frameFieldState === "idle" ? defaultCameraViewPreset : cameraViewPreset;
  const cameraConfig = getCameraConfigForPreset(effectiveCameraViewPreset);

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
  const resolvedLiveInputPanel = resolveLiveInputPanelConfig({
    liveInputPanel,
  });
  const showOverlayUi = isSupportReady && !isFullscreen;
  const sharedPreviewVisible = sharedPreviewMode?.enabled === true;
  const sharedPreviewCanvasId = sharedPreviewMode?.canvasId ?? null;
  const usingSharedPreview =
    sharedPreviewMode?.renderMode === "single-render-shared-preview";
  const omitLocalScene = sharedPreviewMode?.omitLocalScene === true;
  const liveInputStatusPanelVisible =
    showOverlayUi &&
    (selectedSource === "system" || resolvedLiveInputPanel.forceVisible);
  const showCameraControls =
    showOverlayUi && controlsState.visualizationMethod !== "cymatics2d";
  const stackedTopRightOverlay = isValidElement(topRightOverlay)
    ? cloneElement(
        /** @type {import("react").ReactElement<any>} */ (topRightOverlay),
        { embedded: true },
      )
    : topRightOverlay;

  const handleCanvasError = (error) => {
    if (error?.name !== WEBGPU_RENDERER_INIT_ERROR) {
      return;
    }

    void resetAudioSession();
    setIsEngineReady(false);
    setShowCanvas(false);
    markRendererInitUnsupported(error);
  };

  const applyCameraPreset = (preset) => {
    setCameraViewPreset(preset);
    setCameraResetNonce((current) => current + 1);
  };

  const handleFrameState = useCallback(
    (state) => {
      const nextFieldState = state?.featureFrame?.fieldState ?? "idle";
      setFrameFieldState((current) =>
        current === nextFieldState ? current : nextFieldState,
      );
      onFrameState?.(state);
    },
    [onFrameState],
  );

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
  /** @type {import('react').CSSProperties} */
  const cameraControlsStyle = isControlsPanelOpen
    ? {
        position: "absolute",
        top: "0.9rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 61,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.22rem",
        padding: "0.18rem",
        maxWidth: "calc(100vw - 2rem)",
        borderRadius: "999px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        background: "rgba(17, 21, 27, 0.84)",
        color: "rgba(255, 255, 255, 0.86)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.22)",
      }
    : {
        position: "absolute",
        top: "0.9rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 61,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.22rem",
        padding: "0.18rem",
        maxWidth: "calc(100vw - 2rem)",
        borderRadius: "999px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        background: "rgba(17, 21, 27, 0.84)",
        color: "rgba(255, 255, 255, 0.86)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.22)",
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
      {sharedPreviewVisible ? (
        <canvas
          id={sharedPreviewCanvasId ?? undefined}
          data-testid="shared-output-preview-canvas"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
            width: "100%",
            height: "100%",
            display: "block",
            background: "transparent",
            opacity: usingSharedPreview ? 1 : 0,
            pointerEvents: "none",
          }}
        />
      ) : null}

      {showCanvas && isSupportReady && !omitLocalScene && (
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
              zIndex: 9,
              background: "transparent",
              opacity: usingSharedPreview ? 0 : 1,
              pointerEvents: usingSharedPreview ? "none" : "auto",
            }}
            dpr={[1, 2]}
            camera={{
              position: cameraConfig.position,
              up: cameraConfig.up,
              fov: 65,
              near: 0.1,
              far: 100,
            }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={(glDefaults) =>
              createBaryonRenderer(glDefaults, activeRendererFallback)
            }
          >
            <Suspense fallback={null}>
              <BaryonScene
                setIsEngineReady={setIsEngineReady}
                setLiveInputRuntimeStatus={setLiveInputRuntimeStatus}
                liveInputUiState={liveInputUiState}
                liveInputErrorCode={liveInputErrorCode}
                controlsRef={controlsRef}
                visualizationMethod={controlsState.visualizationMethod}
                renderQualityPreset={controlsState.renderQualityPreset}
                onPerformanceHudSnapshotChange={setPerformanceHudMetrics}
                outputFrameConfig={outputFrameConfig}
                onOutputFrame={onOutputFrame}
                onFrameState={handleFrameState}
                cameraControlMode={CAMERA_CONTROL_MODES.previewLocal}
                cameraViewPreset={effectiveCameraViewPreset}
                cameraResetNonce={cameraResetNonce}
                suppressRender={usingSharedPreview}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}

      {showOverlayUi && (
        <div style={controlsToggleStyle}>
          <button
            ref={advancedControlsTriggerRef}
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              border: "none",
              background: "transparent",
              padding: 0,
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <ControlsIcon />
          </button>
        </div>
      )}

      {showOverlayUi && !isControlsPanelOpen && (
        <div
          style={{
            position: "absolute",
            top: "var(--app-floating-control-top)",
            left: `calc(var(--app-floating-control-left) + var(--app-floating-control-size) + 0.6rem)`,
            zIndex: 61,
            display: "flex",
            alignItems: "center",
            height: "var(--app-floating-control-size)",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "rgba(255, 255, 255, 1)",
              whiteSpace: "nowrap",
            }}
          >
            Baryon | Cymatics
          </span>
        </div>
      )}

      {showCameraControls ? (
        <div style={cameraControlsStyle}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.7rem",
              height: "1.7rem",
              color: "rgba(255, 255, 255, 0.58)",
            }}
            aria-hidden="true"
          >
            <CameraIcon />
          </span>
          {[
            {
              key: CAMERA_VIEW_PRESETS.topDown,
              label: "Top",
              testId: "camera-top-view-button",
            },
            {
              key: CAMERA_VIEW_PRESETS.side,
              label: "Side",
              testId: "camera-side-view-button",
            },
          ].map((preset) => {
            const active = effectiveCameraViewPreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                data-testid={preset.testId}
                onClick={() => applyCameraPreset(preset.key)}
                title={`${preset.label} view`}
                style={{
                  minHeight: "1.7rem",
                  padding: "0 0.7rem",
                  borderRadius: "999px",
                  border: active
                    ? "1px solid rgba(122, 174, 255, 0.42)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  background: active
                    ? "rgba(122, 174, 255, 0.16)"
                    : "rgba(255, 255, 255, 0.04)",
                  color: active
                    ? "rgba(224, 238, 255, 0.96)"
                    : "rgba(255, 255, 255, 0.72)",
                  font: "inherit",
                  fontSize: "0.66rem",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            data-testid="camera-reset-view-button"
            onClick={() => applyCameraPreset(defaultCameraViewPreset)}
            title="Reset camera to default"
            style={{
              minHeight: "1.7rem",
              padding: "0 0.7rem",
              borderRadius: "999px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(255, 255, 255, 0.04)",
              color: "rgba(255, 255, 255, 0.72)",
              font: "inherit",
              fontSize: "0.66rem",
              fontWeight: 650,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>
      ) : null}

      {showOverlayUi && isControlsPanelLoaded ? (
        <Suspense fallback={null}>
          <AdvancedControlsSidebar
            folderGroups={folderGroups}
            presetsAreaControls={presetsAreaControls}
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
            triggerRef={advancedControlsTriggerRef}
          />
        </Suspense>
      ) : null}

      {showOverlayUi ? (
        <div
          style={{
            position: "fixed",
            top: "0.9rem",
            right: "0.9rem",
            zIndex: 9998,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.65rem",
            maxWidth: "min(22rem, calc(100vw - 1rem))",
            pointerEvents: "none",
          }}
        >
          {stackedTopRightOverlay ? (
            <div style={{ pointerEvents: "auto" }}>
              {stackedTopRightOverlay}
            </div>
          ) : null}
          {liveInputStatusPanelVisible ? (
            <LiveInputStatusPanel
              stacked
              visible
              showLiveAction={
                resolvedLiveInputPanel.showAction &&
                Boolean(liveInputStatusPanelVisible)
              }
              deviceSelectTestId={resolvedLiveInputPanel.deviceSelectTestId}
              echoCancellation={Boolean(controlsState.echoCancellation)}
              noiseSuppression={Boolean(controlsState.noiseSuppression)}
              autoGainControl={Boolean(controlsState.autoGainControl)}
              onMicControlChange={(key, value) => updateControl(key, value)}
            />
          ) : null}
          <PerformanceHud
            metrics={
              controlsState.performanceHudEnabled ? performanceHudMetrics : null
            }
            stacked
          />
          <ParticleDebugOverlay
            stacked
            debugOverlayExtraItems={debugOverlayExtraItems}
          />
        </div>
      ) : null}
      {showOverlayUi && controlsOverlay}

      {isUnsupported && (
        <UnsupportedWarning reason={unsupportedReason} probe={supportProbe} />
      )}
    </div>
  );
};

export default ThreeScene;
