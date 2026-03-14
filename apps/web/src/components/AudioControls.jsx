import React, { useRef, useState, useEffect } from "react";
import { MIC_PROFILE_OPTIONS } from "@baryon/visualizer";
import { useAudio } from "../context/AudioContext";

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function MusicNoteIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.45)"
      strokeWidth="2"
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="4" height="16" rx="1" />
      <rect x="15" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function VolumeIcon({ muted }) {
  if (muted) {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
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
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
    <svg width="16" height="10" viewBox="0 0 64 40" fill="currentColor">
      <path d="M25.2 15.1A11.3 11.3 0 0 0 14 26.4V28H9.6A9.6 9.6 0 0 0 0 37.6 2.4 2.4 0 0 0 2.4 40h50a11.6 11.6 0 0 0 0-23.1 15 15 0 0 0-27.2-1.8Z" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

function getStatusConfig(isEngineReady, isAudioLoaded, isPlaying, isMicActive) {
  if (isMicActive)
    return { color: "#ff453a", pulse: true, label: "Mic active" };
  if (isPlaying) return { color: "#32d74b", pulse: true, label: "Playing" };
  if (isAudioLoaded) return { color: "#0a84ff", pulse: false, label: "Loaded" };
  if (isEngineReady) return { color: "#32d74b", pulse: false, label: "Ready" };
  return { color: "#ff9f0a", pulse: true, label: "Initializing" };
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

function getMicProfileLabel(profile) {
  return (
    MIC_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ??
    MIC_PROFILE_OPTIONS[0]?.label ??
    "Voice"
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  gap: 0.55rem;
  width: fit-content;
  max-width: calc(100vw - 1.5rem);
}

.am-player {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.55),
    0 1px 0 rgba(255, 255, 255, 0.05) inset;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  user-select: none;
  white-space: nowrap;
  box-sizing: border-box;
}

.am-controls-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  width: 100%;
}

.am-source-row,
.am-actions-row,
.am-volume-row,
.am-utility-row {
  display: contents;
}

.am-timeline-shell {
  display: flex;
  align-items: center;
  padding: 0.55rem 0.875rem 0.65rem;
  background: rgba(28, 28, 30, 0.72);
  backdrop-filter: blur(22px) saturate(170%);
  -webkit-backdrop-filter: blur(22px) saturate(170%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.38),
    0 1px 0 rgba(255, 255, 255, 0.04) inset;
}

.am-timeline-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  width: 100%;
}

.am-timeline-time {
  min-width: 2.2rem;
  color: rgba(255, 255, 255, 0.52);
  font-size: 0.67rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.am-progress {
  --am-progress-percent: 0%;
  appearance: none;
  -webkit-appearance: none;
  flex: 1 1 auto;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.92) 0%,
    rgba(255, 255, 255, 0.92) var(--am-progress-percent),
    rgba(255, 255, 255, 0.14) var(--am-progress-percent),
    rgba(255, 255, 255, 0.14) 100%
  );
}

.am-progress::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.am-progress::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.am-progress::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.14);
}

/* ── Track section ── */
.am-track {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  cursor: pointer;
  transition: background 150ms;
  max-width: 190px;
  min-width: 0;
}
.am-track:hover { background: rgba(255, 255, 255, 0.08); }

.am-source-tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.am-status-group {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

.am-track-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.am-btn--soundcloud {
  width: 30px;
  height: 30px;
  background: rgba(255, 85, 0, 0.16);
  color: #ff7a1a;
}

.am-btn--soundcloud:hover {
  background: rgba(255, 85, 0, 0.28);
}

.am-btn--soundcloud-active {
  background: rgba(255, 85, 0, 0.32);
  color: #ff9c52;
}

.am-btn--recent {
  width: 30px;
  height: 30px;
  background: rgba(10, 132, 255, 0.13);
  color: rgba(122, 189, 255, 0.92);
}

.am-btn--recent:hover {
  background: rgba(10, 132, 255, 0.22);
}

.am-btn--recent-active {
  background: rgba(10, 132, 255, 0.28);
  color: #a9d5ff;
}

.am-status-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.am-filename-wrap {
  overflow: hidden;
  max-width: 145px;
  display: block;
  min-width: 0;
}

.am-filename {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.88);
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

/* ── Divider ── */
.am-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 0.125rem;
  flex-shrink: 0;
}

/* ── Transport ── */
.am-transport {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

/* ── Shared button base ── */
.am-btn {
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.88);
  transition: background 150ms, transform 80ms, opacity 150ms;
  flex-shrink: 0;
}
.am-btn:disabled {
  opacity: 0.28;
  cursor: default;
}

