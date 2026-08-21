// Dev-only probe: would a true 3D texture beat the 2D tile atlas?
//
// The atlas gives up hardware interpolation across z, so each of the cubic
// B-spline's 8 filtered fetches becomes two — 16 per sample for the field lane
// plus 2 for the spectral-moment attachment. A 3D texture would halve that to
// 8 + 1.
//
// The cost is on the other side. A 3D render target fills one z slice per pass,
// measured at ~40 us of pass overhead each, so a 112-slice fill pays ~4.5 ms
// before any physics runs against 0.17 ms for one atlas draw — and the
// permutation symmetry needs two fills, so ~9 ms.
//
// So the trade is: save on march fetches, pay on bake passes. The pass cost is
// already measured; this measures the only half that is not, which is what
// halving the fetch count is actually worth.
import * as THREE from "three";
import { WebGPURenderer, MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  float,
  int,
  mix,
  screenUV,
  texture,
  texture3D,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

const GRID = 112;
const TILES_X = 16;
const TILES_Y = GRID / TILES_X;
const ATLAS_WIDTH = GRID * TILES_X;
const ATLAS_HEIGHT = GRID * TILES_Y;
// ~1.59 MP, matching the in-app canvas the march slope was measured against.
const MARCH_WIDTH = 1280;
const MARCH_HEIGHT = 1240;
const SAMPLES = 40;
// Measured pass overhead for a slice-per-pass 3D fill.
const VOLUME_FILL_OVERHEAD_MS = 4.5;
const SYMMETRY_FILL_COUNT = 2;

const report = document.getElementById("report");
const lines = [];
function log(line, cls = "") {
  lines.push(cls ? `<span class="${cls}">${line}</span>` : line);
  report.innerHTML = lines.join("\n");
  console.log("[3d-vs-atlas]", line.replace(/<[^>]*>/g, ""));
}

const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);

function createFullscreenScene(material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.position.z = -1;
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return scene;
}

async function timed(renderer, repeats, body, syncTarget) {
  await body();
  await renderer.readRenderTargetPixelsAsync(syncTarget, 0, 0, 1, 1);
  const startedAt = performance.now();
  for (let index = 0; index < repeats; index += 1) {
    await body();
  }
  await renderer.readRenderTargetPixelsAsync(syncTarget, 0, 0, 1, 1);
  return (performance.now() - startedAt) / repeats;
}

// Real varying values, so a zeroed operand cannot take a fast path.
function fillHalf(count) {
  const data = new Uint16Array(count);
  for (let index = 0; index < count; index += 1) {
    data[index] = THREE.DataUtils.toHalfFloat(Math.sin(index * 0.7391) * 1.3);
  }
  return data;
}

function cubicWeights(fraction) {
  const t2 = fraction.mul(fraction);
  const t3 = t2.mul(fraction);
  const w0 = t3.negate().add(t2.mul(3)).sub(fraction.mul(3)).add(1).div(6);
  const w1 = t3.mul(3).sub(t2.mul(6)).add(4).div(6);
  const w2 = t3.mul(-3).add(t2.mul(3)).add(fraction.mul(3)).add(1).div(6);
  const w3 = t3.div(6);
  const low = w0.add(w1).toVar();
  const high = w2.add(w3).toVar();
  return {
    low,
    high,
    fractionLow: w1.div(low).toVar(),
    fractionHigh: w3.div(high).toVar(),
  };
}

// Sample positions stay clear of the grid edge so neither path spends time in
// clamp behaviour that the other avoids.
function marchVoxelNode(index) {
  const span = float(GRID - 8);
  return vec3(
    screenUV.x.mul(span).add(4),
    screenUV.y.mul(span).add(4),
    float(index).add(0.5).div(float(SAMPLES)).mul(span).add(4),
  );
}

/** What ships: hardware bilinear inside a tile, manual lerp across tiles. */
function createAtlasMarchMaterial(atlas, spectral) {
  const material = new MeshBasicNodeMaterial();
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  const atlasUv = (slice, x, y) => {
    const tileY = slice.div(float(TILES_X)).floor();
    const tileX = slice.sub(tileY.mul(float(TILES_X)));
    return vec2(
      tileX.mul(float(GRID)).add(x).add(0.5).div(float(ATLAS_WIDTH)),
      tileY.mul(float(GRID)).add(y).add(0.5).div(float(ATLAS_HEIGHT)),
    );
  };
  const acrossSlices = (map, z, x, y) => {
    const slice = z.floor();
    return mix(
      texture(map, atlasUv(slice, x, y)),
      texture(map, atlasUv(slice.add(1), x, y)),
      z.sub(slice),
    );
  };

  material.colorNode = Fn(() => {
    const total = vec4(0).toVar();
    Loop({ start: int(0), end: int(SAMPLES), type: "int" }, ({ i }) => {
      const voxel = marchVoxelNode(i);
      const base = voxel.floor().toVar();
      const weights = cubicWeights(voxel.sub(base));
      const low = base.sub(0.5).add(weights.fractionLow).toVar();
      const high = base.add(1.5).add(weights.fractionHigh).toVar();
      const column = (x, y) =>
        acrossSlices(atlas, low.z, x, y)
          .mul(weights.low.z)
          .add(acrossSlices(atlas, high.z, x, y).mul(weights.high.z));
      for (const [x, weightX] of [
        [low.x, weights.low.x],
        [high.x, weights.high.x],
      ]) {
        for (const [y, weightY] of [
          [low.y, weights.low.y],
          [high.y, weights.high.y],
        ]) {
          total.addAssign(column(x, y).mul(weightX).mul(weightY));
        }
      }
      total.addAssign(acrossSlices(spectral, voxel.z, voxel.x, voxel.y));
    });
    return total;
  })();
  return material;
}

