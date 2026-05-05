/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAudioMock } = vi.hoisted(() => ({
  useAudioMock: vi.fn(),
}));

vi.mock("../../context/AudioContext", () => ({
  useAudio: useAudioMock,
}));

import { SourceSelector } from "./SourceSelector.jsx";

describe("SourceSelector", () => {
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

  function renderSelector(props) {
    const audio = {
      platform: "desktop",
      selectedSource: "file",
      handleSourceChange: vi.fn(),
      isLiveInputActive: false,
      liveInputDeviceKind: "system",
      liveInputPermissionState: "granted",
      handleSystemToggle: vi.fn(),
      liveInputRuntimeStatus: {
        active: false,
        phase: "idle",
      },
    };
    useAudioMock.mockReturnValue(audio);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<SourceSelector {...props} />);
    });

    return audio;
  }

  it("keeps the system source tab visible when the live action button is hidden", () => {
    renderSelector({ showLiveButton: false });

    expect(container.querySelector('[data-testid="file-source-tab"]')).not.toBe(
      null,
    );
    expect(
      container.querySelector('[data-testid="live-input-source-tab"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="source-selector-live-button"]'),
    ).toBeNull();
  });

  it("still hides the system source when it is explicitly disabled", () => {
    renderSelector({ showLiveButton: false, allowSystemSource: false });

    expect(container.querySelector('[data-testid="file-source-tab"]')).not.toBe(
      null,
    );
    expect(
      container.querySelector('[data-testid="live-input-source-tab"]'),
    ).toBeNull();
  });
});
