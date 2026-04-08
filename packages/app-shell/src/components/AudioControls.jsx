import React, { useRef, useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { SourceSelector } from "./controls/SourceSelector";

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

.am-player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: #111111;
  border: 1px solid #222222;
  border-radius: 8px;
  font-family: "Space Grotesk", "DM Sans", system-ui, sans-serif;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
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
  background: #111111;
  border: 1px solid #222222;
  border-radius: 8px;
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
  color: #999999;
  font-family: "Space Mono", "JetBrains Mono", "SF Mono", monospace;
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
    #E8E8E8 0%,
    #E8E8E8 var(--am-progress-percent),
    #222222 var(--am-progress-percent),
    #222222 100%
  );
}

.am-progress::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 0;
  background: #FFFFFF;
  border: 1px solid #333333;
}

.am-progress::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid #333333;
  border-radius: 0;
  background: #FFFFFF;
}

.am-progress::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 0;
  background: #222222;
}

/* ── Track section — Nothing: minimal, typographic ── */
.am-track {
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
.am-track:hover { border-color: #333333; }

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
  border: 1px solid #333333;
  border-radius: 8px;
  background: #111111;
  color: #E8E8E8;
  font-family: "Space Grotesk", system-ui, sans-serif;
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
  background: #111111;
  border-right: 1px solid #333333;
  border-bottom: 1px solid #333333;
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
  border: 1px solid #333333;
  color: #999999;
}

.am-btn--soundcloud:hover {
  border-color: #E8E8E8;
  color: #E8E8E8;
}

.am-btn--soundcloud-active {
  border-color: #E8E8E8;
  color: #FFFFFF;
}

.am-btn--recent {
  width: 30px;
  height: 30px;
  background: transparent;
  border: 1px solid #333333;
  color: #999999;
}

.am-btn--recent:hover {
  border-color: #E8E8E8;
  color: #E8E8E8;
}

.am-btn--recent-active {
  border-color: #E8E8E8;
  color: #FFFFFF;
}

/* ── Status — Nothing: dot + instrument-panel label ── */
.am-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.am-status-label {
  font-family: "Space Mono", monospace;
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666666;
  white-space: nowrap;
}

.am-filename-wrap {
  overflow: hidden;
  max-width: 150px;
  display: block;
  min-width: 0;
}

.am-filename {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 400;
  color: #E8E8E8;
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
  background: #222222;
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
  border: 1px solid #333333;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #E8E8E8;
  transition: border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  flex-shrink: 0;
}
.am-btn:disabled {
  opacity: 0.4;
  cursor: default;
  border-color: #222222;
  color: #666666;
}

/* Play/Pause — primary action, white bg inverted */
.am-btn--play {
  width: 36px;
  height: 36px;
  background: #FFFFFF;
  border-color: #FFFFFF;
  color: #000000;
}
.am-btn--play:not(:disabled):hover {
  background: #E8E8E8;
  border-color: #E8E8E8;
}
.am-btn--play:not(:disabled):active { opacity: 0.8; }
.am-btn--play:disabled {
  background: #333333;
  border-color: #333333;
  color: #666666;
}

/* Stop — ghost */
.am-btn--stop {
  width: 30px;
  height: 30px;
}
.am-btn--stop:not(:disabled):hover {
  border-color: #E8E8E8;
  color: #FFFFFF;
}
.am-btn--stop:not(:disabled):active { opacity: 0.8; }

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
  border-color: #E8E8E8;
  color: #FFFFFF;
}
.am-btn--live-input:active { opacity: 0.8; }

.am-btn--live-input-active {
  border-color: #D71921 !important;
  color: #D71921 !important;
  animation: am-pulse 1.5s ease-in-out infinite;
}
.am-btn--live-input-active:hover {
  border-color: #ff453a !important;
  color: #ff453a !important;
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

.am-btn--volume {
  width: 30px;
  height: 30px;
}
.am-btn--volume:hover {
  border-color: #E8E8E8;
  color: #FFFFFF;
}
.am-btn--volume:active { opacity: 0.8; }

.am-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 88px;
  height: 4px;
  border-radius: 0;
  background: #222222;
  outline: none;
  cursor: pointer;
}

