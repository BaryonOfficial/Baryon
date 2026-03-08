import { useRef, useCallback } from "react";
import { RenderPipeline } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { RENDER_DEFAULTS } from "@baryon/visualizer";

export function useBaryonPipeline(gl, scene, camera) {
  const pipelineRef = useRef(null);
  const postNodesRef = useRef(null);
  const bloomUniforms = useRef({
    strength: uniform(RENDER_DEFAULTS.bloomStrength),
    radius: uniform(RENDER_DEFAULTS.bloomRadius),
    threshold: uniform(RENDER_DEFAULTS.bloomThreshold),
  });

  const ensurePipeline = useCallback(() => {
    if (pipelineRef.current) {
      return pipelineRef.current;
    }

    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    const { strength, radius, threshold } = bloomUniforms.current;
    const bloomPass = bloom(sceneColor, strength, radius, threshold);
    const pipeline = new RenderPipeline(gl);
    pipeline.outputNode = sceneColor.add(bloomPass);
    pipelineRef.current = pipeline;
    postNodesRef.current = { sceneColor, bloomPass };
    return pipeline;
  }, [camera, gl, scene]);

  return {
    pipelineRef,
    postNodesRef,
    ensurePipeline,
  };
}
