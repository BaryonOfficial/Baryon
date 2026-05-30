/** @vitest-environment jsdom */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FloatingCameraControls from "./FloatingCameraControls.jsx";

vi.mock("./hooks/useDraggableFloatingUi.js", () => ({
  useDraggableFloatingUi: () => ({
    dragOffset: { x: 0, y: 0 },
    isDragging: false,
    handlePointerDown: () => {},
    handlePointerUp: () => {},
    handleDoubleClick: () => {},
  }),
}));

describe("FloatingCameraControls camera lock", () => {
  let container = null;
  let root = null;
  let originalActEnvironment;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function render(props) {
    act(() => {
      root.render(
        React.createElement(FloatingCameraControls, {
          activePreset: "side",
          ...props,
        }),
      );
    });
  }

  it("toggles the lock on click and reflects the locked state", () => {
    const onToggleLock = vi.fn();
    render({ cameraLocked: false, onToggleLock });

    const lockButton = container.querySelector(
      '[data-testid="camera-lock-button"]',
    );
    expect(lockButton).not.toBeNull();
    expect(lockButton.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      lockButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onToggleLock).toHaveBeenCalledWith(true);

    render({ cameraLocked: true, onToggleLock });
    const lockedButton = container.querySelector(
      '[data-testid="camera-lock-button"]',
    );
    expect(lockedButton.getAttribute("aria-pressed")).toBe("true");
    expect(lockedButton.getAttribute("data-state")).toBe("active");
  });

  it("keeps the preset and reset buttons present while locked", () => {
    render({ cameraLocked: true, onToggleLock: vi.fn() });

    expect(
      container.querySelector('[data-testid="camera-top-view-button"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="camera-side-view-button"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="camera-reset-view-button"]'),
    ).not.toBeNull();
  });
});
