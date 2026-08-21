import BloomNode from "three/examples/jsm/tsl/display/BloomNode.js";
import { NodeMaterial, QuadMesh, RendererUtils, Vector2 } from "three/webgpu";
import { add, Fn, nodeObject, texture, uniform, uv, vec4 } from "three/tsl";

const BLOOM_KERNEL_RADII = Object.freeze([6, 10, 14, 18, 22]);
const BLOOM_QUAD = new QuadMesh();
const BLOOM_SIZE = new Vector2();
const BLOOM_DIRECTION_X = new Vector2(1, 0);
const BLOOM_DIRECTION_Y = new Vector2(0, 1);

let bloomRendererState;

function gaussianCoefficient(kernelRadius, index) {
  const sigma = kernelRadius / 3;
  return (0.39894 * Math.exp((-0.5 * index * index) / (sigma * sigma))) / sigma;
}

/**
 * Collapse adjacent positive Gaussian taps into one bilinearly filtered tap.
 * A tap at the weighted fractional offset reconstructs the same two texels in
 * real arithmetic because bloom textures use linear clamp-to-edge sampling.
 *
 * @param {number} kernelRadius
 * @returns {ReadonlyArray<Readonly<{ offset: number, weight: number }>>}
 */
export function createPairedGaussianTaps(kernelRadius) {
  const coefficients = Array.from({ length: kernelRadius }, (_, index) =>
    gaussianCoefficient(kernelRadius, index),
  );
  const taps = [{ offset: 0, weight: coefficients[0] }];

  for (let index = 1; index < kernelRadius; index += 2) {
    const nextIndex = index + 1;
    if (nextIndex >= kernelRadius) {
      taps.push({ offset: index, weight: coefficients[index] });
      continue;
    }

    const weight = coefficients[index] + coefficients[nextIndex];
    taps.push({
      offset:
        (index * coefficients[index] + nextIndex * coefficients[nextIndex]) /
        weight,
      weight,
    });
  }

  return Object.freeze(taps.map((tap) => Object.freeze(tap)));
}

/**
 * Horizontal passes after mip zero also downsample a 2x larger input. Their
 * adjacent kernel offsets are two input texels apart, so one bilinear sample
 * cannot represent both. Vertical passes and both mip-zero passes operate at
 * equal input/output resolution and are safe to pair every frame.
 *
 * @param {number} mipIndex
 * @param {"horizontal" | "vertical"} direction
 */
export function shouldUsePairedBloomKernel(mipIndex, direction) {
  return direction === "vertical" || mipIndex === 0;
}

function createPairedSeparableBlurMaterial(builder, kernelRadius) {
  const colorTexture = texture(null);
  const invSize = uniform(new Vector2());
  const direction = uniform(new Vector2(0.5, 0.5));
  const uvNode = uv();
  const taps = createPairedGaussianTaps(kernelRadius);

  const sampleTexel = (sampleUv) => colorTexture.sample(sampleUv);
  const separableBlurPass = Fn(() => {
    const diffuseSum = sampleTexel(uvNode).rgb.mul(taps[0].weight).toVar();

    for (const tap of taps.slice(1)) {
      const uvOffset = direction.mul(invSize).mul(tap.offset);
      const samplePositive = sampleTexel(uvNode.add(uvOffset)).rgb;
      const sampleNegative = sampleTexel(uvNode.sub(uvOffset)).rgb;
      diffuseSum.addAssign(add(samplePositive, sampleNegative).mul(tap.weight));
    }

    return vec4(diffuseSum, 1);
  });

  const material = new NodeMaterial();
  material.fragmentNode = separableBlurPass().context(
    builder.getSharedContext(),
  );
  material.name = "BaryonBloom_separable_paired";
  material.needsUpdate = true;
  const materialUniforms = /** @type {any} */ (material);
  materialUniforms.colorTexture = colorTexture;
  materialUniforms.direction = direction;
  materialUniforms.invSize = invSize;

  return materialUniforms;
}

/**
 * Three's bloom topology and lifecycle with only the safe equal-resolution
 * separable passes replaced by coefficient-paired bilinear sampling.
 */
