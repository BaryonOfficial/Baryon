import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AUDIO_SOURCE_KINDS } from "@baryon/engine/audio";
import { useAudio } from "../context/AudioContext";
import { observeAudioTransportClock } from "../context/audioTransportClock.js";
import {
  createLiveInputRuntimeStatus,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_SIGNAL_STATES,
} from "../context/liveInputRuntimeStatus.js";
import { SourceSelector } from "./controls/SourceSelector";
import DemoAudioIcon from "./DemoAudioIcon.jsx";

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

function PreviousTrackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="2" height="14" rx="1" />
      <path d="M18.5 5.8a1 1 0 0 1 1.5.87v10.66a1 1 0 0 1-1.5.87l-8.9-5.33a1 1 0 0 1 0-1.74l8.9-5.33Z" />
    </svg>
  );
}

function NextTrackIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="17" y="5" width="2" height="14" rx="1" />
      <path d="M5.5 5.8A1 1 0 0 0 4 6.67v10.66a1 1 0 0 0 1.5.87l8.9-5.33a1 1 0 0 0 0-1.74L5.5 5.8Z" />
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

function VolumeLowIcon() {
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
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    </svg>
  );
}

function QueueIcon() {
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
      aria-hidden="true"
    >
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
      <path d="M8 6h12M8 12h12M8 18h12" />
    </svg>
  );
}

function AutoplayIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8.5A7 7 0 0 1 17 6l2 2" />
      <path d="M19 4v4h-4" />
      <path d="M19 15.5A7 7 0 0 1 7 18l-2-2" />
      <path d="M5 20v-4h4" />
      <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
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

// ─── Status dot ──────────────────────────────────────────────────────────────

function getStatusConfig(
  isEngineReady,
  isAudioLoaded,
  isPlaying,
  isLiveInputActive,
  liveInputDeviceKind,
  liveInputRuntimeStatus,
) {
  const status = createLiveInputRuntimeStatus(liveInputRuntimeStatus);
  if (isLiveInputActive) {
    const isLineFeed = status.resolvedAnalysisClass === "line-feed";
    if (
      status.phase === LIVE_INPUT_PHASES.error ||
      status.signalState === LIVE_INPUT_SIGNAL_STATES.clipped
    ) {
      return { color: "#D71921", pulse: true, label: "Input error" };
    }
    if (
      status.phase === LIVE_INPUT_PHASES.starting ||
      status.phase === LIVE_INPUT_PHASES.stopping
    ) {
      return { color: "#D4A843", pulse: true, label: "Input starting" };
    }
    if (status.phase === LIVE_INPUT_PHASES.calibrating) {
      return { color: "#5B9BF6", pulse: true, label: "Calibrating mic" };
    }
    if (status.phase === LIVE_INPUT_PHASES.weakSignal) {
      const isSilent = status.signalState === LIVE_INPUT_SIGNAL_STATES.silent;
      return {
        color: "#D4A843",
        pulse: !isSilent,
        label: isSilent
          ? "Live input connected — waiting for audio"
          : isLineFeed
            ? "Line feed weak"
            : "Input weak",
      };
    }
    if (status.phase === LIVE_INPUT_PHASES.listening) {
      return {
        color: "#4A9E5C",
        pulse: true,
        label: isLineFeed
          ? "Line feed listening"
          : liveInputDeviceKind === "system"
            ? "System input listening"
            : "Mic listening",
      };
    }
    return { color: "#D4A843", pulse: true, label: "Input starting" };
  }
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

.am-source-mode-shell {
  --baryon-source-selector-radius: 10px;
  --baryon-source-selector-segment-radius: 7px;
  position: fixed;
  right: 0.9rem;
  bottom: 16px;
  z-index: 52;
  display: inline-flex;
  align-items: center;
  gap: var(--baryon-source-selector-gap);
  width: fit-content;
  max-width: calc(100vw - 1.5rem);
  min-height: var(--baryon-source-selector-min-height);
  padding: var(--baryon-source-selector-padding);
  border: none;
  border-radius: var(--baryon-source-selector-radius);
  background: var(--nd-surface);
  box-shadow: var(--nd-shell-shadow);
  font-family: var(--baryon-type-interface-family);
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.am-source-mode-light {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: var(--baryon-source-selector-inner-min-height);
  flex: 0 0 auto;
}

.am-source-mode-light .am-status-dot {
  width: 7px;
  height: 7px;
}

.am-player-shell--compact {
  align-items: center;
  bottom: 16px;
  width: min(32rem, calc(100vw - 1.5rem));
  max-width: min(32rem, calc(100vw - 1.5rem));
}

.am-player {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--baryon-audio-pill-gap);
  padding: var(--baryon-audio-pill-padding);
  min-height: var(--baryon-audio-pill-min-height);
  background: var(--nd-surface);
  border: none;
  border-radius: var(--baryon-audio-pill-radius);
  box-shadow: var(--nd-shell-shadow);
  font-family: var(--baryon-type-interface-family);
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
  transition:
    max-width 220ms cubic-bezier(0.25, 0.1, 0.25, 1),
    width 220ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-player--compact {
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

/* ── Timeline — Nothing: flat surface, square-ended track ── */
.am-timeline-shell {
  display: flex;
  align-items: center;
  padding: 8px 16px 10px;
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
  font-family: var(--baryon-type-mono-family);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--baryon-type-data-letter-spacing);
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

.am-progress:focus-visible,
.am-slider:focus-visible {
  outline: 2px solid var(--nd-info);
  outline-offset: 4px;
}

.am-progress::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--nd-text-display);
  border: 1px solid var(--nd-border-visible);
}

.am-progress::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 999px;
  background: var(--nd-text-display);
}

