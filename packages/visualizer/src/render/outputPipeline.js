import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { RenderTarget, NearestFilter } from "three/webgpu";
import {
  float,
  max,
  mix,
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
import {
  compressDisplayRadianceNode,
  deriveBloomRadianceScaleNode,
} from "./displayRadiance.js";
import {
  OUTPUT_MODES,
  normalizeOutputMode,
  resolveRenderQualityProfile,
} from "./outputProfilePolicy.js";

const { RenderPipeline } = /** @type {any} */ (THREEWebGPU);

export * from "./outputProfilePolicy.js";

const DEFAULT_CAMERA_CUT_TEMPORAL_BYPASS_FRAMES = 2;

export function markRenderOutputCameraCut(
  postNodes,
  frames = DEFAULT_CAMERA_CUT_TEMPORAL_BYPASS_FRAMES,
) {
  const temporalHistoryBlendUniform = postNodes?.temporalHistoryBlendUniform;
  if (!postNodes?.traaNode || !temporalHistoryBlendUniform) {
    return false;
  }

  const nextFrames = Math.max(1, Math.round(frames));
  temporalHistoryBlendUniform.value = 0;
  postNodes.temporalHistoryCutFramesRemaining = Math.max(
    postNodes.temporalHistoryCutFramesRemaining ?? 0,
    nextFrames,
  );
  return true;
}

export function advanceRenderOutputCameraCut(postNodes) {
  const temporalHistoryBlendUniform = postNodes?.temporalHistoryBlendUniform;
  if (!temporalHistoryBlendUniform) {
    return false;
  }

  const remaining = postNodes.temporalHistoryCutFramesRemaining ?? 0;
  if (remaining <= 0) {
    if (temporalHistoryBlendUniform.value !== 1) {
      temporalHistoryBlendUniform.value = 1;
      return true;
    }
    return false;
  }

  const nextRemaining = Math.max(0, remaining - 1);
  postNodes.temporalHistoryCutFramesRemaining = nextRemaining;
  temporalHistoryBlendUniform.value = nextRemaining > 0 ? 0 : 1;
  return true;
}

/**
 * @typedef {import("./outputProfilePolicy.js").PerformanceProfile} PerformanceProfile
 * @typedef {import("./outputProfilePolicy.js").RenderContext} RenderContext
 * @typedef {import("./outputProfilePolicy.js").RenderQualityProfile} RenderQualityProfile
 * @typedef {import("./outputProfilePolicy.js").RenderQualityProfileOverrides} RenderQualityProfileOverrides
 */

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
  const bloomActive = bloomEnabled && bloomPass;
  const effectiveBloomRgb = bloomActive
    ? bloomPass.rgb.mul(deriveBloomRadianceScaleNode(sceneRgb, bloomPass.rgb))
    : null;
  const bloomAlpha = bloomActive
    ? max(max(effectiveBloomRgb.r, effectiveBloomRgb.g), effectiveBloomRgb.b)
        .clamp()
    : float(0.0);
  const finalAlpha = bloomActive
    ? max(sceneAlpha, bloomAlpha).clamp()
    : sceneAlpha;
  const finalRgb = compressDisplayRadianceNode(
    bloomActive ? sceneRgb.add(effectiveBloomRgb) : sceneRgb,
  );

  if (normalizedMode === OUTPUT_MODES.opaque) {
    const opaqueRgb = outputBackgroundNode
      .mul(finalAlpha.oneMinus())
      .add(finalRgb);
    return vec4(opaqueRgb, 1.0);
  }

  return vec4(finalRgb, finalAlpha);
}