/* Play/Pause — larger, slightly filled */
.am-btn--play {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.14);
}
.am-btn--play:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.24);
  transform: scale(1.06);
}
.am-btn--play:not(:disabled):active { transform: scale(0.96); }

/* Stop — smaller */
.am-btn--stop {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.07);
}
.am-btn--stop:not(:disabled):hover { background: rgba(255, 255, 255, 0.14); }
.am-btn--stop:not(:disabled):active { transform: scale(0.94); }

/* ── Mic ── */
.am-mic-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.am-btn--mic {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.07);
}
.am-btn--mic:hover { background: rgba(255, 255, 255, 0.14); }
.am-btn--mic:active { transform: scale(0.94); }

.am-btn--mic-active {
  background: rgba(255, 69, 58, 0.28) !important;
  color: #ff453a !important;
  animation: am-pulse 1.5s ease-in-out infinite;
}
.am-btn--mic-active:hover { background: rgba(255, 69, 58, 0.42) !important; }

.am-mic-status {
  display: inline-flex;
  align-items: center;
  min-height: 1.95rem;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.88);
  font-size: 0.74rem;
  line-height: 1rem;
  white-space: nowrap;
}

/* ── Volume ── */
.am-volume {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.am-volume-meta {
  display: none;
}

.am-btn--volume {
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.07);
}
.am-btn--volume:hover { background: rgba(255, 255, 255, 0.14); }
.am-btn--volume:active { transform: scale(0.94); }

.am-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 88px;
  height: 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.14);
  outline: none;
  cursor: pointer;
}

.am-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.am-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18);
}

.am-slider::-moz-range-track {
  height: 4px;
  border: none;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.14);
}

/* ── Device menu ── */
.am-device-menu {
  position: absolute;
  bottom: calc(100% + 0.6rem);
  right: 0;
  min-width: 14rem;
  background: rgba(30, 30, 32, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 0.375rem 0;
  z-index: 60;
  overflow: hidden;
}

.am-soundcloud-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.8rem);
  transform: translateX(-50%);
  width: min(30rem, calc(100vw - 1.5rem));
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1rem;
  background: rgba(20, 20, 24, 0.94);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.44);
  z-index: 70;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  white-space: normal;
  transition:
    opacity 160ms ease,
    visibility 160ms ease,
    transform 160ms ease;
}

.am-soundcloud-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(-50%) translateY(0.4rem);
}

.am-recent-panel {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.8rem);
  transform: translateX(-50%);
  width: min(24rem, calc(100vw - 1.5rem));
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1rem;
  background: rgba(18, 22, 28, 0.95);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.44);
  z-index: 70;
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  white-space: normal;
  transition:
    opacity 160ms ease,
    visibility 160ms ease,
    transform 160ms ease;
}

.am-recent-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateX(-50%) translateY(0.4rem);
}

.am-recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.35rem;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.84rem;
  font-weight: 600;
}

.am-recent-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.am-recent-header span:last-child {
  color: rgba(255, 255, 255, 0.42);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-recent-helper {
  margin: 0 0 0.65rem;
  color: rgba(255, 255, 255, 0.54);
  font-size: 0.74rem;
  line-height: 1.45;
}

.am-recent-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.am-recent-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.65rem 0.75rem;
  border: none;
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.92);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, transform 80ms ease;
}

.am-recent-item:hover {
  background: rgba(10, 132, 255, 0.16);
}

.am-recent-item:active {
  transform: scale(0.99);
}

.am-recent-item-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.am-recent-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.77rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.am-recent-item-meta {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.48);
}

.am-recent-item-action {
  flex-shrink: 0;
  color: #7abdff;
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.am-soundcloud-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.85rem;
  font-weight: 600;
}

.am-soundcloud-form {
  display: flex;
  gap: 0.5rem;
}

.am-soundcloud-input {
  flex: 1;
  min-width: 0;
  height: 2.4rem;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.82rem;
  outline: none;
}

.am-soundcloud-input::placeholder {
  color: rgba(255, 255, 255, 0.42);
}

.am-soundcloud-input:focus {
  border-color: rgba(255, 122, 26, 0.68);
}

.am-soundcloud-submit {
  height: 2.4rem;
  padding: 0 0.95rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #ff7a1a, #ff5500);
  color: white;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}

.am-soundcloud-submit:hover {
  filter: brightness(1.05);
}

