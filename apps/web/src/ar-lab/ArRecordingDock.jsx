import { useState, useSyncExternalStore } from "react";
import {
  RECORDING_ASPECT_PRESETS,
  RECORDING_AUDIO_MODES,
  RECORDING_DURATION_SECONDS,
  RECORDING_STATES,
} from "./recordingSession.js";

const CSS = `
.arl-rail {
  position: absolute;
  left: max(1rem, env(safe-area-inset-left));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 22;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--nd-text-display);
  font-family: var(--baryon-type-interface-family);
  pointer-events: none;
}

.arl-rail__bar {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.32rem 0.46rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nd-surface-raised) 97%, #000),
    color-mix(in srgb, var(--nd-surface) 99%, #000)
  );
  box-shadow:
    0 0.6rem 2rem rgba(0, 0, 0, 0.42),
    inset 0 1px 0 color-mix(in srgb, var(--nd-text-display) 8%, transparent);
  pointer-events: auto;
}

.arl-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.05rem;
  height: 2.05rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 10%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 70%, #000);
  color: var(--nd-text-display);
  cursor: pointer;
  transition:
    transform var(--nd-transition, 180ms ease),
    border-color var(--nd-transition, 180ms ease),
    background var(--nd-transition, 180ms ease),
    color var(--nd-transition, 180ms ease),
    opacity var(--nd-transition, 180ms ease);
}

.arl-icon-btn svg { width: 0.94rem; height: 0.94rem; }

.arl-icon-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--nd-accent) 40%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 92%, #000);
  transform: translateY(-1px);
}

.arl-icon-btn:active:not(:disabled) { transform: translateY(0) scale(0.96); }

.arl-icon-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 55%, transparent);
}

.arl-icon-btn:disabled { cursor: not-allowed; opacity: 0.4; }

.arl-icon-btn--active {
  color: var(--nd-accent);
  border-color: color-mix(in srgb, var(--nd-accent) 40%, transparent);
  background: color-mix(in srgb, var(--nd-accent) 12%, #000);
}

/* ---- Record button ---------------------------------------------------- */

.arl-rec {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.78rem;
  height: 2.78rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: transform var(--nd-transition, 180ms cubic-bezier(0.22, 1, 0.36, 1));
}

.arl-rec:hover:not(:disabled) { transform: scale(1.04); }
.arl-rec:active:not(:disabled) { transform: scale(0.96); }
.arl-rec:disabled { cursor: not-allowed; opacity: 0.5; }
.arl-rec:focus-visible { outline: none; }
.arl-rec:focus-visible .arl-rec__track {
  stroke: color-mix(in srgb, var(--nd-accent) 70%, transparent);
}

.arl-rec__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.arl-rec__track {
  fill: none;
  stroke: color-mix(in srgb, var(--nd-text-display) 20%, transparent);
  stroke-width: 4.5;
}

.arl-rec--idle .arl-rec__track { stroke: color-mix(in srgb, var(--nd-danger, #c45824) 60%, transparent); }
.arl-rec--countdown .arl-rec__track { stroke: color-mix(in srgb, var(--nd-warning, var(--nd-accent)) 60%, transparent); }

.arl-rec__progress {
  fill: none;
  stroke: var(--nd-danger, #c45824);
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-dasharray: 289;
  stroke-dashoffset: 289;
}

.arl-rec--recording .arl-rec__progress {
  animation: arl-rec-progress linear forwards;
}

@keyframes arl-rec-progress {
  from { stroke-dashoffset: 289; }
  to { stroke-dashoffset: 0; }
}

.arl-rec__core {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--nd-danger, #c45824);
  box-shadow:
    0 0.2rem 0.7rem color-mix(in srgb, var(--nd-danger, #c45824) 45%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--nd-text-display) 18%, transparent);
  transition:
    width var(--nd-transition, 180ms ease),
    height var(--nd-transition, 180ms ease),
    border-radius var(--nd-transition, 180ms ease),
    background var(--nd-transition, 180ms ease);
}

.arl-rec--idle .arl-rec__core { width: 1.95rem; height: 1.95rem; }

.arl-rec--recording .arl-rec__core {
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 0.2rem;
}

.arl-rec--countdown .arl-rec__core {
  width: 1.95rem;
  height: 1.95rem;
  background: color-mix(in srgb, var(--nd-surface-raised) 92%, #000);
  border: 1px solid color-mix(in srgb, var(--nd-warning, var(--nd-accent)) 42%, transparent);
  box-shadow: none;
}

.arl-rec__count {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--nd-text-display);
}

.arl-rec__spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.78rem;
  height: 2.78rem;
  font-family: var(--baryon-type-mono-family);
  font-size: 0.48rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
}

/* ---- Settings sheet --------------------------------------------------- */

.arl-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.46rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nd-surface-raised) 98%, #000),
    color-mix(in srgb, var(--nd-surface) 99%, #000)
  );
  box-shadow: 0 0.6rem 2rem rgba(0, 0, 0, 0.42);
  pointer-events: auto;
  animation: arl-fade-up 200ms ease both;
}

@keyframes arl-fade-up {
  from { opacity: 0; transform: translateY(0.4rem); }
  to { opacity: 1; transform: translateY(0); }
}

.arl-seg {
  display: inline-flex;
  align-items: stretch;
  gap: 0.16rem;
  padding: 0.16rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 8%, transparent);
  background: color-mix(in srgb, var(--nd-surface) 92%, #000);
}

.arl-seg__btn {
  flex: 1 1 0;
  min-width: 2.6rem;
  padding: 0.3rem 0.55rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.64rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--nd-transition, 180ms ease),
    background var(--nd-transition, 180ms ease),
    border-color var(--nd-transition, 180ms ease);
}

.arl-seg__btn:hover:not(:disabled) {
  color: var(--nd-text-display);
  background: color-mix(in srgb, var(--nd-surface-raised) 72%, #000);
}

.arl-seg__btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 55%, transparent);
}

.arl-seg__btn--active {
  color: var(--nd-accent);
  border-color: color-mix(in srgb, var(--nd-accent) 42%, transparent);
  background: color-mix(in srgb, var(--nd-accent) 14%, #000);
}

.arl-seg__btn:disabled { cursor: not-allowed; opacity: 0.45; }

/* ---- Status ----------------------------------------------------------- */

.arl-rail__status {
  max-width: 18rem;
  padding: 0.34rem 0.58rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 8%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 96%, #000);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.6rem;
  line-height: 1.3;
  letter-spacing: 0.02em;
  text-align: center;
  color: var(--nd-text-secondary);
  pointer-events: auto;
}

.arl-rail__status--error {
  color: var(--nd-danger, #c45824);
  border-color: color-mix(in srgb, var(--nd-danger, #c45824) 30%, transparent);
}

/* ---- Preview modal ---------------------------------------------------- */

.arl-preview {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background: rgba(6, 4, 2, 0.82);
}

.arl-preview__card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  width: min(100%, 24rem);
  padding: 0.85rem;
  border-radius: 1.1rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--nd-surface-raised) 99%, #000),
    var(--nd-surface)
  );
  color: var(--nd-text-display);
  font-family: var(--baryon-type-interface-family);
  box-shadow: 0 1.2rem 3rem rgba(0, 0, 0, 0.5);
  animation: arl-fade-up 220ms ease both;
}

.arl-preview__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.arl-preview__heading { font-size: 0.92rem; font-weight: 600; letter-spacing: -0.01em; }

.arl-preview__badge {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
}

.arl-preview__video {
  width: 100%;
  max-height: 55vh;
  border-radius: 0.7rem;
  background: #000;
}

.arl-preview__notice {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.62rem;
  line-height: 1.35;
  color: var(--nd-text-secondary);
}

.arl-preview__actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }

.arl-preview__btn {
  flex: 1 1 auto;
  min-height: 2.3rem;
  padding: 0.5rem 0.9rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 80%, #000);
  color: var(--nd-text-display);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition:
    transform var(--nd-transition, 180ms ease),
    border-color var(--nd-transition, 180ms ease),
    background var(--nd-transition, 180ms ease);
}

.arl-preview__btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--nd-accent) 40%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 96%, #000);
}

.arl-preview__btn--primary {
  border-color: color-mix(in srgb, var(--nd-accent) 52%, transparent);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--nd-accent) 34%, #000),
    color-mix(in srgb, var(--nd-accent) 14%, #000)
  );
  color: var(--nd-accent);
}

@media (max-width: 26rem) {
  .arl-rail__bar { gap: 0.38rem; padding: 0.3rem 0.42rem; }
  .arl-icon-btn { width: 1.96rem; height: 1.96rem; }
}
`;

