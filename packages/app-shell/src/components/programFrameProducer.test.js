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

describe("native GPU frame capacity", () => {
  it("keeps one GPU submission outstanding and completion cannot request another frame", async () => {
    let finish;
    const completeSubmittedWork = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const producer = createProgramFrameProducer(),
      render = vi.fn(),
      receipt = vi.fn();
    const owner = {};
    producer.bindRenderer(owner, { completeSubmittedWork });
    const done = producer.produce({ render, onStageRender: receipt });
    expect(producer.canProduce()).toBe(false);
    producer.bindRenderer(owner, { completeSubmittedWork });
    await expect(producer.produce({ render })).resolves.toBe(false);
    expect(render).toHaveBeenCalledOnce();
    expect(receipt).not.toHaveBeenCalled();
    finish();
    await done;
    expect(producer.canProduce()).toBe(true);
    expect(render).toHaveBeenCalledOnce();
    expect(receipt).toHaveBeenCalledOnce();
  });
  it("requests the bitmap at submission but holds capacity until both GPU and transfer complete", async () => {
    let finishGpu, finishTransfer;
    const transferFrame = vi.fn(
      () =>
        new Promise((resolve) => {
          finishTransfer = resolve;
        }),
    );
    const producer = createProgramFrameProducer({ transferFrame }),
      receipt = vi.fn();
    producer.bindRenderer(
      {},
      {
        completeSubmittedWork: () =>
          new Promise((resolve) => {
            finishGpu = resolve;
          }),
      },
    );
    const done = producer.produce({
      render: vi.fn(),
      transferRequired: true,
      onFrame: vi.fn(),
      onStageRender: receipt,
    });
    expect(transferFrame).toHaveBeenCalledOnce();
    finishGpu();
    await Promise.resolve();
    expect(producer.canProduce()).toBe(false);
    expect(receipt).not.toHaveBeenCalled();
    finishTransfer(true);
    await done;
    expect(producer.canProduce()).toBe(true);
    expect(receipt).toHaveBeenCalledOnce();
  });
  it("a detached/replaced renderer cannot publish a late bitmap or release the new renderer's capacity", async () => {
    const transfers = [],
      gpus = [];
    const producer = createProgramFrameProducer({
      transferFrame: (_canvas, publish) =>
        new Promise((resolve) => transfers.push({ resolve, publish })),
    });
    const completeSubmittedWork = () =>
      new Promise((resolve) => gpus.push(resolve));
    const onFrame = vi.fn(),
      onStageRender = vi.fn();
    producer.bindRenderer({}, { completeSubmittedWork });
    const old = producer.produce({
      render: vi.fn(),
      transferRequired: true,
      onFrame,
      onStageRender,
    });
    producer.detach();
    producer.bindRenderer({}, { completeSubmittedWork });
    const next = producer.produce({
      render: vi.fn(),
      transferRequired: true,
      onFrame,
      onStageRender,
    });
    const bitmap = { close: vi.fn() };
    transfers[0].publish({ bitmap });
    transfers[0].resolve(true);
    gpus[0]();
    await old;
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(onFrame).not.toHaveBeenCalled();
    expect(onStageRender).not.toHaveBeenCalled();
    expect(producer.canProduce()).toBe(false);
    transfers[1].publish({ bitmap: {} });
    transfers[1].resolve(true);
    gpus[1]();
    await next;
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onStageRender).toHaveBeenCalledOnce();
    expect(producer.canProduce()).toBe(true);
  });
  it("GPU loss is reported once and the same renderer cannot reopen admission", async () => {
    const producer = createProgramFrameProducer(),
      owner = {},
      onError = vi.fn();
    producer.bindRenderer(owner, {
      completeSubmittedWork: () => Promise.reject(new Error("device lost")),
    });
    await expect(producer.produce({ render: vi.fn(), onError })).resolves.toBe(
      false,
    );
    expect(onError).toHaveBeenCalledOnce();
    producer.bindRenderer(owner);
    expect(() => producer.canProduce()).toThrow(/device lost/);
  });
});
