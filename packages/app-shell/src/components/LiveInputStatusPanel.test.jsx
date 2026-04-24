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
      selectedSource: "system",
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
      selectedLiveInputDeviceKind: "system",
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

  it("keeps Go Live enabled when canonical runtime status still owns the selected device", () => {
    renderPanel(
      {
        audioDevices: [],
        selectedDevice: null,
        selectedSystemDevice: null,
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

  it("seeds the canonical runtime-selected device before Go Live when local selection is empty", async () => {
    const setSelectedSystemDevice = vi.fn();
    const handleSystemToggle = vi.fn();
    renderPanel(
      {
        audioDevices: [],
        selectedDevice: null,
        selectedSystemDevice: null,
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

  it("keeps the live button label canonical during a source-switch go-live path", () => {
    renderPanel(
      {
        selectedSource: "live",
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
});
