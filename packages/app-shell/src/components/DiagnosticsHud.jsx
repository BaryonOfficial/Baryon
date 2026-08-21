import { useEffect, useRef, useState } from "react";
import { RAYMARCH_OPTICAL_FIELD_REPRESENTATION } from "@baryon/engine/core/raymarch/quantityLedger";
import { usesRaymarchVolumePipeline } from "@baryon/engine/visualization/types";
import { DEVTOOLS_ENABLED } from "../devtools/config.js";
import {
  normalizeDiagnosticsHudItems,
  reconcileDiagnosticsHudState,
  resolveDiagnosticsHudState,
  shouldRenderDiagnosticsHud,
} from "./DiagnosticsHudState.js";

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function humanizeDebugToken(value) {
  if (typeof value !== "string" || !value) {
    return "none";
  }

  return value.replace(/-/g, " ");
}

function humanizeMetricValue(value) {
  return typeof value === "string" ? humanizeDebugToken(value) : value;
}

function formatAnalysisPath(mode, path) {
  if (typeof path !== "string" || !path || path === "none" || path === mode) {
    return null;
  }

  return humanizeDebugToken(path);
}

function describeFieldRepresentation({ opticalFieldRepresentation }) {
  const representation =
    opticalFieldRepresentation ?? RAYMARCH_OPTICAL_FIELD_REPRESENTATION;

  if (representation === RAYMARCH_OPTICAL_FIELD_REPRESENTATION) {
    return {
      title: "Complete modal Gor'kov field",
      attributes: ["Fixed scale-space", "Persistent topology", "U0 observer"],
    };
  }

  return {
    title: humanizeDebugToken(representation),
    attributes: [],
  };
}

function formatVisibilityGateState(value) {
  switch (value) {
    case "visible":
      return "visible";
    case "render-authority-off":
      return "no authority";
    case "modal-packet-empty":
      return "no modal packet";
    case "volume-hidden":
      return "volume hidden";
    default:
      return "n/a";
  }
}

function selectDebugSnapshot(snapshot) {
  if (!snapshot) return null;
  return snapshot.raymarchDebug ?? snapshot;
}

