import { MIN_ADAPTIVE_STEPS } from "../core/raymarch/stepStability.js";

// Camera integration is a presentation budget over direct analytic optical
// samples. This profile/controller minimum is not an acoustic Nyquist
// requirement and does not own acoustic or optical spatial fidelity.
export const MIN_PRESENTATION_RAYMARCH_STEPS = MIN_ADAPTIVE_STEPS;
export const DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS = 32;

export const MIN_PERFORMANCE_TARGET_FPS = 24;
export const MAX_PERFORMANCE_TARGET_FPS = 240;
export const DEFAULT_PERFORMANCE_TARGET_FPS = 60;
export const DEFAULT_TRAA_ENABLED = false;
const MAX_QUALITY_PERFORMANCE_TARGET_FPS = 240;

export const PERFORMANCE_PROFILES = Object.freeze({
  auto: "auto",
  custom: "custom",
  maxQuality: "max-quality",
});
export const DEFAULT_PERFORMANCE_PROFILE = PERFORMANCE_PROFILES.maxQuality;
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
 * `targetFps` is the resolved profile FPS. Adaptive profiles use it for
 * raymarch governance; desktop performer output also uses it for cadence.
 *
 * @typedef {object} RenderQualityProfile
 * @property {PerformanceProfile} qualityPreset
 * @property {number} targetFps
 * @property {number | null} startupRaymarchSteps
 * @property {boolean} traaEnabled
 * @property {boolean} bloomAllowed
 * @property {boolean} carrierTruthEnabled
 * @property {RenderContext} renderContext
 */

/**
 * @typedef {{
 *   bloomAllowed?: boolean,
 *   traaEnabled?: boolean,
 *   carrierTruthEnabled?: boolean,
 * }} RenderPostProcessOverrides
 */

/**
 * @param {unknown} value
 * @returns {PerformanceProfile}
 */
export function normalizePerformanceProfile(value) {
  if (value === PERFORMANCE_PROFILES.auto) {
    return PERFORMANCE_PROFILES.auto;
  }
  if (value === PERFORMANCE_PROFILES.custom) {
    return PERFORMANCE_PROFILES.custom;
  }
  if (value === PERFORMANCE_PROFILES.maxQuality) {
    return PERFORMANCE_PROFILES.maxQuality;
  }
  return DEFAULT_PERFORMANCE_PROFILE;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAdaptivePerformanceProfile(value) {
  const normalizedPerformanceProfile = normalizePerformanceProfile(value);
  return (
    normalizedPerformanceProfile === PERFORMANCE_PROFILES.auto ||
    normalizedPerformanceProfile === PERFORMANCE_PROFILES.custom
  );
}

/**
 * @param {unknown} value
 * @returns {PerformanceProfile}
 */
export function normalizePersistedPerformanceProfile(value) {
  if (value === "none") {
    return PERFORMANCE_PROFILES.maxQuality;
  }
  return normalizePerformanceProfile(value);
}

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
      ? `Custom ${normalizePerformanceTargetFps(targetFps)} FPS target`
      : "Custom";
  }

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return "Max Quality";
  }

  return "Auto";
}

function resolveStartupRaymarchSteps({ qualityPreset }) {
  if (qualityPreset === PERFORMANCE_PROFILES.maxQuality) {
    return null;
  }

  return DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS;
}

function normalizeStartupRaymarchSteps(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(
    192,
    Math.max(
      MIN_PRESENTATION_RAYMARCH_STEPS,
      Math.round(/** @type {number} */ (value)),
    ),
  );
}

function buildRenderQualityProfile({
  qualityPreset,
  targetFps,
  startupRaymarchSteps,
  traaEnabled,
  bloomAllowed = true,
  carrierTruthEnabled = false,
  renderContext,
}) {
  return {
    qualityPreset,
    targetFps,
    startupRaymarchSteps,
    traaEnabled,
    bloomAllowed,
    carrierTruthEnabled,
    renderContext,
  };
}

function resolveProfileTargetFps({
  normalizedPerformanceProfile,
  resolvedTargetFps,
}) {
  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return MAX_QUALITY_PERFORMANCE_TARGET_FPS;
  }

  return normalizedPerformanceProfile === PERFORMANCE_PROFILES.custom
    ? resolvedTargetFps
    : DEFAULT_PERFORMANCE_TARGET_FPS;
}

