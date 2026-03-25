import { useRef, useCallback } from "react";
import {
  createRenderOutputPipeline,
  getRenderQualityProfileKey,
} from "@baryon/visualizer/render/outputPipeline";

export function useBaryonPipeline(gl, scene, camera, renderProfile) {
  const pipelineRef = useRef(null);
  const postNodesRef = useRef(null);
  const renderProfileRef = useRef(renderProfile);
  const pipelineProfileKeyRef = useRef(null);

  renderProfileRef.current = renderProfile;

  const disposePipeline = useCallback(() => {
    postNodesRef.current?.traaNode?.dispose?.();
    pipelineRef.current?.dispose?.();
    pipelineRef.current = null;
    postNodesRef.current = null;
    pipelineProfileKeyRef.current = null;
  }, []);

  const ensurePipeline = useCallback(() => {
    if (gl?.backend?.isWebGLBackend === true) {
      disposePipeline();
      return null;
    }

    const nextProfileKey = getRenderQualityProfileKey(renderProfileRef.current);
    if (
      pipelineRef.current &&
      pipelineProfileKeyRef.current === nextProfileKey
    ) {
      return pipelineRef.current;
    }

    disposePipeline();
    const pipelineState = createRenderOutputPipeline(gl, scene, camera, {
      renderProfile: renderProfileRef.current,
    });
    if (!pipelineState) {
      pipelineRef.current = null;
      postNodesRef.current = null;
      pipelineProfileKeyRef.current = null;
      return null;
    }

    pipelineRef.current = pipelineState.pipeline;
    postNodesRef.current = pipelineState.postNodes;
    pipelineProfileKeyRef.current = nextProfileKey;
    return pipelineState.pipeline;
  }, [camera, disposePipeline, gl, scene]);

  return {
    pipelineRef,
    postNodesRef,
    renderProfileRef,
    ensurePipeline,
    disposePipeline,
  };
}
