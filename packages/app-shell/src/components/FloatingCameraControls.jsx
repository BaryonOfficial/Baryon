import { useEffect, useState } from "react";
import { CAMERA_VIEW_PRESETS } from "./cameraPosePresets.js";
import { useDraggableFloatingUi } from "./hooks/useDraggableFloatingUi.js";

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.32 5.32A1.8 1.8 0 0 1 9.84 4.5h4.32c.61 0 1.18.31 1.52.82l.84 1.26c.13.19.34.3.56.3h1.25c1.75 0 3.17 1.42 3.17 3.17v6.28c0 1.75-1.42 3.17-3.17 3.17H5.67a3.17 3.17 0 0 1-3.17-3.17v-6.28c0-1.75 1.42-3.17 3.17-3.17h1.25c.22 0 .43-.11.56-.3l.84-1.26ZM12 16.38a4.12 4.12 0 1 0 0-8.24 4.12 4.12 0 0 0 0 8.24Z"
      />
      <circle cx="12" cy="12.26" r="2.15" fill="var(--nd-text-display)" />
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

function LockIcon({ locked }) {
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
      <rect x="5" y="11" width="14" height="9" rx="2" />
      {locked ? (
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      ) : (
        <path d="M8 11V7a4 4 0 0 1 7.6-1.4" />
      )}
    </svg>
  );
}

const SEGMENT_FONT = "var(--baryon-type-mono-family)";

