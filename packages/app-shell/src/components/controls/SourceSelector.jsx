import React, { useCallback } from "react";
import { AUDIO_SOURCE_KINDS } from "@baryon/engine/audio";
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
/* Source selector — Bebop XR HUD control */

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
  gap: 6px;
  min-width: 0;
}

/* Segmented control with an amber/cream stage highlight */

.ac-source-tabs {
  --tab-file-width: 2.86rem;
  --tab-system-width: 4rem;
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 2px;
  background: transparent;
  border: none;
  border-radius: var(--baryon-source-selector-segment-radius);
  flex-shrink: 0;
  overflow: hidden;
  min-height: var(--baryon-source-selector-inner-min-height);
}

.ac-source-tab-slider {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: calc(2px + var(--slider-offset, 0rem));
  width: var(--slider-width, 3.5rem);
  box-sizing: border-box;
  border-radius: var(--baryon-source-selector-segment-radius);
  border: 1px solid var(--nd-border-visible);
  background: var(--nd-surface-raised);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  text-align: center;
  min-height: var(--baryon-source-selector-inner-min-height);
  padding: 0;
  border: none;
  border-radius: var(--baryon-source-selector-segment-radius);
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: var(--baryon-type-control-letter-spacing);
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition: color 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
  line-height: 1.2;
}

.ac-source-tab--file {
  width: var(--tab-file-width);
}

.ac-source-tab--system {
  width: var(--tab-system-width);
}

.ac-source-tab--active {
  color: var(--nd-accent);
}

.ac-source-tab:hover:not(.ac-source-tab--active) {
  color: var(--nd-text-primary);
}

.ac-source-tab:focus-visible,
.ac-source-live-btn:focus-visible {
  outline: 2px solid var(--baryon-resonance);
  outline-offset: 2px;
}

/* Go Live / Stop button — amber carries live action */

.ac-source-live-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-width: 5.25rem;
  min-height: var(--baryon-source-selector-inner-min-height);
  padding: 4px 12px;
  border: 1px solid var(--nd-border-visible);
  border-radius: var(--baryon-source-selector-radius);
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: var(--baryon-type-control-letter-spacing);
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition:
    border-color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    color 200ms cubic-bezier(0.25, 0.1, 0.25, 1),
    opacity 200ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.ac-source-live-btn:hover {
  border-color: var(--nd-text-primary);
  color: var(--nd-text-primary);
}

.ac-source-live-btn:disabled {
  cursor: not-allowed;
  color: var(--nd-text-disabled);
  border-color: var(--nd-border);
  opacity: 0.4;
}

.ac-source-live-btn--active {
  border-color: var(--baryon-amber);
  color: var(--baryon-amber);
}

.ac-source-live-btn--active:hover {
  border-color: #F5B47A;
  color: #F5B47A;
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

@media (max-width: 720px) {
  .ac-source-selector {
    min-width: 0;
    width: auto;
    justify-content: flex-start;
  }

  .ac-source-cluster {
    min-width: 0;
    max-width: 100%;
  }

  .ac-source-tabs {
    min-width: 0;
    flex: 0 0 auto;
  }

  .ac-source-tabs {
    --tab-file-width: 2.68rem;
    --tab-system-width: 3.64rem;
  }

  .ac-source-live-btn {
    min-width: 5rem;
  }

}

@media (max-width: 480px) {
  .ac-source-selector {
    justify-content: flex-start;
  }

  .ac-source-cluster {
    width: auto;
  }

  .ac-source-tabs {
    flex: 0 0 auto;
  }

  .ac-source-tabs {
    --tab-file-width: 2.56rem;
    --tab-system-width: 3.42rem;
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
  const showSystemSource = allowSystemSource;

  const {
    platform,
    sourceSession,
    handleSourceChange,
    isLiveInputActive,
    liveInputDeviceKind,
    liveInputPermissionState,
    handleSystemToggle,
    liveInputRuntimeStatus,
  } = useAudio();

  const isWebPlatform = platform === "web";

  const resolvedSource =
    !showSystemSource || sourceSession.kind === AUDIO_SOURCE_KINDS.file
      ? AUDIO_SOURCE_KINDS.file
      : AUDIO_SOURCE_KINDS.system;
  const isLiveSource = resolvedSource === AUDIO_SOURCE_KINDS.system;
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
              className={`ac-source-tab ac-source-tab--file${resolvedSource === "file" ? " ac-source-tab--active" : ""}`}
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
              data-testid="source-selector-live-button"
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