export function createRenderOutputPipeline(
  gl,
  scene,
  camera,
  { renderProfile = null } = {},
) {
  if (gl?.backend?.isWebGLBackend === true) {
    return null;
  }

  const resolvedRenderProfile = resolveRenderQualityProfile(
    renderProfile ?? {},
  );
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
  const temporalHistoryBlendUniform = uniform(1);
  const scenePass = pass(scene, camera);
  let sceneColor = null;
  let traaNode = null;
  let traaColor = null;
  let outputSceneColor = null;
  let bloomPass = null;

  if (resolvedRenderProfile.traaEnabled) {
    // Enable velocity MRT so TRAANode can reproject history across frames.
    // `output` must be included so MRTNode.setup() fills index 0 of renderTarget.textures;
    // omitting it leaves members[0] undefined and crashes OutputStructNode.generate().
    // Our sphere has no transform animation (audio drives shader uniforms only),
    // so velocity is zero everywhere — no ghosting risk.
    scenePass.setMRT(mrt({ output, velocity }));

    sceneColor = scenePass.getTextureNode("output");
    const depthNode = scenePass.getTextureNode("depth");
    const velocityNode = scenePass.getTextureNode("velocity");

    // TRAA: temporal reprojection AA with Halton sub-pixel jitter + variance
    // clipping. This is the real frame-accumulation pass; bloom runs on the
    // resolved anti-aliased output so the two effects reinforce each other.
    traaNode = traa(sceneColor, depthNode, velocityNode, camera);
    // useSubpixelCorrection increases current-frame weight when velocity is subpixel —
    // designed for moving objects. Our velocity is always zero, so it adds the "square
    // pattern artifact" the docs warn about without any benefit.
    traaNode.useSubpixelCorrection = false;
    // The raymarched volume writes depth at the first ray hit, not a classical polygon
    // surface. Loosen edgeDepthDiff so TRAA treats fewer ray-march depth transitions as
    // "edges" and uses history more aggressively throughout the volume body.
    traaNode.edgeDepthDiff = 0.005;
    // @ts-ignore — getTextureNode() exists in TRAANode source but is missing from its .d.ts
    traaColor = traaNode.getTextureNode();
    outputSceneColor = mix(sceneColor, traaColor, temporalHistoryBlendUniform);
  } else {
    sceneColor = scenePass.getTextureNode("output");
    traaColor = sceneColor;
    outputSceneColor = sceneColor;
  }

  if (resolvedRenderProfile.bloomAllowed) {
    bloomPass = bloom(
      outputSceneColor,
      /** @type {any} */ (bloomUniforms.strength),
      /** @type {any} */ (bloomUniforms.radius),
      /** @type {any} */ (bloomUniforms.threshold),
    );
  }
  const pipeline = new RenderPipeline(gl);
  const composeOutputNode = ({
    bloomEnabled = RENDER_DEFAULTS.bloomEnabled,
    outputMode = RENDER_DEFAULTS.outputMode,
  } = {}) =>
    composeRenderOutputNode({
      sceneColor: outputSceneColor,
      bloomPass,
      bloomEnabled: bloomEnabled && resolvedRenderProfile.bloomAllowed,
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
      outputSceneColor,
      bloomPass,
      bloomUniforms,
      outputUniforms,
      temporalHistoryBlendUniform,
      temporalHistoryCutFramesRemaining: 0,
      composeOutputNode,
      renderProfile: resolvedRenderProfile,
    },
  };
}

function createOutputCamera(sourceCamera, aspect) {
  if (sourceCamera?.isPerspectiveCamera) {
    const outputCamera = new THREE.PerspectiveCamera();
    syncOutputCamera(outputCamera, sourceCamera, aspect);
    return outputCamera;
  }

  if (sourceCamera?.isOrthographicCamera) {
    const outputCamera = new THREE.OrthographicCamera();
    syncOutputCamera(outputCamera, sourceCamera, aspect);
    return outputCamera;
  }

  return (
    sourceCamera?.clone?.() ?? new THREE.PerspectiveCamera(65, aspect, 0.1, 100)
  );
}

function syncOrthographicOutputCamera(outputCamera, sourceCamera, aspect) {
  const centerX = (sourceCamera.left + sourceCamera.right) * 0.5;
  const centerY = (sourceCamera.top + sourceCamera.bottom) * 0.5;
  const halfHeight = (sourceCamera.top - sourceCamera.bottom) * 0.5;
  const halfWidth = halfHeight * aspect;

  outputCamera.left = centerX - halfWidth;
  outputCamera.right = centerX + halfWidth;
  outputCamera.top = centerY + halfHeight;
  outputCamera.bottom = centerY - halfHeight;
  outputCamera.near = sourceCamera.near;
  outputCamera.far = sourceCamera.far;
  outputCamera.zoom = sourceCamera.zoom;
}

