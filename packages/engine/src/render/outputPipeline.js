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
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { RENDER_DEFAULTS } from "../defaults.js";
import {
  composeFixedOpticalPsfRadianceNode,
  compressDisplayRadianceNode,
  compressPremultipliedDisplayRadianceNode,
  FIXED_OPTICAL_PSF_HALO_FRACTION,
  sampleFixedOpticalPsfNode,
} from "./displayRadiance.js";
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
  volumeKernelIdentity: "safe-volumetric-emission-absorption/v1",
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
  bloomEnabled,
  carrierTruthEnabled = false,
  outputMode,
  smaaEnabled,
  temporalHistoryEnabled,
}) {
  if (carrierTruthEnabled) {
    return `carrier-truth:${outputMode}`;
  }

  return `${bloomEnabled ? 1 : 0}:${outputMode}:${
    temporalHistoryEnabled ? 1 : 0
  }:${smaaEnabled ? 1 : 0}`;
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

  // Three's SMAA example uses the default opaque WebGPURenderer. Its RGBA
  // blend changes coverage across Baryon's edge-dense transparent field,
  // which changes composited brightness instead of only antialiasing. Keep
  // transparent output on its canonical premultiplied path; preview surfaces
  // composite that output onto black before requesting SMAA.
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
    smaaNode = smaa(linearOutputNode);
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
    // shoulder must run first because transparent output is premultiplied and
    // the shoulder works on straight radiance. Both toggle branches then read
    // this exact linear-display RGBA texture without alpha or RGB surgery.
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

function disposeRenderDisplayLinearTextureNodes(postNodes) {
  for (const textureNode of postNodes?.displayLinearTextureNodes?.values?.() ??
    []) {
    if (typeof textureNode.dispose === "function") {
      textureNode.dispose();
      continue;
    }
    // Three's RTTNode currently exposes no public dispose method even though
    // it owns both resources. Release them at the Baryon owner boundary.
    textureNode.renderTarget?.dispose?.();
    textureNode._quadMesh?.material?.dispose?.();
  }
  postNodes?.displayLinearTextureNodes?.clear?.();
}

export function disposeRenderOutputPostNodes(postNodes) {
  disposeRenderOutputSmaaNodes(postNodes);
  disposeRenderDisplayLinearTextureNodes(postNodes);
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

export function syncRenderOutputBloomPassUniforms(
  postNodes,
  { strength, radius, threshold },
) {
  for (const bloomPass of getRenderOutputBloomPasses(postNodes)) {
    bloomPass.strength.value = strength;
    bloomPass.radius.value = radius;
    bloomPass.threshold.value = threshold;
  }
}

export function syncRenderOutputNodeTopology(
  pipeline,
  postNodes,
  {
    bloomEnabled,
    outputMode,
    temporalHistoryEnabled = undefined,
    smaaEnabled = undefined,
  },
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
    bloomEnabled,
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
        bloomEnabled,
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
  bloomEnabled,
}) {
  const sceneRgb = sceneColor.rgb;
  const sceneAlpha = sceneColor.a;
  const opticalPsfActive = Boolean(opticalPsfPass);
  const psfRadiance = opticalPsfActive
    ? composeFixedOpticalPsfRadianceNode(sceneRgb, opticalPsfPass.rgb)
    : sceneRgb;
  const bloomActive = bloomEnabled && bloomPass;
  const linearRadiance = bloomActive
    ? psfRadiance.add(bloomPass.rgb)
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
  const bloomAlpha = bloomActive
    ? max(max(bloomPass.rgb.r, bloomPass.rgb.g), bloomPass.rgb.b).clamp()
    : float(0.0);
  const finalAlpha = bloomActive
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

  if (normalizedMode === OUTPUT_MODES.opaque) {
    const finalRgb = compressDisplayRadianceNode(linearOutputNode.rgb);
    const opaqueRgb = outputBackgroundNode.add(finalRgb);
    return vec4(opaqueRgb, 1.0);
  }

  const finalRgb = compressPremultipliedDisplayRadianceNode(
    linearOutputNode.rgb,
    linearOutputNode.a,
  );
  return vec4(finalRgb, linearOutputNode.a);
}

export function composeRenderOutputNode({
  sceneColor,
  opticalPsfPass,
  bloomPass,
  bloomEnabled,
  outputMode,
  outputBackgroundNode,
}) {
  const linearOutputNode = composeRenderLinearOutputNode({
    sceneColor,
    opticalPsfPass,
    bloomPass,
    bloomEnabled,
  });

  return composeRenderDisplayOutputNode({
    linearOutputNode,
    outputMode,
    outputBackgroundNode,
  });
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

  const resolvedRenderProfile = resolvePipelineRenderProfile(renderProfile);
  const carrierTruthEnabled =
    resolvedRenderProfile.carrierTruthEnabled === true;
  const defaultOutputMode =
    carrierTruthEnabled ||
    resolvedRenderProfile.renderContext === RENDER_CONTEXTS.externalOutput
      ? RENDER_DEFAULTS.outputMode
      : OUTPUT_MODES.opaque;
  const resolvedCheckpointAovMode =
    normalizeCheckpointAovMode(checkpointAovMode);
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
  const sceneMrtOutputs = { output };
  if (!carrierTruthEnabled && resolvedRenderProfile.traaEnabled) {
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
  let rawSceneOpticalPsfPass = null;
  let bloomPass = null;
  let rawSceneBloomPass = null;
  let outputBloomPass = null;
  const postNodes = {
    scenePass,
    sceneColor: null,
    traaNode: null,
    traaColor: null,
    outputSceneColor: null,
    opticalPsfPass: null,
    rawSceneOpticalPsfPass: null,
    bloomPass: null,
    rawSceneBloomPass: null,
    outputBloomPass: null,
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

  if (!carrierTruthEnabled && resolvedRenderProfile.traaEnabled) {
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
    outputSceneColor = mix(sceneColor, traaColor, temporalHistoryBlendUniform);
  } else {
    sceneColor = scenePass.getTextureNode("output");
    traaColor = sceneColor;
    outputSceneColor = sceneColor;
  }

  if (!carrierTruthEnabled) {
    rawSceneOpticalPsfPass = sampleFixedOpticalPsfNode(sceneColor);
    opticalPsfPass = resolvedRenderProfile.traaEnabled
      ? mix(
          rawSceneOpticalPsfPass,
          sampleFixedOpticalPsfNode(traaColor),
          temporalHistoryBlendUniform,
        )
      : rawSceneOpticalPsfPass;
  }

  if (!carrierTruthEnabled && resolvedRenderProfile.bloomAllowed) {
    rawSceneBloomPass = bloom(
      sceneColor,
      /** @type {any} */ (bloomUniforms.strength),
      /** @type {any} */ (bloomUniforms.radius),
      /** @type {any} */ (bloomUniforms.threshold),
    );
    bloomPass = resolvedRenderProfile.traaEnabled
      ? bloom(
          traaColor,
          /** @type {any} */ (bloomUniforms.strength),
          /** @type {any} */ (bloomUniforms.radius),
          /** @type {any} */ (bloomUniforms.threshold),
        )
      : rawSceneBloomPass;
    outputBloomPass = resolvedRenderProfile.traaEnabled
      ? mix(rawSceneBloomPass, bloomPass, temporalHistoryBlendUniform)
      : bloomPass;
  }
  const pipeline = new RenderPipeline(gl);
  const composeOutputNode = ({
    bloomEnabled = RENDER_DEFAULTS.bloomEnabled,
    outputMode = defaultOutputMode,
    temporalHistoryEnabled = true,
    smaaEnabled = DEFAULT_OUTPUT_SMAA_ENABLED,
  } = {}) => {
    const temporalLinearPathActive = Boolean(
      !carrierTruthEnabled && temporalHistoryEnabled && traaNode,
    );
    const bloomLinearPathActive = Boolean(
      !carrierTruthEnabled &&
      bloomEnabled &&
      resolvedRenderProfile.bloomAllowed,
    );
    const linearOutputNode = composeRenderLinearOutputNode({
      sceneColor: temporalLinearPathActive ? outputSceneColor : sceneColor,
      opticalPsfPass: carrierTruthEnabled
        ? null
        : temporalLinearPathActive
          ? opticalPsfPass
          : (rawSceneOpticalPsfPass ?? opticalPsfPass),
      bloomPass: carrierTruthEnabled
        ? null
        : temporalLinearPathActive
          ? outputBloomPass
          : (rawSceneBloomPass ?? outputBloomPass),
      bloomEnabled: bloomLinearPathActive,
    });
    const displayTopologyKey = `${
      temporalLinearPathActive ? "temporal" : "current"
    }:${bloomLinearPathActive ? "bloom" : "sharp"}:${normalizeOutputMode(
      outputMode,
    )}`;
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
    rawSceneOpticalPsfPass,
    bloomPass,
    rawSceneBloomPass,
    outputBloomPass,
    bloomPasses: [...new Set([rawSceneBloomPass, bloomPass].filter(Boolean))],
    composeOutputNode,
  });

  pipeline.outputNode = composeOutputNode();
  pipeline.needsUpdate = true;
  const defaultTemporalHistoryEnabled = resolveOutputTemporalHistoryEnabled(
    postNodes,
    true,
  );
  postNodes[OUTPUT_TOPOLOGY_KEY_FIELD] = resolveOutputTopologyKey({
    bloomEnabled: RENDER_DEFAULTS.bloomEnabled,
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
