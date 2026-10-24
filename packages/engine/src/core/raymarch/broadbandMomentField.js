import { compileRenderPass } from "./compileRenderPass.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  float,
  int,
  ivec2,
  ivec3,
  max,
  mrt,
  screenCoordinate,
  struct,
  textureLoad,
  uniform,
  vec4,
} from "three/tsl";
import { createBroadbandCosineProjection } from "./broadbandCosineProjection.js";
import { writeBroadbandApertureBasis } from "./broadbandApertureBasis.js";
import { createPositiveOctantGeometry } from "./fieldCachePositiveOctantGeometry.js";
import { fixedRenderTargetTextureLoad as load } from "./fixedOrientationTextureNode.js";
import {
  FIELD_CACHE_RESOLUTION,
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_DOMAINS,
} from "./fieldCacheGeometry.js";
import {
  deriveFieldCacheFragmentVoxelIndexNode,
  toSparseFieldCacheAtlasTexelNode,
} from "./fieldCacheSampling.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "./fieldObservation.js";

const Payload = struct(
  { physical: "vec4", chromatic: "vec4" },
  "BroadbandCosinePayload",
);

/**
 * Exact full-matrix spatial evaluator. Full shell matrices become cosine-series
 * coefficients once per publication, then three separable evaluations replace
 * the per-voxel quadratic loop. This derived cache owns no acoustic state, bin selection or rank cutoff.
 * Without an aperture the cache exposes raw energy, normalized potential and
 * color moments. An explicit aperture radius folds the fixed spatial kernels
 * into the tensor factors; evaluateAperture exposes their measurement semantics.
 * This does not filter amplitudes before squaring or normalize local energy.
 */
