import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAdvancedControlsHelpPosition } from "./advancedControlsHelpPosition.js";

const CLOSE_HELP_DELAY_MS = 110;

const CSS = `
.baryon-controls-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 60;
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
  gap: 0.4rem;
  padding: 0.5rem;
  background:
    linear-gradient(180deg, rgba(17, 21, 27, 0.9), rgba(9, 12, 17, 0.88)),
    rgba(8, 10, 14, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.05rem;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px) saturate(125%);
  -webkit-backdrop-filter: blur(12px) saturate(125%);
  color: rgba(255, 255, 255, 0.9);
  transform: translateX(calc(-100% - 0.75rem));
  opacity: 0;
  visibility: hidden;
  transition:
    transform 220ms ease,
    opacity 220ms ease,
    visibility 220ms ease;
  pointer-events: auto;
  overflow: hidden;
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
  padding: 0.04rem 0.08rem 0.12rem;
}

.baryon-controls-header-text {
  min-width: 0;
}

.baryon-controls-header-label {
  margin: 0;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.9);
}

.baryon-controls-header-note {
  margin: 0.1rem 0 0;
  font-size: 0.64rem;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.45);
}

.baryon-controls-pill-button,
.baryon-controls-danger-button {
  min-height: 1.62rem;
  padding: 0.32rem 0.54rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-size: 0.66rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.baryon-controls-pill-button:hover,
.baryon-controls-danger-button:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
}

.baryon-controls-danger-button {
  color: rgba(255, 188, 188, 0.92);
}

.baryon-controls-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-right: 0.05rem;
}

.baryon-controls-scroll::-webkit-scrollbar {
  width: 0.45rem;
}

.baryon-controls-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
}

.baryon-controls-presets,
.baryon-controls-group {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.78rem;
}

.baryon-controls-presets {
  padding: 0.48rem;
  display: flex;
  flex-direction: column;
  gap: 0.38rem;
}

.baryon-controls-section-label {
  margin: 0;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
}

.baryon-controls-field,
.baryon-controls-row {
  display: flex;
  gap: 0.34rem;
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
  min-height: 1.72rem;
  border-radius: 0.58rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  padding: 0.34rem 0.5rem;
  font: inherit;
  font-size: 0.69rem;
  box-sizing: border-box;
}

.baryon-controls-select {
  color-scheme: dark;
  background-color: rgb(18, 22, 29);
  background-image: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.06),
    rgba(255, 255, 255, 0.02)
  );
}

.baryon-controls-select option {
  background-color: rgb(18, 22, 29);
  color: rgba(245, 248, 255, 0.96);
}

.baryon-controls-text-input::placeholder {
  color: rgba(255, 255, 255, 0.34);
}

.baryon-controls-group-toggle {
  width: 100%;
  padding: 0.52rem 0.62rem;
  background: transparent;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.baryon-controls-group-toggle:hover {
  background: rgba(255, 255, 255, 0.03);
}

.baryon-controls-group-title {
  font-size: 0.71rem;
  font-weight: 650;
}

.baryon-controls-group-count {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.38);
}

.baryon-controls-chevron {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.56);
}

.baryon-controls-group-content {
  padding: 0 0.48rem 0.48rem;
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
}

.baryon-controls-card {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  padding: 0.42rem 0.46rem;
  border-radius: 0.68rem;
  background: rgba(255, 255, 255, 0.03);
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
  font-size: 0.68rem;
  font-weight: 600;
}

.baryon-controls-help-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.68);
  cursor: help;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.baryon-controls-help-trigger:hover,
.baryon-controls-help-trigger:focus-visible,
.baryon-controls-help-trigger[aria-expanded="true"] {
  background: rgba(122, 174, 255, 0.16);
  border-color: rgba(122, 174, 255, 0.42);
  color: rgba(208, 228, 255, 0.96);
  outline: none;
}

.baryon-controls-help-trigger svg {
  width: 0.56rem;
  height: 0.56rem;
}

.baryon-controls-help-tooltip {
  position: fixed;
  z-index: 80;
  width: min(13rem, calc(100vw - 1rem));
  padding: 0.56rem 0.62rem;
  border: 1px solid rgba(122, 174, 255, 0.22);
  border-radius: 0.72rem;
  background: rgba(10, 14, 20, 0.96);
  color: rgba(238, 244, 255, 0.94);
  box-shadow:
    0 16px 44px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  pointer-events: auto;
}

.baryon-controls-help-tooltip[data-visible="false"] {
  visibility: hidden;
}

.baryon-controls-help-tooltip-label {
  margin: 0 0 0.18rem;
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(140, 191, 255, 0.88);
}

.baryon-controls-help-tooltip-copy {
  margin: 0;
  font-size: 0.65rem;
  line-height: 1.42;
  color: rgba(245, 248, 255, 0.88);
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
  background: rgba(255, 255, 255, 0.16);
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
  background: #ffffff;
  pointer-events: none;
  transition: transform 140ms ease;
}

.baryon-controls-toggle input:checked + .baryon-controls-toggle-track {
  background: rgba(100, 170, 255, 0.72);
}

.baryon-controls-toggle input:checked + .baryon-controls-toggle-track .baryon-controls-toggle-thumb {
  transform: translateX(0.68rem);
}

.baryon-controls-slider-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.baryon-controls-slider {
  flex: 1;
  accent-color: #7aaeff;
}

.baryon-controls-number-input {
  width: 3.5rem;
  min-width: 3.5rem;
  padding: 0.18rem 0.32rem;
  border-radius: 0.36rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  font: inherit;
  font-size: 0.62rem;
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
  border-color: rgba(122, 174, 255, 0.42);
  background: rgba(255, 255, 255, 0.08);
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
  color: rgba(255, 255, 255, 0.66);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (max-width: 720px) {
  .baryon-controls-sidebar {
    padding: 0.35rem 0 0.35rem 0.35rem;
  }

  .baryon-controls-shell {
    border-radius: 0.9rem;
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
        onBlur={(event) => commitDraft(event.target.value)}
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
        <select
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
        </select>
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
  const helpCloseTimerRef = useRef(null);
  const shellRef = useRef(null);
  const wasOpenRef = useRef(isOpen);
  const [hasHoverSupport, setHasHoverSupport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const [activeHelpKey, setActiveHelpKey] = useState("");
  const [activeHelpPosition, setActiveHelpPosition] = useState(null);

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

  const clearPendingHelpClose = useCallback(() => {
    if (helpCloseTimerRef.current !== null) {
      window.clearTimeout(helpCloseTimerRef.current);
      helpCloseTimerRef.current = null;
    }
  }, []);

  const closeHelp = useCallback(() => {
    clearPendingHelpClose();
    setActiveHelpKey("");
    setActiveHelpPosition(null);
  }, [clearPendingHelpClose]);

  const scheduleHelpClose = useCallback(() => {
    clearPendingHelpClose();
    helpCloseTimerRef.current = window.setTimeout(() => {
      helpCloseTimerRef.current = null;
      setActiveHelpKey("");
      setActiveHelpPosition(null);
    }, CLOSE_HELP_DELAY_MS);
  }, [clearPendingHelpClose]);

  const openHelp = useCallback(
    (key) => {
      clearPendingHelpClose();
      setActiveHelpKey((current) => (current === key ? current : key));
    },
    [clearPendingHelpClose],
  );

  const toggleHelp = useCallback(
    (key) => {
      clearPendingHelpClose();
      setActiveHelpPosition(null);
      setActiveHelpKey((current) => (current === key ? "" : key));
    },
    [clearPendingHelpClose],
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

    const handleViewportChange = () => {
      refreshHelpPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeHelpKey, refreshHelpPosition]);

  useEffect(
    () => () => {
      clearPendingHelpClose();
    },
    [clearPendingHelpClose],
  );

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
      if (hasHoverSupport) openHelp(key);
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
            <div className="baryon-controls-header-text">
              <p className="baryon-controls-header-label">
                Baryon | Advanced Controls
              </p>
              <p className="baryon-controls-header-note">
                Tune the cymatic visuals
              </p>
            </div>
          </header>

          <div className="baryon-controls-scroll">
            <section className="baryon-controls-presets">
              <p className="baryon-controls-section-label">Presets</p>
              <label className="baryon-controls-field">
                <span className="baryon-controls-card-label">Preset name</span>
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
                <span className="baryon-controls-card-label">Load preset</span>
                <select
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
                </select>
              </label>
              <button
                type="button"
                className="baryon-controls-danger-button"
                onClick={() => deletePreset(selectedPresetName)}
              >
                Delete selected
              </button>
            </section>

            {presetsAreaControls.length > 0 ? (
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

            {folderGroups.map((group) => (
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