.am-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 0;
  background: #FFFFFF;
  border: 1px solid #333333;
}

.am-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: 1px solid #333333;
  border-radius: 0;
  background: #FFFFFF;
}

.am-slider::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 0;
  background: #222222;
}

/* ── Device menu — Nothing: flat surface, border separation ── */
.am-device-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 14rem;
  background: #1A1A1A;
  border: 1px solid #333333;
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
  border: 1px solid #333333;
  border-radius: 12px;
  background: #111111;
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
  border: 1px solid #333333;
  border-radius: 12px;
  background: #111111;
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
  color: #E8E8E8;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.am-recent-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.am-recent-header span:last-child {
  color: #666666;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-recent-helper {
  margin: 0 0 12px;
  color: #999999;
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
  color: #E8E8E8;
  text-align: left;
  cursor: pointer;
  font-family: "Space Grotesk", system-ui, sans-serif;
  border-bottom: 1px solid #222222;
  transition: background 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-recent-item:last-child {
  border-bottom: none;
}

.am-recent-item--pending {
  background: rgba(215, 25, 33, 0.08);
  border-left: 2px solid #D71921;
}

.am-recent-item:hover {
  background: #1A1A1A;
}

.am-recent-item--pending:hover {
  background: rgba(215, 25, 33, 0.12);
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
  color: #E8E8E8;
}

.am-recent-item-meta {
  font-family: "Space Mono", monospace;
  font-size: 11px;
  color: #666666;
  letter-spacing: 0.04em;
}

.am-recent-item-action {
  flex-shrink: 0;
  color: #999999;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-recent-item-action--pending {
  color: #D71921;
}

/* ── SoundCloud panel — Nothing style ── */
.am-soundcloud-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: #E8E8E8;
  font-family: "Space Mono", monospace;
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
  border-bottom: 1px solid #333333;
  border-radius: 0;
  background: transparent;
  color: #E8E8E8;
  font-family: "Space Mono", monospace;
  font-size: 13px;
  outline: none;
}

.am-soundcloud-input::placeholder {
  color: #666666;
}

.am-soundcloud-input:focus {
  border-bottom-color: #E8E8E8;
}

.am-soundcloud-submit {
  height: 40px;
  padding: 0 24px;
  border: 1px solid #333333;
  border-radius: 999px;
  background: transparent;
  color: #E8E8E8;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
              color 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-soundcloud-submit:hover {
  border-color: #E8E8E8;
  color: #FFFFFF;
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
  color: #666666;
}

.am-soundcloud-error {
  color: #D71921;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
}

.am-soundcloud-meta {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 0;
  background: #1A1A1A;
  border: 1px solid #222222;
}

.am-soundcloud-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  color: #E8E8E8;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.am-soundcloud-index {
  color: #666666;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
}

.am-soundcloud-subtitle {
  margin: 4px 0 0;
  color: #999999;
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
  border-bottom: 1px solid #222222;
}

.am-soundcloud-item:last-child {
  border-bottom: none;
}

.am-soundcloud-item-current {
  border-left: 2px solid #D71921;
  padding-left: 8px;
  background: transparent;
}

.am-soundcloud-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 13px;
  color: #E8E8E8;
}

.am-soundcloud-item-current .am-soundcloud-item-title {
  color: #FFFFFF;
}

.am-soundcloud-item-artist {
  flex-shrink: 0;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  color: #666666;
  letter-spacing: 0.04em;
}

.am-soundcloud-empty {
  margin: 12px 0 0;
  padding: 16px;
  border-radius: 0;
  background: #1A1A1A;
  border: 1px solid #222222;
  color: #666666;
  font-size: 12px;
  line-height: 1.4;
}

.am-device-empty {
  padding: 8px 16px;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  color: #666666;
  letter-spacing: 0.04em;
  margin: 0;
}

.am-device-note {
  padding: 0 16px 8px;
  font-size: 12px;
  line-height: 1.4;
  color: #666666;
  margin: 0;
}

