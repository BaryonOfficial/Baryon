import { createFieldCacheDomainGeometry } from "../core/raymarch/fieldCacheDomainGeometry.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import { Fn, mrt, struct, vec4 } from "three/tsl";
import { createBroadbandSpectralExpansion } from "../core/raymarch/broadbandSpectralExpansion.js";
import { createBroadbandSpectralProjection } from "../core/raymarch/broadbandSpectralProjection.js";
import { createBroadbandMomentFieldProbe } from "./broadbandMomentFieldProbe.js";
import {
  resolveGpuProbeTiming,
  installGpuProbeTiming,
} from "./gpuProbeTiming.js";
import { createBroadbandMomentField } from "../core/raymarch/broadbandMomentField.js";
import { assertBroadbandReflectionSymmetry } from "../core/raymarch/broadbandCosineProjection.js";
import { createFieldCacheBasisLookup } from "../core/raymarch/fieldCacheBasisLookup.js";
import {
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_DOMAINS,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
} from "../core/raymarch/fieldCacheGeometry.js";
import { deriveFieldCacheFragmentVoxelIndexNode } from "../core/raymarch/fieldCacheSampling.js";

const ProbePayload = struct(
  { field: "vec4", spectral: "vec4" },
  "BroadbandProbePayload",
);

// Deliberately stops at the unfiltered field. This establishes shader numerical
// evidence and cost, not the complete observer/optical or audio-to-display gate.
export async function runBroadbandGpuFieldProbe({
  families,
  shellCount,
  boundaryMode = "neumann",
  cases,
  voxels,
  spectral = false,
  cosine = false,
}) {
  // Reject incompatible reflection topology before creating a GPU context.
  if (cosine) assertBroadbandReflectionSymmetry(families, boundaryMode);
  const renderer = new WebGPURenderer({
    antialias: false,
    trackTimestamp: true,
  });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new Error("native WebGPU required for this probe");
  }
  const restoreGpuTiming = installGpuProbeTiming(renderer);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const basis = createFieldCacheBasisLookup();
  const expansion = spectral
    ? createBroadbandSpectralExpansion(cases[0].spectral)
    : null;
  const projection = spectral
    ? createBroadbandSpectralProjection({
        ...cases[0].spectral,
        sourceTexture: expansion.texture,
      })
    : null;
  const field = (
    cosine ? createBroadbandMomentField : createBroadbandMomentFieldProbe
  )({
    families,
    shellCount,
    boundaryMode,
    spectralMatrixTexture: projection?.texture,
  });
  const geometry = createFieldCacheDomainGeometry(
    FIELD_CACHE_DOMAINS.fundamentalXyz,
  );
  const material = new MeshBasicNodeMaterial();
  material.depthTest = false;
  material.depthWrite = false;
  material.toneMapped = false;
  // Raw signed physical lanes must bypass the material's color/opacity path,
  // which clamps negative RGB and replaces alpha for opaque surfaces.
  const payload = Fn(() => {
    const value = field.evaluate({
      voxelIndex: deriveFieldCacheFragmentVoxelIndexNode(),
      basisLookup: basis.texture,
    });
    const physical = vec4(
      value.pressureEnergy,
      value.velocityEnergy,
      value.radiationPotential,
      value.spectralSupport ?? value.totalEnergy,
    );
    return ProbePayload(
      physical,
      spectral
        ? vec4(value.spectralFirstMoment, value.spectralSecondMoment)
        : vec4(0),
    );
  })();
  if (spectral) {
    material.colorNode = /** @type {any} */ (payload.get("field"));
    material.mrtNode = mrt({
      output: payload.get("field"),
      spectral: payload.get("spectral"),
    });
  } else {
    material.fragmentNode = payload.get("field");
  }
  const target = new THREE.RenderTarget(
    FIELD_CACHE_ATLAS_WIDTH,
    FIELD_CACHE_ATLAS_HEIGHT,
    {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      count: spectral ? 2 : 1,
    },
  );
  target.textures.forEach((texture, i) => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.name = i === 0 ? "output" : "spectral";
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const results = [];
  try {
    for (const [caseIndex, fixture] of cases.entries()) {
      field.update(fixture.observation);
      if (expansion) {
        // Independent fixture data gets a monotonic cache publication ID.
        expansion.update({
          ...fixture.spectral,
          frameEndSample:
            fixture.spectral.frameEndSample +
            caseIndex * fixture.spectral.hopSize,
        });
        expansion.render(renderer);
        projection.render(renderer);
        await resolveGpuProbeTiming(renderer);
      }
      renderer.setRenderTarget(target);
      const beforeCompile = performance.now();
      await renderer.compileAsync(scene, camera);
      const compileMs = performance.now() - beforeCompile;
      const gpuMs = [];
      const gpuTiming = [];
      const submissionAndCompletionMs = [];
      for (let iteration = 0; iteration < 10; iteration++) {
        const started = performance.now();
        if ("render" in field) field.render(renderer);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const timing = await resolveGpuProbeTiming(renderer);
        // Resolving includes completion of this query's GPU work.
        // These are not frame-presentation or physical display timestamps.
        if (iteration >= 2) {
          gpuMs.push(timing.elapsedMs);
          gpuTiming.push(timing);
          submissionAndCompletionMs.push(performance.now() - started);
        }
      }
      const pixels = await renderer.readRenderTargetPixelsAsync(
        target,
        0,
        0,
        FIELD_CACHE_ATLAS_WIDTH,
        FIELD_CACHE_ATLAS_HEIGHT,
      );
      const colors = spectral
        ? await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            FIELD_CACHE_ATLAS_WIDTH,
            FIELD_CACHE_ATLAS_HEIGHT,
            1,
          )
        : null;
      const fields = voxels.map(([x, y, z]) => {
        const column = (z % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + x;
        const row =
          Math.floor(z / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + y;
        const offset = 4 * (row * FIELD_CACHE_ATLAS_WIDTH + column);
        const physical = Array.from(pixels.slice(offset, offset + 4));
        return colors
          ? [
              ...physical.slice(0, 3),
              physical[0] + physical[1],
              physical[3],
              ...colors.slice(offset, offset + 4),
            ]
          : physical;
      });
      results.push({
        name: fixture.name,
        compileMs,
        gpuMs,
        gpuTiming,
        submissionAndCompletionMs,
        fields,
      });
    }
    return {
      backend: "native-WebGPU",
      boundaryMode,
      spectral,
      cosine,
      cosineProjection: cosine
        ? {
            width: field.coefficientWidth,
            terms: field.projectionTermCount,
            initializationMs: field.initializationMs,
            textureBytes: field.textureBytes,
          }
        : null,
      strategy: cosine ? "exact-cosine-tensor" : "permutation-only",
      timestampQueries: renderer.hasFeature("timestamp-query"),
      cacheResolution: FIELD_CACHE_RESOLUTION,
      storedDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
      renderTargetBytes:
        (cosine ? field.renderTargetBytes : 0) +
        FIELD_CACHE_ATLAS_WIDTH *
          FIELD_CACHE_ATLAS_HEIGHT *
          16 *
          (spectral ? 2 : 1),
      results,
    };
  } finally {
    target.dispose();
    geometry.dispose();
    material.dispose();
    basis.dispose();
    field.dispose();
    projection?.dispose();
    expansion?.dispose();
    restoreGpuTiming();
    renderer.dispose();
  }
}
