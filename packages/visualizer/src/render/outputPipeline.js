import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { RenderTarget, NearestFilter } from "three/webgpu";
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

export const MIN_PERFORMANCE_TARGET_FPS = 24;
export const MAX_PERFORMANCE_TARGET_FPS = 120;
export const DEFAULT_PERFORMANCE_TARGET_FPS = 60;

export const PERFORMANCE_PROFILES = Object.freeze({
  auto: "auto",
  custom: "custom",
  maxQuality: "max-quality",
});
export const DEFAULT_PERFORMANCE_PROFILE = PERFORMANCE_PROFILES.auto;
export const RENDER_QUALITY_PRESETS = PERFORMANCE_PROFILES;
export const DEFAULT_RENDER_QUALITY_PRESET = DEFAULT_PERFORMANCE_PROFILE;
export const RENDER_CONTEXTS = Object.freeze({
  preview: "preview",
  externalOutput: "external-output",
});

/**
 * @typedef {"auto" | "custom" | "max-quality"} PerformanceProfile
 */

/**
 * @typedef {"preview" | "external-output"} RenderContext
 */

/**
 * @typedef {{
 *   qualityPreset: PerformanceProfile,
 *   targetFps: number,
 *   renderScale: number,
 *   traaEnabled: boolean,
 *   bloomAllowed: boolean,
 *   renderContext: RenderContext,
 * }} RenderQualityProfile
 */

/**
 * @typedef {{
 *   renderScale?: number,
 *   traaEnabled?: boolean,
 *   bloomAllowed?: boolean,
 * }} RenderQualityProfileOverrides
 */

/**
 * @param {unknown} value
 * @returns {PerformanceProfile}
 */
export function normalizePerformanceProfile(value) {
  if (value === PERFORMANCE_PROFILES.custom) {
    return PERFORMANCE_PROFILES.custom;
  }
  if (value === PERFORMANCE_PROFILES.maxQuality || value === "none") {
    return PERFORMANCE_PROFILES.maxQuality;
  }
  return DEFAULT_PERFORMANCE_PROFILE;
}

export const normalizeRenderQualityPreset = normalizePerformanceProfile;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizePerformanceTargetFps(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PERFORMANCE_TARGET_FPS;
  }

  const numericValue = /** @type {number} */ (value);
  return Math.min(
    MAX_PERFORMANCE_TARGET_FPS,
    Math.max(MIN_PERFORMANCE_TARGET_FPS, Math.round(numericValue)),
  );
}

/**
 * @param {unknown} qualityPreset
 * @param {unknown} targetFps
 * @returns {string}
 */
export function formatPerformanceProfileLabel(qualityPreset, targetFps = null) {
  const normalizedPerformanceProfile =
    normalizePerformanceProfile(qualityPreset);

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.custom) {
    return Number.isFinite(targetFps)
      ? `Custom ${normalizePerformanceTargetFps(targetFps)} FPS`
      : "Custom";
  }

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return "Max Quality";
  }

  return "Auto";
}

function resolveOutputResolutionBand(outputWidth, outputHeight) {
  if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight)) {
    return "unknown";
  }

  if (outputWidth >= 3840 || outputHeight >= 2160) {
    return "2160p+";
  }

  if (outputWidth >= 2560 || outputHeight >= 1440) {
    return "1440p";
  }

  return "1080p-";
}

function resolveExternalOutputCustomTargetBand(targetFps) {
  const normalizedTargetFps = normalizePerformanceTargetFps(targetFps);

  if (normalizedTargetFps <= 48) {
    return "24-48";
  }
  if (normalizedTargetFps <= 72) {
    return "49-72";
  }
  if (normalizedTargetFps <= 96) {
    return "73-96";
  }
  return "97-120";
}

function buildRenderQualityProfile({
  qualityPreset,
  targetFps,
  renderScale,
  traaEnabled,
  bloomAllowed = true,
  renderContext,
}) {
  return {
    qualityPreset,
    targetFps,
    renderScale,
    traaEnabled,
    bloomAllowed,
    renderContext,
  };
}

function resolveExternalOutputProfile({
  normalizedPerformanceProfile,
  resolvedTargetFps,
  outputWidth,
  outputHeight,
}) {
  const resolutionBand = resolveOutputResolutionBand(outputWidth, outputHeight);

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
      renderScale: 1,
      traaEnabled: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  }

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.auto) {
    if (resolutionBand === "2160p+") {
      return buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
        renderScale: 0.67,
        traaEnabled: false,
        renderContext: RENDER_CONTEXTS.externalOutput,
      });
    }
    if (resolutionBand === "1440p") {
      return buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
        renderScale: 0.75,
        traaEnabled: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      });
    }
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
      renderScale: 0.84,
      traaEnabled: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  }

  const targetBand = resolveExternalOutputCustomTargetBand(resolvedTargetFps);
  if (targetBand === "24-48") {
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: resolvedTargetFps,
      renderScale: resolutionBand === "2160p+" ? 0.84 : 1,
      traaEnabled: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  }
  if (targetBand === "49-72") {
    if (resolutionBand === "2160p+") {
      return buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: resolvedTargetFps,
        renderScale: 0.75,
        traaEnabled: false,
        renderContext: RENDER_CONTEXTS.externalOutput,
      });
    }
    if (resolutionBand === "1440p") {
      return buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: resolvedTargetFps,
        renderScale: 0.84,
        traaEnabled: true,
        renderContext: RENDER_CONTEXTS.externalOutput,
      });
    }
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: resolvedTargetFps,
      renderScale: 0.92,
      traaEnabled: true,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  }
  if (targetBand === "73-96") {
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: resolvedTargetFps,
      renderScale: resolutionBand === "1080p-" ? 0.75 : 0.67,
      traaEnabled: resolutionBand === "1080p-",
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  }

  return buildRenderQualityProfile({
    qualityPreset: normalizedPerformanceProfile,
    targetFps: resolvedTargetFps,
    renderScale: 0.67,
    traaEnabled: false,
    renderContext: RENDER_CONTEXTS.externalOutput,
  });
}

