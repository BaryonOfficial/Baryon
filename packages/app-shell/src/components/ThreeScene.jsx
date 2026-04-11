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
import FloatingCameraControls from "./FloatingCameraControls.jsx";
import {
  CAMERA_VIEW_PRESETS,
  getCameraConfigForPreset,
  resolveDefaultCameraViewPreset,
} from "./cameraViewPresets.js";
import { dispatchCameraControlCommand } from "./cameraControlEvents.js";
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
import {
  composeAuthoritativePerformanceHudMetrics,
  resolveActiveCameraControlPreset,
  resolveCameraControlFieldState,
  resolveLiveInputPanelConfig,
  resolvePreviewOverlayState,
  shouldUseAuthoritativePerformanceHud,
} from "./threeSceneState.js";

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
 *   previewState?: {
 *     enabled?: boolean,
 *     requested?: boolean,
 *     rendering?: boolean,
 *     startupFailed?: boolean,
 *     recovering?: boolean,
 *     failureReason?: string | null,
 *     renderMode?: "local-presented" | "preview-presented",
 *     omitLocalScene?: boolean,
 *     supported?: boolean,
 *     connected?: boolean,
 *     canvasAttached?: boolean,
 *     healthy?: boolean,
 *     stale?: boolean,
 *     canvasId?: string | null,
 *   } | null,
 *   authoritativeOutputHudMetrics?: {
 *     outputTargetFps?: number | null,
 *     outputFps?: number | null,
 *     outputPaintFps?: number | null,
 *     renderCompletedToPaintMs?: number | null,
 *   } | null,
 *   authoritativeStageTelemetry?: {
 *     performanceHudSnapshot?: Record<string, unknown> | null,
 *     auditSnapshot?: Record<string, unknown> | null,
 *     auditEnabled?: boolean,
 *   } | null,
 *   authoritativeStageStatus?: {
 *     renderedFieldState?: string | null,
 *     renderedCameraViewPreset?: "top-down" | "side" | null,
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
  previewState = null,
  authoritativeOutputHudMetrics = null,
  authoritativeStageTelemetry = null,
  authoritativeStageStatus = null,
}) => {
  const containerRef = useRef(null);
  const advancedControlsTriggerRef = useRef(null);
  const operatorControlKeys = previewState ? ["auditEnabled"] : [];
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
  } = useBaryonControls({ operatorControlKeys });
  const initialRendererFallback = Boolean(
    /** @type {any} */ (controlsRef.current).forceWebGLFallbackTest,
  );
  const [performanceHudMetrics, setPerformanceHudMetrics] = useState(null);
  const [cameraViewPreset, setCameraViewPreset] = useState(
    CAMERA_VIEW_PRESETS.topDown,
  );
  const [cameraResetNonce, setCameraResetNonce] = useState(0);
  const [frameFieldState, setFrameFieldState] = useState("idle");
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const { isFullscreen } = useFullscreen(containerRef);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const {
    setIsEngineReady,
    setLiveInputRuntimeStatus,
    liveInputUiState,
    liveInputErrorCode,
    resetAudioSession,
  } = useAudioScene();
  const { selectedSource } = useAudio();
  const previewVisible = previewState?.requested === true;
  const previewCanvasId = previewState?.canvasId ?? null;
  const usingPreview = previewState?.rendering === true;
  const omitLocalScene = previewState?.omitLocalScene === true;
  const resolvedFrameFieldState = resolveCameraControlFieldState({
    frameFieldState,
    previewState,
    authoritativeStageStatus,
  });
  const defaultCameraViewPreset = resolveDefaultCameraViewPreset({
    liveInputUiState,
    fieldState: resolvedFrameFieldState,
  });
  const effectiveCameraViewPreset =
    resolvedFrameFieldState === "idle"
      ? defaultCameraViewPreset
      : cameraViewPreset;
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
  const previewOverlayState = resolvePreviewOverlayState(previewState);
  const activeCameraControlPreset = /** @type {"top-down" | "side"} */ (
    resolveActiveCameraControlPreset({
      previewState,
      authoritativeStageStatus,
      fallbackCameraViewPreset: effectiveCameraViewPreset,
    })
  );
  const useAuthoritativePerformanceHud = shouldUseAuthoritativePerformanceHud({
    previewState,
    authoritativeStageTelemetry,
    authoritativeOutputHudMetrics,
  });
  const resolvedPerformanceHudMetrics = controlsState.performanceHudEnabled
    ? useAuthoritativePerformanceHud
      ? composeAuthoritativePerformanceHudMetrics(
          authoritativeStageTelemetry?.performanceHudSnapshot ?? null,
          authoritativeOutputHudMetrics,
        )
      : performanceHudMetrics
    : null;
  const debugOverlayEnabledOverride = omitLocalScene
    ? authoritativeStageTelemetry?.auditEnabled === true
    : undefined;
  const debugOverlaySnapshotOverride = omitLocalScene
    ? (authoritativeStageTelemetry?.auditSnapshot ?? null)
    : undefined;
  const liveInputStatusPanelVisible =
    showOverlayUi &&
    (selectedSource === "system" || resolvedLiveInputPanel.forceVisible);
  const showCameraControls =
    showOverlayUi && controlsState.visualizationMethod !== "cymatics2d";
  const isPhoneViewport = viewportWidth <= 640;
  const isTabletPortraitViewport = viewportWidth > 640 && viewportWidth <= 820;
  const isTabletViewport = viewportWidth <= 1024;
  const isCompactViewport = isTabletViewport;
  const overlayTopInset = isPhoneViewport ? "0.7rem" : "0.9rem";
  const overlaySideInset = isPhoneViewport ? "0.6rem" : "0.9rem";
  const stackedTopRightOverlay = isValidElement(topRightOverlay)
    ? cloneElement(
        /** @type {import("react").ReactElement<any>} */ (topRightOverlay),
        { embedded: true },
      )
    : topRightOverlay;
  const shouldShowModeOverlay = Boolean(stackedTopRightOverlay);
  const shouldShowLiveStatusOverlay =
    liveInputStatusPanelVisible && (!isCompactViewport || !isControlsPanelOpen);
  const shouldShowPerformanceOverlay =
    Boolean(resolvedPerformanceHudMetrics) &&
    !isPhoneViewport &&
    !isTabletPortraitViewport &&
    (!isCompactViewport || !isControlsPanelOpen);
  const shouldShowDebugOverlay = !isTabletViewport;

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
    dispatchCameraControlCommand({
      cameraViewPreset: preset,
    });
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
        top: overlayTopInset,
        left: `calc(${ADVANCED_CONTROLS_DOCK_WIDTH} + 0.15rem)`,
        zIndex: 59,
        width: "2rem",
        height: "2.35rem",
        border: "1px solid var(--nd-border-visible)",
        borderRadius: "0 0.9rem 0.9rem 0",
        borderLeft: "0",
        background: "var(--nd-surface)",
        color: "var(--nd-text-primary)",
        boxShadow: "var(--nd-shell-shadow)",
        cursor: "pointer",
      }
    : {
        position: "absolute",
        top: isPhoneViewport
          ? overlayTopInset
          : "var(--app-floating-control-top)",
        left: "var(--app-floating-control-left)",
        zIndex: 59,
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
      {previewVisible ? (
        <>
          <canvas
            id={previewCanvasId ?? undefined}
            data-testid="preview-canvas"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 10,
              width: "100%",
              height: "100%",
              display: "block",
              background: "transparent",
              objectFit: "contain",
              objectPosition: "center",
              opacity: usingPreview ? 1 : 0,
              pointerEvents: "none",
            }}
          />
          {previewOverlayState ? (
            <div
              data-testid="preview-overlay"
              data-state={previewOverlayState.state}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                background:
                  "linear-gradient(180deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.62))",
              }}
            >
              <div
                style={{
                  minWidth: "min(22rem, calc(100vw - 3rem))",
                  maxWidth: "min(28rem, calc(100vw - 3rem))",
                  padding: "0.95rem 1rem",
                  borderRadius: "0.92rem",
                  border: "1px solid var(--nd-border-visible)",
                  background: "var(--nd-surface)",
                  boxShadow: "var(--nd-shell-shadow)",
                  color: "var(--nd-text-primary)",
                  fontFamily: '"Space Grotesk", system-ui, sans-serif',
                }}
              >
                <div
                  style={{
                    fontSize: "0.62rem",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--nd-text-secondary)",
                    marginBottom: "0.35rem",
                  }}
                >
                  Presented Performer Preview
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  {previewOverlayState.title}
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    lineHeight: 1.45,
                    color: "var(--nd-text-secondary)",
                  }}
                >
                  {previewOverlayState.message}
                </div>
              </div>
            </div>
          ) : null}
        </>
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
              opacity: usingPreview ? 0 : 1,
              pointerEvents: usingPreview ? "none" : "auto",
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
                suppressRender={usingPreview}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}

      {showOverlayUi && !isControlsPanelOpen && (
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

      {showOverlayUi && !isControlsPanelOpen && !isPhoneViewport && (
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
              letterSpacing: "0.12em",
              color: "var(--nd-text-display)",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}
          >
            Baryon | Cymatics
          </span>
        </div>
      )}

      {showCameraControls ? (
        <FloatingCameraControls
          activePreset={activeCameraControlPreset}
          onPresetSelect={applyCameraPreset}
          onPresetReset={() => applyCameraPreset(activeCameraControlPreset)}
          rootTestId="camera-controls"
          topButtonTestId="camera-top-view-button"
          sideButtonTestId="camera-side-view-button"
          resetButtonTestId="camera-reset-view-button"
        />
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
            top: overlayTopInset,
            right: overlaySideInset,
            zIndex: 9998,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: isPhoneViewport ? "0.85rem" : "0.9rem",
            maxWidth: isPhoneViewport
              ? "min(11.5rem, calc(100vw - 1rem))"
              : isTabletPortraitViewport
                ? "min(15rem, calc(100vw - 1.2rem))"
                : isTabletViewport
                  ? "min(18rem, calc(100vw - 1.2rem))"
                  : "min(22rem, calc(100vw - 1rem))",
            pointerEvents: "none",
          }}
        >
          {shouldShowModeOverlay ? (
            <div style={{ pointerEvents: "auto" }}>
              {stackedTopRightOverlay}
            </div>
          ) : null}
          {shouldShowLiveStatusOverlay ? (
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
          {shouldShowPerformanceOverlay ? (
            <PerformanceHud metrics={resolvedPerformanceHudMetrics} stacked />
          ) : null}
          {shouldShowDebugOverlay ? (
            <ParticleDebugOverlay
              stacked
              debugOverlayExtraItems={debugOverlayExtraItems}
              enabledOverride={debugOverlayEnabledOverride}
              snapshotOverride={debugOverlaySnapshotOverride}
            />
          ) : null}
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