.am-device-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: #E8E8E8;
  text-align: left;
  padding: 8px 16px;
  font-size: 13px;
  font-family: "Space Grotesk", system-ui, sans-serif;
  cursor: pointer;
  transition: background 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.am-device-item-label {
  display: block;
}

.am-device-item-hint {
  display: block;
  margin-top: 2px;
  color: #666666;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.04em;
}

.am-device-item:hover { background: #1A1A1A; }
.am-device-item--active { color: #FFFFFF; }
.am-device-item--active::before {
  content: "";
  display: inline-block;
  width: 2px;
  height: 12px;
  background: #D71921;
  margin-right: 8px;
  vertical-align: middle;
}
.am-device-item--active .am-device-item-hint { color: #999999; }

/* ── Responsive — Nothing: same rules, tighter spacing ── */
@media (max-width: 960px) {
  .am-player-shell {
    gap: 6px;
  }

  .am-player {
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

@media (max-width: 720px) {
  .am-player-shell {
    bottom: 16px;
    width: calc(100vw - 16px);
    max-width: none;
    gap: 8px;
  }

  .am-player {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
    border-radius: 8px;
    white-space: normal;
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
    background: #1A1A1A;
    border: 1px solid #222222;
  }

  .am-volume-meta {
    width: min(100%, 20rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    color: #666666;
    font-family: "Space Mono", monospace;
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

  .am-player {
    padding: 12px;
  }

  .am-track {
    gap: 4px;
    width: min(14rem, calc(100vw - 7.2rem));
    padding: 4px 12px;
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
    activeSource,
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
    transportState,
    scrubPreviewSeconds,
    isScrubbing,
    beginScrub,
    previewScrub,
    commitScrub,
    cancelScrub,
  } = useAudio();

  const fileInputRef = useRef(null);
  const queuedPopupTimeoutRef = useRef(0);
  const recentUploadsButtonRef = useRef(null);
  const recentUploadsPanelRef = useRef(null);
  const timelinePointerActiveRef = useRef(false);
  const [showRecentUploadsPanel, setShowRecentUploadsPanel] = useState(false);
  const [showQueuedPopup, setShowQueuedPopup] = useState(false);
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
      : transportState.currentTimeSeconds;
  const timelineDuration = transportState.durationSeconds;
  const timelineProgressPercent =
    timelineDuration > 0
      ? Math.max(0, Math.min(100, (timelineValue / timelineDuration) * 100))
      : 0;
  /** @type {import("react").CSSProperties & { "--am-progress-percent": string }} */
  const timelineStyle = {
    "--am-progress-percent": `${timelineProgressPercent}%`,
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
  const playDisabled = !isAudioLoaded;
  const queuedPopupMessage = liveReturnLocalFile?.name
    ? `${queuedNextLocalFile?.name || "This file"} is queued next. ${liveReturnLocalFile.name} will be restored first when LIVE stops.`
    : `${queuedNextLocalFile?.name || "This file"} is queued and will load when LIVE stops.`;

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

      <div className="am-player-shell">
        {isAudioLoaded && transportState.canSeek ? (
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

        <div className="am-player">
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

            {/* ── Center: track info ── */}
            <div
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
                <MusicNoteIcon />
                <ScrollingText text={displayName} />
              </span>
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
            </div>

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
                      showSoundCloudPanel || activeSource === "soundcloud"
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
            {/* ── Center: transport ── */}
            <div className="am-transport">
              <button
                className="am-btn am-btn--play"
                onClick={handlePlayPause}
                disabled={playDisabled}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                className="am-btn am-btn--stop"
                onClick={handleStop}
                disabled={!isAudioLoaded}
                title="Stop"
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

          <div className="am-volume-row">
            <div className="am-volume-meta" aria-hidden="true">
              <span>App Volume</span>
              <span>{volumePercent}%</span>
            </div>
            <div className="am-volume">
              <button
                className="am-btn am-btn--volume"
                onClick={handleMuteToggle}
                title={isMuted ? "Unmute app playback" : "Mute app playback"}
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

export default ListenerControls;
