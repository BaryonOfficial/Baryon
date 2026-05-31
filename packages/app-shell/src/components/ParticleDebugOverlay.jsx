import { useEffect, useRef, useState } from "react";
import { DEVTOOLS_ENABLED } from "../devtools/config.js";
import {
  normalizeDebugOverlayItems,
  resolveDebugOverlayState,
  shouldRenderDebugOverlay,
} from "./ParticleDebugOverlayState.js";

function formatNumber(value, digits = 3) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function humanizeDebugToken(value) {
  if (typeof value !== "string" || !value) {
    return "none";
  }

  return value.replace(/-/g, " ");
}

function formatAnalysisPath(mode, path) {
  if (typeof path !== "string" || !path || path === "none" || path === mode) {
    return null;
  }

  return humanizeDebugToken(path);
}

function formatFieldEvalMode({
  modalBasisCacheMode,
  modalBasisCacheReady,
  modalBasisCacheRebuildPending,
  modalBasisCacheBackend,
  spectralLightEvaluationMode,
}) {
  if (modalBasisCacheMode === "modal-basis-cached") {
    if (modalBasisCacheRebuildPending) {
      return modalBasisCacheReady
        ? "basis cached (rebuilding)"
        : "basis cached (warming)";
    }
    return "basis cached";
  }

  if (
    modalBasisCacheMode === "unavailable" ||
    modalBasisCacheBackend === "unavailable"
  ) {
    return "unavailable";
  }

  if (modalBasisCacheRebuildPending) {
    return "basis cache pending";
  }

  if (modalBasisCacheReady) {
    return "basis cache ready";
  }

  if (spectralLightEvaluationMode) {
    return humanizeDebugToken(spectralLightEvaluationMode);
  }

  return humanizeDebugToken(modalBasisCacheMode ?? "off");
}

function formatModalBasisCacheState({
  modalBasisCacheBackend,
  modalBasisCacheReady,
  modalBasisCacheRebuildPending,
}) {
  if (modalBasisCacheBackend === "unavailable") {
    return "unavailable";
  }

  if (modalBasisCacheRebuildPending) {
    return "building";
  }

  if (modalBasisCacheReady) {
    return "ready";
  }

  return "idle";
}

function selectDebugSnapshot(snapshot) {
  if (!snapshot) return null;
  return snapshot.raymarchDebug ?? snapshot;
}

