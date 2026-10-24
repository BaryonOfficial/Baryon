import { compileRenderPass } from "./compileRenderPass.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  int,
  ivec2,
  screenCoordinate,
  textureLoad,
  vec4,
} from "three/tsl";

/**
 * Derived cache for one immutable acoustic generation. Expands an audio-owned
 * finite response window; never integrates samples, changes poles or replays
 * audio. Reset/replacement constructs a new cache. All bins remain represented; guarded Float64 resolvents handle the
 * bins whose Float32 operator amplification exceeds the declared error budget.
 */
export function createBroadbandSpectralExpansion({
  shellCount,
  channelCount,
  frameSize,
  hopSize,
  sampleRate,
  transitions,
}) {
  const bins = frameSize / 2 + 1;
  const poles = Float64Array.from(transitions);
  if (poles.length !== 6 * shellCount || !poles.every(Number.isFinite))
    throw new RangeError(
      "spectral expansion requires complete finite transitions",
    );
  const makeTexture = (data, width, height) => {
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
  };
  const gains = new Float32Array(4 * bins * shellCount * 4);
  const precisionBins = [];
  // A conservative operator-amplification screen, not a source selection.
  // Ill-conditioned bins are expanded in Float64 before the final upload;
  // all bins remain present. The native error tests certify the result.
  const float32Roundoff = 2 ** -24;
  const expansionRoundoffBudget = 1e-6;
  const normalization = new Float32Array(4 * bins);
  let windowEnergy = 0;
  for (let r = 0; r < frameSize; r++) {
    const t = (2 * Math.PI * r) / frameSize;
    windowEnergy += (0.42 - 0.5 * Math.cos(t) + 0.08 * Math.cos(2 * t)) ** 2;
  }
  for (let b = 0; b < bins; b++) {
    normalization[4 * b] =
      b === 0
        ? 0
        : Math.sqrt(
            (b === frameSize / 2 ? 1 : 2) /
              (channelCount * frameSize * windowEnergy),
          );
    const t = (2 * Math.PI * b) / frameSize;
    const re = Math.cos(t),
      im = b === 0 || b === frameSize / 2 ? 0 : Math.sin(t);
    for (let m = 0; m < shellCount; m++) {
      const [a, c, d, e, u, v] = poles.slice(6 * m, 6 * m + 6);
      const dr = (re - a) * (re - e) - im * im - c * d;
      const di = im * (2 * re - a - e);
      const divisor = dr * dr + di * di;
      if (!(divisor > 0) || !Number.isFinite(divisor))
        throw new RangeError("singular GPU spectral resolvent");
      const pressure = [
        [(re - e) * u + c * v, im * u],
        [-re * (re - e) + im * im, -im * (2 * re - e)],
        [-re * c, -im * c],
      ];
      const velocity = [
        [d * u + (re - a) * v, im * v],
        [-re * d, -im * d],
        [-re * (re - a) + im * im, -im * (2 * re - a)],
      ];
      const matrixNorm = Math.max(
        Math.hypot(re - a, im) + Math.abs(d),
        Math.hypot(re - e, im) + Math.abs(c),
      );
      const inverseNorm =
        Math.max(
          Math.hypot(re - e, im) + Math.abs(d),
          Math.hypot(re - a, im) + Math.abs(c),
        ) / Math.sqrt(divisor);
      const needsPrecision =
        float32Roundoff * Math.max(1, matrixNorm) * inverseNorm >
        expansionRoundoffBudget;
      const highPrecision = needsPrecision ? new Float64Array(12) : null;
      for (let k = 0; k < 3; k++) {
        const offset = 4 * ((k * shellCount + m) * bins + b);
        for (const [lane, [nr, ni]] of [pressure[k], velocity[k]].entries()) {
          const real = (nr * dr + ni * di) / divisor;
          const imaginary = (ni * dr - nr * di) / divisor;
          gains[offset + 2 * lane] = real;
          gains[offset + 2 * lane + 1] = imaginary;
          if (highPrecision) {
            highPrecision[4 * k + 2 * lane] = real;
            highPrecision[4 * k + 2 * lane + 1] = imaginary;
          }
        }
      }
      gains[4 * ((3 * shellCount + m) * bins + b)] = needsPrecision
        ? precisionBins.length
        : -1;
      if (highPrecision)
        precisionBins.push({ shell: m, bin: b, gains: highPrecision });
    }
  }
  if (!gains.every(Number.isFinite))
    throw new RangeError("GPU spectral resolvent exceeds Float32 range");
  const inputData = new Float32Array(4 * bins * channelCount);
  const boundaryData = new Float32Array(4 * shellCount * channelCount);
  const precisionWidth = Math.min(2048, Math.max(1, precisionBins.length));
  const precisionRows = Math.max(
    1,
    Math.ceil(precisionBins.length / precisionWidth),
  );
  const precisionData = new Float32Array(
    4 * precisionWidth * precisionRows * channelCount,
  );
  const nextPrecisionData = precisionData.slice();
  const input = makeTexture(inputData, bins, channelCount);
  const boundary = makeTexture(boundaryData, shellCount, channelCount);
  const gainTexture = makeTexture(gains, bins, 4 * shellCount);
  const precisionTexture = makeTexture(
    precisionData,
    precisionWidth,
    precisionRows * channelCount,
  );
  const normalizationTexture = makeTexture(normalization, bins, 1);
  const target = new THREE.RenderTarget(bins, shellCount * channelCount, {
    type: THREE.FloatType,
    depthBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  const material = new MeshBasicNodeMaterial();
  material.depthTest = material.depthWrite = material.toneMapped = false;
  material.fragmentNode = Fn(() => {
    const pixel = ivec2(screenCoordinate.xy).toVar();
    const channel = pixel.y.div(shellCount).toVar();
    const shell = pixel.y.mod(shellCount).toVar();
    const output = vec4(0).toVar();
    If(pixel.x.greaterThan(0), () => {
      const delta = textureLoad(boundary, ivec2(shell, channel)).toVar();
      for (let shift = -2; shift <= 2; shift++) {
        const wrapped = pixel.x
          .add(shift + frameSize)
          .mod(frameSize)
          .toVar();
        const bin = int(wrapped).toVar();
        If(wrapped.greaterThan(frameSize / 2), () =>
          bin.assign(int(frameSize).sub(wrapped)),
        );
        const x = textureLoad(input, ivec2(bin, channel)).toVar();
        const g0 = textureLoad(gainTexture, ivec2(bin, shell)).toVar();
        const g1 = textureLoad(
          gainTexture,
          ivec2(bin, shell.add(shellCount)),
        ).toVar();
        const g2 = textureLoad(
          gainTexture,
          ivec2(bin, shell.add(2 * shellCount)),
        ).toVar();
        const precisionIndex = textureLoad(
          gainTexture,
          ivec2(bin, shell.add(3 * shellCount)),
        ).x.toVar();
        const value = vec4(0).toVar();
        If(precisionIndex.greaterThanEqual(0), () => {
          const index = int(precisionIndex).toVar();
          value.assign(
            textureLoad(
              precisionTexture,
              ivec2(
                index.mod(precisionWidth),
                index.div(precisionWidth).add(channel.mul(precisionRows)),
              ),
            ),
          );
        }).Else(() => {
          value.assign(
            vec4(
              g0.x.mul(x.x).sub(g0.y.mul(x.y)),
              g0.x.mul(x.y).add(g0.y.mul(x.x)),
              g0.z.mul(x.x).sub(g0.w.mul(x.y)),
              g0.z.mul(x.y).add(g0.w.mul(x.x)),
            )
              .add(g1.mul(delta.x))
              .add(g2.mul(delta.y)),
          );
        });
        If(wrapped.greaterThan(frameSize / 2), () =>
          value.mulAssign(vec4(1, -1, 1, -1)),
        );
        output.addAssign(
          value.mul(shift === 0 ? 0.42 : Math.abs(shift) === 1 ? -0.25 : 0.04),
        );
      }
      output.mulAssign(textureLoad(normalizationTexture, ivec2(pixel.x, 0)).x);
    });
    return output;
  })();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let acceptedEnd = -1,
    pending = false;
  return {
    target,
    texture: target.texture,
    textureBytes:
      [
        input,
        boundary,
        gainTexture,
        precisionTexture,
        normalizationTexture,
      ].reduce((sum, texture) => sum + texture.image.data.byteLength, 0) +
      target.width * target.height * 16,
    precisionBinCount: precisionBins.length,
    correctionUploadBytes: precisionData.byteLength,
    compile: (renderer) =>
      compileRenderPass(renderer, { scene, camera, target }),
    update(frame) {
      if (
        frame.representation !== "finite-response-window-v1" ||
        frame.shellCount !== shellCount ||
        frame.channelCount !== channelCount ||
        frame.frameSize !== frameSize ||
        frame.hopSize !== hopSize ||
        frame.sampleRate !== sampleRate ||
        !Number.isSafeInteger(frame.frameEndSample) ||
        frame.frameEndSample < 0 ||
        frame.frameEndSample % hopSize !== 0 ||
        frame.frameEndSample < acceptedEnd ||
        frame.transitions?.length !== poles.length ||
        !frame.transitions.every((value, i) => value === poles[i]) ||
        frame.inputSpectrum?.length !== inputData.length / 2 ||
        frame.boundaryDelta?.length !== boundaryData.length / 2 ||
        !frame.inputSpectrum.every((value) =>
          Number.isFinite(Math.fround(value)),
        ) ||
        !frame.boundaryDelta.every((value) =>
          Number.isFinite(Math.fround(value)),
        )
      )
        throw new RangeError("spectral window does not match this GPU cache");
      if (frame.frameEndSample === acceptedEnd) return false;
      // Stage and validate corrections before mutating an accepted upload.
      for (let a = 0; a < channelCount; a++)
        for (let i = 0; i < precisionBins.length; i++) {
          const { shell, bin, gains: g } = precisionBins[i];
          const x = frame.inputSpectrum[2 * (a * bins + bin)];
          const y = frame.inputSpectrum[2 * (a * bins + bin) + 1];
          const dp = frame.boundaryDelta[2 * (a * shellCount + shell)];
          const dv = frame.boundaryDelta[2 * (a * shellCount + shell) + 1];
          const offset = 4 * (a * precisionWidth * precisionRows + i);
          for (let q = 0; q < 2; q++) {
            nextPrecisionData[offset + 2 * q] =
              g[2 * q] * x -
              g[2 * q + 1] * y +
              g[4 + 2 * q] * dp +
              g[8 + 2 * q] * dv;
            nextPrecisionData[offset + 2 * q + 1] =
              g[2 * q] * y +
              g[2 * q + 1] * x +
              g[5 + 2 * q] * dp +
              g[9 + 2 * q] * dv;
          }
        }
      if (!nextPrecisionData.every(Number.isFinite))
        throw new RangeError(
          "spectral precision correction exceeds Float32 range",
        );
      precisionData.set(nextPrecisionData);
      for (let i = 0; i < frame.inputSpectrum.length; i += 2) {
        inputData[2 * i] = frame.inputSpectrum[i];
        inputData[2 * i + 1] = frame.inputSpectrum[i + 1];
      }
      for (let i = 0; i < frame.boundaryDelta.length; i += 2) {
        boundaryData[2 * i] = frame.boundaryDelta[i];
        boundaryData[2 * i + 1] = frame.boundaryDelta[i + 1];
      }
      input.needsUpdate =
        boundary.needsUpdate =
        precisionTexture.needsUpdate =
          true;
      acceptedEnd = frame.frameEndSample;
      pending = true;
      return true;
    },
    render(renderer) {
      if (!pending) return false;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        pending = false;
        return true;
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAutoClear;
      }
    },
    dispose() {
      for (const texture of [
        input,
        boundary,
        gainTexture,
        precisionTexture,
        normalizationTexture,
      ])
        texture.dispose();
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
