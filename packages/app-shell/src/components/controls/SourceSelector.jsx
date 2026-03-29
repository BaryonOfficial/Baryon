import React, { useCallback } from "react";
import { useAudio } from "../../context/AudioContext";
import { isLiveInputTransitionLocked } from "../../context/liveInputRuntimeStatus.js";

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

.ac-source-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
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
.ac-source-live-btn:focus-visible {
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

`;
  document.head.appendChild(el);
}

/**
 * @param {{
 *   onInteraction?: (() => void) | undefined,
 *   showLiveButton?: boolean | undefined,
 *   allowSystemSource?: boolean | undefined,
 * }} props
 */
export function SourceSelector({
  onInteraction,
  showLiveButton = true,
  allowSystemSource = true,
} = {}) {
  ensureStyles();
  const showSystemSource = allowSystemSource && showLiveButton !== false;

  const {
    platform,
    selectedSource,
    handleSourceChange,
    isLiveInputActive,
    liveInputDeviceKind,
    liveInputPermissionState,
    handleSystemToggle,
    liveInputRuntimeStatus,
  } = useAudio();

  const isWebPlatform = platform === "web";

  const resolvedSource =
    !showSystemSource || selectedSource === "file" ? "file" : "system";
  const isLiveSource = resolvedSource === "system";
  const isCurrentLive = isLiveInputActive && isLiveSource;
  const activeLiveLabel =
    liveInputDeviceKind === "system" ? "system input" : "live input";
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
  const liveButtonActionLabel = !showSystemSource
    ? "Live input unavailable"
    : !isLiveSource
      ? "Select System to go live"
      : isCurrentLive
        ? `Stop ${activeLiveLabel}`
        : "Start live input";
  const transitionLocked = isLiveInputTransitionLocked(liveInputRuntimeStatus);
  const permissionGranted = liveInputPermissionState === "granted";
  const liveStartDisabled =
    !showSystemSource ||
    !isLiveSource ||
    transitionLocked ||
    (isWebPlatform && !isCurrentLive && !permissionGranted);

  const handleTabClick = useCallback(
    (source) => {
      onInteraction?.();
      if (source === "file") {
        void handleSourceChange("file");
        return;
      }
      void handleSourceChange(source);
    },
    [handleSourceChange, onInteraction],
  );
  const handleLiveButtonClick = useCallback(() => {
    onInteraction?.();
    void handleSystemToggle();
  }, [handleSystemToggle, onInteraction]);
  return (
    <div className="ac-source-selector">
      <div className="ac-source-stack">
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
            {showSystemSource ? (
              <button
                className={`ac-source-tab ac-source-tab--system${resolvedSource === "system" ? " ac-source-tab--active" : ""}`}
                data-testid="live-input-source-tab"
                onClick={() => handleTabClick("system")}
                title={
                  isCurrentLive
                    ? "Live input active"
                    : "Use live input / loopback device"
                }
              >
                System
              </button>
            ) : null}
          </div>

          {showLiveButton && showSystemSource ? (
            <button
              className={`ac-source-live-btn${isCurrentLive ? " ac-source-live-btn--active" : ""}`}
              data-testid="source-live-button"
              data-state={
                !isLiveSource ? "disabled" : isCurrentLive ? "live" : "idle"
              }
              disabled={liveStartDisabled}
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
