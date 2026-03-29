import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { BaryonScene, CAMERA_CONTROL_MODES } from "./BaryonScene.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import {
  CAMERA_VIEW_PRESETS,
  getCameraConfigForPreset,
  normalizeCameraViewPreset,
  resolveCameraDistanceOverride,
} from "./cameraViewPresets.js";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import {
  DEFAULT_RENDER_QUALITY_PRESET,
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
 * @param {{
 *   controlsRef: import("react").MutableRefObject<Record<string, unknown>>,
 *   visualizationMethod: string,
 *   renderQualityPreset?: string,
 *   externalFrameRef?: import("react").MutableRefObject<any>,
 *   backgroundColor?: string,
 *   cameraViewPreset?: "top-down" | "side" | null,
 *   cameraDistance?: number | null,
 *   registerRenderRequester?: ((requester: (() => void) | null) => void) | null,
 *   onStageRender?: (payload: { frameSequence: number | null, qualityPreset: string | null }) => void,
 *   onLiveInputRuntimeStatusChange?: ((status: unknown) => void) | null,
 * }} props
 */
export function OutputStageSurface({
  controlsRef,
  visualizationMethod,
  renderQualityPreset = DEFAULT_RENDER_QUALITY_PRESET,
  externalFrameRef = null,
  backgroundColor: backgroundColorProp = null,
  cameraViewPreset = null,
  cameraDistance = null,
  registerRenderRequester = null,
  onStageRender = null,
  onLiveInputRuntimeStatusChange = null,
}) {
  const [rendererError, setRendererError] = useState(null);
  const resolvedCameraViewPreset = /** @type {"top-down" | "side"} */ (
    normalizeCameraViewPreset(cameraViewPreset, CAMERA_VIEW_PRESETS.topDown)
  );
  const resolvedCameraDistance = resolveCameraDistanceOverride(
    resolvedCameraViewPreset,
    cameraDistance,
  );
  const cameraConfig = getCameraConfigForPreset(
    resolvedCameraViewPreset,
    resolvedCameraDistance,
  );
  const resolvedBackgroundColor =
    backgroundColorProp ??
    (typeof controlsRef.current?.backgroundColor === "string"
      ? controlsRef.current.backgroundColor
      : "#000000");

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
              fov: 65,
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
                setLiveInputRuntimeStatus={
                  onLiveInputRuntimeStatusChange ?? (() => {})
                }
                liveInputUiState="idle"
                liveInputErrorCode="none"
                controlsRef={controlsRef}
                visualizationMethod={visualizationMethod}
                renderQualityPreset={renderQualityPreset}
                onPerformanceHudSnapshotChange={() => {}}
                externalFrameRef={externalFrameRef}
                basePixelRatio={1}
                onStageRender={onStageRender}
                cameraControlMode={CAMERA_CONTROL_MODES.externalSynced}
                cameraViewPreset={resolvedCameraViewPreset}
                cameraDistance={resolvedCameraDistance}
                renderContext={RENDER_CONTEXTS.externalOutput}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}
    </div>
  );
}