const DEBUG_METRIC_TOOLTIPS = {
  Method:
    "Which renderer is drawing the frame. This is the visualization path, not the audio analysis mode.",
  Field:
    "Whether the raymarched field is actively rendering or falling back to an idle/inactive state.",
  Path: "The internal analysis path used inside that mode. Legacy often reports layered here.",
  Pitch: "Which pitch-detection source the analysis favored for this frame.",
  Input:
    "Which input classification the analyzer used, such as system audio, loopback, or mic-style input.",
  Modes:
    "How many display-visible modal slots are active in the current frame.",
  Eval: "Which 3D field-evaluation path is actually active right now. This reflects the renderer’s live material path, not just the selector setting.",
  "Basis cache":
    "Current modal-basis-cache lifecycle state. Building means compute work has been enqueued, Ready means the canonical basis atlas can be sampled, Unavailable means basis compute failed closed.",
  Structure:
    "Overall structural confidence. Higher values mean the analyzer sees a stronger organized modal field.",
  Change:
    "How much the modal structure is changing frame to frame. Higher means more reactive movement.",
  Coherence:
    "How internally consistent the active modal field is. Higher values usually mean clearer cymatic structure.",
  Steps: "Current raymarch step budget used for this frame.",
  Excite:
    "Field excitation strength reaching the renderer after analysis and gating.",
  Peak: "Peak modal-field amplitude uploaded from the canonical descriptor.",
  Support:
    "How strongly the current modal field is supported by renderer-side field authority.",
  Opacity: "Average opacity contributed by the rendered volume this frame.",
  Density: "Average body density in the raymarched field this frame.",
  Exit: "Estimated early-exit ratio in the raymarch. Higher values usually mean more rays are terminating sooner.",
  Volume: "Whether the volumetric field is currently considered visible.",
  Rendered: "Canonical modal-field slots uploaded from the descriptor.",
  Desc: "Current canonical descriptor field authority.",
  Overflow:
    "Whether the observer produced more valid modes than descriptor capacity.",
  Chroma: "Maximum Spectral Light color weight uploaded for the modal field.",
  Flux: "Weighted spectral-flux contribution to Change. Higher values mean more fresh frequency-bin motion.",
  Hit: "Weighted transient-energy contribution to Change. Higher values mean stronger attacks and onsets.",
  "Slot Δ": "Weighted average slot-amplitude delta contribution to Change.",
  Turn: "Weighted slot-turnover contribution to Change. Higher values mean more modes entering, leaving, or crossing the turnover threshold.",
  Timbre:
    "Weighted timbral-redistribution contribution to Change, based on centroid versus band spread.",
  "Render Mode":
    "Whether the visible preview is still locally rendered or is showing the shared external-output feed.",
  Output: "Current external-output frame size routed to Syphon.",
  Profile:
    "Requested external-output quality profile after desktop output resolution and profile selection.",
  "Req Scale":
    "Requested internal render scale for the hidden Syphon output stage.",
  "Live Scale":
    "Current effective render scale reported by the hidden Syphon output stage runtime.",
  FPS: "Current FPS reported by the hidden Syphon output stage runtime snapshot.",
  TRAA: "Whether temporal resolve/anti-aliasing is enabled in the hidden Syphon stage.",
  Phase:
    "Current Syphon stage lifecycle phase in the desktop output controller.",
  Clients: "Whether the Syphon server currently reports any attached clients.",
  Publishes:
    "Successful Syphon publish count reported by the desktop output controller.",
  Stall:
    "Latest Syphon stall classification or reason. 'none' means the controller does not currently report a stall.",
};
const CHANGE_MIX_FIELDS = [
  ["Flux", "flux"],
  ["Hit", "hit"],
  ["Slot Δ", "slotDelta"],
  ["Turn", "turnover"],
  ["Timbre", "timbre"],
  ["Hint", "hint"],
];

