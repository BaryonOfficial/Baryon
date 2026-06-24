import {
  applyRenderProfilePostProcessOverrides,
  normalizePerformanceProfile,
  normalizePerformanceTargetFps,
  normalizeRenderPostProcessOverrides,
  normalizeResolvedRenderQualityProfile,
  RENDER_CONTEXTS,
  resolveRenderQualityProfile,
} from "@baryon/engine/render/outputPipeline";

/**
 * @param {unknown} overrides
 * @returns {{ bloomAllowed?: boolean, traaEnabled?: boolean } | null}
 */
export function sanitizeLocalPostProcessOverrides(overrides) {
  return normalizeRenderPostProcessOverrides(overrides);
}

/**
 * @param {unknown} renderContext
 * @returns {boolean}
 */
export function shouldAllowLocalPostProcessOverrides(renderContext) {
  return renderContext !== RENDER_CONTEXTS.externalOutput;
}

/**
 * @param {{
 *   performanceProfile: unknown,
 *   renderContext: unknown,
 *   targetFps?: unknown,
 *   outputWidth?: number,
 *   outputHeight?: number,
 *   resolvedRenderProfile?: unknown,
 *   localPostProcessOverrides?: unknown,
 *   traaEnabled?: boolean,
 * }} options
 * @returns {import("@baryon/engine/render/outputPipeline").RenderQualityProfile}
 */
export function resolveSceneRenderPerformanceProfile({
  performanceProfile,
  renderContext = RENDER_CONTEXTS.preview,
  targetFps = null,
  outputWidth = 0,
  outputHeight = 0,
  resolvedRenderProfile = null,
  localPostProcessOverrides = null,
  traaEnabled = true,
}) {
  const traaOverride = traaEnabled === false ? { traaEnabled: false } : null;
  const sanitizedLocalOverrides = shouldAllowLocalPostProcessOverrides(
    renderContext,
  )
    ? sanitizeLocalPostProcessOverrides(localPostProcessOverrides)
    : null;

  if (renderContext === RENDER_CONTEXTS.externalOutput) {
    const normalizedResolvedRenderProfile =
      normalizeResolvedRenderQualityProfile(resolvedRenderProfile);
    if (normalizedResolvedRenderProfile) {
      return applyRenderProfilePostProcessOverrides(
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
    targetFps: normalizePerformanceTargetFps(targetFps),
    outputWidth,
    outputHeight,
    postProcessOverrides:
      mergedOverrides && Object.keys(mergedOverrides).length > 0
        ? mergedOverrides
        : null,
    renderContext:
      renderContext === RENDER_CONTEXTS.externalOutput
        ? RENDER_CONTEXTS.externalOutput
        : RENDER_CONTEXTS.preview,
  });
}
