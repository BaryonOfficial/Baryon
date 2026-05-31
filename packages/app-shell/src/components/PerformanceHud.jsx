import { formatPerformanceProfileLabel } from "@baryon/visualizer/render/outputProfilePolicy";
import { usesRaymarchVolumePipeline } from "@baryon/visualizer/visualization/types";
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
  const temporalBlendLabel =
    typeof metrics.temporalHistoryBlend === "number"
      ? formatNumber(metrics.temporalHistoryBlend, 2)
      : "—";
  let traaLabel = null;
  if (usesRaymarchVolumePipeline(metrics.visualizationMethod)) {
    traaLabel = metrics.traaEnabled
      ? `on · blend ${temporalBlendLabel}`
      : "off";
  }

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
          fontWeight: 700,
          marginBottom: "0.32rem",
          textTransform: "uppercase",
          letterSpacing: "var(--baryon-type-section-letter-spacing)",
          color: "var(--nd-text-secondary)",
        }}
      >
        Performance
      </div>
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
      <div>
        DPR: {formatNumber(metrics.currentPixelRatio, 3)} /{" "}
        {formatNumber(metrics.basePixelRatio, 3)}
      </div>
      {renderScaleLabel ? <div>Render Scale: {renderScaleLabel}</div> : null}
      {metrics.qualityPreset ? (
        <div>
          Performance Profile:{" "}
          {formatPerformanceProfileLabel(
            metrics.qualityPreset,
            resolvedTargetFps ?? metrics.targetFps,
          )}
        </div>
      ) : null}
      {typeof resolvedTargetFps === "number" ? (
        <div>
          {targetFpsLabel}: {Math.round(resolvedTargetFps)}
        </div>
      ) : null}
      {raymarchStepsLabel ? <div>Steps: {raymarchStepsLabel}</div> : null}
      {traaLabel ? <div>TRAA: {traaLabel}</div> : null}
    </aside>
  );
}
