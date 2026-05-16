import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveAdvancedControlsHelpPosition } from "./advancedControlsHelpPosition.js";
import {
  UI_INTERACTION_SOURCES,
  dispatchBaryonUiInteraction,
} from "./uiInteractionEvents.js";

const CLOSE_HELP_DELAY_MS = 110;
const OPEN_HELP_DELAY_MS = 180;
const INFO_LINKS = [
  {
    href: "https://github.com/BaryonOfficial/Baryon",
    label: "Source",
  },
  {
    href: "https://github.com/BaryonOfficial/Baryon/blob/main/LICENSING.md",
    label: "License",
  },
  {
    href: "https://x.com/kyledcollins",
    label: "X",
  },
  {
    href: "https://www.instagram.com/baryon.eth/",
    label: "Instagram",
  },
];

const COMPACT_SECTION_LABELS = {
  mode: "Mode",
  visuals: "Visuals",
  output: "Output",
  diagnostics: "Debug",
};

function resolveCompactSectionId(groupTitle) {
  switch (groupTitle) {
    case "Mode":
      return "mode";
    case "Shape":
    case "Color":
    case "Logo":
    case "Motion":
      return "visuals";
    case "Display":
      return "output";
    case "Diagnostics":
      return "diagnostics";
    default:
      return "visuals";
  }
}

function buildCompactSections(folderGroups, presetsAreaControls) {
  const sectionMap = new Map(
    Object.entries(COMPACT_SECTION_LABELS).map(([id, label]) => [
      id,
      {
        id,
        label,
        groups: [],
        includePresets: id === "mode",
        includePerformance: id === "output" && presetsAreaControls.length > 0,
      },
    ]),
  );

  for (const group of folderGroups) {
    const sectionId = resolveCompactSectionId(group.title);
    sectionMap.get(sectionId)?.groups.push(group);
  }

  return Array.from(sectionMap.values()).filter(
    (section) =>
      section.groups.length > 0 ||
      section.includePresets ||
      section.includePerformance,
  );
}

