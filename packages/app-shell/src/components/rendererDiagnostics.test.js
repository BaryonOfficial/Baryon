import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererMocks = vi.hoisted(() => ({
  defaultOnDeviceLost: vi.fn(),
  defaultOnError: vi.fn(),
  popErrorScope: vi.fn(),
}));

vi.mock("three/webgpu", () => {
  class WebGPUBackend {
    isWebGLBackend = false;

    constructor() {
      this.device = {
        popErrorScope: (...args) => rendererMocks.popErrorScope(...args),
        pushErrorScope: vi.fn(),
      };
    }
  }

  class WebGLBackend {
    isWebGLBackend = true;
  }

  class WebGPURenderer {
    constructor(parameters) {
      this.parameters = parameters;
      this.domElement = parameters.canvas;
      this.backend =
        parameters.forceWebGL === true
          ? new WebGLBackend()
          : new WebGPUBackend();
      this.init = vi.fn(async () => this);
      this.onDeviceLost = (info) => rendererMocks.defaultOnDeviceLost(info);
      this.onError = (info) => rendererMocks.defaultOnError(info);
      this.setClearColor = vi.fn();
      this.setPixelRatio = vi.fn();
      this.setSize = vi.fn();
    }
  }

  return { WebGPURenderer };
});

import {
  clearRendererDiagnostics,
  createBaryonRenderer,
  WEBGPU_RENDERER_RUNTIME_LOSS_ERROR,
} from "./rendererDiagnostics.js";
import { HalfFloatType } from "three";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);
const originalCustomEventDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "CustomEvent",
);
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

class TestCustomEvent extends Event {
  constructor(type, options = {}) {
    super(type);
    this.detail = options.detail;
  }
}

function installTestWindow() {
  const windowTarget = new EventTarget();
  const dispatchEvent = windowTarget.dispatchEvent.bind(windowTarget);
  windowTarget.devicePixelRatio = 2;
  windowTarget.dispatchEvent = vi.fn((event) => dispatchEvent(event));

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowTarget,
  });

  if (typeof globalThis.CustomEvent === "undefined") {
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: TestCustomEvent,
    });
  }
}

function installTestNavigator(userAgent) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent },
  });
}

function restoreGlobalProperty(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    delete globalThis[name];
  }
}

function createCanvas() {
  return {
    getContext: vi.fn(() => ({ kind: "webgl2" })),
    parentElement: {
      getBoundingClientRect: () => ({ width: 800, height: 450 }),
    },
  };
}

