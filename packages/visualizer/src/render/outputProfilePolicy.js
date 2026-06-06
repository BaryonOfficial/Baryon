export const MIN_PERFORMANCE_TARGET_FPS = 24;
export const MAX_PERFORMANCE_TARGET_FPS = 120;
export const DEFAULT_PERFORMANCE_TARGET_FPS = 60;

export const PERFORMANCE_PROFILES = Object.freeze({
  auto: "auto",
  custom: "custom",
  maxQuality: "max-quality",
});
export const DEFAULT_PERFORMANCE_PROFILE = PERFORMANCE_PROFILES.auto;
export const CUSTOM_TARGET_FPS_BANDS = Object.freeze({
  low: "24-48",
  balanced: "49-72",
  high: "73-96",
  ultra: "97-120",
});
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
 *   bloomAllowed?: boolean,
 *   traaEnabled?: boolean,
 * }} RenderQualityProfileOverrides
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
  if (value === PERFORMANCE_PROFILES.maxQuality || value === "none") {
    return PERFORMANCE_PROFILES.maxQuality;
  }
  return DEFAULT_PERFORMANCE_PROFILE;
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

export function resolveCustomTargetFpsBand(targetFps) {
  const normalizedTargetFps = normalizePerformanceTargetFps(targetFps);

  if (normalizedTargetFps <= 48) {
    return CUSTOM_TARGET_FPS_BANDS.low;
  }
  if (normalizedTargetFps <= 72) {
    return CUSTOM_TARGET_FPS_BANDS.balanced;
  }
  if (normalizedTargetFps <= 96) {
    return CUSTOM_TARGET_FPS_BANDS.high;
  }
  return CUSTOM_TARGET_FPS_BANDS.ultra;
}

export function usesBalancedPerformanceBaseline(qualityPreset, targetFps) {
  return (
    normalizePerformanceProfile(qualityPreset) === PERFORMANCE_PROFILES.auto ||
    resolveCustomTargetFpsBand(targetFps) === CUSTOM_TARGET_FPS_BANDS.balanced
  );
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

  const autoTargetFps =
    resolutionBand === "2160p+"
      ? 30
      : resolutionBand === "1440p"
        ? 48
        : DEFAULT_PERFORMANCE_TARGET_FPS;
  const renderScale =
    resolutionBand === "2160p+"
      ? 0.5
      : resolutionBand === "1440p"
        ? 0.59
        : 0.75;

  return buildRenderQualityProfile({
    qualityPreset: normalizedPerformanceProfile,
    targetFps:
      normalizedPerformanceProfile === PERFORMANCE_PROFILES.auto
        ? autoTargetFps
        : resolvedTargetFps,
    renderScale,
    traaEnabled: true,
    renderContext: RENDER_CONTEXTS.externalOutput,
  });
}

function resolvePreviewProfile({
  normalizedPerformanceProfile,
  resolvedTargetFps,
  outputWidth,
  outputHeight,
}) {
  const resolutionBand = resolveOutputResolutionBand(outputWidth, outputHeight);
  const targetBand = resolveCustomTargetFpsBand(resolvedTargetFps);

  if (normalizedPerformanceProfile === PERFORMANCE_PROFILES.maxQuality) {
    return buildRenderQualityProfile({
      qualityPreset: normalizedPerformanceProfile,
      targetFps: DEFAULT_PERFORMANCE_TARGET_FPS,
      renderScale: 1,
      traaEnabled: true,
      renderContext: RENDER_CONTEXTS.preview,
    });
  }

  const isHighResolutionOutput = resolutionBand === "2160p+";
  let renderScale = 1;
  if (
    usesBalancedPerformanceBaseline(
      normalizedPerformanceProfile,
      resolvedTargetFps,
    )
  ) {
    renderScale = isHighResolutionOutput ? 0.84 : 1;
  } else if (targetBand === CUSTOM_TARGET_FPS_BANDS.low) {
    renderScale = isHighResolutionOutput ? 0.92 : 1;
  } else if (targetBand === CUSTOM_TARGET_FPS_BANDS.high) {
    renderScale = isHighResolutionOutput ? 0.75 : 0.92;
  } else if (targetBand === CUSTOM_TARGET_FPS_BANDS.ultra) {
    renderScale = isHighResolutionOutput ? 0.67 : 0.84;
  }

  return buildRenderQualityProfile({
    qualityPreset: normalizedPerformanceProfile,
    targetFps:
      normalizedPerformanceProfile === PERFORMANCE_PROFILES.auto
        ? DEFAULT_PERFORMANCE_TARGET_FPS
        : resolvedTargetFps,
    renderScale,
    traaEnabled: true,
    renderContext: RENDER_CONTEXTS.preview,
  });
}

/**
 * @param {unknown} overrides
 * @returns {RenderQualityProfileOverrides | null}
 */
export function normalizeRenderQualityProfileOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return null;
  }

  const candidate = /** @type {Record<string, unknown>} */ (overrides);
  const nextOverrides = {};
  const renderScaleCandidate = candidate.renderScale;
  if (
    typeof renderScaleCandidate === "number" &&
    Number.isFinite(renderScaleCandidate) &&
    renderScaleCandidate > 0
  ) {
    nextOverrides.renderScale = renderScaleCandidate;
  }
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
 * @param {RenderQualityProfileOverrides | null | undefined} overrides
 * @returns {RenderQualityProfile}
 */
export function applyRenderQualityProfileOverrides(profile, overrides) {
  const normalizedOverrides = normalizeRenderQualityProfileOverrides(overrides);
  if (!profile || !normalizedOverrides) {
    return profile;
  }

  const nextProfile = { ...profile };
  if (Number.isFinite(normalizedOverrides.renderScale)) {
    nextProfile.renderScale = normalizedOverrides.renderScale;
  }
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
  const renderScaleCandidate = candidate.renderScale;
  const renderScale =
    typeof renderScaleCandidate === "number" &&
    Number.isFinite(renderScaleCandidate) &&
    renderScaleCandidate > 0
      ? renderScaleCandidate
      : null;
  if (renderScale == null) {
    return null;
  }

  return {
    qualityPreset: normalizePerformanceProfile(candidate.qualityPreset),
    targetFps: normalizePerformanceTargetFps(candidate.targetFps),
    renderScale,
    traaEnabled:
      typeof candidate.traaEnabled === "boolean"
        ? candidate.traaEnabled
        : true,
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
 * @param {{
 *   qualityPreset?: PerformanceProfile,
 *   targetFps?: number,
 *   outputWidth?: number,
 *   outputHeight?: number,
 *   overrides?: RenderQualityProfileOverrides | null,
 *   renderScale?: number,
 *   bloomAllowed?: boolean,
 *   traaEnabled?: boolean,
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
  bloomAllowed,
  traaEnabled,
  renderContext = RENDER_CONTEXTS.preview,
} = {}) {
  const hasInlineOverrides =
    Number.isFinite(renderScale) ||
    typeof bloomAllowed === "boolean" ||
    typeof traaEnabled === "boolean";
  const effectiveOverrides =
    overrides ??
    (hasInlineOverrides
      ? {
          renderScale,
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
  return applyRenderQualityProfileOverrides(
    renderContext === RENDER_CONTEXTS.externalOutput
      ? resolveExternalOutputProfile({
          normalizedPerformanceProfile,
          resolvedTargetFps,
          outputWidth,
          outputHeight,
        })
      : resolvePreviewProfile({
          normalizedPerformanceProfile,
          resolvedTargetFps,
          outputWidth,
          outputHeight,
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