function formatCoordinate(value) {
  const number = Number.isFinite(value) ? Number(value) : 0;
  const normalized = Object.is(number, -0) ? 0 : number;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function resolveViewPosition(cameraPose) {
  if (!cameraPose?.position) {
    return null;
  }

  return {
    x: formatCoordinate(cameraPose?.position?.x),
    y: formatCoordinate(cameraPose?.position?.y),
    z: formatCoordinate(cameraPose?.position?.z),
  };
}

/**
 * @param {{
 *   activePreset: "top-down" | "side" | null,
 *   cameraPose?: {
 *     position?: { x?: number, y?: number, z?: number } | null,
 *   } | null,
 *   onPresetSelect?: ((preset: "top-down" | "side") => void) | null,
 *   onPresetReset?: (() => void) | null,
 *   cameraLocked?: boolean,
 *   onToggleLock?: ((nextLocked: boolean) => void) | null,
 *   rootTestId?: string,
 *   topButtonTestId?: string,
 *   sideButtonTestId?: string,
 *   resetButtonTestId?: string,
 *   lockButtonTestId?: string,
 *   zIndex?: number,
 *   position?: "absolute" | "fixed",
 * }} props
 */
export default function FloatingCameraControls({
  activePreset,
  cameraPose = null,
  onPresetSelect = null,
  onPresetReset = null,
  cameraLocked = false,
  onToggleLock = null,
  rootTestId = "camera-controls",
  topButtonTestId = "camera-top-view-button",
  sideButtonTestId = "camera-side-view-button",
  resetButtonTestId = "camera-reset-view-button",
  lockButtonTestId = "camera-lock-button",
  zIndex = 61,
  position = "absolute",
}) {
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );
  const [expanded, setExpanded] = useState(false);
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

  const presets = [
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
  ];
  const activeIndex = presets.findIndex(
    (preset) => preset.key === activePreset,
  );
  const viewPosition = resolveViewPosition(cameraPose);

  const bareIconButtonStyle = (active) => ({
    minHeight: "1.7rem",
    minWidth: isPhoneViewport ? "1.75rem" : "2rem",
    padding: 0,
    border: "none",
    background: "transparent",
    color: active ? "var(--nd-text-display)" : "var(--nd-text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flex: "0 0 auto",
  });

  return (
    <div
      data-testid={rootTestId}
      data-state={expanded ? "expanded" : "collapsed"}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
        }
      }}
      style={{
        position: resolvedPosition,
        top: topInset,
        left: "50%",
        transform: `translate(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px)`,
        zIndex,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        maxWidth: isPhoneViewport ? "calc(100vw - 1rem)" : "calc(100vw - 2rem)",
        pointerEvents: "auto",
      }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        title="Camera controls — hover to expand. Drag to move."
        aria-label="Camera controls"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.46rem",
          padding: "0.38rem 0.78rem 0.38rem 0.68rem",
          borderRadius: "999px",
          background: "var(--nd-text-display)",
          color: "var(--nd-black)",
          boxShadow: "var(--nd-shell-shadow)",
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--nd-black)",
          }}
        >
          <CameraIcon />
        </span>
        <span
          style={{
            fontFamily: SEGMENT_FONT,
            fontSize: "0.6rem",
            letterSpacing: "var(--baryon-type-data-letter-spacing)",
            fontWeight: 650,
            color: "var(--nd-black)",
          }}
        >
          Camera
        </span>
      </div>

      <div
        style={{
          overflow: "hidden",
          maxHeight: expanded ? "8rem" : 0,
          opacity: expanded ? 1 : 0,
          marginTop: expanded ? "0.45rem" : 0,
          transform: expanded ? "translateY(0)" : "translateY(-0.25rem)",
          transition:
            "max-height var(--nd-transition), opacity var(--nd-transition), transform var(--nd-transition), margin-top var(--nd-transition)",
          pointerEvents: expanded ? "auto" : "none",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            data-testid="camera-controls-panel"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: isPhoneViewport ? "0.16rem" : "0.22rem",
              padding: isPhoneViewport ? "0.18rem 0.22rem" : "0.2rem 0.24rem",
              borderRadius: "999px",
              background: "var(--nd-surface)",
              boxShadow: "var(--nd-shell-shadow)",
            }}
          >
            <button
              type="button"
              data-testid={lockButtonTestId}
              data-state={cameraLocked ? "active" : "idle"}
              aria-pressed={cameraLocked}
              aria-label={cameraLocked ? "Unlock camera" : "Lock camera"}
              onClick={() => onToggleLock?.(!cameraLocked)}
              title={
                cameraLocked
                  ? "Camera locked — orbit drag disabled. Click to unlock."
                  : "Lock camera to prevent accidental orbit drag."
              }
              style={bareIconButtonStyle(cameraLocked)}
            >
              <LockIcon locked={cameraLocked} />
            </button>
            <div
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                borderRadius: "999px",
              }}
            >
              {activeIndex >= 0 ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: "50%",
                    transform: `translateX(${activeIndex * 100}%)`,
                    transition: "transform var(--nd-transition)",
                    boxSizing: "border-box",
                    borderRadius: "999px",
                    border: "1px solid var(--nd-border-visible)",
                    background: "var(--nd-surface-raised)",
                    pointerEvents: "none",
                  }}
                />
              ) : null}
              {presets.map((preset, index) => {
                const active = index === activeIndex;
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
                      position: "relative",
                      zIndex: 1,
                      minHeight: "1.7rem",
                      minWidth: isPhoneViewport ? "2.15rem" : "2rem",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      borderRadius: "999px",
                      color: active
                        ? "var(--nd-text-display)"
                        : "var(--nd-text-secondary)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                  >
                    {preset.icon}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              data-testid={resetButtonTestId}
              data-state="idle"
              aria-label="Reset camera"
              onClick={() => onPresetReset?.()}
              title="Reset camera"
              style={bareIconButtonStyle(false)}
            >
              <ResetIcon />
            </button>
          </div>
          {viewPosition ? (
            <div
              data-testid="camera-view-readout"
              aria-label={`Camera position x ${viewPosition.x} y ${viewPosition.y} z ${viewPosition.z}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: isPhoneViewport ? "0.3rem" : "0.36rem",
                marginTop: isPhoneViewport ? "0.3rem" : "0.34rem",
                padding: 0,
                color: "var(--nd-text-secondary)",
                fontFamily: SEGMENT_FONT,
                fontSize: isPhoneViewport ? "0.5rem" : "0.52rem",
                lineHeight: 1,
                whiteSpace: "nowrap",
                opacity: 0.72,
              }}
            >
              {["x", "y", "z"].map((axis, index) => (
                <span
                  key={axis}
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: "0.18rem",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {index > 0 ? (
                    <span aria-hidden="true" style={{ opacity: 0.52 }}>
                      ·
                    </span>
                  ) : null}
                  <span style={{ color: "var(--nd-text-secondary)" }}>
                    {axis}
                  </span>
                  <span style={{ color: "var(--nd-text-display)" }}>
                    {viewPosition[axis]}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
