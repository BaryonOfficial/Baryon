import {
  formatPerformanceProfileLabel,
  isAdaptivePerformanceProfile,
} from "@baryon/engine/render/outputProfilePolicy";
import { usesRaymarchVolumePipeline } from "@baryon/engine/visualization/types";
import { TOP_RIGHT_OVERLAY_PANEL_WIDTH } from "./topRightOverlayLayout.js";

function formatFiniteNumber(value, digits = 1) {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value.toFixed(digits);
}

function formatNumber(value, digits = 1) {
  return formatFiniteNumber(value, digits) ?? "n/a";
}

function formatFps(value) {
  const formatted = formatFiniteNumber(value, 1);
  return formatted ? `${formatted} FPS` : null;
}

function formatMs(value) {
  const formatted = formatFiniteNumber(value, 2);
  return formatted ? `${formatted} ms` : null;
}

function formatRenderSurfaceLabel(renderSurface) {
  const backingWidth = renderSurface?.backingWidth;
  const backingHeight = renderSurface?.backingHeight;
  if (
    typeof backingWidth !== "number" ||
    typeof backingHeight !== "number" ||
    !Number.isFinite(backingWidth) ||
    !Number.isFinite(backingHeight) ||
    backingWidth <= 0 ||
    backingHeight <= 0
  ) {
    return null;
  }

  const backingMegapixels =
    typeof renderSurface?.backingMegapixels === "number" &&
    Number.isFinite(renderSurface.backingMegapixels)
      ? renderSurface.backingMegapixels
      : (backingWidth * backingHeight) / 1_000_000;

  return `${Math.round(backingWidth)} x ${Math.round(backingHeight)} (${formatNumber(backingMegapixels, 2)} MP)`;
}

function PerformanceHudDivider() {
  return (
    <div
      aria-hidden="true"
      data-testid="performance-hud-resolution-divider"
      style={{
        height: 1,
        margin: "0.42rem 0 0.38rem",
        background: "var(--nd-border-subtle)",
        opacity: 0.72,
      }}
    />
  );
}

function hasHudMetricValue(value) {
  return value != null;
}

function shouldShowNonZeroCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function buildOutputCadenceLabel(metrics) {
  const publishFps = formatFps(metrics.outputFps);
  const paintFps = formatFps(metrics.outputPaintFps);

  if (publishFps) {
    return publishFps;
  }
  if (paintFps) {
    return `${paintFps} paint`;
  }
  return null;
}

function shouldShowPublishSummary(metrics) {
  const attempts = metrics.outputPublishAttemptCount;
  const successes = metrics.outputSuccessfulPublishCount;

  return (
    (attempts != null && successes != null && attempts !== successes) ||
    shouldShowNonZeroCount(metrics.outputDroppedPublishCount) ||
    shouldShowNonZeroCount(metrics.outputFailedPublishCount) ||
    Boolean(metrics.outputLastPublishDropReason)
  );
}

function buildOutputQueueLabel(metrics) {
  const deferred = shouldShowNonZeroCount(metrics.outputDeferredPublishCount)
    ? `${Math.round(metrics.outputDeferredPublishCount)} deferred`
    : null;
  const coalesced = shouldShowNonZeroCount(metrics.outputCoalescedPublishCount)
    ? `${Math.round(metrics.outputCoalescedPublishCount)} coalesced`
    : null;
  const discarded =
    shouldShowNonZeroCount(metrics.outputDiscardedPendingPublishCount) ||
    shouldShowNonZeroCount(metrics.outputDiscardedPublishResultCount)
      ? `${Math.round(metrics.outputDiscardedPendingPublishCount ?? 0)} / ${Math.round(metrics.outputDiscardedPublishResultCount ?? 0)} discarded`
      : null;

  return [deferred, coalesced, discarded].filter(Boolean).join(" · ") || null;
}

