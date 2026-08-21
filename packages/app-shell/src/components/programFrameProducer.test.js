import { describe, expect, it, vi } from "vitest";

import { createProgramFrameProducer } from "./programFrameProducer.js";

describe("program frame producer", () => {
  it("publishes the exact completed render once without an acknowledgement render loop", async () => {
    let completeTransfer;
    const transferFrame = vi.fn(
      () =>
        new Promise((resolve) => {
          completeTransfer = resolve;
        }),
    );
    const render = vi.fn();
    const onStageRender = vi.fn();
    const producer = createProgramFrameProducer({ transferFrame });
    const renderer = {};

    producer.bindRenderer(renderer);
    const completion = producer.produce({
      render,
      renderCanvas: {},
      transferRequired: true,
      onFrame: vi.fn(),
      onStageRender,
      receipt: { frameSequence: 41 },
    });

    expect(render).toHaveBeenCalledOnce();
    expect(transferFrame).toHaveBeenCalledOnce();
    expect(render.mock.invocationCallOrder[0]).toBeLessThan(
      transferFrame.mock.invocationCallOrder[0],
    );
    expect(transferFrame).toHaveBeenCalledWith({}, expect.any(Function));

    completeTransfer(true);
    await completion;

    expect(onStageRender).toHaveBeenCalledOnce();
    expect(onStageRender).toHaveBeenCalledWith({
      frameSequence: 41,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("renders only while a renderer owner is bound", async () => {
    const producer = createProgramFrameProducer();
    const render = vi.fn();

    await expect(producer.produce({ render })).resolves.toBe(false);
    expect(render).not.toHaveBeenCalled();

    producer.bindRenderer({});
    await expect(producer.produce({ render })).resolves.toBe(true);
    expect(render).toHaveBeenCalledOnce();

    producer.detach();
    await expect(producer.produce({ render })).resolves.toBe(false);
    expect(render).toHaveBeenCalledOnce();
  });

  it("leaves render failures to the renderer error boundary", () => {
    const producer = createProgramFrameProducer();
    const renderError = new Error("render failed");
    const onError = vi.fn();
    producer.bindRenderer({});

    expect(() =>
      producer.produce({
        render: () => {
          throw renderError;
        },
        onError,
      }),
    ).toThrow(renderError);
    expect(onError).not.toHaveBeenCalled();
  });

  it("applies transfer backpressure before rendering over the captured frame", async () => {
    let completeTransfer;
    const transferFrame = vi.fn(
      () =>
        new Promise((resolve) => {
          completeTransfer = resolve;
        }),
    );
    const producer = createProgramFrameProducer({ transferFrame });
    producer.bindRenderer({});

    const firstCompletion = producer.produce({
      render: vi.fn(),
      renderCanvas: {},
      transferRequired: true,
      onFrame: vi.fn(),
    });
    const secondRender = vi.fn();
    const secondCompletion = producer.produce({
      render: secondRender,
      renderCanvas: {},
      transferRequired: true,
      onFrame: vi.fn(),
    });

    expect(secondRender).not.toHaveBeenCalled();
    await expect(secondCompletion).resolves.toBe(false);
    expect(transferFrame).toHaveBeenCalledOnce();

    completeTransfer(true);
    await firstCompletion;
  });
});
