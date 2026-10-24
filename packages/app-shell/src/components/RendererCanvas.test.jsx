/* @vitest-environment jsdom */
import React, { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canvas = vi.hoisted(() => ({ props: null }));
vi.mock("@react-three/fiber", () => ({
  Canvas: (props) => {
    canvas.props = props;
    return <div />;
  },
}));
import { RendererCanvas } from "./RendererCanvas.jsx";

describe("Canvas renderer lifetime", () => {
  let root, container;
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("survives development effect replay and releases the mounted renderer once on hide", async () => {
    const renderer = { dispose: vi.fn() },
      factory = vi.fn(async () => renderer);
    await act(async () =>
      root.render(
        <StrictMode>
          <RendererCanvas gl={factory} />
        </StrictMode>,
      ),
    );
    const initialize = canvas.props.gl;
    expect(await initialize({ canvas: {} })).toBe(renderer);
    expect(renderer.dispose).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(renderer.dispose).toHaveBeenCalledOnce();
    await expect(initialize({ canvas: {} })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(factory).toHaveBeenCalledOnce();
  });

  it("shares initialization when Canvas requests the same renderer before it is ready", async () => {
    let finish;
    const renderer = { dispose: vi.fn() },
      factory = vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    await act(async () => root.render(<RendererCanvas gl={factory} />));
    const first = canvas.props.gl({ canvas: {} });
    const second = canvas.props.gl({ canvas: {} });
    expect(factory).toHaveBeenCalledOnce();
    finish(renderer);
    expect(await first).toBe(renderer);
    expect(await second).toBe(renderer);
  });

  it("releases initialization finishing after unmount without disposing a replacement", async () => {
    let finishOld;
    const old = { dispose: vi.fn() },
      next = { dispose: vi.fn() };
    const oldFactory = () =>
      new Promise((resolve) => {
        finishOld = resolve;
      });
    await act(async () =>
      root.render(<RendererCanvas key="old" gl={oldFactory} />),
    );
    const pending = canvas.props.gl({ canvas: {} });
    // Attach the rejection handler before resolving the abandoned initialization.
    const cancelled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await act(async () =>
      root.render(<RendererCanvas key="new" gl={async () => next} />),
    );
    expect(await canvas.props.gl({ canvas: {} })).toBe(next);
    finishOld(old);
    await cancelled;
    expect(old.dispose).toHaveBeenCalledOnce();
    expect(next.dispose).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(next.dispose).toHaveBeenCalledOnce();
  });

  it("releases an initialized old renderer on replacement before the new factory completes", async () => {
    const old = { dispose: vi.fn() },
      next = { dispose: vi.fn() };
    let finishNext;
    await act(async () =>
      root.render(<RendererCanvas key="old" gl={async () => old} />),
    );
    await canvas.props.gl({ canvas: {} });
    await act(async () =>
      root.render(
        <RendererCanvas
          key="new"
          gl={() =>
            new Promise((resolve) => {
              finishNext = resolve;
            })
          }
        />,
      ),
    );
    const pending = canvas.props.gl({ canvas: {} });
    expect(old.dispose).toHaveBeenCalledOnce();
    finishNext(next);
    expect(await pending).toBe(next);
    expect(next.dispose).not.toHaveBeenCalled();
  });
});