/** The alternative: hardware trilinear on all three axes, 8 fetches not 16. */
function createVolumeMarchMaterial(volume, spectral) {
  const material = new MeshBasicNodeMaterial();
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  material.colorNode = Fn(() => {
    const total = vec4(0).toVar();
    Loop({ start: int(0), end: int(SAMPLES), type: "int" }, ({ i }) => {
      const voxel = marchVoxelNode(i);
      const base = voxel.floor().toVar();
      const weights = cubicWeights(voxel.sub(base));
      const low = base
        .sub(0.5)
        .add(weights.fractionLow)
        .div(float(GRID))
        .toVar();
      const high = base
        .add(1.5)
        .add(weights.fractionHigh)
        .div(float(GRID))
        .toVar();
      for (const [x, weightX] of [
        [low.x, weights.low.x],
        [high.x, weights.high.x],
      ]) {
        for (const [y, weightY] of [
          [low.y, weights.low.y],
          [high.y, weights.high.y],
        ]) {
          for (const [z, weightZ] of [
            [low.z, weights.low.z],
            [high.z, weights.high.z],
          ]) {
            total.addAssign(
              texture3D(volume, vec3(x, y, z))
                .mul(weightX)
                .mul(weightY)
                .mul(weightZ),
            );
          }
        }
      }
      total.addAssign(texture3D(spectral, voxel.div(float(GRID))));
    });
    return total;
  })();
  return material;
}

function configureSampler(map) {
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.wrapR = THREE.ClampToEdgeWrapping;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function createAtlasTexture() {
  return configureSampler(
    new THREE.DataTexture(
      fillHalf(ATLAS_WIDTH * ATLAS_HEIGHT * 4),
      ATLAS_WIDTH,
      ATLAS_HEIGHT,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    ),
  );
}

function createVolumeTexture() {
  const volume = new THREE.Data3DTexture(
    fillHalf(GRID ** 3 * 4),
    GRID,
    GRID,
    GRID,
  );
  volume.format = THREE.RGBAFormat;
  volume.type = THREE.HalfFloatType;
  return configureSampler(volume);
}

async function main() {
  lines.length = 0;
  log(
    `3D texture vs 2D tile atlas — ${GRID}^3, ${SAMPLES} samples, ${MARCH_WIDTH}x${MARCH_HEIGHT}`,
  );

  const canvas = document.getElementById("stage");
  const renderer = new WebGPURenderer({ canvas });
  await renderer.init();
  log(`backend: ${renderer.backend?.constructor?.name ?? "unknown"}\n`);

  const target = new THREE.RenderTarget(MARCH_WIDTH, MARCH_HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  const run = async (material) => {
    const scene = createFullscreenScene(material);
    return timed(
      renderer,
      8,
      async () => {
        renderer.setRenderTarget(target);
        renderer.render(scene, quadCamera);
        renderer.setRenderTarget(null);
      },
      target,
    );
  };

  const atlasMs = await run(
    createAtlasMarchMaterial(createAtlasTexture(), createAtlasTexture()),
  );
  log(
    `A  atlas march, 18 fetches/sample : ${atlasMs.toFixed(2)} ms  (ships today)`,
  );

  const volumeMs = await run(
    createVolumeMarchMaterial(createVolumeTexture(), createVolumeTexture()),
  );
  log(`B  3D march,     9 fetches/sample : ${volumeMs.toFixed(2)} ms`);

  const saved = atlasMs - volumeMs;
  const bakeCost = VOLUME_FILL_OVERHEAD_MS * SYMMETRY_FILL_COUNT;
  log(
    `\nmarch saving from a 3D texture : ${saved.toFixed(2)} ms  (${(atlasMs / volumeMs).toFixed(2)}x)`,
  );
  log(`bake cost of slice-per-pass fills: ${bakeCost.toFixed(2)} ms`, "note");
  log(
    saved > bakeCost
      ? `=> 3D WINS by ${(saved - bakeCost).toFixed(2)} ms`
      : `=> 3D LOSES by ${(bakeCost - saved).toFixed(2)} ms — pass overhead exceeds the fetch saving`,
    saved > bakeCost ? "pass" : "fail",
  );
  window.__volumeProbe = { atlasMs, volumeMs, saved, bakeCost };

  target.dispose();
}

main().catch((error) => {
  log(`THREW — ${error?.message ?? error}`, "fail");
  console.error(error);
});
