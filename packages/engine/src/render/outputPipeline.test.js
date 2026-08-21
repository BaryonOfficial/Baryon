import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const {
  mockBloom,
  mockCompressDisplayRadiance,
  mockConvertToTexture,
  mockFixedOpticalPsf,
  mockMix,
  mockMrt,
  mockPass,
  mockSmaa,
  mockTraa,
  mockRaymarchAovNodes,
  renderPipelineInstances,
} = vi.hoisted(() => ({
  mockBloom: vi.fn((input, strength, radius, threshold) => ({
    kind: "bloomPass",
    input,
    strength,
    radius,
    threshold,
    rgb: {
      kind: "bloomRgb",
      mul: vi.fn((enabled) => ({
        kind: "gatedBloomRgb",
        enabled,
        r: 0.3,
        g: 0.3,
        b: 0.3,
      })),
    },
    dispose: vi.fn(),
  })),
  mockCompressDisplayRadiance: vi.fn((node) => ({
    kind: "compressedRadiance",
    node,
  })),
  mockConvertToTexture: vi.fn((node) => ({
    kind: "linearTexture",
    node,
    rgb: { kind: "linearTextureRgb", node: node.rgb },
    a: { kind: "linearTextureAlpha", node: node.a },
    value: { name: "" },
    dispose: vi.fn(),
  })),
  mockFixedOpticalPsf: vi.fn((source) => ({
    kind: "fixedOpticalPsfSample",
    source,
    rgb: {
      mul: vi.fn(() => ({ kind: "scaledFixedOpticalPsf" })),
    },
  })),
  mockMix: vi.fn(() => ({
    kind: "mixedOutput",
    rgb: {
      mul: vi.fn(() => ({ kind: "scaledMixedOutput" })),
    },
    a: { kind: "mixedAlpha" },
  })),
  mockMrt: vi.fn((config) => ({ kind: "mrt", config })),
  mockPass: vi.fn(),
  mockSmaa: vi.fn((node) => ({
    kind: "smaa",
    node,
    rgb: { kind: "smaaRgb" },
    a: { kind: "smaaAlpha" },
    dispose: vi.fn(),
  })),
  mockTraa: vi.fn(() => ({
    edgeDepthDiff: null,
    useSubpixelCorrection: true,
    dispose: vi.fn(),
    getTextureNode: vi.fn(() => ({ kind: "traaColor" })),
  })),
  mockRaymarchAovNodes: {
    baseRadiance: { kind: "raymarchBaseRadiance" },
    transmittance: { kind: "raymarchTransmittance" },
  },
  renderPipelineInstances: [],
}));

vi.mock("three/webgpu", () => ({
  NearestFilter: "NearestFilter",
  RenderPipeline: class RenderPipeline {
    constructor(gl) {
      this.gl = gl;
      this.outputNode = null;
      this.needsUpdate = false;
      this.renderCallCount = 0;
      this.renderSpy = vi.fn();
      renderPipelineInstances.push(this);
    }

    render() {
      this.renderCallCount += 1;
      this.renderSpy();
    }
  },
  RenderTarget: class RenderTarget {},
}));

vi.mock("three/tsl", () => ({
  convertToTexture: mockConvertToTexture,
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
  uniform: vi.fn((value) => ({
    value,
    add: vi.fn((node) => ({ kind: "opaqueBackground", node })),
  })),
  vec3: vi.fn((value) => ({ kind: "vec3", value })),
  vec4: vi.fn((rgb, alpha) => ({ kind: "vec4", rgb, a: alpha, alpha })),
  velocity: { kind: "velocity" },
}));

vi.mock("../core/raymarch/SafeVolumetricLightingModel.js", () => ({
  raymarchBaseLightNode: mockRaymarchAovNodes.baseRadiance,
  raymarchTransmittanceNode: mockRaymarchAovNodes.transmittance,
}));

vi.mock("three/examples/jsm/tsl/display/TRAANode.js", () => ({
  traa: mockTraa,
}));

vi.mock("./pairedBloomNode.js", () => ({
  pairedBloom: mockBloom,
}));

