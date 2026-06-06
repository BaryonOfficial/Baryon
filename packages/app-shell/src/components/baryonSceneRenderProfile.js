import {
  normalizePerformanceProfile,
  normalizeRenderQualityProfileOverrides,
  normalizeResolvedRenderQualityProfile,
  RENDER_CONTEXTS,
  resolveRenderQualityProfile,
} from "@baryon/visualizer/render/outputPipeline";

/**
 * @param {unknown} overrides
 * @returns {{ renderScale?: number, bloomAllowed?: boolean, traaEnabled?: boolean } | null}
 */
export function sanitizeRenderProfileOverrides(overrides) {
  return normalizeRenderQualityProfileOverrides(overrides);
}

/**
 * @param {unknown} renderContext
 * @returns {boolean}
 */
export function shouldAllowLocalRenderProfileCommands(renderContext) {
  return renderContext !== RENDER_CONTEXTS.externalOutput;
}

/**
 * @param {{
 *   performanceProfile: unknown,
 *   renderContext: unknown,
 *   outputWidth?: number,
 *   outputHeight?: number,
 *   resolvedRenderProfile?: unknown,
 *   localRenderProfileOverrides?: unknown,
 *   traaEnabled?: boolean,
 * }} options
 * @returns {import("@baryon/visualizer/render/outputPipeline").RenderQualityProfile}
 */
export function resolveSceneRenderQualityProfile({
  performanceProfile,
  renderContext = RENDER_CONTEXTS.preview,
  outputWidth = 0,
  outputHeight = 0,
  resolvedRenderProfile = null,
  localRenderProfileOverrides = null,
  traaEnabled = true,
}) {
  const traaOverride = traaEnabled === false ? { traaEnabled: false } : null;
  const sanitizedLocalOverrides = shouldAllowLocalRenderProfileCommands(
    renderContext,
  )
    ? sanitizeRenderProfileOverrides(localRenderProfileOverrides)
    : null;

  if (renderContext === RENDER_CONTEXTS.externalOutput) {
    const normalizedResolvedRenderProfile =
      normalizeResolvedRenderQualityProfile(resolvedRenderProfile);
    if (normalizedResolvedRenderProfile) {
      return applyRenderProfileDiagnosticsOverrides(
        normalizedResolvedRenderProfile,
        traaOverride,
      );
    }
  }

  const mergedOverrides =
    renderContext === RENDER_CONTEXTS.externalOutput
      ? null
      : {
          ...(sanitizedLocalOverrides ?? {}),
          ...(traaOverride ?? {}),
        };

  return resolveRenderQualityProfile({
    qualityPreset: normalizePerformanceProfile(performanceProfile),
    outputWidth,
    outputHeight,
    overrides:
      mergedOverrides && Object.keys(mergedOverrides).length > 0
        ? mergedOverrides
        : null,
    renderContext:
      renderContext === RENDER_CONTEXTS.externalOutput
        ? RENDER_CONTEXTS.externalOutput
        : RENDER_CONTEXTS.preview,
  });
}

function applyRenderProfileDiagnosticsOverrides(profile, overrides) {
  if (!overrides) {
    return profile;
  }
  return {
    ...profile,
    ...overrides,
  };
}
