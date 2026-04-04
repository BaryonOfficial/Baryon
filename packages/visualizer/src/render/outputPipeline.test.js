import { describe, expect, it } from "vitest";
import {
  OUTPUT_MODES,
  RENDER_CONTEXTS,
  createCaptureOutputSession,
  createRenderOutputPipeline,
  normalizeOutputMode,
  resolveRenderQualityProfile,
} from "./outputPipeline.js";

describe("outputPipeline compatibility surface", () => {
  it("re-exports render profile policy from the public outputPipeline path", () => {
    expect(OUTPUT_MODES.transparent).toBe("transparent");
    expect(normalizeOutputMode("opaque")).toBe("opaque");
    expect(
      resolveRenderQualityProfile({
        qualityPreset: "auto",
        renderContext: RENDER_CONTEXTS.externalOutput,
      }).renderContext,
    ).toBe(RENDER_CONTEXTS.externalOutput);
  });

  it("keeps renderer entrypoints on the public outputPipeline path", () => {
    expect(typeof createRenderOutputPipeline).toBe("function");
    expect(typeof createCaptureOutputSession).toBe("function");
  });
});
