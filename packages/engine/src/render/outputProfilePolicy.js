export const MIN_PERFORMANCE_TARGET_FPS = 24;
export const MAX_PERFORMANCE_TARGET_FPS = 240;
export const DEFAULT_PERFORMANCE_TARGET_FPS = 60;
export const MAX_QUALITY_PERFORMANCE_TARGET_FPS = 240;

const STARTUP_RAYMARCH_STEPS_BY_RESOLUTION_BAND = Object.freeze({
  "1080p-": 32,
  "1440p": 24,
  "2160p+": 16,
  unknown: 32,
});

const STARTUP_RAYMARCH_STEPS_BY_TARGET_FPS_BAND = Object.freeze({
  low: 40,
  balanced: 32,
  high: 24,
  ultra: 16,
});

export const PERFORMANCE_PROFILES = Object.freeze({
  auto: "auto",
  custom: "custom",
  maxQuality: "max-quality",
});
export const DEFAULT_PERFORMANCE_PROFILE = PERFORMANCE_PROFILES.auto;
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
 * @property {RenderContext} renderContext
 */

/**
 * @typedef {{
 *   bloomAllowed?: boolean,
 *   traaEnabled?: boolean,
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

function resolveResolutionStartupRaymarchSteps(outputWidth, outputHeight) {
  const resolutionBand = resolveOutputResolutionBand(outputWidth, outputHeight);
  return (
    STARTUP_RAYMARCH_STEPS_BY_RESOLUTION_BAND[resolutionBand] ??
    STARTUP_RAYMARCH_STEPS_BY_RESOLUTION_BAND.unknown
  );
}

function resolveTargetFpsStartupRaymarchSteps(targetFps) {
  const normalizedTargetFps = normalizePerformanceTargetFps(targetFps);
  if (normalizedTargetFps <= 48) {
    return STARTUP_RAYMARCH_STEPS_BY_TARGET_FPS_BAND.low;
  }
  if (normalizedTargetFps <= 72) {
    return STARTUP_RAYMARCH_STEPS_BY_TARGET_FPS_BAND.balanced;
  }
  if (normalizedTargetFps <= 96) {
    return STARTUP_RAYMARCH_STEPS_BY_TARGET_FPS_BAND.high;
  }
  return STARTUP_RAYMARCH_STEPS_BY_TARGET_FPS_BAND.ultra;
}

function resolveStartupRaymarchSteps({
  qualityPreset,
  targetFps,
  outputWidth,
  outputHeight,
}) {
  if (qualityPreset === PERFORMANCE_PROFILES.maxQuality) {
    return null;
  }

  const resolutionStartupSteps = resolveResolutionStartupRaymarchSteps(
    outputWidth,
    outputHeight,
  );
  if (qualityPreset === PERFORMANCE_PROFILES.custom) {
    return Math.min(
      resolutionStartupSteps,
      resolveTargetFpsStartupRaymarchSteps(targetFps),
    );
  }
  return resolutionStartupSteps;
}

function normalizeStartupRaymarchSteps(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(192, Math.max(16, Math.round(/** @type {number} */ (value))));
}

function buildRenderQualityProfile({
  qualityPreset,
  targetFps,
  startupRaymarchSteps,
  traaEnabled,
  bloomAllowed = true,
  renderContext,
}) {
  return {
    qualityPreset,
    targetFps,
    startupRaymarchSteps,
    traaEnabled,
    bloomAllowed,
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
  outputWidth,
  outputHeight,
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
      targetFps,
      outputWidth,
      outputHeight,
    }),
    traaEnabled: true,
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
        : (normalizeStartupRaymarchSteps(candidate.startupRaymarchSteps) ?? 32),
    traaEnabled:
      typeof candidate.traaEnabled === "boolean" ? candidate.traaEnabled : true,
    bloomAllowed:
      typeof candidate.bloomAllowed === "boolean"
        ? candidate.bloomAllowed
        : true,
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
 *   renderContext?: RenderContext,
 * }=} options
 * @returns {RenderQualityProfile}
 */
export function resolveRenderQualityProfile(options = {}) {
  const {
    qualityPreset = DEFAULT_PERFORMANCE_PROFILE,
    outputWidth = 0,
    outputHeight = 0,
    postProcessOverrides = null,
    bloomAllowed,
    traaEnabled,
    renderContext = RENDER_CONTEXTS.preview,
  } = options;
  const targetFps = options.targetFps ?? DEFAULT_PERFORMANCE_TARGET_FPS;
  const hasInlineOverrides =
    typeof bloomAllowed === "boolean" || typeof traaEnabled === "boolean";
  const effectiveOverrides =
    postProcessOverrides ??
    (hasInlineOverrides
      ? {
          bloomAllowed,
          traaEnabled,
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
      outputWidth,
      outputHeight,
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