function resolveProfile({
  normalizedPerformanceProfile,
  resolvedTargetFps,
  renderContext,
}) {
  const targetFps = resolveProfileTargetFps({
    normalizedPerformanceProfile,
    resolvedTargetFps,
  });
  return buildRenderQualityProfile({
    qualityPreset: normalizedPerformanceProfile,
    targetFps,
    startupRaymarchSteps: resolveStartupRaymarchSteps({
      qualityPreset: normalizedPerformanceProfile,
    }),
    traaEnabled: DEFAULT_TRAA_ENABLED,
    renderContext,
  });
}

/**
 * @param {unknown} overrides
 * @returns {RenderPostProcessOverrides | null}
 */
export function normalizeRenderPostProcessOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return null;
  }

  const candidate = /** @type {Record<string, unknown>} */ (overrides);
  const nextOverrides = {};
  if (typeof candidate.bloomAllowed === "boolean") {
    nextOverrides.bloomAllowed = candidate.bloomAllowed;
  }
  if (typeof candidate.traaEnabled === "boolean") {
    nextOverrides.traaEnabled = candidate.traaEnabled;
  }
  if (typeof candidate.carrierTruthEnabled === "boolean") {
    nextOverrides.carrierTruthEnabled = candidate.carrierTruthEnabled;
  }

  return Object.keys(nextOverrides).length > 0 ? nextOverrides : null;
}

/**
 * @param {RenderQualityProfile} profile
 * @param {RenderPostProcessOverrides | null | undefined} overrides
 * @returns {RenderQualityProfile}
 */
export function applyRenderProfilePostProcessOverrides(profile, overrides) {
  const normalizedOverrides = normalizeRenderPostProcessOverrides(overrides);
  if (!profile || !normalizedOverrides) {
    return profile;
  }

  const nextProfile = { ...profile };
  if (typeof normalizedOverrides.bloomAllowed === "boolean") {
    nextProfile.bloomAllowed = normalizedOverrides.bloomAllowed;
  }
  if (typeof normalizedOverrides.traaEnabled === "boolean") {
    nextProfile.traaEnabled = normalizedOverrides.traaEnabled;
  }
  if (typeof normalizedOverrides.carrierTruthEnabled === "boolean") {
    nextProfile.carrierTruthEnabled = normalizedOverrides.carrierTruthEnabled;
  }

  return nextProfile;
}

/**
 * @param {unknown} profile
 * @returns {RenderQualityProfile | null}
 */
export function normalizeResolvedRenderQualityProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const candidate = /** @type {Record<string, unknown>} */ (profile);
  const qualityPreset = normalizePersistedPerformanceProfile(
    candidate.qualityPreset,
  );
  return {
    qualityPreset,
    targetFps:
      qualityPreset === PERFORMANCE_PROFILES.maxQuality
        ? MAX_QUALITY_PERFORMANCE_TARGET_FPS
        : normalizePerformanceTargetFps(candidate.targetFps),
    startupRaymarchSteps:
      qualityPreset === PERFORMANCE_PROFILES.maxQuality
        ? null
        : (normalizeStartupRaymarchSteps(candidate.startupRaymarchSteps) ??
          DEFAULT_ADAPTIVE_STARTUP_RAYMARCH_STEPS),
    traaEnabled:
      typeof candidate.traaEnabled === "boolean"
        ? candidate.traaEnabled
        : DEFAULT_TRAA_ENABLED,
    bloomAllowed:
      typeof candidate.bloomAllowed === "boolean"
        ? candidate.bloomAllowed
        : true,
    carrierTruthEnabled:
      typeof candidate.carrierTruthEnabled === "boolean"
        ? candidate.carrierTruthEnabled
        : false,
    renderContext:
      candidate.renderContext === RENDER_CONTEXTS.externalOutput
        ? RENDER_CONTEXTS.externalOutput
        : RENDER_CONTEXTS.preview,
  };
}

/**
 * @param {unknown} profile
 * @returns {number | null}
 */
