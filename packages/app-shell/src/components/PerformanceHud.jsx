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
}) {
  if (!metrics) {
    return null;
  }

  return (
    <aside
      data-testid="performance-hud"
      style={{
        position: "fixed",
        top,
        right,
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
      <div>FPS: {formatNumber(metrics.fps, 1)}</div>
      <div>Frame ms: {formatNumber(metrics.smoothedFrameTimeMs, 2)}</div>
      <div>
        DPR: {formatNumber(metrics.currentPixelRatio, 3)} /{" "}
        {formatNumber(metrics.basePixelRatio, 3)}
      </div>
    </aside>
  );
}