.am-soundcloud-helper,
.am-soundcloud-error {
  margin: 0.55rem 0 0;
  font-size: 0.76rem;
  line-height: 1.45;
  white-space: normal;
  overflow-wrap: anywhere;
}

.am-soundcloud-helper {
  color: rgba(255, 255, 255, 0.56);
}

.am-soundcloud-error {
  color: #ff8f85;
}

.am-soundcloud-meta {
  margin-top: 0.7rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.am-soundcloud-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.8rem;
  font-weight: 600;
}

.am-soundcloud-index {
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.7rem;
  font-weight: 500;
}

.am-soundcloud-subtitle {
  margin: 0.35rem 0 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.72rem;
  line-height: 1.45;
}

.am-soundcloud-list {
  margin: 0.65rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.am-soundcloud-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 0.65rem;
  background: rgba(255, 255, 255, 0.03);
}

.am-soundcloud-item-current {
  background: rgba(255, 122, 26, 0.16);
  color: rgba(255, 255, 255, 0.96);
}

.am-soundcloud-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.73rem;
  color: rgba(255, 255, 255, 0.84);
}

.am-soundcloud-item-current .am-soundcloud-item-title {
  color: rgba(255, 255, 255, 0.96);
}

.am-soundcloud-item-artist {
  flex-shrink: 0;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.42);
}

.am-soundcloud-empty {
  margin: 0.7rem 0 0;
  padding: 0.75rem 0.85rem;
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.48);
  font-size: 0.74rem;
  line-height: 1.45;
}

.am-device-empty {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.38);
  margin: 0;
}

.am-device-note {
  padding: 0 1rem 0.55rem;
  font-size: 0.74rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.46);
  margin: 0;
}

.am-device-item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  text-align: left;
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  cursor: pointer;
  transition: background 100ms;
}

.am-device-item-label {
  display: block;
}

.am-device-item-hint {
  display: block;
  margin-top: 0.16rem;
  color: rgba(255, 255, 255, 0.46);
  font-size: 0.72rem;
  line-height: 1.35;
}

