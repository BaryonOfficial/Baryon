// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchControlsChanged } from "../../controls/controlsEvents.js";
import {
  RUNTIME_RENDERER_BACKENDS,
  RUNTIME_SESSION_PHASES,
} from "./runtimeSessionController.js";
import { useRuntimeSessionController } from "./useRuntimeSessionController.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function RuntimeSessionHarness({
  onState,
  preferWebGLRenderer = false,
  setIsEngineReady = () => {},
}) {
  const state = useRuntimeSessionController({
    initialRendererFallback: false,
    preferWebGLRenderer,
    setIsEngineReady,
  });
  onState(state);
  return null;
}

describe("useRuntimeSessionController", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("recreates one complete runtime generation for a backend change", () => {
    vi.useFakeTimers();
    const onState = vi.fn();
    const setIsEngineReady = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <RuntimeSessionHarness
          onState={onState}
          setIsEngineReady={setIsEngineReady}
        />,
      );
    });
    act(() => {
      onState.mock.lastCall?.[0].markRendererReady(
        0,
        RUNTIME_RENDERER_BACKENDS.webgpu,
      );
    });

    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 0,
      phase: RUNTIME_SESSION_PHASES.ready,
      activeBackend: RUNTIME_RENDERER_BACKENDS.webgpu,
      showCanvas: true,
    });

    act(() => {
      dispatchControlsChanged({ forceWebGLFallbackTest: true });
    });

    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 0,
      phase: RUNTIME_SESSION_PHASES.disposing,
      requestedBackend: RUNTIME_RENDERER_BACKENDS.webgl2,
      activeBackend: RUNTIME_RENDERER_BACKENDS.webgpu,
      showCanvas: false,
    });
    expect(setIsEngineReady).toHaveBeenLastCalledWith(false);

    act(() => {
      vi.advanceTimersByTime(650);
    });

    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 1,
      phase: RUNTIME_SESSION_PHASES.starting,
      activeBackend: RUNTIME_RENDERER_BACKENDS.webgl2,
      showCanvas: true,
    });

    act(() => {
      onState.mock.lastCall?.[0].markRendererReady(
        1,
        RUNTIME_RENDERER_BACKENDS.webgl2,
      );
    });
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 1,
      phase: RUNTIME_SESSION_PHASES.ready,
      observedBackend: RUNTIME_RENDERER_BACKENDS.webgl2,
    });

    act(() => {
      root.unmount();
    });
  });

  it("ignores stale acknowledgements and does not restart from mirrored state", () => {
    vi.useFakeTimers();
    const onState = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<RuntimeSessionHarness onState={onState} />);
    });
    act(() => {
      dispatchControlsChanged({ forceWebGLFallbackTest: true });
    });
    act(() => {
      vi.advanceTimersByTime(650);
    });

    const generationOne = onState.mock.lastCall?.[0];
    expect(generationOne.generation).toBe(1);
    act(() => {
      generationOne.markRendererReady(0, RUNTIME_RENDERER_BACKENDS.webgpu);
    });
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 1,
      phase: RUNTIME_SESSION_PHASES.starting,
    });

    act(() => {
      generationOne.markRendererReady(1, RUNTIME_RENDERER_BACKENDS.webgl2);
    });
    act(() => {
      generationOne.markRendererReady(1, RUNTIME_RENDERER_BACKENDS.webgl2);
    });
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 1,
      phase: RUNTIME_SESSION_PHASES.ready,
    });

    act(() => {
      root.unmount();
    });
  });

  it("keeps a product-required WebGL renderer active when the audit toggle changes", () => {
    vi.useFakeTimers();
    const onState = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <RuntimeSessionHarness onState={onState} preferWebGLRenderer={true} />,
      );
    });
    act(() => {
      onState.mock.lastCall?.[0].markRendererReady(
        0,
        RUNTIME_RENDERER_BACKENDS.webgl2,
      );
      dispatchControlsChanged({ forceWebGLFallbackTest: true });
      dispatchControlsChanged({ forceWebGLFallbackTest: false });
      vi.runAllTimers();
    });

    expect(onState.mock.lastCall?.[0]).toMatchObject({
      generation: 0,
      rendererRequiredWebGL: true,
      activeBackend: RUNTIME_RENDERER_BACKENDS.webgl2,
      phase: RUNTIME_SESSION_PHASES.ready,
      showCanvas: true,
    });

    act(() => {
      root.unmount();
    });
  });
});