function syncPerspectiveOutputCamera(outputCamera, sourceCamera, aspect) {
  outputCamera.fov = sourceCamera.fov;
  outputCamera.aspect = aspect;
  outputCamera.near = sourceCamera.near;
  outputCamera.far = sourceCamera.far;
  outputCamera.zoom = sourceCamera.zoom;
  outputCamera.focus = sourceCamera.focus;
  outputCamera.filmGauge = sourceCamera.filmGauge;
  outputCamera.filmOffset = sourceCamera.filmOffset;
}

function syncOutputCamera(outputCamera, sourceCamera, aspect) {
  if (!outputCamera || !sourceCamera) {
    return;
  }

  if (outputCamera.isPerspectiveCamera && sourceCamera.isPerspectiveCamera) {
    syncPerspectiveOutputCamera(outputCamera, sourceCamera, aspect);
  } else if (
    outputCamera.isOrthographicCamera &&
    sourceCamera.isOrthographicCamera
  ) {
    syncOrthographicOutputCamera(outputCamera, sourceCamera, aspect);
  }

  outputCamera.layers.mask = sourceCamera.layers.mask;
  outputCamera.position.copy(sourceCamera.position);
  outputCamera.quaternion.copy(sourceCamera.quaternion);
  outputCamera.scale.copy(sourceCamera.scale);
  outputCamera.up.copy(sourceCamera.up);
  outputCamera.matrixAutoUpdate = sourceCamera.matrixAutoUpdate;
  outputCamera.updateProjectionMatrix();
  outputCamera.updateMatrixWorld(true);
}

/**
 * Creates a dedicated production output session that renders the shared scene
 * with a fixed-aspect output camera into an independent render target.
 *
 * @param {any} renderer
 * @param {import("three").Scene} scene
 * @param {import("three").Camera} sourceCamera
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, renderFrame: Function, readPixelsAsync: Function, dispose: Function }}
 */
export function createCaptureOutputSession(
  renderer,
  scene,
  sourceCamera,
  width,
  height,
  { renderProfile = null } = {},
) {
  const aspect = width / height;
  const outputCamera = createOutputCamera(sourceCamera, aspect);
  const pipelineState = createRenderOutputPipeline(
    renderer,
    scene,
    outputCamera,
    { renderProfile },
  );
  const target = new RenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    magFilter: NearestFilter,
    minFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });

  if (!pipelineState) {
    return null;
  }

  return {
    width,
    height,
    renderFrame() {
      syncOutputCamera(outputCamera, sourceCamera, aspect);

      const previousRenderTarget = renderer.getRenderTarget();
      const previousOutputRenderTarget = renderer.getOutputRenderTarget();
      const previousViewport = renderer.getViewport(new THREE.Vector4());
      const previousScissor = renderer.getScissor(new THREE.Vector4());
      const previousScissorTest = renderer.getScissorTest();

      // Temporarily override getSize/getPixelRatio so all PassNodes (scenePass,
      // TRAA, bloom) allocate their internal buffers at the fixed capture
      // resolution instead of reading the live preview canvas size.
      //
      // This avoids setDrawingBufferSize, which calls backend.updateSize() →
      // delete(canvasTarget), causing the WebGPU context getter to re-call
      // context.configure() (which per spec first calls unconfigure()). That
      // unconfigures the swap chain mid-frame, destabilising the main pipeline
      // and crashing on resolution changes.
      const origGetSize = renderer.getSize;
      const origGetPixelRatio = renderer.getPixelRatio;
      renderer.getSize = (target) => {
        if (target) {
          target.set(width, height);
          return target;
        }
        return new THREE.Vector2(width, height);
      };
      renderer.getPixelRatio = () => 1;

      renderer.setRenderTarget(null);
      renderer.setOutputRenderTarget(target);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.setScissorTest(false);
      try {
        pipelineState.pipeline.render();
      } finally {
        renderer.getSize = origGetSize;
        renderer.getPixelRatio = origGetPixelRatio;
        renderer.setOutputRenderTarget(previousOutputRenderTarget);
        renderer.setRenderTarget(previousRenderTarget);
        renderer.setViewport(previousViewport);
        renderer.setScissor(previousScissor);
        renderer.setScissorTest(previousScissorTest);
      }
    },
    readPixelsAsync() {
      return renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
    },
    dispose() {
      pipelineState.postNodes?.traaNode?.dispose?.();
      pipelineState.pipeline.dispose?.();
      target.dispose();
    },
  };
}
