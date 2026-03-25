import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { BaryonScene } from "./BaryonScene.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import {
  getCameraConfigForPreset,
  resolveDefaultCameraViewPreset,
} from "./cameraViewPresets.js";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";
import { DEFAULT_RENDER_QUALITY_PRESET } from "@baryon/visualizer/render/outputPipeline";

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
 *   registerRenderRequester?: ((requester: (() => void) | null) => void) | null,
 *   onStageRender?: (payload: { frameSequence: number | null, qualityPreset: string | null }) => void,
 * }} props
 */
export function OutputStageSurface({
  controlsRef,
  visualizationMethod,
  renderQualityPreset = DEFAULT_RENDER_QUALITY_PRESET,
  externalFrameRef = null,
  backgroundColor: backgroundColorProp = null,
  registerRenderRequester = null,
  onStageRender = null,
}) {
  const [rendererError, setRendererError] = useState(null);
  const defaultCameraViewPreset = resolveDefaultCameraViewPreset({
    liveInputUiState: "idle",
    fieldState: "idle",
  });
  const cameraConfig = getCameraConfigForPreset(defaultCameraViewPreset);
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
                setLiveInputRuntimeStatus={() => {}}
                liveInputUiState="idle"
                liveInputErrorCode="none"
                controlsRef={controlsRef}
                visualizationMethod={visualizationMethod}
                renderQualityPreset={renderQualityPreset}
                onPerformanceHudSnapshotChange={() => {}}
                externalFrameRef={externalFrameRef}
                basePixelRatio={1}
                onStageRender={onStageRender}
                cameraViewPreset={defaultCameraViewPreset}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}
    </div>
  );
}
