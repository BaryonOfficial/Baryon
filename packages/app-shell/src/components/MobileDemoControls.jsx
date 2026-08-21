import React, { useState } from "react";
import { useAudio } from "../context/AudioContext.jsx";
import DemoAudioIcon from "./DemoAudioIcon.jsx";
import MetalFxFrame from "./MetalFxFrame.jsx";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion.js";

const MARKETING_DOWNLOAD_URL = "https://baryon.live/download";

const DEMO_PHASES = Object.freeze({
  preparing: "preparing",
  ready: "ready",
  playing: "playing",
});

const PHASE_LABELS = Object.freeze({
  [DEMO_PHASES.preparing]: "Preparing demo",
  [DEMO_PHASES.ready]: "Play demo",
  [DEMO_PHASES.playing]: "Stop demo",
});

const PHASE_ICON_VARIANTS = Object.freeze({
  [DEMO_PHASES.preparing]: "play",
  [DEMO_PHASES.ready]: "play",
  [DEMO_PHASES.playing]: "stop",
});

// No backdrop-filter anywhere in this overlay: blurring over the live renderer
// canvas forces a swapchain readback and stalls the frame loop on the exact
// devices this surface targets.
const CSS = `
.mobile-demo-controls {
  position: fixed;
  z-index: 9999;
  inset: 0;
  pointer-events: none;
  font-family: var(--baryon-type-interface-family);
}

.mobile-demo-note {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 0.85rem);
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: calc(100vw - 2rem);
  margin: 0;
  padding: 0.3rem 0.2rem;
  color: color-mix(in srgb, var(--nd-text-primary) 52%, transparent);
  font-size: 0.81rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  pointer-events: auto;
  transform: translateX(-50%);
  transition: color 180ms ease;
}

.mobile-demo-note::after {
  content: "→";
  font-size: 0.88rem;
  opacity: 0.7;
}

.mobile-demo-note:active {
  color: var(--nd-text-display);
}

.mobile-demo-note:focus-visible {
  outline: 2px solid var(--nd-info);
  outline-offset: 4px;
  border-radius: 4px;
}

/* The control is the mark inside a metal ring — the ring supplies the colour,
   so the glyph itself stays neutral. */
.mobile-demo-frame {
  position: absolute;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom) + 1.1rem);
  pointer-events: auto;
  transform: translateX(-50%);
}

.mobile-demo-cta {
  display: grid;
  box-sizing: border-box;
  width: 3.9rem;
  height: 3.9rem;
  place-items: center;
  padding: 0;
  /* MetalFx stacks the host above its ring canvas, so the ring band is held
     open as a transparent border rather than being painted over. */
  border: 3.6px solid transparent;
  border-radius: 999px;
  background: radial-gradient(
      circle at 50% 22%,
      color-mix(in srgb, var(--nd-text-display) 9%, transparent),
      transparent 68%
    ),
    var(--nd-black);
  /* Must follow the shorthand, which resets background-clip to border-box. */
  background-clip: padding-box;
  color: var(--nd-text-display);
  cursor: pointer;
  transition:
    color 200ms ease,
    opacity 200ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
  -webkit-tap-highlight-color: transparent;
}

.mobile-demo-cta__mark {
  display: grid;
  place-items: center;
}

.mobile-demo-cta__mark svg {
  width: 2.3rem;
  height: 2.3rem;
}

.mobile-demo-cta[data-phase="preparing"] {
  color: color-mix(in srgb, var(--nd-text-primary) 40%, transparent);
  cursor: progress;
}

.mobile-demo-cta:active:not(:disabled) {
  transform: scale(0.93);
}

.mobile-demo-cta:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 4px;
}

.mobile-demo-error {
  position: absolute;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom) + 5.6rem);
  display: inline-block;
  max-width: min(20rem, calc(100vw - 2.5rem));
  margin: 0;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: var(--nd-surface);
  color: var(--nd-warning);
  font-size: 0.72rem;
  line-height: 1.35;
  text-align: center;
  transform: translateX(-50%);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-demo-cta,
  .mobile-demo-note {
    transition: none;
  }
}

@media (prefers-contrast: more) {
  .mobile-demo-note {
    color: var(--nd-text-primary);
  }
}
`;

export default function MobileDemoControls() {
  const {
    isAudioLoaded,
    isEngineReady,
    isPlaying,
    handlePlayPause,
    handleStop,
  } = useAudio();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [playbackError, setPlaybackError] = useState("");
  const prefersReducedMotion = usePrefersReducedMotion();
  const isReady = isAudioLoaded && isEngineReady;
  const phase = !isReady
    ? DEMO_PHASES.preparing
    : isPlaying
      ? DEMO_PHASES.playing
      : DEMO_PHASES.ready;
  const buttonLabel = isTransitioning
    ? isPlaying
      ? "Stopping demo"
      : "Starting demo"
    : PHASE_LABELS[phase];

  const handleDemoToggle = async () => {
    if (!isReady || isTransitioning) {
      return;
    }

    setIsTransitioning(true);
    setPlaybackError("");
    try {
      if (isPlaying) {
        handleStop();
      } else {
        await handlePlayPause();
      }
    } catch (error) {
      console.error("Error toggling mobile demo playback:", error);
      setPlaybackError("The demo did not respond. Tap to try again.");
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <section
        className="mobile-demo-controls"
        aria-label="Baryon mobile demo"
        data-testid="mobile-demo-controls"
      >
        <a className="mobile-demo-note" href={MARKETING_DOWNLOAD_URL}>
          Full experience on desktop
        </a>
        <MetalFxFrame
          className="mobile-demo-frame"
          variant="circle"
          preset="chromatic"
          theme="light"
          strength={1}
          // The target is ~2x the circle variant's 32px baseline, so the ring
          // and shader features scale with it instead of thinning out.
          scale={2}
          ringCssPx={3.6}
          // No halo over the live render: the ring is the whole effect here.
          disableGlow
          // The ring animates while the demo is waiting to be started, and
          // freezes once the field takes over: the render owns the motion
          // budget from that point on.
          paused={prefersReducedMotion || phase === DEMO_PHASES.playing}
          borderRadius={999}
          normalizeHostStyles={false}
        >
          <button
            type="button"
            className="mobile-demo-cta"
            data-phase={phase}
            onClick={handleDemoToggle}
            disabled={!isReady || isTransitioning}
            aria-label={buttonLabel}
            aria-pressed={isPlaying}
            title={buttonLabel}
          >
            <span className="mobile-demo-cta__mark" aria-hidden="true">
              <DemoAudioIcon variant={PHASE_ICON_VARIANTS[phase]} />
            </span>
          </button>
        </MetalFxFrame>
        {playbackError ? (
          <span className="mobile-demo-error" role="alert">
            {playbackError}
          </span>
        ) : null}
      </section>
    </>
  );
}
