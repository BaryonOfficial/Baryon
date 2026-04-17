import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";
import { DEVTOOLS_ENABLED } from "../devtools/config.js";
import AdvancedControlsSidebar from "./AdvancedControlsSidebar.jsx";
import { getVisibleControlLayout } from "./hooks/baryonControlsState.js";
import {
  useControlsActions,
  useControlsSnapshot,
} from "../controls/useControlsStore.js";

const DEFAULT_DOCK_WIDTH = "min(17.5rem, calc(100vw - 2.4rem))";

function ControlsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="18" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AdvancedControlsDock({
  visible = true,
  operatorControlKeys = [],
  dockWidth = DEFAULT_DOCK_WIDTH,
  onOpenChange = null,
}) {
  const controlsState = useControlsSnapshot(
    (snapshot) => snapshot.controlsState,
  );
  const presets = useControlsSnapshot((snapshot) => snapshot.presets);
  const presetName = useControlsSnapshot((snapshot) => snapshot.presetName);
  const selectedPresetName = useControlsSnapshot(
    (snapshot) => snapshot.selectedPresetName,
  );
  const {
    updateControl,
    resetControls,
    setPresetName,
    savePreset,
    loadPreset,
    deletePreset,
  } = useControlsActions();
  const triggerRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  const { folderGroups, presetsAreaControls } = useMemo(
    () =>
      getVisibleControlLayout({
        devtoolsEnabled: DEVTOOLS_ENABLED,
        method:
          controlsState.visualizationMethod ?? DEFAULT_VISUALIZATION_METHOD,
        operatorControlKeys,
      }),
    [controlsState.visualizationMethod, operatorControlKeys],
  );

  useEffect(() => {
    if (typeof onOpenChange !== "function") {
      return undefined;
    }

    onOpenChange(isOpen);
    return () => {
      onOpenChange(false);
    };
  }, [isOpen, onOpenChange]);

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

  if (!visible) {
    return null;
  }

  const isPhoneViewport = viewportWidth <= 640;
  const overlayTopInset = isPhoneViewport ? "0.7rem" : "0.9rem";
  const openControlsToggleStyle =
    /** @type {import("react").CSSProperties} */ ({
      position: "absolute",
      top: overlayTopInset,
      left: `calc(${dockWidth} + 0.15rem)`,
      zIndex: 59,
      width: "2rem",
      height: "2.35rem",
      border: "1px solid var(--nd-border-visible)",
      borderRadius: "0 0.9rem 0.9rem 0",
      borderLeft: "0",
      background: "var(--nd-surface)",
      color: "var(--nd-text-primary)",
      boxShadow: "var(--nd-shell-shadow)",
      cursor: "pointer",
    });
  const closedControlsToggleStyle =
    /** @type {import("react").CSSProperties} */ ({
      position: "absolute",
      top: isPhoneViewport
        ? overlayTopInset
        : "var(--app-floating-control-top)",
      left: "var(--app-floating-control-left)",
      zIndex: 59,
      width: "var(--app-floating-control-size)",
      height: "var(--app-floating-control-size)",
      border: "var(--app-floating-control-border)",
      borderRadius: "var(--app-floating-control-radius)",
      background: "var(--app-floating-control-background)",
      color: "var(--app-floating-control-color)",
      backdropFilter: "var(--app-floating-control-backdrop)",
      boxShadow: "var(--app-floating-control-shadow)",
      cursor: "pointer",
    });
  const controlsToggleStyle = isOpen
    ? openControlsToggleStyle
    : closedControlsToggleStyle;

  return (
    <>
      <div style={controlsToggleStyle}>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Toggle advanced controls"
          data-testid="advanced-controls-trigger"
          aria-expanded={isOpen}
          onClick={() => {
            setIsLoaded(true);
            setIsOpen((current) => !current);
          }}
          title={isOpen ? "Hide advanced controls" : "Show advanced controls"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <ControlsIcon />
        </button>
      </div>

      {!isOpen && !isPhoneViewport ? (
        <div
          style={{
            position: "absolute",
            top: "var(--app-floating-control-top)",
            left: `calc(var(--app-floating-control-left) + var(--app-floating-control-size) + 0.6rem)`,
            zIndex: 61,
            display: "flex",
            alignItems: "center",
            height: "var(--app-floating-control-size)",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontFamily: "Orbitron, sans-serif",
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "var(--nd-text-display)",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
            }}
          >
            Baryon | Cymatics
          </span>
        </div>
      ) : null}

      {isLoaded ? (
        <AdvancedControlsSidebar
          folderGroups={folderGroups}
          presetsAreaControls={presetsAreaControls}
          controlsState={controlsState}
          presets={presets}
          presetName={presetName}
          selectedPresetName={selectedPresetName}
          isOpen={isOpen}
          setPresetName={setPresetName}
          updateControl={updateControl}
          resetControls={resetControls}
          savePreset={savePreset}
          loadPreset={loadPreset}
          deletePreset={deletePreset}
          onClose={() => {
            setIsOpen(false);
          }}
          dockWidth={dockWidth}
          triggerRef={triggerRef}
        />
      ) : null}
    </>
  );
}
