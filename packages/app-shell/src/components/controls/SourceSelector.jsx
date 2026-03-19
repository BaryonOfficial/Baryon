import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAudio } from "../../context/AudioContext";

// Inject styles once into document head to avoid rendering a <style> tag
// as a flex item inside the player row.
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.textContent = `
.ac-source-selector {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  position: relative;
  flex-shrink: 0;
  min-width: 0;
}

.ac-source-cluster {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

/* ── Segmented control ─────────────────────────────────────── */

.ac-source-tabs {
  --tab-file-width: 3.45rem;
  --tab-system-width: 4.9rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0.16rem;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 9999px;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow:
    0 8px 18px rgba(0,0,0,0.16),
    inset 0 1px 0 rgba(255,255,255,0.08);
}

/* Sliding highlight — absolutely positioned so it never shifts layout */
.ac-source-tab-slider {
  position: absolute;
  top: 0.16rem;
  bottom: 0.16rem;
  left: calc(0.16rem + var(--slider-offset, 0rem));
  width: var(--slider-width, 3.5rem);
  border-radius: 9999px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.11));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    0 6px 12px rgba(0,0,0,0.16);
  transition:
    left 0.22s cubic-bezier(0.34, 1.0, 0.64, 1.0),
    width 0.18s ease,
    background 0.15s,
    box-shadow 0.15s;
  pointer-events: none;
  will-change: left, width;
  z-index: 0;
}

.ac-source-tab {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  text-align: center;
  padding: 0.3rem 0;
  border: none;
  border-radius: 9999px;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 0.67rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s ease;
  line-height: 1.4;
}

.ac-source-tab--file {
  width: 3.45rem;
}

.ac-source-tab--system {
  width: 4.9rem;
}

.ac-source-tab--active {
  color: rgba(255,255,255,0.95);
}

.ac-source-tab:hover:not(.ac-source-tab--active) {
  color: rgba(255,255,255,0.72);
}

.ac-source-tab:focus-visible,
.ac-source-live-btn:focus-visible,
.ac-source-device-select:focus-visible,
.ac-source-reclassify:focus-visible {
  outline: 2px solid rgba(122, 189, 255, 0.82);
  outline-offset: 2px;
}

/* ── Go Live / Stop button ─────────────────────────────────── */

.ac-source-live-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-width: 5.25rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 9999px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
  color: rgba(255,255,255,0.8);
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  box-shadow:
    0 8px 18px rgba(0,0,0,0.16),
    inset 0 1px 0 rgba(255,255,255,0.08);
  transition:
    background 0.14s ease,
    color 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease,
    transform 0.1s ease;
}

.ac-source-live-btn:hover {
  background:
    linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.06));
  color: rgba(255,255,255,0.96);
}

.ac-source-live-btn:disabled {
  cursor: not-allowed;
  color: rgba(255,255,255,0.42);
  border-color: rgba(255,255,255,0.08);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025));
  box-shadow:
    0 8px 18px rgba(0,0,0,0.12),
    inset 0 1px 0 rgba(255,255,255,0.05);
}

.ac-source-live-btn--active {
  background:
    linear-gradient(180deg, rgba(255, 91, 82, 0.32), rgba(255, 69, 58, 0.2));
  border-color: rgba(255, 69, 58, 0.4);
  color: #ff453a;
  box-shadow:
    0 12px 24px rgba(83,16,12,0.26),
    inset 0 1px 0 rgba(255,190,186,0.22);
}

.ac-source-live-btn--active:hover {
  background:
    linear-gradient(180deg, rgba(255, 91, 82, 0.4), rgba(255, 69, 58, 0.26));
}

.ac-source-live-btn:active {
  transform: scale(0.98);
}

.ac-source-live-btn:disabled:active {
  transform: none;
}

.ac-source-live-btn-content {
  display: inline-grid;
  align-items: center;
  justify-content: center;
  min-width: 3.95rem;
}

.ac-source-live-btn-labels {
  display: inline-grid;
  align-items: center;
  justify-items: center;
}

.ac-source-live-btn-label,
.ac-source-live-btn-measure {
  grid-area: 1 / 1;
  font: inherit;
  letter-spacing: inherit;
  white-space: nowrap;
}

.ac-source-live-btn-label {
  transition: opacity 0.12s ease;
}

.ac-source-live-btn-label--hidden {
  opacity: 0;
  pointer-events: none;
}

.ac-source-live-btn-measure {
  visibility: hidden;
  pointer-events: none;
}

/* ── Device / profile popover ──────────────────────────────── */

.ac-source-popover {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  z-index: 200;
  background: rgba(22, 22, 24, 0.96);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-width: 228px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
}

.ac-source-popover-header {
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
}

.ac-source-popover-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.ac-source-device-select {
  flex: 1;
  min-width: 0;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 7px;
  color: rgba(255,255,255,0.88);
  font-size: 0.69rem;
  font-family: inherit;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ac-source-device-select:focus {
  outline: none;
  border-color: rgba(255,255,255,0.28);
}

.ac-source-reclassify {
  background: none;
  border: none;
  color: rgba(255,255,255,0.28);
  font-size: 0.6rem;
  font-family: inherit;
  cursor: pointer;
  padding: 0.08rem 0.2rem;
  border-radius: 4px;
  flex-shrink: 0;
  white-space: nowrap;
  transition: color 0.12s;
}

.ac-source-reclassify:hover {
  color: rgba(255,255,255,0.55);
}

.ac-source-empty {
  color: rgba(255,255,255,0.35);
  font-size: 0.67rem;
  font-style: italic;
}

.ac-source-popover-label {
  font-size: 0.6rem;
  color: rgba(255,255,255,0.34);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.ac-source-popover-title {
  color: rgba(255,255,255,0.92);
  font-size: 0.78rem;
  font-weight: 600;
}

.ac-source-popover-copy {
  color: rgba(255,255,255,0.48);
  font-size: 0.68rem;
  line-height: 1.45;
}

.ac-source-popover-copy--locked {
  color: rgba(255, 176, 92, 0.96);
}

@media (max-width: 720px) {
  .ac-source-selector {
    min-width: 0;
    width: 100%;
    justify-content: flex-end;
  }

  .ac-source-cluster {
    min-width: 0;
    max-width: 100%;
  }

  .ac-source-tabs {
    min-width: 0;
    flex: 1 1 auto;
  }

  .ac-source-tab {
    font-size: 0.65rem;
  }

  .ac-source-tabs {
    --tab-file-width: 3.15rem;
    --tab-system-width: 4.3rem;
  }

  .ac-source-live-btn {
    min-width: 5rem;
  }
}

@media (max-width: 480px) {
  .ac-source-selector {
    justify-content: stretch;
  }

  .ac-source-cluster {
    width: 100%;
  }

  .ac-source-tabs {
    flex: 1 1 auto;
  }

  .ac-source-tab {
    font-size: 0.66rem;
  }

  .ac-source-tabs {
    --tab-file-width: 2.95rem;
    --tab-system-width: 4rem;
  }

  .ac-source-live-btn {
    min-width: 4.85rem;
    padding-left: 0.68rem;
    padding-right: 0.68rem;
  }
}

/* ── Inline live confirmation row ──────────────────────────── */

.ac-live-confirm-row {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  animation: ac-confirm-fadein 0.12s ease;
}

@keyframes ac-confirm-fadein {
  from { opacity: 0; transform: scale(0.93); }
  to   { opacity: 1; transform: scale(1); }
}

.ac-live-confirm-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s ease, transform 0.08s ease;
}

.ac-live-confirm-btn--start {
  background: linear-gradient(180deg, rgba(52,199,89,0.32), rgba(40,175,70,0.2));
  border: 1px solid rgba(52,199,89,0.45);
  color: #34c759;
  box-shadow: 0 8px 18px rgba(10,50,20,0.22), inset 0 1px 0 rgba(180,255,200,0.18);
}

.ac-live-confirm-btn--start:hover {
  background: linear-gradient(180deg, rgba(52,199,89,0.42), rgba(40,175,70,0.28));
}

.ac-live-confirm-btn--stop {
  background: linear-gradient(180deg, rgba(255,91,82,0.32), rgba(255,69,58,0.2));
  border: 1px solid rgba(255,69,58,0.45);
  color: #ff453a;
  box-shadow: 0 8px 18px rgba(83,16,12,0.22), inset 0 1px 0 rgba(255,190,186,0.18);
}

.ac-live-confirm-btn--stop:hover {
  background: linear-gradient(180deg, rgba(255,91,82,0.42), rgba(255,69,58,0.28));
}

.ac-live-confirm-btn:active { transform: scale(0.97); }

.ac-live-confirm-btn:focus-visible,
.ac-live-cancel-btn:focus-visible {
  outline: 2px solid rgba(122,189,255,0.82);
  outline-offset: 2px;
}

.ac-live-cancel-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: transparent;
  color: rgba(255,255,255,0.44);
  font-size: 0.66rem;
  font-weight: 550;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.1s ease, border-color 0.1s ease, transform 0.08s ease;
}

.ac-live-cancel-btn:hover {
  color: rgba(255,255,255,0.7);
  border-color: rgba(255,255,255,0.2);
}

.ac-live-cancel-btn:active { transform: scale(0.97); }
`;
  document.head.appendChild(el);
}

