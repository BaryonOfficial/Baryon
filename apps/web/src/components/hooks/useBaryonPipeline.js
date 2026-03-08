import { useRef, useCallback } from "react";
import { RenderPipeline } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { DEFAULTS } from "@baryon/visualizer";

export function useBaryonPipeline(gl, scene, camera) {
  const pipelineRef = useRef(null);
  const postNodesRef = useRef(null);
  const bloomUniforms = useRef({
    strength: uniform(DEFAULTS.bloomStrength),
    radius: uniform(DEFAULTS.bloomRadius),
    threshold: uniform(DEFAULTS.bloomThreshold),
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

  const syncBloom = useCallback((controls) => {
    const pipeline = ensurePipeline();
    const { sceneColor, bloomPass } = postNodesRef.current;
    bloomPass.strength.value = controls.bloomStrength;
    bloomPass.radius.value = controls.bloomRadius;
    bloomPass.threshold.value = controls.bloomThreshold;
    pipeline.outputNode = controls.bloomEnabled ? sceneColor.add(bloomPass) : sceneColor;
    return pipeline;
  }, [ensurePipeline]);

  return {
    pipelineRef,
    ensurePipeline,
    syncBloom,
  };
}
