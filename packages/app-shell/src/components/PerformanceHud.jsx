import {
  PERFORMANCE_PROFILES,
  formatPerformanceProfileLabel,
  normalizePerformanceProfile,
} from "@baryon/engine/render/outputProfilePolicy";
import { usesRaymarchVolumePipeline } from "@baryon/engine/visualization/types";
import { TOP_RIGHT_OVERLAY_PANEL_WIDTH } from "./topRightOverlayLayout.js";

function formatNumber(value, digits = 1) {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    !Number.isFinite(value)
  ) {
    return "n/a";
  }

  return value.toFixed(digits);
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

export default function PerformanceHud({
  metrics,
  top = "1rem",
  right = "1rem",
  stacked = false,
}) {
  if (!metrics) {
    return null;
  }

  const splitAuthoritativeMetrics =
    Object.prototype.hasOwnProperty.call(metrics, "outputTargetFps") ||
    Object.prototype.hasOwnProperty.call(metrics, "outputFps") ||
    Object.prototype.hasOwnProperty.call(metrics, "outputPaintFps") ||
    Object.prototype.hasOwnProperty.call(metrics, "renderCompletedToPaintMs");
  const resolvedTargetFps = splitAuthoritativeMetrics
    ? (metrics.outputTargetFps ?? metrics.targetFps)
    : metrics.targetFps;
  const normalizedQualityPreset = normalizePerformanceProfile(
    metrics.qualityPreset,
  );
  const displayRateCadence =
    normalizedQualityPreset === PERFORMANCE_PROFILES.maxQuality;
  const targetFpsLabel = splitAuthoritativeMetrics
    ? "Output Target FPS"
    : "Frame Budget FPS";

  const showRaymarchSteps =
    usesRaymarchVolumePipeline(metrics.visualizationMethod) &&
    metrics.requestedRaymarchSteps > 0;
  const raymarchStepsLabel = showRaymarchSteps
    ? `${Math.round(metrics.effectiveRaymarchSteps)} / ${Math.round(metrics.requestedRaymarchSteps)}`
    : null;
  const renderScaleLabel =
    typeof metrics.renderScale === "number"
      ? formatNumber(metrics.renderScale, 3)
      : null;
  const renderSurfaceLabel = formatRenderSurfaceLabel(metrics.renderSurface);
  const performanceProfileLabel = metrics.qualityPreset
    ? formatPerformanceProfileLabel(metrics.qualityPreset)
    : null;
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
      {displayRateCadence ? (
        <div>Cadence: Display Rate</div>
      ) : typeof resolvedTargetFps === "number" ? (
        <div>
          {targetFpsLabel}: {Math.round(resolvedTargetFps)}
        </div>
      ) : null}
      {splitAuthoritativeMetrics ? (
        <>
          <div>Stage FPS: {formatNumber(metrics.fps, 1)}</div>
          <div>
            Stage Frame ms: {formatNumber(metrics.smoothedFrameTimeMs, 2)}
          </div>
          <div>Output FPS: {formatNumber(metrics.outputFps, 1)}</div>
          <div>Output Paint FPS: {formatNumber(metrics.outputPaintFps, 1)}</div>
          <div>
            Render-&gt;Paint ms:{" "}
            {formatNumber(metrics.renderCompletedToPaintMs, 2)}
          </div>
        </>
      ) : (
        <>
          <div>FPS: {formatNumber(metrics.fps, 1)}</div>
          <div>Frame ms: {formatNumber(metrics.smoothedFrameTimeMs, 2)}</div>
        </>
      )}
      {raymarchStepsLabel ? <div>Steps: {raymarchStepsLabel}</div> : null}
      <PerformanceHudDivider />
      <div data-testid="performance-hud-resolution-fields">
        <div>
          DPR: {formatNumber(metrics.currentPixelRatio, 3)} /{" "}
          {formatNumber(metrics.basePixelRatio, 3)}
        </div>
        {renderScaleLabel ? <div>Render Scale: {renderScaleLabel}</div> : null}
        {renderSurfaceLabel ? <div>Canvas: {renderSurfaceLabel}</div> : null}
      </div>
    </aside>
  );
}