vi.mock("./fusedSmaaNode.js", () => ({
  fusedSmaa: mockSmaa,
}));

vi.mock("./displayRadiance.js", () => ({
  FIXED_OPTICAL_PSF_HALO_FRACTION: 0.05,
  composeFixedOpticalPsfRadianceNode: vi.fn((scene, blurred) => ({
    kind: "fixedOpticalPsf",
    scene,
    blurred,
    add: vi.fn((bloomRgb) => ({
      kind: "fixedOpticalPsfWithBloom",
      scene,
      blurred,
      bloomRgb,
    })),
  })),
  compressDisplayRadianceNode: mockCompressDisplayRadiance,
  sampleFixedOpticalPsfNode: mockFixedOpticalPsf,
}));

import {
  CHECKPOINT_AOV_MODES,
  OUTPUT_MODES,
  RENDER_CONTEXTS,
  advanceRenderOutputTemporalHistoryBypass,
  composeRenderOutputNode,
  consumeRenderOutputVisualIdle,
  createCaptureOutputSession,
  createFallbackRenderOutputPipeline,
  createRenderOutputPipeline,
  disposeRenderOutputPostNodes,
  getRenderOutputCarrierTruthEnabled,
  getRenderOutputSmaaGraphEnabled,
  markRenderOutputCameraCut,
  markRenderOutputContentChange,
  markRenderOutputVisualIdle,
  normalizeOutputMode,
  readRenderOutputCheckpointAovsAsync,
  resolveRenderQualityProfile,
  syncRenderOutputBloomUniforms,
  syncRenderOutputNodeTopology,
} from "./outputPipeline.js";

