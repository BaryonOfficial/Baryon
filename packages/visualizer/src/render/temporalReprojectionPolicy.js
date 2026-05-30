import { isFieldDrivenState } from "../core/fieldState.js";
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
 * TRAA is valid only when the renderer has meaningful geometric velocity: the
 * rotatable 3D raymarch volume may accumulate history only during scene-root
 * motion. Audio energy is deliberately not an input.
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

  const fieldState =
    featureFrame?.fieldState ?? featureFrame?.debug?.fieldState;
  if (!isFieldDrivenState(fieldState)) {
    return {
      traaEnabled: true,
      accumulateHistory: false,
      shouldBypassHistory: true,
      reason: "field-not-driven",
    };
  }

  const sceneMotion = readRaymarchSceneMotion(sceneSnapshot);
  const accumulateHistory = sceneMotion > REPROJECTABLE_RAYMARCH_MOTION_EPSILON;

  return {
    traaEnabled: true,
    accumulateHistory,
    shouldBypassHistory: !accumulateHistory,
    reason: accumulateHistory
      ? "reprojectable-scene-motion"
      : "no-reprojectable-scene-motion",
  };
}
