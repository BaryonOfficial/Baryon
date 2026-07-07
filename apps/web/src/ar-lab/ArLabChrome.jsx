import { useEffect, useState } from "react";
import { CAMERA_HAND_TRACKING_STATUS } from "./cameraHandTrackingStatus.js";
import ArLabMarkIcon from "./ArLabMarkIcon.jsx";

const CSS = `
.arl-chrome {
  position: absolute;
  inset: 0;
  z-index: 20;
  color: var(--nd-text-display);
  font-family: var(--baryon-type-interface-family);
  pointer-events: none;
}

/* Keep default WebXR helper buttons hidden while our XR entry is verification-gated. */
#XRButton,
#ARButton {
  display: none !important;
}

.arl-chrome__topbar {
  position: absolute;
  top: max(0.9rem, env(safe-area-inset-top));
  left: max(0.9rem, env(safe-area-inset-left));
  right: max(0.9rem, env(safe-area-inset-right));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.arl-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--nd-accent);
  pointer-events: none;
}

.arl-brand__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.arl-brand__mark svg {
  width: 1.6rem;
  height: 1.6rem;
}

.arl-brand__label {
  font-family: var(--baryon-type-interface-family);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  color: var(--nd-text-display);
}

.arl-topbar__right {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  pointer-events: auto;
}

.arl-exit {
  display: inline-flex;
  align-items: center;
  height: 2.3rem;
  padding: 0.3rem 0.2rem;
  border-radius: 999px;
  color: #fff;
  text-decoration: none;
  transition: color var(--nd-transition, 180ms ease);
}

.arl-exit__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex: 0 0 auto;
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}

.arl-exit__mark svg {
  width: 1.35rem;
  height: auto;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55));
}

.arl-exit__label {
  display: inline-flex;
  align-items: center;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  color: #fff;
  font-family: var(--baryon-type-display-family);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition:
    max-width 320ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease,
    margin-left 320ms cubic-bezier(0.22, 1, 0.36, 1),
    padding-right 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.arl-exit:hover,
.arl-exit:focus-visible {
  outline: none;
  color: #fff;
}

.arl-exit:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 55%, transparent);
}

.arl-exit:hover .arl-exit__mark,
.arl-exit:focus-visible .arl-exit__mark {
  transform: translateX(-2px);
}

.arl-exit:hover .arl-exit__label,
.arl-exit:focus-visible .arl-exit__label {
  max-width: 7rem;
  opacity: 1;
  margin-left: 0.34rem;
  padding-right: 0.34rem;
}

.arl-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.34rem 0.7rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 96%, #000);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
  white-space: nowrap;
}

.arl-pill__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--nd-text-secondary);
  flex: 0 0 auto;
}

.arl-pill--live {
  color: var(--nd-accent);
  border-color: color-mix(in srgb, var(--nd-accent) 34%, transparent);
}

.arl-pill--live .arl-pill__dot {
  background: var(--nd-accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--nd-accent) 55%, transparent);
  animation: arl-pulse 1.8s ease-in-out infinite;
}

.arl-pill--warn {
  color: var(--nd-warning, var(--nd-accent));
  border-color: color-mix(in srgb, var(--nd-warning, var(--nd-accent)) 28%, transparent);
}

.arl-pill--error {
  color: var(--nd-danger, #c45824);
  border-color: color-mix(in srgb, var(--nd-danger, #c45824) 34%, transparent);
}

.arl-pill--error .arl-pill__dot {
  background: var(--nd-danger, #c45824);
}

@keyframes arl-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--nd-accent) 50%, transparent); }
  50% { box-shadow: 0 0 0 0.32rem color-mix(in srgb, var(--nd-accent) 0%, transparent); }
}

.arl-segment {
  display: inline-flex;
  align-items: center;
  gap: 0.12rem;
  height: 2.3rem;
  padding: 0.16rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 10%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 86%, #000);
}

.arl-segment__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.2rem;
  height: 1.86rem;
  padding: 0 0.58rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
}

.arl-segment__button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--nd-accent) 18%, #000);
  color: var(--nd-accent);
}

.arl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  min-height: 2.3rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 12%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 92%, #000);
  color: var(--nd-text-display);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition:
    transform var(--nd-transition, 180ms cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--nd-transition, 180ms ease),
    background var(--nd-transition, 180ms ease),
    box-shadow var(--nd-transition, 180ms ease),
    opacity var(--nd-transition, 180ms ease);
}

.arl-btn svg { width: 1rem; height: 1rem; flex: 0 0 auto; }

.arl-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--nd-accent) 40%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 100%, #000);
}

.arl-btn:active:not(:disabled) { transform: translateY(0) scale(0.985); }

.arl-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 55%, transparent);
}

.arl-btn:disabled { cursor: not-allowed; opacity: 0.42; transform: none; }

.arl-btn--primary {
  border-color: color-mix(in srgb, var(--nd-accent) 52%, transparent);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--nd-accent) 34%, #000),
    color-mix(in srgb, var(--nd-accent) 14%, #000)
  );
  color: var(--nd-accent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--nd-accent) 22%, transparent);
}

.arl-btn--primary:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--nd-accent) 68%, transparent);
  background: linear-gradient(
    150deg,
    color-mix(in srgb, var(--nd-accent) 44%, #000),
    color-mix(in srgb, var(--nd-accent) 20%, #000)
  );
}

.arl-btn--ghost {
  min-height: 2.1rem;
  padding: 0.44rem 0.85rem;
  font-size: 0.78rem;
  color: var(--nd-text-secondary);
}

.arl-btn--ghost:hover:not(:disabled) { color: var(--nd-text-display); }

.arl-btn--icon {
  padding: 0.44rem;
  min-width: 2.1rem;
}

.arl-btn--icon svg { width: 1.1rem; height: 1.1rem; }

/* ---- Landing console -------------------------------------------------- */

.arl-console {
  position: absolute;
  left: 50%;
  bottom: max(1.2rem, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(46rem, calc(100vw - 1.6rem));
  pointer-events: auto;
  animation: arl-rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes arl-rise {
  from { opacity: 0; transform: translate(-50%, 0.8rem); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

.arl-modes {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
  max-width: 23rem;
  margin: 0 auto;
}

.arl-modes--with-xr {
  grid-template-columns: 1fr 1fr;
  max-width: none;
}

.arl-mode {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.85rem 0.9rem 0.9rem;
  border-radius: 1rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 10%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 55%, #000);
  min-width: 0;
}

.arl-mode--recommended {
  border-color: color-mix(in srgb, var(--nd-accent) 30%, transparent);
  background: color-mix(in srgb, var(--nd-accent) 8%, #120c07);
}

.arl-mode__head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.arl-mode__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 10%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 90%, #000);
  color: var(--nd-accent);
  flex: 0 0 auto;
}

.arl-mode__icon svg { width: 1.15rem; height: 1.15rem; }

.arl-mode__titles { display: flex; flex-direction: column; gap: 0.12rem; min-width: 0; }

.arl-mode__name {
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.arl-mode__tag {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.56rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
}

.arl-mode__desc {
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--nd-text-secondary);
  flex: 1 1 auto;
}

.arl-mode__cta { display: flex; flex-direction: column; gap: 0.4rem; }

.arl-mode__cta .arl-btn { width: 100%; }

.arl-mode__note {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.62rem;
  line-height: 1.35;
  color: var(--nd-text-secondary);
}

.arl-mode__note--error { color: var(--nd-danger, #c45824); }

/* ---- Active-mode hint ------------------------------------------------- */

.arl-hint {
  position: absolute;
  left: 50%;
  /* Sit above the bottom control stack (~18rem tall: player card + dock) so the
     hint never overlaps the playback bar on landing. */
  bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 18.5rem);
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(17rem, calc(100vw - 1.6rem));
  padding: 0.55rem 0.9rem;
  border-radius: 1.1rem;
  border: 1px solid color-mix(in srgb, var(--nd-text-display) 10%, transparent);
  background: color-mix(in srgb, var(--nd-surface-raised) 96%, #000);
  color: var(--nd-text-secondary);
  font-size: 0.76rem;
  line-height: 1.3;
  text-align: center;
  box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
  pointer-events: none;
  animation: arl-fade 320ms ease both;
}

.arl-hint svg { width: 1rem; height: 1rem; color: var(--nd-accent); flex: 0 0 auto; }
.arl-hint__copy {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

@keyframes arl-fade { from { opacity: 0; } to { opacity: 1; } }

@media (max-width: 40rem) {
  .arl-modes { grid-template-columns: 1fr; }
}
`;

