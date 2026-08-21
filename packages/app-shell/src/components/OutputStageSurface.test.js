// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { baryonSceneSpy, canvasSpy, createBaryonRendererSpy } = vi.hoisted(
  () => ({
    baryonSceneSpy: vi.fn(() => null),
    canvasSpy: vi.fn(),
    createBaryonRendererSpy: vi.fn(() => ({})),
  }),
);

vi.mock("@react-three/fiber", () => ({
  Canvas: (props) => {
    canvasSpy(props);
    return React.createElement("div", null, props.children);
  },
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
  createBaryonRenderer: createBaryonRendererSpy,
}));

import { DEFAULT_ACTIVE_CAMERA_POSE } from "./cameraPosePresets.js";
import { OutputStageSurface } from "./OutputStageSurface.jsx";
import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";

describe("OutputStageSurface", () => {
  /** @type {HTMLDivElement | null} */
  let container = null;
  /** @type {import("react-dom/client").Root | null} */
  let root = null;
  let originalActEnvironment;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    baryonSceneSpy.mockClear();
    canvasSpy.mockClear();
    createBaryonRendererSpy.mockClear();
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
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  it("disables global control event sync by default for external output", () => {
    baryonSceneSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
        audioFeatureAuthorityRole:
          AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
      }),
    );

    expect(baryonSceneSpy).toHaveBeenCalledTimes(1);
    expect(baryonSceneSpy.mock.calls[0][0]).toMatchObject({
      enableControlEventSync: false,
      renderContext: "external-output",
      audioFeatureAuthorityRole: AUDIO_FEATURE_AUTHORITY_ROLES.externalConsumer,
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

  it("uses the diagonal default camera config for external output", () => {
    baryonSceneSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
      }),
    );

    expect(canvasSpy).toHaveBeenCalledTimes(1);
    expect(canvasSpy.mock.calls[0][0].camera).toMatchObject({
      position: [
        DEFAULT_ACTIVE_CAMERA_POSE.position.x,
        DEFAULT_ACTIVE_CAMERA_POSE.position.y,
        DEFAULT_ACTIVE_CAMERA_POSE.position.z,
      ],
      up: [
        DEFAULT_ACTIVE_CAMERA_POSE.up.x,
        DEFAULT_ACTIVE_CAMERA_POSE.up.y,
        DEFAULT_ACTIVE_CAMERA_POSE.up.z,
      ],
      fov: DEFAULT_ACTIVE_CAMERA_POSE.fov,
    });
  });

  it("does not multiply external output resolution by display DPR", () => {
    baryonSceneSpy.mockClear();
    canvasSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
      }),
    );

    expect(canvasSpy).toHaveBeenCalledTimes(1);
    expect(canvasSpy.mock.calls[0][0].dpr).toBe(1);
    expect(baryonSceneSpy.mock.calls[0][0].basePixelRatio).toBe(1);
  });

  it("renders a physical-pixel Windows compositor frame at the supplied ratio", () => {
    const glDefaults = { canvas: document.createElement("canvas") };

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
        framebufferPixelRatio: 1.5,
        halfFloatOutput: true,
        outputCompositorFrameTransfer: true,
      }),
    );

    expect(canvasSpy.mock.calls.at(-1)?.[0].dpr).toBe(1.5);
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0].basePixelRatio).toBe(1.5);
    canvasSpy.mock.calls.at(-1)?.[0].gl(glDefaults);
    expect(createBaryonRendererSpy).toHaveBeenCalledWith(glDefaults, false, {
      initialPixelRatio: 1.5,
      halfFloatOutput: true,
    });
  });

  it("can force the external output renderer onto the WebGL backend", () => {
    const glDefaults = { canvas: document.createElement("canvas") };

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
        forceWebGLRenderer: true,
      }),
    );

    canvasSpy.mock.calls[0][0].gl(glDefaults);

    expect(createBaryonRendererSpy).toHaveBeenCalledWith(glDefaults, true, {
      initialPixelRatio: 1,
      halfFloatOutput: false,
    });
  });

  it("keeps transparent output stage roots alpha-capable", async () => {
    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef: {
            current: {
              backgroundColor: "#0D0A07",
              outputMode: "transparent",
              outputBackgroundColor: "#123456",
            },
          },
          visualizationMethod: "raymarch",
        }),
      );
    });

    const stageRoot = container.querySelector(
      '[data-testid="output-stage-root"]',
    );
    expect(stageRoot?.dataset.outputMode).toBe("transparent");
    expect(stageRoot?.style.backgroundColor).toBe("transparent");
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0].outputMode).toBe(
      "transparent",
    );
  });

  it("fills output stage roots only for opaque output mode", async () => {
    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef: {
            current: {
              backgroundColor: "#0D0A07",
              outputMode: "opaque",
              outputBackgroundColor: "#123456",
            },
          },
          visualizationMethod: "raymarch",
        }),
      );
    });

    const stageRoot = container.querySelector(
      '[data-testid="output-stage-root"]',
    );
    expect(stageRoot?.dataset.outputMode).toBe("opaque");
    expect(stageRoot?.style.backgroundColor).toBe("rgb(18, 52, 86)");
  });

  it("uses explicit output props before mutable control refs", async () => {
    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef: {
            current: {
              backgroundColor: "#0D0A07",
              outputMode: "transparent",
              outputBackgroundColor: "#654321",
            },
          },
          visualizationMethod: "raymarch",
          outputMode: "opaque",
          outputBackgroundColor: "#123456",
        }),
      );
    });

    const stageRoot = container.querySelector(
      '[data-testid="output-stage-root"]',
    );
    expect(stageRoot?.dataset.outputMode).toBe("opaque");
    expect(stageRoot?.style.backgroundColor).toBe("rgb(18, 52, 86)");
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0].outputMode).toBe("opaque");
  });

  it("passes the output control target FPS to the render scene", () => {
    baryonSceneSpy.mockClear();

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: {
          current: {
            backgroundColor: "#000000",
            customTargetFps: 72,
          },
        },
        visualizationMethod: "raymarch",
        renderQualityPreset: "custom",
      }),
    );

    expect(baryonSceneSpy.mock.calls[0][0]).toMatchObject({
      performanceProfile: "custom",
      customTargetFps: 72,
      basePixelRatio: 1,
    });
  });

  it("does not infer half-float precision from compositor transfer", () => {
    const onOutputCompositorFrame = vi.fn();
    const glDefaults = { canvas: document.createElement("canvas") };

    renderToStaticMarkup(
      React.createElement(OutputStageSurface, {
        controlsRef: { current: { backgroundColor: "#000000" } },
        visualizationMethod: "raymarch",
        outputCompositorFrameTransfer: true,
        onOutputCompositorFrame,
      }),
    );

    canvasSpy.mock.calls.at(-1)?.[0].gl(glDefaults);
    expect(createBaryonRendererSpy).toHaveBeenCalledWith(glDefaults, false, {
      initialPixelRatio: 1,
      halfFloatOutput: false,
    });
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      outputCompositorFrameTransfer: true,
      onOutputCompositorFrame,
    });
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
          cameraPose,
          cameraCutNonce: 4,
        }),
      );
    });

    expect(baryonSceneSpy).toHaveBeenCalled();
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      cameraPose,
      cameraCutNonce: 4,
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

  it("keeps the engine-ready callback stable across ordinary stage rerenders", async () => {
    const controlsRef = { current: { backgroundColor: "#000000" } };

    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef,
          visualizationMethod: "raymarch",
          onStageRender: vi.fn(),
        }),
      );
    });
    const firstCallback =
      baryonSceneSpy.mock.calls.at(-1)?.[0]?.setIsEngineReady;

    await act(async () => {
      root.render(
        React.createElement(OutputStageSurface, {
          controlsRef,
          visualizationMethod: "raymarch",
          onStageRender: vi.fn(),
        }),
      );
    });

    expect(firstCallback).toBeTypeOf("function");
    expect(baryonSceneSpy.mock.calls.at(-1)?.[0]?.setIsEngineReady).toBe(
      firstCallback,
    );
  });
});