describe("renderer diagnostics", () => {
  beforeEach(() => {
    rendererMocks.defaultOnDeviceLost.mockClear();
    rendererMocks.defaultOnError.mockClear();
    rendererMocks.popErrorScope.mockReset();
    rendererMocks.popErrorScope.mockResolvedValue(null);
    installTestWindow();
  });

  afterEach(() => {
    clearRendererDiagnostics();
    restoreGlobalProperty("CustomEvent", originalCustomEventDescriptor);
    restoreGlobalProperty("navigator", originalNavigatorDescriptor);
    restoreGlobalProperty("window", originalWindowDescriptor);
  });

  it("records runtime WebGPU errors and preserves Three renderer handlers", async () => {
    const renderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
    );
    const snapshots = [];
    window.addEventListener("__baryon-renderer-info-change", (event) => {
      snapshots.push(event.detail);
    });

    renderer.onError({
      api: "WebGPU",
      type: "GPUValidationError",
      message: "Bind group layout mismatch",
      originalEvent: { ignored: true },
    });
    renderer.onDeviceLost({
      api: "WebGPU",
      message: "Device disappeared",
      reason: "unknown",
      originalEvent: { ignored: true },
    });

    expect(rendererMocks.defaultOnError).toHaveBeenCalledWith({
      api: "WebGPU",
      type: "GPUValidationError",
      message: "Bind group layout mismatch",
      originalEvent: { ignored: true },
    });
    expect(rendererMocks.defaultOnDeviceLost).toHaveBeenCalledWith({
      api: "WebGPU",
      message: "Device disappeared",
      reason: "unknown",
      originalEvent: { ignored: true },
    });
    expect(window.__baryonRendererInfo).toMatchObject({
      backend: "WebGPUBackend",
      backendType: "webgpu",
      error: null,
      forceWebGLFallbackTest: false,
      gpuErrors: [
        {
          api: "WebGPU",
          kind: "uncaptured-error",
          message: "Bind group layout mismatch",
          reason: null,
          type: "GPUValidationError",
        },
        {
          api: "WebGPU",
          kind: "device-lost",
          message: "Device disappeared",
          reason: "unknown",
          type: null,
        },
      ],
      isFallback: false,
    });
    expect(snapshots.at(-1)?.gpuErrors).toStrictEqual(
      window.__baryonRendererInfo.gpuErrors,
    );
    expect(window.__baryonRendererInfo.gpuErrors[0]).not.toHaveProperty(
      "originalEvent",
    );
  });

  it("turns a rejected WebGPU error scope into one reported runtime loss", async () => {
    const onRuntimeFailure = vi.fn();
    const renderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
      { onRuntimeFailure },
    );
    const scopeError = new Error("Instance dropped in popErrorScope");
    scopeError.name = "OperationError";
    rendererMocks.popErrorScope.mockRejectedValueOnce(scopeError);

    await renderer.backend.device.popErrorScope();
    await vi.waitFor(() => {
      expect(onRuntimeFailure).toHaveBeenCalledOnce();
    });

    expect(rendererMocks.defaultOnError).toHaveBeenCalledWith(
      expect.objectContaining({
        api: "WebGPU",
        message: "Instance dropped in popErrorScope",
        reason: "error-scope-rejected",
        type: "OperationError",
      }),
    );
    expect(onRuntimeFailure.mock.calls[0][0]).toMatchObject({
      name: WEBGPU_RENDERER_RUNTIME_LOSS_ERROR,
      cause: scopeError,
    });
    expect(window.__baryonRendererInfo.gpuErrors.at(-1)).toMatchObject({
      kind: "error-scope-rejected",
    });
    expect(window.__baryonRendererInfo.gpuErrors.at(-1)).not.toHaveProperty(
      "pipelineKind",
    );

    rendererMocks.popErrorScope.mockRejectedValueOnce(scopeError);
    await renderer.backend.device.popErrorScope();
    await vi.waitFor(() => {
      expect(rendererMocks.defaultOnError).toHaveBeenCalledTimes(2);
    });
    expect(onRuntimeFailure).toHaveBeenCalledOnce();
  });

  it("keeps existing callers working without xrMode and preserves WebGPU backends with it", async () => {
    const defaultRenderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
    );
    expect(defaultRenderer.backend.isWebGLBackend).toBe(false);

    const xrRenderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
      { xrMode: true },
    );
    expect(xrRenderer.backend.isWebGLBackend).toBe(false);
    expect(window.__baryonRendererInfo).toMatchObject({
      backendType: "webgpu",
      error: null,
      isFallback: false,
    });
  });

  it("requests the high-performance GPU where Chromium can honor it", async () => {
    installTestNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    );
    const webGpuCanvas = createCanvas();
    const webGpuRenderer = await createBaryonRenderer(
      { canvas: webGpuCanvas },
      false,
    );

    expect(webGpuRenderer.parameters.powerPreference).toBe("high-performance");
    expect(webGpuCanvas.getContext).not.toHaveBeenCalled();
    expect(webGpuRenderer.backend.isWebGLBackend).toBe(false);

    const webGlCanvas = createCanvas();
    const webGlRenderer = await createBaryonRenderer(
      { canvas: webGlCanvas },
      true,
    );

    expect(webGlCanvas.getContext).toHaveBeenCalledWith("webgl2", {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    expect(webGlRenderer.parameters).toMatchObject({
      forceWebGL: true,
      powerPreference: "high-performance",
    });
    expect(webGlRenderer.backend.isWebGLBackend).toBe(true);
  });

  it("omits only the ignored Windows Chromium WebGPU power preference", async () => {
    installTestNavigator(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    );
    const webGpuCanvas = createCanvas();
    const webGpuRenderer = await createBaryonRenderer(
      { canvas: webGpuCanvas },
      false,
    );

    expect(webGpuRenderer.parameters).not.toHaveProperty("powerPreference");
    expect(webGpuCanvas.getContext).not.toHaveBeenCalled();

    const webGlCanvas = createCanvas();
    const webGlRenderer = await createBaryonRenderer(
      { canvas: webGlCanvas },
      true,
    );

    expect(webGlCanvas.getContext).toHaveBeenCalledWith("webgl2", {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    expect(webGlRenderer.parameters.powerPreference).toBe("high-performance");
  });

  it("supports opaque preview canvases without changing transparent output defaults", async () => {
    const defaultRenderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
    );
    const previewRenderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
      { alpha: false },
    );

    expect(defaultRenderer.parameters.alpha).toBe(true);
    expect(previewRenderer.parameters.alpha).toBe(false);
    expect(defaultRenderer.setClearColor).toHaveBeenLastCalledWith(0x000000, 0);
    expect(previewRenderer.setClearColor).toHaveBeenLastCalledWith(0x000000, 1);
  });

  it("uses the compositor-visible canvas as the WebGPU render target", async () => {
    const sourceCanvas = createCanvas();
    sourceCanvas.width = 1920;
    sourceCanvas.height = 1080;

    const renderer = await createBaryonRenderer(
      { canvas: sourceCanvas },
      false,
    );

    expect(renderer.parameters.canvas).toBe(sourceCanvas);
    expect(renderer.setSize).toHaveBeenCalledWith(800, 450, false);
  });

  it("uses a half-float WebGPU canvas for high-precision output", async () => {
    const renderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
      { halfFloatOutput: true },
    );

    expect(renderer.parameters.outputType).toBe(HalfFloatType);
  });

  it("rejects WebGL backends in xrMode with the renderer init error name", async () => {
    await expect(
      createBaryonRenderer({ canvas: createCanvas() }, true, { xrMode: true }),
    ).rejects.toMatchObject({
      name: "WebGPURendererInitError",
    });
    expect(window.__baryonRendererInfo).toMatchObject({
      backendType: null,
      isFallback: true,
    });
    expect(window.__baryonRendererInfo.error).toMatch(/WebGL backend/);
  });

  it("keeps allowing WebGL fallback outside xrMode", async () => {
    const renderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      true,
    );
    expect(renderer.backend.isWebGLBackend).toBe(true);
    expect(window.__baryonRendererInfo).toMatchObject({
      backendType: "webgl",
      error: null,
      isFallback: true,
    });
  });

  it("keeps runtime GPU error history bounded", async () => {
    const renderer = await createBaryonRenderer(
      { canvas: createCanvas() },
      false,
    );

    for (let index = 0; index < 10; index += 1) {
      renderer.onError({
        api: "WebGPU",
        type: "GPUValidationError",
        message: `Validation error ${index}`,
      });
    }

    expect(window.__baryonRendererInfo.gpuErrors).toHaveLength(8);
    expect(window.__baryonRendererInfo.gpuErrors[0].message).toBe(
      "Validation error 2",
    );
    expect(window.__baryonRendererInfo.gpuErrors.at(-1).message).toBe(
      "Validation error 9",
    );
  });
});
