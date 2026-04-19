import { useEffect, useState } from "react";
import { CAMERA_VIEW_PRESETS } from "./cameraPosePresets.js";
import { useDraggableFloatingUi } from "./hooks/useDraggableFloatingUi.js";

function CameraIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h4l1.5-2h5L16 7h4v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function TopViewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4.5v13" />
      <path d="m6.8 12.3 5.2 5.2 5.2-5.2" />
    </svg>
  );
}

function SideViewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19.5 12H6.8" />
      <path d="m11.8 6.8-5.2 5.2 5.2 5.2" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.708" />
      <path d="M3 4v4h4" />
    </svg>
  );
}

/**
 * @param {{
 *   activePreset: "top-down" | "side",
 *   onPresetSelect?: ((preset: "top-down" | "side") => void) | null,
 *   onPresetReset?: (() => void) | null,
 *   rootTestId?: string,
 *   topButtonTestId?: string,
 *   sideButtonTestId?: string,
 *   resetButtonTestId?: string,
 *   zIndex?: number,
 *   position?: "absolute" | "fixed",
 * }} props
 */
export default function FloatingCameraControls({
  activePreset,
  onPresetSelect = null,
  onPresetReset = null,
  rootTestId = "camera-controls",
  topButtonTestId = "camera-top-view-button",
  sideButtonTestId = "camera-side-view-button",
  resetButtonTestId = "camera-reset-view-button",
  zIndex = 61,
  position = "absolute",
}) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const {
    dragOffset,
    isDragging,
    handlePointerDown,
    handlePointerUp,
    handleDoubleClick,
  } = useDraggableFloatingUi();

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

  const isPhoneViewport = viewportWidth <= 640;
  const topInset = isPhoneViewport ? "0.7rem" : "0.9rem";
  const resolvedPosition = isPhoneViewport ? "fixed" : position;

  return (
    <div
      data-testid={rootTestId}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      title="Drag to move. Double-click or double-tap to reset."
      style={{
        position: resolvedPosition,
        top: topInset,
        left: "50%",
        transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
        zIndex,
        boxSizing: "border-box",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: isPhoneViewport ? "0.16rem" : "0.22rem",
        padding: isPhoneViewport ? "0.16rem" : "0.18rem",
        maxWidth: isPhoneViewport ? "calc(100vw - 1rem)" : "calc(100vw - 2rem)",
        borderRadius: "999px",
        border: "1px solid var(--nd-border-visible)",
        background: "var(--nd-surface)",
        color: "var(--nd-text-primary)",
        boxShadow: "var(--nd-shell-shadow)",
        willChange: isDragging ? "transform" : "auto",
        cursor: isDragging ? "grabbing" : "grab",
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: isPhoneViewport ? "1.45rem" : "1.55rem",
          minHeight: "1.7rem",
          padding: 0,
          background: "transparent",
          color: "var(--nd-text-secondary)",
          flex: "0 0 auto",
        }}
        aria-hidden="true"
      >
        <CameraIcon />
      </span>
      {[
        {
          key: CAMERA_VIEW_PRESETS.topDown,
          label: "Top",
          icon: <TopViewIcon />,
          testId: topButtonTestId,
        },
        {
          key: CAMERA_VIEW_PRESETS.side,
          label: "Side",
          icon: <SideViewIcon />,
          testId: sideButtonTestId,
        },
      ].map((preset) => {
        const active = activePreset === preset.key;
        return (
          <button
            key={preset.key}
            type="button"
            data-testid={preset.testId}
            data-state={active ? "active" : "idle"}
            aria-pressed={active}
            aria-label={`${preset.label} view`}
            onClick={() => onPresetSelect?.(preset.key)}
            title={`${preset.label} view`}
            style={{
              minHeight: "1.7rem",
              minWidth: isPhoneViewport ? "1.75rem" : undefined,
              padding: isPhoneViewport ? 0 : "0 0.7rem",
              borderRadius: "999px",
              border: active
                ? "1px solid var(--nd-text-display)"
                : "1px solid var(--nd-border-visible)",
              background: active ? "var(--nd-text-display)" : "transparent",
              color: active ? "var(--nd-black)" : "var(--nd-text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: isPhoneViewport
                ? undefined
                : '"Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: isPhoneViewport ? undefined : "0.62rem",
              letterSpacing: isPhoneViewport ? undefined : "0.12em",
              textTransform: isPhoneViewport ? undefined : "uppercase",
              fontWeight: isPhoneViewport ? undefined : 700,
              cursor: "pointer",
            }}
          >
            {isPhoneViewport ? preset.icon : preset.label}
          </button>
        );
      })}
      <button
        type="button"
        data-testid={resetButtonTestId}
        data-state="idle"
        aria-label="Reset camera"
        onClick={() => onPresetReset?.()}
        title="Reset camera"
        style={{
          minHeight: "1.7rem",
          minWidth: isPhoneViewport ? "1.75rem" : undefined,
          padding: isPhoneViewport ? 0 : "0 0.68rem",
          borderRadius: "999px",
          border: "1px solid var(--nd-border-visible)",
          background: "transparent",
          color: "var(--nd-text-secondary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: isPhoneViewport
            ? undefined
            : '"Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: isPhoneViewport ? undefined : "0.62rem",
          letterSpacing: isPhoneViewport ? undefined : "0.12em",
          textTransform: isPhoneViewport ? undefined : "uppercase",
          fontWeight: isPhoneViewport ? undefined : 700,
          cursor: "pointer",
        }}
      >
        {isPhoneViewport ? <ResetIcon /> : "Reset"}
      </button>
    </div>
  );
}