/**
 * @param {{
 *   onInteraction?: (() => void) | undefined,
 * }} props
 */
export function SourceSelector({ onInteraction } = {}) {
  ensureStyles();

  const {
    selectedSource,
    handleSourceChange,
    isLiveInputActive,
    liveInputKind,
    audioDevices,
    selectedDevice,
    handleSystemToggle,
    selectedSystemDevice,
    selectedLiveInputKind,
    setSelectedSystemDevice,
  } = useAudio();

  const [showPopover, setShowPopover] = useState(false);
  // null | 'start' | 'stop' | 'switch-to-file'
  const [pendingAction, setPendingAction] = useState(null);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  const resolvedSource = selectedSource === "file" ? "file" : "system";
  const isLiveSource = resolvedSource === "system";
  const isCurrentLive = isLiveInputActive && isLiveSource;
  const activeLiveLabel =
    liveInputKind === "system" ? "system input" : "live input";
  const tabMetrics = {
    file: { width: "var(--tab-file-width)", offset: "0rem" },
    system: {
      width: "var(--tab-system-width)",
      offset: "var(--tab-file-width)",
    },
  };
  const sliderMetrics = tabMetrics[resolvedSource] ?? tabMetrics.file;
  /** @type {import("react").CSSProperties & {
   *   "--slider-width": string,
   *   "--slider-offset": string,
   * }}
   */
  const tabStyle = {
    "--slider-width": sliderMetrics.width,
    "--slider-offset": sliderMetrics.offset,
  };
  const liveButtonActionLabel = !isLiveSource
    ? "Select System to go live"
    : isCurrentLive
      ? `Stop ${activeLiveLabel}`
      : "Start live input";
  const popoverTitle = "Live Input";
  const popoverCopy = isLiveInputActive
    ? "Stop live input to choose a different device."
    : selectedLiveInputKind === "system"
      ? "Choose the loopback device to route through file-style analysis."
      : "Choose the input device to route into the live view.";

  // Close popover on outside click
  useEffect(() => {
    if (resolvedSource === "file") {
      setShowPopover(false);
    }
  }, [resolvedSource]);

  useEffect(() => {
    if (!showPopover) return undefined;
    const handleDown = (e) => {
      if (
        popoverRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      )
        return;
      setShowPopover(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setShowPopover(false);
    };
    document.addEventListener("pointerdown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showPopover]);

  const liveDevices = audioDevices;
  const selectedLiveDeviceId = selectedSystemDevice ?? selectedDevice ?? "";

  const handleTabClick = useCallback(
    (source) => {
      onInteraction?.();
      if (source === "file") {
        if (isCurrentLive) {
          setPendingAction("switch-to-file");
          return;
        }
        handleSourceChange("file");
        setShowPopover(false);
        return;
      }
      if (resolvedSource !== source) {
        handleSourceChange(source);
        // Only auto-open device picker if no device has been configured yet
        if (!selectedLiveDeviceId || audioDevices.length === 0) {
          setShowPopover(true);
        }
        return;
      }
      setShowPopover((visible) => !visible);
    },
    [
      audioDevices.length,
      handleSourceChange,
      isCurrentLive,
      onInteraction,
      resolvedSource,
      selectedLiveDeviceId,
    ],
  );
  const handleLiveButtonClick = useCallback(() => {
    onInteraction?.();
    setPendingAction(isCurrentLive ? "stop" : "start");
  }, [isCurrentLive, onInteraction]);
  const handleConfirm = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    if (action === "start" || action === "stop") {
      void handleSystemToggle();
    } else if (action === "switch-to-file") {
      handleSourceChange("file");
      setShowPopover(false);
    }
  }, [pendingAction, handleSystemToggle, handleSourceChange]);
  const handleCancel = useCallback(() => setPendingAction(null), []);
  useEffect(() => {
    if (!pendingAction) return undefined;
    const t = setTimeout(() => setPendingAction(null), 3000);
    return () => clearTimeout(t);
  }, [pendingAction]);
  useEffect(() => {
    if (!pendingAction) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPendingAction(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pendingAction]);
  return (
    <div className="ac-source-selector" ref={triggerRef}>
      <div className="ac-source-cluster">
        {/* Segmented tab control with sliding highlight */}
        <div
          className="ac-source-tabs"
          data-testid="source-mode-pill"
          style={tabStyle}
        >
          {/* Absolutely-positioned slider — never affects container size */}
          <div className="ac-source-tab-slider" aria-hidden="true" />

          <button
            className={`ac-source-tab ac-source-tab--file${selectedSource === "file" ? " ac-source-tab--active" : ""}`}
            data-testid="file-source-tab"
            onClick={() => handleTabClick("file")}
            title="Use a file as audio source"
          >
            File
          </button>
          <button
            className={`ac-source-tab ac-source-tab--system${resolvedSource === "system" ? " ac-source-tab--active" : ""}`}
            data-testid="live-input-source-tab"
            onClick={() => handleTabClick("system")}
            title={
              isCurrentLive
                ? "Live input active — stop it to change the input"
                : "Use live input / loopback device"
            }
          >
            System
          </button>
        </div>

        {/* Device settings popover */}
        {showPopover && isLiveSource && (
          <div
            className="ac-source-popover"
            data-testid="source-settings-popover"
            ref={popoverRef}
          >
            <div className="ac-source-popover-header">
              <span className="ac-source-popover-label">Live Input</span>
              <span className="ac-source-popover-title">{popoverTitle}</span>
              <span
                className={`ac-source-popover-copy${
                  isLiveInputActive ? " ac-source-popover-copy--locked" : ""
                }`}
              >
                {popoverCopy}
              </span>
            </div>

            <div className="ac-source-popover-row">
              {liveDevices.length === 0 ? (
                <span className="ac-source-empty">
                  No audio input devices found
                </span>
              ) : (
                <select
                  className="ac-source-device-select"
                  data-testid="live-input-device-select"
                  value={selectedLiveDeviceId}
                  onChange={(e) => setSelectedSystemDevice(e.target.value)}
                  aria-label="Live input device"
                  disabled={isLiveInputActive}
                >
                  {liveDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Device ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Go Live / Live — shared toggle outside the segmented control */}
        {pendingAction ? (
          <div
            className="ac-live-confirm-row"
            role="group"
            aria-label="Confirm live action"
          >
            <button
              className={`ac-live-confirm-btn ac-live-confirm-btn--${pendingAction === "start" ? "start" : "stop"}`}
              onClick={handleConfirm}
              aria-label={
                pendingAction === "start"
                  ? "Confirm go live"
                  : pendingAction === "stop"
                    ? "Confirm stop live"
                    : "Confirm stop live and switch to file"
              }
              autoFocus
            >
              {pendingAction === "start"
                ? "Go Live?"
                : pendingAction === "stop"
                  ? "Stop?"
                  : "Stop & Switch?"}
            </button>
            <button
              className="ac-live-cancel-btn"
              onClick={handleCancel}
              aria-label="Cancel"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className={`ac-source-live-btn${isCurrentLive ? " ac-source-live-btn--active" : ""}`}
            data-testid="source-live-button"
            data-state={
              !isLiveSource ? "disabled" : isCurrentLive ? "live" : "idle"
            }
            disabled={!isLiveSource}
            onClick={handleLiveButtonClick}
            aria-label={liveButtonActionLabel}
            title={liveButtonActionLabel}
          >
            <span className="ac-source-live-btn-content">
              <span className="ac-source-live-btn-labels">
                <span
                  className={`ac-source-live-btn-label${
                    isCurrentLive ? " ac-source-live-btn-label--hidden" : ""
                  }`}
                >
                  Go Live
                </span>
                <span
                  className={`ac-source-live-btn-label${
                    isCurrentLive ? "" : " ac-source-live-btn-label--hidden"
                  }`}
                >
                  Live
                </span>
                <span className="ac-source-live-btn-measure">Go Live</span>
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