describe("outputPipeline compatibility surface", () => {
  beforeEach(() => {
    renderPipelineInstances.length = 0;
    mockBloom.mockClear();
    mockCompressDisplayRadiance.mockClear();
    mockConvertToTexture.mockClear();
    mockFixedOpticalPsf.mockClear();
    mockMix.mockClear();
    mockMrt.mockClear();
    mockSmaa.mockClear();
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
    expect(normalizeOutputMode()).toBe("opaque");
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

  it("keeps the WebGL fallback scene pass color-only", () => {
    createFallbackRenderOutputPipeline(
      { backend: { isWebGLBackend: true } },
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );

    expect(mockPass).toHaveBeenCalledWith({}, {}, { depthBuffer: false });
  });

  it("adds base radiance, transmittance, and coverage to the production scene pass on demand", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        checkpointAovMode: CHECKPOINT_AOV_MODES.base,
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );
    const scenePass = mockPass.mock.results[0].value;
    const mrtConfig = mockMrt.mock.calls[0][0];

    expect(scenePass.setMRT).toHaveBeenCalledTimes(1);
    expect(mrtConfig).toMatchObject({
      output: { kind: "output" },
      baseRadiance: {
        kind: "vec4",
        rgb: mockRaymarchAovNodes.baseRadiance,
      },
      transmittance: { kind: "vec4" },
    });
    // Coverage is derived from transmittance at readback: a fifth color
    // attachment would exceed WebGPU's 32-byte-per-sample baseline budget in
    // current mode.
    expect(mrtConfig).not.toHaveProperty("coverage");
    expect(mrtConfig).not.toHaveProperty("velocity");
    expect(scenePass.getTextureNode).toHaveBeenCalledWith("baseRadiance");
    expect(scenePass.getTextureNode).toHaveBeenCalledWith("transmittance");
    expect(pipelineState.postNodes.checkpointAovMode).toBe(
      CHECKPOINT_AOV_MODES.base,
    );
  });

  it("reads checkpoint AOV attachments by texture identity rather than a fixed index", async () => {
    const renderer = {
      readRenderTargetPixelsAsync: vi.fn(
        async (_target, _x, _y, _w, _h, index) =>
          new Float32Array([index === 1 ? 0.25 : index, 0, 0, 1]),
      ),
    };
    const renderTarget = {
      width: 4,
      height: 3,
      textures: [
        { name: "output", type: "half" },
        { name: "transmittance", type: "half" },
        { name: "baseRadiance", type: "half" },
      ],
    };

    const aovs = await readRenderOutputCheckpointAovsAsync(
      renderer,
      {
        checkpointAovMode: CHECKPOINT_AOV_MODES.base,
        scenePass: { renderTarget },
      },
      4,
      3,
    );

    expect(aovs.baseRadiance.pixels[0]).toBe(2);
    expect(aovs.transmittance.pixels[0]).toBe(0.25);
    // Coverage is reconstructed as saturate(1 - T) from the transmittance
    // attachment.
    expect(aovs.coverage.pixels[0]).toBeCloseTo(0.75, 12);
    expect(aovs.coverage.pixels[3]).toBe(1);
    expect(aovs).toMatchObject({ width: 4, height: 3 });
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(2);
  });

  it("reads the accent attachment in current checkpoint mode", async () => {
    const renderer = {
      readRenderTargetPixelsAsync: vi.fn(
        async (_target, _x, _y, _w, _h, index) =>
          new Float32Array([index === 3 ? 0.5 : index, 0, 0, 1]),
      ),
    };
    const renderTarget = {
      width: 4,
      height: 3,
      textures: [
        { name: "output", type: "half" },
        { name: "accentRadiance", type: "half" },
        { name: "baseRadiance", type: "half" },
        { name: "transmittance", type: "half" },
      ],
    };

    const aovs = await readRenderOutputCheckpointAovsAsync(
      renderer,
      {
        checkpointAovMode: CHECKPOINT_AOV_MODES.current,
        scenePass: { renderTarget },
      },
      4,
      3,
    );

    expect(aovs.baseRadiance.pixels[0]).toBe(2);
    expect(aovs.accentRadiance.pixels[0]).toBe(1);
    expect(aovs.transmittance.pixels[0]).toBe(0.5);
    expect(aovs.coverage.pixels[0]).toBeCloseTo(0.5, 12);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(3);
  });

  it("refuses a checkpoint AOV readback from a mis-sized render target", async () => {
    const renderer = { readRenderTargetPixelsAsync: vi.fn() };
    const renderTarget = {
      width: 447,
      height: 863,
      textures: [{ name: "baseRadiance", type: "half" }],
    };

    await expect(
      readRenderOutputCheckpointAovsAsync(
        renderer,
        {
          checkpointAovMode: CHECKPOINT_AOV_MODES.base,
          scenePass: { renderTarget },
        },
        512,
        384,
      ),
    ).rejects.toThrow("refusing a cropped or out-of-range readback");
    expect(renderer.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
  });

  it("uses the output color as the opaque output base", () => {
    const sceneRgb = { kind: "sceneRgb" };
    const sceneAlpha = {
      oneMinus: vi.fn(() => ({ kind: "unusedAlphaInverse" })),
    };
    const outputBackgroundNode = {
      add: vi.fn(() => ({ kind: "opaqueOutputRgb" })),
      mul: vi.fn(() => ({ kind: "alphaBlendedBackground" })),
    };

    const outputNode = composeRenderOutputNode({
      sceneColor: { rgb: sceneRgb, a: sceneAlpha },
      opticalPsfPass: null,
      bloomPass: null,
      bloomEnabledNode: { value: 0 },
      outputMode: "opaque",
      outputBackgroundNode,
    });

    expect(outputBackgroundNode.mul).not.toHaveBeenCalled();
    expect(sceneAlpha.oneMinus).not.toHaveBeenCalled();
    expect(outputBackgroundNode.add).toHaveBeenCalledWith({
      kind: "compressedRadiance",
      node: sceneRgb,
    });
    expect(outputNode).toEqual({
      kind: "vec4",
      rgb: { kind: "opaqueOutputRgb" },
      a: 1,
      alpha: 1,
    });
    expect(mockCompressDisplayRadiance).toHaveBeenCalledWith(sceneRgb);
  });

  it("uses the preview display transform for transparent program RGB", () => {
    const sceneRgb = { kind: "sceneRgb" };
    const sceneAlpha = { kind: "sceneAlpha" };

    const outputNode = composeRenderOutputNode({
      sceneColor: { rgb: sceneRgb, a: sceneAlpha },
      opticalPsfPass: null,
      bloomPass: null,
      bloomEnabledNode: { value: 0 },
      outputMode: "transparent",
      outputBackgroundNode: {},
    });

    expect(mockCompressDisplayRadiance).toHaveBeenCalledWith(sceneRgb);
    expect(outputNode).toEqual({
      kind: "vec4",
      rgb: {
        kind: "compressedRadiance",
        node: sceneRgb,
      },
      a: sceneAlpha,
      alpha: sceneAlpha,
    });
  });

  it("keeps the fixed PSF active while a uniform gates additive bloom", () => {
    const sceneColor = {
      rgb: { kind: "sceneRgb" },
      a: { kind: "sceneAlpha" },
    };
    const opticalPsfPass = {
      rgb: {
        r: 0.2,
        g: 0.2,
        b: 0.2,
        mul: vi.fn(() => ({ r: 0.01, g: 0.01, b: 0.01 })),
      },
    };
    const gatedBloomRgb = {
      kind: "gatedBloomRgb",
      r: 0.3,
      g: 0.3,
      b: 0.3,
    };
    const bloomPass = {
      rgb: {
        kind: "bloomRgb",
        mul: vi.fn(() => gatedBloomRgb),
      },
    };
    const bloomEnabledNode = { kind: "bloomEnabledUniform", value: 1 };

    const withBloom = composeRenderOutputNode({
      sceneColor,
      opticalPsfPass,
      bloomPass,
      bloomEnabledNode,
      outputMode: "transparent",
      outputBackgroundNode: {},
    });

    expect(bloomPass.rgb.mul).toHaveBeenCalledWith(bloomEnabledNode);
    expect(withBloom.rgb.node).toMatchObject({
      kind: "fixedOpticalPsfWithBloom",
      bloomRgb: gatedBloomRgb,
    });
  });

  it("keeps fixed PSF optics when conventional bloom is disallowed", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );

    expect(mockFixedOpticalPsf).toHaveBeenCalledTimes(1);
    expect(mockBloom).not.toHaveBeenCalled();
    expect(pipelineState.postNodes.opticalPsfPass).toBeTruthy();
    expect(pipelineState.postNodes.bloomPasses).toHaveLength(0);
    expect(getRenderOutputCarrierTruthEnabled(pipelineState.postNodes)).toBe(
      false,
    );
  });

  it("exposes raw carrier truth without optical or anti-aliasing passes", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: true,
          bloomAllowed: true,
          carrierTruthEnabled: true,
        },
      },
    );

    expect(getRenderOutputCarrierTruthEnabled(pipelineState.postNodes)).toBe(
      true,
    );
    expect(pipelineState.postNodes.carrierTruthEnabled).toBe(true);
    expect(pipelineState.postNodes.traaNode).toBeNull();
    expect(mockPass).toHaveBeenCalledWith({}, {}, { depthBuffer: false });
    expect(mockTraa).not.toHaveBeenCalled();
    expect(mockFixedOpticalPsf).not.toHaveBeenCalled();
    expect(mockBloom).not.toHaveBeenCalled();
    expect(mockSmaa).not.toHaveBeenCalled();
    expect(renderPipelineInstances[0].outputNode).toMatchObject({
      kind: "vec4",
      rgb: {
        kind: "opaqueBackground",
        node: { kind: "compressedRadiance" },
      },
    });
  });

  it("keeps current-frame scene coverage alpha out of the TRAA resolve", () => {
    // TRAA's resolve quad is an opaque NodeMaterial, so Three forces its
    // alpha to 1. Temporal output must mix radiance only and take alpha from
    // the scene pass, or transparent external output loses all coverage.
    const sceneColorNode = {
      kind: "texture:output",
      rgb: { kind: "sceneRgb" },
      a: { kind: "sceneAlpha" },
    };
    mockPass.mockImplementation(() => ({
      setMRT: vi.fn(),
      getTextureNode: vi.fn((name = "color") =>
        name === "output" ? sceneColorNode : { kind: `texture:${name}` },
      ),
    }));
    const traaColorNode = { kind: "traaColor", rgb: { kind: "traaRgb" } };
    mockTraa.mockImplementationOnce(() => ({
      edgeDepthDiff: null,
      useSubpixelCorrection: true,
      dispose: vi.fn(),
      getTextureNode: vi.fn(() => traaColorNode),
    }));

    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: true,
          bloomAllowed: false,
        },
      },
    );

    expect(mockMix.mock.calls[0][0]).toBe(sceneColorNode.rgb);
    expect(mockMix.mock.calls[0][1]).toBe(traaColorNode.rgb);
    expect(pipelineState.postNodes.outputSceneColor).toMatchObject({
      kind: "vec4",
      rgb: { kind: "mixedOutput" },
      a: { kind: "sceneAlpha" },
    });
  });

  it("builds the TRAA post-process node when TRAA is enabled", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: true,
          bloomAllowed: false,
        },
      },
    );
    const scenePass = mockPass.mock.results[0].value;

    expect(mockPass).toHaveBeenCalledWith({}, {}, { depthBuffer: true });
    expect(mockMrt).toHaveBeenCalledTimes(1);
    expect(scenePass.setMRT).toHaveBeenCalledTimes(1);
    expect(mockTraa).toHaveBeenCalledTimes(1);
    // Only the scene color is blended now; the optics read that result rather
    // than each running their own parallel blend.
    expect(mockMix).toHaveBeenCalledTimes(1);
    expect(pipelineState.postNodes.traaNode).toBe(
      mockTraa.mock.results[0].value,
    );
    expect(pipelineState.postNodes.renderProfile.traaEnabled).toBe(true);
    expect(mockConvertToTexture.mock.calls[0][3]).toMatchObject({
      depthBuffer: false,
    });
    expect(renderPipelineInstances).toHaveLength(1);
  });

  it("runs one optics lane fed by the already-blended temporal color", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: true,
          bloomAllowed: true,
        },
      },
    );
    // The temporal blend is binary, so mix(f(raw), f(traa), t) collapses to
    // f(blended). One PSF kernel and one bloom pyramid, not two of each.
    expect(mockFixedOpticalPsf).toHaveBeenCalledTimes(1);
    expect(mockBloom).toHaveBeenCalledTimes(1);
    expect(pipelineState.postNodes.opticalPsfPass).toBe(
      mockFixedOpticalPsf.mock.results[0].value,
    );
    expect(pipelineState.postNodes.bloomPass).toBe(
      mockBloom.mock.results[0].value,
    );
    expect(pipelineState.postNodes.bloomPasses).toHaveLength(1);

    // Both lanes read the same source, and it is not the unblended scene pass.
    const psfSource = mockFixedOpticalPsf.mock.calls[0][0];
    expect(mockBloom.mock.calls[0][0]).toBe(psfSource);
    expect(psfSource).not.toBe(pipelineState.postNodes.sceneColor);
  });

  it("uses one fixed optical PSF path when temporal history is disabled", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: true,
        },
      },
    );

    expect(mockFixedOpticalPsf).toHaveBeenCalledTimes(1);
    expect(mockBloom).toHaveBeenCalledTimes(1);
    // With no temporal path there is nothing to blend, so the optics read the
    // scene pass directly rather than a materialized copy of it.
    expect(mockFixedOpticalPsf).toHaveBeenCalledWith(
      pipelineState.postNodes.sceneColor,
    );
  });

  it("updates every live bloom pass from the advanced controls", () => {
    const firstPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };
    const secondPass = {
      strength: { value: 0 },
      radius: { value: 0 },
      threshold: { value: 0 },
    };

    const enabled = { value: 1 };
    syncRenderOutputBloomUniforms(
      {
        bloomUniforms: { enabled },
        bloomPasses: [firstPass, secondPass],
      },
      { enabled: false, strength: 0.8, radius: 0.25, threshold: 0.4 },
    );

    expect(enabled.value).toBe(0);
    for (const bloomPass of [firstPass, secondPass]) {
      expect(bloomPass.strength.value).toBe(0.8);
      expect(bloomPass.radius.value).toBe(0.25);
      expect(bloomPass.threshold.value).toBe(0.4);
    }
  });

  it("normalizes resolved render profiles at the pipeline boundary", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "custom",
          targetFps: 96,
          renderScale: 0.5,
          traaEnabled: true,
          bloomAllowed: false,
          renderContext: RENDER_CONTEXTS.externalOutput,
        },
      },
    );

    expect(pipelineState.postNodes.renderProfile).toEqual({
      qualityPreset: "custom",
      targetFps: 96,
      startupRaymarchSteps: 32,
      traaEnabled: true,
      bloomAllowed: false,
      carrierTruthEnabled: false,
      renderContext: RENDER_CONTEXTS.externalOutput,
    });
  });

  it("routes the linear-HDR output through SMAA by default", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );

    expect(mockSmaa).toHaveBeenCalledTimes(1);
    expect(pipelineState.postNodes.smaaNode).toBe(
      mockSmaa.mock.results[0].value,
    );
    expect(getRenderOutputSmaaGraphEnabled(pipelineState.postNodes)).toBe(true);
    expect(renderPipelineInstances[0].outputNode).toMatchObject({
      kind: "smaa",
      node: mockConvertToTexture.mock.results[0].value,
    });
  });

  it("applies the display shoulder before SMAA and the shared sRGB transfer", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );
    const smaaNode = mockSmaa.mock.results[0].value;
    const smaaInput = mockSmaa.mock.calls[0][0];
    const displayLinearTextureNode = mockConvertToTexture.mock.results[0].value;

    expect(mockConvertToTexture).toHaveBeenCalledTimes(1);
    expect(mockConvertToTexture.mock.calls[0][0]).toMatchObject({
      kind: "vec4",
      rgb: {
        kind: "opaqueBackground",
        node: {
          kind: "compressedRadiance",
          node: { kind: "fixedOpticalPsf" },
        },
      },
    });
    expect(mockConvertToTexture.mock.calls[0][3]).toMatchObject({
      depthBuffer: false,
    });
    expect(smaaInput).toBe(displayLinearTextureNode);
    expect(mockCompressDisplayRadiance).toHaveBeenCalledTimes(1);
    expect(renderPipelineInstances[0].outputNode).toBe(smaaNode);

    const withoutSmaa = pipelineState.postNodes.composeOutputNode({
      outputMode: "opaque",
      temporalHistoryEnabled: false,
      smaaEnabled: false,
    });

    expect(mockCompressDisplayRadiance).toHaveBeenCalledTimes(2);
    expect(mockConvertToTexture).toHaveBeenCalledTimes(1);
    expect(withoutSmaa).toBe(displayLinearTextureNode);
  });

  it("switches SMAA topology without disposing live cached resources", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );
    const pipeline = pipelineState.pipeline;
    const postNodes = pipelineState.postNodes;
    const initialSmaaNode = postNodes.smaaNode;
    const originalComposeOutputNode = postNodes.composeOutputNode;
    const composeOutputNode = vi.fn((args) => originalComposeOutputNode(args));
    postNodes.composeOutputNode = composeOutputNode;
    pipeline.needsUpdate = false;

    expect(
      syncRenderOutputNodeTopology(pipeline, postNodes, {
        outputMode: "opaque",
        temporalHistoryEnabled: true,
        smaaEnabled: false,
      }),
    ).toBe(true);

    expect(composeOutputNode).toHaveBeenLastCalledWith({
      outputMode: "opaque",
      temporalHistoryEnabled: false,
      smaaEnabled: false,
    });
    expect(initialSmaaNode.dispose).not.toHaveBeenCalled();
    expect(postNodes.smaaNode).toBeNull();
    expect(postNodes.smaaNodes.size).toBe(1);
    expect(getRenderOutputSmaaGraphEnabled(postNodes)).toBe(false);
    expect(pipeline.outputNode).not.toBe(initialSmaaNode);
    expect(pipeline.needsUpdate).toBe(true);

    pipeline.needsUpdate = false;
    composeOutputNode.mockClear();

    expect(
      syncRenderOutputNodeTopology(pipeline, postNodes, {
        outputMode: "opaque",
        temporalHistoryEnabled: false,
        smaaEnabled: true,
      }),
    ).toBe(true);

    expect(composeOutputNode).toHaveBeenLastCalledWith({
      outputMode: "opaque",
      temporalHistoryEnabled: false,
      smaaEnabled: true,
    });
    expect(mockSmaa).toHaveBeenCalledTimes(1);
    expect(postNodes.smaaNode).toBe(initialSmaaNode);
    expect(initialSmaaNode.dispose).not.toHaveBeenCalled();
    expect(getRenderOutputSmaaGraphEnabled(postNodes)).toBe(true);
    expect(pipeline.outputNode).toBe(postNodes.smaaNode);
    expect(pipeline.needsUpdate).toBe(true);

    disposeRenderOutputPostNodes(postNodes);

    expect(initialSmaaNode.dispose).toHaveBeenCalledTimes(1);
    expect(postNodes.smaaNode).toBeNull();
    expect(postNodes.smaaNodes.size).toBe(0);
  });

  it("toggles bloom without changing output topology or cached display state", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: true,
        },
      },
    );
    const pipeline = pipelineState.pipeline;
    const postNodes = pipelineState.postNodes;
    const initialOutputNode = pipeline.outputNode;
    const initialDisplayTextureCount = postNodes.displayLinearTextureNodes.size;

    pipeline.needsUpdate = false;

    expect(postNodes.bloomUniforms.enabled.value).toBe(1);
    syncRenderOutputBloomUniforms(postNodes, { enabled: false });
    expect(
      syncRenderOutputNodeTopology(pipeline, postNodes, {
        outputMode: "opaque",
        temporalHistoryEnabled: false,
        smaaEnabled: true,
      }),
    ).toBe(false);
    expect(postNodes.bloomUniforms.enabled.value).toBe(0);
    expect(pipeline.outputNode).toBe(initialOutputNode);
    expect(pipeline.needsUpdate).toBe(false);
    expect(postNodes.displayLinearTextureNodes.size).toBe(
      initialDisplayTextureCount,
    );

    syncRenderOutputBloomUniforms(postNodes, { enabled: true });
    expect(
      syncRenderOutputNodeTopology(pipeline, postNodes, {
        outputMode: "opaque",
        temporalHistoryEnabled: false,
        smaaEnabled: true,
      }),
    ).toBe(false);
    expect(postNodes.bloomUniforms.enabled.value).toBe(1);
    expect(pipeline.outputNode).toBe(initialOutputNode);
    expect(pipeline.needsUpdate).toBe(false);
    expect(postNodes.displayLinearTextureNodes.size).toBe(
      initialDisplayTextureCount,
    );
  });

  it("bypasses SMAA for transparent program output", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
          renderContext: RENDER_CONTEXTS.externalOutput,
        },
      },
    );

    expect(mockSmaa).toHaveBeenCalledTimes(1);
    expect(getRenderOutputSmaaGraphEnabled(pipelineState.postNodes)).toBe(true);

    expect(
      syncRenderOutputNodeTopology(
        pipelineState.pipeline,
        pipelineState.postNodes,
        {
          outputMode: "transparent",
          temporalHistoryEnabled: false,
          smaaEnabled: true,
        },
      ),
    ).toBe(true);
    expect(mockSmaa).toHaveBeenCalledTimes(1);
    expect(getRenderOutputSmaaGraphEnabled(pipelineState.postNodes)).toBe(
      false,
    );
    expect(pipelineState.pipeline.outputNode).toBe(
      pipelineState.postNodes.displayLinearTextureNodes.get(
        "current:transparent",
      ),
    );
  });

  it("skips the TRAA post-process node when TRAA is disabled", () => {
    const pipelineState = createRenderOutputPipeline(
      {},
      {},
      {},
      {
        renderProfile: {
          qualityPreset: "max-quality",
          traaEnabled: false,
          bloomAllowed: false,
        },
      },
    );
    const scenePass = mockPass.mock.results[0].value;

    expect(mockPass).toHaveBeenCalledWith({}, {}, { depthBuffer: false });
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

  it("remembers visual idle so the next active frame can cut stale temporal history", () => {
    const postNodes = {
      traaNode: { dispose: () => {} },
      temporalHistoryBlendUniform: { value: 1 },
    };

    expect(markRenderOutputVisualIdle(postNodes, 2)).toBe(true);

    expect(postNodes.visualIdleFinalized).toBe(true);
    expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBe(2);
    expect(consumeRenderOutputVisualIdle(postNodes)).toBe(true);
    expect(postNodes.visualIdleFinalized).toBe(false);
    expect(consumeRenderOutputVisualIdle(postNodes)).toBe(false);
  });

  it("keeps temporal history disabled while visual idle remains finalized", () => {
    const postNodes = {
      traaNode: {},
      temporalHistoryBlendUniform: { value: 1 },
    };

    markRenderOutputVisualIdle(postNodes, 1);

    advanceRenderOutputTemporalHistoryBypass(postNodes);
    expect(postNodes.visualIdleFinalized).toBe(true);
    expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBeGreaterThan(0);

    advanceRenderOutputTemporalHistoryBypass(postNodes);
    expect(postNodes.visualIdleFinalized).toBe(true);
    expect(postNodes.temporalHistoryBlendUniform.value).toBe(0);
    expect(postNodes.temporalHistoryCutFramesRemaining).toBeGreaterThan(0);
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

  it("composes fixed optics and bloom in linear HDR before display transfer", () => {
    const source = readFileSync(
      new URL("./outputPipeline.js", import.meta.url),
      "utf8",
    );
    const linearComposeStart = source.indexOf(
      "function composeRenderLinearOutputNode",
    );
    const displayComposeStart = source.indexOf(
      "function composeRenderDisplayOutputNode",
    );
    const compatibilityComposeStart = source.indexOf(
      "export function composeRenderOutputNode",
    );
    const linearComposeSource = source.slice(
      linearComposeStart,
      displayComposeStart,
    );
    const displayComposeSource = source.slice(
      displayComposeStart,
      compatibilityComposeStart,
    );

    expect(linearComposeStart).toBeGreaterThanOrEqual(0);
    expect(displayComposeStart).toBeGreaterThan(linearComposeStart);
    expect(compatibilityComposeStart).toBeGreaterThan(displayComposeStart);
    expect(
      displayComposeSource.match(/compressDisplayRadianceNode/g),
    ).toHaveLength(1);
    expect(displayComposeSource).not.toContain(
      "compressPremultipliedDisplayRadianceNode",
    );
    expect(source).toContain("composeFixedOpticalPsfRadianceNode");
    expect(source).toContain("sampleFixedOpticalPsfNode");
    expect(source).toContain("FIXED_OPTICAL_PSF_HALO_FRACTION");
    const psfCompositionIndex = linearComposeSource.indexOf(
      "composeFixedOpticalPsfRadianceNode",
    );
    const bloomCompositionIndex = linearComposeSource.indexOf(
      "psfRadiance.add(bloomRadiance)",
    );

    expect(psfCompositionIndex).toBeGreaterThanOrEqual(0);
    expect(bloomCompositionIndex).toBeGreaterThanOrEqual(0);
    expect(linearComposeSource).toContain(
      "bloomPass.rgb.mul(bloomEnabledNode)",
    );
    expect(linearComposeSource).not.toContain("compressDisplayRadianceNode");
    expect(source).toContain("pairedBloomNode.js");
    expect(source).toContain("bloomUniforms");
  });

  it("keeps one optics lane instead of a parallel raw-scene chain", () => {
    const source = readFileSync(
      new URL("./outputPipeline.js", import.meta.url),
      "utf8",
    );

    // The bypass is served by blending the optics input, not by building a
    // second bloom pyramid and PSF kernel whose output is scaled by zero.
    expect(source).not.toContain("rawSceneOpticalPsfPass");
    expect(source).not.toContain("rawSceneBloomPass");
    expect(source).toContain("const opticsSourceColor =");
    expect(source).toContain("temporalHistoryEnabled && traaNode");
    expect(source).toContain("bloomPasses:");
  });
});