const SHOW_XR_ENTRY = false;

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l.9-1.5h6.8l.9 1.5h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 10.5A2.5 2.5 0 0 1 6 8h12a2.5 2.5 0 0 1 2.5 2.5v3.2a1.8 1.8 0 0 1-1.8 1.8h-2.1c-.6 0-1.15-.3-1.48-.8l-.86-1.3a1.5 1.5 0 0 0-2.5 0l-.86 1.3c-.33.5-.88.8-1.48.8H5.3a1.8 1.8 0 0 1-1.8-1.8v-3.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 11V5.6a1.3 1.3 0 0 1 2.6 0V10m0 0V4.4a1.3 1.3 0 0 1 2.6 0V10m0 0V5.6a1.3 1.3 0 0 1 2.6 0V12c0 3.6-2.2 6.5-5.7 6.5-2 0-3.3-.8-4.4-2.3l-2.2-3a1.3 1.3 0 0 1 2-1.7l1.3 1.3V6.9a1.3 1.3 0 0 1 2.6 0V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </svg>
  );
}

const CAMERA_STATUS_LABELS = Object.freeze({
  [CAMERA_HAND_TRACKING_STATUS.requestingCamera]: {
    text: "Requesting camera…",
    tone: "warn",
  },
  [CAMERA_HAND_TRACKING_STATUS.loadingModel]: {
    text: "Loading hand model…",
    tone: "warn",
  },
  [CAMERA_HAND_TRACKING_STATUS.ready]: {
    text: "Show your palm",
    tone: "live",
  },
  [CAMERA_HAND_TRACKING_STATUS.tracking]: {
    text: "Tracking hands",
    tone: "live",
  },
});

