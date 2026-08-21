import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveAdvancedControlsHelpPosition } from "./advancedControlsHelpPosition.js";
import {
  UI_INTERACTION_SOURCES,
  dispatchBaryonUiInteraction,
} from "./uiInteractionEvents.js";

const CLOSE_HELP_DELAY_MS = 110;
const OPEN_HELP_DELAY_MS = 180;
const SCROLL_INTERACTION_MARK_INTERVAL_MS = 140;

const RESOURCE_LINKS = [
  {
    href: "https://baryon.live/docs/",
    label: "Docs",
  },
  {
    href: "https://github.com/BaryonOfficial/Baryon",
    label: "Source",
  },
  {
    href: "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
    label: "License",
  },
];

const BUG_REPORT_URL = "https://github.com/BaryonOfficial/Baryon/issues";

const SOCIAL_LINKS = [
  {
    href: "https://x.com/kyledcollins",
    label: "X",
    icon: "x",
  },
  {
    href: "https://www.instagram.com/baryon.eth/",
    label: "Instagram",
    icon: "instagram",
  },
];

const CSS = `
.baryon-controls-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 70;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: var(--baryon-controls-dock-width);
  padding: 0.55rem 0 0.55rem 0.55rem;
  pointer-events: none;
  visibility: hidden;
}

.baryon-controls-sidebar[data-open="true"] {
  visibility: visible;
}

.baryon-controls-shell {
  height: auto;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(255, 245, 224, 0.04), transparent 7rem),
    color-mix(in srgb, var(--nd-surface) 96%, transparent);
  border: 1px solid rgba(255, 245, 224, 0.07);
  border-radius: 0.95rem;
  box-shadow:
    0 1.2rem 3.2rem rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(18px) saturate(1.12);
  -webkit-backdrop-filter: blur(18px) saturate(1.12);
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-interface-family);
  transform: translateX(calc(-100% - 0.75rem));
  opacity: 0;
  visibility: hidden;
  transition:
    transform 300ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 240ms ease-out,
    visibility 300ms;
  pointer-events: auto;
  overflow: hidden;
  contain: layout paint style;
}

.baryon-controls-shell[data-open="true"] {
  transform: translateX(0);
  opacity: 1;
  visibility: visible;
}

.baryon-controls-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.66rem 0.5rem 0.5rem 0.8rem;
}

.baryon-controls-header-label {
  margin: 0;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-heading-letter-spacing);
  text-transform: uppercase;
  color: var(--nd-text-display);
  font-family: var(--baryon-type-mono-family);
}

.baryon-controls-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--nd-text-secondary);
  cursor: pointer;
  transition: color 140ms ease;
}

.baryon-controls-close-button:hover {
  color: var(--nd-text-display);
}

.baryon-controls-close-button:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-close-button svg {
  width: 0.95rem;
  height: 0.95rem;
}

.baryon-controls-filter {
  position: relative;
  flex: 0 0 auto;
  margin: 0 0.62rem 0.5rem;
}

.baryon-controls-filter-icon {
  position: absolute;
  top: 50%;
  left: 0.52rem;
  display: inline-flex;
  transform: translateY(-50%);
  color: var(--nd-text-disabled);
  pointer-events: none;
}

.baryon-controls-filter-icon svg {
  width: 0.72rem;
  height: 0.72rem;
}

.baryon-controls-filter-input {
  width: 100%;
  min-height: 1.95rem;
  padding: 0.3rem 1.7rem 0.3rem 1.62rem;
  border: 1px solid var(--nd-border);
  border-radius: 0.58rem;
  background: rgba(0, 0, 0, 0.18);
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-interface-family);
  font-size: 0.66rem;
  box-sizing: border-box;
  transition:
    border-color 140ms ease-out,
    background-color 140ms ease-out;
}

.baryon-controls-filter-input::placeholder {
  color: var(--nd-text-disabled);
}

.baryon-controls-filter-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--nd-text-display) 55%, transparent);
  background: rgba(0, 0, 0, 0.26);
}

.baryon-controls-filter-clear {
  position: absolute;
  top: 50%;
  right: 0.26rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--nd-text-secondary);
  transform: translateY(-50%);
  cursor: pointer;
  transition: color 140ms ease;
}

.baryon-controls-filter-clear:hover {
  color: var(--nd-text-display);
}

.baryon-controls-filter-clear:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 1px;
}

.baryon-controls-filter-clear svg {
  width: 0.62rem;
  height: 0.62rem;
}

.baryon-controls-scroll {
  --baryon-scroll-gap: 0rem;
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  contain: layout paint style;
  will-change: scroll-position;
  transform: translateZ(0);
  display: flex;
  flex-direction: column;
  gap: var(--baryon-scroll-gap);
  padding: 0 0.42rem 0.55rem 0.62rem;
}

.baryon-controls-scroll > * {
  flex: 0 0 auto;
  animation: baryon-settings-item-in 260ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

.baryon-controls-scroll > :nth-child(2) {
  animation-delay: 35ms;
}

.baryon-controls-scroll > :nth-child(3) {
  animation-delay: 70ms;
}

.baryon-controls-scroll > :nth-child(n + 4) {
  animation-delay: 95ms;
}

@keyframes baryon-settings-item-in {
  from {
    opacity: 0;
    transform: translateY(0.45rem);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@supports (animation-timeline: scroll()) {
  .baryon-controls-scroll::before,
  .baryon-controls-scroll::after {
    content: "";
    position: sticky;
    z-index: 2;
    display: block;
    flex: 0 0 auto;
    height: 1.4rem;
    pointer-events: none;
    opacity: 0;
    animation: baryon-scroll-edge-top linear both;
    animation-timeline: scroll(nearest);
  }

  .baryon-controls-scroll::before {
    top: 0;
    margin-bottom: calc(-1.4rem - var(--baryon-scroll-gap));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--nd-surface) 96%, transparent),
      transparent
    );
  }

  .baryon-controls-scroll::after {
    bottom: 0;
    margin-top: calc(-1.4rem - var(--baryon-scroll-gap));
    background: linear-gradient(
      0deg,
      color-mix(in srgb, var(--nd-surface) 96%, transparent),
      transparent
    );
    animation-name: baryon-scroll-edge-bottom;
  }

  @keyframes baryon-scroll-edge-top {
    from {
      opacity: 0;
    }

    6%,
    to {
      opacity: 1;
    }
  }

  @keyframes baryon-scroll-edge-bottom {
    from,
    94% {
      opacity: 1;
    }

    to {
      opacity: 0;
    }
  }
}

.baryon-controls-scroll::-webkit-scrollbar {
  width: 0.4rem;
}

.baryon-controls-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--nd-border-visible);
}

.baryon-controls-section-label {
  margin: 0;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-section-letter-spacing);
  text-transform: uppercase;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
}

.baryon-controls-presets {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
  padding: 0.12rem 0.1rem 0.62rem;
}

.baryon-controls-presets-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.25rem;
  padding-inline: 0.06rem;
}

.baryon-controls-presets-count {
  font-family: var(--baryon-type-mono-family);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  text-transform: uppercase;
  color: var(--nd-text-disabled);
}

.baryon-controls-preset-surface {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.62rem;
  overflow: hidden;
  padding: 0.58rem;
  border: 1px solid rgba(255, 245, 224, 0.075);
  border-radius: 0.82rem;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.026), transparent 44%),
    rgba(0, 0, 0, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 0.75rem 1.8rem rgba(0, 0, 0, 0.12);
}

.baryon-controls-preset-current,
.baryon-controls-preset-capture {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.3rem;
}

.baryon-controls-preset-field-label,
.baryon-controls-preset-capture-label {
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.48rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  text-transform: uppercase;
}

.baryon-controls-preset-empty {
  display: grid;
  grid-template-columns: 2.28rem minmax(0, 1fr);
  align-items: center;
  gap: 0.62rem;
  min-height: 3.25rem;
  padding: 0.18rem 0.12rem;
}

.baryon-controls-preset-empty-mark {
  position: relative;
  display: grid;
  width: 2.28rem;
  height: 2.28rem;
  place-items: center;
  border: 1px solid rgba(255, 245, 224, 0.09);
  border-radius: 0.72rem;
  background:
    radial-gradient(circle, rgba(232, 223, 208, 0.1), transparent 56%),
    rgba(255, 255, 255, 0.018);
  color: var(--nd-text-disabled);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.baryon-controls-preset-empty-mark svg {
  width: 1rem;
  height: 1rem;
}

.baryon-controls-preset-empty-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.16rem;
}

.baryon-controls-preset-empty-copy strong {
  color: var(--nd-text-primary);
  font-size: 0.67rem;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.baryon-controls-preset-empty-copy span {
  color: var(--nd-text-secondary);
  font-size: 0.56rem;
  line-height: 1.35;
}

.baryon-controls-preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.34rem;
}

.baryon-controls-preset-row[data-has-delete="false"] {
  grid-template-columns: minmax(0, 1fr);
}

.baryon-controls-preset-capture-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.baryon-controls-preset-capture-hint {
  color: var(--nd-text-disabled);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.44rem;
  letter-spacing: var(--baryon-type-data-letter-spacing);
  text-transform: uppercase;
}

.baryon-controls-preset-composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  padding: 0.2rem;
  border: 1px solid var(--nd-border-visible);
  border-radius: 0.68rem;
  background: rgba(0, 0, 0, 0.22);
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.baryon-controls-preset-composer:focus-within {
  border-color: color-mix(in srgb, var(--nd-text-display) 62%, transparent);
  box-shadow: 0 0 0 2px rgba(232, 223, 208, 0.075);
}

.baryon-controls-preset-composer .baryon-controls-text-input {
  width: 100%;
  min-height: 1.9rem;
  padding: 0.24rem 0.46rem;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.baryon-controls-preset-composer .baryon-controls-text-input:focus {
  background: transparent;
  box-shadow: none;
}

.baryon-controls-icon-button {
  display: inline-grid;
  place-items: center;
  width: 1.95rem;
  height: 1.95rem;
  padding: 0;
  border: 1px solid var(--nd-border);
  border-radius: 0.55rem;
  background: var(--nd-surface-raised);
  color: var(--nd-text-secondary);
  cursor: pointer;
  transition:
    background 140ms ease-out,
    border-color 140ms ease-out,
    color 140ms ease-out,
    transform 100ms ease-out;
}

.baryon-controls-icon-button svg {
  width: 0.78rem;
  height: 0.78rem;
}

.baryon-controls-icon-button:hover:not(:disabled) {
  border-color: var(--nd-border-visible);
  color: var(--nd-text-display);
}

.baryon-controls-icon-button:active:not(:disabled) {
  transform: scale(0.94);
}

.baryon-controls-icon-button:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-icon-button:disabled {
  cursor: default;
  opacity: 0.32;
}

.baryon-controls-icon-button[data-variant="danger"]:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--nd-danger) 55%, transparent);
  color: var(--nd-danger);
}

.baryon-controls-icon-button[data-variant="danger-confirm"] {
  border-color: var(--nd-danger);
  background: var(--nd-danger);
  color: var(--nd-black);
}

.baryon-controls-save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-width: 3.55rem;
  min-height: 1.9rem;
  padding: 0.3rem 0.62rem;
  border: 0;
  border-radius: 0.5rem;
  background: var(--nd-text-display);
  color: var(--nd-black);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-label-letter-spacing);
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 140ms ease-out,
    color 140ms ease-out,
    opacity 140ms ease-out,
    transform 100ms ease-out;
}

.baryon-controls-save-button:hover:not(:disabled) {
  background: var(--baryon-cream);
}

.baryon-controls-save-button:active:not(:disabled) {
  transform: scale(0.96);
}

.baryon-controls-save-button:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-save-button:disabled {
  cursor: default;
  background: rgba(255, 255, 255, 0.045);
  color: var(--nd-text-disabled);
  opacity: 1;
}

.baryon-controls-group {
  border-top: 1px solid rgba(255, 245, 224, 0.055);
}

.baryon-controls-group-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.baryon-controls-group-toggle {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 0.42rem;
  min-height: 2.25rem;
  padding: 0.3rem 0.1rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: color 140ms ease-out;
}

.baryon-controls-group-toggle:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: -2px;
}

.baryon-controls-chevron {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--nd-text-disabled);
  transform: rotate(-90deg);
  transition:
    transform 220ms cubic-bezier(0.32, 0.72, 0, 1),
    color 140ms ease-out;
}

.baryon-controls-chevron svg {
  width: 0.66rem;
  height: 0.66rem;
}

.baryon-controls-group-toggle[aria-expanded="true"] .baryon-controls-chevron {
  transform: rotate(0deg);
}

.baryon-controls-group-toggle:hover .baryon-controls-chevron {
  color: var(--nd-text-display);
}

.baryon-controls-group-title {
  overflow: hidden;
  font-size: 0.68rem;
  font-weight: 640;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.baryon-controls-group-count {
  margin-left: auto;
  padding-right: 0.1rem;
  color: var(--nd-text-disabled);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.5rem;
  font-weight: 700;
}

.baryon-controls-group-header-control {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.34rem;
  padding-right: 0.1rem;
}

.baryon-controls-group-header-control .baryon-controls-row-label {
  font-size: 0.56rem;
  color: var(--nd-text-secondary);
}

.baryon-controls-group-content {
  display: flex;
  flex-direction: column;
  padding: 0 0 0.45rem;
  animation: baryon-group-content-in 190ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes baryon-group-content-in {
  from {
    opacity: 0;
    transform: translateY(-0.2rem);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.baryon-controls-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.6rem;
  min-height: 2rem;
  padding: 0.26rem 0.1rem 0.26rem 1.08rem;
  border-radius: 0.5rem;
}

.baryon-controls-group-content .baryon-controls-row:hover {
  background: rgba(255, 255, 255, 0.018);
}

.baryon-controls-row--wide {
  grid-template-columns: minmax(0, 1fr);
  row-gap: 0.24rem;
}

.baryon-controls-row--slider {
  grid-template-columns: minmax(0, 1fr) auto;
  row-gap: 0.16rem;
}

.baryon-controls-row-label-wrap {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.32rem;
}

.baryon-controls-row-label {
  overflow: hidden;
  color: color-mix(in srgb, var(--nd-text-primary) 88%, transparent);
  font-size: 0.655rem;
  font-weight: 480;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.baryon-controls-status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.22rem;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.48rem;
  letter-spacing: var(--baryon-type-data-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
}

.baryon-controls-status::before {
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 999px;
  background: currentColor;
  content: "";
  opacity: 0.58;
}

.baryon-controls-status[data-state="active"] {
  color: color-mix(in srgb, #69d7a0 78%, var(--nd-text-primary));
}

.baryon-controls-status[data-state="applying"] {
  color: color-mix(in srgb, #e8c46a 80%, var(--nd-text-primary));
}

.baryon-controls-status[data-state="failed"] {
  color: color-mix(in srgb, #f07d7d 82%, var(--nd-text-primary));
}

.baryon-controls-slider-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.baryon-controls-slider {
  --baryon-slider-fill: 50%;
  flex: 1;
  min-width: 0;
  height: 1.15rem;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}

.baryon-controls-slider:focus-visible {
  outline: none;
}

.baryon-controls-slider::-webkit-slider-runnable-track {
  height: 0.2rem;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--baryon-cream) var(--baryon-slider-fill),
    color-mix(in srgb, var(--baryon-cream) 15%, transparent)
      var(--baryon-slider-fill)
  );
}

.baryon-controls-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 0.8rem;
  height: 0.8rem;
  margin-top: -0.3rem;
  border: none;
  border-radius: 50%;
  background: var(--baryon-cream);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.55),
    0 0 0 0 rgba(232, 223, 208, 0);
  transition:
    transform 140ms ease-out,
    box-shadow 140ms ease-out;
}

.baryon-controls-slider:hover::-webkit-slider-thumb {
  transform: scale(1.12);
}

.baryon-controls-slider:active::-webkit-slider-thumb {
  transform: scale(1.22);
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.55),
    0 0 0 0.28rem rgba(232, 223, 208, 0.14);
}

.baryon-controls-slider:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.55),
    0 0 0 2px var(--nd-black),
    0 0 0 4px var(--nd-text-display);
}

.baryon-controls-slider::-moz-range-track {
  height: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--baryon-cream) 15%, transparent);
}

.baryon-controls-slider::-moz-range-progress {
  height: 0.2rem;
  border-radius: 999px;
  background: var(--baryon-cream);
}

.baryon-controls-slider::-moz-range-thumb {
  width: 0.8rem;
  height: 0.8rem;
  border: none;
  border-radius: 50%;
  background: var(--baryon-cream);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

.baryon-controls-slider:focus-visible::-moz-range-thumb {
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.55),
    0 0 0 2px var(--nd-black),
    0 0 0 4px var(--nd-text-display);
}

.baryon-controls-number-input {
  width: 2.95rem;
  min-width: 2.95rem;
  padding: 0.16rem 0.3rem;
  border-radius: 0.4rem;
  border: 1px solid var(--nd-border);
  background: var(--nd-surface-raised);
  color: var(--nd-text-primary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.58rem;
  text-align: right;
  box-sizing: border-box;
}

.baryon-controls-number-input::-webkit-inner-spin-button,
.baryon-controls-number-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.baryon-controls-number-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.baryon-controls-number-input:focus {
  outline: none;
  border-color: var(--nd-text-display);
  background: rgba(255, 255, 255, 0.02);
}

.baryon-controls-text-input,
.baryon-controls-select {
  min-height: 1.95rem;
  border-radius: 0.55rem;
  border: 1px solid var(--nd-border-visible);
  background-color: rgba(0, 0, 0, 0.14);
  color: var(--nd-text-primary);
  padding: 0.3rem 0.5rem;
  font-family: var(--baryon-type-mono-family);
  font-size: 0.6rem;
  letter-spacing: var(--baryon-type-data-letter-spacing);
  box-sizing: border-box;
  transition:
    background-color 140ms ease-out,
    border-color 140ms ease-out,
    box-shadow 140ms ease-out;
}

.baryon-controls-row .baryon-controls-text-input,
.baryon-controls-row .baryon-controls-select {
  width: 8.9rem;
}

.baryon-controls-row--wide .baryon-controls-text-input,
.baryon-controls-row--wide .baryon-controls-select,
.baryon-controls-preset-row .baryon-controls-text-input,
.baryon-controls-preset-row .baryon-controls-select {
  width: 100%;
}

.baryon-controls-select {
  color-scheme: dark;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 1.55rem;
  background-color: var(--nd-surface-raised);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239a8e7e' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  background-size: 0.58rem;
  cursor: pointer;
}

.baryon-controls-select option {
  background-color: var(--nd-surface-raised);
  color: var(--nd-text-primary);
}

.baryon-controls-text-input:focus,
.baryon-controls-select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--nd-text-display) 72%, transparent);
  box-shadow: 0 0 0 2px rgba(232, 223, 208, 0.09);
}

.baryon-controls-text-input:focus {
  background-color: rgba(0, 0, 0, 0.22);
}

.baryon-controls-text-input::placeholder {
  color: var(--nd-text-disabled);
}

.baryon-controls-segmented {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--segment-count), minmax(0, 1fr));
  gap: 0.18rem;
  padding: 0.18rem;
  border-radius: 0.55rem;
  background: var(--nd-surface);
  border: 1px solid var(--nd-border-visible);
}

.baryon-controls-segmented-thumb {
  position: absolute;
  top: 0.18rem;
  bottom: 0.18rem;
  left: 0.18rem;
  width: calc(
    (100% - 0.36rem - (var(--segment-count) - 1) * 0.18rem) /
      var(--segment-count)
  );
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--nd-surface-raised) 82%, #e8dfd0 8%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 1px 2px rgba(0, 0, 0, 0.32);
  transform: translateX(calc(var(--segment-index) * (100% + 0.18rem)));
  transition:
    transform 240ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 140ms ease-out;
  pointer-events: none;
}

.baryon-controls-segmented[data-has-selection="false"]
  .baryon-controls-segmented-thumb {
  opacity: 0;
}

.baryon-controls-segmented-option {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 1.42rem;
  padding: 0.22rem 0.3rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-label-letter-spacing);
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 160ms ease-out,
    transform 140ms ease;
}

.baryon-controls-segmented-option:hover {
  color: var(--nd-text-display);
}

.baryon-controls-segmented-option:active {
  transform: translateY(1px);
}

.baryon-controls-segmented-option[data-selected="true"] {
  color: var(--nd-text-display);
}

.baryon-controls-segmented-option:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: -2px;
}

.baryon-controls-toggle {
  position: relative;
  width: 1.95rem;
  height: 1.14rem;
  flex: 0 0 auto;
}

.baryon-controls-toggle input {
  position: absolute;
  inset: 0;
  opacity: 0;
  margin: 0;
  cursor: pointer;
}

.baryon-controls-toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--nd-border);
  box-shadow:
    inset 0 0 0 1px var(--nd-border-visible),
    inset 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  transition:
    background 180ms cubic-bezier(0.34, 1.4, 0.64, 1),
    box-shadow 180ms ease;
}

.baryon-controls-toggle-thumb {
  position: absolute;
  top: 50%;
  left: 0.14rem;
  width: 0.86rem;
  height: 0.86rem;
  border-radius: 999px;
  background: var(--baryon-cream);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    transform 200ms cubic-bezier(0.34, 1.5, 0.64, 1),
    background 180ms ease;
}

.baryon-controls-toggle input:checked + .baryon-controls-toggle-track {
  background: var(--nd-accent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--nd-accent) 55%, #000),
    inset 0 1px 2px rgba(0, 0, 0, 0.18);
}

.baryon-controls-toggle input:focus-visible + .baryon-controls-toggle-track {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-toggle
  input:checked
  + .baryon-controls-toggle-track
  .baryon-controls-toggle-thumb {
  transform: translate(0.81rem, -50%);
}

.baryon-controls-color-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.baryon-controls-color {
  width: 2rem;
  height: 1.5rem;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.baryon-controls-color::-webkit-color-swatch-wrapper {
  padding: 0;
}

.baryon-controls-color::-webkit-color-swatch {
  border: 1px solid rgba(255, 245, 224, 0.22);
  border-radius: 0.45rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.baryon-controls-color::-moz-color-swatch {
  border: 1px solid rgba(255, 245, 224, 0.22);
  border-radius: 0.45rem;
}

.baryon-controls-color:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-color-value {
  font-size: 0.58rem;
  color: var(--nd-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--baryon-type-action-letter-spacing);
  font-family: var(--baryon-type-mono-family);
}

.baryon-controls-help-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.85rem;
  height: 0.85rem;
  flex: 0 0 auto;
  border: 1px solid var(--nd-border-visible);
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-secondary);
  cursor: help;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.baryon-controls-help-trigger:hover,
.baryon-controls-help-trigger:focus-visible,
.baryon-controls-help-trigger[aria-expanded="true"] {
  background: var(--nd-surface-raised);
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
  outline: none;
}

.baryon-controls-help-trigger svg {
  width: 0.48rem;
  height: 0.48rem;
}

.baryon-controls-help-tooltip {
  position: fixed;
  z-index: 90;
  width: min(13rem, calc(100vw - 1rem));
  padding: 0.56rem 0.62rem;
  border: 1px solid var(--nd-border-visible);
  border-radius: 0.72rem;
  background: var(--nd-surface);
  color: var(--nd-text-primary);
  box-shadow: var(--nd-shell-shadow);
  pointer-events: auto;
}

.baryon-controls-help-tooltip[data-visible="true"] {
  animation: baryon-tooltip-in 150ms cubic-bezier(0.23, 1, 0.32, 1) both;
}

@keyframes baryon-tooltip-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.baryon-controls-help-tooltip[data-visible="false"] {
  visibility: hidden;
}

.baryon-controls-help-tooltip-label {
  margin: 0 0 0.18rem;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-section-letter-spacing);
  text-transform: uppercase;
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
}

.baryon-controls-help-tooltip-copy {
  margin: 0;
  font-size: 0.65rem;
  line-height: 1.42;
  color: var(--nd-text-primary);
}

.baryon-controls-filter-empty {
  margin: 0;
  padding: 1rem 0.2rem;
  color: var(--nd-text-secondary);
  font-size: 0.62rem;
  text-align: center;
}

.baryon-controls-footer {
  display: flex;
  flex-direction: column;
  gap: 0.42rem;
  margin-top: 0.15rem;
  border-top: 1px solid rgba(255, 245, 224, 0.055);
  padding: 0.55rem 0.05rem 0.1rem;
}

.baryon-controls-footer-buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.3rem;
}

.baryon-controls-footer-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.34rem;
  min-height: 1.95rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--nd-border);
  border-radius: 0.55rem;
  background: rgba(255, 255, 255, 0.015);
  color: var(--nd-text-secondary);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-label-letter-spacing);
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 140ms ease-out,
    border-color 140ms ease-out,
    color 140ms ease-out;
}

.baryon-controls-footer-button:hover {
  border-color: var(--nd-border-visible);
  background: rgba(255, 255, 255, 0.04);
  color: var(--nd-text-display);
}

.baryon-controls-footer-button:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 2px;
}

.baryon-controls-footer-button svg {
  width: 0.74rem;
  height: 0.74rem;
  flex: 0 0 auto;
  color: var(--nd-text-disabled);
  transition: color 140ms ease-out;
}

.baryon-controls-footer-button:hover svg {
  color: var(--nd-accent);
}

.baryon-controls-footer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.5rem;
}

.baryon-controls-footer-links {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.baryon-controls-footer-text-link {
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  padding: 0.2rem 0.32rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--nd-text-disabled);
  font-family: var(--baryon-type-mono-family);
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: var(--baryon-type-dense-label-letter-spacing);
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition:
    background 140ms ease-out,
    color 140ms ease-out;
}

.baryon-controls-footer-text-link:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--nd-text-display);
}

.baryon-controls-footer-text-link:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 1px;
}

.baryon-controls-footer-social {
  display: flex;
  align-items: center;
  gap: 0.08rem;
}

.baryon-controls-footer-social-link {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--nd-text-display);
  box-sizing: border-box;
  transition:
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 100ms ease-out;
}

.baryon-controls-footer-social-link[data-brand="x"] {
  color: #f5f5f5;
}

@media (hover: hover) and (pointer: fine) {
  .baryon-controls-footer-social-link:hover {
    border-color: var(--nd-border);
    background-color: rgba(255, 255, 255, 0.035);
  }
}

.baryon-controls-footer-social-link:active {
  transform: scale(0.94);
}

.baryon-controls-footer-social-link:focus-visible {
  outline: 2px solid var(--nd-text-display);
  outline-offset: 1px;
}

.baryon-controls-footer-social-link svg {
  width: 0.78rem;
  height: 0.78rem;
}

.baryon-controls-footer-social-link[data-brand="x"] svg {
  width: 0.72rem;
  height: 0.72rem;
}

@media (max-width: 640px) {
  .baryon-controls-sidebar {
    inset: auto 0 0 0;
    width: auto;
    padding: 0.45rem;
  }

  .baryon-controls-shell {
    width: 100%;
    min-width: var(--baryon-compact-sheet-min-width);
    height: auto;
    max-height: min(80vh, calc(100dvh - 0.9rem));
    border-radius: 1.1rem;
    transform: translateY(calc(100% + 0.75rem));
  }

  .baryon-controls-sidebar {
    justify-content: flex-end;
  }

  .baryon-controls-shell[data-open="true"] {
    transform: translateY(0);
  }

  .baryon-controls-header-label {
    font-size: 0.66rem;
  }

  .baryon-controls-row .baryon-controls-text-input,
  .baryon-controls-row .baryon-controls-select {
    width: 10.5rem;
  }
}

@media (max-width: 1024px) and (min-width: 641px) {
  .baryon-controls-shell {
    transform: translateX(calc(-100% - 0.8rem));
  }

  .baryon-controls-shell[data-open="true"] {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .baryon-controls-shell,
  .baryon-controls-chevron,
  .baryon-controls-segmented-thumb,
  .baryon-controls-icon-button,
  .baryon-controls-save-button,
  .baryon-controls-preset-composer,
  .baryon-controls-text-input,
  .baryon-controls-select {
    transition-duration: 0.01ms !important;
  }

  .baryon-controls-scroll > *,
  .baryon-controls-scroll > :nth-child(n) {
    animation: baryon-settings-item-fade 160ms ease both;
  }

  .baryon-controls-group-content {
    animation: baryon-settings-item-fade 160ms ease both;
  }

  .baryon-controls-help-tooltip[data-visible="true"] {
    animation: baryon-settings-item-fade 120ms ease both;
  }

  .baryon-controls-icon-button:active:not(:disabled),
  .baryon-controls-save-button:active:not(:disabled) {
    transform: none;
  }
}

@keyframes baryon-settings-item-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .baryon-controls-shell {
    background: var(--nd-surface);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

@media (prefers-contrast: more) {
  .baryon-controls-shell,
  .baryon-controls-group,
  .baryon-controls-preset-surface,
  .baryon-controls-preset-composer,
  .baryon-controls-footer {
    border-color: var(--nd-text-secondary);
  }
}
`;

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.9 9.35a2.2 2.2 0 1 1 3.08 2.02c-.9.42-1.36.94-1.36 1.93"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.9" r="1" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6 18 18M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3.6-3.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PresetStackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m5 7 7-3 7 3-7 3-7-3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="m5 11 7 3 7-3M5 15l7 3 7-3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m3 0-1 13.5a2 2 0 0 1-2 1.5H8a2 2 0 0 1-2-1.5L5 6M10 10.5v6M14 10.5v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Zm0 0v-9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6.8 17C4.7 17.1 3 18.9 3 21M17.47 9c1.93-.2 3.53-1.9 3.53-4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SocialIcon({ name }) {
  const instagramGradientId = useId();

  if (name === "x") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={instagramGradientId}
          x1="3"
          y1="21"
          x2="21"
          y2="3"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffd76a" />
          <stop offset="0.36" stopColor="#f77737" />
          <stop offset="0.68" stopColor="#d62976" />
          <stop offset="1" stopColor="#8a3ab9" />
        </linearGradient>
      </defs>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke={`url(#${instagramGradientId})`}
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="4"
        stroke={`url(#${instagramGradientId})`}
        strokeWidth="1.8"
      />
      <circle
        cx="17.2"
        cy="6.8"
        r="1.1"
        fill={`url(#${instagramGradientId})`}
      />
    </svg>
  );
}

