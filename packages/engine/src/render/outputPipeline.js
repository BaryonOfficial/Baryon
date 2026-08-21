import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { RenderTarget, NearestFilter } from "three/webgpu";
import {
  convertToTexture,
  float,
  max,
  mix,
  mrt,
  output,
  pass,
  uniform,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { RENDER_DEFAULTS } from "../defaults.js";
import {
  composeFixedOpticalPsfRadianceNode,
  compressDisplayRadianceNode,
  FIXED_OPTICAL_PSF_HALO_FRACTION,
  sampleFixedOpticalPsfNode,
} from "./displayRadiance.js";
import { pairedBloom } from "./pairedBloomNode.js";
import { fusedSmaa } from "./fusedSmaaNode.js";
import {
  OUTPUT_MODES,
  RENDER_CONTEXTS,
  normalizeOutputMode,
  normalizeResolvedRenderQualityProfile,
  resolveRenderQualityProfile,
} from "./outputProfilePolicy.js";
import {
  raymarchAccentLightNode,
  raymarchBaseLightNode,
  raymarchTransmittanceNode,
} from "../core/raymarch/SafeVolumetricLightingModel.js";

const { RenderPipeline } = /** @type {any} */ (THREEWebGPU);

export * from "./outputProfilePolicy.js";

const DEFAULT_CAMERA_CUT_TEMPORAL_BYPASS_FRAMES = 2;
const DEFAULT_CONTENT_CHANGE_TEMPORAL_BYPASS_FRAMES = 2;
const DEFAULT_OUTPUT_SMAA_ENABLED = Boolean(RENDER_DEFAULTS.smaaEnabled);
const OUTPUT_TOPOLOGY_KEY_FIELD = "__baryonOutputTopologyKey";
const OUTPUT_TOPOLOGY_TEMPORAL_FIELD = "__baryonOutputTopologyTemporalEnabled";
const OUTPUT_TOPOLOGY_SMAA_FIELD = "__baryonOutputTopologySmaaEnabled";

export const CHECKPOINT_AOV_MODES = Object.freeze({
  off: "off",
  base: "base",
  current: "current",
});

function normalizeCheckpointAovMode(mode) {
  if (mode === CHECKPOINT_AOV_MODES.base) {
    return CHECKPOINT_AOV_MODES.base;
  }
  if (mode === CHECKPOINT_AOV_MODES.current) {
    return CHECKPOINT_AOV_MODES.current;
  }
  return CHECKPOINT_AOV_MODES.off;
}

const BASE_CHECKPOINT_AOV_NAMES = Object.freeze([
  "baseRadiance",
  "transmittance",
  "coverage",
]);
const CURRENT_CHECKPOINT_AOV_NAMES = Object.freeze([
  ...BASE_CHECKPOINT_AOV_NAMES,
  "accentRadiance",
]);
// Coverage is exactly saturate(1 - T) in the volume recurrence, so it is
// derived losslessly from the transmittance attachment at readback instead
// of occupying a fifth color attachment: WebGPU's baseline budget is 32
// bytes per sample and output + base + transmittance + accent already fill
// it at rgba16float.
const BASE_CHECKPOINT_ATTACHMENT_NAMES = Object.freeze([
  "baseRadiance",
  "transmittance",
]);
const CURRENT_CHECKPOINT_ATTACHMENT_NAMES = Object.freeze([
  ...BASE_CHECKPOINT_ATTACHMENT_NAMES,
  "accentRadiance",
]);

function checkpointAovNamesForMode(mode) {
  if (mode === CHECKPOINT_AOV_MODES.base) {
    return BASE_CHECKPOINT_AOV_NAMES;
  }
  if (mode === CHECKPOINT_AOV_MODES.current) {
    return CURRENT_CHECKPOINT_AOV_NAMES;
  }
  return null;
}

function checkpointAttachmentNamesForMode(mode) {
  if (mode === CHECKPOINT_AOV_MODES.base) {
    return BASE_CHECKPOINT_ATTACHMENT_NAMES;
  }
  if (mode === CHECKPOINT_AOV_MODES.current) {
    return CURRENT_CHECKPOINT_ATTACHMENT_NAMES;
  }
  return null;
}

// Identity strings recorded in frozen-field descriptors and checkpoint
// evidence. They name the production volume pass this pipeline routes; a
// kernel or attachment change must bump them so sealed evidence cannot be
// silently reinterpreted.
export const CHECKPOINT_PRODUCTION_IDENTITIES = Object.freeze({
  volumeKernelIdentity: "safe-volumetric-carrier-emission-extinction/v2",
  stepControllerIdentity: "adaptive-error-half-step/v1",
  attachmentFormat: "rgba16float",
  baseAovIdentities: BASE_CHECKPOINT_AOV_NAMES,
  currentAovIdentities: CURRENT_CHECKPOINT_AOV_NAMES,
});

function configureCheckpointAovTextureNode(textureNode) {
  const texture = textureNode?.value;
  if (!texture) {
    return textureNode;
  }
  texture.type = THREE.HalfFloatType;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return textureNode;
}

function createCheckpointAovOutputs(mode) {
  const outputs = {
    baseRadiance: vec4(raymarchBaseLightNode, 1),
    transmittance: vec4(vec3(raymarchTransmittanceNode), 1),
  };
  if (mode === CHECKPOINT_AOV_MODES.current) {
    outputs.accentRadiance = vec4(raymarchAccentLightNode, 1);
  }
  return outputs;
}

function findRenderTargetTextureIndex(renderTarget, name) {
  return (
    renderTarget?.textures?.findIndex((texture) => texture?.name === name) ?? -1
  );
}

export async function readRenderOutputCheckpointAovsAsync(
  renderer,
  postNodes,
  width,
  height,
) {
  const aovMode = normalizeCheckpointAovMode(postNodes?.checkpointAovMode);
  const aovNames = checkpointAovNamesForMode(aovMode);
  if (!aovNames) {
    return null;
  }

  const renderTarget = postNodes?.scenePass?.renderTarget;
  if (!renderTarget) {
    throw new Error("Checkpoint AOV render target is unavailable.");
  }
  if (renderTarget.width !== width || renderTarget.height !== height) {
    throw new Error(
      `Checkpoint AOV render target is ${renderTarget.width}x${renderTarget.height}, expected ${width}x${height}; refusing a cropped or out-of-range readback.`,
    );
  }

  const readAttachment = async (name) => {
    const textureIndex = findRenderTargetTextureIndex(renderTarget, name);
    if (textureIndex < 0) {
      throw new Error(`Checkpoint AOV attachment is unavailable: ${name}`);
    }
    const texture = renderTarget.textures[textureIndex];
    const pixels = await renderer.readRenderTargetPixelsAsync(
      renderTarget,
      0,
      0,
      width,
      height,
      textureIndex,
    );
    return { pixels, textureType: texture.type };
  };

  const attachmentNames = checkpointAttachmentNamesForMode(aovMode);
  const attachments = await Promise.all(attachmentNames.map(readAttachment));
  const result =
    /** @type {Record<string, any> & { width: number, height: number }} */ ({
      width,
      height,
      ...Object.fromEntries(
        attachmentNames.map((name, index) => [name, attachments[index]]),
      ),
    });
  result.coverage = deriveCoverageFromTransmittance(result.transmittance);
  for (const name of aovNames) {
    if (!result[name]) {
      throw new Error(`Checkpoint AOV is unavailable after readback: ${name}`);
    }
  }
  return result;
}

function halfToFloat(half) {
  const sign = (half & 0x8000) >> 15 ? -1 : 1;
  const exponent = (half & 0x7c00) >> 10;
  const fraction = half & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction ? Number.NaN : sign * Infinity;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/**
 * The volume recurrence defines coverage as saturate(1 - T); reconstructing
 * it from the transmittance attachment is exact algebra, not a re-render, so
 * checkpoint evidence keeps its coverage AOV without a fifth color
 * attachment.
 */
function deriveCoverageFromTransmittance(transmittance) {
  const pixels = transmittance.pixels;
  const coverage = new Float32Array(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    const value =
      pixels instanceof Float32Array || pixels instanceof Float64Array
        ? pixels[index]
        : halfToFloat(pixels[index]);
    const clamped = Math.min(1, Math.max(0, 1 - value));
    coverage[index] = clamped;
    coverage[index + 1] = clamped;
    coverage[index + 2] = clamped;
    coverage[index + 3] = 1;
  }
  return { pixels: coverage, textureType: THREE.FloatType };
}

function resolveOutputTopologyKey({
  carrierTruthEnabled = false,
  outputMode,
  smaaEnabled,
  temporalHistoryEnabled,
}) {
  if (carrierTruthEnabled) {
    return `carrier-truth:${outputMode}`;
  }

  return `${outputMode}:${temporalHistoryEnabled ? 1 : 0}:${
    smaaEnabled ? 1 : 0
  }`;
}

function resolveOutputSmaaEnabled(postNodes, smaaEnabled) {
  if (postNodes?.carrierTruthEnabled === true) {
    return false;
  }
  if (typeof smaaEnabled === "boolean") {
    return smaaEnabled;
  }
  if (typeof postNodes?.[OUTPUT_TOPOLOGY_SMAA_FIELD] === "boolean") {
    return postNodes[OUTPUT_TOPOLOGY_SMAA_FIELD];
  }
  return DEFAULT_OUTPUT_SMAA_ENABLED;
}

function resolveOutputSmaaGraphEnabled(postNodes, smaaEnabled, outputMode) {
  const requested = resolveOutputSmaaEnabled(postNodes, smaaEnabled);
  const transparentOutput =
    normalizeOutputMode(outputMode) === OUTPUT_MODES.transparent;

  // Three's display SMAA path blends coverage with color. On transparent
  // program output that changes composited brightness, so preserve the
  // canonical premultiplied RGBA edge instead of antialiasing it twice.
  return requested && !transparentOutput;
}

function disposeRenderOutputSmaaNodes(postNodes) {
  const smaaNodes = new Set(
    postNodes?.smaaNodes?.values?.() ??
      (postNodes?.smaaNode ? [postNodes.smaaNode] : []),
  );
  if (postNodes?.smaaNode) {
    smaaNodes.add(postNodes.smaaNode);
  }
  for (const smaaNode of smaaNodes) {
    smaaNode.dispose?.();
  }
  postNodes?.smaaNodes?.clear?.();
  if (postNodes) {
    postNodes.smaaNode = null;
  }
  return smaaNodes.size > 0;
}

function composeRenderOutputSmaaNode(
  postNodes,
  linearOutputNode,
  topologyKey,
  smaaEnabled,
) {
  if (!smaaEnabled) {
    postNodes.smaaNode = null;
    return linearOutputNode;
  }

  const smaaNodes = postNodes.smaaNodes ?? new Map();
  postNodes.smaaNodes = smaaNodes;
  let smaaNode = smaaNodes.get(topologyKey);
  if (!smaaNode) {
    smaaNode = fusedSmaa(linearOutputNode);
    smaaNodes.set(topologyKey, smaaNode);
  }
  postNodes.smaaNode = smaaNode;
  return smaaNode;
}

function getRenderDisplayLinearTextureNode(
  postNodes,
  topologyKey,
  displayLinearOutputNode,
) {
  let textureNode = postNodes.displayLinearTextureNodes.get(topologyKey);
  if (!textureNode) {
    // SMAA's documented boundary is before sRGB conversion. Baryon's display
    // shoulder runs on the authoritative integrated radiance before that
    // conversion. Both toggle branches then read this exact linear-display
    // RGBA texture without alpha or RGB surgery.
    textureNode = convertToTexture(displayLinearOutputNode, null, null, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
    });
    textureNode.value.name = `Baryon.displayLinear.${topologyKey}`;
    postNodes.displayLinearTextureNodes.set(topologyKey, textureNode);
  }
  return textureNode;
}

function disposeRenderTextureNode(textureNode) {
  if (!textureNode) {
    return;
  }
  if (typeof textureNode.dispose === "function") {
    textureNode.dispose();
    return;
  }
  // Three's RTTNode currently exposes no public dispose method even though
  // it owns both resources. Release them at the Baryon owner boundary.
  textureNode.renderTarget?.dispose?.();
  textureNode._quadMesh?.material?.dispose?.();
}

function disposeRenderDisplayLinearTextureNodes(postNodes) {
  for (const textureNode of postNodes?.displayLinearTextureNodes?.values?.() ??
    []) {
    disposeRenderTextureNode(textureNode);
  }
  postNodes?.displayLinearTextureNodes?.clear?.();
}

export function disposeRenderOutputPostNodes(postNodes) {
  disposeRenderOutputSmaaNodes(postNodes);
  disposeRenderDisplayLinearTextureNodes(postNodes);
  // The optics lane materializes the temporal blend into its own target when
  // TRAA is active; it is owned here, not by the display-linear cache.
  if (postNodes?.opticsSourceTextureNode) {
    disposeRenderTextureNode(postNodes.opticsSourceTextureNode);
    postNodes.opticsSourceTextureNode = null;
  }
  for (const bloomPass of getRenderOutputBloomPasses(postNodes)) {
    bloomPass.dispose?.();
  }
  postNodes?.traaNode?.dispose?.();
}

export function getRenderOutputSmaaGraphEnabled(postNodes) {
  return Boolean(postNodes?.smaaNode);
}

export function getRenderOutputCarrierTruthEnabled(postNodes) {
  return postNodes?.carrierTruthEnabled === true;
}

function resolveOutputTemporalHistoryEnabled(
  postNodes,
  temporalHistoryEnabled,
) {
  if (!postNodes?.traaNode) {
    return false;
  }
  if (typeof temporalHistoryEnabled === "boolean") {
    return temporalHistoryEnabled;
  }
  if (typeof postNodes[OUTPUT_TOPOLOGY_TEMPORAL_FIELD] === "boolean") {
    return postNodes[OUTPUT_TOPOLOGY_TEMPORAL_FIELD];
  }
  return true;
}

export function getRenderOutputTemporalHistoryGraphEnabled(postNodes) {
  if (!postNodes?.traaNode) {
    return false;
  }
  return postNodes[OUTPUT_TOPOLOGY_TEMPORAL_FIELD] ?? null;
}

function getRenderOutputBloomPasses(postNodes) {
  if (Array.isArray(postNodes?.bloomPasses) && postNodes.bloomPasses.length) {
    return [...new Set(postNodes.bloomPasses.filter(Boolean))];
  }
  return postNodes?.bloomPass ? [postNodes.bloomPass] : [];
}

function resolvePipelineRenderProfile(renderProfile) {
  if (
    renderProfile &&
    typeof renderProfile === "object" &&
    Object.prototype.hasOwnProperty.call(renderProfile, "targetFps")
  ) {
    return normalizeResolvedRenderQualityProfile(renderProfile);
  }

  return resolveRenderQualityProfile(renderProfile ?? {});
}

/**
 * @param {({ bloomUniforms?: { enabled?: { value: number } } } & Record<string, unknown>) | null | undefined} postNodes
 * @param {{
 *   enabled?: boolean,
 *   strength?: number,
 *   radius?: number,
 *   threshold?: number,
 * }} values
 */
export function syncRenderOutputBloomUniforms(
  postNodes,
  { enabled, strength, radius, threshold },
) {
  if (typeof enabled === "boolean" && postNodes?.bloomUniforms?.enabled) {
    postNodes.bloomUniforms.enabled.value = enabled ? 1 : 0;
  }

  for (const bloomPass of getRenderOutputBloomPasses(postNodes)) {
    if (strength !== undefined) {
      bloomPass.strength.value = strength;
    }
    if (radius !== undefined) {
      bloomPass.radius.value = radius;
    }
    if (threshold !== undefined) {
      bloomPass.threshold.value = threshold;
    }
  }
}

export function syncRenderOutputNodeTopology(
  pipeline,
  postNodes,
  { outputMode, temporalHistoryEnabled = undefined, smaaEnabled = undefined },
) {
  if (!pipeline || !postNodes) {
    return false;
  }

  const resolvedTemporalHistoryEnabled = resolveOutputTemporalHistoryEnabled(
    postNodes,
    temporalHistoryEnabled,
  );
  const resolvedSmaaEnabled = resolveOutputSmaaGraphEnabled(
    postNodes,
    smaaEnabled,
    outputMode,
  );
  const nextTopologyKey = resolveOutputTopologyKey({
    carrierTruthEnabled: postNodes.carrierTruthEnabled,
    outputMode,
    temporalHistoryEnabled: resolvedTemporalHistoryEnabled,
    smaaEnabled: resolvedSmaaEnabled,
  });
  if (postNodes?.[OUTPUT_TOPOLOGY_KEY_FIELD] === nextTopologyKey) {
    return false;
  }

  const { sceneColor, composeOutputNode } = postNodes ?? {};
  pipeline.outputNode = composeOutputNode
    ? composeOutputNode({
        outputMode,
        temporalHistoryEnabled: resolvedTemporalHistoryEnabled,
        smaaEnabled: resolvedSmaaEnabled,
      })
    : sceneColor;
  pipeline.needsUpdate = true;
  postNodes[OUTPUT_TOPOLOGY_KEY_FIELD] = nextTopologyKey;
  postNodes[OUTPUT_TOPOLOGY_TEMPORAL_FIELD] = resolvedTemporalHistoryEnabled;
  postNodes[OUTPUT_TOPOLOGY_SMAA_FIELD] = resolvedSmaaEnabled;
  return true;
}

function markRenderOutputTemporalHistoryBypass(postNodes, frames) {
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

export function markRenderOutputCameraCut(
  postNodes,
  frames = DEFAULT_CAMERA_CUT_TEMPORAL_BYPASS_FRAMES,
) {
  return markRenderOutputTemporalHistoryBypass(postNodes, frames);
}

export function markRenderOutputContentChange(
  postNodes,
  frames = DEFAULT_CONTENT_CHANGE_TEMPORAL_BYPASS_FRAMES,
) {
  return markRenderOutputTemporalHistoryBypass(postNodes, frames);
}

export function markRenderOutputVisualIdle(
  postNodes,
  frames = DEFAULT_CONTENT_CHANGE_TEMPORAL_BYPASS_FRAMES,
) {
  if (!postNodes) {
    return false;
  }

  postNodes.visualIdleFinalized = true;
  return markRenderOutputTemporalHistoryBypass(postNodes, frames);
}

export function consumeRenderOutputVisualIdle(postNodes) {
  if (postNodes?.visualIdleFinalized !== true) {
    return false;
  }

  postNodes.visualIdleFinalized = false;
  return true;
}

export function advanceRenderOutputTemporalHistoryBypass(postNodes) {
  const temporalHistoryBlendUniform = postNodes?.temporalHistoryBlendUniform;
  if (!temporalHistoryBlendUniform) {
    return false;
  }

  if (postNodes?.visualIdleFinalized === true) {
    const previousValue = temporalHistoryBlendUniform.value;
    const previousRemaining = postNodes.temporalHistoryCutFramesRemaining ?? 0;
    temporalHistoryBlendUniform.value = 0;
    postNodes.temporalHistoryCutFramesRemaining = Math.max(
      1,
      previousRemaining,
    );
    return previousValue !== 0 || previousRemaining <= 0;
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
 * @typedef {import("./outputProfilePolicy.js").RenderPostProcessOverrides} RenderPostProcessOverrides
 * @typedef {"off" | "base" | "current"} CheckpointAovMode
 * @typedef {{ renderProfile?: unknown, checkpointAovMode?: CheckpointAovMode }} RenderOutputPipelineOptions
 */

/**
 * Builds the scene-referred, premultiplied linear-HDR output. Spatial filters
 * must consume this representation so toggling them cannot select a different
 * tone-mapping or color-conversion path.
 */
function composeRenderLinearOutputNode({
  sceneColor,
  opticalPsfPass,
  bloomPass,
  bloomEnabledNode,
}) {
  const sceneRgb = sceneColor.rgb;
  const sceneAlpha = sceneColor.a;
  const opticalPsfActive = Boolean(opticalPsfPass);
  const psfRadiance = opticalPsfActive
    ? composeFixedOpticalPsfRadianceNode(sceneRgb, opticalPsfPass.rgb)
    : sceneRgb;
  const bloomActive = Boolean(bloomPass);
  const bloomRadiance = bloomActive
    ? bloomPass.rgb.mul(bloomEnabledNode)
    : null;
  const linearRadiance = bloomRadiance
    ? psfRadiance.add(bloomRadiance)
    : psfRadiance;
  const psfHaloRgb = opticalPsfActive
    ? opticalPsfPass.rgb.mul(float(FIXED_OPTICAL_PSF_HALO_FRACTION))
    : null;
  const psfAlpha = opticalPsfActive
    ? max(max(psfHaloRgb.r, psfHaloRgb.g), psfHaloRgb.b).clamp()
    : float(0.0);
  const opticalPsfAlpha = opticalPsfActive
    ? max(sceneAlpha, psfAlpha).clamp()
    : sceneAlpha;
  const bloomAlpha = bloomRadiance
    ? max(max(bloomRadiance.r, bloomRadiance.g), bloomRadiance.b).clamp()
    : float(0.0);
  const finalAlpha = bloomRadiance
    ? max(opticalPsfAlpha, bloomAlpha).clamp()
    : opticalPsfAlpha;

  return vec4(linearRadiance, finalAlpha);
}

function composeRenderDisplayOutputNode({
  linearOutputNode,
  outputMode,
  outputBackgroundNode,
}) {
  const normalizedMode = normalizeOutputMode(outputMode);
  // RGB is integrated scene radiance after fixed optics and bloom. Its
  // display transfer must not depend on the separately derived coverage
  // channel, or transparent program output becomes dimmer than the same
  // authoritative frame shown over black in the operator preview.
  const finalRgb = compressDisplayRadianceNode(linearOutputNode.rgb);

  if (normalizedMode === OUTPUT_MODES.opaque) {
    const opaqueRgb = outputBackgroundNode.add(finalRgb);
    return vec4(opaqueRgb, 1.0);
  }

  return vec4(finalRgb, linearOutputNode.a);
}

export function composeRenderOutputNode({
  sceneColor,
  opticalPsfPass,
  bloomPass,
  bloomEnabledNode,
  outputMode,
  outputBackgroundNode,
}) {
  const linearOutputNode = composeRenderLinearOutputNode({
    sceneColor,
    opticalPsfPass,
    bloomPass,
    bloomEnabledNode,
  });

  return composeRenderDisplayOutputNode({
    linearOutputNode,
    outputMode,
    outputBackgroundNode,
  });
}

/**
 * Output pipeline for the WebGL fallback.
 *
 * Only two things in the full chain are genuinely WebGPU-coupled: TRAA, which
 * needs a velocity MRT attachment, and SMAA, which sits behind it. Everything
 * else reads straight off the scene colour and runs anywhere.
 *
 * The display transfer is not one of them. The lighting model integrates HDR
 * scene radiance by contract, so a frame that reaches the canvas without
 * `compressDisplayRadiance` is not a plainer image — it is a wrong one. Every
 * channel clips independently at one, which turns saturated structure grey and
 * crushes everything below it. That reads as a washed-out, desaturated render
 * rather than as an obvious failure, which is why it survived this long.
 *
 * So the fallback carries the display transfer, the fixed optical PSF and
 * bloom — the PSF because it models the instrument rather than decorating it,
 * and bloom because its budgets were measured against a display-compressed
 * scene and dropping it changes the look rather than simplifying it. It
 * composes through the same `composeRenderOutputNode` as the full path, so
 * every one of those transforms keeps a single owner.
 *
 * @param {any} gl
 * @param {import("three").Scene} scene
 * @param {import("three").Camera} camera
 * @param {{ outputMode?: string, renderProfile?: any }} [options]
 */
export function createFallbackRenderOutputPipeline(
  gl,
  scene,
  camera,
  { outputMode = RENDER_DEFAULTS.outputMode, renderProfile = null } = {},
) {
  if (gl?.backend?.isWebGLBackend !== true) {
    return null;
  }

  const resolvedRenderProfile = resolvePipelineRenderProfile(renderProfile);
  const bloomUniforms = {
    enabled: uniform(RENDER_DEFAULTS.bloomEnabled ? 1 : 0),
    strength: uniform(RENDER_DEFAULTS.bloomStrength),
    radius: uniform(RENDER_DEFAULTS.bloomRadius),
    threshold: uniform(RENDER_DEFAULTS.bloomThreshold),
  };
  const outputUniforms = {
    backgroundColor: uniform(
      new THREE.Color(RENDER_DEFAULTS.outputBackgroundColor),
    ),
  };
  // The fallback has no depth consumer: volume and idle presentation are
  // mutually exclusive, the idle materials do not write depth, and neither
  // fixed optics nor bloom reads it. Avoid allocating and clearing a
  // full-resolution attachment.
  const scenePass = pass(scene, camera, { depthBuffer: false });
  const sceneColor = scenePass.getTextureNode("output");
  // No TRAA here, so both optics lanes read the scene colour directly rather
  // than the temporal blend the full path materialises for them.
  const opticalPsfPass = sampleFixedOpticalPsfNode(sceneColor);
  const bloomPass = resolvedRenderProfile.bloomAllowed
    ? pairedBloom(
        sceneColor,
        /** @type {any} */ (bloomUniforms.strength),
        /** @type {any} */ (bloomUniforms.radius),
        /** @type {any} */ (bloomUniforms.threshold),
      )
    : null;
  const pipeline = new RenderPipeline(gl);
  const composeOutputNode = ({ outputMode: mode = outputMode } = {}) =>
    composeRenderOutputNode({
      sceneColor,
      opticalPsfPass,
      bloomPass,
      bloomEnabledNode: bloomUniforms.enabled,
      outputMode: mode,
      outputBackgroundNode: outputUniforms.backgroundColor,
    });

  pipeline.outputNode = composeOutputNode();
  pipeline.needsUpdate = true;

  return {
    pipeline,
    // Narrow on purpose: no traaNode and no smaaNode, so the callers that sync
    // temporal history and SMAA topology see the node they need is absent and
    // no-op, rather than being handed stubs that silently accept writes.
    postNodes: {
      scenePass,
      sceneColor,
      opticalPsfPass,
      bloomPass,
      bloomPasses: [bloomPass].filter(Boolean),
      composeOutputNode,
      bloomUniforms,
      outputUniforms,
      fallbackOutputPipeline: true,
    },
  };
}

/**
 * @param {any} gl
 * @param {import("three").Scene} scene
 * @param {import("three").Camera} camera
 * @param {RenderOutputPipelineOptions} [options]
 */
export function createRenderOutputPipeline(
  gl,
  scene,
  camera,
  { renderProfile = null, checkpointAovMode = CHECKPOINT_AOV_MODES.off } = {},
) {
  if (gl?.backend?.isWebGLBackend === true) {
    return null;
  }

  const resolvedCheckpointAovMode =
    normalizeCheckpointAovMode(checkpointAovMode);
  const requestedRenderProfile = resolvePipelineRenderProfile(renderProfile);
  // Checkpoint captures are single-frame evidence renders: temporal history
  // is meaningless there, and TRAA's velocity attachment would make the
  // scene MRT five rgba16float attachments (40 bytes per sample), over
  // WebGPU's 32-byte baseline budget — render pipeline creation then fails
  // validation and every attachment reads back zero.
  const resolvedRenderProfile =
    resolvedCheckpointAovMode !== CHECKPOINT_AOV_MODES.off &&
    requestedRenderProfile.traaEnabled
      ? { ...requestedRenderProfile, traaEnabled: false }
      : requestedRenderProfile;
  const carrierTruthEnabled =
    resolvedRenderProfile.carrierTruthEnabled === true;
  const defaultOutputMode =
    carrierTruthEnabled ||
    resolvedRenderProfile.renderContext === RENDER_CONTEXTS.externalOutput
      ? RENDER_DEFAULTS.outputMode
      : OUTPUT_MODES.opaque;
  const bloomUniforms = {
    enabled: uniform(RENDER_DEFAULTS.bloomEnabled ? 1 : 0),
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
  const temporalReprojectionEnabled =
    !carrierTruthEnabled && resolvedRenderProfile.traaEnabled;
  // TRAA is the sole scene-depth reader. Checkpoint, carrier-truth and regular
  // non-temporal renders therefore keep the scene pass color-only.
  const scenePass = pass(scene, camera, {
    depthBuffer: temporalReprojectionEnabled,
  });
  const sceneMrtOutputs = { output };
  if (temporalReprojectionEnabled) {
    sceneMrtOutputs.velocity = velocity;
  }
  const checkpointAttachmentNames = checkpointAttachmentNamesForMode(
    resolvedCheckpointAovMode,
  );
  if (checkpointAttachmentNames) {
    Object.assign(
      sceneMrtOutputs,
      createCheckpointAovOutputs(resolvedCheckpointAovMode),
    );
  }
  if (Object.keys(sceneMrtOutputs).length > 1) {
    scenePass.setMRT(mrt(sceneMrtOutputs));
  }
  const checkpointAovs = checkpointAttachmentNames
    ? Object.fromEntries(
        checkpointAttachmentNames.map((name) => [
          name,
          configureCheckpointAovTextureNode(scenePass.getTextureNode(name)),
        ]),
      )
    : null;
  let sceneColor = null;
  let traaNode = null;
  let traaColor = null;
  let outputSceneColor = null;
  let opticalPsfPass = null;
  let bloomPass = null;
  const postNodes = {
    scenePass,
    sceneColor: null,
    traaNode: null,
    traaColor: null,
    outputSceneColor: null,
    opticalPsfPass: null,
    opticsSourceTextureNode: null,
    bloomPass: null,
    bloomPasses: [],
    bloomUniforms,
    outputUniforms,
    temporalHistoryBlendUniform,
    temporalHistoryCutFramesRemaining: 0,
    composeOutputNode: null,
    smaaNode: null,
    smaaNodes: new Map(),
    displayLinearTextureNodes: new Map(),
    carrierTruthEnabled,
    renderProfile: resolvedRenderProfile,
    checkpointAovMode: resolvedCheckpointAovMode,
    checkpointAovs,
  };

  if (temporalReprojectionEnabled) {
    // Enable velocity MRT so TRAANode can reproject history across frames.
    // `output` must be included so MRTNode.setup() fills index 0 of renderTarget.textures;
    // omitting it leaves members[0] undefined and crashes OutputStructNode.generate().
    //
    // TRAA is enabled for the rotatable 3D-volume `raymarch` method, where
    // camera or scene-root motion produces real screen-space velocity for
    // reprojection.
    sceneColor = scenePass.getTextureNode("output");
    const depthNode = scenePass.getTextureNode("depth");
    const velocityNode = scenePass.getTextureNode("velocity");

    // TRAA: temporal reprojection AA with Halton sub-pixel jitter + variance
    // clipping. The fixed optical PSF samples both the current and resolved
    // radiance paths so temporal-history bypass remains coherent.
    traaNode = traa(sceneColor, depthNode, velocityNode, camera);
    // useSubpixelCorrection increases current-frame weight when velocity is
    // subpixel — designed for translating objects. Baryon's useful reprojection
    // comes from camera/scene-root rotation, so leave it off to avoid the
    // "square pattern artifact" the docs warn about.
    traaNode.useSubpixelCorrection = false;
    // @ts-ignore — getTextureNode() exists in TRAANode source but is missing from its .d.ts
    traaColor = traaNode.getTextureNode();
    // TRAA's resolve quad is an opaque NodeMaterial, so Three assigns alpha 1
    // to every resolved texel. Radiance takes the temporal path, but coverage
    // alpha must come from the current scene pass or transparent output
    // (Spout/external sinks) turns fully opaque.
    outputSceneColor = vec4(
      mix(sceneColor.rgb, traaColor.rgb, temporalHistoryBlendUniform),
      sceneColor.a,
    );
  } else {
    sceneColor = scenePass.getTextureNode("output");
    traaColor = sceneColor;
    outputSceneColor = sceneColor;
  }

  // The temporal blend is binary: advanceRenderOutputTemporalHistoryBypass only
  // ever writes 0 or 1, never an intermediate crossfade. For a binary weight
  // mix(f(a), f(b), t) === f(mix(a, b, t)) for any f, so the optics read one
  // already-blended color instead of running a second bloom pyramid and a
  // second 9-tap kernel whose result is multiplied by zero. Materializing that
  // blend costs one 1-tap full-res copy and both optics lanes share it.
  const opticsSourceTextureNode = temporalReprojectionEnabled
    ? convertToTexture(outputSceneColor, null, null, {
        type: THREE.HalfFloatType,
        colorSpace: THREE.NoColorSpace,
        depthBuffer: false,
      })
    : null;
  const opticsSourceColor = opticsSourceTextureNode ?? sceneColor;

  if (!carrierTruthEnabled) {
    opticalPsfPass = sampleFixedOpticalPsfNode(opticsSourceColor);
  }

  if (!carrierTruthEnabled && resolvedRenderProfile.bloomAllowed) {
    bloomPass = pairedBloom(
      opticsSourceColor,
      /** @type {any} */ (bloomUniforms.strength),
      /** @type {any} */ (bloomUniforms.radius),
      /** @type {any} */ (bloomUniforms.threshold),
    );
  }
  const pipeline = new RenderPipeline(gl);
  const composeOutputNode = ({
    outputMode = defaultOutputMode,
    temporalHistoryEnabled = true,
    smaaEnabled = DEFAULT_OUTPUT_SMAA_ENABLED,
  } = {}) => {
    const temporalLinearPathActive = Boolean(
      !carrierTruthEnabled && temporalHistoryEnabled && traaNode,
    );
    const linearOutputNode = composeRenderLinearOutputNode({
      sceneColor: temporalLinearPathActive ? outputSceneColor : sceneColor,
      // Both toggle branches read the same optics lane: its input already
      // carries the temporal blend, so there is no separate raw-scene chain to
      // choose between.
      opticalPsfPass: carrierTruthEnabled ? null : opticalPsfPass,
      bloomPass: carrierTruthEnabled ? null : bloomPass,
      bloomEnabledNode: bloomUniforms.enabled,
    });
    const displayTopologyKey = `${
      temporalLinearPathActive ? "temporal" : "current"
    }:${normalizeOutputMode(outputMode)}`;
    const displayLinearOutputNode = composeRenderDisplayOutputNode({
      linearOutputNode,
      outputMode,
      outputBackgroundNode: outputUniforms.backgroundColor,
    });
    const displayLinearTextureNode = carrierTruthEnabled
      ? displayLinearOutputNode
      : getRenderDisplayLinearTextureNode(
          postNodes,
          displayTopologyKey,
          displayLinearOutputNode,
        );
    const resolvedSmaaEnabled = resolveOutputSmaaGraphEnabled(
      postNodes,
      smaaEnabled,
      outputMode,
    );
    const finalOutputNode = carrierTruthEnabled
      ? displayLinearOutputNode
      : composeRenderOutputSmaaNode(
          postNodes,
          displayLinearTextureNode,
          displayTopologyKey,
          resolvedSmaaEnabled,
        );

    if (carrierTruthEnabled) {
      postNodes.smaaNode = null;
    }

    // Match Three's output switch exactly: source texture or smaa(source).
    // RenderPipeline owns the one final output-color transform for both.
    return finalOutputNode;
  };

  Object.assign(postNodes, {
    sceneColor,
    traaNode,
    traaColor,
    outputSceneColor,
    opticalPsfPass,
    opticsSourceTextureNode,
    bloomPass,
    bloomPasses: [bloomPass].filter(Boolean),
    composeOutputNode,
  });

  pipeline.outputNode = composeOutputNode();
  pipeline.needsUpdate = true;
  const defaultTemporalHistoryEnabled = resolveOutputTemporalHistoryEnabled(
    postNodes,
    true,
  );
  postNodes[OUTPUT_TOPOLOGY_KEY_FIELD] = resolveOutputTopologyKey({
    carrierTruthEnabled,
    outputMode: defaultOutputMode,
    temporalHistoryEnabled: defaultTemporalHistoryEnabled,
    smaaEnabled: resolveOutputSmaaGraphEnabled(
      postNodes,
      undefined,
      defaultOutputMode,
    ),
  });
  postNodes[OUTPUT_TOPOLOGY_TEMPORAL_FIELD] = defaultTemporalHistoryEnabled;
  postNodes[OUTPUT_TOPOLOGY_SMAA_FIELD] = resolveOutputSmaaGraphEnabled(
    postNodes,
    undefined,
    defaultOutputMode,
  );

  return {
    pipeline,
    postNodes,
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
  outputCamera.matrixAutoUpdate = true;
  outputCamera.updateProjectionMatrix();
  outputCamera.updateMatrix();
  outputCamera.matrixWorldNeedsUpdate = true;
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
 * @param {RenderOutputPipelineOptions} [options]
 * @returns {{ width: number, height: number, renderFrame: Function, readPixelsAsync: Function, readCheckpointAovsAsync: Function, dispose: Function } | null}
 */
export function createCaptureOutputSession(
  renderer,
  scene,
  sourceCamera,
  width,
  height,
  { renderProfile = null, checkpointAovMode = CHECKPOINT_AOV_MODES.off } = {},
) {
  const aspect = width / height;
  const outputCamera = createOutputCamera(sourceCamera, aspect);
  const pipelineState = createRenderOutputPipeline(
    renderer,
    scene,
    outputCamera,
    { renderProfile, checkpointAovMode },
  );

  if (!pipelineState) {
    return null;
  }

  const target = new RenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    magFilter: NearestFilter,
    minFilter: NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });

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
      const origGetDrawingBufferSize = renderer.getDrawingBufferSize;
      renderer.getSize = (target) => {
        if (target) {
          target.set(width, height);
          return target;
        }
        return new THREE.Vector2(width, height);
      };
      renderer.getPixelRatio = () => 1;
      // PassNodes size their internal render targets (including checkpoint
      // AOV MRT attachments) from getDrawingBufferSize, which reads _width
      // directly rather than getSize; without this override they allocate at
      // the live canvas size and later AOV readbacks copy out of range.
      renderer.getDrawingBufferSize = (target) => {
        if (target) {
          target.set(width, height);
          return target;
        }
        return new THREE.Vector2(width, height);
      };

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
        renderer.getDrawingBufferSize = origGetDrawingBufferSize;
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
    readCheckpointAovsAsync() {
      return readRenderOutputCheckpointAovsAsync(
        renderer,
        pipelineState.postNodes,
        width,
        height,
      );
    },
    dispose() {
      disposeRenderOutputPostNodes(pipelineState.postNodes);
      pipelineState.pipeline.dispose?.();
      target.dispose();
    },
  };
}
