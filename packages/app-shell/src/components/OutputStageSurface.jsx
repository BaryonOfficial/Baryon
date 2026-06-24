import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import { DEFAULT_ACTIVE_CAMERA_POSE } from "./cameraPosePresets.js";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import {
  DEFAULT_PERFORMANCE_PROFILE,
  normalizeOutputMode,
  OUTPUT_MODES,
  RENDER_CONTEXTS,
} from "@baryon/engine/render/outputPipeline";

function StageInvalidateBridge({ registerRenderRequester }) {
  const { invalidate } = useThree();

  useEffect(() => {
    if (!registerRenderRequester) {
      return undefined;
    }

    registerRenderRequester(() => invalidate());
    return () => {
      registerRenderRequester(null);
    };
  }, [invalidate, registerRenderRequester]);

  return null;
}

/**
 * @typedef {{
 *   position: [number, number, number],
 *   up: [number, number, number],
 *   fov?: number | null,
 * }} StageCameraConfig
 */

const defaultStageCameraConfig = (() => {
  const cameraPose = DEFAULT_ACTIVE_CAMERA_POSE;
  return /** @type {StageCameraConfig} */ ({
    position: /** @type {[number, number, number]} */ ([
      cameraPose.position.x,
      cameraPose.position.y,
      cameraPose.position.z,
    ]),
    up: /** @type {[number, number, number]} */ ([
      cameraPose.up.x,
      cameraPose.up.y,
      cameraPose.up.z,
    ]),
    fov: cameraPose.fov,
  });
})();

// The external output window is already sized to the selected framebuffer.
// Keep the canvas pixel ratio fixed so display DPR cannot silently multiply it.
const EXTERNAL_OUTPUT_FRAMEBUFFER_PIXEL_RATIO = 1;