/**
 * @param {RenderQualityProfile} profile
 * @param {RenderQualityProfileOverrides | null | undefined} overrides
 * @returns {RenderQualityProfile}
 */
export function applyRenderQualityProfileOverrides(profile, overrides) {
  if (!profile || !overrides) {
    return profile;
  }

  const nextProfile = { ...profile };
  if (Number.isFinite(overrides.renderScale) && overrides.renderScale > 0) {
    nextProfile.renderScale = overrides.renderScale;
  }
  if (typeof overrides.traaEnabled === "boolean") {
    nextProfile.traaEnabled = overrides.traaEnabled;
  }
  if (typeof overrides.bloomAllowed === "boolean") {
    nextProfile.bloomAllowed = overrides.bloomAllowed;
  }

  return nextProfile;
}

/**
 * @param {{
 *   qualityPreset?: PerformanceProfile,
 *   targetFps?: number,
 *   outputWidth?: number,
 *   outputHeight?: number,
 *   overrides?: RenderQualityProfileOverrides | null,
 *   renderScale?: number,
 *   traaEnabled?: boolean,
 *   bloomAllowed?: boolean,
 *   renderContext?: RenderContext,
 * }=} param0
 * @returns {RenderQualityProfile}
 */
export function resolveRenderQualityProfile({
  qualityPreset = DEFAULT_PERFORMANCE_PROFILE,
  targetFps = DEFAULT_PERFORMANCE_TARGET_FPS,
  outputWidth = 0,
  outputHeight = 0,
  overrides = null,
  renderScale,
  traaEnabled,
  bloomAllowed,
  renderContext = RENDER_CONTEXTS.preview,
} = {}) {
  const effectiveOverrides =
    overrides ??
    (Number.isFinite(renderScale) ||
    typeof traaEnabled === "boolean" ||
    typeof bloomAllowed === "boolean"
      ? {
          renderScale,
          traaEnabled,
          bloomAllowed,
        }
      : null);
  const normalizedPerformanceProfile =
    normalizePerformanceProfile(qualityPreset);
  const resolvedTargetFps =
    normalizedPerformanceProfile === PERFORMANCE_PROFILES.custom
      ? normalizePerformanceTargetFps(targetFps)
      : DEFAULT_PERFORMANCE_TARGET_FPS;
  if (renderContext === RENDER_CONTEXTS.externalOutput) {
    return applyRenderQualityProfileOverrides(
      resolveExternalOutputProfile({
        normalizedPerformanceProfile,
        resolvedTargetFps,
        outputWidth,
        outputHeight,
      }),
      effectiveOverrides,
    );
  }

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return applyRenderQualityProfileOverrides(
      buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
        renderScale: 1,
        traaEnabled: true,
        renderContext,
      }),
      effectiveOverrides,
    );
  }

  const isHighResolutionOutput =
    Number.isFinite(outputWidth) &&
    Number.isFinite(outputHeight) &&
    (outputWidth >= 3840 || outputHeight >= 2160);
  if (isHighResolutionOutput) {
    return applyRenderQualityProfileOverrides(
      buildRenderQualityProfile({
        qualityPreset: normalizedPerformanceProfile,
        targetFps: resolvedTargetFps,
        renderScale: 0.75,
        traaEnabled: false,
        renderContext,
      }),
      effectiveOverrides,
    );
  }

  return applyRenderQualityProfileOverrides(
    buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: resolvedTargetFps,
      renderScale: 1,
      traaEnabled: true,
      renderContext,
    }),
    effectiveOverrides,
  );
}

export function getRenderQualityProfileKey(profile) {
  return [
    normalizePerformanceProfile(profile?.qualityPreset),
    profile?.renderScale ?? 1,
    profile?.traaEnabled === false ? "no-traa" : "traa",
    profile?.bloomAllowed === false ? "no-bloom" : "bloom",
  ].join(":");
}

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
  const bloomActive = bloomEnabled && bloomPass;
  const bloomAlpha = bloomActive
    ? max(max(bloomPass.r, bloomPass.g), bloomPass.b).clamp()
    : float(0.0);
  const finalAlpha = bloomActive
    ? max(sceneAlpha, bloomAlpha).clamp()
    : sceneAlpha;
  const finalRgb = bloomActive ? sceneRgb.add(bloomPass.rgb) : sceneRgb;

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
  const scenePass = pass(scene, camera);
  let sceneColor = null;
  let traaNode = null;
  let traaColor = null;
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
  } else {
    sceneColor = scenePass.getTextureNode("output");
    traaColor = sceneColor;
  }

  if (resolvedRenderProfile.bloomAllowed) {
    bloomPass = bloom(
      traaColor,
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
      sceneColor: traaColor,
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
      bloomPass,
      bloomUniforms,
      outputUniforms,
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
