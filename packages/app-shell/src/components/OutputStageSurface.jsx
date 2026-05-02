import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import { resolvePresetCameraPose } from "./cameraPosePresets.js";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import {
  DEFAULT_PERFORMANCE_PROFILE,
  RENDER_CONTEXTS,
} from "@baryon/visualizer/render/outputPipeline";

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
  const cameraPose = resolvePresetCameraPose("top-down");
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

/**
 * @param {{
 *   controlsRef: import("react").MutableRefObject<Record<string, unknown>>,
 *   visualizationMethod: string,
 *   renderQualityPreset?: string,
 *   resolvedRenderProfile?: import("@baryon/visualizer/render/outputPipeline").RenderQualityProfile | null,
 *   renderProfileOverrides?: { renderScale?: number, traaEnabled?: boolean, bloomAllowed?: boolean } | null,
 *   externalFrameRef?: import("react").MutableRefObject<any>,
 *   cameraPose?: {
 *     position?: { x?: number, y?: number, z?: number },
 *     target?: { x?: number, y?: number, z?: number },
 *     up?: { x?: number, y?: number, z?: number },
 *     fov?: number,
 *   } | null,
 *   backgroundColor?: string,
 *   structuralControlVersion?: number,
 *   liveControlSignalRef?: import("react").MutableRefObject<{ version: number }> | null,
 *   enableControlEventSync?: boolean,
 *   adaptiveResetNonce?: number,
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
  renderProfileOverrides = null,
  externalFrameRef = null,
  cameraPose = null,
  backgroundColor: backgroundColorProp = null,
  structuralControlVersion = 0,
  liveControlSignalRef = null,
  enableControlEventSync = false,
  adaptiveResetNonce = 0,
  registerRenderRequester = null,
  onStageRender = null,
  onFrameState = null,
  onLiveInputRuntimeStatusChange = null,
  onPerformanceHudSnapshotChange = null,
  onAuditSnapshotChange = null,
}) {
  const [rendererError, setRendererError] = useState(null);
  const cameraConfig = /** @type {StageCameraConfig} */ (
    cameraPose == null
      ? defaultStageCameraConfig
      : {
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
        }
  );
  const resolvedBackgroundColor =
    backgroundColorProp ??
    (typeof controlsRef.current?.backgroundColor === "string"
      ? controlsRef.current.backgroundColor
      : "#0D0A07");

  const handleCanvasError = (error) => {
    if (error?.name !== WEBGPU_RENDERER_INIT_ERROR) {
      return;
    }

    setRendererError(error);
  };

  return (
    <div
      data-testid="output-stage-root"
      style={{
        width: "100vw",
        height: "100vh",
        position: "fixed",
        inset: 0,
        background: resolvedBackgroundColor,
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
            fontFamily: "monospace",
            fontSize: "0.9rem",
          }}
        >
          Stage output requires WebGPU.
        </div>
      ) : (
        <RendererErrorBoundary
          resetKey={`stage-${visualizationMethod}`}
          onError={handleCanvasError}
        >
          <Canvas
            key={`stage-${visualizationMethod}`}
            frameloop="demand"
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
            }}
            dpr={1}
            camera={{
              position: cameraConfig.position,
              up: cameraConfig.up,
              fov: cameraConfig.fov ?? 65,
              near: 0.1,
              far: 100,
            }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={(glDefaults) =>
              createBaryonRenderer(glDefaults, false, {
                initialPixelRatio: 1,
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
                renderQualityPreset={renderQualityPreset}
                resolvedRenderProfile={resolvedRenderProfile}
                renderProfileOverrides={renderProfileOverrides}
                onPerformanceHudSnapshotChange={onPerformanceHudSnapshotChange}
                onAuditSnapshotChange={onAuditSnapshotChange}
                externalFrameRef={externalFrameRef}
                cameraPose={cameraPose}
                basePixelRatio={1}
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
