import { formatPerformanceProfileLabel } from "@baryon/visualizer/render/outputPipeline";

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

  const showRaymarchSteps =
    metrics.visualizationMethod === "raymarch" &&
    metrics.requestedRaymarchSteps > 0;
  const raymarchStepsLabel = showRaymarchSteps
    ? `${Math.round(metrics.effectiveRaymarchSteps)} / ${Math.round(metrics.requestedRaymarchSteps)}`
    : null;
  const renderScaleLabel =
    typeof metrics.renderScale === "number"
      ? formatNumber(metrics.renderScale, 3)
      : null;

  return (
    <aside
      data-testid="performance-hud"
      style={{
        position: stacked ? "relative" : "fixed",
        top: stacked ? "auto" : top,
        right: stacked ? "auto" : right,
        zIndex: 10000,
        minWidth: "9rem",
        padding: "0.55rem 0.7rem",
        borderRadius: "0.75rem",
        background: "rgba(6, 10, 15, 0.74)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        color: "#ecf5ff",
        fontFamily:
          '"Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: "11px",
        lineHeight: 1.45,
        pointerEvents: "none",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
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
        <div>Target FPS: {Math.round(resolvedTargetFps)}</div>
      ) : null}
      {raymarchStepsLabel ? <div>Steps: {raymarchStepsLabel}</div> : null}
    </aside>
  );
}
