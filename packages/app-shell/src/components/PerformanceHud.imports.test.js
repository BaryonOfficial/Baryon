import { afterEach, describe, expect, it, vi } from "vitest";

describe("PerformanceHud module boundaries", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@baryon/engine/render/outputPipeline");
    vi.doUnmock("@baryon/engine/render/outputProfilePolicy");
  });

  it("avoids the heavyweight outputPipeline import path", async () => {
    vi.doMock("@baryon/engine/render/outputPipeline", () => {
      throw new Error("PerformanceHud must not import outputPipeline");
    });
    vi.doMock("@baryon/engine/render/outputProfilePolicy", () => ({
      formatPerformanceProfileLabel: () => "Auto",
      isAdaptivePerformanceProfile: () => true,
    }));

    const module = await import("./PerformanceHud.jsx");

    expect(module.default).toBeTypeOf("function");
  });
});