.am-progress::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 0;
  background: var(--nd-border);
}

/* ── Status — Nothing: dot + instrument-panel label ── */
.am-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
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
  font-family: var(--baryon-type-mono-family);
  font-size: 10.5px;
  letter-spacing: var(--baryon-type-action-letter-spacing);
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
  gap: 10px;
}

.am-compact-shell {
  width: 100%;
  min-width: 0;
  max-width: none;
}

.am-compact-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--nd-text-primary) 7%, transparent);
  background: color-mix(in srgb, var(--nd-surface) 94%, transparent);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--nd-text-primary) 5%, transparent) inset,
    var(--nd-shell-shadow);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
  box-sizing: border-box;
}

.am-compact-track-section {
  display: contents;
}

.am-compact-card .am-timeline-shell {
  grid-column: 1 / -1;
  grid-row: 1;
  width: 100%;
  margin: 0 0 2px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.am-compact-card .am-timeline-row {
  gap: 6px;
  padding: 1px 0 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-sizing: border-box;
}

.am-compact-card .am-timeline-time {
  min-width: 1.75rem;
  font-size: 8px;
}

.am-compact-identity {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 0;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 0;
  box-sizing: border-box;
}

.am-compact-source-trigger {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.am-compact-source-trigger:focus-visible {
  outline: 2px solid var(--nd-info);
  outline-offset: 3px;
  border-radius: 9px;
}

.am-compact-source-trigger:hover .am-compact-track-title {
  color: var(--nd-text-display);
}

.am-compact-source-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid var(--nd-border-visible);
  border-radius: 9px;
  background: color-mix(in srgb, var(--nd-surface-raised) 72%, transparent);
  color: var(--nd-text-primary);
}

.am-compact-source-actions {
  display: none;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
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
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding-top: 0;
}

.am-compact-track-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  text-transform: uppercase;
}

.am-compact-track-meta-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  color: var(--nd-text-secondary);
  transition: color 160ms ease;
}

.am-compact-track-meta-upload svg {
  width: 10px;
  height: 10px;
}

.am-compact-source-trigger:hover .am-compact-track-meta-upload {
  color: var(--nd-text-primary);
}

.am-compact-track-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-interface-family);
  font-size: 12px;
  font-weight: 500;
}

.am-compact-action {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-secondary);
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms ease,
    background-color 160ms ease;
}

.am-compact-action:hover {
  border-color: transparent;
  color: var(--nd-text-display);
}

.am-compact-action:not(:disabled):active {
  transform: scale(0.96);
  opacity: 1;
}

.am-compact-action--primary {
  background: transparent;
  color: var(--nd-text-primary);
}

.am-compact-action--primary:hover {
  background: transparent;
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
  display: grid;
  grid-template-columns: 36px 40px 36px;
  justify-content: center;
  gap: 4px;
  width: auto;
}

.am-compact-action-group--playback .am-compact-action--primary {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-primary);
}

.am-compact-action-group--playback .am-compact-action--primary svg {
  width: 18px;
  height: 18px;
}

.am-compact-action--seek:not(:disabled) {
  color: var(--nd-text-primary);
}

.am-compact-action-group--playback
  .am-compact-action--primary:not(:disabled):hover {
  background: transparent;
  color: var(--nd-text-display);
}

.am-compact-action-group--playback .am-compact-action--primary:disabled {
  background: transparent;
  color: var(--nd-text-disabled);
}

.am-compact-action-group--playback
  .am-compact-action--primary.am-compact-action--active {
  background: transparent;
  color: var(--nd-accent);
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

.am-compact-utility {
  min-width: 32px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.am-compact-utility:not(:disabled):active {
  transform: scale(0.96);
}

.am-compact-utility--bare,
.am-compact-utility--bare:hover {
  border: none;
  border-radius: 0;
  background: transparent;
}

.am-compact-utility--active {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.am-compact-volume-row {
  grid-column: 3;
  grid-row: 2;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  justify-content: stretch;
  width: 8.5rem;
  max-width: 100%;
  justify-self: end;
  margin-top: 0;
  padding: 0;
  border-top: none;
  box-sizing: border-box;
}

.am-compact-volume-end {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--nd-text-secondary);
  box-sizing: border-box;
}

.am-compact-volume-end svg {
  width: 17px;
  height: 17px;
}

.am-compact-volume-row .am-volume {
  display: contents;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  min-width: 0;
  width: 100%;
}

.am-compact-volume-row .am-btn--volume {
  width: 24px;
  height: 24px;
  justify-content: flex-end;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--nd-text-primary);
  padding: 0;
}

.am-compact-volume-row .am-slider {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  height: 6px;
  border-radius: 999px;
}

.am-compact-volume-row .am-slider::-webkit-slider-thumb {
  width: 0;
  height: 0;
  border: none;
  opacity: 0;
}

.am-compact-volume-row .am-slider::-moz-range-thumb {
  width: 0;
  height: 0;
  border: none;
  opacity: 0;
}

.am-compact-hover-actions {
  position: absolute;
  left: 50%;
  bottom: calc(100% - 1px);
  z-index: 2;
  padding-bottom: 7px;
  opacity: 0;
  transform: translate(-50%, 0.25rem);
  pointer-events: none;
  transition:
    opacity var(--nd-transition),
    transform var(--nd-transition);
}

.am-compact-hover-actions--expanded {
  opacity: 1;
  transform: translate(-50%, 0);
  pointer-events: auto;
}

.am-compact-hover-actions-panel {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  align-items: center;
  justify-content: space-around;
  min-height: 28px;
  margin: 0;
  padding: 2px 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nd-surface) 94%, transparent);
  box-shadow: var(--nd-shell-shadow);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
  box-sizing: border-box;
}

