// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioContext } from "../context/AudioContext.jsx";
import MobileDemoControls from "./MobileDemoControls.jsx";

vi.mock("./MetalFxFrame.jsx", () => ({
  default: ({ children }) => children,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderControls(audioValue) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <AudioContext.Provider value={audioValue}>
        <MobileDemoControls />
      </AudioContext.Provider>,
    );
  });

  return { container, root };
}

describe("MobileDemoControls", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("waits for the preloaded demo and renderer before enabling playback", () => {
    const { container, root } = renderControls({
      isAudioLoaded: false,
      isEngineReady: false,
      isPlaying: false,
      handlePlayPause: vi.fn(),
      handleStop: vi.fn(),
    });

    const button = container.querySelector("button");
    const desktopLink = container.querySelector(".mobile-demo-note");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Preparing demo");
    expect(button.dataset.phase).toBe("preparing");
    expect(
      button.querySelector('[data-testid="demo-audio-icon"]')?.dataset.variant,
    ).toBe("play");
    expect(desktopLink.tagName).toBe("A");
    expect(desktopLink.textContent).toBe("Full experience on desktop");
    expect(desktopLink.getAttribute("href")).toBe(
      "https://baryon.live/download",
    );

    act(() => {
      root.unmount();
    });
  });

  it("starts the preloaded audio directly from the user gesture", async () => {
    const handlePlayPause = vi.fn(async () => {});
    const { container, root } = renderControls({
      isAudioLoaded: true,
      isEngineReady: true,
      isPlaying: false,
      handlePlayPause,
      handleStop: vi.fn(),
    });

    const button = container.querySelector("button");
    expect(button.getAttribute("aria-label")).toBe("Play demo");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.dataset.phase).toBe("ready");
    expect(
      button.querySelector('[data-testid="demo-audio-icon"]')?.dataset.variant,
    ).toBe("play");

    await act(async () => {
      button.click();
    });

    expect(handlePlayPause).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("stops active demo playback instead of pausing the rendered frame", async () => {
    const handlePlayPause = vi.fn(async () => {});
    const handleStop = vi.fn();
    const { container, root } = renderControls({
      isAudioLoaded: true,
      isEngineReady: true,
      isPlaying: true,
      handlePlayPause,
      handleStop,
    });

    const button = container.querySelector("button");
    expect(button.getAttribute("aria-label")).toBe("Stop demo");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.dataset.phase).toBe("playing");
    // The shared mark stays the same object; only the transport glyph changes.
    expect(
      button.querySelector('[data-testid="demo-audio-icon"]')?.dataset.variant,
    ).toBe("stop");

    await act(async () => {
      button.click();
    });

    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handlePlayPause).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
