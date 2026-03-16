import { useRef, useCallback } from "react";
import { createRenderOutputPipeline } from "@baryon/visualizer/render/outputPipeline";

export function useBaryonPipeline(gl, scene, camera) {
  const pipelineRef = useRef(null);
  const postNodesRef = useRef(null);

  const ensurePipeline = useCallback(() => {
    if (gl?.backend?.isWebGLBackend === true) {
      pipelineRef.current = null;
      postNodesRef.current = null;
      return null;
    }

    if (pipelineRef.current) {
      return pipelineRef.current;
    }

    const pipelineState = createRenderOutputPipeline(gl, scene, camera);
    if (!pipelineState) {
      pipelineRef.current = null;
      postNodesRef.current = null;
      return null;
    }

    pipelineRef.current = pipelineState.pipeline;
    postNodesRef.current = pipelineState.postNodes;
    return pipelineState.pipeline;
  }, [camera, gl, scene]);

  return {
    pipelineRef,
    postNodesRef,
    ensurePipeline,
  };
}
