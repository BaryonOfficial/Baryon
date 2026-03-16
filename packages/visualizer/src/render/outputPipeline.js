import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { float, max, pass, uniform, vec4 } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { RENDER_DEFAULTS } from "../defaults.js";

const { RenderPipeline } = /** @type {any} */ (THREEWebGPU);

export const OUTPUT_MODES = Object.freeze({
  transparent: "transparent",
  opaque: "opaque",
});

export function normalizeOutputMode(mode) {
  return mode === OUTPUT_MODES.opaque
    ? OUTPUT_MODES.opaque
    : OUTPUT_MODES.transparent;
}

export function composeRenderOutputNode({
  sceneColor,
  bloomPass,
  bloomEnabled,
  outputMode,
  outputBackgroundNode,
}) {
  const normalizedMode = normalizeOutputMode(outputMode);
  const sceneRgb = sceneColor.rgb;
  const sceneAlpha = sceneColor.a;
  const bloomAlpha = bloomEnabled
    ? max(max(bloomPass.r, bloomPass.g), bloomPass.b).clamp()
    : float(0.0);
  const finalAlpha = bloomEnabled
    ? max(sceneAlpha, bloomAlpha).clamp()
    : sceneAlpha;
  const finalRgb = bloomEnabled ? sceneRgb.add(bloomPass.rgb) : sceneRgb;

  if (normalizedMode === OUTPUT_MODES.opaque) {
    const opaqueRgb = outputBackgroundNode
      .mul(finalAlpha.oneMinus())
      .add(finalRgb);
    return vec4(opaqueRgb, 1.0);
  }

  return vec4(finalRgb, finalAlpha);
}

export function createRenderOutputPipeline(gl, scene, camera) {
  if (gl?.backend?.isWebGLBackend === true) {
    return null;
  }

  const bloomUniforms = {
    strength: uniform(RENDER_DEFAULTS.bloomStrength),
    radius: uniform(RENDER_DEFAULTS.bloomRadius),
    threshold: uniform(RENDER_DEFAULTS.bloomThreshold),
  };
  const outputUniforms = {
    backgroundColor: uniform(
      new THREE.Color(RENDER_DEFAULTS.outputBackgroundColor),
    ),
  };
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode("output");
  const bloomPass = bloom(
    sceneColor,
    /** @type {any} */ (bloomUniforms.strength),
    /** @type {any} */ (bloomUniforms.radius),
    /** @type {any} */ (bloomUniforms.threshold),
  );
  const pipeline = new RenderPipeline(gl);
  const composeOutputNode = ({
    bloomEnabled = RENDER_DEFAULTS.bloomEnabled,
    outputMode = RENDER_DEFAULTS.outputMode,
  } = {}) =>
    composeRenderOutputNode({
      sceneColor,
      bloomPass,
      bloomEnabled,
      outputMode,
      outputBackgroundNode: outputUniforms.backgroundColor,
    });

  pipeline.outputNode = composeOutputNode();
  pipeline.needsUpdate = true;

  return {
    pipeline,
    postNodes: {
      sceneColor,
      bloomPass,
      bloomUniforms,
      outputUniforms,
      composeOutputNode,
    },
  };
}
