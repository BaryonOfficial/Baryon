import React, { useRef, useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { useAudioTransportClock } from "../context/audioTransportClock.js";
import { SourceSelector } from "./controls/SourceSelector";
import { useDraggableFloatingUi } from "./hooks/useDraggableFloatingUi.js";

// ─── SVG Icons (Nothing: monoline, 1.5px stroke, no fill, round caps) ───────

function MusicNoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" y1="4" x2="6" y2="20" />
      <line x1="18" y1="4" x2="18" y2="20" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" />
    </svg>
  );
}

function VolumeIcon({ muted }) {
  if (muted) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function SoundCloudIcon() {
  return (
    <svg
      width="16"
      height="10"
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M25.2 15.1A11.3 11.3 0 0 0 14 26.4V28H9.6A9.6 9.6 0 0 0 0 37.6 2.4 2.4 0 0 0 2.4 40h50a11.6 11.6 0 0 0 0-23.1 15 15 0 0 0-27.2-1.8Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  );
}

// ─── Scrolling filename ───────────────────────────────────────────────────────

function ScrollingText({ text }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    const overflow = textEl.scrollWidth - container.clientWidth;
    setScrollDistance(overflow > 0 ? overflow : 0);
  }, [text]);

  /** @type {import("react").CSSProperties & { "--scroll-distance": string }} */
  const scrollingStyle = {
    "--scroll-distance": `-${scrollDistance}px`,
    animation: "am-scroll 9s ease-in-out infinite",
  };

  return (
    <span ref={containerRef} className="am-filename-wrap">
      <span
        ref={textRef}
        className="am-filename"
        style={scrollDistance > 0 ? scrollingStyle : undefined}
      >
        {text}
      </span>
    </span>
  );
}

// ─── Status dot ──────────────────────────────────────────────────────────────

function getStatusConfig(
  isEngineReady,
  isAudioLoaded,
  isPlaying,
  isLiveInputActive,
  liveInputDeviceKind,
) {
  if (isLiveInputActive)
    return {
      color: "#D71921",
      pulse: true,
      label:
        liveInputDeviceKind === "system" ? "System input active" : "Mic active",
    };
  if (isPlaying) return { color: "#4A9E5C", pulse: true, label: "Playing" };
  if (isAudioLoaded) return { color: "#5B9BF6", pulse: false, label: "Loaded" };
  if (isEngineReady) return { color: "#4A9E5C", pulse: false, label: "Ready" };
  return { color: "#D4A843", pulse: true, label: "Initializing" };
}

function formatClockTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatFileSize(totalBytes) {
  const safeBytes = Math.max(0, Number(totalBytes) || 0);
  if (safeBytes >= 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (safeBytes >= 1024) {
    return `${Math.round(safeBytes / 1024)} KB`;
  }
  return `${safeBytes} B`;
}

// ─── Styles (Nothing Design System — dark mode) ─────────────────────────────

const CSS = `

@keyframes am-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.am-player-shell {
  position: fixed;
  bottom: 1.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: fit-content;
  max-width: calc(100vw - 1.5rem);
}

.am-player-shell--compact {
  align-items: flex-start;
  bottom: 16px;
  width: min(100%, var(--baryon-compact-dock-min-width));
  max-width: min(calc(100vw - 1.5rem), var(--baryon-compact-dock-min-width));
}

.am-player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--nd-surface);
  border: 1px solid var(--nd-border-visible);
  border-radius: 8px;
  box-shadow: var(--nd-shell-shadow);
  font-family: "Aspekta", system-ui, sans-serif;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.am-player--compact {
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.am-controls-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  width: 100%;
}

.am-source-row,
.am-actions-row,
.am-volume-row,
.am-utility-row {
  display: contents;
}

/* ── Timeline — Nothing: flat surface, square-ended track ── */
.am-timeline-shell {
  display: flex;
  align-items: center;
  padding: 8px 16px 10px;
  background: var(--nd-surface);
  border: 1px solid var(--nd-border-visible);
  border-radius: 8px;
  box-shadow: var(--nd-shell-shadow);
}

.am-timeline-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.am-timeline-time {
  min-width: 2.4rem;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", "SF Mono", monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  text-align: center;
}

.am-progress {
  --am-progress-percent: 0%;
  appearance: none;
  -webkit-appearance: none;
  flex: 1 1 auto;
  width: 100%;
  height: 4px;
  border-radius: 0;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    90deg,
    var(--nd-text-display) 0%,
    var(--nd-text-display) var(--am-progress-percent),
    var(--nd-border) var(--am-progress-percent),
    var(--nd-border) 100%
  );
}

.am-progress::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 0;
  background: var(--nd-text-display);
  border: 1px solid var(--nd-border-visible);
}

.am-progress::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 0;
  background: var(--nd-text-display);
}

.am-progress::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 0;
  background: var(--nd-border);
}

/* ── Track section — Nothing: minimal, typographic ── */
.am-track {
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  max-width: 200px;
  min-width: 0;
  border: 1px solid transparent;
}
.am-track:hover { border-color: var(--nd-border-visible); }

.am-source-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.am-status-group {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.am-source-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--nd-text-secondary);
}

.am-track-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.am-track-popup {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%) translateY(2px);
  min-width: 13rem;
  max-width: min(18rem, calc(100vw - 2rem));
  padding: 8px 12px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 8px;
  background: var(--nd-surface);
  color: var(--nd-text-primary);
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    visibility 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  z-index: 75;
}

.am-track-popup::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 100%;
  width: 8px;
  height: 8px;
  background: var(--nd-surface);
  border-right: 1px solid var(--nd-border-visible);
  border-bottom: 1px solid var(--nd-border-visible);
  transform: translateX(-50%) translateY(-50%) rotate(45deg);
}

.am-track-popup--visible {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
}

/* ── Source buttons — Nothing: ghost/outline, no fills ── */
.am-btn--soundcloud {
  width: 30px;
  height: 30px;
  background: transparent;
  border: 1px solid var(--nd-border-visible);
  color: var(--nd-text-secondary);
}

.am-btn--soundcloud:hover {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.am-btn--soundcloud-active {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

/* ── Status — Nothing: dot + instrument-panel label ── */
.am-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.am-status-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--nd-text-disabled);
  white-space: nowrap;
}

.am-filename-wrap {
  overflow: hidden;
  max-width: 150px;
  display: block;
  min-width: 0;
}

.am-filename {
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: var(--nd-text-primary);
  white-space: nowrap;
  display: inline-block;
}

@keyframes am-scroll {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(0); }
  75%  { transform: translateX(var(--scroll-distance)); }
  90%  { transform: translateX(var(--scroll-distance)); }
  100% { transform: translateX(0); }
}

/* ── Divider — Nothing: structural border ── */
.am-divider {
  width: 1px;
  height: 18px;
  background: var(--nd-border);
  margin: 0 4px;
  flex-shrink: 0;
}

/* ── Transport ── */
.am-transport {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── Shared button base — Nothing: outlined, no fill, mechanical ── */
.am-btn {
  border: 1px solid var(--nd-border-visible);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  flex-shrink: 0;
}
.am-btn:disabled {
  opacity: 0.4;
  cursor: default;
  border-color: var(--nd-border);
  color: var(--nd-text-disabled);
}

/* Recent uploads — bare icon */
.am-btn--recent {
  width: 30px;
  height: 30px;
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-secondary);
}
.am-btn--recent:hover {
  border-color: transparent;
  color: var(--nd-text-display);
}
.am-btn--recent-active {
  border-color: transparent;
  color: var(--nd-text-display);
}

/* Play/Pause — bare icon; accent while playing signals the engaged state */
.am-btn--play {
  width: 36px;
  height: 36px;
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-primary);
}
.am-btn--play:not(:disabled):hover {
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-display);
}
.am-btn--play:not(:disabled):active { opacity: 0.6; }
.am-btn--play-active {
  color: var(--nd-accent);
}
.am-btn--play:disabled {
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-disabled);
}

/* Stop — bare icon */
.am-btn--stop {
  width: 30px;
  height: 30px;
  border-color: transparent;
  color: var(--nd-text-secondary);
}
.am-btn--stop:not(:disabled):hover {
  border-color: transparent;
  color: var(--nd-text-display);
}
.am-btn--stop:not(:disabled):active { opacity: 0.6; }

/* ── Mic ── */
.am-live-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  flex-shrink: 0;
}

.am-btn--live-input {
  width: 30px;
  height: 30px;
}
.am-btn--live-input:hover {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}
.am-btn--live-input:active { opacity: 0.8; }

.am-btn--live-input-active {
  border-color: var(--nd-accent) !important;
  color: var(--nd-accent) !important;
  animation: am-pulse 1.5s ease-in-out infinite;
}
.am-btn--live-input-active:hover {
  border-color: var(--nd-accent) !important;
  color: var(--nd-accent) !important;
}

/* ── Volume — Nothing: flat, monochrome, mechanical slider ── */
.am-volume {
  display: flex;
  align-items: center;
  gap: 8px;
}

.am-volume-meta {
  display: none;
}

.am-compact-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  width: min(100%, var(--baryon-compact-dock-min-width));
  min-width: min(100%, var(--baryon-compact-dock-min-width));
  max-width: var(--baryon-compact-dock-min-width);
}

.am-compact-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 10px;
  padding: 14px 12px 12px;
  border-radius: 16px;
  border: 1px solid var(--nd-border-visible);
  background: var(--nd-surface);
  box-shadow: var(--nd-shell-shadow);
  box-sizing: border-box;
}

.am-compact-card .am-timeline-shell {
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.am-compact-card .am-timeline-row {
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--nd-border);
  border-radius: 999px;
  background: var(--nd-surface-raised);
  box-sizing: border-box;
}

.am-compact-card .am-timeline-time {
  min-width: 2.25rem;
}

.am-compact-identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 2px 8px 6px;
  box-sizing: border-box;
}

.am-compact-meta-stack {
  display: flex;
  align-items: flex-end;
  flex: 0 0 auto;
  min-width: 0;
}

.am-compact-source-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.am-compact-source-cluster {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  max-width: 100%;
}

.am-compact-track-copy {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding-top: 1px;
}

.am-compact-track-meta {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.am-compact-track-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nd-text-primary);
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
}

.am-compact-state-chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 4.5rem;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--nd-border-visible);
  background: var(--nd-surface-raised);
  box-sizing: border-box;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
}

.am-compact-state-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.am-compact-state-chip[data-state="live"] {
  border-color: color-mix(in srgb, var(--nd-accent) 45%, var(--nd-border-visible));
  color: var(--nd-accent);
}

.am-compact-state-chip[data-state="playing"] {
  border-color: color-mix(in srgb, #4A9E5C 50%, var(--nd-border-visible));
  color: #8dc09a;
}

.am-compact-action {
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--nd-text-secondary);
}

.am-compact-action:hover {
  border-color: transparent;
  color: var(--nd-text-display);
}

.am-compact-action:not(:disabled):active { opacity: 0.6; }

.am-compact-action--primary {
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-primary);
}

.am-compact-action--primary:hover {
  background: transparent;
  border-color: transparent;
  color: var(--nd-text-display);
}

.am-compact-action--primary.am-compact-action--active,
.am-compact-action--primary.am-compact-action--active:hover {
  background: transparent;
  border-color: transparent;
  color: var(--nd-accent);
}

.am-compact-action--active {
  border-color: transparent;
  color: var(--nd-accent);
}

.am-compact-action-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.am-compact-action-group--playback {
  flex: 0 0 auto;
  gap: 5px;
}

.am-compact-action-group--playback .am-compact-action--primary {
  width: 40px;
  height: 40px;
  border-radius: 14px;
}

.am-compact-shell .am-volume-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-compact-shell .am-volume {
  width: 100%;
  min-width: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: none;
}

.am-compact-shell .am-slider {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.am-compact-source-actions .ac-source-compact {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 2px;
  border: 1px solid var(--nd-border);
  border-radius: 12px;
  background: transparent;
}

.am-compact-source-actions .ac-source-compact-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.am-compact-header-button,
.am-compact-utility {
  width: 36px;
  height: 36px;
  border-radius: 9px;
}

.am-compact-header-button {
  border: 1px solid var(--nd-border-visible);
  background: transparent;
  color: var(--nd-text-secondary);
}

.am-compact-header-button:hover {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.am-compact-utility--active {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.am-compact-volume-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  align-self: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  padding: 0 8px 0;
  box-sizing: border-box;
}

.am-compact-volume-value {
  min-width: 2.7rem;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  text-align: right;
  justify-self: end;
}

.am-compact-volume-row .am-volume {
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  min-width: 0;
  width: 100%;
}

.am-compact-volume-row .am-btn--volume {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--nd-text-primary);
  padding: 0;
}

.am-compact-volume-row .am-slider {
  flex: 1 1 auto;
  min-width: 0;
  height: 5px;
}

.am-btn--volume {
  width: 30px;
  height: 30px;
  border-color: transparent;
  color: var(--nd-text-secondary);
}
.am-btn--volume:hover {
  border-color: transparent;
  color: var(--nd-text-display);
}
.am-btn--volume:active { opacity: 0.6; }

.am-slider {
  --am-slider-percent: 0%;
  appearance: none;
  -webkit-appearance: none;
  width: 88px;
  height: 4px;
  border-radius: 0;
  background: linear-gradient(
    90deg,
    var(--nd-text-display) 0%,
    var(--nd-text-display) var(--am-slider-percent),
    var(--nd-border) var(--am-slider-percent),
    var(--nd-border) 100%
  );
  outline: none;
  cursor: pointer;
}

.am-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 0;
  background: var(--nd-text-display);
  border: 1px solid var(--nd-border-visible);
}

.am-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 0;
  background: var(--nd-text-display);
}

.am-slider::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 0;
  background: var(--nd-border);
}

/* ── Device menu — Nothing: flat surface, border separation ── */
.am-device-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 14rem;
  background: var(--nd-surface);
  border: 1px solid var(--nd-border-visible);
  border-radius: 8px;
  padding: 4px 0;
  z-index: 60;
  overflow: hidden;
}

/* ── Panels — Nothing: flat surfaces ── */
.am-soundcloud-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12px);
  transform: translateX(-50%);
  width: min(30rem, calc(100vw - 1.5rem));
  padding: 16px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 12px;
  background: var(--nd-surface);
  z-index: 70;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  white-space: normal;
  transition:
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    visibility 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-soundcloud-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.am-recent-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 12px);
  transform: translateX(-50%);
  width: min(24rem, calc(100vw - 1.5rem));
  padding: 16px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 12px;
  background: var(--nd-surface);
  z-index: 70;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  white-space: normal;
  transition:
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    visibility 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-recent-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.am-recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--nd-text-primary);
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.am-recent-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.am-recent-header span:last-child {
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-recent-helper {
  margin: 0 0 12px;
  color: var(--nd-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.am-recent-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.am-recent-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--nd-text-primary);
  text-align: left;
  cursor: pointer;
  font-family: "Aspekta", system-ui, sans-serif;
  border-bottom: 1px solid var(--nd-border);
  transition: background 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-recent-item:last-child {
  border-bottom: none;
}

.am-recent-item--pending {
  background: rgba(255, 59, 48, 0.08);
  border-color: color-mix(in srgb, var(--nd-accent) 45%, var(--nd-border));
}

.am-recent-item:hover {
  background: var(--nd-surface-raised);
}

.am-recent-item--pending:hover {
  background: rgba(255, 59, 48, 0.12);
}

.am-recent-item:active {
  opacity: 0.8;
}

.am-recent-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.am-recent-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 400;
  color: var(--nd-text-primary);
}

.am-recent-item-meta {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--nd-text-disabled);
  letter-spacing: 0.04em;
}

.am-recent-item-action {
  flex-shrink: 0;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-recent-item-action--pending {
  color: var(--nd-accent);
}

/* ── SoundCloud panel — Nothing style ── */
.am-soundcloud-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-soundcloud-form {
  display: flex;
  gap: 8px;
}

.am-soundcloud-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-bottom: 1px solid var(--nd-border-visible);
  border-radius: 0;
  background: transparent;
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  outline: none;
}

.am-soundcloud-input::placeholder {
  color: var(--nd-text-disabled);
}

.am-soundcloud-input:focus {
  border-bottom-color: var(--nd-text-display);
}

.am-soundcloud-submit {
  height: 40px;
  padding: 0 24px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              color 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-soundcloud-submit:hover {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.am-soundcloud-helper,
.am-soundcloud-error {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
  white-space: normal;
  overflow-wrap: anywhere;
}

.am-soundcloud-helper {
  color: var(--nd-text-disabled);
}

.am-soundcloud-error {
  color: var(--nd-accent);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.am-soundcloud-meta {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 0;
  background: var(--nd-surface-raised);
  border: 1px solid var(--nd-border);
}

.am-soundcloud-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  color: var(--nd-text-primary);
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.am-soundcloud-index {
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
}

.am-soundcloud-subtitle {
  margin: 4px 0 0;
  color: var(--nd-text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.am-soundcloud-list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.am-soundcloud-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 8px 0;
  border-radius: 0;
  background: transparent;
  border-bottom: 1px solid var(--nd-border);
}

.am-soundcloud-item:last-child {
  border-bottom: none;
}

.am-soundcloud-item-current {
  padding-left: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.am-soundcloud-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: "Aspekta", system-ui, sans-serif;
  font-size: 13px;
  color: var(--nd-text-primary);
}

.am-soundcloud-item-current .am-soundcloud-item-title {
  color: var(--nd-text-display);
}

.am-soundcloud-item-artist {
  flex-shrink: 0;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--nd-text-disabled);
  letter-spacing: 0.04em;
}

.am-soundcloud-empty {
  margin: 12px 0 0;
  padding: 16px;
  border-radius: 0;
  background: var(--nd-surface-raised);
  border: 1px solid var(--nd-border);
  color: var(--nd-text-disabled);
  font-size: 12px;
  line-height: 1.4;
}

.am-device-empty {
  padding: 8px 16px;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--nd-text-disabled);
  letter-spacing: 0.04em;
  margin: 0;
}

.am-device-note {
  padding: 0 16px 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--nd-text-disabled);
  margin: 0;
}

.am-device-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--nd-text-primary);
  text-align: left;
  padding: 8px 16px;
  font-size: 13px;
  font-family: "Aspekta", system-ui, sans-serif;
  cursor: pointer;
  transition: background 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-device-item-label {
  display: block;
}

.am-device-item-hint {
  display: block;
  margin-top: 2px;
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.04em;
}

.am-device-item:hover { background: var(--nd-surface-raised); }
.am-device-item--active { color: var(--nd-text-display); }
.am-device-item--active::before {
  content: "";
  display: inline-block;
  width: 2px;
  height: 12px;
  background: var(--nd-accent);
  margin-right: 8px;
  vertical-align: middle;
}
.am-device-item--active .am-device-item-hint { color: var(--nd-text-secondary); }

/* ── Responsive — Nothing: same rules, tighter spacing ── */
/* ── Unified actions row (compact dock) ── */
.am-compact-unified-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0 8px;
  box-sizing: border-box;
}

.am-compact-transport-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.am-compact-row-divider {
  width: 1px;
  height: 16px;
  background: var(--nd-border-visible);
  margin: 0 2px;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .am-player-shell {
    width: min(42rem, calc(100vw - 1.5rem));
  }

  .am-player {
    width: 100%;
  }

  .am-player-shell--compact {
    width: min(100%, var(--baryon-compact-dock-min-width));
    max-width: calc(100vw - 1.5rem);
  }

  .am-player--compact {
    width: 100%;
  }
}

@media (max-width: 960px) {
  .am-player-shell {
    gap: 6px;
  }

  .am-player:not(.am-player--compact) {
    padding: 8px 12px;
  }

  .am-track {
    max-width: 150px;
  }

  .am-filename-wrap {
    max-width: 112px;
  }

  .am-slider {
    width: 64px;
  }

  .am-timeline-shell {
    padding: 8px 12px;
  }

  .am-timeline-row {
    min-width: 11rem;
  }
}

@media (max-width: 640px) {
  .am-player-shell {
    width: calc(100vw - 16px);
    max-width: none;
    gap: 8px;
  }

  .am-player-shell--compact {
    align-items: center;
    width: min(100%, var(--baryon-compact-dock-min-width));
    max-width: calc(100vw - 16px);
  }

  .am-compact-shell {
    margin: 0 auto;
    max-width: 100%;
    min-width: var(--baryon-compact-dock-min-width);
  }

  .am-source-row,
  .am-actions-row,
  .am-volume-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .am-source-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .am-actions-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 8px;
  }

  .am-utility-row {
    display: flex;
    align-items: center;
    gap: 4px;
    grid-column: 3;
    justify-self: end;
  }

  .am-live-input-wrap {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .am-volume-row {
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 0 4px;
    gap: 4px;
  }

  .am-timeline-shell {
    padding: 8px 12px;
    border-radius: 8px;
  }

  .am-timeline-row {
    width: 100%;
    min-width: 0;
    gap: 8px;
  }

  .am-status-group {
    grid-column: 1;
    justify-self: start;
  }

  .am-track {
    grid-column: 2;
    justify-self: center;
    flex: 0 1 auto;
    width: min(15rem, calc(100vw - 8rem));
    max-width: none;
    padding: 4px 16px;
  }

  .am-source-row .am-track {
    justify-content: center;
  }

  .am-source-tools {
    grid-column: 3;
    justify-self: end;
  }

  .am-filename-wrap {
    flex: 0 1 auto;
    max-width: none;
  }

  .am-filename {
    font-size: 13px;
  }

  .am-divider {
    display: none;
  }

  .am-transport {
    grid-column: 2;
    justify-self: center;
    gap: 4px;
  }

  .am-volume {
    width: min(100%, 20rem);
    min-width: 0;
    gap: 4px;
    padding: 8px;
    border-radius: 4px;
    background: var(--nd-surface-raised);
    border: 1px solid var(--nd-border);
  }

  .am-volume-meta {
    width: min(100%, 20rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    color: var(--nd-text-disabled);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .am-slider {
    flex: 1 1 auto;
    width: auto;
    min-width: 3.5rem;
  }

  .am-progress {
    min-width: 0;
  }

  .am-device-menu {
    right: 0;
  }
}

@media (max-width: 480px) {
  .am-player-shell {
    width: calc(100vw - 12px);
  }

  .am-player-shell--compact {
    width: min(100%, var(--baryon-compact-dock-min-width));
    max-width: calc(100vw - 12px);
  }

  .am-track {
    gap: 4px;
    width: min(14rem, calc(100vw - 7.2rem));
    padding: 4px 12px;
  }

  .am-compact-shell {
    min-width: var(--baryon-compact-dock-min-width);
  }

  .am-source-row,
  .am-actions-row,
  .am-volume-row {
    gap: 4px;
  }

  .am-utility-row {
    gap: 4px;
  }

  .am-volume-row {
    padding: 0 4px;
  }

  .am-timeline-shell {
    padding: 8px 12px;
  }

  .am-btn--play {
    width: 42px;
    height: 42px;
  }

  .am-btn--stop,
  .am-btn--volume {
    width: 36px;
    height: 36px;
  }

  .am-btn--live-input {
    width: 42px;
    height: 42px;
  }

  .am-btn--soundcloud {
    width: 56px;
    height: 40px;
    border-radius: 999px;
  }

  .am-btn--recent {
    width: 40px;
    height: 40px;
    border-radius: 999px;
  }

  .am-slider {
    min-width: 2.8rem;
  }

  .am-volume {
    width: 100%;
    padding: 6px 8px;
  }

  .am-volume-meta {
    width: 100%;
    font-size: 10px;
  }

  .am-timeline-time {
    min-width: 2rem;
    font-size: 10px;
  }
}

`;

// ─── Listener Controls ───────────────────────────────────────────────────────

export function ListenerControls({
  showSourceLiveButton = true,
  allowSystemSource = true,
} = {}) {
  const {
    soundCloudEnabled,
    playbackSource,
    selectedSource,
    displayName,
    liveReturnLocalFile,
    queuedNextLocalFile,
    hasQueuedNextLocalFile,
    recentUploads,
    isPlaying,
    isLiveInputActive,
    liveInputDeviceKind,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    handleFileChange,
    handleRecentUploadSelect,
    handlePlayPause,
    handleStop,
    handleVolumeChange,
    handleMuteToggle,
    setShowDeviceMenu,
    showSoundCloudPanel,
    setShowSoundCloudPanel,
    soundCloudInput,
    setSoundCloudInput,
    soundCloudError,
    soundCloudInfo,
    soundCloudQueue,
    soundCloudCollectionTitle,
    soundCloudCurrentTrack,
    soundCloudCurrentIndex,
    isSoundCloudLoading,
    loadSoundCloudTrack,
    scrubPreviewSeconds,
    isScrubbing,
    beginScrub,
    previewScrub,
    commitScrub,
    cancelScrub,
  } = useAudio();
  const transportClock = useAudioTransportClock();

  const fileInputRef = useRef(null);
  const queuedPopupTimeoutRef = useRef(0);
  const recentUploadsButtonRef = useRef(null);
  const recentUploadsPanelRef = useRef(null);
  const timelinePointerActiveRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [showRecentUploadsPanel, setShowRecentUploadsPanel] = useState(false);
  const [showQueuedPopup, setShowQueuedPopup] = useState(false);
  const {
    dragOffset: playerDragOffset,
    isDragging: isPlayerDragging,
    handlePointerDown: handlePlayerPointerDown,
    handlePointerUp: handlePlayerPointerUp,
    handleDoubleClick: handlePlayerDoubleClick,
  } = useDraggableFloatingUi();
  const { color, pulse, label } = getStatusConfig(
    isEngineReady,
    isAudioLoaded,
    isPlaying,
    isLiveInputActive,
    liveInputDeviceKind,
  );
  const volumePercent = Math.round(volume * 100);
  const soundCloudListStart = Math.max(0, soundCloudCurrentIndex - 1);
  const soundCloudVisibleTracks = soundCloudQueue.slice(
    soundCloudListStart,
    soundCloudListStart + 4,
  );
  const timelineValue =
    isScrubbing && scrubPreviewSeconds != null
      ? scrubPreviewSeconds
      : transportClock.currentTimeSeconds;
  const timelineDuration = transportClock.durationSeconds;
  const timelineProgressPercent =
    timelineDuration > 0
      ? Math.max(0, Math.min(100, (timelineValue / timelineDuration) * 100))
      : 0;
  /** @type {import("react").CSSProperties & { "--am-progress-percent": string }} */
  const timelineStyle = {
    "--am-progress-percent": `${timelineProgressPercent}%`,
  };
  /** @type {import("react").CSSProperties & { "--am-slider-percent": string }} */
  const volumeSliderStyle = {
    "--am-slider-percent": `${volumePercent}%`,
  };
  const hasRecentUploads = recentUploads.length > 0;
  const isQueuedNextUnderLive = hasQueuedNextLocalFile && isLiveInputActive;
  const trackTitle = isQueuedNextUnderLive
    ? "Queued local file"
    : "Upload audio";
  const recentUploadsHelper = isQueuedNextUnderLive
    ? "Selecting a local file while LIVE is active queues one next file."
    : hasQueuedNextLocalFile
      ? "The queued next local file stays highlighted here until you load it."
      : "Reload a recent local file without reopening the picker.";
  const fileTransportEnabled = selectedSource !== "system";
  const playDisabled = !fileTransportEnabled || !isAudioLoaded;
  const stopDisabled = !fileTransportEnabled || !isAudioLoaded;
  const isCompactDock = viewportWidth <= 1024;
  const compactTrackTitle = isQueuedNextUnderLive
    ? "Queued local file"
    : "Source";
  const sourceSummary =
    selectedSource === "system"
      ? "System"
      : playbackSource === "soundcloud"
        ? "SoundCloud"
        : displayName === "Upload Audio"
          ? "Upload Audio File"
          : displayName;
  const compactStateLabel = isLiveInputActive
    ? "Live"
    : isPlaying
      ? "Playing"
      : isAudioLoaded
        ? "Loaded"
        : isEngineReady
          ? "Ready"
          : "Init";
  const compactStateTone = isLiveInputActive
    ? "live"
    : isPlaying
      ? "playing"
      : "idle";
  /** @type {import("react").CSSProperties} */
  const playerShellStyle = {
    transform: `translate(calc(-50% + ${playerDragOffset.x}px), ${playerDragOffset.y}px)`,
    willChange: isPlayerDragging ? "transform" : "auto",
    cursor: isPlayerDragging ? "grabbing" : "grab",
  };
  const queuedPopupMessage = liveReturnLocalFile?.name
    ? `${queuedNextLocalFile?.name || "This file"} is queued next. ${liveReturnLocalFile.name} will be restored first when LIVE stops.`
    : `${queuedNextLocalFile?.name || "This file"} is queued and will load when LIVE stops.`;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!showRecentUploadsPanel) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        recentUploadsPanelRef.current?.contains(event.target) ||
        recentUploadsButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setShowRecentUploadsPanel(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowRecentUploadsPanel(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showRecentUploadsPanel]);

  useEffect(() => {
    window.clearTimeout(queuedPopupTimeoutRef.current);

    if (!isQueuedNextUnderLive || !queuedNextLocalFile?.id) {
      setShowQueuedPopup(false);
      return undefined;
    }

    setShowQueuedPopup(true);
    queuedPopupTimeoutRef.current = window.setTimeout(() => {
      setShowQueuedPopup(false);
      queuedPopupTimeoutRef.current = 0;
    }, 2600);

    return () => {
      window.clearTimeout(queuedPopupTimeoutRef.current);
      queuedPopupTimeoutRef.current = 0;
    };
  }, [isQueuedNextUnderLive, queuedNextLocalFile?.id]);

  return (
    <>
      <style>{CSS}</style>

      <div
        className={`am-player-shell${isCompactDock ? " am-player-shell--compact" : ""}`}
        style={playerShellStyle}
        onPointerDown={handlePlayerPointerDown}
        onPointerUp={handlePlayerPointerUp}
        onDoubleClick={handlePlayerDoubleClick}
        title="Drag to move. Double-click or double-tap to reset."
      >
        {!isCompactDock &&
        fileTransportEnabled &&
        isAudioLoaded &&
        transportClock.canSeek ? (
          <div className="am-timeline-shell">
            <div className="am-timeline-row">
              <span className="am-timeline-time" aria-hidden="true">
                {formatClockTime(timelineValue)}
              </span>
              <input
                className="am-progress"
                data-testid="playback-timeline"
                type="range"
                min="0"
                max={timelineDuration || 0}
                step="0.01"
                value={timelineValue}
                onPointerDown={(event) => {
                  timelinePointerActiveRef.current = true;
                  void beginScrub(Number(event.currentTarget.value));
                }}
                onPointerUp={(event) => {
                  if (!timelinePointerActiveRef.current) {
                    return;
                  }
                  timelinePointerActiveRef.current = false;
                  void commitScrub(Number(event.currentTarget.value));
                }}
                onPointerCancel={() => {
                  timelinePointerActiveRef.current = false;
                  void cancelScrub();
                }}
                onBlur={(event) => {
                  if (!timelinePointerActiveRef.current) {
                    return;
                  }
                  timelinePointerActiveRef.current = false;
                  void commitScrub(Number(event.currentTarget.value));
                }}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (timelinePointerActiveRef.current) {
                    previewScrub(nextValue);
                    return;
                  }
                  void commitScrub(nextValue);
                }}
                aria-label="Playback position"
                title={`Playback position ${formatClockTime(timelineValue)} of ${formatClockTime(timelineDuration)}`}
                style={timelineStyle}
              />
              <span className="am-timeline-time" aria-hidden="true">
                {formatClockTime(timelineDuration)}
              </span>
            </div>
          </div>
        ) : null}

        <div
          className={`am-player${isCompactDock ? " am-player--compact" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(event) => {
              setShowRecentUploadsPanel(false);
              handleFileChange(event);
            }}
          />

          {isCompactDock ? (
            <div className="am-compact-shell">
              <div className="am-compact-card">
                {fileTransportEnabled &&
                isAudioLoaded &&
                transportClock.canSeek ? (
                  <div className="am-timeline-shell">
                    <div className="am-timeline-row">
                      <span className="am-timeline-time" aria-hidden="true">
                        {formatClockTime(timelineValue)}
                      </span>
                      <input
                        className="am-progress"
                        data-testid="playback-timeline"
                        type="range"
                        min="0"
                        max={timelineDuration || 0}
                        step="0.01"
                        value={timelineValue}
                        onPointerDown={(event) => {
                          timelinePointerActiveRef.current = true;
                          void beginScrub(Number(event.currentTarget.value));
                        }}
                        onPointerUp={(event) => {
                          if (!timelinePointerActiveRef.current) {
                            return;
                          }
                          timelinePointerActiveRef.current = false;
                          void commitScrub(Number(event.currentTarget.value));
                        }}
                        onPointerCancel={() => {
                          timelinePointerActiveRef.current = false;
                          void cancelScrub();
                        }}
                        onBlur={(event) => {
                          if (!timelinePointerActiveRef.current) {
                            return;
                          }
                          timelinePointerActiveRef.current = false;
                          void commitScrub(Number(event.currentTarget.value));
                        }}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          if (timelinePointerActiveRef.current) {
                            previewScrub(nextValue);
                            return;
                          }
                          void commitScrub(nextValue);
                        }}
                        aria-label="Playback position"
                        title={`Playback position ${formatClockTime(timelineValue)} of ${formatClockTime(timelineDuration)}`}
                        style={timelineStyle}
                      />
                      <span className="am-timeline-time" aria-hidden="true">
                        {formatClockTime(timelineDuration)}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="am-compact-identity">
                  <div className="am-compact-source-cluster">
                    <div className="am-compact-track-copy">
                      <span className="am-compact-track-meta">
                        {compactTrackTitle}
                      </span>
                      <span
                        className="am-compact-track-title"
                        title={sourceSummary}
                      >
                        {sourceSummary}
                      </span>
                    </div>
                  </div>
                  <div className="am-compact-meta-stack">
                    <span
                      className="am-compact-state-chip"
                      data-state={compactStateTone}
                      title={label}
                    >
                      <span
                        className="am-compact-state-chip-dot"
                        aria-hidden="true"
                        style={{
                          background: color,
                          animation: pulse
                            ? "am-pulse 1.5s ease-in-out infinite"
                            : "none",
                        }}
                      />
                      {compactStateLabel}
                    </span>
                  </div>
                </div>

                <div className="am-compact-unified-actions">
                  <div className="am-compact-source-actions">
                    <button
                      className="am-btn am-compact-header-button"
                      onClick={() => {
                        setShowRecentUploadsPanel(false);
                        setShowDeviceMenu(false);
                        setShowSoundCloudPanel(false);
                        fileInputRef.current?.click();
                      }}
                      title={trackTitle}
                      aria-label={trackTitle}
                    >
                      <UploadIcon />
                    </button>

                    <SourceSelector
                      onInteraction={() => {
                        setShowRecentUploadsPanel(false);
                        setShowDeviceMenu(false);
                      }}
                      showLiveButton={showSourceLiveButton}
                      allowSystemSource={allowSystemSource}
                      compactMode
                    />
                  </div>

                  <div className="am-compact-transport-right">
                    {hasRecentUploads ? (
                      <button
                        ref={recentUploadsButtonRef}
                        className={`am-btn am-compact-utility${
                          showRecentUploadsPanel
                            ? " am-compact-utility--active"
                            : ""
                        }`}
                        onClick={() => {
                          setShowDeviceMenu(false);
                          setShowSoundCloudPanel(false);
                          setShowRecentUploadsPanel(!showRecentUploadsPanel);
                        }}
                        title="Recent uploads"
                        aria-label="Recent uploads"
                      >
                        <HistoryIcon />
                      </button>
                    ) : null}

                    {soundCloudEnabled ? (
                      <button
                        className={`am-btn am-compact-utility${
                          showSoundCloudPanel || playbackSource === "soundcloud"
                            ? " am-compact-utility--active"
                            : ""
                        }`}
                        onClick={() => {
                          setShowRecentUploadsPanel(false);
                          setShowDeviceMenu(false);
                          setShowSoundCloudPanel(!showSoundCloudPanel);
                        }}
                        title="Load SoundCloud track or playlist"
                        aria-label="SoundCloud"
                      >
                        <SoundCloudIcon />
                      </button>
                    ) : null}

                    {hasRecentUploads || soundCloudEnabled ? (
                      <span
                        className="am-compact-row-divider"
                        aria-hidden="true"
                      />
                    ) : null}

                    <div className="am-compact-action-group am-compact-action-group--playback">
                      <button
                        className={`am-btn am-compact-action am-compact-action--primary${
                          isPlaying ? " am-compact-action--active" : ""
                        }`}
                        onClick={handlePlayPause}
                        disabled={playDisabled}
                        title={isPlaying ? "Pause" : "Play"}
                        aria-label={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                      </button>

                      <button
                        className="am-btn am-compact-action"
                        onClick={handleStop}
                        disabled={stopDisabled}
                        title="Stop"
                        aria-label="Stop"
                      >
                        <StopIcon />
                      </button>
                    </div>
                  </div>
                </div>

                {fileTransportEnabled ? (
                  <div className="am-compact-volume-row">
                    <div className="am-volume">
                      <button
                        className="am-btn am-btn--volume"
                        onClick={handleMuteToggle}
                        title={
                          isMuted ? "Unmute app playback" : "Mute app playback"
                        }
                      >
                        <VolumeIcon muted={isMuted || volume <= 0.001} />
                      </button>
                      <input
                        className="am-slider"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(event) => {
                          handleVolumeChange(Number(event.target.value));
                        }}
                        style={volumeSliderStyle}
                        aria-label="App playback volume"
                        title={`App playback volume ${volumePercent}%`}
                      />
                    </div>
                    <span
                      className="am-compact-volume-value"
                      aria-hidden="true"
                    >
                      {volumePercent}%
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="am-source-row">
                <div className="am-status-group">
                  <span
                    className="am-status-dot"
                    title={label}
                    style={{
                      background: color,
                      animation: pulse
                        ? "am-pulse 1.5s ease-in-out infinite"
                        : "none",
                    }}
                  />
                </div>

                <span className="am-source-icon" aria-hidden="true">
                  <MusicNoteIcon />
                </span>

                <button
                  type="button"
                  className="am-track"
                  onClick={() => {
                    setShowRecentUploadsPanel(false);
                    setShowDeviceMenu(false);
                    setShowSoundCloudPanel(false);
                    fileInputRef.current?.click();
                  }}
                  onMouseEnter={() => {
                    if (isQueuedNextUnderLive) {
                      setShowQueuedPopup(true);
                    }
                  }}
                  onMouseLeave={() => {
                    window.clearTimeout(queuedPopupTimeoutRef.current);
                    queuedPopupTimeoutRef.current = 0;
                    setShowQueuedPopup(false);
                  }}
                  title={trackTitle}
                >
                  <span
                    className={`am-track-popup${
                      isQueuedNextUnderLive && showQueuedPopup
                        ? " am-track-popup--visible"
                        : ""
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {queuedPopupMessage}
                  </span>
                  <span className="am-track-label">
                    <ScrollingText text={displayName} />
                  </span>
                </button>

                {soundCloudEnabled || hasRecentUploads ? (
                  <div className="am-source-tools">
                    {hasRecentUploads ? (
                      <button
                        ref={recentUploadsButtonRef}
                        className={`am-btn am-btn--recent${
                          showRecentUploadsPanel ? " am-btn--recent-active" : ""
                        }`}
                        onClick={() => {
                          setShowDeviceMenu(false);
                          setShowSoundCloudPanel(false);
                          setShowRecentUploadsPanel(!showRecentUploadsPanel);
                        }}
                        title="Recent uploads"
                        aria-label="Recent uploads"
                      >
                        <HistoryIcon />
                      </button>
                    ) : null}

                    {soundCloudEnabled ? (
                      <button
                        className={`am-btn am-btn--soundcloud${
                          showSoundCloudPanel || playbackSource === "soundcloud"
                            ? " am-btn--soundcloud-active"
                            : ""
                        }`}
                        onClick={() => {
                          setShowRecentUploadsPanel(false);
                          setShowDeviceMenu(false);
                          setShowSoundCloudPanel(!showSoundCloudPanel);
                        }}
                        title="Load SoundCloud track or playlist"
                        aria-label="SoundCloud"
                      >
                        <SoundCloudIcon />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="am-divider" />
              </div>

              <div className="am-actions-row">
                <div className="am-transport">
                  <button
                    className={`am-btn am-btn--play${
                      isPlaying ? " am-btn--play-active" : ""
                    }`}
                    onClick={handlePlayPause}
                    disabled={playDisabled}
                    title={isPlaying ? "Pause" : "Play"}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </button>
                  <button
                    className="am-btn am-btn--stop"
                    onClick={handleStop}
                    disabled={stopDisabled}
                    title="Stop"
                    aria-label="Stop"
                  >
                    <StopIcon />
                  </button>
                </div>

                <div className="am-divider" />

                <div className="am-utility-row">
                  <SourceSelector
                    onInteraction={() => {
                      setShowRecentUploadsPanel(false);
                      setShowDeviceMenu(false);
                    }}
                    showLiveButton={showSourceLiveButton}
                    allowSystemSource={allowSystemSource}
                  />
                </div>
              </div>

              {fileTransportEnabled ? (
                <div className="am-volume-row">
                  <div className="am-volume-meta" aria-hidden="true">
                    <span>App Volume</span>
                    <span>{volumePercent}%</span>
                  </div>
                  <div className="am-volume">
                    <button
                      className="am-btn am-btn--volume"
                      onClick={handleMuteToggle}
                      title={
                        isMuted ? "Unmute app playback" : "Mute app playback"
                      }
                    >
                      <VolumeIcon muted={isMuted || volume <= 0.001} />
                    </button>
                    <input
                      className="am-slider"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(event) => {
                        handleVolumeChange(Number(event.target.value));
                      }}
                      aria-label="App playback volume"
                      title={`App playback volume ${volumePercent}%`}
                    />
                  </div>

                  <div className="am-divider" />
                </div>
              ) : null}
            </>
          )}
        </div>

        {hasRecentUploads ? (
          <div
            ref={recentUploadsPanelRef}
            className={`am-recent-panel${
              showRecentUploadsPanel ? "" : " am-recent-hidden"
            }`}
            data-testid="recent-uploads-panel"
          >
            <div className="am-recent-header">
              <span>
                <HistoryIcon /> Recent uploads
              </span>
              <span>This tab only</span>
            </div>
            <p className="am-recent-helper">{recentUploadsHelper}</p>
            <ul className="am-recent-list">
              {recentUploads.map((upload) => {
                const isQueuedUpload = queuedNextLocalFile?.id === upload.id;
                const actionLabel = isLiveInputActive
                  ? isQueuedUpload
                    ? "Queued"
                    : "Queue"
                  : isQueuedUpload
                    ? "Next"
                    : "Reload";
                return (
                  <li key={upload.id}>
                    <button
                      className={`am-recent-item${
                        isQueuedUpload ? " am-recent-item--pending" : ""
                      }`}
                      onClick={async () => {
                        setShowRecentUploadsPanel(false);
                        await handleRecentUploadSelect(upload.id);
                      }}
                      title={
                        isLiveInputActive
                          ? "Queue this file until LIVE stops"
                          : isQueuedUpload
                            ? "Load the queued next local file"
                            : "Reload this local file"
                      }
                    >
                      <span className="am-recent-item-main">
                        <span className="am-recent-item-title">
                          {upload.name}
                        </span>
                        <span className="am-recent-item-meta">
                          {formatFileSize(upload.size)}
                        </span>
                      </span>
                      <span
                        className={`am-recent-item-action${
                          isQueuedUpload
                            ? " am-recent-item-action--pending"
                            : ""
                        }`}
                      >
                        {actionLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {soundCloudEnabled ? (
          <div
            className={`am-soundcloud-panel${showSoundCloudPanel ? "" : " am-soundcloud-hidden"}`}
          >
            <div className="am-soundcloud-header">
              <SoundCloudIcon />
              <span>SoundCloud</span>
            </div>
            <div className="am-soundcloud-form">
              <input
                className="am-soundcloud-input"
                type="url"
                value={soundCloudInput}
                onChange={(event) => setSoundCloudInput(event.target.value)}
                placeholder="Paste a SoundCloud track or playlist URL"
                aria-label="SoundCloud URL"
              />
              <button
                className="am-soundcloud-submit"
                onClick={loadSoundCloudTrack}
                disabled={isSoundCloudLoading}
              >
                {isSoundCloudLoading ? "Loading" : "Load"}
              </button>
            </div>
            {soundCloudError ? (
              <p className="am-soundcloud-error">{soundCloudError}</p>
            ) : (
              <p className="am-soundcloud-helper">{soundCloudInfo}</p>
            )}
            {soundCloudQueue.length > 0 ? (
              <div className="am-soundcloud-meta">
                <p className="am-soundcloud-title">
                  <span>
                    {soundCloudCurrentTrack?.title || soundCloudCollectionTitle}
                  </span>
                  <span className="am-soundcloud-index">
                    {soundCloudQueue.length > 1
                      ? `${Math.max(soundCloudCurrentIndex + 1, 1)} / ${soundCloudQueue.length}`
                      : "Track"}
                  </span>
                </p>
                <p className="am-soundcloud-subtitle">
                  {soundCloudCurrentTrack?.artistName ||
                    soundCloudCollectionTitle}
                </p>
                <ul className="am-soundcloud-list">
                  {soundCloudVisibleTracks.map((track, index) => {
                    const trackIndex = soundCloudListStart + index;
                    const isCurrent = trackIndex === soundCloudCurrentIndex;
                    return (
                      <li
                        key={track.id || `${track.title}-${trackIndex}`}
                        className={`am-soundcloud-item${isCurrent ? " am-soundcloud-item-current" : ""}`}
                      >
                        <span className="am-soundcloud-item-title">
                          {track.title}
                        </span>
                        <span className="am-soundcloud-item-artist">
                          {track.artistName || "SoundCloud"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="am-soundcloud-empty">
                Public SoundCloud links now stream through Baryon&apos;s own
                audio graph, so the same cymatic analysis path works without a
                local file.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
