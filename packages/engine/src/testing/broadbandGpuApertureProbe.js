import { createFieldCacheDomainGeometry } from "../core/raymarch/fieldCacheDomainGeometry.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial, WebGPURenderer } from "three/webgpu";
import { Fn, mrt, struct, uniform, vec4 } from "three/tsl";
import { createBroadbandMomentField } from "../core/raymarch/broadbandMomentField.js";
import { createBroadbandSpectralExpansion } from "../core/raymarch/broadbandSpectralExpansion.js";
import { createBroadbandSpectralProjection } from "../core/raymarch/broadbandSpectralProjection.js";
import {
  createFieldCacheApertureMaterial,
  REFERENCE_APERTURE_PASSES,
} from "./spatialApertureReference.js";
import {
  FIELD_CACHE_ATLAS_WIDTH as atlasWidth,
  FIELD_CACHE_ATLAS_HEIGHT as atlasHeight,
  FIELD_CACHE_RESOLUTION as n,
  FIELD_CACHE_TILES_X as tiles,
  FIELD_CACHE_CELL_SIZE as cell,
  FIELD_CACHE_DOMAINS,
} from "../core/raymarch/fieldCacheGeometry.js";
import { deriveFieldCacheFragmentVoxelIndexNode } from "../core/raymarch/fieldCacheSampling.js";
import { waitForGpuProbeCompletion } from "./gpuProbeTiming.js";

const Payload = struct(
  { field: "vec4", spectral: "vec4" },
  "ApertureProbePayload",
);
const names = [
  "finePotential",
  "fineEnergy",
  "fineSupport",
  "topologyPotential",
  "firstReal",
  "firstImaginary",
  "secondReal",
  "secondImaginary",
];

