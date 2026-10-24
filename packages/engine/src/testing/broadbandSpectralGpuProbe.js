import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { createBroadbandSpectralProjection } from "../core/raymarch/broadbandSpectralProjection.js";
import { createBroadbandSpectralExpansion } from "../core/raymarch/broadbandSpectralExpansion.js";
import {
  resolveGpuProbeTiming,
  installGpuProbeTiming,
} from "./gpuProbeTiming.js";

export async function runBroadbandSpectralGpuProbe(cases) {
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: true,
  });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new Error("native WebGPU required");
  }
  const restoreGpuTiming = installGpuProbeTiming(renderer);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const results = [];
  try {
    for (const fixture of cases) {
      const frame = fixture.frame;
      const initializationStarted = performance.now();
      const expansion = frame.representation
        ? createBroadbandSpectralExpansion(frame)
        : null;
      const source =
        expansion?.texture ??
        new THREE.DataTexture(
          Float32Array.from(frame.coefficients),
          frame.frameSize / 2 + 1,
          frame.shellCount * frame.channelCount,
          THREE.RGBAFormat,
          THREE.FloatType,
        );
      if (!expansion) {
        source.minFilter = source.magFilter = THREE.NearestFilter;
        source.colorSpace = THREE.NoColorSpace;
        source.generateMipmaps = false;
        source.needsUpdate = true;
      }
      const projection = createBroadbandSpectralProjection({
        ...frame,
        sourceTexture: source,
      });
      const initializationMs = performance.now() - initializationStarted;
      try {
        const gpu = [],
          wall = [],
          submission = [],
          warmup = [];
        for (let iteration = 0; iteration < 10; iteration++) {
          // Identical data at successive sample times measures steady GPU cost.
          const started = performance.now();
          expansion?.update({
            ...frame,
            frameEndSample: frame.frameEndSample + iteration * frame.hopSize,
          });
          if (expansion && !expansion.render(renderer))
            throw new Error("new spectral window failed to render");
          projection.render(renderer);
          const submitted = performance.now();
          const timing = await resolveGpuProbeTiming(renderer);
          if (iteration > 1) {
            gpu.push(timing.elapsedMs);
            wall.push(performance.now() - started);
            submission.push(submitted - started);
          } else {
            warmup.push({
              gpuMs: timing.elapsedMs,
              submissionMs: submitted - started,
              submissionToCompletionMs: performance.now() - started,
            });
          }
        }
        if (expansion) {
          if (
            expansion.update({
              ...frame,
              frameEndSample: frame.frameEndSample + 9 * frame.hopSize,
            })
          )
            throw new Error("duplicate spectral publication updated the cache");
          if (expansion.render(renderer))
            throw new Error("cached render repeated spectral expansion");
          let rejected = false;
          try {
            expansion.update(frame);
          } catch {
            rejected = true;
          }
          if (!rejected) throw new Error("stale spectral window was accepted");
          const next = {
            ...frame,
            frameEndSample: frame.frameEndSample + 10 * frame.hopSize,
          };
          const invalidSpectrum = Array.from(frame.inputSpectrum);
          invalidSpectrum[invalidSpectrum.length - 1] = NaN;
          rejected = false;
          try {
            expansion.update({ ...next, inputSpectrum: invalidSpectrum });
          } catch {
            rejected = true;
          }
          if (!rejected || expansion.render(renderer))
            throw new Error("invalid spectral publication changed cache state");
          // Reusing the rejected timestamp must work: validation cannot consume
          // an ID or leave a half-applied upload. Compare its output below.
          if (!expansion.update(next) || !expansion.render(renderer))
            throw new Error("rejected publication consumed the next frame ID");
          projection.render(renderer);
          await resolveGpuProbeTiming(renderer);
        }
        const spectralErrors = [];
        if (expansion) {
          const width = frame.frameSize / 2 + 1;
          const rows = frame.shellCount * frame.channelCount;
          const readback = await renderer.readRenderTargetPixelsAsync(
            expansion.target,
            0,
            0,
            width,
            rows,
          );
          const stride = Math.ceil((width * 16) / 256) * 64;
          for (let row = 0; row < rows; row++) {
            for (let lane = 0; lane < 2; lane++) {
              let error = 0,
                energy = 0;
              for (let b = 0; b < width; b++)
                for (let component = 0; component < 2; component++) {
                  const i = 4 * b + 2 * lane + component;
                  const expected =
                    fixture.expectedCoefficients[row * 4 * width + i];
                  error += (readback[row * stride + i] - expected) ** 2;
                  energy += expected ** 2;
                }
              spectralErrors.push({
                row,
                quantity: lane === 0 ? "pressure" : "velocity",
                absoluteRms: Math.sqrt(error / (2 * width)),
                referenceRms: Math.sqrt(energy / (2 * width)),
                relativeRms: energy > 0 ? Math.sqrt(error / energy) : null,
              });
            }
          }
        }
        // The installed native backend implements the same padded readback
        // used by readRenderTargetPixelsAsync; its base declaration omits it.
        const pixels = await /** @type {any} */ (
          renderer.backend
        ).copyTextureToBuffer(
          projection.texture,
          0,
          0,
          frame.shellCount,
          3 * frame.shellCount,
          0,
        );
        const size = frame.shellCount ** 2;
        // Installed Three r185 returns WebGPU's padded readback rows. The
        // previous cache probes used aligned widths and did not expose this.
        const rowFloats = Math.ceil((frame.shellCount * 16) / 256) * 64;
        const pixel = (tile, n) =>
          (tile * frame.shellCount + Math.floor(n / frame.shellCount)) *
            rowFloats +
          4 * (n % frame.shellCount);
        const pressure = new Float32Array(5 * size),
          velocity = new Float32Array(5 * size);
        for (let n = 0; n < size; n++) {
          for (let k = 0; k < 4; k++) {
            pressure[k * size + n] = pixels[pixel(0, n) + k];
            velocity[k * size + n] = pixels[pixel(1, n) + k];
          }
          pressure[4 * size + n] = pixels[pixel(2, n)];
          velocity[4 * size + n] = pixels[pixel(2, n) + 1];
        }
        results.push({
          name: fixture.name,
          pressure: Array.from(pressure),
          velocity: Array.from(velocity),
          spectralErrors,
          initializationMs,
          projectionTextureBytes: projection.textureBytes,
          evaluatedPairCount: projection.evaluatedPairCount,
          precisionBinCount: expansion?.precisionBinCount ?? 0,
          correctionUploadBytes: expansion?.correctionUploadBytes ?? 0,
          warmup,
          submissionMs: submission,
          gpuMs: gpu,
          submissionToCompletionMs: wall,
        });
      } finally {
        projection.dispose();
        expansion?.dispose();
        if (!expansion) source.dispose();
      }
    }
    return { backend: "native-WebGPU", results };
  } finally {
    restoreGpuTiming();
    renderer.dispose();
  }
}
