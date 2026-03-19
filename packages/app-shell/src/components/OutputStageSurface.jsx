import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { BaryonScene } from "./BaryonScene.jsx";
import { RendererErrorBoundary } from "./RendererErrorBoundary.jsx";
import {
  createBaryonRenderer,
  WEBGPU_RENDERER_INIT_ERROR,
} from "./rendererDiagnostics.js";

/**
 * @param {{
 *   controlsRef: import("react").MutableRefObject<Record<string, unknown>>,
 *   visualizationMethod: string,
 *   externalFrameRef?: import("react").MutableRefObject<any>,
 * }} props
 */
export function OutputStageSurface({
  controlsRef,
  visualizationMethod,
  externalFrameRef = null,
}) {
  const [rendererError, setRendererError] = useState(null);
  const backgroundColor =
    typeof controlsRef.current?.backgroundColor === "string"
      ? controlsRef.current.backgroundColor
      : "#000000";

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
        background: backgroundColor,
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
            style={{
              position: "absolute",
              inset: 0,
              background: "transparent",
            }}
            dpr={1}
            camera={{ position: [0, 0, 9], fov: 65, near: 0.1, far: 100 }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={(glDefaults) => createBaryonRenderer(glDefaults, false)}
          >
            <Suspense fallback={null}>
              <BaryonScene
                setIsEngineReady={() => {}}
                setLiveInputRuntimeStatus={() => {}}
                controlsRef={controlsRef}
                visualizationMethod={visualizationMethod}
                onPerformanceHudSnapshotChange={() => {}}
                externalFrameRef={externalFrameRef}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}
    </div>
  );
}
