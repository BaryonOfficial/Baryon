import * as THREE from "three";
import { StorageTexture } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  dot,
  int,
  ivec2,
  instanceIndex,
  textureStore,
  textureLoad,
  vec2,
  vec4,
} from "three/tsl";
import { createSpectralMomentBasis } from "../../utils/audio/spectralPhase.js";
import { fixedRenderTargetTextureLoad } from "./fixedOrientationTextureNode.js";

/**
 * Exact GPU assembly of five symmetric color matrices for both quantities.
 * No reduction, frequency omission or PSD repair. This derived GPU cache
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
  // A single work item assembles all five pressure/velocity moments for one
  // unordered shell pair, then writes both symmetric entries. Full Float32
  // matrices remain available to consumers; no bins or cross terms disappear.
  const result = new StorageTexture(shellCount, 3 * shellCount);
  result.type = THREE.FloatType;
  result.minFilter = result.magFilter = THREE.NearestFilter;
  result.colorSpace = THREE.NoColorSpace;
  result.generateMipmaps = false;
  const compute = Fn(() => {
    const pairIndex = int(instanceIndex);
    const row = pairIndex.div(shellCount).toVar();
    const column = pairIndex.mod(shellCount).toVar();
    If(column.lessThanEqual(row), () => {
      const pressure = vec4(0).toVar(),
        velocity = vec4(0).toVar();
      const secondImaginary = vec2(0).toVar();
      for (let a = 0; a < channelCount; a++) {
        Loop({ start: int(1), end: int(bins) }, ({ i }) => {
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
        });
      }
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
  })().compute(shellCount * shellCount, [64]);
  return {
    texture: result,
    textureBytes: 3 * shellCount * shellCount * 16 + basisData.byteLength,
    evaluatedPairCount: (shellCount * (shellCount + 1)) / 2,
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