.am-compact-hover-action {
  position: relative;
  min-width: 44px;
  width: 44px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--nd-text-secondary);
  transition:
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms ease;
}

.am-compact-hover-action::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 7px);
  z-index: 4;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  font-weight: 500;
  letter-spacing: var(--baryon-type-data-letter-spacing);
  line-height: 1;
  text-shadow: 0 1px 3px var(--nd-bg);
  white-space: nowrap;
  opacity: 0;
  transform: translate(-50%, 3px);
  pointer-events: none;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.am-compact-hover-action:hover::after,
.am-compact-hover-action:focus-visible::after {
  opacity: 1;
  transform: translate(-50%, 0);
}

.am-compact-hover-action:hover {
  border-color: transparent;
  background: transparent;
  color: var(--nd-text-display);
}

.am-compact-hover-action:disabled {
  border-color: transparent;
  background: transparent;
  color: var(--nd-text-disabled);
  opacity: 1;
}

.am-compact-hover-action:not(:disabled):active {
  transform: scale(0.94);
  opacity: 1;
}

.am-compact-hover-action--active,
.am-compact-hover-action--active:hover {
  color: var(--nd-accent);
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
  border-radius: 999px;
  background: var(--nd-text-display);
  border: 1px solid var(--nd-border-visible);
}

.am-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid var(--nd-border-visible);
  border-radius: 999px;
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
  border: none;
  border-radius: 8px;
  padding: 4px 0;
  z-index: 60;
  overflow: hidden;
}

.am-file-list-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  width: min(20rem, calc(100vw - 1rem));
  padding: 10px;
  border: 1px solid
    color-mix(in srgb, var(--nd-text-primary) 7%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nd-surface) 96%, transparent);
  box-shadow: var(--nd-shell-shadow);
  backdrop-filter: blur(18px) saturate(120%);
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  z-index: 70;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  white-space: normal;
  transition:
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    visibility 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-file-list-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.am-file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-interface-family);
  font-size: 13px;
  font-weight: 500;
}

.am-file-list-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.am-file-list-header svg {
  width: 14px;
  height: 14px;
}

.am-file-list-header span:last-child {
  color: var(--nd-text-disabled);
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  text-transform: uppercase;
}

.am-file-list-helper {
  margin: 0 0 8px;
  color: var(--nd-text-disabled);
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  line-height: 1.3;
  letter-spacing: var(--baryon-type-data-letter-spacing);
}

.am-file-list-items {
  margin: 0;
  padding: 0 2px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(14rem, 40vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--nd-border-visible) transparent;
}

.am-file-list-items::-webkit-scrollbar {
  width: 4px;
}

.am-file-list-items::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--nd-border-visible);
}

.am-file-list-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--nd-text-primary);
  text-align: left;
  cursor: pointer;
  font-family: var(--baryon-type-interface-family);
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.am-file-list-item--active {
  background: color-mix(
    in srgb,
    var(--nd-surface-raised) 88%,
    var(--nd-accent) 12%
  );
}

.am-file-list-item:hover {
  background: var(--nd-surface-raised);
}

.am-file-list-item:disabled {
  cursor: default;
  opacity: 0.55;
}

.am-file-list-item:active {
  opacity: 0.8;
}

.am-file-list-item:focus-visible {
  outline: 2px solid var(--nd-info);
  outline-offset: -2px;
}

.am-file-list-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
}

.am-file-list-item-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 400;
  color: var(--nd-text-primary);
}

.am-file-list-item-meta {
  flex: 0 0 auto;
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  color: var(--nd-text-disabled);
  letter-spacing: var(--baryon-type-data-letter-spacing);
}

.am-file-list-item-action {
  flex-shrink: 0;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  text-transform: uppercase;
  opacity: 0;
  transition:
    opacity 160ms ease,
    color 160ms ease;
}

.am-file-list-item-action--active {
  color: var(--nd-accent);
}

.am-file-list-item:hover .am-file-list-item-action,
.am-file-list-item:focus-visible .am-file-list-item-action,
.am-file-list-item:disabled .am-file-list-item-action,
.am-file-list-item--active .am-file-list-item-action {
  opacity: 1;
}

.am-device-empty {
  padding: 8px 16px;
  font-family: var(--baryon-type-mono-family);
  font-size: 11px;
  color: var(--nd-text-disabled);
  letter-spacing: var(--baryon-type-data-letter-spacing);
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
  font-family: var(--baryon-type-interface-family);
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
  font-family: var(--baryon-type-mono-family);
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: var(--baryon-type-data-letter-spacing);
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
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  margin-top: 0;
  padding: 0;
  border-top: none;
  box-sizing: border-box;
}

.am-compact-transport-right {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
}

@media (max-width: 1024px) {
  .am-player-shell {
    width: min(42rem, calc(100vw - 1.5rem));
  }

  .am-player {
    width: 100%;
  }

  .am-player-shell--compact {
    width: min(32rem, calc(100vw - 1.5rem));
    max-width: min(32rem, calc(100vw - 1.5rem));
  }

  .am-player--compact {
    width: 100%;
  }
}