const CSS = `
.baryon-controls-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 70;
  width: var(--baryon-controls-dock-width);
  padding: 0.55rem 0 0.55rem 0.55rem;
  pointer-events: none;
  visibility: hidden;
}

.baryon-controls-sidebar[data-open="true"] {
  visibility: visible;
}

.baryon-controls-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  padding: 0.42rem;
  background: var(--nd-surface);
  border: 1px solid var(--nd-border-visible);
  border-radius: 1.05rem;
  box-shadow: var(--nd-shell-shadow);
  color: var(--nd-text-primary);
  font-family: "Aspekta", system-ui, sans-serif;
  transform: translateX(calc(-100% - 0.75rem));
  opacity: 0;
  visibility: hidden;
  transition:
    transform 220ms ease,
    opacity 220ms ease,
    visibility 220ms ease;
  pointer-events: auto;
  overflow: hidden;
  contain: layout paint style;
  transform-style: preserve-3d;
}

.baryon-controls-shell[data-open="true"] {
  transform: translateX(0);
  opacity: 1;
  visibility: visible;
}

.baryon-controls-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.45rem;
  padding: 0.08rem 0.08rem 0.16rem;
  padding-bottom: 0.32rem;
}

.baryon-controls-header-text {
  min-width: 0;
}

.baryon-controls-header-label {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nd-text-display);
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.baryon-controls-header-note {
  margin: 0.12rem 0 0;
  font-size: 0.64rem;
  line-height: 1.35;
  color: var(--nd-text-secondary);
}

.baryon-controls-close-button {
  min-height: 1.5rem;
  padding: 0.26rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--nd-border-visible);
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.baryon-controls-close-button:hover {
  background: var(--nd-surface-raised);
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.baryon-controls-pill-button,
.baryon-controls-danger-button {
  min-height: 1.5rem;
  padding: 0.26rem 0.46rem;
  border-radius: 999px;
  border: 1px solid var(--nd-border-visible);
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.57rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.baryon-controls-pill-button:hover,
.baryon-controls-danger-button:hover {
  background: var(--nd-surface-raised);
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
}

.baryon-controls-danger-button {
  color: var(--nd-accent);
}

.baryon-controls-scroll {
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
  gap: 0.28rem;
  padding-right: 0.05rem;
}

.baryon-controls-scroll::-webkit-scrollbar {
  width: 0.45rem;
}

.baryon-controls-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--nd-border-visible);
}

.baryon-controls-presets,
.baryon-controls-group {
  border: 1px solid var(--nd-border);
  background: var(--nd-surface-raised);
  border-radius: 0.8rem;
}

.baryon-controls-compact-nav {
  display: flex;
  flex: 0 0 auto;
  gap: 0.28rem;
  align-items: center;
  padding: 0.2rem;
  margin: 0 0.12rem 0.22rem;
  overflow-x: auto;
  scrollbar-width: none;
  border: 1px solid var(--nd-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--nd-surface-raised) 82%, #E8DFD0 4%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 0 0 1px rgba(255, 255, 255, 0.02);
}

.baryon-controls-compact-nav::-webkit-scrollbar {
  display: none;
}

.baryon-controls-compact-tab {
  min-height: 1.92rem;
  padding: 0.36rem 0.78rem;
  border: 1px solid rgba(255, 255, 255, 0.02);
  border-radius: 999px;
  background: transparent;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.baryon-controls-compact-tab[data-active="true"] {
  background: var(--nd-text-display);
  border-color: var(--nd-text-display);
  color: var(--nd-black);
  box-shadow:
    0 0.18rem 0.55rem rgba(0, 0, 0, 0.18),
    inset 0 -1px 0 rgba(0, 0, 0, 0.08);
}

.baryon-controls-compact-tab:not([data-active="true"]):hover {
  border-color: var(--nd-border-visible);
  color: var(--nd-text-display);
  background: rgba(255, 255, 255, 0.025);
}

.baryon-controls-presets {
  padding: 0.38rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.baryon-controls-section-label {
  margin: 0;
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.baryon-controls-field,
.baryon-controls-row {
  display: flex;
  gap: 0.26rem;
}

.baryon-controls-field {
  flex-direction: column;
}

.baryon-controls-row {
  align-items: center;
  flex-wrap: wrap;
}

.baryon-controls-text-input,
.baryon-controls-select {
  width: 100%;
  min-height: 1.52rem;
  border-radius: 0.5rem;
  border: 1px solid var(--nd-border-visible);
  background: var(--nd-surface-raised);
  color: var(--nd-text-primary);
  padding: 0.24rem 0.44rem;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.61rem;
  letter-spacing: 0.04em;
  box-sizing: border-box;
}

.baryon-controls-select {
  color-scheme: dark;
  background-color: var(--nd-surface-raised);
}

.baryon-controls-select option {
  background-color: var(--nd-surface-raised);
  color: var(--nd-text-primary);
}

.baryon-controls-text-input::placeholder {
  color: var(--nd-text-disabled);
}

.baryon-controls-group-toggle {
  width: 100%;
  padding: 0.4rem 0.46rem;
  background: transparent;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.baryon-controls-group-toggle:hover {
  background: rgba(255, 255, 255, 0.02);
}

.baryon-controls-group-title {
  font-size: 0.69rem;
  font-weight: 650;
}

.baryon-controls-group-count {
  font-size: 0.54rem;
  color: var(--nd-text-disabled);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.baryon-controls-chevron {
  font-size: 0.54rem;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.baryon-controls-group-content {
  padding: 0 0.38rem 0.38rem;
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
}

.baryon-controls-card {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  padding: 0.34rem 0.38rem;
  border-radius: 0.58rem;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.baryon-controls-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.baryon-controls-card-title-row {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  min-width: 0;
}

.baryon-controls-card-text {
  min-width: 0;
}

.baryon-controls-card-label {
  font-size: 0.56rem;
  font-weight: 700;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.baryon-controls-help-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.88rem;
  height: 0.88rem;
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
  width: 0.5rem;
  height: 0.5rem;
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

.baryon-controls-help-tooltip[data-visible="false"] {
  visibility: hidden;
}

.baryon-controls-help-tooltip-label {
  margin: 0 0 0.18rem;
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nd-text-secondary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.baryon-controls-help-tooltip-copy {
  margin: 0;
  font-size: 0.65rem;
  line-height: 1.42;
  color: var(--nd-text-primary);
}

.baryon-controls-toggle {
  position: relative;
  width: 1.95rem;
  height: 1.22rem;
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
  pointer-events: none;
  transition: background 140ms ease;
}

.baryon-controls-toggle-thumb {
  position: absolute;
  top: 0.12rem;
  left: 0.12rem;
  width: 0.94rem;
  height: 0.94rem;
  border-radius: 999px;
  background: #E8DFD0;
  pointer-events: none;
  transition: transform 140ms ease;
}

.baryon-controls-toggle input:checked + .baryon-controls-toggle-track {
  background: var(--nd-text-display);
}

.baryon-controls-toggle input:checked + .baryon-controls-toggle-track .baryon-controls-toggle-thumb {
  transform: translateX(0.68rem);
}

.baryon-controls-slider-row {
  display: flex;
  align-items: center;
  gap: 0.32rem;
}

.baryon-controls-slider {
  flex: 1;
  accent-color: #E8DFD0;
}

.baryon-controls-number-input {
  width: 3.1rem;
  min-width: 3.1rem;
  padding: 0.14rem 0.28rem;
  border-radius: 0.36rem;
  border: 1px solid var(--nd-border-visible);
  background: var(--nd-surface-raised);
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
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

.baryon-controls-color-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.baryon-controls-color {
  width: 1.65rem;
  height: 1.45rem;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.baryon-controls-color-value {
  font-size: 0.62rem;
  color: var(--nd-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: "JetBrains Mono", ui-monospace, monospace;
}

.baryon-controls-footer {
  display: grid;
  gap: 0.3rem;
  padding: 0.38rem;
  border: 1px solid var(--nd-border);
  background: var(--nd-surface-raised);
  border-radius: 0.8rem;
}

.baryon-controls-footer-links {
  display: grid;
  gap: 0.28rem;
}

.baryon-controls-footer-links a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
  min-height: 1.52rem;
  padding: 0.32rem 0.44rem;
  border: 1px solid var(--nd-border-visible);
  border-radius: 0.62rem;
  background: rgba(255, 255, 255, 0.02);
  color: var(--nd-text-primary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 0.54rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
}

.baryon-controls-footer-links a:hover {
  border-color: var(--nd-text-display);
  color: var(--nd-text-display);
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
    height: min(80vh, calc(100dvh - 0.9rem));
    max-height: min(80vh, calc(100dvh - 0.9rem));
    gap: 0.28rem;
    padding: 0.42rem;
    border-radius: 1.2rem;
    transform: translateY(calc(100% + 0.75rem));
  }

  .baryon-controls-shell[data-open="true"] {
    transform: translateY(0);
  }

  .baryon-controls-header {
    position: sticky;
    top: 0;
    z-index: 1;
    gap: 0.45rem;
    padding: 0.08rem 0.08rem 0.16rem;
    padding-bottom: 0.32rem;
    background: var(--nd-surface);
  }

  .baryon-controls-header-label {
    font-size: 0.68rem;
  }

  .baryon-controls-compact-nav {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    justify-content: center;
    overflow: hidden;
  }

  .baryon-controls-compact-tab {
    width: 100%;
    justify-content: center;
    text-align: center;
  }

  .baryon-controls-header-note {
    margin-top: 0.12rem;
    font-size: 0.64rem;
    line-height: 1.35;
  }

  .baryon-controls-close-button {
    min-height: 1.5rem;
    padding: 0.26rem 0.5rem;
  }

  .baryon-controls-scroll {
    gap: 0.28rem;
  }

  .baryon-controls-presets,
  .baryon-controls-group,
  .baryon-controls-footer {
    border-radius: 0.8rem;
  }

  .baryon-controls-presets {
    padding: 0.38rem;
    gap: 0.3rem;
  }

  .baryon-controls-section-label {
    font-size: 0.54rem;
    letter-spacing: 0.14em;
  }

  .baryon-controls-field,
  .baryon-controls-row {
    gap: 0.26rem;
  }

  .baryon-controls-text-input,
  .baryon-controls-select {
    min-height: 1.52rem;
    padding: 0.24rem 0.44rem;
    border-radius: 0.5rem;
    font-size: 0.61rem;
  }

  .baryon-controls-pill-button,
  .baryon-controls-danger-button {
    min-height: 1.5rem;
    padding: 0.26rem 0.46rem;
    font-size: 0.57rem;
  }

  .baryon-controls-group-content {
    display: block;
    padding: 0 0.38rem 0.38rem;
    gap: 0.26rem;
  }

  .baryon-controls-group-toggle {
    padding: 0.4rem 0.46rem;
    gap: 0.5rem;
  }

  .baryon-controls-group-title {
    font-size: 0.69rem;
  }

  .baryon-controls-group-count,
  .baryon-controls-chevron {
    font-size: 0.54rem;
  }

  .baryon-controls-card {
    gap: 0.18rem;
    padding: 0.34rem 0.38rem;
    border-radius: 0.58rem;
  }

  .baryon-controls-card-label {
    font-size: 0.56rem;
    letter-spacing: 0.08em;
  }

  .baryon-controls-help-trigger {
    width: 0.88rem;
    height: 0.88rem;
  }

  .baryon-controls-help-trigger svg {
    width: 0.5rem;
    height: 0.5rem;
  }

  .baryon-controls-slider-row {
    gap: 0.32rem;
  }

  .baryon-controls-number-input {
    width: 3.1rem;
    min-width: 3.1rem;
    padding: 0.14rem 0.28rem;
    font-size: 0.58rem;
    text-align: right;
  }

  .baryon-controls-color-row {
    flex-wrap: wrap;
  }

  .baryon-controls-footer-links {
    grid-template-columns: 1fr;
  }

  .baryon-controls-footer-links a {
    min-height: 1.52rem;
    padding: 0.32rem 0.44rem;
    font-size: 0.54rem;
  }
}

@media (max-width: 1024px) and (min-width: 641px) {
  .baryon-controls-sidebar {
    inset: 0 auto 0 0;
    width: var(--baryon-controls-dock-width);
    padding: 0.55rem 0 0.55rem 0.55rem;
  }

  .baryon-controls-shell {
    width: 100%;
    height: 100%;
    max-height: none;
    gap: 0.28rem;
    padding: 0.42rem;
    border-radius: 1.05rem;
    transform: translateX(calc(-100% - 0.8rem));
  }

  .baryon-controls-header {
    gap: 0.45rem;
    padding: 0.08rem 0.08rem 0.16rem;
    padding-bottom: 0.32rem;
  }

  .baryon-controls-header-note {
    margin-top: 0.12rem;
    font-size: 0.64rem;
    line-height: 1.35;
  }

  .baryon-controls-close-button {
    min-height: 1.5rem;
    padding: 0.26rem 0.5rem;
  }

  .baryon-controls-scroll {
    gap: 0.28rem;
  }

  .baryon-controls-presets,
  .baryon-controls-group,
  .baryon-controls-footer {
    border-radius: 0.8rem;
  }

  .baryon-controls-presets {
    padding: 0.38rem;
    gap: 0.3rem;
  }

  .baryon-controls-section-label {
    font-size: 0.54rem;
    letter-spacing: 0.14em;
  }

  .baryon-controls-field,
  .baryon-controls-row {
    gap: 0.26rem;
  }

  .baryon-controls-text-input,
  .baryon-controls-select {
    min-height: 1.52rem;
    padding: 0.24rem 0.44rem;
    border-radius: 0.5rem;
    font-size: 0.61rem;
  }

  .baryon-controls-pill-button,
  .baryon-controls-danger-button {
    min-height: 1.5rem;
    padding: 0.26rem 0.46rem;
    font-size: 0.57rem;
  }

  .baryon-controls-group-content {
    display: block;
    padding: 0 0.38rem 0.38rem;
    gap: 0.26rem;
  }

  .baryon-controls-group-toggle {
    padding: 0.4rem 0.46rem;
    gap: 0.5rem;
  }

  .baryon-controls-group-title {
    font-size: 0.69rem;
  }

  .baryon-controls-group-count,
  .baryon-controls-chevron {
    font-size: 0.54rem;
  }

  .baryon-controls-card {
    gap: 0.18rem;
    padding: 0.34rem 0.38rem;
    border-radius: 0.58rem;
  }

  .baryon-controls-card-label {
    font-size: 0.56rem;
    letter-spacing: 0.08em;
  }

  .baryon-controls-help-trigger {
    width: 0.88rem;
    height: 0.88rem;
  }

  .baryon-controls-help-trigger svg {
    width: 0.5rem;
    height: 0.5rem;
  }

  .baryon-controls-slider-row {
    gap: 0.32rem;
  }

  .baryon-controls-number-input {
    width: 3.1rem;
    min-width: 3.1rem;
    padding: 0.14rem 0.28rem;
    font-size: 0.58rem;
  }

  .baryon-controls-footer-links {
    grid-template-columns: 1fr;
  }

  .baryon-controls-footer-links a {
    min-height: 1.52rem;
    padding: 0.32rem 0.44rem;
    font-size: 0.54rem;
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

  function commitDraft(rawString) {
    setDraft(null);
    const parsed = parseFloat(rawString);
    if (!isNaN(parsed)) {
      onChange(clampValue(parsed));
    }
  }

  return (
    <span className="baryon-controls-slider-row">
      <input
        ref={sliderRef}
        aria-label={sliderAriaLabel}
        className="baryon-controls-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={committedValue}
        onChange={(event) => {
          setDraft(null);
          onChange(Number(event.target.value));
        }}
      />
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
    </span>
  );
}

function ControlField({
  definition,
  value,
  onChange,
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

  if (binding.view === "toggle") {
    return (
      <div className="baryon-controls-card">
        <div className="baryon-controls-card-header">
          <span className="baryon-controls-card-text">
            <span className="baryon-controls-card-title-row">
              <label className="baryon-controls-card-label" htmlFor={controlId}>
                {definition.label}
              </label>
              {helpTrigger}
            </span>
          </span>
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
        </div>
      </div>
    );
  }

  if (typeof definition.defaultValue === "boolean") {
    return (
      <div className="baryon-controls-card">
        <div className="baryon-controls-card-header">
          <span className="baryon-controls-card-text">
            <span className="baryon-controls-card-title-row">
              <label className="baryon-controls-card-label" htmlFor={controlId}>
                {definition.label}
              </label>
              {helpTrigger}
            </span>
          </span>
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
        </div>
      </div>
    );
  }

  if (binding.view === "color") {
    return (
      <div className="baryon-controls-card">
        <div className="baryon-controls-card-title-row">
          <label className="baryon-controls-card-label" htmlFor={controlId}>
            {definition.label}
          </label>
          {helpTrigger}
        </div>
        <span className="baryon-controls-color-row">
          <input
            id={controlId}
            aria-label={definition.label}
            className="baryon-controls-color"
            type="color"
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="baryon-controls-color-value">{String(value)}</span>
        </span>
      </div>
    );
  }

  if (binding.options) {
    return (
      <div className="baryon-controls-card">
        <div className="baryon-controls-card-title-row">
          <label className="baryon-controls-card-label" htmlFor={controlId}>
            {definition.label}
          </label>
          {helpTrigger}
        </div>
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
      <div className="baryon-controls-card">
        <div className="baryon-controls-card-title-row">
          <label className="baryon-controls-card-label" htmlFor={controlId}>
            {definition.label}
          </label>
          {helpTrigger}
        </div>
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
    <div className="baryon-controls-card">
      <div className="baryon-controls-card-title-row">
        <label className="baryon-controls-card-label" htmlFor={controlId}>
          {definition.label}
        </label>
        {helpTrigger}
      </div>
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

function ControlGroup({
  group,
  controlsState,
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
  const handleDefinitionChange = useCallback(
    (definition, nextValue) =>
      applyDefinitionChange(definition, nextValue, controlsState, onChange),
    [controlsState, onChange],
  );

  return (
    <section className="baryon-controls-group">
      <button
        type="button"
        className="baryon-controls-group-toggle"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span>
          <span className="baryon-controls-group-title">{group.title}</span>
          <span className="baryon-controls-group-count">
            {" "}
            {group.controls.length} controls
          </span>
        </span>
        <span className="baryon-controls-chevron">
          {isExpanded ? "−" : "+"}
        </span>
      </button>
      {isExpanded ? (
        <div className="baryon-controls-group-content">
          {group.controls.map((definition) => (
            <ControlField
              key={definition.key}
              definition={definition}
              value={getDefinitionValue(definition, controlsState)}
              onChange={(nextValue) =>
                handleDefinitionChange(definition, nextValue)
              }
              activeHelpKey={activeHelpKey}
              registerHelpTrigger={registerHelpTrigger}
              onHelpPointerEnter={onHelpPointerEnter}
              onHelpPointerLeave={onHelpPointerLeave}
              onHelpFocus={onHelpFocus}
              onHelpBlur={onHelpBlur}
              onHelpClick={onHelpClick}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function AdvancedControlsSidebar({
  folderGroups,
  presetsAreaControls = [],
  controlsState,
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
  const wasOpenRef = useRef(isOpen);
  const [hasHoverSupport, setHasHoverSupport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const [activeHelpKey, setActiveHelpKey] = useState("");
  const [activeHelpPosition, setActiveHelpPosition] = useState(null);
  const compactSections = useMemo(
    () => buildCompactSections(folderGroups, presetsAreaControls),
    [folderGroups, presetsAreaControls],
  );
  const isCompactInspector = viewportWidth <= 640;
  const [activeCompactSectionId, setActiveCompactSectionId] = useState(
    () => compactSections[0]?.id ?? "mode",
  );
  const selectedPreset =
    presets.find((preset) => preset.name === selectedPresetName) ?? null;
  const canDeleteSelectedPreset = Boolean(
    selectedPresetName && !selectedPreset?.builtIn,
  );

  const helpDefinitions = new Map();
  for (const group of [
    ...folderGroups,
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
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (
      !compactSections.some((section) => section.id === activeCompactSectionId)
    ) {
      setActiveCompactSectionId(compactSections[0]?.id ?? "mode");
    }
  }, [activeCompactSectionId, compactSections]);

  useEffect(() => {
    if (!isCompactInspector) {
      return;
    }

    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeCompactSectionId, isCompactInspector]);

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

    const handleWheel = () => {
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
  const activeCompactSection =
    compactSections.find((section) => section.id === activeCompactSectionId) ??
    compactSections[0] ??
    null;

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
            <div className="baryon-controls-header-text">
              <p className="baryon-controls-header-label">
                Baryon | Advanced Controls
              </p>
              <p className="baryon-controls-header-note">
                Tune the cymatic visuals
              </p>
            </div>
            <button
              type="button"
              className="baryon-controls-close-button"
              onClick={onClose}
            >
              Close
            </button>
          </header>

          {isCompactInspector ? (
            <div
              className="baryon-controls-compact-nav"
              aria-label="Control sections"
            >
              {compactSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="baryon-controls-compact-tab"
                  data-active={
                    section.id === (activeCompactSection?.id ?? "")
                      ? "true"
                      : "false"
                  }
                  onClick={() => setActiveCompactSectionId(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            ref={scrollRef}
            className="baryon-controls-scroll"
            onPointerEnter={() => noteAdvancedControlsInteraction("hover")}
            onPointerDownCapture={() =>
              noteAdvancedControlsInteraction("pointer")
            }
            onFocusCapture={() => noteAdvancedControlsInteraction("focus")}
            onKeyDownCapture={() =>
              noteAdvancedControlsInteraction("keyboard")
            }
          >
            {(!isCompactInspector || activeCompactSection?.includePresets) && (
              <section className="baryon-controls-presets">
                <p className="baryon-controls-section-label">Presets</p>
                <label className="baryon-controls-field">
                  <span className="baryon-controls-card-label">
                    Preset name
                  </span>
                  <input
                    aria-label="Preset name"
                    className="baryon-controls-text-input"
                    type="text"
                    placeholder="Save current look"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                  />
                </label>
                <div className="baryon-controls-row">
                  <button
                    type="button"
                    className="baryon-controls-pill-button"
                    onClick={savePreset}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="baryon-controls-danger-button"
                    onClick={resetControls}
                  >
                    Reset to Defaults
                  </button>
                </div>
                <label className="baryon-controls-field">
                  <span className="baryon-controls-card-label">
                    Load preset
                  </span>
                  <PassiveWheelBlurSelect
                    aria-label="Load preset"
                    className="baryon-controls-select"
                    value={selectedPresetName}
                    onChange={(event) => loadPreset(event.target.value)}
                  >
                    <option value="">Select a preset</option>
                    {presets.map((preset) => (
                      <option key={preset.name} value={preset.name}>
                        {preset.name}
                      </option>
                    ))}
                  </PassiveWheelBlurSelect>
                </label>
                <button
                  type="button"
                  className="baryon-controls-danger-button"
                  disabled={!canDeleteSelectedPreset}
                  onClick={() => {
                    if (canDeleteSelectedPreset) {
                      deletePreset(selectedPresetName);
                    }
                  }}
                >
                  Delete selected
                </button>
              </section>
            )}

            {(!isCompactInspector ||
              activeCompactSection?.includePerformance) &&
            presetsAreaControls.length > 0 ? (
              <section className="baryon-controls-presets">
                <p className="baryon-controls-section-label">Performance</p>
                {presetsAreaControls.map((definition) => (
                  <ControlField
                    key={definition.key}
                    definition={definition}
                    value={getDefinitionValue(definition, controlsState)}
                    onChange={(nextValue) =>
                      applyDefinitionChange(
                        definition,
                        nextValue,
                        controlsState,
                        updateControl,
                      )
                    }
                    activeHelpKey={activeHelpKey}
                    registerHelpTrigger={registerHelpTrigger}
                    onHelpPointerEnter={helpEventHandlers.onHelpPointerEnter}
                    onHelpPointerLeave={helpEventHandlers.onHelpPointerLeave}
                    onHelpFocus={helpEventHandlers.onHelpFocus}
                    onHelpBlur={helpEventHandlers.onHelpBlur}
                    onHelpClick={helpEventHandlers.onHelpClick}
                  />
                ))}
              </section>
            ) : null}

            {(isCompactInspector
              ? (activeCompactSection?.groups ?? [])
              : folderGroups
            ).map((group) => (
              <ControlGroup
                key={group.title}
                group={group}
                controlsState={controlsState}
                onChange={updateControl}
                activeHelpKey={activeHelpKey}
                registerHelpTrigger={registerHelpTrigger}
                {...helpEventHandlers}
              />
            ))}

            <section className="baryon-controls-footer">
              <p className="baryon-controls-section-label">Info</p>
              <div className="baryon-controls-footer-links">
                {INFO_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            </section>
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