function noteAdvancedControlsInteraction(kind = "panel") {
  dispatchBaryonUiInteraction({
    source: UI_INTERACTION_SOURCES.advancedControls,
    kind,
  });
}

function usePassiveWheelBlur({ beforeBlur = null } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const handleWheel = () => {
      beforeBlur?.();
      node.blur();
    };

    node.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      node.removeEventListener("wheel", handleWheel);
    };
  }, [beforeBlur]);

  return ref;
}

function PassiveWheelBlurSelect(props) {
  const selectRef = usePassiveWheelBlur();

  return <select ref={selectRef} {...props} />;
}

function ControlHelpTrigger({
  definition,
  isOpen,
  registerTrigger,
  onDesktopEnter,
  onDesktopLeave,
  onFocus,
  onBlur,
  onClick,
}) {
  if (!definition.title) {
    return null;
  }

  const tooltipId = `baryon-control-help-${definition.key}`;

  return (
    <button
      ref={(node) => registerTrigger(definition.key, node)}
      type="button"
      className="baryon-controls-help-trigger"
      aria-label={`Show help for ${definition.label}`}
      aria-expanded={isOpen}
      aria-describedby={isOpen ? tooltipId : undefined}
      data-testid={`advanced-controls-help-trigger-${definition.key}`}
      onPointerEnter={onDesktopEnter}
      onPointerLeave={onDesktopLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
    >
      <HelpIcon />
    </button>
  );
}

/**
 * Editable number input paired with a range slider.
 * Maintains a local draft so the user can type freely (e.g. "0.") without
 * the value snapping back mid-edit; commits and clamps on blur.
 */
function SliderWithNumberInput({ controlId, definition, value, onChange }) {
  const binding = definition.binding ?? {};
  const min = binding.min ?? 0;
  const max = binding.max ?? 100;
  const step = binding.step ?? 1;
  const sliderAriaLabel = `${definition.label} slider`;
  const numberInputAriaLabel = `${definition.label} value`;

  // Local draft state lets the user type partial values without interruption
  const [draft, setDraft] = useState(null);
  const skipBlurCommitRef = useRef(false);
  const sliderRef = usePassiveWheelBlur();
  const numberInputRef = usePassiveWheelBlur({
    beforeBlur: useCallback(() => {
      skipBlurCommitRef.current = true;
    }, []),
  });

  // When the slider (or an external update) changes the committed value,
  // discard any stale draft so the field shows the new value
  const committedValue = Number(value);
  const displayValue = draft ?? String(committedValue);
  const clampValue = (nextValue) => Math.min(max, Math.max(min, nextValue));
  const fillRange = max - min;
  const fillPercent =
    Number.isFinite(committedValue) && fillRange > 0
      ? Math.min(100, Math.max(0, ((committedValue - min) / fillRange) * 100))
      : 0;
  /** @type {import("react").CSSProperties & Record<"--baryon-slider-fill", string>} */
  const sliderStyle = { "--baryon-slider-fill": `${fillPercent}%` };

  function commitDraft(rawString) {
    setDraft(null);
    const parsed = parseFloat(rawString);
    if (!isNaN(parsed)) {
      onChange(clampValue(parsed));
    }
  }

  return (
    <>
      <input
        ref={numberInputRef}
        id={controlId}
        aria-label={numberInputAriaLabel}
        className="baryon-controls-number-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseFloat(event.target.value);
          if (!isNaN(parsed)) {
            onChange(clampValue(parsed));
          }
        }}
        onBlur={(event) => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            setDraft(null);
            return;
          }
          commitDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitDraft(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
      />
      <span className="baryon-controls-slider-row">
        <input
          ref={sliderRef}
          aria-label={sliderAriaLabel}
          className="baryon-controls-slider"
          type="range"
          min={min}
          max={max}
          step={step}
          style={sliderStyle}
          value={committedValue}
          onChange={(event) => {
            setDraft(null);
            onChange(Number(event.target.value));
          }}
        />
      </span>
    </>
  );
}

