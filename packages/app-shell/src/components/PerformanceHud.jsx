import { formatPerformanceProfileLabel } from "@baryon/visualizer/render/outputProfilePolicy";
import { usesRaymarchVolumePipeline } from "@baryon/visualizer/visualization/types";

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
  const renderSurfaceLabel = formatRenderSurfaceLabel(metrics.renderSurface);
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
        minWidth: "9.25rem",
        padding: "0.7rem 0.78rem",
        borderRadius: "0.78rem",
        background: "var(--nd-surface)",
        border: "1px solid var(--nd-border-visible)",
        color: "var(--nd-text-primary)",
        fontFamily:
          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
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
          letterSpacing: "0.14em",
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
      {renderSurfaceLabel ? <div>Canvas: {renderSurfaceLabel}</div> : null}
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
