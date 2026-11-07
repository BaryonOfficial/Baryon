import * as THREE from "three";
import { StorageTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  dot,
  int,
  ivec2,
  localId,
  workgroupId,
  workgroupArray,
  workgroupBarrier,
  textureStore,
  textureLoad,
  vec2,
  vec4,
} from "three/tsl";
import { createSpectralMomentBasis } from "../../utils/audio/spectralPhase.js";
import { fixedRenderTargetTextureLoad } from "./fixedOrientationTextureNode.js";

/**
 * Exact GPU assembly of five symmetric color matrices for both quantities.
 * No rank reduction, frequency omission or PSD repair. This derived GPU cache
 * consumes complete spectra; it never advances an audio history.
 */
export function createBroadbandSpectralProjection({
  shellCount,
  channelCount,
  frameSize,
  sampleRate,
  sourceTexture,
}) {
  const bins = frameSize / 2 + 1;
  const evenOffset = shellCount % 2 === 0 ? 1 : 0;
  const dispatchWidth = shellCount + evenOffset;
  const dispatchHeight = Math.ceil(shellCount / 2);
  function texture(data, width, height) {
    const result = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    result.minFilter = result.magFilter = THREE.NearestFilter;
    result.colorSpace = THREE.NoColorSpace;
    result.generateMipmaps = false;
    result.needsUpdate = true;
    return result;
  }
  // Immutable source ownership: either a diagnostic upload or the expansion
  // render target. This pass does not own history or publication admission.
  const loadSource = sourceTexture.isRenderTargetTexture
    ? fixedRenderTargetTextureLoad
    : textureLoad;
  const basisData = new Float32Array(4 * bins);
  for (let b = 1; b < bins; b++)
    basisData.set(
      createSpectralMomentBasis({ frequencyHz: (b * sampleRate) / frameSize }),
      4 * b,
    );
  const basis = texture(basisData, bins, 1);
  // Each unordered shell pair owns one complete workgroup. Threads sum
  // disjoint frequency bins, then reduce in a fixed tree. Folding the dispatch
  // preserves every moment, cross term, bin order and reduction operation.
  const workgroupSize = 64;
  // The installed Three declarations omit the runtime .element() method.
  /** @template {"vec2" | "vec4"} T
   * @typedef {ReturnType<typeof workgroupArray> & {
   * element(index: import("three/webgpu").Node): import("three/webgpu").Node<T>
   * }} WorkgroupArrayNode */
  const pressureSums = /** @type {WorkgroupArrayNode<"vec4">} */ (
    workgroupArray("vec4", workgroupSize)
  );
  const velocitySums = /** @type {WorkgroupArrayNode<"vec4">} */ (
    workgroupArray("vec4", workgroupSize)
  );
  const secondSums = /** @type {WorkgroupArrayNode<"vec2">} */ (
    workgroupArray("vec2", workgroupSize)
  );
  const result = new StorageTexture(shellCount, 3 * shellCount);
  result.type = THREE.FloatType;
  result.minFilter = result.magFilter = THREE.NearestFilter;
  result.colorSpace = THREE.NoColorSpace;
  result.generateMipmaps = false;
  const compute = Fn(() => {
    const lane = int(localId.x);
    // Fold a rectangular dispatch onto the lower triangle. Even shell counts
    // add one X group and shift the direct row, covering every unordered pair
    // exactly once without launching groups for the unused upper triangle.
    const x = int(workgroupId.x).toVar();
    const y = int(workgroupId.y).toVar();
    const directRow = x.sub(evenOffset);
    const folded = y.greaterThan(directRow).toVar();
    const row = folded.select(int(shellCount - 1).sub(x), directRow).toVar();
    const column = folded
      .select(int(shellCount - evenOffset).sub(y), y)
      .toVar();
    const pressure = vec4(0).toVar(),
      velocity = vec4(0).toVar();
    const secondImaginary = vec2(0).toVar();
    for (let a = 0; a < channelCount; a++) {
      Loop(
        { start: lane.add(1), end: int(bins), update: `+= ${workgroupSize}` },
        ({ i }) => {
          const left = loadSource(
            sourceTexture,
            ivec2(i, column.add(a * shellCount)),
          ).toVar();
          const right = loadSource(
            sourceTexture,
            ivec2(i, row.add(a * shellCount)),
          ).toVar();
          const hue = textureLoad(basis, ivec2(i, 0)).toVar();
          const p = dot(left.xy, right.xy).toVar();
          const v = dot(left.zw, right.zw).toVar();
          const weights = vec4(1, hue.xyz);
          pressure.addAssign(weights.mul(p));
          velocity.addAssign(weights.mul(v));
          secondImaginary.addAssign(vec2(p, v).mul(hue.w));
        },
      );
    }
    pressureSums.element(lane).assign(pressure);
    velocitySums.element(lane).assign(velocity);
    secondSums.element(lane).assign(secondImaginary);
    workgroupBarrier();
    // Barriers are reached by every lane, including lanes with no bins.
    for (let stride = workgroupSize / 2; stride >= 1; stride /= 2) {
      If(lane.lessThan(stride), () => {
        pressureSums
          .element(lane)
          .addAssign(pressureSums.element(lane.add(stride)));
        velocitySums
          .element(lane)
          .addAssign(velocitySums.element(lane.add(stride)));
        secondSums
          .element(lane)
          .addAssign(secondSums.element(lane.add(stride)));
      });
      workgroupBarrier();
    }
    If(lane.equal(0), () => {
      pressure.assign(pressureSums.element(lane));
      velocity.assign(velocitySums.element(lane));
      secondImaginary.assign(secondSums.element(lane));
      const store = (x, y) => {
        textureStore(result, ivec2(x, y), pressure).toWriteOnly();
        textureStore(
          result,
          ivec2(x, y.add(shellCount)),
          velocity,
        ).toWriteOnly();
        textureStore(
          result,
          ivec2(x, y.add(2 * shellCount)),
          vec4(secondImaginary, 0, 0),
        ).toWriteOnly();
      };
      store(column, row);
      If(column.notEqual(row), () => store(row, column));
    });
  })().computeKernel([workgroupSize]);
  compute.dispatchSize = [dispatchWidth, dispatchHeight, 1];
  return {
    texture: result,
    textureBytes: 3 * shellCount * shellCount * 16 + basisData.byteLength,
    evaluatedPairCount: (shellCount * (shellCount + 1)) / 2,
    compile(renderer) {
      return renderer.compileComputeAsync(compute);
    },
    render(renderer) {
      renderer.compute(compute);
    },
    dispose() {
      compute.dispose();
      result.dispose();
      basis.dispose();
    },
  };
}