function PerformanceHudTextRow({ children }) {
  return (
    <div
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

export default function PerformanceHud({
  metrics,
  top = "1rem",
  right = "1rem",
  stacked = false,
}) {
  if (!metrics) {
    return null;
  }

  const splitAuthoritativeMetrics = [
    metrics.outputTargetFps,
    metrics.outputFps,
    metrics.outputPaintFps,
    metrics.renderCompletedToPaintMs,
    metrics.lastInvalidateToPaintMs,
    metrics.stageRenderLeadMs,
    metrics.stageRenderCoalescedRequestCount,
    metrics.outputPublishAttemptCount,
    metrics.outputDeferredPublishCount,
    metrics.outputCoalescedPublishCount,
    metrics.outputDiscardedPendingPublishCount,
    metrics.outputDiscardedPublishResultCount,
    metrics.outputSuccessfulPublishCount,
    metrics.outputDroppedPublishCount,
    metrics.outputFailedPublishCount,
    metrics.outputLastPublishDropReason,
    metrics.outputLastPublishDurationMs,
    metrics.outputAveragePublishDurationMs,
  ].some(hasHudMetricValue);
  const resolvedTargetFps = splitAuthoritativeMetrics
    ? (metrics.outputTargetFps ?? metrics.targetFps)
    : metrics.targetFps;
  const showTargetFps =
    typeof resolvedTargetFps === "number" &&
    isAdaptivePerformanceProfile(metrics.qualityPreset) &&
    metrics.qualityPreset === "custom";
  const targetFpsLabel = "Target";

  const showRaymarchSteps =
    usesRaymarchVolumePipeline(metrics.visualizationMethod) &&
    metrics.requestedRaymarchSteps > 0;
  const raymarchStepsLabel = showRaymarchSteps
    ? `${Math.round(metrics.effectiveRaymarchSteps)} / ${Math.round(metrics.requestedRaymarchSteps)}`
    : null;
  const renderSurfaceLabel = formatRenderSurfaceLabel(metrics.renderSurface);
  const performanceProfileLabel = metrics.qualityPreset
    ? formatPerformanceProfileLabel(metrics.qualityPreset)
    : null;
  const stageCadenceLabel = formatFps(metrics.fps) ?? "n/a";
  const outputCadenceLabel = buildOutputCadenceLabel(metrics);
  const renderToPaintLabel = formatMs(metrics.renderCompletedToPaintMs);
  const outputQueueLabel = buildOutputQueueLabel(metrics);
  const publishSummary =
    metrics.outputPublishAttemptCount != null ||
    metrics.outputSuccessfulPublishCount != null
      ? `${Math.round(metrics.outputSuccessfulPublishCount ?? 0)} / ${Math.round(metrics.outputPublishAttemptCount ?? 0)}`
      : null;
  const showPixelRatioLabel =
    typeof metrics.currentPixelRatio === "number" &&
    typeof metrics.basePixelRatio === "number" &&
    Number.isFinite(metrics.currentPixelRatio) &&
    Number.isFinite(metrics.basePixelRatio) &&
    Math.abs(metrics.currentPixelRatio - metrics.basePixelRatio) > 0.001;
  const showResolutionFields = showPixelRatioLabel || renderSurfaceLabel;
  return (
    <aside
      data-testid="performance-hud"
      style={{
        position: stacked ? "relative" : "fixed",
        top: stacked ? "auto" : top,
        right: stacked ? "auto" : right,
        zIndex: 10000,
        width: TOP_RIGHT_OVERLAY_PANEL_WIDTH,
        boxSizing: "border-box",
        padding: "0.7rem 0.78rem",
        borderRadius: "0.78rem",
        background: "var(--nd-surface)",
        border: "none",
        color: "var(--nd-text-primary)",
        fontFamily: "var(--baryon-type-mono-family)",
        fontSize: "10.5px",
        lineHeight: 1.45,
        pointerEvents: "none",
        boxShadow: "var(--nd-shell-shadow)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.32rem",
          fontWeight: 700,
          marginBottom: "0.32rem",
          letterSpacing: "var(--baryon-type-section-letter-spacing)",
          color: "var(--nd-text-secondary)",
          minWidth: 0,
        }}
      >
        <span style={{ textTransform: "uppercase" }}>Performance</span>
        {performanceProfileLabel ? (
          <>
            <span aria-hidden="true">·</span>
            <span
              data-testid="performance-hud-profile-title"
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: "italic",
                letterSpacing: 0,
                color: "var(--nd-text-primary)",
              }}
            >
              {performanceProfileLabel}
            </span>
          </>
        ) : null}
      </div>
      {showTargetFps ? (
        <div>
          {targetFpsLabel}: {Math.round(resolvedTargetFps)} FPS
        </div>
      ) : null}
      {splitAuthoritativeMetrics ? (
        <>
          <div>Stage: {stageCadenceLabel}</div>
          {outputCadenceLabel ? <div>Output: {outputCadenceLabel}</div> : null}
          {renderToPaintLabel ? <div>Latency: {renderToPaintLabel}</div> : null}
          {publishSummary && shouldShowPublishSummary(metrics) ? (
            <div>Publish: {publishSummary}</div>
          ) : null}
          {outputQueueLabel ? <div>Queue: {outputQueueLabel}</div> : null}
          {shouldShowNonZeroCount(metrics.outputDroppedPublishCount) ? (
            <div>Drops: {Math.round(metrics.outputDroppedPublishCount)}</div>
          ) : null}
          {shouldShowNonZeroCount(metrics.outputFailedPublishCount) ? (
            <div>Failures: {Math.round(metrics.outputFailedPublishCount)}</div>
          ) : null}
          {metrics.outputLastPublishDropReason ? (
            <PerformanceHudTextRow>
              Last Drop: {metrics.outputLastPublishDropReason}
            </PerformanceHudTextRow>
          ) : null}
        </>
      ) : (
        <>
          <div>FPS: {formatNumber(metrics.fps, 1)}</div>
          <div>Frame ms: {formatNumber(metrics.smoothedFrameTimeMs, 2)}</div>
        </>
      )}
      {raymarchStepsLabel ? <div>Steps: {raymarchStepsLabel}</div> : null}
      {showResolutionFields ? (
        <>
          <PerformanceHudDivider />
          <div data-testid="performance-hud-resolution-fields">
            {showPixelRatioLabel ? (
              <div>
                DPR: {formatNumber(metrics.currentPixelRatio, 3)} /{" "}
                {formatNumber(metrics.basePixelRatio, 3)}
              </div>
            ) : null}
            {renderSurfaceLabel ? (
              <div>Canvas: {renderSurfaceLabel}</div>
            ) : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}
