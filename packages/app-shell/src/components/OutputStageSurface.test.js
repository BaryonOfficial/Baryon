import React from "react";
import { describe, expect, it, vi } from "vitest";
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
});
