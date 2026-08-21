import { useRef, useCallback } from "react";
import {
  createFallbackRenderOutputPipeline,
  createRenderOutputPipeline,
  disposeRenderOutputPostNodes,
  getRenderQualityProfileKey,
} from "@baryon/engine/render/outputPipeline";

export function useBaryonPipeline(
  gl,
  scene,
  camera,
  renderProfile,
) {
  const pipelineRef = useRef(null);
  const postNodesRef = useRef(null);
  const renderProfileRef = useRef(renderProfile);
  const pipelineProfileKeyRef = useRef(null);

  renderProfileRef.current = renderProfile;

  const disposePipeline = useCallback(() => {
    disposeRenderOutputPostNodes(postNodesRef.current);
    pipelineRef.current?.dispose?.();
    pipelineRef.current = null;
    postNodesRef.current = null;
    pipelineProfileKeyRef.current = null;
  }, []);

  const ensurePipeline = useCallback(() => {
    const nextProfileKey = getRenderQualityProfileKey(renderProfileRef.current);

    if (
      pipelineRef.current &&
      pipelineProfileKeyRef.current === nextProfileKey
    ) {
      return pipelineRef.current;
    }

    disposePipeline();

    // The WebGL fallback cannot run the full chain — TRAA needs a velocity MRT
    // attachment and SMAA sits behind it — but it still owns display transfer,
    // the optical PSF, and bloom. Both backends share this lifecycle and cache
    // key; only the pipeline factory differs.
    const createPipeline =
      gl?.backend?.isWebGLBackend === true
        ? createFallbackRenderOutputPipeline
        : createRenderOutputPipeline;
    const pipelineState = createPipeline(gl, scene, camera, {
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
