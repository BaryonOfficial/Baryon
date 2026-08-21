import { describe, expect, it } from "vitest";

import {
  createPairedGaussianTaps,
  shouldUsePairedBloomKernel,
} from "./pairedBloomNode.js";

const KERNEL_RADII = [6, 10, 14, 18, 22];

function gaussianCoefficient(kernelRadius, index) {
  const sigma = kernelRadius / 3;
  return (0.39894 * Math.exp((-0.5 * index * index) / (sigma * sigma))) / sigma;
}

function clampIndex(index, length) {
  return Math.min(length - 1, Math.max(0, index));
}

function sampleLinearClamp(signal, position) {
  const lower = Math.floor(position);
  const fraction = position - lower;
  const lowerValue = signal[clampIndex(lower, signal.length)];
  const upperValue = signal[clampIndex(lower + 1, signal.length)];
  return lowerValue + (upperValue - lowerValue) * fraction;
}

function stockGaussian(signal, position, kernelRadius) {
  let sum = signal[position] * gaussianCoefficient(kernelRadius, 0);
  for (let index = 1; index < kernelRadius; index += 1) {
    const weight = gaussianCoefficient(kernelRadius, index);
    sum +=
      (signal[clampIndex(position - index, signal.length)] +
        signal[clampIndex(position + index, signal.length)]) *
      weight;
  }
  return sum;
}

function pairedGaussian(signal, position, kernelRadius) {
  const taps = createPairedGaussianTaps(kernelRadius);
  let sum = signal[position] * taps[0].weight;
  for (const tap of taps.slice(1)) {
    sum +=
      (sampleLinearClamp(signal, position - tap.offset) +
        sampleLinearClamp(signal, position + tap.offset)) *
      tap.weight;
  }
  return sum;
}

describe("paired bloom kernel", () => {
  it("reconstructs the stock Gaussian convolution including clamp edges", () => {
    const signal = Array.from(
      { length: 97 },
      (_, index) => Math.sin(index * 0.37) * 0.4 + Math.cos(index * 0.11) * 0.6,
    );

    for (const kernelRadius of KERNEL_RADII) {
      for (let position = 0; position < signal.length; position += 1) {
        expect(pairedGaussian(signal, position, kernelRadius)).toBeCloseTo(
          stockGaussian(signal, position, kernelRadius),
          12,
        );
      }
    }
  });

  it("reduces every equal-resolution pass to the paired tap count", () => {
    for (const kernelRadius of KERNEL_RADII) {
      const stockSamples = 1 + 2 * (kernelRadius - 1);
      const pairedSamples =
        1 + 2 * (createPairedGaussianTaps(kernelRadius).length - 1);
      expect(pairedSamples).toBeLessThan(stockSamples);
    }
  });

  it("keeps downsampling horizontal passes stock", () => {
    expect(shouldUsePairedBloomKernel(0, "horizontal")).toBe(true);
    expect(shouldUsePairedBloomKernel(0, "vertical")).toBe(true);

    for (let mipIndex = 1; mipIndex < KERNEL_RADII.length; mipIndex += 1) {
      expect(shouldUsePairedBloomKernel(mipIndex, "horizontal")).toBe(false);
      expect(shouldUsePairedBloomKernel(mipIndex, "vertical")).toBe(true);
    }
  });
});