export function getRenderQualityProfileTargetFps(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const candidate = /** @type {Record<string, unknown>} */ (profile);
  const targetFps = candidate.targetFps;
  if (
    typeof targetFps !== "number" ||
    !Number.isInteger(targetFps) ||
    targetFps < MIN_PERFORMANCE_TARGET_FPS ||
    targetFps > MAX_PERFORMANCE_TARGET_FPS
  ) {
    return null;
  }

  return targetFps;
}

/**
 * @param {{
 *   qualityPreset?: PerformanceProfile,
 *   targetFps?: number,
 *   outputWidth?: number,
 *   outputHeight?: number,
 *   postProcessOverrides?: RenderPostProcessOverrides | null,
 *   bloomAllowed?: boolean,
 *   traaEnabled?: boolean,
 *   carrierTruthEnabled?: boolean,
 *   renderContext?: RenderContext,
 * }=} options
 * @returns {RenderQualityProfile}
 */
export function resolveRenderQualityProfile(options = {}) {
  const {
    qualityPreset = DEFAULT_PERFORMANCE_PROFILE,
    postProcessOverrides = null,
    bloomAllowed,
    traaEnabled,
    carrierTruthEnabled,
    renderContext = RENDER_CONTEXTS.preview,
  } = options;
  const targetFps = options.targetFps ?? DEFAULT_PERFORMANCE_TARGET_FPS;
  const hasInlineOverrides =
    typeof bloomAllowed === "boolean" ||
    typeof traaEnabled === "boolean" ||
    typeof carrierTruthEnabled === "boolean";
  const effectiveOverrides =
    postProcessOverrides ??
    (hasInlineOverrides
      ? {
          bloomAllowed,
          traaEnabled,
          carrierTruthEnabled,
        }
      : null);
  const normalizedPerformanceProfile =
    normalizePerformanceProfile(qualityPreset);
  const resolvedTargetFps =
    normalizedPerformanceProfile === PERFORMANCE_PROFILES.custom
      ? normalizePerformanceTargetFps(targetFps)
      : DEFAULT_PERFORMANCE_TARGET_FPS;
  return applyRenderProfilePostProcessOverrides(
    resolveProfile({
      normalizedPerformanceProfile,
      resolvedTargetFps,
      renderContext:
        renderContext === RENDER_CONTEXTS.externalOutput
          ? RENDER_CONTEXTS.externalOutput
          : RENDER_CONTEXTS.preview,
    }),
    effectiveOverrides,
  );
}

export function getRenderQualityProfileKey(profile) {
  const normalizedProfile =
    normalizeResolvedRenderQualityProfile(profile) ??
    resolveRenderQualityProfile({
      qualityPreset: profile?.qualityPreset,
    });
  const normalizedPerformanceProfile = normalizePerformanceProfile(
    normalizedProfile.qualityPreset,
  );
  const renderContext =
    normalizedProfile.renderContext === RENDER_CONTEXTS.externalOutput
      ? RENDER_CONTEXTS.externalOutput
      : RENDER_CONTEXTS.preview;
  const targetFpsKey =
    getRenderQualityProfileTargetFps(normalizedProfile) ??
    DEFAULT_PERFORMANCE_TARGET_FPS;
  const startupRaymarchStepsKey =
    normalizedProfile.startupRaymarchSteps == null
      ? "no-startup"
      : normalizeStartupRaymarchSteps(normalizedProfile.startupRaymarchSteps);
  return [
    normalizedPerformanceProfile,
    targetFpsKey,
    startupRaymarchStepsKey,
    renderContext,
    normalizedProfile.traaEnabled === false ? "no-traa" : "traa",
    normalizedProfile.bloomAllowed === false ? "no-bloom" : "bloom",
    normalizedProfile.carrierTruthEnabled === true
      ? "carrier-truth"
      : "normal-output",
  ].join(":");
}

export const OUTPUT_MODES = Object.freeze({
  transparent: "transparent",
  opaque: "opaque",
});

export function normalizeOutputMode(mode) {
  return mode === OUTPUT_MODES.transparent
    ? OUTPUT_MODES.transparent
    : OUTPUT_MODES.opaque;
}