function resolveStageColor(value, fallback) {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

/**
 * @param {{
 *   controlsRef: import("react").MutableRefObject<Record<string, unknown>>,
 *   visualizationMethod: string,
 *   renderQualityPreset?: string,
 *   resolvedRenderProfile?: import("@baryon/engine/render/outputPipeline").RenderQualityProfile | null,
 *   externalFrameRef?: import("react").MutableRefObject<any>,
 *   cameraPose?: {
 *     position?: { x?: number, y?: number, z?: number },
 *     target?: { x?: number, y?: number, z?: number },
 *     up?: { x?: number, y?: number, z?: number },
 *     fov?: number,
 *   } | null,
 *   backgroundColor?: string,
 *   outputMode?: string,
 *   outputBackgroundColor?: string,
 *   structuralControlVersion?: number,
 *   liveControlSignalRef?: import("react").MutableRefObject<{ version: number }> | null,
 *   enableControlEventSync?: boolean,
 *   adaptiveResetNonce?: number,
 *   forceWebGLRenderer?: boolean,
 *   registerRenderRequester?: ((requester: (() => void) | null) => void) | null,
 *   onStageRender?: (payload: { frameSequence: number | null, qualityPreset: string | null }) => void,
 *   onFrameState?: ((state: Record<string, unknown>) => void) | null,
 *   onLiveInputRuntimeStatusChange?: ((status: unknown) => void) | null,
 *   onPerformanceHudSnapshotChange?: ((snapshot: Record<string, unknown> | null) => void) | null,
 *   onAuditSnapshotChange?: ((state: { enabled: boolean, snapshot: Record<string, unknown> | null }) => void) | null,
 * }} props
 */
export function OutputStageSurface({
  controlsRef,
  visualizationMethod,
  renderQualityPreset = DEFAULT_PERFORMANCE_PROFILE,
  resolvedRenderProfile = null,
  externalFrameRef = null,
  cameraPose = null,
  backgroundColor: backgroundColorProp = null,
  outputMode: outputModeProp = null,
  outputBackgroundColor: outputBackgroundColorProp = null,
  structuralControlVersion = 0,
  liveControlSignalRef = null,
  enableControlEventSync = false,
  adaptiveResetNonce = 0,
  forceWebGLRenderer = false,
  registerRenderRequester = null,
  onStageRender = null,
  onFrameState = null,
  onLiveInputRuntimeStatusChange = null,
  onPerformanceHudSnapshotChange = null,
  onAuditSnapshotChange = null,
}) {
  const [rendererError, setRendererError] = useState(null);
  const resolvedCameraPose = cameraPose;
  const cameraConfig = /** @type {StageCameraConfig} */ (
    resolvedCameraPose == null
      ? defaultStageCameraConfig
      : {
          position: /** @type {[number, number, number]} */ ([
            resolvedCameraPose.position.x,
            resolvedCameraPose.position.y,
            resolvedCameraPose.position.z,
          ]),
          up: /** @type {[number, number, number]} */ ([
            resolvedCameraPose.up.x,
            resolvedCameraPose.up.y,
            resolvedCameraPose.up.z,
          ]),
          fov: resolvedCameraPose.fov,
        }
  );
  const controls = controlsRef.current ?? {};
  const resolvedBackdropColor = resolveStageColor(
    backgroundColorProp ?? controls.backgroundColor,
    "#0D0A07",
  );
  const resolvedOutputMode = normalizeOutputMode(
    outputModeProp ?? controls.outputMode,
  );
  const resolvedOutputBackgroundColor = resolveStageColor(
    outputBackgroundColorProp ?? controls.outputBackgroundColor,
    resolvedBackdropColor,
  );
  const resolvedStageBackground =
    resolvedOutputMode === OUTPUT_MODES.opaque
      ? resolvedOutputBackgroundColor
      : "transparent";
  const traaEnabled = controlsRef.current?.traaEnabled !== false;
  const customTargetFps = controlsRef.current?.customTargetFps ?? null;

  const handleCanvasError = (error) => {
    if (error?.name !== WEBGPU_RENDERER_INIT_ERROR) {
      return;
    }

    setRendererError(error);
  };

  return (
    <div
      data-testid="output-stage-root"
      data-output-mode={resolvedOutputMode}
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        inset: 0,
        backgroundColor: resolvedStageBackground,
      }}
    >
      {rendererError ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255, 255, 255, 0.8)",
            fontFamily: "var(--baryon-type-mono-family)",
            fontSize: "0.9rem",
          }}
        >
          Stage output requires WebGPU.
        </div>
      ) : (
        <RendererErrorBoundary
          resetKey={`stage-${forceWebGLRenderer ? "webgl" : "webgpu"}-${visualizationMethod}`}
          onError={handleCanvasError}
        >
          <Canvas
            key={`stage-${forceWebGLRenderer ? "webgl" : "webgpu"}-${visualizationMethod}`}
            frameloop="demand"
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
            }}
            dpr={EXTERNAL_OUTPUT_FRAMEBUFFER_PIXEL_RATIO}
            camera={{
              position: cameraConfig.position,
              up: cameraConfig.up,
              fov: cameraConfig.fov ?? 65,
              near: 0.1,
              far: 100,
            }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={(glDefaults) =>
              createBaryonRenderer(glDefaults, forceWebGLRenderer, {
                initialPixelRatio: EXTERNAL_OUTPUT_FRAMEBUFFER_PIXEL_RATIO,
              })
            }
          >
            <Suspense fallback={null}>
              <StageInvalidateBridge
                registerRenderRequester={registerRenderRequester}
              />
              <BaryonScene
                setIsEngineReady={() => {}}
                setLiveInputRuntimeStatus={onLiveInputRuntimeStatusChange}
                liveInputUiState="idle"
                liveInputErrorCode="none"
                controlsRef={controlsRef}
                visualizationMethod={visualizationMethod}
                performanceProfile={renderQualityPreset}
                customTargetFps={customTargetFps}
                traaEnabled={traaEnabled}
                resolvedRenderProfile={resolvedRenderProfile}
                onPerformanceHudSnapshotChange={onPerformanceHudSnapshotChange}
                onAuditSnapshotChange={onAuditSnapshotChange}
                externalFrameRef={externalFrameRef}
                cameraPose={resolvedCameraPose}
                basePixelRatio={EXTERNAL_OUTPUT_FRAMEBUFFER_PIXEL_RATIO}
                onStageRender={onStageRender}
                onFrameState={onFrameState}
                cameraControlMode={CAMERA_CONTROL_MODES.externalSynced}
                structuralControlVersion={structuralControlVersion}
                liveControlSignalRef={liveControlSignalRef}
                enableControlEventSync={enableControlEventSync}
                adaptiveResetNonce={adaptiveResetNonce}
                renderContext={RENDER_CONTEXTS.externalOutput}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}
    </div>
  );
}