export function createBroadbandMomentField({
  families,
  shellCount,
  boundaryMode = "neumann",
  spectralMatrixTexture = null,
  apertureRadius = null,
}) {
  const initializationStarted = performance.now();
  const { width, offsets, entries, normalizationWeights } =
    createBroadbandCosineProjection({
      families,
      shellCount,
      boundaryMode,
    });
  if (entries.length / 4 >= 2 ** 24)
    throw new RangeError(
      "cosine projection index exceeds exact Float32 addressing",
    );
  const half = FIELD_CACHE_RESOLUTION / 2;
  const termWidth = 2048;
  const termHeight = Math.max(1, Math.ceil(entries.length / 4 / termWidth));
  const termData = new Float32Array(termWidth * termHeight * 4);
  termData.set(entries);
  if (!termData.every(Number.isFinite))
    throw new RangeError("cosine topology exceeds finite Float32 range");
  const offsetData = new Float32Array(width ** 3 * 4);
  for (let i = 0; i < offsets.length - 1; i++) {
    offsetData[4 * i] = offsets[i];
    offsetData[4 * i + 1] = offsets[i + 1] - offsets[i];
  }
  const basisData = new Float32Array(width * half * 4);
  writeBroadbandApertureBasis(basisData, width, apertureRadius);
  const apertured = apertureRadius !== null;
  const textures = [];
  function upload(data, w, h) {
    const t = new THREE.DataTexture(
      data,
      w,
      h,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    textures.push(t);
    return t;
  }
  const terms = upload(termData, termWidth, termHeight);
  const ranges = upload(offsetData, width, width * width);
  const basis = upload(basisData, width, half);
  const momentData = new Float32Array(shellCount ** 2 * 4);
  const moments = upload(momentData, shellCount, shellCount);
  const norm = uniform(0);
  const quad = new THREE.PlaneGeometry(2, 2);
  const octant = createPositiveOctantGeometry();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  const passes = [];
  let disposed = false;
  function pass(w, h, geometry, evaluate) {
    const target = new THREE.RenderTarget(w, h, {
      type: THREE.FloatType,
      depthBuffer: false,
      count: 2,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    target.textures.forEach((t, i) => {
      t.colorSpace = THREE.NoColorSpace;
      t.name = i === 0 ? "output" : "spectral";
    });
    const material = new MeshBasicNodeMaterial();
    material.depthTest = material.depthWrite = material.toneMapped = false;
    const payload = Fn(evaluate)();
    material.colorNode = /** @type {any} */ (payload.get("physical"));
    material.mrtNode = mrt({
      output: payload.get("physical"),
      spectral: payload.get("chromatic"),
    });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    passes.push({ target, material, scene });
    return target;
  }
  const coefficients = pass(width, width * width, quad, () => {
    const pixel = ivec2(screenCoordinate.xy).toVar();
    const p = float(0).toVar(),
      v = float(0).toVar();
    const color = vec4(0).toVar(),
      imaginary = float(0).toVar();
    If(norm.greaterThan(0), () => {
      const range = textureLoad(ranges, pixel).toVar();
      Loop({ start: int(range.x), end: int(range.x.add(range.y)) }, ({ i }) => {
        const term = textureLoad(
          terms,
          ivec2(i.mod(termWidth), i.div(termWidth)),
        ).toVar();
        const pair = ivec2(term.xy).toVar();
        const raw = textureLoad(moments, pair).toVar();
        p.addAssign(raw.x.mul(term.z));
        v.addAssign(raw.y.mul(term.w));
        if (spectralMatrixTexture) {
          const cp = load(spectralMatrixTexture, pair);
          const cv = load(
            spectralMatrixTexture,
            ivec2(pair.x, pair.y.add(shellCount)),
          );
          const im = load(
            spectralMatrixTexture,
            ivec2(pair.x, pair.y.add(2 * shellCount)),
          );
          const wp = term.z.mul(contrast.pressureEnergyWeight).toVar();
          const wv = term.w.mul(contrast.velocityEnergyWeight).toVar();
          color.addAssign(cp.mul(wp).add(cv.mul(wv)));
          imaginary.addAssign(im.x.mul(wp).add(im.y.mul(wv)));
        }
      });
    });
    return Payload(
      vec4(p, v, color.x, color.y),
      vec4(
        color.z,
        color.w,
        imaginary,
        apertured
          ? p
              .mul(contrast.pressureEnergyWeight)
              .sub(v.mul(contrast.velocityEnergyWeight))
          : float(0),
      ),
    );
  });
  const alongX = pass(half, width * width, quad, () => {
    const pixel = ivec2(screenCoordinate.xy).toVar();
    const a = vec4(0).toVar(),
      b = vec4(0).toVar();
    Loop(width, ({ i }) => {
      const weights = textureLoad(basis, ivec2(i, pixel.x));
      const weight = weights.x;
      a.addAssign(
        load(coefficients.textures[0], ivec2(i, pixel.y)).mul(weight),
      );
      b.addAssign(
        load(coefficients.textures[1], ivec2(i, pixel.y)).mul(
          vec4(weight, weight, weight, weights.y),
        ),
      );
    });
    return Payload(a, b);
  });
  const alongY = pass(half, half * width, quad, () => {
    const pixel = ivec2(screenCoordinate.xy).toVar();
    const qz = pixel.y.div(half).toVar(),
      y = pixel.y.mod(half).toVar();
    const a = vec4(0).toVar(),
      b = vec4(0).toVar();
    Loop(width, ({ i }) => {
      const weights = textureLoad(basis, ivec2(i, y));
      const weight = weights.x;
      const source = ivec2(pixel.x, i.add(qz.mul(width)));
      a.addAssign(load(alongX.textures[0], source).mul(weight));
      b.addAssign(
        load(alongX.textures[1], source).mul(
          vec4(weight, weight, weight, weights.y),
        ),
      );
    });
    return Payload(a, b);
  });
  const field = pass(
    FIELD_CACHE_ATLAS_WIDTH,
    FIELD_CACHE_ATLAS_HEIGHT,
    octant,
    () => {
      const voxel = ivec3(deriveFieldCacheFragmentVoxelIndexNode())
        .sub(half)
        .toVar();
      const a = vec4(0).toVar(),
        b = vec4(0).toVar();
      const potential = float(0).toVar(),
        support = float(0).toVar(),
        color = vec4(0).toVar();
      If(norm.greaterThan(0), () => {
        Loop(width, ({ i }) => {
          const weights = textureLoad(basis, ivec2(i, voxel.z));
          const weight = weights.x;
          const source = ivec2(voxel.x, voxel.y.add(i.mul(half)));
          a.addAssign(load(alongY.textures[0], source).mul(weight));
          b.addAssign(
            load(alongY.textures[1], source).mul(
              vec4(weight, weight, weight, weights.y),
            ),
          );
        });
        potential.assign(
          apertured
            ? b.w.div(norm)
            : a.x
                .mul(contrast.pressureEnergyWeight)
                .sub(a.y.mul(contrast.velocityEnergyWeight))
                .div(norm),
        );
        support.assign(a.z.div(norm));
        color.assign(vec4(a.w, b.xyz).div(norm));
      });
      return Payload(vec4(a.xy, potential, support), color);
    },
  );
  const renderTargetBytes = passes.reduce(
    (sum, p) => sum + p.target.width * p.target.height * 32,
    0,
  );
  function readField(voxelIndex) {
    const reflected = max(
      voxelIndex,
      voxelIndex.negate().add(FIELD_CACHE_RESOLUTION - 1),
    );
    const texel = toSparseFieldCacheAtlasTexelNode(
      reflected,
      FIELD_CACHE_DOMAINS.fundamentalXyz,
    );
    return {
      physical: load(field.textures[0], texel),
      color: load(field.textures[1], texel),
    };
  }
  return {
    initializationMs: performance.now() - initializationStarted,
    coefficientWidth: width,
    projectionTermCount: entries.length / 4,
    renderTargetBytes,
    textureBytes:
      textures.reduce((sum, t) => sum + t.image.data.byteLength, 0) +
      renderTargetBytes,
    setApertureRadius(radius) {
      if (!apertured) throw new Error("raw field has no spatial aperture");
      if (!Number.isFinite(radius) || radius <= 0)
        throw new RangeError("aperture radius must be finite and positive");
      if (radius === apertureRadius) return false;
      writeBroadbandApertureBasis(basisData, width, radius);
      apertureRadius = radius;
      basis.needsUpdate = true;
      return true;
    },
    update(observation) {
      if (
        observation.pressureMoments.length !== shellCount ** 2 ||
        observation.velocityMoments.length !== shellCount ** 2
      )
        throw new RangeError("cosine moment dimensions do not match topology");
      let normalization = 0;
      for (let i = 0; i < shellCount; i++)
        normalization +=
          normalizationWeights[i] *
          (observation.pressureMoments[i * shellCount + i] +
            observation.velocityMoments[i * shellCount + i]);
      if (
        normalization < 0 ||
        !Number.isFinite(Math.fround(normalization)) ||
        !observation.pressureMoments.every((x) =>
          Number.isFinite(Math.fround(x)),
        ) ||
        !observation.velocityMoments.every((x) =>
          Number.isFinite(Math.fround(x)),
        )
      )
        throw new RangeError("cosine observation exceeds finite Float32 range");
      for (let i = 0; i < shellCount ** 2; i++) {
        momentData[4 * i] = observation.pressureMoments[i];
        momentData[4 * i + 1] = observation.velocityMoments[i];
      }
      norm.value = normalization;
      moments.needsUpdate = true;
    },
    async compile(renderer) {
      for (const p of passes) {
        if (disposed) return;
        await compileRenderPass(renderer, { ...p, camera });
      }
    },
    render(renderer) {
      const previous = renderer.getRenderTarget(),
        clear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        for (const p of passes) {
          renderer.setRenderTarget(p.target);
          renderer.render(p.scene, camera);
        }
      } finally {
        renderer.setRenderTarget(previous);
        renderer.autoClear = clear;
      }
    },
    evaluate({ voxelIndex }) {
      if (apertured)
        throw new Error("filtered fields require evaluateAperture");
      const { physical, color } = readField(voxelIndex);
      return {
        pressureEnergy: physical.x,
        velocityEnergy: physical.y,
        radiationPotential: physical.z,
        totalEnergy: physical.x.add(physical.y),
        spectralSupport: spectralMatrixTexture ? physical.w : null,
        spectralFirstMoment: spectralMatrixTexture ? color.xy : null,
        spectralSecondMoment: spectralMatrixTexture ? color.zw : null,
      };
    },
    evaluateAperture({ voxelIndex }) {
      if (!apertured) throw new Error("raw field has no spatial aperture");
      const cached = readField(voxelIndex);
      // Load once outside the normalization branch: other measurement lanes
      // still read this value when normalization is zero, including on WebGL.
      const physical = cached.physical.toVar(),
        color = cached.color;
      const finePotential = float(0).toVar();
      If(norm.greaterThan(0), () => {
        finePotential.assign(
          physical.x
            .mul(contrast.pressureEnergyWeight)
            .sub(physical.y.mul(contrast.velocityEnergyWeight))
            .div(norm),
        );
      });
      return {
        finePotential,
        fineEnergy: physical.x.add(physical.y),
        fineSupport: spectralMatrixTexture ? physical.w : float(0),
        topologyPotential: physical.z,
        fineSpectralFirstMoment: spectralMatrixTexture ? color.xy : null,
        fineSpectralSecondMoment: spectralMatrixTexture ? color.zw : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const t of textures) t.dispose();
      for (const p of passes) {
        p.target.dispose();
        p.material.dispose();
      }
      quad.dispose();
      octant.dispose();
    },
  };
}
