import { afterEach, describe, expect, it, vi } from "vitest";

describe("PerformanceHud module boundaries", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@baryon/visualizer/render/outputPipeline");
    vi.doUnmock("@baryon/visualizer/render/outputProfilePolicy");
  });

  it("avoids the heavyweight outputPipeline import path", async () => {
    vi.doMock("@baryon/visualizer/render/outputPipeline", () => {
      throw new Error("PerformanceHud must not import outputPipeline");
    });
    vi.doMock("@baryon/visualizer/render/outputProfilePolicy", () => ({
      formatPerformanceProfileLabel: () => "Auto",
    }));

    const module = await import("./PerformanceHud.jsx");

    expect(module.default).toBeTypeOf("function");
  });
});
