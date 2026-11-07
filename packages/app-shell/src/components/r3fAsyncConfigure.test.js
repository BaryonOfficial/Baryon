// @vitest-environment jsdom

import { _roots, createRoot } from "@react-three/fiber";
import { expect, it, vi } from "vitest";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createRendererStub(canvas) {
  return {
    domElement: canvas,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    shadowMap: {},
    xr: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      isPresenting: false,
      setAnimationLoop: vi.fn(),
    },
  };
}

function disposeConfigureOnlyRoot(canvas) {
  const state = _roots.get(canvas)?.store.getState();
  if (state) {
    state.internal.active = false;
    state.xr?.disconnect?.();
    state.scene?.clear?.();
  }
  _roots.delete(canvas);
  canvas.remove();
}

const CONFIGURATION_WIDTH = 1266.4;
const CONFIGURATION_HEIGHT = 737.6;

function createConfiguration(createRenderer) {
  return {
    gl: createRenderer,
    size: {
      width: CONFIGURATION_WIDTH,
      height: CONFIGURATION_HEIGHT,
      top: 0,
      left: 0,
    },
    dpr: 1,
    camera: {
      position: [0, 0, 7.794228634059947],
      up: [0, 1, 0],
      fov: 65,
      near: 0.1,
      far: 100,
    },
  };
}

// Upstream serialization must preserve Baryon's fractional viewport geometry.
it("serializes concurrent configure calls during async renderer init", async () => {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const root = createRoot(canvas);
  const rendererInitialization = createDeferred();
  const renderer = createRendererStub(canvas);
  const createRenderer = vi.fn(() => rendererInitialization.promise);
  const configuration = createConfiguration(createRenderer);

  try {
    const firstConfigure = root.configure(configuration);
    const reentrantConfigure = root.configure(configuration);

    rendererInitialization.resolve(renderer);
    await Promise.all([firstConfigure, reentrantConfigure]);

    const state = _roots.get(canvas)?.store.getState();
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(state?.gl).toBe(renderer);
    expect(state?.size).toMatchObject({
      width: CONFIGURATION_WIDTH,
      height: CONFIGURATION_HEIGHT,
    });
    expect(state?.camera.aspect).toBeCloseTo(
      CONFIGURATION_WIDTH / CONFIGURATION_HEIGHT,
    );
    expect(state?.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(
      true,
    );
  } finally {
    disposeConfigureOnlyRoot(canvas);
  }
});

it("surfaces initialization failure to queued calls and retries only on an explicit new root", async () => {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const root = createRoot(canvas);
  const failedInitialization = createDeferred();
  const renderer = createRendererStub(canvas);
  const createRenderer = vi
    .fn()
    .mockImplementationOnce(() => failedInitialization.promise)
    .mockResolvedValueOnce(renderer);
  const configuration = createConfiguration(createRenderer);
  const replacementCanvas = document.createElement("canvas");

  try {
    const failedConfigure = root.configure(configuration);
    const queuedConfigure = root.configure(configuration);
    const results = Promise.allSettled([failedConfigure, queuedConfigure]);
    const failure = new Error("renderer init failed");
    failedInitialization.reject(failure);
    expect(await results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    // Production recovery replaces Canvas through its error boundary. A queued
    // resize/configuration must not independently start another GPU lifetime.
    const replacement = createRoot(replacementCanvas);
    await replacement.configure(configuration);
    const state = _roots.get(replacementCanvas)?.store.getState();
    expect(createRenderer).toHaveBeenCalledTimes(2);
    expect(state?.gl).toBe(renderer);
    expect(state?.camera.aspect).toBeCloseTo(
      CONFIGURATION_WIDTH / CONFIGURATION_HEIGHT,
    );
  } finally {
    disposeConfigureOnlyRoot(canvas);
    disposeConfigureOnlyRoot(replacementCanvas);
  }
});
