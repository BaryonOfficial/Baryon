import React, { useState } from "react";
import { useAudio } from "../context/AudioContext.jsx";
import { getDeviceKindOverride } from "./controls/deviceClassification.js";
import {
  createLiveInputRuntimeStatus,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_SIGNAL_STATES,
  isLiveInputTransitionLocked,
} from "../context/liveInputRuntimeStatus.js";

function getSignalBadgeStyle(status) {
  if (
    status.phase === LIVE_INPUT_PHASES.error ||
    status.signalState === LIVE_INPUT_SIGNAL_STATES.clipped
  ) {
    return {
      border: "1px solid rgba(248, 113, 113, 0.35)",
      background: "rgba(239, 68, 68, 0.16)",
      color: "rgba(255, 241, 242, 0.98)",
    };
  }
  if (status.phase === LIVE_INPUT_PHASES.weakSignal) {
    return {
      border: "1px solid rgba(252, 211, 77, 0.28)",
      background: "rgba(245, 158, 11, 0.16)",
      color: "rgba(255, 251, 235, 0.98)",
    };
  }
  if (status.phase === LIVE_INPUT_PHASES.calibrating) {
    return {
      border: "1px solid rgba(125, 211, 252, 0.3)",
      background: "rgba(56, 189, 248, 0.16)",
      color: "rgba(240, 249, 255, 0.98)",
    };
  }
  if (
    status.phase === LIVE_INPUT_PHASES.starting ||
    status.phase === LIVE_INPUT_PHASES.stopping
  ) {
    return {
      border: "1px solid rgba(255, 255, 255, 0.14)",
      background: "rgba(255, 255, 255, 0.08)",
      color: "rgba(255, 255, 255, 0.94)",
    };
  }
  return {
    border: "1px solid rgba(110, 231, 183, 0.26)",
    background: "rgba(16, 185, 129, 0.16)",
    color: "rgba(236, 253, 245, 0.98)",
  };
}

function resolveSignalLabel(status) {
  if (status.phase === LIVE_INPUT_PHASES.starting) return "Starting";
  if (status.phase === LIVE_INPUT_PHASES.stopping) return "Stopping";
  if (status.phase === LIVE_INPUT_PHASES.calibrating) return "Calibrating";
  if (
    status.phase === LIVE_INPUT_PHASES.error ||
    status.signalState === LIVE_INPUT_SIGNAL_STATES.clipped
  ) {
    return "Clipped";
  }
  if (status.phase === LIVE_INPUT_PHASES.weakSignal) {
    return status.signalState === LIVE_INPUT_SIGNAL_STATES.silent
      ? "Silent"
      : "Weak";
  }
  return "Listening";
}

const BUILTIN_MIC_PATTERNS = [
  "built-in",
  "internal",
  "macbook",
  "imac",
  "mac mini",
  "macmini",
];

function looksLikeBuiltinMic(label) {
  const l = (label || "").toLowerCase();
  return BUILTIN_MIC_PATTERNS.some((p) => l.includes(p));
}

function getSelectStyle(disabled) {
  /** @type {import("react").CSSProperties} */
  const style = {
    width: "100%",
    minWidth: 0,
    height: "1.7rem",
    padding: "0 0.45rem",
    borderRadius: "0.58rem",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: disabled
      ? "rgba(255, 255, 255, 0.03)"
      : "rgba(255, 255, 255, 0.055)",
    color: disabled ? "rgba(255, 255, 255, 0.42)" : "rgba(255, 255, 255, 0.92)",
    fontSize: "0.68rem",
    fontWeight: 500,
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
  };
  return style;
}

