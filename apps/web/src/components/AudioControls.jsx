import React, { useRef, useState, useEffect } from "react";
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const CSS = `
@keyframes am-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

.am-player {
  position: fixed;
  bottom: 1.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
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
}
.am-track:hover { background: rgba(255, 255, 255, 0.08); }

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
.am-mic-wrap { position: relative; }

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

.am-device-empty {
  padding: 0.5rem 1rem;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.38);
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
.am-device-item:hover { background: rgba(255, 255, 255, 0.08); }
.am-device-item--active { color: #0a84ff; }
`;

// ─── Component ───────────────────────────────────────────────────────────────

function AudioControls() {
  const {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    isEngineReady,
    showDeviceMenu,
    audioDevices,
    selectedDevice,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    setShowDeviceMenu,
    setSelectedDevice,
  } = useAudio();

  const fileInputRef = useRef(null);
  const { color, pulse, label } = getStatusConfig(
    isEngineReady,
    isAudioLoaded,
    isPlaying,
    isMicActive,
  );

  return (
    <>
      <style>{CSS}</style>

      <div className="am-player">
        {/* ── Left: track info ── */}
        <div
          className="am-track"
          onClick={() => fileInputRef.current?.click()}
          title="Upload audio"
        >
          <span
            className="am-status-dot"
            title={label}
            style={{
              background: color,
              animation: pulse ? "am-pulse 1.5s ease-in-out infinite" : "none",
            }}
          />
          <MusicNoteIcon />
          <ScrollingText text={fileName} />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={handleFileChange}
          />
        </div>

        <div className="am-divider" />

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

        {/* ── Right: mic + device menu ── */}
        <div className="am-mic-wrap">
          <button
            className={`am-btn am-btn--mic${isMicActive ? " am-btn--mic-active" : ""}`}
            onClick={async () => {
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

          {showDeviceMenu && (
            <div className="am-device-menu">
              {audioDevices.length === 0 ? (
                <p className="am-device-empty">No input devices found</p>
              ) : (
                audioDevices.map((device) => (
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
                    {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AudioControls;
