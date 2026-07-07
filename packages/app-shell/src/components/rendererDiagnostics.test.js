import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererMocks = vi.hoisted(() => ({
  defaultOnDeviceLost: vi.fn(),
  defaultOnError: vi.fn(),
}));

vi.mock("three/webgpu", () => {
  class WebGPUBackend {
    isWebGLBackend = false;
  }

  class WebGLBackend {
    isWebGLBackend = true;
  }

  class WebGPURenderer {
    constructor(parameters) {
      this.parameters = parameters;
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
} from "./rendererDiagnostics.js";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);
const originalCustomEventDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "CustomEvent",
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
    installTestWindow();
  });

  afterEach(() => {
    clearRendererDiagnostics();
    restoreGlobalProperty("CustomEvent", originalCustomEventDescriptor);
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
