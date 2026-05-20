import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OUTPUT_MODES,
  RENDER_CONTEXTS,
  advanceRenderOutputCameraCut,
  createCaptureOutputSession,
  createRenderOutputPipeline,
  markRenderOutputCameraCut,
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

  it("marks camera cuts by bypassing temporal history without disposing TRAA", () => {
    const postNodes = {
      traaNode: { dispose: () => {} },
      temporalHistoryBlendUniform: { value: 1 },
    };

    expect(markRenderOutputCameraCut(postNodes)).toBe(true);

    expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBeGreaterThan(0);
  });

  it("restores temporal history after camera-cut frames advance", () => {
    const postNodes = {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    };

    markRenderOutputCameraCut(postNodes, 1);

    expect(advanceRenderOutputCameraCut(postNodes)).toBe(true);
    expect(postNodes.temporalHistoryBlendUniform.value).toBe(1);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBe(0);
  });

  it("does not mark a temporal camera cut when TRAA is absent", () => {
    const postNodes = {
      temporalHistoryBlendUniform: { value: 1 },
    };

    expect(markRenderOutputCameraCut(postNodes)).toBe(false);

    expect(postNodes.temporalHistoryBlendUniform.value).toBe(1);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBeUndefined();
  });

  it("compresses final scene-plus-bloom radiance instead of direct bloom addition", () => {
    const source = readFileSync(
      new URL("./outputPipeline.js", import.meta.url),
      "utf8",
    );
    const composeStart = source.indexOf(
      "export function composeRenderOutputNode",
    );
    const pipelineStart = source.indexOf(
      "export function createRenderOutputPipeline",
    );
    const composeSource = source.slice(composeStart, pipelineStart);

    expect(composeStart).toBeGreaterThanOrEqual(0);
    expect(pipelineStart).toBeGreaterThan(composeStart);
    expect(source).toContain("compressDisplayRadianceNode");
    expect(source).toContain("deriveBloomRadianceScaleNode");
    expect(composeSource).not.toContain(
      "const finalRgb = bloomActive ? sceneRgb.add(bloomPass.rgb) : sceneRgb;",
    );
  });
});
