import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createBroadbandSpectralProjection } from "./broadbandSpectralProjection.js";

describe("spectral projection dispatch budget", () => {
  it.each([1, 2, 3, 4, 7, 8, 16, 29, 32, 59, 60, 64])(
    "launches exactly one group per unordered pair for %i shells",
    async (shellCount) => {
      const frameSize = 8;
      const bins = frameSize / 2 + 1;
      const source = new THREE.DataTexture(
        new Float32Array(4 * bins * shellCount * 2),
        bins,
        shellCount * 2,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      const projection = createBroadbandSpectralProjection({
        shellCount,
        channelCount: 2,
        frameSize,
        sampleRate: 48000,
        sourceTexture: source,
      });
      const compileComputeAsync = vi.fn(async (kernel) => kernel);
      try {
        await projection.compile({ compileComputeAsync });
        const kernel = compileComputeAsync.mock.calls[0][0];
        const dispatch = kernel.dispatchSize ?? kernel.count;
        const launchedGroups = Array.isArray(dispatch)
          ? dispatch.reduce((count, axis) => count * axis, 1)
          : Math.ceil(
              dispatch /
                kernel.workgroupSize.reduce((count, axis) => count * axis, 1),
            );
        const unorderedPairs = (shellCount * (shellCount + 1)) / 2;
        expect(launchedGroups).toBe(unorderedPairs);
        expect(projection.evaluatedPairCount).toBe(unorderedPairs);
        expect(projection.texture.type).toBe(THREE.FloatType);
      } finally {
        projection.dispose();
        source.dispose();
      }
    },
  );
});