const AUDIO_MODE_NOTICES = Object.freeze({
  [RECORDING_AUDIO_MODES.included]: "Audio is captured in this clip.",
  [RECORDING_AUDIO_MODES.videoOnly]:
    "Video only — no app audio is playing.",
  [RECORDING_AUDIO_MODES.systemRecordingRecommended]:
    "Live input audio could not be captured in this clip.",
});

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.1" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.1" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.5v2m0 13v2M4.6 7.2l1.7 1m11.4 6.6 1.7 1M4.6 16.8l1.7-1m11.4-6.6 1.7-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * @param {{
 *   options: readonly (string | number)[],
 *   selected: string | number,
 *   format: (option: string | number) => string,
 *   onSelect: (option: string | number) => void,
 *   disabled?: boolean,
 *   ariaLabel: string,
 * }} props
 */
function SegmentedControl({
  options,
  selected,
  format,
  onSelect,
  disabled = false,
  ariaLabel,
}) {
  return (
    <div className="arl-seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option === selected;
        return (
          <button
            key={String(option)}
            type="button"
            disabled={disabled}
            className={`arl-seg__btn${isActive ? " arl-seg__btn--active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onSelect(option)}
          >
            {format(option)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bottom control rail for camera hand-tracking capture: a camera-grade record
 * control with a live progress ring, an aspect/duration settings sheet, and the
 * recorded-clip preview. All actions route through the recording controller,
 * which owns the capture pipeline.
 *
 * @param {{
 *   controller: ReturnType<typeof import("./recordingController.js").createRecordingController>,
 *   audio?: { isPlaying: boolean, isLoaded: boolean, onToggle: () => void | Promise<void> } | null,
 * }} props
 */
export default function ArRecordingDock({ controller, audio = null }) {
  const recording = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  const busy =
    recording.state === RECORDING_STATES.countdown ||
    recording.state === RECORDING_STATES.recording ||
    recording.state === RECORDING_STATES.processing;

  const handleDownload = () => {
    const payload = controller.download();
    if (!payload) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = payload.objectUrl;
    anchor.download = payload.filename;
    anchor.click();
  };

  const recClassName = [
    "arl-rec",
    recording.state === RECORDING_STATES.countdown
      ? "arl-rec--countdown"
      : recording.state === RECORDING_STATES.recording
        ? "arl-rec--recording"
        : "arl-rec--idle",
  ].join(" ");

  const ring = (
    <svg className="arl-rec__ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="arl-rec__track" cx="50" cy="50" r="46" />
      {recording.state === RECORDING_STATES.recording ? (
        <circle
          className="arl-rec__progress"
          cx="50"
          cy="50"
          r="46"
          style={{ animationDuration: `${recording.durationSeconds}s` }}
        />
      ) : null}
    </svg>
  );

  let recordButton;
  if (recording.state === RECORDING_STATES.processing) {
    recordButton = <span className="arl-rec__spinner">Saving…</span>;
  } else if (recording.state === RECORDING_STATES.countdown) {
    recordButton = (
      <button
        type="button"
        className={recClassName}
        aria-label={`Starting in ${recording.countdownRemainingSeconds} seconds. Tap to cancel.`}
        onClick={() => controller.stopRecording()}
      >
        {ring}
        <span className="arl-rec__core">
          <span className="arl-rec__count">
            {recording.countdownRemainingSeconds}
          </span>
        </span>
      </button>
    );
  } else if (recording.state === RECORDING_STATES.recording) {
    recordButton = (
      <button
        type="button"
        data-testid="ar-recording-stop"
        className={recClassName}
        aria-label="Stop recording"
        onClick={() => controller.stopRecording()}
      >
        {ring}
        <span className="arl-rec__core" aria-hidden="true" />
      </button>
    );
  } else {
    recordButton = (
      <button
        type="button"
        data-testid="ar-recording-start"
        className={recClassName}
        aria-label="Start recording"
        onClick={() => controller.startRecording()}
      >
        {ring}
        <span className="arl-rec__core" aria-hidden="true" />
      </button>
    );
  }

  const statusText =
    recording.state === RECORDING_STATES.recording
      ? AUDIO_MODE_NOTICES[recording.audioMode]
      : null;

  return (
    <>
      <style>{CSS}</style>
      <div className="arl-rail" data-testid="ar-recording-dock">
        {settingsOpen && !busy ? (
          <div className="arl-sheet" role="group" aria-label="Recording settings">
            <SegmentedControl
              ariaLabel="Aspect ratio"
              options={RECORDING_ASPECT_PRESETS}
              selected={recording.preset}
              format={(preset) => String(preset)}
              onSelect={(preset) => controller.setPreset(preset)}
              disabled={busy}
            />
            <SegmentedControl
              ariaLabel="Clip length"
              options={RECORDING_DURATION_SECONDS}
              selected={recording.durationSeconds}
              format={(seconds) => `${seconds}s`}
              onSelect={(seconds) => controller.setDurationSeconds(seconds)}
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="arl-rail__bar">
          {audio ? (
            <button
              type="button"
              className="arl-icon-btn"
              disabled={!audio.isLoaded}
              aria-label={audio.isPlaying ? "Pause audio" : "Play audio"}
              onClick={() => void audio.onToggle()}
            >
              {audio.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
          ) : null}

          {recordButton}

          <button
            type="button"
            className={`arl-icon-btn${settingsOpen ? " arl-icon-btn--active" : ""}`}
            disabled={busy}
            aria-label="Recording settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <GearIcon />
          </button>
        </div>

        {statusText ? <div className="arl-rail__status">{statusText}</div> : null}

        {recording.state === RECORDING_STATES.failed ? (
          <div
            className="arl-rail__status arl-rail__status--error"
            data-testid="ar-recording-error"
          >
            Recording failed ({recording.errorCode}). Your browser or operating
            system recorder is a reliable fallback.
          </div>
        ) : null}
      </div>

      {recording.state === RECORDING_STATES.preview && recording.objectUrl ? (
        <div className="arl-preview" data-testid="ar-recording-preview">
          <div className="arl-preview__card">
            <div className="arl-preview__title">
              <span className="arl-preview__heading">Your clip</span>
              <span className="arl-preview__badge">
                {recording.preset} · {recording.durationSeconds}s
              </span>
            </div>
            <span className="arl-preview__notice">
              {AUDIO_MODE_NOTICES[recording.audioMode]}
            </span>
            <video
              className="arl-preview__video"
              src={recording.objectUrl}
              controls
              playsInline
              loop
              autoPlay
              muted={recording.audioMode !== RECORDING_AUDIO_MODES.included}
            />
            <div className="arl-preview__actions">
              <button
                type="button"
                className="arl-preview__btn arl-preview__btn--primary"
                data-testid="ar-recording-download"
                onClick={handleDownload}
              >
                Download
              </button>
              <button
                type="button"
                className="arl-preview__btn"
                onClick={() => controller.discardPreview()}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