function ControlField({
  definition,
  value,
  onChange,
  controlStatus = null,
  activeHelpKey,
  registerHelpTrigger,
  onHelpPointerEnter,
  onHelpPointerLeave,
  onHelpFocus,
  onHelpBlur,
  onHelpClick,
}) {
  const binding = definition.binding ?? {};
  const controlId = `baryon-control-${definition.key}`;
  const helpTrigger = (
    <ControlHelpTrigger
      definition={definition}
      isOpen={activeHelpKey === definition.key}
      registerTrigger={registerHelpTrigger}
      onDesktopEnter={() => onHelpPointerEnter(definition.key)}
      onDesktopLeave={onHelpPointerLeave}
      onFocus={() => onHelpFocus(definition.key)}
      onBlur={onHelpBlur}
      onClick={() => onHelpClick(definition.key)}
    />
  );
  const labelWrap = (
    <span className="baryon-controls-row-label-wrap">
      <label className="baryon-controls-row-label" htmlFor={controlId}>
        {definition.label}
      </label>
      {controlStatus ? (
        <span
          className="baryon-controls-status"
          data-state={controlStatus.state}
          data-testid={`advanced-controls-status-${definition.key}`}
          aria-label={`${definition.label}: ${controlStatus.label}`}
        >
          {controlStatus.label}
        </span>
      ) : null}
      {helpTrigger}
    </span>
  );

  if (
    binding.view === "toggle" ||
    typeof definition.defaultValue === "boolean"
  ) {
    const toggle = (
      <span className="baryon-controls-toggle">
        <input
          id={controlId}
          aria-label={definition.label}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="baryon-controls-toggle-track">
          <span className="baryon-controls-toggle-thumb" />
        </span>
      </span>
    );

    if (definition.pinnedPlacement === "section-header") {
      return (
        <span className="baryon-controls-group-header-control">
          <label className="baryon-controls-row-label" htmlFor={controlId}>
            {definition.label}
          </label>
          {helpTrigger}
          {toggle}
        </span>
      );
    }

    return (
      <div className="baryon-controls-row">
        {labelWrap}
        {toggle}
      </div>
    );
  }

  if (binding.view === "color") {
    return (
      <div className="baryon-controls-row">
        {labelWrap}
        <span className="baryon-controls-color-row">
          <span className="baryon-controls-color-value">{String(value)}</span>
          <input
            id={controlId}
            aria-label={definition.label}
            className="baryon-controls-color"
            type="color"
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </span>
      </div>
    );
  }

  if (binding.options && binding.view === "segmented") {
    const options = Object.entries(binding.options);
    const selectedIndex = options.findIndex(
      ([, optionValue]) => String(value) === String(optionValue),
    );
    /** @type {import("react").CSSProperties & Record<"--segment-count" | "--segment-index", number>} */
    const segmentedStyle = {
      "--segment-count": options.length,
      "--segment-index": Math.max(0, selectedIndex),
    };

    return (
      <div className="baryon-controls-row baryon-controls-row--wide">
        <span className="baryon-controls-row-label-wrap">
          <span className="baryon-controls-row-label" id={`${controlId}-label`}>
            {definition.label}
          </span>
          {helpTrigger}
        </span>
        <div
          className="baryon-controls-segmented"
          role="radiogroup"
          aria-labelledby={`${controlId}-label`}
          data-has-selection={selectedIndex >= 0 ? "true" : "false"}
          style={segmentedStyle}
        >
          <span
            className="baryon-controls-segmented-thumb"
            aria-hidden="true"
          />
          {options.map(([label, optionValue]) => {
            const selected = String(value) === String(optionValue);
            return (
              <button
                key={optionValue}
                type="button"
                className="baryon-controls-segmented-option"
                role="radio"
                aria-checked={selected}
                data-selected={selected ? "true" : "false"}
                onClick={() => onChange(optionValue)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (binding.options) {
    return (
      <div className="baryon-controls-row">
        {labelWrap}
        <PassiveWheelBlurSelect
          id={controlId}
          aria-label={definition.label}
          className="baryon-controls-select"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {Object.entries(binding.options).map(([label, optionValue]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </PassiveWheelBlurSelect>
      </div>
    );
  }

  if (typeof definition.defaultValue === "number") {
    return (
      <div className="baryon-controls-row baryon-controls-row--slider">
        {labelWrap}
        <SliderWithNumberInput
          controlId={controlId}
          definition={definition}
          value={value}
          onChange={onChange}
        />
      </div>
    );
  }

  return (
    <div className="baryon-controls-row">
      {labelWrap}
      <input
        id={controlId}
        aria-label={definition.label}
        className="baryon-controls-text-input"
        type="text"
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function getDefinitionValue(definition, controlsState) {
  if (typeof definition.getValue === "function") {
    return definition.getValue(controlsState);
  }

  return controlsState[definition.key];
}

function applyDefinitionChange(
  definition,
  nextValue,
  controlsState,
  updateControl,
) {
  if (typeof definition.applyChange === "function") {
    definition.applyChange(nextValue, controlsState, updateControl);
    return;
  }

  updateControl(definition.key, nextValue);
}

function ControlFieldsList({
  controls,
  controlsState,
  controlStatuses,
  onChange,
  activeHelpKey,
  registerHelpTrigger,
  onHelpPointerEnter,
  onHelpPointerLeave,
  onHelpFocus,
  onHelpBlur,
  onHelpClick,
}) {
  const handleDefinitionChange = useCallback(
    (definition, nextValue) =>
      applyDefinitionChange(definition, nextValue, controlsState, onChange),
    [controlsState, onChange],
  );

  return controls.map((definition) => (
    <ControlField
      key={definition.key}
      definition={definition}
      value={getDefinitionValue(definition, controlsState)}
      controlStatus={controlStatuses[definition.key] ?? null}
      onChange={(nextValue) => handleDefinitionChange(definition, nextValue)}
      activeHelpKey={activeHelpKey}
      registerHelpTrigger={registerHelpTrigger}
      onHelpPointerEnter={onHelpPointerEnter}
      onHelpPointerLeave={onHelpPointerLeave}
      onHelpFocus={onHelpFocus}
      onHelpBlur={onHelpBlur}
      onHelpClick={onHelpClick}
    />
  ));
}

function ControlGroup({
  group,
  isFiltering,
  controlsState,
  controlStatuses,
  onChange,
  activeHelpKey,
  registerHelpTrigger,
  onHelpPointerEnter,
  onHelpPointerLeave,
  onHelpFocus,
  onHelpBlur,
  onHelpClick,
}) {
  const [isExpanded, setIsExpanded] = useState(group.expanded);
  const headerControl = group.controls.find(
    (definition) => definition.pinnedPlacement === "section-header",
  );
  const contentControls = headerControl
    ? group.controls.filter((definition) => definition !== headerControl)
    : group.controls;
  const showContent = isExpanded || isFiltering;
  const helpEventHandlers = {
    activeHelpKey,
    registerHelpTrigger,
    onHelpPointerEnter,
    onHelpPointerLeave,
    onHelpFocus,
    onHelpBlur,
    onHelpClick,
  };

  return (
    <section className="baryon-controls-group">
      <div className="baryon-controls-group-header">
        <button
          type="button"
          className="baryon-controls-group-toggle"
          aria-expanded={showContent}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <span className="baryon-controls-chevron" aria-hidden="true">
            <ChevronIcon />
          </span>
          <span className="baryon-controls-group-title">{group.title}</span>
          <span className="baryon-controls-group-count">
            {group.controls.length}
          </span>
        </button>
        {headerControl ? (
          <ControlField
            definition={headerControl}
            value={getDefinitionValue(headerControl, controlsState)}
            controlStatus={controlStatuses[headerControl.key] ?? null}
            onChange={(nextValue) =>
              applyDefinitionChange(
                headerControl,
                nextValue,
                controlsState,
                onChange,
              )
            }
            {...helpEventHandlers}
          />
        ) : null}
      </div>
      {showContent && contentControls.length > 0 ? (
        <div className="baryon-controls-group-content">
          <ControlFieldsList
            controls={contentControls}
            controlsState={controlsState}
            controlStatuses={controlStatuses}
            onChange={onChange}
            {...helpEventHandlers}
          />
        </div>
      ) : null}
    </section>
  );
}

export default function AdvancedControlsSidebar({
  folderGroups,
  presetsAreaControls = [],
  controlsState,
  controlStatuses = {},
  presets,
  presetName,
  selectedPresetName,
  isOpen,
  setPresetName,
  updateControl,
  resetControls,
  savePreset,
  loadPreset,
  deletePreset,
  onClose,
  dockWidth,
  triggerRef,
  showUiInFullscreen = false,
  onShowUiInFullscreenChange = null,
  footerActions = [],
  footerAccessory = null,
  onOpenFeedback = null,
}) {
  /** @type {import("react").CSSProperties & { "--baryon-controls-dock-width": string }} */
  const dockStyle = {
    "--baryon-controls-dock-width": dockWidth,
  };
  const helpTriggerRefs = useRef(new Map());
  const helpOverlayRef = useRef(null);
  const helpOpenTimerRef = useRef(null);
  const helpCloseTimerRef = useRef(null);
  const shellRef = useRef(null);
  const scrollRef = useRef(null);
  const lastScrollInteractionAtRef = useRef(Number.NEGATIVE_INFINITY);
  const wasOpenRef = useRef(isOpen);
  const [hasHoverSupport, setHasHoverSupport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const [activeHelpKey, setActiveHelpKey] = useState("");
  const [activeHelpPosition, setActiveHelpPosition] = useState(null);
  const [pendingPresetDeletion, setPendingPresetDeletion] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const normalizedFilter = filterQuery.trim().toLowerCase();
  const isFiltering = normalizedFilter.length > 0;
  const selectedPreset =
    presets.find((preset) => preset.name === selectedPresetName) ?? null;
  const canDeleteSelectedPreset = Boolean(selectedPresetName && selectedPreset);
  const trimmedPresetName = presetName.trim();
  const replacesExistingPreset = presets.some(
    (preset) => preset.name === trimmedPresetName,
  );
  const isConfirmingPresetDeletion =
    canDeleteSelectedPreset && pendingPresetDeletion === selectedPresetName;
  const presetCountLabel =
    presets.length === 1 ? "1 saved" : `${presets.length} saved`;
  const fullscreenControl = useMemo(() => {
    if (typeof onShowUiInFullscreenChange !== "function") {
      return null;
    }

    return {
      key: "showUiInFullscreen",
      label: "Fullscreen UI",
      title:
        "Keep Baryon's controls visible while fullscreen is active. Press F to enter or exit fullscreen.",
      defaultValue: false,
      binding: { view: "toggle" },
      getValue: () => showUiInFullscreen === true,
      applyChange: (nextValue) =>
        onShowUiInFullscreenChange(Boolean(nextValue)),
    };
  }, [onShowUiInFullscreenChange, showUiInFullscreen]);
  const settingsGroups = useMemo(() => {
    if (!fullscreenControl) {
      return folderGroups;
    }

    const outputIndex = folderGroups.findIndex(
      (group) => group.title === "Output",
    );
    if (outputIndex >= 0) {
      return folderGroups.map((group, index) =>
        index === outputIndex
          ? {
              ...group,
              controls: [...group.controls, fullscreenControl],
            }
          : group,
      );
    }

    const outputGroup = {
      title: "Output",
      expanded: false,
      controls: [fullscreenControl],
    };
    const diagnosticsIndex = folderGroups.findIndex(
      (group) => group.title === "Diagnostics",
    );
    if (diagnosticsIndex < 0) {
      return [...folderGroups, outputGroup];
    }

    return [
      ...folderGroups.slice(0, diagnosticsIndex),
      outputGroup,
      ...folderGroups.slice(diagnosticsIndex),
    ];
  }, [folderGroups, fullscreenControl]);
  const displayGroups = useMemo(() => {
    if (!isFiltering) {
      return settingsGroups;
    }

    return settingsGroups.flatMap((group) => {
      const controls = group.controls.filter((definition) =>
        `${definition.label} ${group.title}`
          .toLowerCase()
          .includes(normalizedFilter),
      );
      return controls.length > 0 ? [{ ...group, controls }] : [];
    });
  }, [isFiltering, normalizedFilter, settingsGroups]);
  const filterMatchCount = useMemo(
    () =>
      displayGroups.reduce((total, group) => total + group.controls.length, 0),
    [displayGroups],
  );

  const helpDefinitions = new Map();
  for (const group of [
    ...settingsGroups,
    { title: "Performance", controls: presetsAreaControls },
  ]) {
    for (const definition of group.controls) {
      if (definition.title) {
        helpDefinitions.set(definition.key, definition);
      }
    }
  }

  const activeHelpDefinition = activeHelpKey
    ? (helpDefinitions.get(activeHelpKey) ?? null)
    : null;

  const clearPendingHelpOpen = useCallback(() => {
    if (helpOpenTimerRef.current !== null) {
      window.clearTimeout(helpOpenTimerRef.current);
      helpOpenTimerRef.current = null;
    }
  }, []);

  const clearPendingHelpClose = useCallback(() => {
    if (helpCloseTimerRef.current !== null) {
      window.clearTimeout(helpCloseTimerRef.current);
      helpCloseTimerRef.current = null;
    }
  }, []);

  const closeHelp = useCallback(() => {
    clearPendingHelpOpen();
    clearPendingHelpClose();
    setActiveHelpKey("");
    setActiveHelpPosition(null);
  }, [clearPendingHelpClose, clearPendingHelpOpen]);

  const scheduleHelpClose = useCallback(() => {
    clearPendingHelpOpen();
    clearPendingHelpClose();
    helpCloseTimerRef.current = window.setTimeout(() => {
      helpCloseTimerRef.current = null;
      setActiveHelpKey("");
      setActiveHelpPosition(null);
    }, CLOSE_HELP_DELAY_MS);
  }, [clearPendingHelpClose, clearPendingHelpOpen]);

  const openHelp = useCallback(
    (key) => {
      clearPendingHelpOpen();
      clearPendingHelpClose();
      setActiveHelpKey((current) => (current === key ? current : key));
    },
    [clearPendingHelpClose, clearPendingHelpOpen],
  );

  const scheduleHelpOpen = useCallback(
    (key) => {
      clearPendingHelpOpen();
      clearPendingHelpClose();
      helpOpenTimerRef.current = window.setTimeout(() => {
        helpOpenTimerRef.current = null;
        setActiveHelpKey((current) => (current === key ? current : key));
      }, OPEN_HELP_DELAY_MS);
    },
    [clearPendingHelpClose, clearPendingHelpOpen],
  );

  const toggleHelp = useCallback(
    (key) => {
      clearPendingHelpOpen();
      clearPendingHelpClose();
      setActiveHelpPosition(null);
      setActiveHelpKey((current) => (current === key ? "" : key));
    },
    [clearPendingHelpClose, clearPendingHelpOpen],
  );

  const registerHelpTrigger = useCallback((key, node) => {
    if (node) {
      helpTriggerRefs.current.set(key, node);
    } else {
      helpTriggerRefs.current.delete(key);
    }
  }, []);

  const refreshHelpPosition = useCallback(() => {
    if (!activeHelpKey || !helpOverlayRef.current) {
      return;
    }

    const trigger = helpTriggerRefs.current.get(activeHelpKey);
    if (!trigger) {
      return;
    }

    const tooltipRect = helpOverlayRef.current.getBoundingClientRect();
    const nextPosition = resolveAdvancedControlsHelpPosition({
      anchorRect: trigger.getBoundingClientRect(),
      tooltipRect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    setActiveHelpPosition((current) => {
      if (
        current &&
        current.left === nextPosition.left &&
        current.top === nextPosition.top &&
        current.horizontal === nextPosition.horizontal &&
        current.vertical === nextPosition.vertical
      ) {
        return current;
      }
      return nextPosition;
    });
  }, [activeHelpKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const handleChange = () => {
      setHasHoverSupport(mediaQuery.matches);
    };

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    const scrollPanel = scrollRef.current;
    if (typeof scrollPanel?.scrollTo === "function") {
      scrollPanel.scrollTo({ top: 0, behavior: "auto" });
    } else if (scrollPanel) {
      scrollPanel.scrollTop = 0;
    }
  }, [normalizedFilter]);

  useEffect(() => {
    if (!isOpen) {
      closeHelp();
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (activeHelpKey) {
          closeHelp();
          return;
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeHelpKey, closeHelp, isOpen, onClose]);

  useEffect(() => {
    if (!activeHelpKey) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const trigger = helpTriggerRefs.current.get(activeHelpKey);
      if (trigger?.contains(target)) {
        return;
      }

      if (helpOverlayRef.current?.contains(target)) {
        return;
      }

      closeHelp();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [activeHelpKey, closeHelp]);

  useEffect(() => {
    if (!activeHelpKey) {
      return undefined;
    }

    refreshHelpPosition();

    window.addEventListener("resize", refreshHelpPosition);

    return () => {
      window.removeEventListener("resize", refreshHelpPosition);
    };
  }, [activeHelpKey, refreshHelpPosition]);

  useEffect(
    () => () => {
      clearPendingHelpOpen();
      clearPendingHelpClose();
    },
    [clearPendingHelpClose, clearPendingHelpOpen],
  );

  useEffect(() => {
    const scrollNode = scrollRef.current;
    if (!isOpen || !scrollNode) {
      return undefined;
    }

    lastScrollInteractionAtRef.current = Number.NEGATIVE_INFINITY;

    const handleWheel = () => {
      const nowMs =
        typeof globalThis.performance?.now === "function"
          ? globalThis.performance.now()
          : Date.now();
      if (
        nowMs - lastScrollInteractionAtRef.current <
        SCROLL_INTERACTION_MARK_INTERVAL_MS
      ) {
        return;
      }
      lastScrollInteractionAtRef.current = nowMs;
      noteAdvancedControlsInteraction("scroll");
    };

    scrollNode.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      scrollNode.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      wasOpenRef.current = isOpen;
      return;
    }

    const shouldRestoreFocus =
      !isOpen &&
      wasOpenRef.current &&
      document.activeElement instanceof HTMLElement &&
      shell.contains(document.activeElement);

    shell.inert = !isOpen;

    if (shouldRestoreFocus) {
      triggerRef?.current?.focus({ preventScroll: true });
    }

    wasOpenRef.current = isOpen;
  }, [isOpen, triggerRef]);

  const helpEventHandlers = {
    onHelpPointerEnter: (key) => {
      if (hasHoverSupport) scheduleHelpOpen(key);
    },
    onHelpPointerLeave: () => {
      if (hasHoverSupport) scheduleHelpClose();
    },
    onHelpFocus: (key) => openHelp(key),
    onHelpBlur: () => scheduleHelpClose(),
    onHelpClick: (key) => {
      if (hasHoverSupport) {
        openHelp(key);
        return;
      }
      toggleHelp(key);
    },
  };

  return (
    <>
      <style>{CSS}</style>
      <aside
        className="baryon-controls-sidebar"
        data-open={isOpen ? "true" : "false"}
        data-testid="advanced-controls-sidebar"
        style={dockStyle}
      >
        <div
          ref={shellRef}
          className="baryon-controls-shell"
          data-open={isOpen ? "true" : "false"}
        >
          <header className="baryon-controls-header">
            <p className="baryon-controls-header-label">Settings</p>
            <button
              type="button"
              className="baryon-controls-close-button"
              onClick={onClose}
              aria-label="Close settings"
              title="Close settings"
            >
              <CloseIcon />
            </button>
          </header>

          <div className="baryon-controls-filter">
            <span className="baryon-controls-filter-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              className="baryon-controls-filter-input"
              type="text"
              aria-label="Filter controls"
              placeholder="Filter controls"
              autoComplete="off"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && filterQuery) {
                  event.stopPropagation();
                  setFilterQuery("");
                }
              }}
            />
            {filterQuery ? (
              <button
                type="button"
                className="baryon-controls-filter-clear"
                aria-label="Clear filter"
                onClick={() => setFilterQuery("")}
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="baryon-controls-scroll"
            onPointerEnter={() => noteAdvancedControlsInteraction("hover")}
            onPointerDownCapture={() =>
              noteAdvancedControlsInteraction("pointer")
            }
            onFocusCapture={() => noteAdvancedControlsInteraction("focus")}
            onKeyDownCapture={() => noteAdvancedControlsInteraction("keyboard")}
          >
            {!isFiltering ? (
              <section className="baryon-controls-presets" aria-label="Presets">
                <header className="baryon-controls-presets-header">
                  <p className="baryon-controls-section-label">Presets</p>
                  <span
                    className="baryon-controls-presets-count"
                    aria-label={presetCountLabel}
                  >
                    {presetCountLabel}
                  </span>
                </header>
                <div className="baryon-controls-preset-surface">
                  {presets.length > 0 ? (
                    <div className="baryon-controls-preset-current">
                      <label
                        className="baryon-controls-preset-field-label"
                        htmlFor="baryon-saved-presets"
                      >
                        Current preset
                      </label>
                      <div
                        className="baryon-controls-preset-row"
                        data-has-delete={
                          canDeleteSelectedPreset ? "true" : "false"
                        }
                      >
                        <PassiveWheelBlurSelect
                          id="baryon-saved-presets"
                          aria-label="Saved presets"
                          className="baryon-controls-select"
                          value={selectedPresetName || ""}
                          onChange={(event) => {
                            setPendingPresetDeletion("");
                            if (event.target.value) {
                              loadPreset(event.target.value);
                            }
                          }}
                        >
                          <option value="">Live — unsaved</option>
                          {presets.map((preset) => (
                            <option key={preset.name} value={preset.name}>
                              {preset.name}
                            </option>
                          ))}
                        </PassiveWheelBlurSelect>
                        {canDeleteSelectedPreset ? (
                          <button
                            type="button"
                            className="baryon-controls-icon-button"
                            data-variant={
                              isConfirmingPresetDeletion
                                ? "danger-confirm"
                                : "danger"
                            }
                            aria-label={
                              isConfirmingPresetDeletion
                                ? `Confirm delete ${selectedPresetName}`
                                : `Delete ${selectedPresetName}`
                            }
                            title={
                              isConfirmingPresetDeletion
                                ? `Confirm delete ${selectedPresetName}`
                                : `Delete ${selectedPresetName}`
                            }
                            onClick={() => {
                              if (isConfirmingPresetDeletion) {
                                deletePreset(selectedPresetName);
                                setPendingPresetDeletion("");
                                return;
                              }
                              setPendingPresetDeletion(selectedPresetName);
                            }}
                          >
                            {isConfirmingPresetDeletion ? (
                              <CheckIcon />
                            ) : (
                              <TrashIcon />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="baryon-controls-preset-empty"
                      role="status"
                      aria-label="No saved presets"
                    >
                      <span
                        className="baryon-controls-preset-empty-mark"
                        aria-hidden="true"
                      >
                        <PresetStackIcon />
                      </span>
                      <span className="baryon-controls-preset-empty-copy">
                        <strong>No presets yet</strong>
                        <span>Name this setup below to keep it for later.</span>
                      </span>
                    </div>
                  )}
                  <form
                    className="baryon-controls-preset-capture"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (trimmedPresetName) {
                        setPendingPresetDeletion("");
                        savePreset();
                      }
                    }}
                  >
                    <div className="baryon-controls-preset-capture-heading">
                      <label
                        className="baryon-controls-preset-capture-label"
                        htmlFor="baryon-preset-name"
                      >
                        Save current settings
                      </label>
                      <span className="baryon-controls-preset-capture-hint">
                        All controls
                      </span>
                    </div>
                    <div className="baryon-controls-preset-composer">
                      <input
                        id="baryon-preset-name"
                        aria-label="Preset name"
                        className="baryon-controls-text-input"
                        type="text"
                        autoComplete="off"
                        placeholder="Name this preset"
                        value={presetName}
                        onChange={(event) => setPresetName(event.target.value)}
                      />
                      <button
                        type="submit"
                        className="baryon-controls-save-button"
                        disabled={!trimmedPresetName}
                        aria-label={
                          replacesExistingPreset
                            ? `Replace ${trimmedPresetName}`
                            : "Save preset"
                        }
                        title={
                          replacesExistingPreset
                            ? `Replace ${trimmedPresetName}`
                            : "Save preset"
                        }
                      >
                        {replacesExistingPreset ? "Replace" : "Save"}
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            ) : null}

            {!isFiltering && presetsAreaControls.length > 0 ? (
              <section
                className="baryon-controls-presets"
                aria-label="Performance"
              >
                <header className="baryon-controls-presets-header">
                  <p className="baryon-controls-section-label">Performance</p>
                </header>
                <ControlFieldsList
                  controls={presetsAreaControls}
                  controlsState={controlsState}
                  controlStatuses={controlStatuses}
                  onChange={updateControl}
                  activeHelpKey={activeHelpKey}
                  registerHelpTrigger={registerHelpTrigger}
                  {...helpEventHandlers}
                />
              </section>
            ) : null}

            {displayGroups.map((group) => (
              <ControlGroup
                key={group.title}
                group={group}
                isFiltering={isFiltering}
                controlsState={controlsState}
                controlStatuses={controlStatuses}
                onChange={updateControl}
                activeHelpKey={activeHelpKey}
                registerHelpTrigger={registerHelpTrigger}
                {...helpEventHandlers}
              />
            ))}

            {isFiltering && filterMatchCount === 0 ? (
              <p className="baryon-controls-filter-empty">
                No controls match “{filterQuery.trim()}”.
              </p>
            ) : null}

            <footer className="baryon-controls-footer">
              <div className="baryon-controls-footer-buttons">
                <button
                  type="button"
                  className="baryon-controls-footer-button"
                  onClick={() => {
                    setPendingPresetDeletion("");
                    resetControls();
                  }}
                  title="Restore default settings"
                >
                  Reset all
                </button>
                {typeof onOpenFeedback === "function" ? (
                  <button
                    type="button"
                    className="baryon-controls-footer-button"
                    onClick={onOpenFeedback}
                    title="Report a bug or share feedback"
                  >
                    <BugIcon />
                    <span>Feedback</span>
                  </button>
                ) : (
                  <a
                    className="baryon-controls-footer-button"
                    href={BUG_REPORT_URL}
                    target="_blank"
                    rel="noreferrer"
                    title="Report a bug or share feedback on GitHub"
                  >
                    <BugIcon />
                    <span>Feedback</span>
                  </a>
                )}
              </div>
              {footerAccessory}
              <div className="baryon-controls-footer-meta">
                <nav
                  className="baryon-controls-footer-links"
                  aria-label="Resources"
                >
                  {RESOURCE_LINKS.map((link) => (
                    <a
                      key={link.href}
                      className="baryon-controls-footer-text-link"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                  {footerActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="baryon-controls-footer-text-link"
                      onClick={action.onSelect}
                    >
                      {action.label}
                    </button>
                  ))}
                </nav>
                <div className="baryon-controls-footer-social">
                  {SOCIAL_LINKS.map((link) => (
                    <a
                      key={link.href}
                      className="baryon-controls-footer-social-link"
                      data-brand={link.icon}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={link.label}
                      title={link.label}
                    >
                      <SocialIcon name={link.icon} />
                    </a>
                  ))}
                </div>
              </div>
            </footer>
          </div>
        </div>
      </aside>

      {activeHelpDefinition ? (
        <div
          ref={helpOverlayRef}
          id={`baryon-control-help-${activeHelpDefinition.key}`}
          role="tooltip"
          className="baryon-controls-help-tooltip"
          data-testid="advanced-controls-help-tooltip"
          data-visible={activeHelpPosition ? "true" : "false"}
          style={{
            left: activeHelpPosition?.left ?? -9999,
            top: activeHelpPosition?.top ?? -9999,
            transformOrigin: activeHelpPosition?.transformOrigin ?? "left top",
          }}
          onPointerEnter={clearPendingHelpClose}
          onPointerLeave={scheduleHelpClose}
        >
          <p className="baryon-controls-help-tooltip-label">
            {activeHelpDefinition.label}
          </p>
          <p className="baryon-controls-help-tooltip-copy">
            {activeHelpDefinition.title}
          </p>
        </div>
      ) : null}
    </>
  );
}