const DEBUG_METRIC_TOOLTIPS = {
  Path: "The internal analysis path used inside that mode. Legacy often reports layered here.",
  Pitch: "Which pitch-detection source the analysis favored for this frame.",
  Input:
    "Which input classification the analyzer used, such as system audio, loopback, or mic-style input.",
  Modes:
    "How many display-visible modal slots are active in the current frame.",
  Eval: "Which 3D field-evaluation path is actually active right now. This reflects the renderer’s live material path, not just the selector setting.",
  Authority:
    "Whether the canonical modal descriptor is complete and authoritative for this frame.",
  Slots:
    "Rendered modal slots compared with the descriptor's available radiation-potential capacity.",
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
  "Obs Support":
    "How strongly the current modal field is supported by renderer-side field authority.",
  Opacity: "Average opacity contributed by the rendered volume this frame.",
  Density: "Average body density in the raymarched field this frame.",
  Exit: "Estimated early-exit ratio in the raymarch. Higher values usually mean more rays are terminating sooner.",
  Volume: "Whether the volumetric field is currently considered visible.",
  Gate: "Which runtime gate owns a hidden or near-black raymarch frame: render authority, modal basis, Spectral lane cache, volume visibility, or material output.",
  Overflow:
    "Whether the observer produced more valid modes than descriptor capacity.",
  Chroma: "Maximum Spectral Light color weight uploaded for the modal field.",
  Lane: "Spectral lane-cache radiance input currently drawable by the material. This is the canonical Spectral packet signal, separate from modal color-slot Chroma.",
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
    "Requested external-output performance profile after desktop output resolution and profile selection.",
  FPS: "Current FPS reported by the hidden Syphon output stage runtime snapshot.",
  TRAA: "Whether temporal reprojection anti-aliasing is enabled in the render output graph.",
  SMAA: "Whether final screen-space morphological anti-aliasing is enabled in the render output graph.",
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

const CSS = `
.baryon-diagnostics-hud {
  box-sizing: border-box;
  container-name: diagnostics-hud;
  container-type: inline-size;
  max-height: calc(100vh - 1.8rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(232, 223, 208, 0.2) transparent;
  scrollbar-width: thin;
}

.baryon-diagnostics-hud[data-stacked="true"] {
  max-height: none;
  overflow: visible;
}

.baryon-diagnostics-hud *,
.baryon-diagnostics-hud *::before,
.baryon-diagnostics-hud *::after {
  box-sizing: border-box;
}

.baryon-diagnostics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  min-height: 1.45rem;
  cursor: grab;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}

.baryon-diagnostics-header[data-dragging="true"] {
  cursor: grabbing;
}

.baryon-diagnostics-title {
  color: var(--nd-text-display);
  font-family: var(--baryon-type-interface-family);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1;
  letter-spacing: -0.015em;
}

.baryon-diagnostics-state {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  color: var(--nd-text-secondary);
  font-size: 0.49rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
}

.baryon-diagnostics-state-dot {
  width: 0.35rem;
  height: 0.35rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--baryon-amber);
  box-shadow: 0 0 0.5rem rgba(242, 160, 92, 0.44);
}

.baryon-diagnostics-state[data-active="true"] {
  color: color-mix(in srgb, var(--baryon-resonance) 82%, white);
}

.baryon-diagnostics-state[data-active="true"]
  .baryon-diagnostics-state-dot {
  background: var(--baryon-resonance);
  box-shadow: 0 0 0.55rem rgba(91, 227, 244, 0.46);
}

.baryon-diagnostics-context {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.18rem;
  min-width: 0;
  margin: 0.22rem 0 0.38rem;
}

.baryon-diagnostics-context-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.18rem;
  min-width: 0;
  max-width: 100%;
  padding: 0.13rem 0.22rem;
  border: 1px solid rgba(255, 245, 224, 0.055);
  border-radius: 0.24rem;
  background: rgba(0, 0, 0, 0.12);
  line-height: 1;
}

.baryon-diagnostics-context-label {
  flex: 0 0 auto;
  color: var(--nd-text-secondary);
  font-size: 0.38rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  text-transform: uppercase;
}

.baryon-diagnostics-context-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--nd-text-primary) 84%, transparent);
  font-size: 0.46rem;
  font-weight: 600;
  white-space: nowrap;
}

.baryon-diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(var(--diagnostics-columns), minmax(0, 1fr));
  gap: 0.06rem 0.42rem;
}

.baryon-diagnostics-grid[data-variant="signals"] {
  gap: 0.24rem;
}

.baryon-diagnostics-grid[data-variant="mini"] {
  gap: 0;
}

.baryon-diagnostics-grid[data-variant="dense"] {
  align-content: start;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.08rem 0.3rem;
}

.baryon-diagnostics-signal {
  min-width: 0;
  padding: 0.3rem 0.36rem 0.28rem;
  border: 1px solid rgba(255, 245, 224, 0.07);
  border-radius: 0.48rem;
  background:
    linear-gradient(180deg, rgba(255, 245, 224, 0.035), transparent),
    rgba(0, 0, 0, 0.15);
  cursor: help;
  pointer-events: auto;
}

.baryon-diagnostics-signal-label,
.baryon-diagnostics-mini-label {
  color: var(--nd-text-secondary);
  font-size: 0.45rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
}

.baryon-diagnostics-signal-value {
  margin-top: 0.2rem;
  color: var(--nd-text-primary);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
}

.baryon-diagnostics-signal-track {
  height: 1px;
  margin-top: 0.28rem;
  overflow: hidden;
  background: rgba(232, 223, 208, 0.12);
}

.baryon-diagnostics-signal-fill {
  width: var(--diagnostics-level);
  height: 100%;
  background: var(--baryon-resonance);
  box-shadow: 0 0 0.4rem rgba(91, 227, 244, 0.48);
}

.baryon-diagnostics-mini {
  min-width: 0;
  padding: 0.3rem 0.08rem 0.25rem;
  border-right: 1px solid rgba(255, 245, 224, 0.06);
  text-align: center;
  cursor: help;
  pointer-events: auto;
}

.baryon-diagnostics-mini:last-child {
  border-right: 0;
}

.baryon-diagnostics-mini-value {
  margin-top: 0.2rem;
  color: color-mix(in srgb, var(--nd-text-primary) 90%, transparent);
  font-size: 0.54rem;
  font-weight: 600;
  line-height: 1;
}

.baryon-diagnostics-dense {
  min-width: 0;
  padding: 0.05rem 0;
  cursor: help;
  pointer-events: auto;
}

.baryon-diagnostics-dense-label {
  overflow: hidden;
  color: var(--nd-text-secondary);
  font-size: 0.4rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  line-height: 1.05;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.baryon-diagnostics-dense-value {
  margin-top: 0.09rem;
  color: color-mix(in srgb, var(--nd-text-primary) 92%, transparent);
  font-size: 0.49rem;
  font-weight: 600;
  line-height: 1.12;
  overflow-wrap: break-word;
  word-break: normal;
}

.baryon-diagnostics-field-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  gap: 0.3rem;
  min-width: 0;
}

.baryon-diagnostics-field-summary {
  min-width: 0;
  padding: 0.3rem 0.34rem 0.32rem;
  border: 1px solid rgba(255, 245, 224, 0.07);
  border-radius: 0.42rem;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--baryon-resonance) 6%, transparent),
      transparent 58%
    ),
    rgba(0, 0, 0, 0.14);
}

.baryon-diagnostics-field-label {
  color: var(--nd-text-secondary);
  font-size: 0.4rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
}

.baryon-diagnostics-field-title {
  margin-top: 0.16rem;
  color: color-mix(in srgb, var(--nd-text-primary) 94%, transparent);
  font-family: var(--baryon-type-interface-family);
  font-size: 0.56rem;
  font-weight: 650;
  line-height: 1.2;
  overflow-wrap: break-word;
}

.baryon-diagnostics-field-attributes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.16rem;
  margin-top: 0.25rem;
}

.baryon-diagnostics-field-attribute {
  max-width: 100%;
  padding: 0.11rem 0.2rem;
  border-radius: 999px;
  background: rgba(91, 227, 244, 0.07);
  color: color-mix(in srgb, var(--nd-text-primary) 78%, transparent);
  font-size: 0.39rem;
  line-height: 1.15;
  overflow-wrap: break-word;
}

.baryon-diagnostics-field-metrics {
  min-width: 0;
}

.baryon-diagnostics-field-metrics
  .baryon-diagnostics-grid[data-variant="dense"] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.18rem 0.28rem;
}

.baryon-diagnostics-glance {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  margin-top: 0.2rem;
  border-top: 1px solid rgba(255, 245, 224, 0.07);
}

.baryon-diagnostics-glance-section {
  min-width: 0;
}

.baryon-diagnostics-change-label,
.baryon-diagnostics-section-kicker {
  display: flex;
  align-items: center;
  min-height: 1rem;
  padding: 0.14rem 0.28rem 0.13rem;
  border-left: 2px solid color-mix(in srgb, var(--baryon-amber) 72%, transparent);
  border-radius: 0.2rem;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--baryon-amber) 11%, transparent),
    rgba(255, 245, 224, 0.025) 62%,
    transparent
  );
  color: color-mix(in srgb, var(--nd-text-primary) 92%, transparent);
  font-family: var(--baryon-type-interface-family);
  font-size: 0.48rem;
  font-weight: 650;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
}

.baryon-diagnostics-change-label {
  margin-top: 0.3rem;
}

.baryon-diagnostics-section-kicker {
  margin: 0.24rem 0 0.14rem;
}

.baryon-diagnostics-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.38rem;
  min-width: 0;
  padding: 0.09rem 0;
  cursor: help;
  pointer-events: auto;
}

.baryon-diagnostics-row-label {
  flex: 0 0 auto;
  color: var(--nd-text-secondary);
  font-size: 0.46rem;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  text-transform: uppercase;
  white-space: nowrap;
}

.baryon-diagnostics-row-value {
  min-width: 0;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--nd-text-primary) 90%, transparent);
  font-size: 0.53rem;
  font-weight: 550;
  text-align: right;
}

.baryon-diagnostics-tooltip {
  position: absolute;
  z-index: 1;
  width: min(14rem, calc(100% - 0.8rem));
  padding: 0.5rem 0.58rem 0.54rem;
  border: 1px solid rgba(255, 245, 224, 0.1);
  border-radius: 0.62rem;
  background: rgba(13, 10, 7, 0.97);
  box-shadow: 0 0.9rem 2rem rgba(0, 0, 0, 0.48);
  pointer-events: none;
}

.baryon-diagnostics-tooltip-label {
  margin-bottom: 0.18rem;
  color: var(--nd-text-primary);
  font-size: 0.48rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  text-transform: uppercase;
}

.baryon-diagnostics-tooltip-copy {
  color: color-mix(in srgb, var(--nd-text-primary) 82%, transparent);
  font-family: var(--baryon-type-interface-family);
  font-size: 0.58rem;
  line-height: 1.38;
}

@container diagnostics-hud (max-width: 20rem) {
  .baryon-diagnostics-grid[data-variant="dense"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .baryon-diagnostics-field-overview {
    grid-template-columns: minmax(0, 1fr);
  }

  .baryon-diagnostics-field-metrics
    .baryon-diagnostics-grid[data-variant="dense"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (prefers-reduced-transparency: reduce) {
  .baryon-diagnostics-hud {
    background: var(--nd-surface) !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
}

@media (prefers-contrast: more) {
  .baryon-diagnostics-hud {
    border-color: var(--nd-text-secondary) !important;
    background: var(--baryon-void) !important;
  }
}
`;

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

function buildPostProcessItems(metrics) {
  if (!metrics || !usesRaymarchVolumePipeline(metrics.visualizationMethod)) {
    return null;
  }

  const temporalBlendLabel =
    typeof metrics.temporalHistoryBlend === "number"
      ? formatNumber(metrics.temporalHistoryBlend, 2)
      : "—";

  return [
    {
      label: "TRAA",
      value: metrics.traaEnabled ? `on · blend ${temporalBlendLabel}` : "off",
    },
    {
      label: "SMAA",
      value: metrics.smaaEnabled ? "on" : "off",
    },
  ];
}

function AccentTile({ label, value, level, onMetricEnter, onMetricLeave }) {
  const normalizedLevel = Number.isFinite(level)
    ? `${clamp(level, 0, 1) * 100}%`
    : "0%";
  /** @type {import("react").CSSProperties & { "--diagnostics-level": string }} */
  const signalStyle = { "--diagnostics-level": normalizedLevel };

  return (
    <div
      className="baryon-diagnostics-signal"
      onPointerEnter={(event) => onMetricEnter?.(event, label)}
      onPointerLeave={onMetricLeave}
      aria-label={`${label}: ${value}`}
    >
      <div className="baryon-diagnostics-signal-label">{label}</div>
      <div className="baryon-diagnostics-signal-value">{value}</div>
      <div className="baryon-diagnostics-signal-track" aria-hidden="true">
        <div className="baryon-diagnostics-signal-fill" style={signalStyle} />
      </div>
    </div>
  );
}

function MetricRow({ label, value, onMetricEnter, onMetricLeave }) {
  return (
    <div
      className="baryon-diagnostics-row"
      onPointerEnter={(event) => onMetricEnter?.(event, label)}
      onPointerLeave={onMetricLeave}
      aria-label={`${label}: ${value}`}
    >
      <span className="baryon-diagnostics-row-label">{label}</span>
      <span className="baryon-diagnostics-row-value">{value}</span>
    </div>
  );
}

function MiniMetric({ label, value, onMetricEnter, onMetricLeave }) {
  return (
    <div
      className="baryon-diagnostics-mini"
      onPointerEnter={(event) => onMetricEnter?.(event, label)}
      onPointerLeave={onMetricLeave}
      aria-label={`${label}: ${value}`}
    >
      <div className="baryon-diagnostics-mini-label">{label}</div>
      <div className="baryon-diagnostics-mini-value">{value}</div>
    </div>
  );
}

function DenseMetric({ label, value, span = 1, onMetricEnter, onMetricLeave }) {
  return (
    <div
      className="baryon-diagnostics-dense"
      style={{ gridColumn: `span ${span}` }}
      onPointerEnter={(event) => onMetricEnter?.(event, label)}
      onPointerLeave={onMetricLeave}
      aria-label={`${label}: ${value}`}
    >
      <div className="baryon-diagnostics-dense-label">{label}</div>
      <div className="baryon-diagnostics-dense-value">{value}</div>
    </div>
  );
}

function CompactGrid({
  items,
  columns = 2,
  variant = "rows",
  onMetricEnter,
  onMetricLeave,
}) {
  const Cell =
    variant === "signals"
      ? AccentTile
      : variant === "mini"
        ? MiniMetric
        : variant === "dense"
          ? DenseMetric
          : MetricRow;
  /** @type {import("react").CSSProperties & { "--diagnostics-columns": number }} */
  const gridStyle = { "--diagnostics-columns": columns };

  return (
    <div
      className="baryon-diagnostics-grid"
      data-variant={variant}
      style={gridStyle}
    >
      {items.map((item) => (
        <Cell
          key={item.label}
          {...item}
          onMetricEnter={onMetricEnter}
          onMetricLeave={onMetricLeave}
        />
      ))}
    </div>
  );
}

function ContextItem({ label, value }) {
  return (
    <span className="baryon-diagnostics-context-item">
      <span className="baryon-diagnostics-context-label">{label}</span>
      <span className="baryon-diagnostics-context-value">{value}</span>
    </span>
  );
}

function FieldOverview({
  representation,
  items,
  onMetricEnter,
  onMetricLeave,
}) {
  return (
    <div className="baryon-diagnostics-field-overview">
      <div className="baryon-diagnostics-field-summary">
        <div className="baryon-diagnostics-field-label">Representation</div>
        <div className="baryon-diagnostics-field-title">
          {representation.title}
        </div>
        {representation.attributes.length ? (
          <div className="baryon-diagnostics-field-attributes">
            {representation.attributes.map((attribute) => (
              <span
                key={attribute}
                className="baryon-diagnostics-field-attribute"
              >
                {attribute}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="baryon-diagnostics-field-metrics">
        <CompactGrid
          items={items}
          columns={2}
          variant="dense"
          onMetricEnter={onMetricEnter}
          onMetricLeave={onMetricLeave}
        />
      </div>
    </div>
  );
}

function SectionKicker({ children }) {
  return <div className="baryon-diagnostics-section-kicker">{children}</div>;
}

export default function DiagnosticsHud({
  top = "1rem",
  right = "1rem",
  stacked = false,
  diagnosticsHudExtraItems = null,
  postProcessMetrics = null,
  enabledOverride = undefined,
  snapshotOverride = undefined,
}) {
  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const diagnosticsHudStateRef = useRef({
    enabled: false,
    snapshot: null,
  });
  const [diagnosticsHudState, setDiagnosticsHudState] = useState(
    diagnosticsHudStateRef.current,
  );
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
      const nextState = reconcileDiagnosticsHudState(
        diagnosticsHudStateRef.current,
        { enabled, snapshot },
      );
      if (nextState === diagnosticsHudStateRef.current) {
        return;
      }
      diagnosticsHudStateRef.current = nextState;
      setDiagnosticsHudState(nextState);
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

  const resolvedDiagnosticsHudState = resolveDiagnosticsHudState({
    localState: diagnosticsHudState,
    enabledOverride,
    snapshotOverride,
  });

  if (
    !shouldRenderDiagnosticsHud({
      enabledOverride,
      diagnosticsHudState: resolvedDiagnosticsHudState,
    })
  ) {
    return null;
  }

  const snapshot = resolvedDiagnosticsHudState.snapshot;
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
  const fieldState = humanizeDebugToken(debugSnapshot.fieldState);
  const fieldRepresentation = describeFieldRepresentation(debugSnapshot);
  const visibleModeCount =
    debugSnapshot.modeSlotCount ??
    debugSnapshot.activeModeCount ??
    primaryModeCount;
  const contextItems = [
    { label: "Method", value: humanizeDebugToken(method) },
    primaryPathLabel ? { label: "Path", value: primaryPathLabel } : null,
    { label: "Input", value: currentInputLabel },
    { label: "Pitch", value: currentPitchLabel },
    { label: "Modes", value: visibleModeCount },
  ].filter(Boolean);
  const topSignalItems = [
    {
      label: "Structure",
      value: formatNumber(snapshot.structureSignal),
      level: snapshot.structureSignal,
    },
    {
      label: "Change",
      value: formatNumber(snapshot.changeSignal),
      level: snapshot.changeSignal,
    },
    {
      label: "Coherence",
      value: formatNumber(primaryCoherence),
      level: primaryCoherence,
    },
  ];
  const changeMixItems = buildChangeMixItems(debugSnapshot.changeBreakdown);
  const postProcessItems = buildPostProcessItems(postProcessMetrics);
  const renderSupportItems = [
    { label: "Steps", value: debugSnapshot.stepBudget ?? "n/a" },
    { label: "Excite", value: formatNumber(debugSnapshot.fieldExcitation) },
    {
      label: "Peak",
      value: formatNumber(debugSnapshot.peakModalFieldAmplitude),
    },
    { label: "Opacity", value: formatNumber(debugSnapshot.avgOpacity) },
    { label: "Density", value: formatNumber(debugSnapshot.avgDensity) },
    { label: "Exit", value: formatNumber(debugSnapshot.earlyExitRatio) },
    { label: "Volume", value: String(debugSnapshot.volumeVisible) },
    {
      label: "Gate",
      value: formatVisibilityGateState(debugSnapshot.visibilityGateState),
    },
  ];
  const renderedModeCount = debugSnapshot.renderedModalFieldModeCount ?? "n/a";
  const fieldCapacity = debugSnapshot.radiationPotentialModeCapacity ?? "n/a";
  const fieldItems = [
    {
      label: "Authority",
      value: humanizeMetricValue(
        debugSnapshot.modalDescriptorFieldAuthority ?? "n/a",
      ),
    },
    { label: "Slots", value: `${renderedModeCount} / ${fieldCapacity}` },
    {
      label: "Overflow",
      value: debugSnapshot.modalDescriptorOverflow ? "yes" : "no",
    },
    {
      label: "Pitch Conf",
      value: formatNumber(
        debugSnapshot.renderedModalFieldSpectralConfidenceMax,
        2,
      ),
    },
    {
      label: "Obs Support",
      value: formatNumber(debugSnapshot.observationSampledSupport, 2),
    },
  ];
  const externalOutputItems = normalizeDiagnosticsHudItems(
    diagnosticsHudExtraItems,
  )?.map((item) => ({
    ...item,
    value: humanizeMetricValue(item.value),
  }));
  const renderItems = postProcessItems
    ? [...postProcessItems, ...renderSupportItems]
    : renderSupportItems;
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
    if (!panelRef.current) {
      return;
    }

    const panelRect = panelRef.current.getBoundingClientRect();
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
      data-testid="diagnostics-hud"
      className="baryon-diagnostics-hud"
      data-stacked={stacked}
      aria-label="Live diagnostics"
      ref={panelRef}
      style={{
        position: stacked ? "relative" : "fixed",
        top: stacked ? "auto" : top,
        right: stacked ? "auto" : right,
        zIndex: 10001,
        width: "min(24rem, calc(100vw - 2rem))",
        padding: "0.5rem 0.58rem 0.42rem",
        borderRadius: "0.78rem",
        background:
          "linear-gradient(180deg, rgba(255, 245, 224, 0.035), transparent 5rem), color-mix(in srgb, var(--nd-surface) 90%, transparent)",
        border: "1px solid rgba(255, 245, 224, 0.08)",
        boxShadow: "var(--nd-shell-shadow)",
        color: "var(--nd-text-primary)",
        fontFamily: "var(--baryon-type-mono-family)",
        fontSize: "0.58rem",
        lineHeight: 1.25,
        pointerEvents: "none",
        backdropFilter: "blur(18px) saturate(1.12)",
        WebkitBackdropFilter: "blur(18px) saturate(1.12)",
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        willChange: isDragging ? "transform" : "auto",
      }}
    >
      <style>{CSS}</style>
      <div
        className="baryon-diagnostics-header"
        data-dragging={isDragging}
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
        title="Drag to move. Double-click to reset."
      >
        <div className="baryon-diagnostics-title">Diagnostics</div>
        <div
          className="baryon-diagnostics-state"
          data-active={debugSnapshot.fieldState === "active"}
        >
          <span className="baryon-diagnostics-state-dot" aria-hidden="true" />
          {fieldState}
        </div>
      </div>
      <div className="baryon-diagnostics-context">
        {contextItems.map((item) => (
          <ContextItem key={item.label} {...item} />
        ))}
      </div>
      <CompactGrid
        items={topSignalItems}
        columns={3}
        variant="signals"
        onMetricEnter={handleMetricEnter}
        onMetricLeave={handleMetricLeave}
      />
      {changeMixItems ? (
        <>
          <div className="baryon-diagnostics-change-label">Change mix</div>
          <CompactGrid
            items={changeMixItems}
            columns={6}
            variant="mini"
            onMetricEnter={handleMetricEnter}
            onMetricLeave={handleMetricLeave}
          />
        </>
      ) : null}
      <div className="baryon-diagnostics-glance">
        <section className="baryon-diagnostics-glance-section">
          <SectionKicker>Render + Post Process</SectionKicker>
          <CompactGrid
            items={renderItems}
            columns={6}
            variant="dense"
            onMetricEnter={handleMetricEnter}
            onMetricLeave={handleMetricLeave}
          />
        </section>
        <section className="baryon-diagnostics-glance-section">
          <SectionKicker>Field Pipeline</SectionKicker>
          <FieldOverview
            representation={fieldRepresentation}
            items={fieldItems}
            onMetricEnter={handleMetricEnter}
            onMetricLeave={handleMetricLeave}
          />
        </section>
        {externalOutputItems ? (
          <section className="baryon-diagnostics-glance-section">
            <SectionKicker>External Output</SectionKicker>
            <CompactGrid
              items={externalOutputItems}
              columns={5}
              variant="dense"
              onMetricEnter={handleMetricEnter}
              onMetricLeave={handleMetricLeave}
            />
          </section>
        ) : null}
      </div>
      {tooltipState ? (
        <div
          className="baryon-diagnostics-tooltip"
          style={{
            left: tooltipState.x,
            top: tooltipState.y,
            transform:
              tooltipState.placement === "top"
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
          }}
        >
          <div className="baryon-diagnostics-tooltip-label">
            {tooltipState.label}
          </div>
          <div className="baryon-diagnostics-tooltip-copy">
            {tooltipState.text}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
