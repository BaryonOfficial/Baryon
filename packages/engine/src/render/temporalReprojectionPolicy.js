import { hasRenderAuthority } from "../core/renderAuthorityContract.js";
import { usesRaymarchVolumePipeline } from "../visualization/types.js";

const REPROJECTABLE_RAYMARCH_MOTION_EPSILON = 1e-4;

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readRaymarchSceneMotion(sceneSnapshot) {
  return Math.max(
    Math.abs(readFiniteNumber(sceneSnapshot?.angularVelocity)),
    Math.abs(readFiniteNumber(sceneSnapshot?.pitchVelocity)),
    Math.abs(readFiniteNumber(sceneSnapshot?.rollVelocity)),
  );
}

/**
 * Resolve the complete temporal-reprojection policy for a raymarch frame.
 *
 * Authorized raymarch frames may accumulate history whether the scene is
 * moving or stable. Zero geometric velocity is still a valid reprojection
 * input and lets temporal jitter converge on stationary detail. Audio energy
 * is deliberately not an input.
 *
 * @param {object} params
 * @param {unknown} [params.visualizationMethod]
 * @param {boolean} [params.traaRequested]
 * @param {any} [params.featureFrame]
 * @param {any} [params.sceneSnapshot]
 * @returns {{ traaEnabled: boolean, accumulateHistory: boolean, shouldBypassHistory: boolean, reason: string }}
 */
export function resolveTemporalReprojectionPolicy({
  visualizationMethod,
  traaRequested = true,
  featureFrame = null,
  sceneSnapshot = null,
} = {}) {
  if (!usesRaymarchVolumePipeline(visualizationMethod)) {
    return {
      traaEnabled: false,
      accumulateHistory: false,
      shouldBypassHistory: false,
      reason: "non-raymarch-pipeline",
    };
  }

  const traaEnabled = traaRequested !== false;
  if (!traaEnabled) {
    return {
      traaEnabled: false,
      accumulateHistory: false,
      shouldBypassHistory: false,
      reason: "traa-disabled",
    };
  }

  if (!hasRenderAuthority(featureFrame)) {
    return {
      traaEnabled: true,
      accumulateHistory: false,
      shouldBypassHistory: true,
      reason: "render-not-authorized",
    };
  }

  const sceneMotion = readRaymarchSceneMotion(sceneSnapshot);
  const hasSceneMotion = sceneMotion > REPROJECTABLE_RAYMARCH_MOTION_EPSILON;

  return {
    traaEnabled: true,
    accumulateHistory: true,
    shouldBypassHistory: false,
    reason: hasSceneMotion
      ? "reprojectable-scene-motion"
      : "stable-raymarch-frame",
  };
}
