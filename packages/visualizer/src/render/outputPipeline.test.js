import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const {
  mockBloom,
  mockMix,
  mockMrt,
  mockPass,
  mockTraa,
  renderPipelineInstances,
} = vi.hoisted(() => ({
  mockBloom: vi.fn(() => ({ kind: "bloomPass" })),
  mockMix: vi.fn(() => ({ kind: "mixedOutput" })),
  mockMrt: vi.fn((config) => ({ kind: "mrt", config })),
  mockPass: vi.fn(),
  mockTraa: vi.fn(() => ({
    edgeDepthDiff: null,
    useSubpixelCorrection: true,
    dispose: vi.fn(),
    getTextureNode: vi.fn(() => ({ kind: "traaColor" })),
  })),
  renderPipelineInstances: [],
}));

vi.mock("three/webgpu", () => ({
  NearestFilter: "NearestFilter",
  RenderPipeline: class RenderPipeline {
    constructor(gl) {
      this.gl = gl;
      this.outputNode = null;
      this.needsUpdate = false;
      renderPipelineInstances.push(this);
    }
  },
  RenderTarget: class RenderTarget {},
}));

vi.mock("three/tsl", () => ({
  float: vi.fn((value) => ({ kind: "float", value })),
  max: vi.fn((a, b) => ({
    kind: "max",
    a,
    b,
    clamp: vi.fn(() => ({ kind: "clampedMax", a, b })),
  })),
  mix: mockMix,
  mrt: mockMrt,
  output: { kind: "output" },
  pass: mockPass,
  uniform: vi.fn((value) => ({ value })),
  vec4: vi.fn((rgb, alpha) => ({ kind: "vec4", rgb, alpha })),
  velocity: { kind: "velocity" },
}));

vi.mock("three/examples/jsm/tsl/display/BloomNode.js", () => ({
  bloom: mockBloom,
}));

vi.mock("three/examples/jsm/tsl/display/TRAANode.js", () => ({
  traa: mockTraa,
}));

vi.mock("./displayRadiance.js", () => ({
  compressDisplayRadianceNode: vi.fn((node) => ({
    kind: "compressedRadiance",
    node,
  })),
  deriveBloomRadianceScaleNode: vi.fn(() => ({ kind: "bloomRadianceScale" })),
}));

import {
  OUTPUT_MODES,
  RENDER_CONTEXTS,
  advanceRenderOutputTemporalHistoryBypass,
  createCaptureOutputSession,
  createRenderOutputPipeline,
  markRenderOutputCameraCut,
  markRenderOutputContentChange,
  normalizeOutputMode,
  resolveRenderQualityProfile,
} from "./outputPipeline.js";

describe("outputPipeline compatibility surface", () => {
  beforeEach(() => {
    renderPipelineInstances.length = 0;
    mockBloom.mockClear();
    mockMix.mockClear();
    mockMrt.mockClear();
    mockTraa.mockClear();
    mockPass.mockReset();
    mockPass.mockImplementation(() => ({
      setMRT: vi.fn(),
      getTextureNode: vi.fn((name = "color") => ({
        kind: `texture:${name}`,
      })),
    }));
  });

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

  it("builds the TRAA post-process node when TRAA is enabled", () => {
    const pipelineState = createRenderOutputPipeline({}, {}, {}, {
      renderProfile: {
        qualityPreset: "max-quality",
        renderScale: 1,
        traaEnabled: true,
        bloomAllowed: false,
      },
    });
    const scenePass = mockPass.mock.results[0].value;

    expect(mockMrt).toHaveBeenCalledTimes(1);
    expect(scenePass.setMRT).toHaveBeenCalledTimes(1);
    expect(mockTraa).toHaveBeenCalledTimes(1);
    expect(mockMix).toHaveBeenCalledTimes(1);
    expect(pipelineState.postNodes.traaNode).toBe(
      mockTraa.mock.results[0].value,
    );
    expect(pipelineState.postNodes.renderProfile.traaEnabled).toBe(true);
    expect(renderPipelineInstances).toHaveLength(1);
  });

  it("skips the TRAA post-process node when TRAA is disabled", () => {
    const pipelineState = createRenderOutputPipeline({}, {}, {}, {
      renderProfile: {
        qualityPreset: "max-quality",
        renderScale: 1,
        traaEnabled: false,
        bloomAllowed: false,
      },
    });
    const scenePass = mockPass.mock.results[0].value;

    expect(mockMrt).not.toHaveBeenCalled();
    expect(scenePass.setMRT).not.toHaveBeenCalled();
    expect(mockTraa).not.toHaveBeenCalled();
    expect(mockMix).not.toHaveBeenCalled();
    expect(pipelineState.postNodes.traaNode).toBeNull();
    expect(pipelineState.postNodes.traaColor).toBe(
      pipelineState.postNodes.sceneColor,
    );
    expect(pipelineState.postNodes.outputSceneColor).toBe(
      pipelineState.postNodes.sceneColor,
    );
    expect(pipelineState.postNodes.renderProfile.traaEnabled).toBe(false);
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

  it("marks shader content changes by bypassing temporal history without disposing TRAA", () => {
    const postNodes = {
      traaNode: { dispose: () => {} },
      temporalHistoryBlendUniform: { value: 1 },
    };

    expect(markRenderOutputContentChange(postNodes, 3)).toBe(true);

    expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBe(3);
  });

  it("restores temporal history after camera-cut frames advance", () => {
    const postNodes = {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    };

    markRenderOutputCameraCut(postNodes, 1);

    expect(advanceRenderOutputTemporalHistoryBypass(postNodes)).toBe(true);
    expect(postNodes.temporalHistoryBlendUniform.value).toBe(1);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBe(0);
  });

  it("restores temporal history through the generic temporal bypass advance path", () => {
    const postNodes = {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    };

    markRenderOutputContentChange(postNodes, 1);

    expect(advanceRenderOutputTemporalHistoryBypass(postNodes)).toBe(true);
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
