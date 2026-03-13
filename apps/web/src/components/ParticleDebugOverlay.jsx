import { useEffect, useState } from "react";
import { DEVTOOLS_ENABLED } from "../devtools/config.js";

function formatNumber(value, digits = 3) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function selectDebugSnapshot(snapshot) {
  if (!snapshot) return null;
  return snapshot.raymarchDebug ?? snapshot;
}

export default function ParticleDebugOverlay() {
  const [overlayState, setOverlayState] = useState({
    enabled: false,
    snapshot: null,
  });

  useEffect(() => {
    if (!DEVTOOLS_ENABLED || typeof window === "undefined") {
      return undefined;
    }

    const update = () => {
      const enabled = Boolean(
        window.__baryonControls?.getState?.().auditEnabled,
      );
      const snapshot = enabled ? (window.__baryonAuditSnapshot ?? null) : null;
      setOverlayState({ enabled, snapshot });
    };

    update();
    const id = window.setInterval(update, 150);
    return () => window.clearInterval(id);
  }, []);

  if (!DEVTOOLS_ENABLED || !overlayState.enabled || !overlayState.snapshot) {
    return null;
  }

  const snapshot = overlayState.snapshot;
  const debugSnapshot = selectDebugSnapshot(snapshot);
  if (!debugSnapshot) {
    return null;
  }

  const method = snapshot.visualizationMethod ?? "raymarch";

  return (
    <aside
      data-testid="raymarch-debug-overlay"
      style={{
        position: "fixed",
        left: "1rem",
        bottom: "1rem",
        zIndex: 10001,
        minWidth: "18rem",
        padding: "0.75rem 0.9rem",
        borderRadius: "0.75rem",
        background: "rgba(0, 0, 0, 0.78)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        color: "#d9ecff",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "12px",
        lineHeight: 1.45,
        pointerEvents: "none",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>
        Raymarch Debug
      </div>
      <div>Method: {method}</div>
      <div>Field: {debugSnapshot.fieldState}</div>
      <div>
        Modes:{" "}
        {debugSnapshot.modeSlotCount ??
          debugSnapshot.activeModeCount ??
          snapshot.modeSlotCount ??
          0}
      </div>
      <div>Pitch: {snapshot.pitchSource ?? "none"}</div>
      <div>Analysis: {snapshot.analysisSourceUsed ?? "none"}</div>
      <div>Avg Opacity: {formatNumber(debugSnapshot.avgOpacity)}</div>
      <div>Avg Density: {formatNumber(debugSnapshot.avgDensity)}</div>
      <div>Early Exit: {formatNumber(debugSnapshot.earlyExitRatio)}</div>
      <div>Steps: {debugSnapshot.stepBudget ?? "n/a"}</div>
      <div>Volume: {String(debugSnapshot.volumeVisible)}</div>
      <div>Idle Overlay: {String(debugSnapshot.idleOverlayVisible)}</div>
    </aside>
  );
}