function getMetricTooltip(label) {
  return (
    DEBUG_METRIC_TOOLTIPS[label] ??
    `${label}: diagnostic metric in the live analysis snapshot.`
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildChangeMixItems(changeBreakdown) {
  if (!changeBreakdown) {
    return null;
  }

  return CHANGE_MIX_FIELDS.map(([label, key]) => ({
    label,
    value: formatNumber(changeBreakdown[key]),
  }));
}

function CompactGrid({
  items,
  columns = 2,
  accent = false,
  onMetricEnter,
  onMetricLeave,
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: "0.4rem 0.45rem",
      }}
    >
      {items.map(({ label, value }) => (
        <div
          key={label}
          onPointerEnter={(event) => onMetricEnter?.(event, label)}
          onPointerLeave={onMetricLeave}
          style={{
            minWidth: 0,
            padding: accent ? "0.44rem 0.5rem" : "0.38rem 0.46rem",
            borderRadius: accent ? "0.75rem" : "0.6rem",
            background: accent
              ? "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))"
              : "rgba(255, 255, 255, 0.04)",
            border: accent
              ? "1px solid rgba(255,255,255,0.09)"
              : "1px solid rgba(255, 255, 255, 0.07)",
            pointerEvents: "auto",
            cursor: "help",
          }}
        >
          <div
            style={{
              color: "rgba(217, 236, 255, 0.62)",
              fontSize: "10px",
              letterSpacing: "var(--baryon-type-action-letter-spacing)",
              textTransform: "uppercase",
              marginBottom: "0.14rem",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontWeight: accent ? 700 : 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionKicker({ children }) {
  return (
    <div
      style={{
        marginTop: "0.52rem",
        marginBottom: "0.32rem",
        color: "rgba(217, 236, 255, 0.64)",
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "var(--baryon-type-dense-label-letter-spacing)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

export default function ParticleDebugOverlay({
  top = "1rem",
  right = "1rem",
  stacked = false,
  debugOverlayExtraItems = null,
  enabledOverride = undefined,
  snapshotOverride = undefined,
}) {
  const overlayRef = useRef(null);
  const dragStateRef = useRef(null);
  const [overlayState, setOverlayState] = useState({
    enabled: false,
    snapshot: null,
  });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipState, setTooltipState] = useState(null);

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

  useEffect(() => {
    if (!DEVTOOLS_ENABLED || typeof window === "undefined") {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      setDragOffset({
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      });
      setTooltipState(null);
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current) {
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const resolvedOverlayState = resolveDebugOverlayState({
    localState: overlayState,
    enabledOverride,
    snapshotOverride,
  });

  if (
    !shouldRenderDebugOverlay({
      enabledOverride,
      overlayState: resolvedOverlayState,
    })
  ) {
    return null;
  }

  const snapshot = resolvedOverlayState.snapshot;
  const debugSnapshot = selectDebugSnapshot(snapshot);
  if (!debugSnapshot) {
    return null;
  }

  const method = snapshot.visualizationMethod ?? "raymarch";
  const primaryModeCount =
    snapshot.modeSlotCount ?? snapshot.activeModeCount ?? 0;
  const primaryCoherence =
    snapshot.modeCoherence ?? debugSnapshot.modeCoherence;
  const primaryPathLabel = formatAnalysisPath(
    "modal-excitation",
    snapshot.analysisEngine,
  );
  const currentPitchLabel = humanizeDebugToken(snapshot.pitchSource ?? "none");
  const currentInputLabel = humanizeDebugToken(
    snapshot.analysisSourceUsed ?? "none",
  );
  const summaryItems = [
    { label: "Method", value: method },
    { label: "Field", value: debugSnapshot.fieldState },
    {
      label: "Eval",
      value: formatFieldEvalMode(debugSnapshot),
    },
    { label: "Pitch", value: currentPitchLabel },
    { label: "Input", value: currentInputLabel },
    {
      label: "Modes",
      value:
        debugSnapshot.modeSlotCount ??
        debugSnapshot.activeModeCount ??
        primaryModeCount,
    },
  ];
  if (primaryPathLabel) {
    summaryItems.splice(3, 0, { label: "Path", value: primaryPathLabel });
  }
  const topSignalItems = [
    { label: "Structure", value: formatNumber(snapshot.structureSignal) },
    { label: "Change", value: formatNumber(snapshot.changeSignal) },
    { label: "Coherence", value: formatNumber(primaryCoherence) },
  ];
  const changeMixItems = buildChangeMixItems(debugSnapshot.changeBreakdown);
  const supportItems = [
    { label: "Steps", value: debugSnapshot.stepBudget ?? "n/a" },
    { label: "Excite", value: formatNumber(debugSnapshot.fieldExcitation) },
    {
      label: "Peak",
      value: formatNumber(debugSnapshot.peakModalFieldAmplitude),
    },
    {
      label: "Obs Smp",
      value: formatNumber(debugSnapshot.observationSampledSupport, 2),
    },
    { label: "Opacity", value: formatNumber(debugSnapshot.avgOpacity) },
    { label: "Density", value: formatNumber(debugSnapshot.avgDensity) },
    { label: "Exit", value: formatNumber(debugSnapshot.earlyExitRatio) },
    { label: "Volume", value: String(debugSnapshot.volumeVisible) },
    {
      label: "Rendered",
      value: debugSnapshot.renderedModalFieldModeCount ?? "n/a",
    },
    {
      label: "Desc",
      value: debugSnapshot.modalDescriptorFieldAuthority ?? "n/a",
    },
    {
      label: "Overflow",
      value: debugSnapshot.modalDescriptorOverflow ? "yes" : "no",
    },
    {
      label: "Chroma",
      value: formatNumber(debugSnapshot.renderedModalFieldColorWeightMax, 2),
    },
    {
      label: "Basis cache",
      value: formatModalBasisCacheState(debugSnapshot),
    },
  ];
  const externalOutputItems = normalizeDebugOverlayItems(
    debugOverlayExtraItems,
  );
  const handleHeaderPointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    setTooltipState(null);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
    setIsDragging(true);
    event.preventDefault();
  };
  const handleMetricEnter = (event, label) => {
    if (!overlayRef.current) {
      return;
    }

    const panelRect = overlayRef.current.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();
    const centerX = targetRect.left - panelRect.left + targetRect.width / 2;
    const placeAbove = targetRect.top - panelRect.top > panelRect.height * 0.55;
    const horizontalPadding = Math.min(
      112,
      Math.max(56, panelRect.width * 0.3),
    );

    setTooltipState({
      label,
      text: getMetricTooltip(label),
      x: clamp(centerX, horizontalPadding, panelRect.width - horizontalPadding),
      y: placeAbove
        ? targetRect.top - panelRect.top - 8
        : targetRect.bottom - panelRect.top + 8,
      placement: placeAbove ? "top" : "bottom",
    });
  };
  const handleMetricLeave = () => {
    setTooltipState(null);
  };

  return (
    <aside
      data-testid="raymarch-debug-overlay"
      ref={overlayRef}
      style={{
        position: stacked ? "relative" : "fixed",
        top: stacked ? "auto" : top,
        right: stacked ? "auto" : right,
        zIndex: 10001,
        width: "min(21.5rem, calc(100vw - 2rem))",
        maxWidth: "21.5rem",
        padding: "0.78rem 0.82rem 0.82rem",
        borderRadius: "1rem",
        background:
          "linear-gradient(180deg, rgba(3, 5, 10, 0.88), rgba(0, 0, 0, 0.82))",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
        color: "#d9ecff",
        fontFamily: "var(--baryon-type-mono-family)",
        fontSize: "11px",
        lineHeight: 1.22,
        pointerEvents: "none",
        backdropFilter: "blur(12px)",
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        willChange: isDragging ? "transform" : "auto",
      }}
    >
      <div
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
        title="Drag to move. Double-click to reset."
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "0.5rem",
          cursor: isDragging ? "grabbing" : "grab",
          pointerEvents: "auto",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: "12px",
            letterSpacing: "var(--baryon-type-data-letter-spacing)",
          }}
        >
          Visualization Debug
        </div>
        <div
          style={{
            color: "rgba(217,236,255,0.58)",
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "var(--baryon-type-action-letter-spacing)",
            whiteSpace: "nowrap",
          }}
        >
          live audit
        </div>
      </div>
      <CompactGrid
        items={summaryItems}
        columns={3}
        onMetricEnter={handleMetricEnter}
        onMetricLeave={handleMetricLeave}
      />
      <SectionKicker>Signals</SectionKicker>
      <CompactGrid
        items={topSignalItems}
        columns={3}
        accent
        onMetricEnter={handleMetricEnter}
        onMetricLeave={handleMetricLeave}
      />
      {changeMixItems ? (
        <>
          <SectionKicker>Change Mix</SectionKicker>
          <CompactGrid
            items={changeMixItems}
            columns={3}
            onMetricEnter={handleMetricEnter}
            onMetricLeave={handleMetricLeave}
          />
        </>
      ) : null}
      <SectionKicker>Render</SectionKicker>
      <CompactGrid
        items={supportItems}
        columns={4}
        onMetricEnter={handleMetricEnter}
        onMetricLeave={handleMetricLeave}
      />
      {externalOutputItems ? (
        <>
          <SectionKicker>External Output</SectionKicker>
          <CompactGrid
            items={externalOutputItems}
            columns={3}
            onMetricEnter={handleMetricEnter}
            onMetricLeave={handleMetricLeave}
          />
        </>
      ) : null}
      {tooltipState ? (
        <div
          style={{
            position: "absolute",
            left: tooltipState.x,
            top: tooltipState.y,
            transform:
              tooltipState.placement === "top"
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
            width: "min(16rem, calc(100% - 1rem))",
            padding: "0.5rem 0.6rem 0.55rem",
            borderRadius: "0.75rem",
            background: "rgba(6, 10, 18, 0.96)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        >
          <div
            style={{
              color: "#E8DFD0",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "var(--baryon-type-action-letter-spacing)",
              textTransform: "uppercase",
              marginBottom: "0.18rem",
            }}
          >
            {tooltipState.label}
          </div>
          <div
            style={{
              color: "rgba(217,236,255,0.84)",
              fontSize: "10px",
              lineHeight: 1.35,
            }}
          >
            {tooltipState.text}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
