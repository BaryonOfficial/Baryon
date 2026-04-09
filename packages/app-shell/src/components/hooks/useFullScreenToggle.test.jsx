/* @vitest-environment jsdom */

import React, { useEffect, useRef } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFullscreen } from "./useFullScreenToggle.jsx";

function Harness({ onState }) {
  const elementRef = useRef(null);
  const fullscreenState = useFullscreen(elementRef);

  useEffect(() => {
    onState(fullscreenState);
  }, [fullscreenState, onState]);

  return (
    <div ref={elementRef}>
      <input data-testid="editor" />
    </div>
  );
}

describe("useFullscreen", () => {
  let container = null;
  let root = null;
  let currentFullscreenElement = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    currentFullscreenElement = null;
    delete window.electronAPI;
    document.body.innerHTML = "";
  });

  it("uses desktop window controls when Electron exposes fullscreen management", async () => {
    const onState = vi.fn();
    const toggleFullscreen = vi.fn().mockResolvedValue({ fullscreen: true });
    window.electronAPI = {
      windowControls: {
        toggleFullscreen,
        subscribeFullscreenState(listener) {
          listener({ fullscreen: true });
          return () => {};
        },
      },
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<Harness onState={onState} />);
    });

    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ isFullscreen: true }),
    );

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);

    input.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));
    });
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("falls back to DOM fullscreen in the browser path", async () => {
    const onState = vi.fn();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get() {
        return currentFullscreenElement;
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<Harness onState={onState} />);
    });

    const surface = container.querySelector("div");
    expect(surface).not.toBeNull();
    surface.requestFullscreen = vi.fn();
    document.exitFullscreen = vi.fn();

    await act(async () => {
      onState.mock.lastCall[0].toggleFullscreen();
    });
    expect(surface.requestFullscreen).toHaveBeenCalledTimes(1);

    currentFullscreenElement = surface;
    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ isFullscreen: true }),
    );

    await act(async () => {
      onState.mock.lastCall[0].toggleFullscreen();
    });
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