// Both paths share the already independently validated raw cosine projection.
// Their spatial measurement arithmetic is separate: the unchanged production
// three-pass clamped convolution versus finite convolution of tensor factors.
// No observer, optics, source capture or performance acceptance is claimed.
export async function runBroadbandGpuApertureProbe({
  families,
  shellCount,
  boundaryMode,
  cases,
  voxels,
}) {
  const renderer = new WebGPURenderer({ antialias: false });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend))
    throw new Error("native WebGPU required");
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const expansion = createBroadbandSpectralExpansion(cases[0].spectral);
  const projection = createBroadbandSpectralProjection({
    ...cases[0].spectral,
    sourceTexture: expansion.texture,
  });
  const options = {
    families,
    shellCount,
    boundaryMode,
    spectralMatrixTexture: projection.texture,
  };
  const raw = createBroadbandMomentField(options);
  const candidate = createBroadbandMomentField({
    ...options,
    apertureRadius: 1.5,
  });
  const radius = uniform(1.5);
  const geometry = new Map(
    Object.values(FIELD_CACHE_DOMAINS).map((domain) => [
      domain,
      createFieldCacheDomainGeometry(domain),
    ]),
  );
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry.get(FIELD_CACHE_DOMAINS.fundamentalXyz));
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const targets = Array.from({ length: 3 }, () => {
    const target = new THREE.RenderTarget(atlasWidth, atlasHeight, {
      type: THREE.FloatType,
      count: 2,
      depthBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    target.textures.forEach((t, i) => {
      t.name = i === 0 ? "output" : "spectral";
      t.colorSpace = THREE.NoColorSpace;
    });
    return target;
  });
  function probeMaterial(evaluate) {
    const material = new MeshBasicNodeMaterial();
    material.depthTest = material.depthWrite = material.toneMapped = false;
    const payload = Fn(evaluate)();
    material.colorNode = payload.get("field");
    material.mrtNode = mrt({
      output: payload.get("field"),
      spectral: payload.get("spectral"),
    });
    return material;
  }
  const sourceMaterial = probeMaterial(() => {
    const value = raw.evaluate({
      voxelIndex: deriveFieldCacheFragmentVoxelIndexNode(),
    });
    return Payload(
      vec4(
        value.radiationPotential,
        value.totalEnergy,
        value.spectralSupport,
        value.radiationPotential,
      ),
      vec4(value.spectralFirstMoment, value.spectralSecondMoment),
    );
  });
  const candidateMaterial = probeMaterial(() => {
    const value = candidate.evaluateAperture({
      voxelIndex: deriveFieldCacheFragmentVoxelIndexNode(),
    });
    return Payload(
      vec4(
        value.finePotential,
        value.fineEnergy,
        value.fineSupport,
        value.topologyPotential,
      ),
      vec4(value.fineSpectralFirstMoment, value.fineSpectralSecondMoment),
    );
  });
  const apertureMaterials = REFERENCE_APERTURE_PASSES.map((pass, i) =>
    createFieldCacheApertureMaterial({
      sourceField: targets[i % 2].textures[0],
      sourceSpectral: targets[i % 2].textures[1],
      radius,
      direction: pass.direction,
      inputDomain: pass.inputDomain,
    }),
  );
  /** @param {any} material @param {any} target @param {typeof FIELD_CACHE_DOMAINS[keyof typeof FIELD_CACHE_DOMAINS]} [domain] */
  function draw(material, target, domain = FIELD_CACHE_DOMAINS.fundamentalXyz) {
    mesh.material = material;
    mesh.geometry = geometry.get(domain);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  async function read(target) {
    return Promise.all(
      [0, 1].map((lane) =>
        renderer.readRenderTargetPixelsAsync(
          target,
          0,
          0,
          atlasWidth,
          atlasHeight,
          lane,
        ),
      ),
    );
  }
  function address(x, y, z) {
    const [a, b, c] = [x, y, z]
      .map((v) => Math.max(0, Math.min(n - 1, v)))
      .sort((a, b) => a - b);
    return (
      4 * ((Math.floor(c / tiles) * n + b) * atlasWidth + (c % tiles) * n + a)
    );
  }
  const results = [];
  try {
    renderer.autoClear = false;
    for (const [caseIndex, fixture] of cases.entries()) {
      raw.update(fixture.observation);
      candidate.update(fixture.observation);
      expansion.update({
        ...fixture.spectral,
        frameEndSample:
          fixture.spectral.frameEndSample +
          caseIndex * fixture.spectral.hopSize,
      });
      expansion.render(renderer);
      projection.render(renderer);
      raw.render(renderer);
      // Return to the initial radius after two different values. This exercises
      // storage refresh without recompilation or an acoustic publication.
      for (const r of [1.5, 3, 2.173, 1.5]) {
        radius.value = r;
        candidate.setApertureRadius(r);
        if (candidate.setApertureRadius(r) !== false)
          throw new Error("unchanged radius refreshed the basis");
        draw(sourceMaterial, targets[0]);
        for (const [i, pass] of REFERENCE_APERTURE_PASSES.entries())
          draw(apertureMaterials[i], targets[(i + 1) % 2], pass.outputDomain);
        candidate.render(renderer);
        draw(candidateMaterial, targets[2]);
        await waitForGpuProbeCompletion(renderer);
        const reference = await read(targets[1]);
        const actual = await read(targets[2]);
        const sums = names.map((name) => ({
          name,
          count: 0,
          squaredError: 0,
          squaredReference: 0,
          maxError: 0,
        }));
        function accumulate(stat, a, b) {
          if (!Number.isFinite(a) || !Number.isFinite(b))
            throw new Error(`nonfinite ${stat.name}`);
          stat.count++;
          stat.squaredError += (a - b) ** 2;
          stat.squaredReference += b * b;
          stat.maxError = Math.max(stat.maxError, Math.abs(a - b));
        }
        // Every stored voxel, including permutation seams and domain edges.
        for (let x = 0; x < n; x++)
          for (let y = x; y < n; y++)
            for (let z = y; z < n; z++) {
              const at = address(x, y, z);
              for (let k = 0; k < 8; k++)
                accumulate(
                  sums[k],
                  actual[k >> 2][at + (k % 4)],
                  reference[k >> 2][at + (k % 4)],
                );
            }
        const gradient = {
          name: "fineAndTopologySixthOrderGradient",
          count: 0,
          squaredError: 0,
          squaredReference: 0,
          maxError: 0,
        };
        if (fixture.name !== "silence" && sums[1].squaredReference <= 0)
          throw new Error("non-silent reference field has no raw energy");
        const stencil = [
          [-3, -1],
          [-2, 9],
          [-1, -45],
          [1, 45],
          [2, -9],
          [3, 1],
        ];
        for (const voxel of voxels)
          for (let axis = 0; axis < 3; axis++)
            for (const lane of [0, 3]) {
              const derivative = (pixels) =>
                stencil.reduce((sum, [delta, w]) => {
                  const point = voxel.slice();
                  point[axis] += delta;
                  return sum + w * pixels[0][address(...point) + lane];
                }, 0) /
                (60 * cell);
              accumulate(gradient, derivative(actual), derivative(reference));
            }
        const quantities = [...sums, gradient].map(
          ({ name, count, squaredError, squaredReference, maxError }) => {
            const absoluteRms = Math.sqrt(squaredError / count),
              referenceRms = Math.sqrt(squaredReference / count);
            return {
              name,
              count,
              absoluteRms,
              referenceRms,
              maxError,
              relativeRms: referenceRms > 0 ? absoluteRms / referenceRms : null,
              passed:
                referenceRms > 0
                  ? absoluteRms / referenceRms <= 1e-4
                  : absoluteRms === 0,
            };
          },
        );
        results.push({
          name: `${fixture.name}/radius-${r}/step-${results.length}`,
          inputSha256: fixture.inputSha256,
          radius: r,
          quantities,
        });
      }
    }
    return {
      backend: "native-WebGPU",
      boundaryMode,
      strategy: "finite-aperture-cosine-tensor",
      results,
      candidateTextureBytes: candidate.textureBytes,
      rawTextureBytes: raw.textureBytes,
      probeTargetBytes: 3 * atlasWidth * atlasHeight * 32,
    };
  } finally {
    renderer.setRenderTarget(null);
    for (const target of targets) target.dispose();
    for (const g of geometry.values()) g.dispose();
    for (const material of [
      sourceMaterial,
      candidateMaterial,
      ...apertureMaterials,
    ])
      material.dispose();
    candidate.dispose();
    raw.dispose();
    projection.dispose();
    expansion.dispose();
    renderer.dispose();
  }
}
