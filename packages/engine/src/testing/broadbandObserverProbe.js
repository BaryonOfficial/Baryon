import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { uniform } from "three/tsl";
import { createHistoricalObserverMaterial } from "./historicalObserverProbe.js";
import { createCymaticObserverMaterial } from "../core/raymarch/cymaticObserverNode.js";
import { createModalFieldCache } from "../core/raymarch/fieldCacheBake.js";
import { createReferenceApertureField } from "./spatialApertureReference.js";
import {
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
  FIELD_CACHE_CELL_SIZE,
} from "../core/raymarch/fieldCacheGeometry.js";
import { toFieldCacheVoxelPositionNode } from "../core/raymarch/fieldCacheSampling.js";

// Constant inputs isolate the update rule. Spatial fixtures additionally use
// actual-sized, filtered geometry/availability atlases and the real backtrace.
export async function runBroadbandObserverProbe(fixtures) {
  const renderer = new WebGPURenderer({ antialias: false });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend))
    throw new Error("native WebGPU required");
  // R8 readback must occupy a multiple of four bytes on the installed backend.
  // Assertions use the first pixel; the additional pixels only align readback.
  renderer.setSize(4, 1);
  function texture() {
    const result = new THREE.DataTexture(
      new Float32Array(4),
      1,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    result.minFilter = result.magFilter = THREE.NearestFilter;
    result.colorSpace = THREE.NoColorSpace;
    result.generateMipmaps = false;
    return result;
  }
  const currentTopology = texture(),
    currentSource = texture(),
    currentOrganization = texture(),
    previousGeometry = texture(),
    previousAppearance = texture(),
    previousOrganization = texture(),
    previousAvailability = texture(),
    previousTopology = texture();
  const textures = [
    currentTopology,
    currentSource,
    currentOrganization,
    previousGeometry,
    previousAppearance,
    previousOrganization,
    previousAvailability,
    previousTopology,
  ];
  const spatialGeometry = new THREE.DataTexture(
    new Uint16Array(FIELD_CACHE_ATLAS_WIDTH * FIELD_CACHE_ATLAS_HEIGHT * 4),
    FIELD_CACHE_ATLAS_WIDTH,
    FIELD_CACHE_ATLAS_HEIGHT,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  const spatialAvailability = new THREE.DataTexture(
    new Uint8Array(FIELD_CACHE_ATLAS_WIDTH * FIELD_CACHE_ATLAS_HEIGHT),
    FIELD_CACHE_ATLAS_WIDTH,
    FIELD_CACHE_ATLAS_HEIGHT,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  for (const t of [spatialGeometry, spatialAvailability]) {
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = false;
  }
  const targets = [3, 4].map(
    (count) =>
      new THREE.RenderTarget(
        FIELD_CACHE_ATLAS_WIDTH,
        FIELD_CACHE_ATLAS_HEIGHT,
        {
          count,
          type: THREE.HalfFloatType,
          depthBuffer: false,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
        },
      ),
  );
  targets.forEach((target) =>
    target.textures.forEach((texture, i) => {
      texture.name = ["geometry", "appearance", "organization", "availability"][
        i
      ];
      texture.colorSpace = THREE.NoColorSpace;
      if (i === 3) {
        texture.format = THREE.RedFormat;
        texture.type = THREE.UnsignedByteType;
      }
    }),
  );
  // Keep the real atlas viewport so screenUV maps the readback pixel to voxel
  // (0,0,0); a tiny viewport would select an unrelated interior z slice.
  for (const target of targets) {
    target.scissor.set(0, 0, 4, 1);
    target.scissorTest = true;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);
  const materials = new Map();
  const results = [];
  try {
    for (const fixture of fixtures) {
      const values = [
        [fixture.potential, ...fixture.gradient],
        [0, 0, 0, fixture.compressedEnergy],
        [0, 0, 0, 0],
        [fixture.previousDistance, ...fixture.previousNormal],
        [1, 0, 0.25, 0.5],
        [1, 1, 1, 0],
        [fixture.historyAvailable ? 1 : 0, 0, 0, 0],
        [
          fixture.potential -
            (fixture.historyCorners
              ? 3 * (fixture.samplingOrigin + 0.5) * FIELD_CACHE_CELL_SIZE
              : 0),
          ...fixture.gradient,
        ],
      ];
      textures.forEach((t, i) => {
        t.image.data.set(values[i]);
        t.needsUpdate = true;
      });
      if (fixture.historyCorners) {
        spatialGeometry.image.data.fill(0);
        spatialAvailability.image.data.fill(0);
        for (let corner = 0; corner < 8; corner++) {
          const x = fixture.samplingOrigin + (corner & 1);
          const y = fixture.samplingOrigin + ((corner >> 1) & 1);
          const z = fixture.samplingOrigin + ((corner >> 2) & 1);
          const texel =
            (Math.floor(z / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + y) *
              FIELD_CACHE_ATLAS_WIDTH +
            (z % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION +
            x;
          const value = fixture.historyCorners[corner];
          spatialGeometry.image.data.set(
            [value.distance, ...value.normal].map(THREE.DataUtils.toHalfFloat),
            texel * 4,
          );
          spatialAvailability.image.data[texel] = value.available ? 255 : 0;
        }
        spatialGeometry.needsUpdate = spatialAvailability.needsUpdate = true;
      }
      const outputs = {};
      for (const convention of ["existing", "candidate"]) {
        const candidate = convention === "candidate";
        const target = targets[candidate ? 1 : 0];
        const key = `${convention}:${fixture.endpoint}:${Boolean(fixture.historyCorners)}`;
        let observer = materials.get(key);
        if (!observer) {
          observer = (
            candidate
              ? createCymaticObserverMaterial
              : createHistoricalObserverMaterial
          )({
            currentTopologyFieldTexture: currentTopology,
            currentSourceTexture: currentSource,
            currentOrganizationTexture: currentOrganization,
            previousTopologyFieldTexture: previousTopology,
            previousSourceTexture: currentSource,
            previousOrganizationTexture: currentOrganization,
            previousGeometryTexture: fixture.historyCorners
              ? spatialGeometry
              : previousGeometry,
            previousAppearanceTexture: previousAppearance,
            previousObserverOrganizationTexture: previousOrganization,
            previousGeometryAvailabilityTexture: candidate
              ? fixture.historyCorners
                ? spatialAvailability
                : previousAvailability
              : null,
            spectralSeedDirectionNode: uniform(new THREE.Vector2(1, 0)),
            radius: uniform(1),
            currentFieldEndpoint: fixture.endpoint,
          });
          materials.set(key, observer);
        }
        observer.setBlends({
          geometry: fixture.geometryBlend,
          radiance: fixture.radianceBlend,
          phase: 0,
        });
        observer.setFieldInterval({ previousFieldMix: 0, currentFieldMix: 1 });
        mesh.material = observer.material;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const lanes = [];
        for (let i = 0; i < target.textures.length; i++) {
          const bits = await renderer.readRenderTargetPixelsAsync(
            target,
            0,
            0,
            4,
            1,
            i,
          );
          lanes.push(
            Array.from(bits.slice(0, i === 3 ? 1 : 4), (value) =>
              i === 3 ? value / 255 : THREE.DataUtils.fromHalfFloat(value),
            ),
          );
        }
        outputs[convention] = {
          geometry: lanes[0],
          appearance: lanes[1],
          organization: lanes[2],
          ...(candidate ? { historyAvailable: lanes[3][0] === 1 } : {}),
        };
      }
      results.push({ name: fixture.name, ...outputs });
    }
    return { fixtures: results, cache: await probeCacheHistory(renderer) };
  } finally {
    renderer.setRenderTarget(null);
    materials.forEach((observer) => observer.dispose());
    textures.forEach((t) => t.dispose());
    spatialGeometry.dispose();
    spatialAvailability.dispose();
    targets.forEach((target) => target.dispose());
    geometry.dispose();
    renderer.dispose();
  }
}

// Exercise actual seed, sparse expansion, persistent targets and checkpoint
// copies. These transitions cannot be certified by the scalar shader alone.
async function probeCacheHistory(renderer) {
  const active = uniform(0);
  const radius = uniform(1);
  const aperture = createReferenceApertureField({
    radius,
    evaluateSourceField: ({ voxelIndex, domainMask }) => {
      const position = toFieldCacheVoxelPositionNode(voxelIndex);
      const support = active.mul(
        /** @type {import("three/webgpu").Node<"float">} */ (domainMask),
      );
      return {
        radiationPotential: position.dot(position).sub(0.4).mul(support),
        totalEnergy: support.mul(0.0004),
        spectralFirstMoment: null,
        spectralSecondMoment: null,
        spectralSupport: null,
      };
    },
  });
  const cache = createModalFieldCache({
    radius,
    evaluateAperture: aperture.evaluateAperture,
    prepareAperture: aperture.prepare,
  });
  const options = {
    boundaryMode: "neumann",
    volumeShape: "sphere",
    observationTimeSeconds: 0,
    observationAdvancing: true,
    geometryExposureSeconds: 0.4,
    observationResetToken: "empty",
    observationCheckpointKey: null,
    modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
  };
  const points = [
    [32, 40, 50],
    [32, 50, 40],
    [40, 32, 50],
    [40, 50, 32],
    [50, 32, 40],
    [50, 40, 32],
    [95, 87, 77],
    [63, 63, 63],
    [64, 64, 64],
  ];
  let fullTarget = null;
  let presentationTarget = null;
  let renderCount = 0;
  const originalSetRenderTarget = renderer.setRenderTarget;
  const originalRender = renderer.render;
  renderer.setRenderTarget = function (target, ...args) {
    if (target?.textures?.[0] === cache.observerGeometryTexture.value)
      fullTarget = target;
    if (target?.textures?.[0] === cache.observerOpticalPairTexture.value)
      presentationTarget = target;
    return originalSetRenderTarget.call(this, target, ...args);
  };
  renderer.render = function (...args) {
    renderCount++;
    return originalRender.apply(this, args);
  };
  const states = [];
  async function record(name, changes = {}) {
    Object.assign(options, changes);
    const before = renderCount;
    const result = cache.bake(renderer, options);
    const geometry = [];
    const availability = [];
    const presentation = [];
    for (const [x, y, z] of points) {
      const tx = (z % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + x;
      const ty =
        Math.floor(z / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + y;
      const bits = await renderer.readRenderTargetPixelsAsync(
        fullTarget,
        tx,
        ty,
        1,
        1,
        0,
      );
      geometry.push(Array.from(bits, THREE.DataUtils.fromHalfFloat));
      const mask = await renderer.readRenderTargetPixelsAsync(
        fullTarget,
        tx,
        ty,
        4,
        1,
        3,
      );
      availability.push(mask[0]);
      const readLane = async (target, lane, slice = z) =>
        Array.from(
          await renderer.readRenderTargetPixelsAsync(
            target,
            (slice % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + x,
            Math.floor(slice / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION +
              y,
            1,
            1,
            lane,
          ),
          THREE.DataUtils.fromHalfFloat,
        );
      const lower = await readLane(fullTarget, 1);
      const upper = await readLane(
        fullTarget,
        1,
        Math.min(z + 1, FIELD_CACHE_RESOLUTION - 1),
      );
      presentation.push({
        expectedOpticalPair: [...lower.slice(2), ...upper.slice(2)],
        opticalPair: await readLane(presentationTarget, 0),
        expectedOrganization: await readLane(fullTarget, 2),
        organization: await readLane(presentationTarget, 1),
      });
    }
    states.push({
      name,
      result,
      geometry,
      availability,
      presentation,
      draws: renderCount - before,
      availabilityBytes: cache.geometryAvailabilityBytes,
      state: cache.getObserverState(),
    });
  }
  try {
    await record("initial-silence");
    active.value = 1;
    await record("quiet-onset", { observationTimeSeconds: 1 / 60 });
    await record("checkpoint-seed", {
      observationTimeSeconds: 0,
      observationResetToken: "source-a",
      observationCheckpointKey: "source-a",
    });
    active.value = 0;
    await record("silence-retains-history", { observationTimeSeconds: 1 / 60 });
    await record("checkpoint-recovery", {
      observationTimeSeconds: 0,
      observationResetToken: "renderer-recovery",
    });
    await record("new-source-clears-history", {
      observationResetToken: "source-b",
      observationCheckpointKey: "source-b",
    });
    await record("cached-read");
    return { points, states };
  } finally {
    renderer.setRenderTarget = originalSetRenderTarget;
    renderer.render = originalRender;
    renderer.setRenderTarget(null);
    cache.dispose();
    aperture.dispose();
  }
}
