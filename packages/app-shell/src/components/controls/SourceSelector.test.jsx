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

  function renderSelector(props, audioOverrides = {}) {
    const audio = {
      platform: "desktop",
      sourceSession: { kind: "file" },
      handleSourceChange: vi.fn(),
      isLiveInputActive: false,
      liveInputDeviceKind: "system",
      liveInputPermissionState: "granted",
      handleSystemToggle: vi.fn(),
      liveInputRuntimeStatus: {
        active: false,
        phase: "idle",
      },
      ...audioOverrides,
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
    renderSelector(
      { showLiveButton: false, allowSystemSource: false },
      { sourceSession: { kind: "system" } },
    );

    const fileTab = container.querySelector('[data-testid="file-source-tab"]');
    expect(fileTab).not.toBeNull();
    expect(fileTab.classList.contains("ac-source-tab--active")).toBe(true);
    expect(
      container.querySelector('[data-testid="live-input-source-tab"]'),
    ).toBeNull();
  });

  it("keeps compact tabs fit-content so a parent status light stays integrated", () => {
    renderSelector({ showLiveButton: false });

    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(injectedCss).toContain(`.ac-source-selector {
    min-width: 0;
    width: auto;
    justify-content: flex-start;
  }`);
    expect(injectedCss).toContain(`.ac-source-tabs {
    min-width: 0;
    flex: 0 0 auto;
  }`);
    expect(injectedCss).toContain(`.ac-source-cluster {
    width: auto;
  }`);
  });

  it("uses restrained rounded-rectangle metrics for selector geometry", () => {
    renderSelector({ showLiveButton: false });

    const fileTab = container.querySelector('[data-testid="file-source-tab"]');
    const systemTab = container.querySelector(
      '[data-testid="live-input-source-tab"]',
    );
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(window.getComputedStyle(fileTab).fontSize).toBe("10px");
    expect(window.getComputedStyle(systemTab).fontSize).toBe("10px");
    expect(window.getComputedStyle(fileTab).width).toBe(
      "var(--tab-file-width)",
    );
    expect(window.getComputedStyle(systemTab).width).toBe(
      "var(--tab-system-width)",
    );
    expect(
      window
        .getComputedStyle(container.querySelector(".ac-source-tabs"))
        .getPropertyValue("--tab-file-width"),
    ).toBe("2.86rem");
    expect(
      window
        .getComputedStyle(container.querySelector(".ac-source-tabs"))
        .getPropertyValue("--tab-system-width"),
    ).toBe("4rem");
    expect(injectedCss).toContain(
      "border-radius: var(--baryon-source-selector-segment-radius);",
    );
    expect(injectedCss).toContain(
      "min-height: var(--baryon-source-selector-inner-min-height);",
    );
  });
});
