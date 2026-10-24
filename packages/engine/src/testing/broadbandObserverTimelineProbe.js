import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { uniform } from "three/tsl";
import { createModalFieldCache } from "../core/raymarch/fieldCacheBake.js";
import { createReferenceApertureField } from "./spatialApertureReference.js";
import { toFieldCacheVoxelPositionNode } from "../core/raymarch/fieldCacheSampling.js";
import {
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_TILES_X,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
} from "../core/raymarch/fieldCacheGeometry.js";
import { waitForGpuProbeCompletion } from "./gpuProbeTiming.js";
import { createObservationHistory } from "../render/observationHistory.js";

/**
 * Offline observer sampling experiment. Manufactured, permutation-symmetric
 * fields isolate presentation history from acoustic integration and GPU timing.
 * Every schedule reads the same recorded field timeline. No audio state is
 * reconstructed or advanced by a presentation tick.
 */
export async function runBroadbandObserverTimelineProbe(timelines) {
  const renderer = new WebGPURenderer({ antialias: false });
  await renderer.init();
  if (!("isWebGPUBackend" in renderer.backend)) {
    renderer.dispose();
    throw new Error("native WebGPU required");
  }
  renderer.setSize(4, 1);
  const radiusSquared = uniform(0.4);
  const energy = uniform(0.04);
  const first = uniform(new THREE.Vector2(1, 0));
  const second = uniform(new THREE.Vector2(1, 0));
  const radius = uniform(1);
  const aperture = createReferenceApertureField({
    radius,
    evaluateSourceField: ({ voxelIndex, domainMask }) => {
      const position = toFieldCacheVoxelPositionNode(voxelIndex);
      const support = /** @type {import("three/webgpu").Node<"float">} */ (
        domainMask
      );
      return {
        radiationPotential: position
          .dot(position)
          .sub(radiusSquared)
          .mul(support),
        totalEnergy: energy.mul(support),
        spectralFirstMoment: first,
        spectralSecondMoment: second,
        spectralSupport: energy.mul(support),
      };
    },
  });
  const cache = createModalFieldCache({
    radius,
    evaluateAperture: aperture.evaluateAperture,
    prepareAperture: aperture.prepare,
  });
  const points = [];
  for (const x of [12, 27, 42, 57, 70, 85, 100, 115])
    for (const y of [12, 27, 42, 57, 70, 85, 100, 115])
      for (const z of [12, 27, 42, 57, 70, 85, 100, 115]) {
        const position = [x, y, z].map(
          (v) =>
            (v + 0.5) * FIELD_CACHE_CELL_SIZE - FIELD_CACHE_DOMAIN_HALF_EXTENT,
        );
        if (Math.hypot(...position) <= 0.9) points.push([x, y, z]);
      }
  let fullTarget = null;
  const originalSetRenderTarget = renderer.setRenderTarget;
  renderer.setRenderTarget = function (target, ...args) {
    if (target?.textures?.[0] === cache.observerGeometryTexture.value)
      fullTarget = target;
    return originalSetRenderTarget.call(this, target, ...args);
  };
  async function readLanes() {
    const lanes = [];
    for (let lane = 0; lane < 4; lane++) {
      const values = await renderer.readRenderTargetPixelsAsync(
        fullTarget,
        0,
        0,
        FIELD_CACHE_ATLAS_WIDTH,
        FIELD_CACHE_ATLAS_HEIGHT,
        lane,
      );
      const components = lane === 3 ? 1 : 4;
      lanes.push(
        points.map(([x, y, z]) => {
          const texel =
            (Math.floor(z / FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION + y) *
              FIELD_CACHE_ATLAS_WIDTH +
            (z % FIELD_CACHE_TILES_X) * FIELD_CACHE_RESOLUTION +
            x;
          return Array.from({ length: components }, (_, component) => {
            const value = values[components * texel + component];
            return lane === 3
              ? value / 255
              : THREE.DataUtils.fromHalfFloat(value);
          });
        }),
      );
    }
    return {
      geometry: lanes[0],
      appearance: lanes[1],
      organization: lanes[2],
      availability: lanes[3].flat(),
    };
  }
  const results = [];
  try {
    for (const timeline of timelines) {
      for (const schedule of timeline.schedules) {
        const steps = [];
        const checkpoints = [];
        let cursor = 0;
        let inputCursor = 0;
        let representedSample = null;
        const generation = {
          sourceGeneration: 1,
          timelineRevision: 0,
          processingRevision: 0,
        };
        const history = schedule.retained
          ? createObservationHistory({ generation, capacity: 64 })
          : null;
        function retainThrough(index) {
          while (inputCursor <= index) {
            const observation = timeline.observations[inputCursor++];
            history.offer({
              ...observation,
              ...generation,
              endSample: observation.sample,
            });
          }
        }
        for (const checkpoint of [24000, 48000]) {
          while (
            cursor < schedule.observations.length &&
            timeline.observations[schedule.observations[cursor]].sample <=
              checkpoint
          ) {
            const delivery = schedule.observations[cursor++];
            if (history) retainThrough(delivery);
            let observation = history
              ? history.take()
              : timeline.observations[delivery];
            while (observation) {
              radiusSquared.value = observation.radiusSquared;
              energy.value = observation.energy;
              first.value.set(
                Math.cos(observation.phase),
                Math.sin(observation.phase),
              );
              second.value.set(
                Math.cos(2 * observation.phase),
                Math.sin(2 * observation.phase),
              );
              const baked = cache.bake(renderer, {
                boundaryMode: "neumann",
                volumeShape: "sphere",
                observationTimeSeconds: observation.sample / 48000,
                observationAdvancing: true,
                geometryExposureSeconds: 0.4,
                observationResetToken: `${timeline.name}:${schedule.name}`,
                observationCheckpointKey: null,
                modalFieldSpectralSeedDirection: new Float32Array([1, 0]),
              });
              if (baked.baked) representedSample = observation.sample;
              steps.push({ sample: observation.sample, ...baked });
              // The reference completes each update. Retained presentation
              // batches do not wait between updates, also testing GPU ordering
              // when mutable uniforms/textures are uploaded repeatedly.
              if (baked.baked && !history)
                await waitForGpuProbeCompletion(renderer);
              observation = history ? history.take() : null;
            }
          }
          if (history) {
            const available = timeline.observations.findLastIndex(
              (value) => value.sample <= checkpoint,
            );
            retainThrough(available);
          }
          await waitForGpuProbeCompletion(renderer);
          checkpoints.push({
            sample: checkpoint,
            representedSample,
            observer: cache.getObserverState(),
            history: history?.read() ?? null,
            ...(await readLanes()),
          });
        }
        results.push({
          fixture: timeline.name,
          schedule: schedule.name,
          steps,
          checkpoints,
        });
      }
    }
    return { points, cellSize: FIELD_CACHE_CELL_SIZE, results };
  } finally {
    renderer.setRenderTarget = originalSetRenderTarget;
    renderer.setRenderTarget(null);
    cache.dispose();
    aperture.dispose();
    renderer.dispose();
  }
}