function StatusPill({ tone, dot = true, children }) {
  const className = [
    "arl-pill",
    tone === "live" ? "arl-pill--live" : "",
    tone === "warn" ? "arl-pill--warn" : "",
    tone === "error" ? "arl-pill--error" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className}>
      {dot ? <span className="arl-pill__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

function BaryonMark() {
  return (
    <svg viewBox="0 0 2391 2048" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2390.21 12.3847C1900.43 88.9979 1525.73 512.757 1525.73 1024.03C1525.73 1535.24 1900.33 1958.95 2390 2035.65C2338.02 2043.78 2284.74 2048 2230.48 2048C1664.94 2048 1206.48 1589.54 1206.48 1024C1206.48 458.46 1664.94 0 2230.48 0C2284.81 0 2338.16 4.23213 2390.21 12.3847Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0.00012207 12.3847C489.774 88.9979 864.476 512.757 864.476 1024.03C864.476 1535.24 489.88 1958.95 0.207764 2035.65C52.1899 2043.78 105.468 2048 159.732 2048C725.272 2048 1183.73 1589.54 1183.73 1024C1183.73 458.46 725.272 0 159.732 0C105.396 0 52.048 4.23213 0.00012207 12.3847Z"
      />
    </svg>
  );
}

export function ArLabBrand() {
  return (
    <div className="arl-brand" role="img" aria-label="Baryon AR Lab">
      <span className="arl-brand__mark" aria-hidden="true">
        <ArLabMarkIcon />
      </span>
      <span className="arl-brand__label">AR</span>
    </div>
  );
}

/**
 * DOM overlay chrome for the AR Lab. Renders a landing "console" that offers
 * the verified Camera path. The Immersive XR entry is intentionally hidden
 * until headset verification resumes, but the enter path stays wired behind
 * `SHOW_XR_ENTRY`. All panels use solid backgrounds: backdrop-filter over the
 * live WebGPU canvas forces a swapchain readback and stalls rendering.
 *
 * @param {{
 *   mode: "none" | "camera" | "xr",
 *   canUseCamera: boolean,
 *   canEnterAr: boolean,
 *   cameraApiAvailable: boolean,
 *   cameraStatus: { phase: string, error: string | null },
 *   showBrand?: boolean,
 *   cameraBackgroundMode?: "none" | "preset" | "custom",
 *   hasCustomCameraBackground?: boolean,
 *   onStartCamera: () => void,
 *   onEnterAr: () => void | Promise<void>,
 *   onExit: () => void,
 *   onCameraBackgroundModeChange?: (mode: "none" | "preset" | "custom") => void,
 *   onUploadCameraBackground?: () => void,
 * }} props
 */
export default function ArLabChrome({
  mode,
  canUseCamera,
  canEnterAr,
  cameraApiAvailable,
  cameraStatus,
  showBrand = true,
  cameraBackgroundMode = "none",
  hasCustomCameraBackground = false,
  onStartCamera,
  onEnterAr,
  onExit,
  onCameraBackgroundModeChange = () => {},
  onUploadCameraBackground = () => {},
}) {
  const [enterError, setEnterError] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    if (mode === "none") {
      setHintDismissed(false);
      return undefined;
    }
    const handle = setTimeout(() => setHintDismissed(true), 6500);
    return () => clearTimeout(handle);
  }, [mode]);

  const handleEnterAr = async () => {
    if (!canEnterAr) {
      return;
    }
    setEnterError(null);
    try {
      await onEnterAr();
    } catch (error) {
      setEnterError(error instanceof Error ? error.message : String(error));
    }
  };

  const isActive = mode !== "none";
  const cameraLive =
    cameraStatus.phase === CAMERA_HAND_TRACKING_STATUS.ready ||
    cameraStatus.phase === CAMERA_HAND_TRACKING_STATUS.tracking;

  return (
    <>
      <style>{CSS}</style>
      <div className="arl-chrome" data-mode={mode}>
        <div className="arl-chrome__topbar">
          {showBrand ? <ArLabBrand /> : <span aria-hidden="true" />}

          <div className="arl-topbar__right">
            {mode === "camera" ? (
              cameraStatus.phase === CAMERA_HAND_TRACKING_STATUS.error ? (
                <StatusPill tone="error">Camera error</StatusPill>
              ) : (
                <StatusPill tone={cameraLive ? "live" : "warn"}>
                  {CAMERA_STATUS_LABELS[cameraStatus.phase]?.text ?? "Camera"}
                </StatusPill>
              )
            ) : null}
            {mode === "xr" ? <StatusPill tone="live">Immersive XR</StatusPill> : null}

            {mode === "camera" ? (
              <div className="arl-segment" role="group" aria-label="Camera background">
                <button
                  type="button"
                  className="arl-segment__button"
                  aria-pressed={cameraBackgroundMode === "none"}
                  data-testid="ar-lab-background-room"
                  onClick={() => onCameraBackgroundModeChange("none")}
                >
                  Room
                </button>
                <button
                  type="button"
                  className="arl-segment__button"
                  aria-pressed={cameraBackgroundMode === "preset"}
                  data-testid="ar-lab-background-preset"
                  onClick={() => onCameraBackgroundModeChange("preset")}
                >
                  Baryon
                </button>
                <button
                  type="button"
                  className="arl-segment__button"
                  aria-pressed={cameraBackgroundMode === "custom"}
                  data-testid="ar-lab-background-custom"
                  title={
                    hasCustomCameraBackground
                      ? "Use custom background"
                      : "Upload custom background"
                  }
                  onClick={() => onCameraBackgroundModeChange("custom")}
                >
                  Custom
                </button>
              </div>
            ) : null}

            {mode === "camera" ? (
              <button
                type="button"
                className="arl-btn arl-btn--ghost arl-btn--icon"
                aria-label="Upload custom background"
                title="Upload custom background"
                data-testid="ar-lab-background-upload"
                onClick={onUploadCameraBackground}
              >
                <UploadIcon />
              </button>
            ) : null}

            {isActive ? (
              <button type="button" className="arl-btn arl-btn--ghost" onClick={onExit}>
                {mode === "xr" ? "Exit XR" : "Stop"}
              </button>
            ) : (
              <a className="arl-exit" href="/" aria-label="Back to Baryon">
                <span className="arl-exit__mark" aria-hidden="true">
                  <BaryonMark />
                </span>
                <span className="arl-exit__label" aria-hidden="true">
                  Baryon
                </span>
              </a>
            )}
          </div>
        </div>

        {mode === "none" ? (
          <section className="arl-console" aria-label="Choose an AR Lab mode">
            <div className={`arl-modes${SHOW_XR_ENTRY ? " arl-modes--with-xr" : ""}`}>
              <article
                className={`arl-mode${canUseCamera ? " arl-mode--recommended" : ""}`}
              >
                <div className="arl-mode__head">
                  <span className="arl-mode__icon" aria-hidden="true">
                    <CameraIcon />
                  </span>
                  <span className="arl-mode__titles">
                    <span className="arl-mode__name">Camera</span>
                    <span className="arl-mode__tag">Webcam · Hand tracking</span>
                  </span>
                </div>
                <p className="arl-mode__desc">
                  Use this desktop&apos;s camera. The orb appears over your video and
                  follows your hands — no headset needed.
                </p>
                <div className="arl-mode__cta">
                  <button
                    type="button"
                    className="arl-btn arl-btn--primary"
                    data-testid="ar-lab-start-camera"
                    disabled={!canUseCamera}
                    onClick={onStartCamera}
                  >
                    <CameraIcon />
                    Start camera
                  </button>
                  {!cameraApiAvailable ? (
                    <span className="arl-mode__note arl-mode__note--error">
                      This browser doesn&apos;t expose a camera.
                    </span>
                  ) : null}
                </div>
              </article>

              {SHOW_XR_ENTRY ? (
                <article
                  className={`arl-mode${canEnterAr ? " arl-mode--recommended" : ""}`}
                >
                  <div className="arl-mode__head">
                    <span className="arl-mode__icon" aria-hidden="true">
                      <HeadsetIcon />
                    </span>
                    <span className="arl-mode__titles">
                      <span className="arl-mode__name">Immersive XR</span>
                      <span className="arl-mode__tag">WebXR · Passthrough</span>
                    </span>
                  </div>
                  <p className="arl-mode__desc">
                    Step inside with a WebXR headset. The orb anchors in your room and
                    tracks your real hands through passthrough.
                  </p>
                  <div className="arl-mode__cta">
                    <button
                      type="button"
                      className="arl-btn arl-btn--primary"
                      data-testid="ar-lab-enter"
                      disabled={!canEnterAr}
                      onClick={() => void handleEnterAr()}
                    >
                      <HeadsetIcon />
                      Enter XR
                    </button>
                    {enterError ? (
                      <span className="arl-mode__note arl-mode__note--error">
                        {enterError}
                      </span>
                    ) : canEnterAr ? (
                      <span className="arl-mode__note">
                        Immersive XR supported — enter with a WebXR headset.
                      </span>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {isActive && !hintDismissed ? (
          <div className="arl-hint" role="status">
            <HandIcon />
            <span className="arl-hint__copy">
              Raise a hand to hold the orb — spread both hands to resize.
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
