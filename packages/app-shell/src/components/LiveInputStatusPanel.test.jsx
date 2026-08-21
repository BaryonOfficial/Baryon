/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAudioMock } = vi.hoisted(() => ({
  useAudioMock: vi.fn(),
}));

vi.mock("../context/AudioContext.jsx", () => ({
  useAudio: useAudioMock,
}));

import LiveInputStatusPanel from "./LiveInputStatusPanel.jsx";

describe("LiveInputStatusPanel", () => {
  let container = null;
  let root = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    useAudioMock.mockReset();
  });

  function renderPanel(audioOverrides = {}, componentProps = {}) {
    useAudioMock.mockReturnValue({
      sourceSession: { kind: "system" },
      isLiveInputActive: false,
      liveInputRuntimeStatus: {
        active: true,
        phase: "listening",
        signalState: "ok",
      },
      liveInputPermissionState: "granted",
      audioDevices: [
        {
          deviceId: "loopback-1",
          label: "BlackHole 2ch (Virtual)",
        },
      ],
      selectedDevice: "loopback-1",
      selectedSystemDevice: "loopback-1",
      selectedLiveDeviceId: "loopback-1",
      selectedLiveInputDeviceKind: "system",
      selectedLiveInputDeviceKindOverride: null,
      liveInputAcousticIntent: "ambient",
      setLiveInputAcousticIntent: vi.fn(),
      setSelectedSystemDevice: vi.fn(),
      handleSourceChange: vi.fn(),
      handleSystemToggle: vi.fn(),
      saveDeviceKindOverride: vi.fn(),
      clearDeviceKindOverride: vi.fn(),
      requestLiveInputPermission: vi.fn(),
      ...audioOverrides,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<LiveInputStatusPanel visible {...componentProps} />);
    });
  }

  it("shows Ready instead of Listening while semantic live input is inactive", () => {
    renderPanel({
      isLiveInputActive: false,
      liveInputRuntimeStatus: {
        active: true,
        phase: "listening",
        signalState: "ok",
      },
    });

    expect(container.textContent).toContain("Ready");
    expect(container.textContent).not.toContain("Listening");
  });

  it("keeps Go Live enabled when canonical audio context owns the selected device", () => {
    renderPanel(
      {
        audioDevices: [],
        selectedDevice: null,
        selectedSystemDevice: null,
        selectedLiveDeviceId: "loopback-1",
        liveInputRuntimeStatus: {
          active: false,
          phase: "idle",
          signalState: "ok",
          selectedDeviceId: "loopback-1",
          selectedDeviceLabel: "BlackHole 2ch (Virtual)",
          liveInputKind: "system",
        },
      },
      { showLiveAction: true },
    );

    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );
    expect(liveButton).not.toBeNull();
    expect(liveButton?.disabled).toBe(false);
  });

  it("renders idle Go Live with the performer cream token at full opacity", () => {
    renderPanel({}, { showLiveAction: true });

    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );

    expect(liveButton?.style.background).toBe(
      "var(--performer-control-cream, var(--nd-text-display))",
    );
    expect(liveButton?.style.border).toBe(
      "1px solid var(--performer-control-cream, var(--nd-text-display))",
    );
    expect(liveButton?.style.opacity).toBe("");
  });

  it("does not let stacked panel shadow bleed onto sibling controls", () => {
    renderPanel({}, { stacked: true, showLiveAction: true });

    const panel = /** @type {HTMLElement | null} */ (
      container.querySelector('[data-testid="live-input-status-panel"]')
    );

    expect(panel?.style.position).toBe("relative");
    expect(panel?.style.zIndex).toBe("auto");
    expect(panel?.style.boxShadow).toBe("none");
  });

  it("seeds the canonical context-selected device before Go Live when local selection is empty", async () => {
    const setSelectedSystemDevice = vi.fn();
    const handleSystemToggle = vi.fn();
    renderPanel(
      {
        audioDevices: [],
        selectedDevice: null,
        selectedSystemDevice: null,
        selectedLiveDeviceId: "loopback-1",
        setSelectedSystemDevice,
        handleSystemToggle,
        liveInputRuntimeStatus: {
          active: false,
          phase: "idle",
          signalState: "ok",
          selectedDeviceId: "loopback-1",
          selectedDeviceLabel: "BlackHole 2ch (Virtual)",
          liveInputKind: "system",
        },
      },
      { showLiveAction: true },
    );

    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );
    expect(liveButton).not.toBeNull();

    await act(async () => {
      liveButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(setSelectedSystemDevice).toHaveBeenCalledWith("loopback-1");
    expect(handleSystemToggle).toHaveBeenCalledTimes(1);
  });

  it("delegates Go Live to the canonical context action when present", async () => {
    const handleLiveInputAction = vi.fn(async () => {});
    const setSelectedSystemDevice = vi.fn();
    const handleSourceChange = vi.fn();
    const handleSystemToggle = vi.fn();
    renderPanel(
      {
        sourceSession: { kind: "file" },
        selectedSystemDevice: null,
        handleLiveInputAction,
        setSelectedSystemDevice,
        handleSourceChange,
        handleSystemToggle,
      },
      { showLiveAction: true },
    );

    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );
    expect(liveButton).not.toBeNull();

    await act(async () => {
      liveButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(handleLiveInputAction).toHaveBeenCalledTimes(1);
    expect(handleSourceChange).not.toHaveBeenCalled();
    expect(setSelectedSystemDevice).not.toHaveBeenCalled();
    expect(handleSystemToggle).not.toHaveBeenCalled();
  });

  it("reports a contended input truthfully and retries through the canonical action", async () => {
    const handleLiveInputAction = vi.fn(async () => {});
    renderPanel(
      {
        isLiveInputActive: false,
        handleLiveInputAction,
        liveInputRuntimeStatus: {
          active: false,
          phase: "error",
          signalState: "ok",
          errorCode: "device-unavailable",
          selectedDeviceId: "loopback-1",
          selectedDeviceLabel: "Audio Interface",
          liveInputKind: "system",
        },
      },
      { showLiveAction: true },
    );

    expect(container.textContent).toContain("Unavailable");
    expect(container.textContent).not.toContain("Clipped");
    expect(container.textContent).toContain(
      "Check its routing and make sure another app isn't using it in exclusive mode",
    );
    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );
    expect(liveButton?.textContent).toContain("Retry Input");
    expect(liveButton?.disabled).toBe(false);

    await act(async () => {
      liveButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
    });

    expect(handleLiveInputAction).toHaveBeenCalledTimes(1);
  });

  it("distinguishes connected silence from a failed or pending live start", () => {
    renderPanel({
      isLiveInputActive: true,
      liveInputRuntimeStatus: {
        active: true,
        phase: "weak-signal",
        resolvedAnalysisClass: "line-feed",
        signalState: "silent",
        sourceBoundaryState: "muted",
      },
    });

    expect(container.textContent).toContain("Live · No Signal");
    expect(container.textContent).toContain(
      "Live input is connected. No audio is reaching this device yet.",
    );
    expect(container.textContent).not.toContain("Starting");
    expect(container.textContent).not.toContain("Input Error");
  });

  it("keeps the live button label canonical during a source-switch go-live path", () => {
    renderPanel(
      {
        sourceSession: { kind: "system" },
        isLiveInputActive: false,
        liveInputRuntimeStatus: {
          active: false,
          phase: "idle",
          signalState: "ok",
          selectedDeviceId: "loopback-1",
          selectedDeviceLabel: "BlackHole 2ch (Virtual)",
          liveInputKind: "system",
        },
      },
      { showLiveAction: true },
    );

    const liveButton = /** @type {HTMLButtonElement | null} */ (
      container.querySelector('[data-testid="source-live-button"]')
    );
    expect(liveButton?.textContent).toContain("Go Live");
    expect(liveButton?.textContent).not.toContain("Switch To System");
  });

  it("shows acoustic intent directly in the input panel for mic devices", () => {
    const setLiveInputAcousticIntent = vi.fn();
    renderPanel({
      selectedLiveInputDeviceKind: "live",
      liveInputAcousticIntent: "ambient",
      setLiveInputAcousticIntent,
      audioDevices: [
        {
          deviceId: "mic-1",
          label: "Studio Mic",
        },
      ],
      selectedDevice: "mic-1",
      selectedSystemDevice: "mic-1",
      selectedLiveDeviceId: "mic-1",
    });

    const intentSelect = /** @type {HTMLSelectElement | null} */ (
      container.querySelector(
        '[data-testid="live-input-acoustic-intent-select"]',
      )
    );
    expect(intentSelect).not.toBeNull();
    expect(container.textContent).toContain("Intent");
    expect(intentSelect?.value).toBe("ambient");

    act(() => {
      if (intentSelect) {
        intentSelect.value = "vocal";
        intentSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(setLiveInputAcousticIntent).toHaveBeenCalledWith("vocal");
  });

  it("hides acoustic intent for loopback devices", () => {
    renderPanel({
      selectedLiveInputDeviceKind: "system",
    });

    expect(
      container.querySelector(
        '[data-testid="live-input-acoustic-intent-select"]',
      ),
    ).toBeNull();
  });

  it("renders manual device type from the audio context owner", () => {
    renderPanel({
      selectedLiveInputDeviceKind: "live",
      selectedLiveInputDeviceKindOverride: "live",
    });

    const typeSelect = /** @type {HTMLSelectElement | null} */ (
      container.querySelector('[data-testid="live-input-device-type-select"]')
    );

    expect(typeSelect).not.toBeNull();
    expect(typeSelect?.value).toBe("live");
    expect(container.textContent).toContain("manual");
    expect(container.textContent).toContain("Acoustic Mic");
  });
});
