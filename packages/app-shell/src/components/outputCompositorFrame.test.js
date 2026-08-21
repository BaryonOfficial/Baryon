import { afterEach, describe, expect, it, vi } from "vitest";

import { transferOutputCompositorFrame } from "./outputCompositorFrame.js";

const originalCreateImageBitmapDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "createImageBitmap",
);

function restoreCreateImageBitmap() {
  if (originalCreateImageBitmapDescriptor) {
    Object.defineProperty(
      globalThis,
      "createImageBitmap",
      originalCreateImageBitmapDescriptor,
    );
  } else {
    delete globalThis.createImageBitmap;
  }
}

describe("output compositor frame transfer", () => {
  afterEach(() => {
    restoreCreateImageBitmap();
  });

  it("snapshots exactly one ImageBitmap from the compositor-visible render canvas", async () => {
    const bitmap = { width: 1920, height: 1080, close: vi.fn() };
    const renderCanvas = { width: 1920, height: 1080 };
    const createImageBitmap = vi.fn(async () => bitmap);
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: createImageBitmap,
    });
    const onFrame = vi.fn();

    await expect(
      transferOutputCompositorFrame(renderCanvas, onFrame),
    ).resolves.toBe(true);
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(renderCanvas, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "premultiply",
    });
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onFrame).toHaveBeenCalledWith({
      bitmap,
      width: 1920,
      height: 1080,
    });
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it("releases a bitmap when its sole consumer rejects it", async () => {
    const bitmap = { width: 1920, height: 1080, close: vi.fn() };
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn(async () => bitmap),
    });

    await expect(
      transferOutputCompositorFrame({}, () => {
        throw new Error("compositor unavailable");
      }),
    ).rejects.toThrow("compositor unavailable");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects when the browser cannot snapshot compositor-visible canvases", async () => {
    delete globalThis.createImageBitmap;

    await expect(
      transferOutputCompositorFrame({}, vi.fn()),
    ).rejects.toMatchObject({
      name: "OutputCompositorFrameError",
    });
  });
});