export default function LiveInputStatusPanel({
  top = "1rem",
  right = "1rem",
  visible = true,
  stacked = false,
  showLiveAction = false,
  deviceSelectTestId = "live-input-device-select",
  echoCancellation = false,
  noiseSuppression = false,
  autoGainControl = false,
  onMicControlChange = undefined,
}) {
  const [micSettingsOpen, setMicSettingsOpen] = useState(false);
  const [hasInteractedWithLiveAction, setHasInteractedWithLiveAction] =
    useState(false);
  const {
    selectedSource,
    isLiveInputActive,
    liveInputRuntimeStatus,
    liveInputPermissionState,
    audioDevices,
    selectedDevice,
    selectedSystemDevice,
    selectedLiveInputDeviceKind,
    setSelectedSystemDevice,
    handleSourceChange,
    handleSystemToggle,
    saveDeviceKindOverride,
    clearDeviceKindOverride,
    requestLiveInputPermission,
  } = useAudio();

  const status = createLiveInputRuntimeStatus(liveInputRuntimeStatus);
  const permissionRequesting = liveInputPermissionState === "requesting";
  const permissionDenied = liveInputPermissionState === "denied";
  const permissionUnsupported = liveInputPermissionState === "unsupported";
  const permissionUnknown = liveInputPermissionState === "unknown";
  const transitionLocked = isLiveInputTransitionLocked(liveInputRuntimeStatus);

  const selectedLiveDeviceId = selectedSystemDevice ?? selectedDevice ?? "";
  const deviceKindOverride = getDeviceKindOverride(
    selectedLiveDeviceId || null,
  );
  const deviceTypeValue = deviceKindOverride ?? "auto";
  const deviceTypeIsManual = deviceKindOverride != null;

  const selectedLiveDevice =
    audioDevices.find((d) => d.deviceId === selectedLiveDeviceId) ?? null;
  const showInterfaceHint =
    !deviceTypeIsManual &&
    selectedLiveInputDeviceKind === "live" &&
    !!selectedLiveDeviceId &&
    !looksLikeBuiltinMic(selectedLiveDevice?.label);

  // Resolved type label — describes what auto detected or what was manually set
  const resolvedTypeLabel =
    selectedLiveInputDeviceKind === "system" ? "Loopback" : "Acoustic Mic";
  const resolvedTypeLabelStyle =
    selectedLiveInputDeviceKind === "system"
      ? { color: "rgba(52, 211, 153, 0.9)" }
      : { color: "rgba(147, 197, 253, 0.88)" };

  const signalLabel =
    status.phase === LIVE_INPUT_PHASES.idle
      ? "Ready"
      : resolveSignalLabel(status);
  const signalBadgeStyle =
    status.phase === LIVE_INPUT_PHASES.idle
      ? {
          border: "1px solid rgba(255, 255, 255, 0.1)",
          background: "rgba(255, 255, 255, 0.06)",
          color: "rgba(255, 255, 255, 0.7)",
        }
      : getSignalBadgeStyle(status);

  const micProcessingDisabled = selectedLiveInputDeviceKind !== "live";
  const activeMicSettingCount = [
    echoCancellation,
    noiseSuppression,
    autoGainControl,
  ].filter(Boolean).length;
  const micProcessingSummary = micProcessingDisabled
    ? "Mic only"
    : activeMicSettingCount > 0
      ? `${activeMicSettingCount} active`
      : "Off";
  /** @type {Array<{ key: string, label: string, enabled: boolean, tooltip: string }>} */
  const micControlRows = [
    {
      key: "echoCancellation",
      label: "Echo Cancel",
      enabled: echoCancellation,
      tooltip: "Suppress speaker bleed and room echo from microphone input.",
    },
    {
      key: "noiseSuppression",
      label: "Noise Suppress",
      enabled: noiseSuppression,
      tooltip: "Reduce steady background noise before analysis.",
    },
    {
      key: "autoGainControl",
      label: "Auto Gain",
      enabled: autoGainControl,
      tooltip: "Automatically normalize microphone input level.",
    },
  ];

  const liveButtonDisabled =
    transitionLocked ||
    (!isLiveInputActive &&
      (audioDevices.length === 0 ||
        !selectedLiveDeviceId ||
        permissionRequesting ||
        permissionDenied ||
        permissionUnsupported));
  const liveActionLabel = isLiveInputActive ? "Stop Live" : "Go Live";
  const liveActionState = liveButtonDisabled
    ? "disabled"
    : isLiveInputActive
      ? "live"
      : "idle";
  const showLiveActionAttention =
    showLiveAction &&
    !hasInteractedWithLiveAction &&
    !isLiveInputActive &&
    !liveButtonDisabled;

  const handleLiveAction = async () => {
    if (liveButtonDisabled) return;
    setHasInteractedWithLiveAction(true);
    if (!isLiveInputActive && selectedSource !== "system") {
      await handleSourceChange("system");
    }
    await handleSystemToggle();
  };

  if (!visible) return null;

  return (
    <aside
      data-testid="live-input-status-panel"
      style={{
        position: stacked ? "relative" : "fixed",
        top: stacked ? "auto" : top,
        right: stacked ? "auto" : right,
        zIndex: 9998,
        pointerEvents: "auto",
        width: "min(15.25rem, calc(100vw - 1rem))",
        padding: "0.52rem 0.56rem",
        borderRadius: "0.9rem",
        border: "1px solid rgba(255, 255, 255, 0.09)",
        background: "rgba(7, 10, 16, 0.76)",
        color: "rgba(255, 255, 255, 0.95)",
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.28)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
      aria-live="polite"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          marginBottom: "0.52rem",
        }}
      >
        <span
          style={{
            fontSize: "0.58rem",
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.38)",
          }}
        >
          Input
        </span>
        <span
          style={{
            ...signalBadgeStyle,
            flexShrink: 0,
            borderRadius: "999px",
            padding: "0.18rem 0.44rem",
            fontSize: "0.56rem",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {signalLabel}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: "grid", gap: "0.4rem" }}>
        {permissionRequesting ? (
          <div
            style={{
              padding: "0.18rem 0",
              fontSize: "0.67rem",
              color: "rgba(255, 255, 255, 0.72)",
            }}
          >
            Requesting audio access…
          </div>
        ) : permissionUnknown ? (
          <div style={{ display: "grid", gap: "0.32rem" }}>
            <div
              style={{
                fontSize: "0.66rem",
                lineHeight: 1.35,
                color: "rgba(255, 255, 255, 0.72)",
              }}
            >
              Enable audio access to choose a loopback or live input device.
            </div>
            <button
              type="button"
              onClick={() => void requestLiveInputPermission()}
              style={{
                justifySelf: "start",
                height: "1.65rem",
                padding: "0 0.52rem",
                borderRadius: "999px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                background: "rgba(255, 255, 255, 0.06)",
                color: "rgba(255, 255, 255, 0.92)",
                fontSize: "0.63rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Enable Access
            </button>
          </div>
        ) : permissionDenied || permissionUnsupported ? (
          <div style={{ display: "grid", gap: "0.32rem" }}>
            <div
              style={{
                fontSize: "0.66rem",
                lineHeight: 1.35,
                color: "rgba(255, 255, 255, 0.72)",
              }}
            >
              {permissionDenied
                ? "Audio access is blocked. Retry after allowing this site."
                : "Audio access requires a secure desktop browser context."}
            </div>
            {permissionDenied ? (
              <button
                type="button"
                onClick={() => void requestLiveInputPermission()}
                style={{
                  justifySelf: "start",
                  height: "1.65rem",
                  padding: "0 0.52rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "rgba(255, 255, 255, 0.92)",
                  fontSize: "0.63rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Retry Access
              </button>
            ) : null}
          </div>
        ) : audioDevices.length === 0 ? (
          <div
            style={{ fontSize: "0.66rem", color: "rgba(255, 255, 255, 0.58)" }}
          >
            No audio input devices found
          </div>
        ) : (
          <>
            {/* Device picker */}
            <div style={{ display: "grid", gap: "0.16rem" }}>
              <span
                style={{
                  fontSize: "0.54rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.36)",
                }}
              >
                Device
              </span>
              <select
                data-testid={deviceSelectTestId}
                value={selectedLiveDeviceId}
                onChange={(event) =>
                  setSelectedSystemDevice(event.target.value)
                }
                aria-label="Live input device"
                style={{ ...getSelectStyle(false), fontSize: "0.64rem" }}
              >
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Device ${device.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Type picker */}
            <div style={{ display: "grid", gap: "0.16rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.4rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.54rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255, 255, 255, 0.36)",
                  }}
                >
                  Type
                </span>
                <span
                  style={{
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    ...resolvedTypeLabelStyle,
                  }}
                >
                  {resolvedTypeLabel}
                  <span
                    style={{
                      marginLeft: "0.3rem",
                      fontSize: "0.54rem",
                      fontWeight: 600,
                      color: deviceTypeIsManual
                        ? "rgba(251, 191, 36, 0.8)"
                        : "rgba(148, 163, 184, 0.65)",
                    }}
                  >
                    {deviceTypeIsManual ? "manual" : "auto"}
                  </span>
                </span>
              </div>
              <select
                data-testid="live-input-device-type-select"
                value={deviceTypeValue}
                disabled={!selectedLiveDeviceId}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "auto") {
                    clearDeviceKindOverride(selectedLiveDeviceId);
                  } else {
                    saveDeviceKindOverride(selectedLiveDeviceId, next);
                  }
                }}
                aria-label="Device type"
                style={{
                  ...getSelectStyle(!selectedLiveDeviceId),
                  fontSize: "0.64rem",
                }}
              >
                <option value="auto">Auto detect</option>
                <option value="live">Acoustic Mic</option>
                <option value="system">Loopback</option>
              </select>
            </div>
          </>
        )}

        {/* Mic Settings */}
        <div style={{ display: "grid", gap: "0.18rem" }}>
          <button
            type="button"
            onClick={() => setMicSettingsOpen((current) => !current)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.35rem",
              width: "100%",
              minHeight: "1.65rem",
              padding: "0.28rem 0.42rem",
              borderRadius: "0.58rem",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(255, 255, 255, 0.04)",
              color: "rgba(255, 255, 255, 0.88)",
              fontSize: "0.64rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
            aria-expanded={micSettingsOpen}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.28rem",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: "0.54rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(255, 255, 255, 0.36)",
                }}
              >
                Mic Settings
              </span>
              <span
                style={{
                  flexShrink: 0,
                  borderRadius: "999px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "rgba(255, 255, 255, 0.04)",
                  padding: "0.1rem 0.34rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "0.57rem",
                  color: micProcessingDisabled
                    ? "rgba(255, 255, 255, 0.34)"
                    : "rgba(255, 255, 255, 0.72)",
                }}
              >
                {micProcessingSummary}
              </span>
            </span>
            <span
              style={{
                flexShrink: 0,
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: "0.68rem",
              }}
            >
              {micSettingsOpen ? "▾" : "▸"}
            </span>
          </button>

          {micSettingsOpen ? (
            <div
              style={{
                display: "grid",
                gap: "0.26rem",
                padding: "0.12rem 0.02rem 0",
              }}
            >
              <div
                style={{
                  fontSize: "0.61rem",
                  lineHeight: 1.35,
                  color: "rgba(255, 255, 255, 0.48)",
                }}
              >
                {micProcessingDisabled
                  ? "These only activate when the selected device type is acoustic mic."
                  : "Mic cleanup runs only on microphone type input."}
              </div>
              {showInterfaceHint ? (
                <div
                  style={{
                    fontSize: "0.61rem",
                    lineHeight: 1.4,
                    padding: "0.3rem 0.42rem",
                    borderRadius: "0.52rem",
                    border: "1px solid rgba(251, 191, 36, 0.22)",
                    background: "rgba(251, 191, 36, 0.08)",
                    color: "rgba(253, 230, 138, 0.9)",
                  }}
                >
                  Using an audio interface? Set{" "}
                  <strong style={{ fontWeight: 650 }}>Type → Loopback</strong>{" "}
                  above to skip mic processing.
                </div>
              ) : null}
              <div style={{ display: "grid", gap: "0.18rem" }}>
                {micControlRows.map(({ key, label, enabled, tooltip }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onMicControlChange?.(key, !enabled)}
                    disabled={micProcessingDisabled}
                    title={String(tooltip)}
                    aria-label={String(label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.45rem",
                      width: "100%",
                      minHeight: "1.72rem",
                      padding: "0 0.48rem",
                      borderRadius: "0.56rem",
                      border: enabled
                        ? "1px solid rgba(122, 174, 255, 0.34)"
                        : "1px solid rgba(255, 255, 255, 0.08)",
                      background: micProcessingDisabled
                        ? "rgba(255, 255, 255, 0.03)"
                        : enabled
                          ? "rgba(122, 174, 255, 0.16)"
                          : "rgba(255, 255, 255, 0.04)",
                      color: micProcessingDisabled
                        ? "rgba(255, 255, 255, 0.28)"
                        : enabled
                          ? "rgba(224, 238, 255, 0.96)"
                          : "rgba(255, 255, 255, 0.72)",
                      fontSize: "0.62rem",
                      fontWeight: 600,
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      cursor: micProcessingDisabled ? "default" : "pointer",
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(label)}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        borderRadius: "999px",
                        padding: "0.08rem 0.34rem",
                        border: enabled
                          ? "1px solid rgba(122, 174, 255, 0.32)"
                          : "1px solid rgba(255, 255, 255, 0.08)",
                        background: enabled
                          ? "rgba(122, 174, 255, 0.14)"
                          : "rgba(255, 255, 255, 0.04)",
                        color: micProcessingDisabled
                          ? "rgba(255, 255, 255, 0.28)"
                          : enabled
                            ? "rgba(224, 238, 255, 0.92)"
                            : "rgba(255, 255, 255, 0.48)",
                        fontSize: "0.54rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {enabled ? "On" : "Off"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Live action button */}
        {showLiveAction ? (
          <div
            style={{
              display: "grid",
              gap: "0.18rem",
              paddingTop: "0.18rem",
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              marginTop: "0.08rem",
            }}
          >
            <button
              type="button"
              data-testid="source-live-button"
              data-state={liveActionState}
              onClick={() => void handleLiveAction()}
              disabled={liveButtonDisabled}
              style={{
                width: "100%",
                minHeight: "1.82rem",
                padding: "0.34rem 0.58rem",
                borderRadius: "0.66rem",
                border: isLiveInputActive
                  ? "1px solid rgba(255, 91, 82, 0.34)"
                  : "1px solid rgba(122, 174, 255, 0.24)",
                background: liveButtonDisabled
                  ? "rgba(255, 255, 255, 0.04)"
                  : isLiveInputActive
                    ? "linear-gradient(180deg, rgba(255, 91, 82, 0.22), rgba(255, 69, 58, 0.12))"
                    : "linear-gradient(180deg, rgba(122, 174, 255, 0.16), rgba(122, 174, 255, 0.08))",
                color: liveButtonDisabled
                  ? "rgba(255, 255, 255, 0.4)"
                  : isLiveInputActive
                    ? "rgba(255, 235, 235, 0.94)"
                    : "rgba(232, 242, 255, 0.94)",
                fontSize: "0.68rem",
                fontWeight: 650,
                letterSpacing: "0.01em",
                cursor: liveButtonDisabled ? "not-allowed" : "pointer",
                boxShadow: liveButtonDisabled
                  ? "none"
                  : isLiveInputActive
                    ? "0 10px 22px rgba(83, 16, 12, 0.18)"
                    : showLiveActionAttention
                      ? "0 0 0 1px rgba(147, 197, 253, 0.26), 0 14px 28px rgba(37, 99, 235, 0.22)"
                      : "0 10px 22px rgba(30, 64, 175, 0.14)",
                transition:
                  "background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
              }}
              aria-label={liveActionLabel}
              title={
                liveButtonDisabled
                  ? "Select a valid device to start live input."
                  : liveActionLabel
              }
            >
              {transitionLocked
                ? "Transitioning…"
                : selectedSource !== "system" && !isLiveInputActive
                  ? "Switch To System + Go Live"
                  : liveActionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
