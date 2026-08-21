import * as SMAAModule from "three/examples/jsm/tsl/display/SMAANode.js";
import {
  HalfFloatType,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  RGFormat,
  Vector2,
} from "three/webgpu";
import {
  abs,
  convertToTexture,
  dot,
  float,
  Fn,
  If,
  mix,
  packHalf2x16,
  sign,
  unpackHalf2x16,
  uv,
  varying,
  vec2,
  vec4,
} from "three/tsl";

const SMAA_QUAD = new QuadMesh();
const SMAA_SIZE = new Vector2();

let smaaRendererState;
const SMAANode = /** @type {any} */ (SMAAModule).default;

function quantizeRgba16FloatNode(value) {
  const quantizePair = (pair) =>
    /** @type {any} */ (
      unpackHalf2x16(
        /** @type {any} */ (packHalf2x16(/** @type {any} */ (pair))),
      )
    );
  return vec4(quantizePair(value.xy), quantizePair(value.zw));
}

/**
 * Three's SMAA 1x Medium implementation with its final blend evaluated inside
 * RenderPipeline's already-required output shader. Edges and weights remain
 * byte-for-byte the stock algorithm; only the redundant full-resolution
 * RGBA16F blend target and pass are removed.
 */
export class FusedBlendSMAANode extends SMAANode {
  constructor(textureNode) {
    super(textureNode);

    const stockEdgesTarget = /** @type {any} */ (this._renderTargetEdges);
    this._renderTargetEdges = new RenderTarget(1, 1, {
      depthBuffer: false,
      format: RGFormat,
      type: HalfFloatType,
    });
    this._renderTargetEdges.texture.name = "BaryonSMAA.edges.rg16f";
    this._edgesTextureUniform.value = this._renderTargetEdges.texture;
    if (stockEdgesTarget) {
      stockEdgesTarget.dispose();
    }
  }

  setSize(width, height) {
    this._invSize.value.set(1 / width, 1 / height);
    this._renderTargetEdges.setSize(width, height);
    this._renderTargetWeights.setSize(width, height);
  }

  updateBefore(frame) {
    const { renderer } = frame;
    smaaRendererState = RendererUtils.resetRendererState(
      renderer,
      smaaRendererState,
    );

    const size = renderer.getDrawingBufferSize(SMAA_SIZE);
    this.setSize(size.width, size.height);

    renderer.setRenderTarget(this._renderTargetEdges);
    SMAA_QUAD.material = this._materialEdges;
    SMAA_QUAD.name = "SMAA [ Edges ]";
    SMAA_QUAD.render(renderer);

    renderer.setRenderTarget(this._renderTargetWeights);
    SMAA_QUAD.material = this._materialWeights;
    SMAA_QUAD.name = "SMAA [ Weights ]";
    SMAA_QUAD.render(renderer);

    RendererUtils.restoreRendererState(renderer, smaaRendererState);
    return true;
  }

  setup(builder) {
    // Retain Three's canonical edge/weight material construction and lookup
    // textures. The stock blend material/1x1 target remain lifecycle-owned by
    // the superclass, but are never resized or rendered.
    super.setup(builder);

    const sourceTextureNode = this.textureNode;
    const uvNode = sourceTextureNode.uvNode || uv();
    const neighborUv = varying(
      vec4(uvNode.xy, uvNode.xy).add(
        vec4(this._invSize.xy, this._invSize.xy).mul(vec4(1, 0, 0, 1)),
      ),
      "vBaryonSmaaBlendNeighborUv",
    );

    const resolveBlend = Fn(() => {
      const result = vec4().toVar();
      const weights = vec4().toVar();
      weights.xz = this._weightsTextureUniform.sample(uvNode).xz;
      weights.y = this._weightsTextureUniform.sample(neighborUv.zw).g;
      weights.w = this._weightsTextureUniform.sample(neighborUv.xy).a;

      If(dot(weights, vec4(1)).lessThan(float(1e-5)), () => {
        result.assign(sourceTextureNode.sample(uvNode));
      }).Else(() => {
        const offset = vec2().toVar();
        offset.x = weights.a
          .greaterThan(weights.b)
          .select(weights.a, weights.b.negate());
        offset.y = weights.g
          .greaterThan(weights.r)
          .select(weights.g, weights.r.negate());

        If(abs(offset.x).greaterThan(abs(offset.y)), () => {
          offset.y.assign(0);
        }).Else(() => {
          offset.x.assign(0);
        });

        const source = sourceTextureNode.sample(uvNode).toVar();
        const oppositeUv = uvNode.add(sign(offset).mul(this._invSize)).toVar();
        const opposite = sourceTextureNode.sample(oppositeUv).toVar();
        const blendWeight = abs(offset.x)
          .greaterThan(abs(offset.y))
          .select(abs(offset.x), abs(offset.y))
          .toVar();
        result.assign(mix(source, opposite, blendWeight));
      });

      // The removed stock blend target is RGBA16F. Retain its half-float
      // precision boundary before the final output-color transform.
      return quantizeRgba16FloatNode(result);
    });

    return resolveBlend().context(builder.getSharedContext());
  }
}

export const fusedSmaa = (node) =>
  new FusedBlendSMAANode(convertToTexture(node));
