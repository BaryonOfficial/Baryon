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
      border: "1px solid rgba(255, 59, 48, 0.5)",
      background: "rgba(255, 59, 48, 0.12)",
      color: "var(--nd-text-display)",
    };
  }
  if (status.phase === LIVE_INPUT_PHASES.weakSignal) {
    return {
      border: "1px solid rgba(255, 204, 102, 0.4)",
      background: "rgba(255, 204, 102, 0.1)",
      color: "var(--nd-text-display)",
    };
  }
  if (status.phase === LIVE_INPUT_PHASES.calibrating) {
    return {
      border: "1px solid rgba(91, 155, 246, 0.42)",
      background: "rgba(91, 155, 246, 0.1)",
      color: "var(--nd-text-display)",
    };
  }
  if (
    status.phase === LIVE_INPUT_PHASES.starting ||
    status.phase === LIVE_INPUT_PHASES.stopping
  ) {
    return {
      border: "1px solid var(--nd-border-visible)",
      background: "rgba(255, 255, 255, 0.03)",
      color: "var(--nd-text-display)",
    };
  }
  return {
    border: "1px solid rgba(74, 158, 92, 0.44)",
    background: "rgba(74, 158, 92, 0.1)",
    color: "var(--nd-text-display)",
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

function resolveDisplayStatus(status, isLiveInputActive) {
  if (isLiveInputActive || status.phase === LIVE_INPUT_PHASES.idle) {
    return status;
  }

  if (
    status.phase === LIVE_INPUT_PHASES.starting ||
    status.phase === LIVE_INPUT_PHASES.stopping ||
    status.phase === LIVE_INPUT_PHASES.calibrating ||
    status.phase === LIVE_INPUT_PHASES.error ||
    status.phase === LIVE_INPUT_PHASES.weakSignal
  ) {
    return status;
  }

  return createLiveInputRuntimeStatus({
    ...status,
    active: false,
    phase: LIVE_INPUT_PHASES.idle,
  });
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
    height: "1.85rem",
    padding: "0 0.55rem",
    borderRadius: "0.58rem",
    border: "1px solid var(--nd-border-visible)",
    background: disabled ? "rgba(255, 255, 255, 0.02)" : "#0c0c0c",
    color: disabled ? "var(--nd-text-disabled)" : "var(--nd-text-primary)",
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: "0.62rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    textTransform: "uppercase",
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
    liveInputAcousticIntent,
    setLiveInputAcousticIntent,
  } = useAudio();

  const status = resolveDisplayStatus(
    createLiveInputRuntimeStatus(liveInputRuntimeStatus),
    isLiveInputActive,
  );
  const permissionRequesting = liveInputPermissionState === "requesting";
  const permissionDenied = liveInputPermissionState === "denied";
  const permissionUnsupported = liveInputPermissionState === "unsupported";
  const permissionUnknown = liveInputPermissionState === "unknown";
  const transitionLocked = isLiveInputTransitionLocked(status);

  const runtimeSelectedLiveDeviceId = status.selectedDeviceId ?? "";
  const runtimeSelectedLiveDeviceLabel = status.selectedDeviceLabel ?? "";
  const selectedLiveDeviceId =
    selectedSystemDevice ?? selectedDevice ?? runtimeSelectedLiveDeviceId;
  const deviceKindOverride = getDeviceKindOverride(
    selectedLiveDeviceId || null,
  );
  const deviceTypeValue = deviceKindOverride ?? "auto";
  const deviceTypeIsManual = deviceKindOverride != null;

  const selectedLiveDevice =
    audioDevices.find((d) => d.deviceId === selectedLiveDeviceId) ??
    (selectedLiveDeviceId
      ? {
          deviceId: selectedLiveDeviceId,
          label: runtimeSelectedLiveDeviceLabel,
        }
      : null);
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
      ? { color: "var(--nd-success)" }
      : { color: "var(--nd-info)" };

  const signalLabel =
    status.phase === LIVE_INPUT_PHASES.idle
      ? "Ready"
      : resolveSignalLabel(status);
  const signalBadgeStyle =
    status.phase === LIVE_INPUT_PHASES.idle
      ? {
          border: "1px solid var(--nd-border-visible)",
          background: "rgba(255, 255, 255, 0.03)",
          color: "var(--nd-text-secondary)",
        }
      : getSignalBadgeStyle(status);

  const micProcessingDisabled = selectedLiveInputDeviceKind !== "live";
  const showAcousticIntent = selectedLiveInputDeviceKind === "live";
  const acousticIntentValue =
    liveInputAcousticIntent === "vocal" ? "vocal" : "ambient";
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
      (!selectedLiveDeviceId ||
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
    if (
      !isLiveInputActive &&
      !selectedSystemDevice &&
      runtimeSelectedLiveDeviceId
    ) {
      await setSelectedSystemDevice(runtimeSelectedLiveDeviceId);
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
        padding: "0.62rem",
        borderRadius: "0.9rem",
        border: "1px solid var(--nd-border-visible)",
        background: "var(--nd-surface)",
        color: "var(--nd-text-primary)",
        boxShadow: "var(--nd-shell-shadow)",
        fontFamily: '"Aspekta", system-ui, sans-serif',
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
            color: "var(--nd-text-secondary)",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
            fontSize: "0.54rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
              color: "var(--nd-text-secondary)",
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
                color: "var(--nd-text-secondary)",
              }}
            >
              Enable audio access to choose a loopback or live input device.
            </div>
            <button
              type="button"
              onClick={() => void requestLiveInputPermission()}
              style={{
                justifySelf: "start",
                height: "1.72rem",
                padding: "0 0.6rem",
                borderRadius: "999px",
                border: "1px solid var(--nd-border-visible)",
                background: "transparent",
                color: "var(--nd-text-display)",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
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
                color: "var(--nd-text-secondary)",
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
                  height: "1.72rem",
                  padding: "0 0.6rem",
                  borderRadius: "999px",
                  border: "1px solid var(--nd-border-visible)",
                  background: "transparent",
                  color: "var(--nd-text-display)",
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Retry Access
              </button>
            ) : null}
          </div>
        ) : audioDevices.length === 0 ? (
          <div
            style={{ fontSize: "0.66rem", color: "var(--nd-text-secondary)" }}
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
                  color: "var(--nd-text-secondary)",
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
                    color: "var(--nd-text-secondary)",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
                        ? "var(--nd-warning)"
                        : "var(--nd-text-disabled)",
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      textTransform: "uppercase",
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

            {showAcousticIntent ? (
              <div style={{ display: "grid", gap: "0.16rem" }}>
                <span
                  style={{
                    fontSize: "0.54rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--nd-text-secondary)",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                >
                  Intent
                </span>
                <select
                  data-testid="live-input-acoustic-intent-select"
                  value={acousticIntentValue}
                  onChange={(event) =>
                    setLiveInputAcousticIntent?.(event.target.value)
                  }
                  aria-label="Acoustic mic intent"
                  style={{
                    ...getSelectStyle(false),
                    fontSize: "0.64rem",
                  }}
                >
                  <option value="ambient">Ambient</option>
                  <option value="vocal">Vocal</option>
                </select>
              </div>
            ) : null}
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
              border: "1px solid var(--nd-border)",
              background: "var(--nd-surface-raised)",
              color: "var(--nd-text-primary)",
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
                  color: "var(--nd-text-secondary)",
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                }}
              >
                Mic Settings
              </span>
              <span
                style={{
                  flexShrink: 0,
                  borderRadius: "999px",
                  border: "1px solid var(--nd-border)",
                  background: "rgba(255, 255, 255, 0.02)",
                  padding: "0.1rem 0.34rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "0.57rem",
                  color: micProcessingDisabled
                    ? "var(--nd-text-disabled)"
                    : "var(--nd-text-secondary)",
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  textTransform: "uppercase",
                }}
              >
                {micProcessingSummary}
              </span>
            </span>
            <span
              style={{
                flexShrink: 0,
                color: "var(--nd-text-secondary)",
                fontSize: "0.68rem",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
                  color: "var(--nd-text-secondary)",
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
                    border: "1px solid rgba(255, 204, 102, 0.3)",
                    background: "rgba(255, 204, 102, 0.08)",
                    color: "var(--nd-warning)",
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
                        ? "1px solid var(--nd-text-display)"
                        : "1px solid var(--nd-border)",
                      background: micProcessingDisabled
                        ? "rgba(255, 255, 255, 0.02)"
                        : enabled
                          ? "var(--nd-text-display)"
                          : "var(--nd-surface-raised)",
                      color: micProcessingDisabled
                        ? "var(--nd-text-disabled)"
                        : enabled
                          ? "var(--nd-black)"
                          : "var(--nd-text-primary)",
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
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
                          ? "1px solid rgba(0, 0, 0, 0.16)"
                          : "1px solid var(--nd-border-visible)",
                        background: enabled
                          ? "rgba(0, 0, 0, 0.06)"
                          : "rgba(255, 255, 255, 0.02)",
                        color: micProcessingDisabled
                          ? "var(--nd-text-disabled)"
                          : enabled
                            ? "var(--nd-black)"
                            : "var(--nd-text-secondary)",
                        fontSize: "0.54rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
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
              borderTop: "1px solid var(--nd-border)",
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
                  ? "1px solid var(--nd-accent)"
                  : "1px solid var(--nd-text-display)",
                background: liveButtonDisabled
                  ? "color-mix(in srgb, var(--baryon-cream) 2%, transparent)"
                  : isLiveInputActive
                    ? "var(--baryon-amber-soft)"
                    : "var(--nd-text-display)",
                color: liveButtonDisabled
                  ? "var(--nd-text-disabled)"
                  : isLiveInputActive
                    ? "var(--baryon-amber)"
                    : "var(--nd-black)",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                cursor: liveButtonDisabled ? "not-allowed" : "pointer",
                transition:
                  "background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease",
                opacity:
                  liveButtonDisabled || !showLiveActionAttention ? 1 : 0.92,
              }}
              aria-label={liveActionLabel}
              title={
                liveButtonDisabled
                  ? "Select a valid device to start live input."
                  : liveActionLabel
              }
            >
              {transitionLocked ? "Transitioning…" : liveActionLabel}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