.am-device-item:hover { background: rgba(255, 255, 255, 0.08); }
.am-device-item--active { color: #0a84ff; }
.am-device-item--active .am-device-item-hint { color: rgba(160, 204, 255, 0.82); }

@media (max-width: 960px) {
  .am-player-shell {
    gap: 0.42rem;
  }

  .am-player {
    padding: 0.45rem 0.75rem;
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
    padding: 0.48rem 0.75rem 0.58rem;
  }

  .am-timeline-row {
    min-width: 11rem;
  }
}

@media (max-width: 720px) {
  .am-player-shell {
    bottom: 1rem;
    width: calc(100vw - 1rem);
    max-width: none;
    gap: 0.55rem;
  }

  .am-player {
    padding: 0.7rem 0.75rem;
    border-radius: 1.6rem;
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
    gap: 0.45rem;
  }

  .am-actions-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 0.5rem;
  }

  .am-utility-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    grid-column: 3;
    justify-self: end;
  }

  .am-volume-row {
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 0 0.35rem;
    gap: 0.35rem;
  }

  .am-timeline-shell {
    padding: 0.58rem 0.75rem 0.66rem;
    border-radius: 1.35rem;
  }

  .am-timeline-row {
    width: 100%;
    min-width: 0;
    gap: 0.45rem;
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
    padding: 0.35rem 1rem;
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
    font-size: 0.78rem;
  }

  .am-divider {
    display: none;
  }

  .am-transport {
    grid-column: 2;
    justify-self: center;
    gap: 0.35rem;
  }

  .am-volume {
    width: min(100%, 20rem);
    min-width: 0;
    gap: 0.35rem;
    padding: 0.42rem 0.55rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .am-volume-meta {
    width: min(100%, 20rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.2rem;
    color: rgba(255, 255, 255, 0.48);
    font-size: 0.66rem;
    font-weight: 600;
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
    width: calc(100vw - 0.75rem);
  }

  .am-player {
    padding: 0.65rem;
  }

  .am-track {
    gap: 0.35rem;
    width: min(14rem, calc(100vw - 7.2rem));
    padding: 0.32rem 0.9rem;
  }

  .am-source-row,
  .am-actions-row,
  .am-volume-row {
    gap: 0.3rem;
  }

  .am-utility-row {
    gap: 0.3rem;
  }

  .am-volume-row {
    padding: 0 0.2rem;
  }

  .am-timeline-shell {
    padding: 0.54rem 0.65rem 0.62rem;
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

  .am-btn--mic {
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
    padding: 0.38rem 0.5rem;
  }

  .am-volume-meta {
    width: 100%;
    font-size: 0.62rem;
  }

  .am-timeline-time {
    min-width: 2rem;
    font-size: 0.64rem;
  }
}

`;

// ─── Component ───────────────────────────────────────────────────────────────

function AudioControls() {
  const {
    soundCloudEnabled,
    activeSource,
    displayName,
    recentUploads,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    showDeviceMenu,
    audioDevices,
    selectedDevice,
    micProfile,
    micRuntimeStatus,
    handleFileChange,
    handleRecentUploadSelect,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleMicProfileChange,
    handleVolumeChange,
    handleMuteToggle,
    setShowDeviceMenu,
    setSelectedDevice,
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
  const recentUploadsButtonRef = useRef(null);
  const recentUploadsPanelRef = useRef(null);
  const timelinePointerActiveRef = useRef(false);
  const [showRecentUploadsPanel, setShowRecentUploadsPanel] = useState(false);
  const { color, pulse, label } = getStatusConfig(
    isEngineReady,
    isAudioLoaded,
    isPlaying,
    isMicActive,
  );
  const volumePercent = Math.round(volume * 100);
  const soundCloudListStart = Math.max(0, soundCloudCurrentIndex - 1);
  const soundCloudVisibleTracks = soundCloudQueue.slice(
    soundCloudListStart,
    soundCloudListStart + 4,
  );
  const micStatusLabel =
    isMicActive && micRuntimeStatus?.calibrating
      ? "Calibrating"
      : isMicActive
        ? getMicProfileLabel(micRuntimeStatus?.profile ?? micProfile)
        : null;
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
              title="Upload audio"
            >
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
                disabled={!isAudioLoaded}
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
              {/* ── Right: mic + device menu ── */}
              <div className="am-mic-wrap">
                <button
                  className={`am-btn am-btn--mic${isMicActive ? " am-btn--mic-active" : ""}`}
                  onClick={async () => {
                    setShowRecentUploadsPanel(false);
                    if (isMicActive) {
                      await handleMicToggle();
                    } else {
                      setShowDeviceMenu(!showDeviceMenu);
                    }
                  }}
                  title={isMicActive ? "Stop mic input" : "Select audio input"}
                >
                  <MicIcon />
                </button>
                {micStatusLabel ? (
                  <span className="am-mic-status" data-testid="mic-status">
                    {micStatusLabel}
                  </span>
                ) : null}

                {showDeviceMenu && (
                  <div className="am-device-menu">
                    {audioDevices.length === 0 ? (
                      <p className="am-device-empty">No input devices found</p>
                    ) : (
                      <>
                        {audioDevices.map((device) => (
                          <button
                            key={device.deviceId}
                            className={`am-device-item${
                              selectedDevice === device.deviceId
                                ? " am-device-item--active"
                                : ""
                            }`}
                            onClick={async () => {
                              setSelectedDevice(device.deviceId);
                              setShowDeviceMenu(false);
                              await handleMicToggle();
                            }}
                          >
                            {device.label ||
                              `Device ${device.deviceId.slice(0, 8)}`}
                          </button>
                        ))}
                        <p className="am-device-empty">Input profile</p>
                        <p className="am-device-note">
                          Auto-calibrates when mic starts or when you change
                          profile.
                        </p>
                        {MIC_PROFILE_OPTIONS.map((profile) => (
                          <button
                            key={profile.value}
                            className={`am-device-item${
                              micProfile === profile.value
                                ? " am-device-item--active"
                                : ""
                            }`}
                            onClick={() =>
                              handleMicProfileChange(profile.value)
                            }
                          >
                            <span className="am-device-item-label">
                              {profile.label}
                            </span>
                            <span className="am-device-item-hint">
                              {profile.description}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
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
            <p className="am-recent-helper">
              Reload a recent local file without reopening the picker.
            </p>
            <ul className="am-recent-list">
              {recentUploads.map((upload) => (
                <li key={upload.id}>
                  <button
                    className="am-recent-item"
                    onClick={async () => {
                      setShowRecentUploadsPanel(false);
                      await handleRecentUploadSelect(upload.id);
                    }}
                  >
                    <span className="am-recent-item-main">
                      <span className="am-recent-item-title">
                        {upload.name}
                      </span>
                      <span className="am-recent-item-meta">
                        {formatFileSize(upload.size)}
                      </span>
                    </span>
                    <span className="am-recent-item-action">Reload</span>
                  </button>
                </li>
              ))}
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

export default AudioControls;
