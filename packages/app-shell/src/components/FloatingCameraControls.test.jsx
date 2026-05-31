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
  let originalInnerWidth;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalInnerWidth = window.innerWidth;
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
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
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

  it("renders preset actions as icons on every breakpoint", () => {
    render({});

    expect(
      container.querySelector('[data-testid="camera-top-view-button"]')
        ?.textContent,
    ).toBe("");
    expect(
      container.querySelector('[data-testid="camera-side-view-button"]')
        ?.textContent,
    ).toBe("");
  });

  it("does not highlight top or side when the camera is free-orbit", () => {
    render({ activePreset: null });

    expect(
      container
        .querySelector('[data-testid="camera-top-view-button"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      container
        .querySelector('[data-testid="camera-side-view-button"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("uses the compact camera pill label", () => {
    render({});

    const root = container.querySelector('[data-testid="camera-controls"]');
    expect(root).not.toBeNull();
    expect(root.textContent).toContain("Camera");
    expect(root.textContent).not.toContain("Controls");
  });

  it("does not render a coordinate readout without a camera pose", () => {
    render({});

    expect(
      container.querySelector('[data-testid="camera-view-readout"]'),
    ).toBeNull();
  });

  it("keeps mobile preset icons spaced apart", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    render({});

    expect(
      container.querySelector('[data-testid="camera-top-view-button"]')?.style
        .minWidth,
    ).toBe("2.15rem");
    expect(
      container.querySelector('[data-testid="camera-side-view-button"]')?.style
        .minWidth,
    ).toBe("2.15rem");
  });

  it("renders the camera view position in the expanded panel", () => {
    render({
      cameraPose: {
        position: { x: 1.234, y: -0, z: -8.765 },
      },
    });

    const readout = container.querySelector(
      '[data-testid="camera-view-readout"]',
    );
    expect(readout).not.toBeNull();
    expect(readout.textContent).not.toContain("View");
    expect(readout.textContent).toContain("x");
    expect(readout.textContent).toContain("+1.23");
    expect(readout.textContent).toContain("y");
    expect(readout.textContent).toContain("+0.00");
    expect(readout.textContent).toContain("z");
    expect(readout.textContent).toContain("-8.77");
    expect(readout.style.fontSize).toBe("0.52rem");
    expect(readout.style.marginTop).toBe("0.34rem");
    expect(readout.style.opacity).toBe("0.72");
    expect(readout.style.background).toBe("");
    expect(readout.style.boxShadow).toBe("");

    const panel = container.querySelector(
      '[data-testid="camera-controls-panel"]',
    );
    expect(panel).not.toBeNull();
    expect(panel.contains(readout)).toBe(false);
    expect(panel.style.borderRadius).toBe("999px");
    expect(panel.style.background).toBe("var(--nd-surface)");
    expect(panel.style.boxShadow).toBe("var(--nd-shell-shadow)");
  });
});
