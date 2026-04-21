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

  function renderPanel(audioOverrides = {}) {
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
      root.render(<LiveInputStatusPanel visible />);
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
});
