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
/* ── Source Selector — Nothing Design System ── */

.ac-source-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  flex-shrink: 0;
  min-width: 0;
}

.ac-source-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.ac-source-cluster {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

/* ── Segmented control — Nothing: outlined, inverted active ── */

.ac-source-tabs {
  --tab-file-width: 3.45rem;
  --tab-system-width: 4.9rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 2px;
  background: transparent;
  border: 1px solid #333333;
  border-radius: 4px;
  flex-shrink: 0;
  overflow: hidden;
}

/* Sliding highlight — Nothing: inverted white bg */
.ac-source-tab-slider {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: calc(2px + var(--slider-offset, 0rem));
  width: var(--slider-width, 3.5rem);
  border-radius: 2px;
  background: #FFFFFF;
  transition:
    left 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    width 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  pointer-events: none;
  will-change: left, width;
  z-index: 0;
}

.ac-source-tab {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  text-align: center;
  padding: 4px 0;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: #666666;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: color 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  line-height: 1.2;
}

.ac-source-tab--file {
  width: 3.45rem;
}

.ac-source-tab--system {
  width: 4.9rem;
}

.ac-source-tab--active {
  color: #000000;
}

.ac-source-tab:hover:not(.ac-source-tab--active) {
  color: #E8E8E8;
}

.ac-source-tab:focus-visible,
.ac-source-live-btn:focus-visible {
  outline: 2px solid #5B9BF6;
  outline-offset: 2px;
}

/* ── Go Live / Stop button — Nothing: outlined, accent-red when active ── */

.ac-source-live-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-width: 5.25rem;
  padding: 4px 12px;
  border: 1px solid #333333;
  border-radius: 999px;
  background: transparent;
  color: #999999;
  font-family: "Space Mono", monospace;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.ac-source-live-btn:hover {
  border-color: #E8E8E8;
  color: #E8E8E8;
}

.ac-source-live-btn:disabled {
  cursor: not-allowed;
  color: #666666;
  border-color: #222222;
  opacity: 0.4;
}

.ac-source-live-btn--active {
  border-color: #D71921;
  color: #D71921;
}

.ac-source-live-btn--active:hover {
  border-color: #ff453a;
  color: #ff453a;
}

.ac-source-live-btn:active {
  opacity: 0.8;
}

.ac-source-live-btn:disabled:active {
  opacity: 0.4;
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
  transition: opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.ac-source-live-btn-label--hidden {
  opacity: 0;
  pointer-events: none;
}

.ac-source-live-btn-measure {
  visibility: hidden;
  pointer-events: none;
}

.ac-source-compact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ac-source-compact-btn {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--nd-text-secondary, #999999);
  cursor: pointer;
  transition:
    border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    background 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.ac-source-compact-btn[data-active="true"] {
  background: var(--nd-text-display, #ffffff);
  color: var(--nd-black, #050505);
  border-color: var(--nd-text-display, #ffffff);
}

.ac-source-compact-btn[data-live="true"] {
  border-color: var(--nd-accent, #ff3b30);
  color: var(--nd-accent, #ff3b30);
}

.ac-source-compact-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ac-source-compact-btn svg {
  width: 16px;
  height: 16px;
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
    font-size: 10px;
  }

  .ac-source-tabs {
    --tab-file-width: 3.15rem;
    --tab-system-width: 4.3rem;
  }

  .ac-source-live-btn {
    min-width: 5rem;
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
    font-size: 10px;
  }

  .ac-source-tabs {
    --tab-file-width: 2.95rem;
    --tab-system-width: 4rem;
  }

  .ac-source-live-btn {
    min-width: 4.85rem;
    padding-left: 8px;
    padding-right: 8px;
  }
}

`;
  document.head.appendChild(el);
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 5.5h6l4 4V18a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 18V7A1.5 1.5 0 0 1 7.5 5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13 5.5V10h4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="6"
        width="16"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 19h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 16v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LiveDotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        d="M5.5 12a6.5 6.5 0 0 1 6.5-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M18.5 12A6.5 6.5 0 0 1 12 18.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * @param {{
 *   onInteraction?: (() => void) | undefined,
 *   showLiveButton?: boolean | undefined,
 *   allowSystemSource?: boolean | undefined,
 *   compactMode?: boolean | undefined,
 * }} props
 */
export function SourceSelector({
  onInteraction,
  showLiveButton = true,
  allowSystemSource = true,
  compactMode = false,
} = {}) {
  ensureStyles();
  const showSystemSource = allowSystemSource;

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

  if (compactMode) {
    return (
      <div className="ac-source-compact">
        <button
          className="ac-source-compact-btn"
          data-active={resolvedSource === "file" ? "true" : "false"}
          type="button"
          onClick={() => handleTabClick("file")}
          aria-label="Use file source"
          title="Use file source"
        >
          <FileIcon />
        </button>
        {showSystemSource ? (
          <button
            className="ac-source-compact-btn"
            data-active={resolvedSource === "system" ? "true" : "false"}
            data-live={isCurrentLive ? "true" : "false"}
            type="button"
            onClick={() => handleTabClick("system")}
            aria-label="Use system source"
            title="Use system source"
          >
            <SystemIcon />
          </button>
        ) : null}
        {showLiveButton && showSystemSource ? (
          <button
            className="ac-source-compact-btn"
            data-live={isCurrentLive ? "true" : "false"}
            type="button"
            disabled={liveStartDisabled}
            onClick={handleLiveButtonClick}
            aria-label={liveButtonActionLabel}
            title={liveButtonActionLabel}
          >
            <LiveDotIcon />
          </button>
        ) : null}
      </div>
    );
  }

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