export class PairedBloomNode extends BloomNode {
  constructor(inputNode, strength = 1, radius = 0, threshold = 0) {
    super(inputNode, strength, radius, threshold);
    this._pairedSeparableBlurMaterials = [];
  }

  setup(builder) {
    const output = super.setup(builder);

    if (this._pairedSeparableBlurMaterials.length === 0) {
      this._pairedSeparableBlurMaterials = BLOOM_KERNEL_RADII.map(
        (kernelRadius) =>
          createPairedSeparableBlurMaterial(builder, kernelRadius),
      );
    }

    return output;
  }

  setSize(width, height) {
    super.setSize(width, height);
    const bloomNode = /** @type {any} */ (this);

    for (
      let mipIndex = 0;
      mipIndex < this._pairedSeparableBlurMaterials.length;
      mipIndex += 1
    ) {
      this._pairedSeparableBlurMaterials[mipIndex].invSize.value.copy(
        bloomNode._separableBlurMaterials[mipIndex].invSize.value,
      );
    }
  }

  updateBefore(frame) {
    const { renderer } = frame;
    const bloomNode = /** @type {any} */ (this);
    bloomRendererState = RendererUtils.resetRendererState(
      renderer,
      bloomRendererState,
    );

    const size = renderer.getDrawingBufferSize(BLOOM_SIZE);
    this.setSize(size.width, size.height);

    renderer.setRenderTarget(bloomNode._renderTargetBright);
    BLOOM_QUAD.material = bloomNode._highPassFilterMaterial;
    BLOOM_QUAD.name = "Bloom [ High Pass ]";
    BLOOM_QUAD.render(renderer);

    let inputRenderTarget = bloomNode._renderTargetBright;

    for (let mipIndex = 0; mipIndex < bloomNode._nMips; mipIndex += 1) {
      const horizontalMaterial = shouldUsePairedBloomKernel(
        mipIndex,
        "horizontal",
      )
        ? this._pairedSeparableBlurMaterials[mipIndex]
        : bloomNode._separableBlurMaterials[mipIndex];
      horizontalMaterial.colorTexture.value = inputRenderTarget.texture;
      horizontalMaterial.direction.value = BLOOM_DIRECTION_X;
      renderer.setRenderTarget(bloomNode._renderTargetsHorizontal[mipIndex]);
      BLOOM_QUAD.material = horizontalMaterial;
      BLOOM_QUAD.name = `Bloom [ Blur Horizontal - ${mipIndex} ]`;
      BLOOM_QUAD.render(renderer);

      const verticalMaterial = shouldUsePairedBloomKernel(mipIndex, "vertical")
        ? this._pairedSeparableBlurMaterials[mipIndex]
        : bloomNode._separableBlurMaterials[mipIndex];
      verticalMaterial.colorTexture.value =
        bloomNode._renderTargetsHorizontal[mipIndex].texture;
      verticalMaterial.direction.value = BLOOM_DIRECTION_Y;
      renderer.setRenderTarget(bloomNode._renderTargetsVertical[mipIndex]);
      BLOOM_QUAD.material = verticalMaterial;
      BLOOM_QUAD.name = `Bloom [ Blur Vertical - ${mipIndex} ]`;
      BLOOM_QUAD.render(renderer);

      inputRenderTarget = bloomNode._renderTargetsVertical[mipIndex];
    }

    renderer.setRenderTarget(bloomNode._renderTargetsHorizontal[0]);
    BLOOM_QUAD.material = bloomNode._compositeMaterial;
    BLOOM_QUAD.name = "Bloom [ Composite ]";
    BLOOM_QUAD.render(renderer);

    RendererUtils.restoreRendererState(renderer, bloomRendererState);
    return true;
  }

  dispose() {
    for (const material of this._pairedSeparableBlurMaterials) {
      material.dispose();
    }
    this._pairedSeparableBlurMaterials.length = 0;
    super.dispose();
  }
}

export const pairedBloom = (node, strength, radius, threshold) =>
  new PairedBloomNode(nodeObject(node), strength, radius, threshold);
