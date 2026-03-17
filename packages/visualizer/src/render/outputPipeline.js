import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import {
  float,
  max,
  mrt,
  output,
  pass,
  uniform,
  vec4,
  velocity,
} from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
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
  // Enable velocity MRT so TRAANode can reproject history across frames.
  // `output` must be included so MRTNode.setup() fills index 0 of renderTarget.textures;
  // omitting it leaves members[0] undefined and crashes OutputStructNode.generate().
  // Our sphere has no transform animation (audio drives shader uniforms only),
  // so velocity is zero everywhere — no ghosting risk.
  scenePass.setMRT(mrt({ output, velocity }));

  const sceneColor = scenePass.getTextureNode("output");
  const depthNode = scenePass.getTextureNode("depth");
  const velocityNode = scenePass.getTextureNode("velocity");

  // TRAA: temporal reprojection AA with Halton sub-pixel jitter + variance
  // clipping. This is the real frame-accumulation pass; bloom runs on the
  // resolved anti-aliased output so the two effects reinforce each other.
  const traaNode = traa(sceneColor, depthNode, velocityNode, camera);
  // useSubpixelCorrection increases current-frame weight when velocity is subpixel —
  // designed for moving objects. Our velocity is always zero, so it adds the "square
  // pattern artifact" the docs warn about without any benefit.
  traaNode.useSubpixelCorrection = false;
  // The raymarched volume writes depth at the first ray hit, not a classical polygon
  // surface. Loosen edgeDepthDiff so TRAA treats fewer ray-march depth transitions as
  // "edges" and uses history more aggressively throughout the volume body.
  traaNode.edgeDepthDiff = 0.005;
  // @ts-ignore — getTextureNode() exists in TRAANode source but is missing from its .d.ts
  const traaColor = traaNode.getTextureNode();

  const bloomPass = bloom(
    traaColor,
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
      sceneColor: traaColor,
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
      traaNode,
      traaColor,
      bloomPass,
      bloomUniforms,
      outputUniforms,
      composeOutputNode,
    },
  };
}
