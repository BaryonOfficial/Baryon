// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const baryonSceneSpy = vi.fn(() => null);

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }) => React.createElement("div", null, children),
  useThree: () => ({
    invalidate: () => {},
  }),
}));

vi.mock("./RendererErrorBoundary.jsx", () => ({
  RendererErrorBoundary: ({ children }) => children,
}));

vi.mock("./BaryonScene.jsx", () => ({
  CAMERA_CONTROL_MODES: {
    externalSynced: "external-synced",
  },
  BaryonScene: (props) => {
    baryonSceneSpy(props);
    return null;
  },
}));

vi.mock("./rendererDiagnostics.js", () => ({
  WEBGPU_RENDERER_INIT_ERROR: "WebGPURendererInitError",
  createBaryonRenderer: () => ({}),
}));

import { OutputStageSurface } from "./OutputStageSurface.jsx";

describe("OutputStageSurface", () => {
  /** @type {HTMLDivElement | null} */
  let container = null;
  /** @type {import("react-dom/client").Root | null} */
  let root = null;

  beforeEach(() => {
    baryonSceneSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it("disables global control event sync by default for external output", () => {
    baryonSceneSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
      }),
    );

    expect(baryonSceneSpy).toHaveBeenCalledTimes(1);
    expect(baryonSceneSpy.mock.calls[0][0]).toMatchObject({
      enableControlEventSync: false,
      renderContext: "external-output",
    });
  });

  it("allows explicit re-enabling of control event sync", () => {
    baryonSceneSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
        enableControlEventSync: true,
      }),
    );

    expect(baryonSceneSpy).toHaveBeenCalledTimes(1);
    expect(baryonSceneSpy.mock.calls[0][0].enableControlEventSync).toBe(true);
  });

  it("uses cameraPose directly for external output", async () => {
    const cameraPose = {
      position: { x: 0, y: 9, z: 0.001 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 },
      fov: 65,
    };

    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef: { current: { backgroundColor: "#000000" } },
          visualizationMethod: "raymarch",
          cameraViewPreset: "top-down",
          cameraPose,
        }),
      );
    });

    expect(baryonSceneSpy).toHaveBeenCalled();
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      cameraViewPreset: "top-down",
      cameraPose,
    });
  });

  it("passes frame-state updates through unchanged", async () => {
    const onFrameState = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef: { current: { backgroundColor: "#000000" } },
          visualizationMethod: "raymarch",
          onFrameState,
        }),
      );
    });

    expect(baryonSceneSpy).toHaveBeenCalled();
    const handleFrameState =
      baryonSceneSpy.mock.calls.at(-1)?.[0]?.onFrameState;
    expect(typeof handleFrameState).toBe("function");
    const frameState = {
      featureFrame: {
        fieldState: "idle",
      },
      frameSequence: 7,
    };

    await act(async () => {
      handleFrameState(frameState);
    });

    expect(onFrameState).toHaveBeenCalledWith(frameState);
  });
});
