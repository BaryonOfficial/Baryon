import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  quadInstances,
  renderTargetInstances,
  renderTargetEdges,
  renderTargetWeights,
  renderTargetBlend,
  invSizeSet,
  resetRendererState,
  restoreRendererState,
} = vi.hoisted(() => ({
  quadInstances: [],
  renderTargetInstances: [],
  renderTargetEdges: { setSize: vi.fn(), dispose: vi.fn() },
  renderTargetWeights: { setSize: vi.fn(), dispose: vi.fn() },
  renderTargetBlend: { setSize: vi.fn(), dispose: vi.fn() },
  invSizeSet: vi.fn(),
  resetRendererState: vi.fn(() => ({ kind: "saved-renderer-state" })),
  restoreRendererState: vi.fn(),
}));

vi.mock("three/examples/jsm/tsl/display/SMAANode.js", () => ({
  default: class MockSmaaNode {
    constructor(textureNode) {
      this.textureNode = textureNode;
      this._invSize = { value: { set: invSizeSet } };
      this._renderTargetEdges = renderTargetEdges;
      this._renderTargetWeights = renderTargetWeights;
      this._renderTargetBlend = renderTargetBlend;
      this._materialEdges = { kind: "edges-material" };
      this._materialWeights = { kind: "weights-material" };
      this._materialBlend = { kind: "blend-material" };
      this._edgesTextureUniform = { value: { kind: "stock-edges-texture" } };
      this._weightsTextureUniform = {};
    }

    setup() {
      return { kind: "stock-blend-texture" };
    }

    dispose() {}
  },
}));

vi.mock("three/webgpu", () => ({
  HalfFloatType: "HalfFloatType",
  QuadMesh: class MockQuadMesh {
    constructor() {
      this.material = null;
      this.name = "";
      this.render = vi.fn();
      quadInstances.push(this);
    }
  },
  RendererUtils: {
    resetRendererState,
    restoreRendererState,
  },
  RenderTarget: class MockRenderTarget {
    constructor(width, height, options) {
      this.width = width;
      this.height = height;
      this.options = options;
      this.texture = { name: "" };
      this.setSize = vi.fn();
      this.dispose = vi.fn();
      renderTargetInstances.push(this);
    }
  },
  RGFormat: "RGFormat",
  Vector2: class MockVector2 {
    constructor() {
      this.width = 0;
      this.height = 0;
    }
  },
}));

vi.mock("three/tsl", () => {
  const node = () => ({
    add: node,
    greaterThan: node,
    lessThan: node,
    negate: node,
    sample: node,
    select: node,
    sub: node,
    toVar: node,
  });
  return {
    abs: node,
    convertToTexture: node,
    dot: node,
    float: node,
    Fn: (callback) => callback,
    If: vi.fn(() => ({ Else: vi.fn() })),
    mix: node,
    packHalf2x16: node,
    sign: node,
    unpackHalf2x16: node,
    uv: node,
    varying: node,
    vec2: node,
    vec4: node,
  };
});

import { FusedBlendSMAANode } from "./fusedSmaaNode.js";

describe("fused SMAA owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only edges and weights before the final output shader", () => {
    const node = new FusedBlendSMAANode({ kind: "source" });
    const edgeTarget = renderTargetInstances.at(-1);
    const renderer = {
      getDrawingBufferSize: vi.fn((size) => {
        size.width = 3024;
        size.height = 1898;
        return size;
      }),
      setRenderTarget: vi.fn(),
    };

    node.updateBefore({ renderer });

    expect(invSizeSet).toHaveBeenCalledWith(1 / 3024, 1 / 1898);
    expect(edgeTarget.options).toEqual({
      depthBuffer: false,
      format: "RGFormat",
      type: "HalfFloatType",
    });
    expect(edgeTarget.texture.name).toBe("BaryonSMAA.edges.rg16f");
    expect(renderTargetEdges.dispose).toHaveBeenCalledTimes(1);
    expect(edgeTarget.setSize).toHaveBeenCalledWith(3024, 1898);
    expect(renderTargetWeights.setSize).toHaveBeenCalledWith(3024, 1898);
    expect(renderTargetBlend.setSize).not.toHaveBeenCalled();
    expect(renderer.setRenderTarget.mock.calls).toEqual([
      [edgeTarget],
      [renderTargetWeights],
    ]);
    expect(quadInstances.at(-1).render).toHaveBeenCalledTimes(2);
    expect(resetRendererState).toHaveBeenCalledWith(renderer, undefined);
    expect(restoreRendererState).toHaveBeenCalledWith(
      renderer,
      expect.objectContaining({ kind: "saved-renderer-state" }),
    );
  });
});