@media (max-width: 960px) {
  .am-player-shell {
    gap: 6px;
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

@media (max-width: 720px) {
  .am-source-mode-shell {
    right: 8px;
    bottom: 8px;
    max-width: calc(100vw - 16px);
    padding: var(--baryon-source-selector-padding);
  }

  .am-player-shell--compact {
    bottom: 82px;
    width: min(19rem, calc(100vw - 1.5rem));
    max-width: calc(100vw - 1.5rem);
  }

  .am-compact-card {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    border-radius: 16px;
  }

  .am-compact-card .am-timeline-shell {
    order: 2;
    grid-column: auto;
    grid-row: auto;
    margin-top: 2px;
  }

  .am-compact-card .am-timeline-row {
    gap: 7px;
    padding: 3px 2px;
  }

  .am-compact-card .am-timeline-time {
    min-width: 1.9rem;
    font-size: 9px;
  }

  .am-compact-identity {
    order: 1;
    grid-column: auto;
    grid-row: auto;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .am-compact-source-mark {
    width: 32px;
    height: 32px;
  }

  .am-compact-source-trigger {
    gap: 8px;
  }

  .am-compact-source-actions {
    display: inline-flex;
  }

  .am-compact-track-meta-upload {
    display: none;
  }

  .am-compact-track-title {
    font-size: 13px;
  }

  .am-compact-unified-actions {
    order: 3;
    grid-column: auto;
    grid-row: auto;
    width: 100%;
  }

  .am-compact-transport-right {
    width: 100%;
  }

  .am-compact-action {
    min-width: 44px;
    height: 44px;
  }

  .am-compact-action-group--playback {
    grid-template-columns: 44px 48px 44px;
    gap: 20px;
    width: 100%;
  }

  .am-compact-action-group--playback .am-compact-action--primary {
    width: 48px;
    height: 44px;
  }

  .am-compact-volume-row {
    order: 4;
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    justify-self: stretch;
    padding: 0 12px;
  }

  .am-compact-volume-end,
  .am-compact-volume-row .am-btn--volume {
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .am-source-mode-shell {
    right: 8px;
    bottom: 8px;
    max-width: calc(100vw - 16px);
    padding: var(--baryon-source-selector-padding);
  }

  .am-player-shell {
    width: calc(100vw - 16px);
    max-width: none;
    gap: 8px;
  }

  .am-player-shell--compact {
    align-items: center;
    bottom: 82px;
    width: min(19rem, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
  }

  .am-compact-shell {
    margin: 0 auto;
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .am-live-input-wrap {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .am-timeline-shell {
    padding: 8px 12px;
  }

  .am-timeline-row {
    width: 100%;
    min-width: 0;
    gap: 8px;
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
  .am-source-mode-shell {
    width: fit-content;
    right: 6px;
  }

  .am-player-shell {
    width: calc(100vw - 12px);
  }

  .am-player-shell--compact {
    width: min(19rem, calc(100vw - 12px));
    max-width: calc(100vw - 12px);
  }

  .am-compact-shell {
    min-width: 0;
  }

  .am-compact-volume-row .am-btn--volume {
    min-width: 24px;
    width: 24px;
    height: 24px;
  }

  .am-compact-volume-end {
    width: 24px;
    height: 24px;
  }

  .am-timeline-shell {
    padding: 8px 12px;
  }

  .am-btn--live-input {
    width: 42px;
    height: 42px;
  }

  .am-slider {
    min-width: 2.8rem;
  }

  .am-timeline-time {
    min-width: 2rem;
    font-size: 10px;
  }

  .am-compact-card {
    padding: 6px 8px;
  }

  .am-compact-source-mark {
    width: 32px;
    height: 32px;
  }

  .am-compact-source-trigger {
    gap: 8px;
  }

  .am-compact-track-meta {
    display: block;
  }

  .am-compact-track-title {
    font-size: 13px;
  }

  .am-compact-volume-row {
    width: 100%;
    gap: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .am-status-dot,
  .am-btn--live-input-active,
  .am-compact-hover-actions,
  .am-compact-hover-action::after {
    animation: none !important;
    transition: none !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .am-compact-card {
    background: var(--nd-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .am-compact-hover-actions-panel {
    background: var(--nd-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

@media (prefers-contrast: more) {
  .am-compact-card {
    border-color: var(--nd-text-secondary);
    background: var(--nd-surface);
  }
}

`;

function SourceModeControl({
  color,
  pulse,
  label,
  onInteraction,
  showSourceLiveButton,
  allowSystemSource,
}) {
  return (
    <div className="am-source-mode-shell" data-testid="source-mode-control">
      <SourceSelector
        onInteraction={onInteraction}
        showLiveButton={showSourceLiveButton}
        allowSystemSource={allowSystemSource}
      />
      <span
        className="am-source-mode-light"
        role="status"
        aria-label={label}
        title={label}
      >
        <span
          className="am-status-dot"
          aria-hidden="true"
          style={{
            background: color,
            animation: pulse ? "am-pulse 1.5s ease-in-out infinite" : "none",
          }}
        />
      </span>
    </div>
  );
}

const TIMELINE_INTERACTION_PHASES = Object.freeze({
  idle: "idle",
  scrubbing: "scrubbing",
  committing: "committing",
});

/** @typedef {"idle" | "scrubbing" | "committing"} TimelineInteractionPhase */
/** @typedef {{ durationSeconds: number, canSeek: boolean }} TimelineStructure */
/**
 * @typedef {object} PlaybackTimelineProps
 * @property {boolean} isAudioLoaded
 * @property {(nextTimeSeconds: number) => Promise<void>} beginScrub
 * @property {(nextTimeSeconds: number) => void} previewScrub
 * @property {(nextTimeSeconds: number) => Promise<void>} commitScrub
 * @property {() => Promise<void>} cancelScrub
 */

/** @type {Readonly<TimelineStructure>} */
const DEFAULT_TIMELINE_STRUCTURE = Object.freeze({
  durationSeconds: 0,
  canSeek: false,
});

function createTimelineStructure(snapshot) {
  return {
    durationSeconds: Math.max(0, Number(snapshot?.durationSeconds) || 0),
    canSeek: snapshot?.canSeek === true,
  };
}

function areTimelineStructuresEqual(current, next) {
  return (
    current.durationSeconds === next.durationSeconds &&
    current.canSeek === next.canSeek
  );
}

function clampTimelineValue(value, durationSeconds) {
  const safeValue = Math.max(0, Number(value) || 0);
  return durationSeconds > 0 ? Math.min(safeValue, durationSeconds) : safeValue;
}

/** @param {PlaybackTimelineProps} props */
function PlaybackTimelineView({
  isAudioLoaded,
  beginScrub,
  previewScrub,
  commitScrub,
  cancelScrub,
}) {
  const inputRef = useRef(null);
  const currentTimeRef = useRef(null);
  const pointerActiveRef = useRef(false);
  const interactionPhaseRef = useRef(
    /** @type {TimelineInteractionPhase} */ (TIMELINE_INTERACTION_PHASES.idle),
  );
  const interactionGenerationRef = useRef(0);
  const scrubStartRef = useRef({
    generation: 0,
    promise: Promise.resolve(),
  });
  const latestSnapshotRef = useRef({
    currentTimeSeconds: 0,
    durationSeconds: 0,
    canSeek: false,
  });
  const structureRef = useRef(
    /** @type {TimelineStructure} */ (DEFAULT_TIMELINE_STRUCTURE),
  );
  const [structure, setStructure] = useState(
    /** @type {TimelineStructure} */ (DEFAULT_TIMELINE_STRUCTURE),
  );

  const applyTimelineSnapshot = useCallback((snapshot) => {
    const durationSeconds = Math.max(0, Number(snapshot?.durationSeconds) || 0);
    const currentTimeSeconds = clampTimelineValue(
      snapshot?.currentTimeSeconds,
      durationSeconds,
    );
    const progressPercent =
      durationSeconds > 0
        ? Math.max(
            0,
            Math.min(100, (currentTimeSeconds / durationSeconds) * 100),
          )
        : 0;
    const input = inputRef.current;
    if (input) {
      input.value = String(currentTimeSeconds);
      input.style.setProperty("--am-progress-percent", `${progressPercent}%`);
      input.title = `Playback position ${formatClockTime(currentTimeSeconds)} of ${formatClockTime(durationSeconds)}`;
    }
    if (currentTimeRef.current) {
      currentTimeRef.current.textContent = formatClockTime(currentTimeSeconds);
    }
  }, []);

  const applyLatestAuthoritativeSnapshot = useCallback(() => {
    const latestSnapshot = latestSnapshotRef.current;
    if (
      interactionPhaseRef.current !== TIMELINE_INTERACTION_PHASES.idle ||
      latestSnapshot.canSeek !== true
    ) {
      return;
    }
    applyTimelineSnapshot(latestSnapshot);
  }, [applyTimelineSnapshot]);

  useEffect(() => {
    return observeAudioTransportClock((snapshot) => {
      latestSnapshotRef.current = snapshot;
      const nextStructure = createTimelineStructure(snapshot);
      if (!areTimelineStructuresEqual(structureRef.current, nextStructure)) {
        structureRef.current = nextStructure;
        setStructure(nextStructure);
      }

      if (!nextStructure.canSeek) {
        interactionGenerationRef.current += 1;
        interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.idle;
        pointerActiveRef.current = false;
        scrubStartRef.current = {
          generation: interactionGenerationRef.current,
          promise: Promise.resolve(),
        };
        return;
      }

      if (interactionPhaseRef.current === TIMELINE_INTERACTION_PHASES.idle) {
        applyTimelineSnapshot(snapshot);
      }
    });
  }, [applyTimelineSnapshot]);

  useLayoutEffect(() => {
    if (isAudioLoaded && structure.canSeek) {
      applyLatestAuthoritativeSnapshot();
    }
  }, [
    applyLatestAuthoritativeSnapshot,
    isAudioLoaded,
    structure.canSeek,
    structure.durationSeconds,
  ]);

  const applyScrubPreview = useCallback(
    (nextTimeSeconds) => {
      applyTimelineSnapshot({
        ...latestSnapshotRef.current,
        currentTimeSeconds: nextTimeSeconds,
      });
    },
    [applyTimelineSnapshot],
  );

  const settleInteraction = useCallback(
    async (generation, operation) => {
      interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.committing;
      pointerActiveRef.current = false;
      try {
        const scrubStart = scrubStartRef.current;
        if (scrubStart.generation === generation) {
          await scrubStart.promise;
        }
        await operation();
      } catch (error) {
        console.error("Playback scrub interaction failed.", error);
      } finally {
        if (interactionGenerationRef.current === generation) {
          interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.idle;
          scrubStartRef.current = {
            generation,
            promise: Promise.resolve(),
          };
          applyLatestAuthoritativeSnapshot();
        }
      }
    },
    [applyLatestAuthoritativeSnapshot],
  );

  const beginPointerScrub = useCallback(
    (nextTimeSeconds) => {
      const generation = interactionGenerationRef.current + 1;
      interactionGenerationRef.current = generation;
      interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.scrubbing;
      pointerActiveRef.current = true;
      applyScrubPreview(nextTimeSeconds);
      const startPromise = Promise.resolve().then(() =>
        beginScrub(nextTimeSeconds),
      );
      scrubStartRef.current = { generation, promise: startPromise };
      void startPromise.catch((error) => {
        if (interactionGenerationRef.current !== generation) {
          return;
        }
        pointerActiveRef.current = false;
        interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.idle;
        applyLatestAuthoritativeSnapshot();
        console.error("Playback scrub interaction failed.", error);
      });
    },
    [applyLatestAuthoritativeSnapshot, applyScrubPreview, beginScrub],
  );

  const commitCurrentInteraction = useCallback(
    (nextTimeSeconds) => {
      const generation = interactionGenerationRef.current;
      void settleInteraction(generation, () => commitScrub(nextTimeSeconds));
    },
    [commitScrub, settleInteraction],
  );

  const cancelCurrentInteraction = useCallback(() => {
    const generation = interactionGenerationRef.current;
    void settleInteraction(generation, cancelScrub);
  }, [cancelScrub, settleInteraction]);

  const commitDirectly = useCallback(
    (nextTimeSeconds) => {
      const generation = interactionGenerationRef.current + 1;
      interactionGenerationRef.current = generation;
      interactionPhaseRef.current = TIMELINE_INTERACTION_PHASES.committing;
      scrubStartRef.current = {
        generation,
        promise: Promise.resolve(),
      };
      applyScrubPreview(nextTimeSeconds);
      void settleInteraction(generation, () => commitScrub(nextTimeSeconds));
    },
    [applyScrubPreview, commitScrub, settleInteraction],
  );

  if (!isAudioLoaded || !structure.canSeek) {
    return null;
  }

  return (
    <div className="am-timeline-shell">
      <div className="am-timeline-row">
        <span
          ref={currentTimeRef}
          className="am-timeline-time"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          className="am-progress"
          data-testid="playback-timeline"
          type="range"
          min="0"
          max={structure.durationSeconds || 0}
          step="0.01"
          defaultValue="0"
          onPointerDown={(event) => {
            beginPointerScrub(Number(event.currentTarget.value));
          }}
          onPointerUp={(event) => {
            if (!pointerActiveRef.current) {
              return;
            }
            commitCurrentInteraction(Number(event.currentTarget.value));
          }}
          onPointerCancel={() => {
            if (!pointerActiveRef.current) {
              return;
            }
            cancelCurrentInteraction();
          }}
          onBlur={(event) => {
            if (!pointerActiveRef.current) {
              return;
            }
            commitCurrentInteraction(Number(event.currentTarget.value));
          }}
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);
            applyScrubPreview(nextValue);
            if (pointerActiveRef.current) {
              previewScrub(nextValue);
              return;
            }
            commitDirectly(nextValue);
          }}
          aria-label="Playback position"
        />
        <span className="am-timeline-time" aria-hidden="true">
          {formatClockTime(structure.durationSeconds)}
        </span>
      </div>
    </div>
  );
}

const PlaybackTimeline = memo(PlaybackTimelineView);

// ─── Listener Controls ───────────────────────────────────────────────────────

export function ListenerControls({
  showSourceLiveButton = true,
  allowSystemSource = true,
} = {}) {
  const {
    sourceSession,
    displayName,
    localFileQueue,
    activeLocalFileQueueIndex,
    hasPreviousLocalFile,
    hasNextLocalFile,
    isLocalFileQueueAutoplayEnabled,
    recentUploads,
    isPlaying,
    isLiveInputActive,
    liveInputDeviceKind,
    liveInputRuntimeStatus,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    handleFileChange,
    handleRecentUploadSelect,
    loadDemoAudioFile,
    handlePlayPause,
    handleVolumeChange,
    handleMuteToggle,
    setShowDeviceMenu,
    beginScrub,
    previewScrub,
    commitScrub,
    restartOrLoadPreviousLocalFile,
    playLocalFileAtQueueIndex,
    playNextLocalFile,
    toggleLocalFileQueueAutoplay,
    cancelScrub,
  } = useAudio();
  const fileInputRef = useRef(null);
  const fileListButtonRef = useRef(null);
  const fileListPanelRef = useRef(null);
  const [showFileListPanel, setShowFileListPanel] = useState(false);
  const [showCompactUtilities, setShowCompactUtilities] = useState(false);
  const openFilePicker = () => {
    setShowFileListPanel(false);
    setShowDeviceMenu(false);
    fileInputRef.current?.click();
  };
  const { color, pulse, label } = getStatusConfig(
    isEngineReady,
    isAudioLoaded,
    isPlaying,
    isLiveInputActive,
    liveInputDeviceKind,
    liveInputRuntimeStatus,
  );
  const volumePercent = Math.round(volume * 100);
  /** @type {import("react").CSSProperties & { "--am-slider-percent": string }} */
  const volumeSliderStyle = {
    "--am-slider-percent": `${volumePercent}%`,
  };
  const hasLocalFileQueue = localFileQueue.length > 0;
  const hasFileListItems = hasLocalFileQueue || recentUploads.length > 0;
  const queuedLocalFiles = localFileQueue.slice(
    Math.max(activeLocalFileQueueIndex + 1, 0),
  );
  const hasQueuedLocalFiles = queuedLocalFiles.length > 0;
  const isQueueingFilesUnderLive = hasQueuedLocalFiles && isLiveInputActive;
  const trackTitle = isQueueingFilesUnderLive
    ? `${queuedLocalFiles.length} file${queuedLocalFiles.length === 1 ? "" : "s"} queued`
    : "Upload audio files";
  const fileListShowsQueue = hasLocalFileQueue;
  const fileListTitle = fileListShowsQueue ? "Queue" : "Recent uploads";
  const fileListMeta = fileListShowsQueue
    ? `${localFileQueue.length} track${localFileQueue.length === 1 ? "" : "s"}`
    : "This session";
  const fileListHelper = isQueueingFilesUnderLive
    ? "Queued until LIVE ends"
    : fileListShowsQueue
      ? `Select a track · Autoplay ${
          isLocalFileQueueAutoplayEnabled ? "on" : "off"
        }`
      : "Select to play again";
  const fileTransportEnabled = sourceSession.kind === AUDIO_SOURCE_KINDS.file;
  const playDisabled = !isAudioLoaded;
  const previousDisabled = !isAudioLoaded && !hasPreviousLocalFile;
  const compactTrackTitle = isQueueingFilesUnderLive
    ? `${queuedLocalFiles.length} queued`
    : activeLocalFileQueueIndex >= 0 && localFileQueue.length > 0
      ? `Queue ${activeLocalFileQueueIndex + 1}/${localFileQueue.length}`
      : "Source";
  const sourceSummary =
    displayName === "Upload Audio" ? "Upload Audio File" : displayName;
  const handleSourceModeInteraction = () => {
    setShowFileListPanel(false);
    setShowDeviceMenu(false);
  };

  useEffect(() => {
    if (fileTransportEnabled) {
      return;
    }
    setShowFileListPanel(false);
  }, [fileTransportEnabled]);

  useEffect(() => {
    if (!showFileListPanel) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        fileListPanelRef.current?.contains(event.target) ||
        fileListButtonRef.current?.contains(event.target)
      ) {
        return;
      }
      setShowFileListPanel(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowFileListPanel(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showFileListPanel]);

  return (
    <>
      <style>{CSS}</style>

      <SourceModeControl
        color={color}
        pulse={pulse}
        label={label}
        onInteraction={handleSourceModeInteraction}
        showSourceLiveButton={showSourceLiveButton}
        allowSystemSource={allowSystemSource}
      />

      {fileTransportEnabled ? (
        <div className="am-player-shell am-player-shell--compact">
          <div className="am-player am-player--compact">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              hidden
              onChange={(event) => {
                setShowFileListPanel(false);
                handleFileChange(event);
              }}
            />

            <div className="am-compact-shell">
              <div
                className="am-compact-card"
                data-utility-state={
                  showCompactUtilities ? "expanded" : "collapsed"
                }
                onMouseEnter={() => setShowCompactUtilities(true)}
                onMouseLeave={() => setShowCompactUtilities(false)}
                onFocusCapture={() => setShowCompactUtilities(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setShowCompactUtilities(false);
                  }
                }}
              >
                <div className="am-compact-track-section">
                  <div className="am-compact-identity">
                    <button
                      type="button"
                      className="am-compact-source-trigger"
                      data-testid="compact-source-trigger"
                      onClick={openFilePicker}
                      title={trackTitle}
                      aria-label={trackTitle}
                    >
                      <span
                        className="am-compact-source-mark"
                        aria-hidden="true"
                      >
                        <MusicNoteIcon />
                      </span>
                      <div className="am-compact-source-cluster">
                        <div className="am-compact-track-copy">
                          <span className="am-compact-track-meta">
                            {compactTrackTitle}
                            <span
                              className="am-compact-track-meta-upload"
                              aria-hidden="true"
                            >
                              <UploadIcon />
                            </span>
                          </span>
                          <span
                            className="am-compact-track-title"
                            data-testid="file-track-title"
                            title={sourceSummary}
                          >
                            {sourceSummary}
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="am-compact-source-actions">
                      <button
                        type="button"
                        className="am-btn am-compact-utility am-compact-utility--bare"
                        onClick={openFilePicker}
                        title={trackTitle}
                        aria-label={trackTitle}
                      >
                        <UploadIcon />
                      </button>
                    </div>
                  </div>

                  <PlaybackTimeline
                    isAudioLoaded={isAudioLoaded}
                    beginScrub={beginScrub}
                    previewScrub={previewScrub}
                    commitScrub={commitScrub}
                    cancelScrub={cancelScrub}
                  />
                </div>

                <div className="am-compact-unified-actions">
                  <div className="am-compact-transport-right">
                    <div className="am-compact-action-group am-compact-action-group--playback">
                      <button
                        type="button"
                        className="am-btn am-compact-action am-compact-action--seek"
                        onClick={() => {
                          void restartOrLoadPreviousLocalFile();
                        }}
                        disabled={previousDisabled}
                        title="Restart or load previous track"
                        aria-label="Previous track"
                      >
                        <PreviousTrackIcon />
                      </button>

                      <button
                        type="button"
                        data-testid="file-playback-toggle"
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
                        type="button"
                        className="am-btn am-compact-action am-compact-action--seek"
                        onClick={() => {
                          void playNextLocalFile();
                        }}
                        disabled={!hasNextLocalFile}
                        title="Next track"
                        aria-label="Next track"
                      >
                        <NextTrackIcon />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="am-compact-volume-row">
                  <div className="am-volume">
                    <button
                      type="button"
                      className="am-btn am-btn--volume"
                      onClick={handleMuteToggle}
                      aria-label={
                        isMuted ? "Unmute app playback" : "Mute app playback"
                      }
                      title={
                        isMuted ? "Unmute app playback" : "Mute app playback"
                      }
                    >
                      {isMuted || volume <= 0.001 ? (
                        <VolumeIcon muted />
                      ) : (
                        <VolumeLowIcon />
                      )}
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
                  <span className="am-compact-volume-end" aria-hidden="true">
                    <VolumeIcon muted={false} />
                  </span>
                </div>

                <div
                  className={`am-compact-hover-actions${
                    showCompactUtilities
                      ? " am-compact-hover-actions--expanded"
                      : ""
                  }`}
                >
                  <div className="am-compact-hover-actions-panel">
                    <button
                      type="button"
                      ref={fileListButtonRef}
                      className={`am-btn am-compact-hover-action${
                        showFileListPanel
                          ? " am-compact-hover-action--active"
                          : ""
                      }`}
                      onClick={() => {
                        setShowDeviceMenu(false);
                        setShowFileListPanel(!showFileListPanel);
                      }}
                      disabled={!hasFileListItems}
                      title={hasFileListItems ? fileListTitle : "Queue"}
                      data-tooltip={hasFileListItems ? fileListTitle : "Queue"}
                      aria-label={hasFileListItems ? fileListTitle : "Queue"}
                    >
                      <QueueIcon />
                    </button>
                    <button
                      type="button"
                      className="am-btn am-compact-hover-action"
                      onClick={() => {
                        setShowFileListPanel(false);
                        setShowDeviceMenu(false);
                        void loadDemoAudioFile?.();
                      }}
                      title="Play demo audio"
                      data-tooltip="Demo audio"
                      aria-label="Play demo audio"
                    >
                      <DemoAudioIcon />
                    </button>
                    <button
                      type="button"
                      className={`am-btn am-compact-hover-action${
                        isLocalFileQueueAutoplayEnabled
                          ? " am-compact-hover-action--active"
                          : ""
                      }`}
                      onClick={toggleLocalFileQueueAutoplay}
                      title={`Autoplay ${
                        isLocalFileQueueAutoplayEnabled ? "on" : "off"
                      }`}
                      data-tooltip={`Autoplay ${
                        isLocalFileQueueAutoplayEnabled ? "on" : "off"
                      }`}
                      aria-label="Autoplay"
                      aria-pressed={isLocalFileQueueAutoplayEnabled}
                    >
                      <AutoplayIcon />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {hasFileListItems ? (
            <div
              ref={fileListPanelRef}
              className={`am-file-list-panel${
                showFileListPanel ? "" : " am-file-list-hidden"
              }`}
              data-testid={
                fileListShowsQueue
                  ? "local-file-queue-panel"
                  : "recent-uploads-panel"
              }
            >
              <div className="am-file-list-header">
                <span>
                  <QueueIcon /> {fileListTitle}
                </span>
                <span>{fileListMeta}</span>
              </div>
              <p className="am-file-list-helper">{fileListHelper}</p>
              <ul className="am-file-list-items">
                {fileListShowsQueue
                  ? localFileQueue.map((queueEntry, queueIndex) => {
                      const isActive = queueIndex === activeLocalFileQueueIndex;
                      const actionLabel = isLiveInputActive
                        ? "Queued"
                        : isActive && isPlaying
                          ? "Playing"
                          : "Play";
                      return (
                        <li key={`${queueEntry.id}:${queueIndex}`}>
                          <button
                            type="button"
                            className={`am-file-list-item${
                              isActive ? " am-file-list-item--active" : ""
                            }`}
                            onClick={async () => {
                              setShowFileListPanel(false);
                              await playLocalFileAtQueueIndex(queueIndex);
                            }}
                            disabled={isLiveInputActive}
                            title={
                              isLiveInputActive
                                ? "Queued until live input stops"
                                : `Play ${queueEntry.name}`
                            }
                            aria-label={
                              isLiveInputActive
                                ? `Queued ${queueEntry.name}`
                                : `Play ${queueEntry.name}`
                            }
                          >
                            <span className="am-file-list-item-main">
                              <span className="am-file-list-item-title">
                                {queueEntry.name}
                              </span>
                              <span className="am-file-list-item-meta">
                                {queueIndex + 1} / {localFileQueue.length} ·{" "}
                                {formatFileSize(queueEntry.size)}
                              </span>
                            </span>
                            <span
                              className={`am-file-list-item-action${
                                isActive
                                  ? " am-file-list-item-action--active"
                                  : ""
                              }`}
                            >
                              {actionLabel}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  : recentUploads.map((upload) => {
                      const actionLabel = isLiveInputActive ? "Queue" : "Play";
                      return (
                        <li key={upload.id}>
                          <button
                            type="button"
                            className="am-file-list-item"
                            onClick={async () => {
                              setShowFileListPanel(false);
                              await handleRecentUploadSelect(upload.id);
                            }}
                            title={`${actionLabel} ${upload.name}`}
                            aria-label={`${actionLabel} ${upload.name}`}
                          >
                            <span className="am-file-list-item-main">
                              <span className="am-file-list-item-title">
                                {upload.name}
                              </span>
                              <span className="am-file-list-item-meta">
                                {formatFileSize(upload.size)}
                              </span>
                            </span>
                            <span className="am-file-list-item-action">
                              {actionLabel}
                            </span>
                          </button>
                        </li>
                      );
                    })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
