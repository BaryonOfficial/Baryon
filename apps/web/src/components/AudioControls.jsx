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

function LinkIcon() {
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
      <path d="M10 13a5 5 0 0 0 7.07 0l3.18-3.18a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L3.76 14.18a5 5 0 1 0 7.07 7.07L13 19" />
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
  max-width: calc(100vw - 1.5rem);
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

/* ── Volume ── */
.am-volume {
  display: flex;
  align-items: center;
  gap: 0.45rem;
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

.am-legal-wrap {
  display: none;
  position: relative;
}

.am-legal-details {
  position: relative;
}

.am-legal-summary {
  list-style: none;
  width: 30px;
  height: 30px;
  background: rgba(255, 255, 255, 0.07);
}

.am-legal-summary::-webkit-details-marker {
  display: none;
}

.am-legal-details[open] .am-legal-summary {
  background: rgba(255, 255, 255, 0.16);
}

.am-legal-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.6rem);
  display: grid;
  gap: 0.45rem;
  min-width: 8.5rem;
  padding: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.9rem;
  background: rgba(30, 30, 32, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.am-legal-link {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.48rem 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(8, 10, 14, 0.72);
  color: rgba(255, 255, 255, 0.92);
  font-family: var(--font-ubuntu), sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-decoration: none;
  text-transform: uppercase;
}

.am-legal-link:hover {
  border-color: rgba(255, 255, 255, 0.38);
  background: rgba(20, 24, 32, 0.84);
}

@media (max-width: 960px) {
  .am-player {
    gap: 0.25rem;
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
}

@media (max-width: 720px) {
  .am-player {
    bottom: 1rem;
    gap: 0.2rem;
    padding: 0.42rem 0.65rem;
  }

  .am-track {
    max-width: 120px;
  }

  .am-filename-wrap {
    max-width: 84px;
  }

  .am-divider {
    display: none;
  }

  .am-slider {
    width: 52px;
  }
}

@media (max-width: 1040px) {
  .am-legal-wrap {
    display: block;
  }
}
`;

// ─── Component ───────────────────────────────────────────────────────────────

function AudioControls() {
  const {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    showDeviceMenu,
    audioDevices,
    selectedDevice,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
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

        <div className="am-volume">
          <button
            className="am-btn am-btn--volume"
            onClick={handleMuteToggle}
            title={isMuted ? "Unmute output" : "Mute output"}
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
            aria-label="Volume"
            title={`Volume ${Math.round(volume * 100)}%`}
          />
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

        <div className="am-legal-wrap">
          <details className="am-legal-details">
            <summary
              className="am-btn am-legal-summary"
              aria-label="Licensing and source"
              title="Licensing and source"
            >
              <LinkIcon />
            </summary>
            <div className="am-legal-menu">
              <a
                className="am-legal-link"
                href="https://github.com/BaryonOfficial/Baryon"
                target="_blank"
                rel="noreferrer"
              >
                Source
              </a>
              <a
                className="am-legal-link"
                href="https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md"
                target="_blank"
                rel="noreferrer"
              >
                License
              </a>
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

export default AudioControls;
