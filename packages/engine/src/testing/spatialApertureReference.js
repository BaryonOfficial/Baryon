import { createFieldCacheDomainGeometry } from "../core/raymarch/fieldCacheDomainGeometry.js";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { Fn, dot, exp, float, mrt, struct, vec3, vec4 } from "three/tsl";
import { normalizeBoundaryMode } from "../core/modeFamily.js";
import { VOLUME_SHAPES, normalizeVolumeShape } from "../core/volumeShape.js";
import {
  FIELD_CACHE_ATLAS_WIDTH,
  FIELD_CACHE_ATLAS_HEIGHT,
  FIELD_CACHE_BAKE_GATE_HALF_EXTENT,
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
} from "../core/raymarch/fieldCacheGeometry.js";
import {
  deriveFieldCacheFragmentVoxelIndexNode,
  toFieldCacheVoxelPositionNode,
  toSparseFieldCacheAtlasTexelNode,
} from "../core/raymarch/fieldCacheSampling.js";
import { fixedRenderTargetTextureLoad } from "../core/raymarch/fixedOrientationTextureNode.js";
import {
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_REFERENCE,
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
} from "../core/raymarch/cymaticObserverReference.js";

// Test-only finite spatial reference retired from production.
// Shader arithmetic retained from fieldCacheBake.js SHA256 707041d20f1acae8b22133d3d5d39ef075c82892754214250f499cfaa2a0a0b3.
// Concrete consumers: synthetic observer fixtures and cosine aperture equivalence.

export const REFERENCE_APERTURE_PASSES = Object.freeze([
  Object.freeze({
    direction: Object.freeze([1, 0, 0]),
    inputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
    outputDomain: FIELD_CACHE_DOMAINS.halfYz,
  }),
  Object.freeze({
    direction: Object.freeze([0, 1, 0]),
    inputDomain: FIELD_CACHE_DOMAINS.halfYz,
    outputDomain: FIELD_CACHE_DOMAINS.halfXy,
  }),
  Object.freeze({
    direction: Object.freeze([0, 0, 1]),
    inputDomain: FIELD_CACHE_DOMAINS.halfXy,
    outputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
  }),
]);

const SourceFieldCachePayload = struct(
  { field: "vec4", spectral: "vec4" },
  "BaryonSourceFieldCachePayload",
);
/**
 * Zero the mode loop outside the region any ray can reach, plus the stencil
 * slack. Exact rather than approximate: those voxels are neither sampled nor
 * read, so not evaluating them changes nothing but the bill.
 */
function deriveBakeGateNode(position, volumeShape) {
  const gate = float(FIELD_CACHE_BAKE_GATE_HALF_EXTENT);
  if (normalizeVolumeShape(volumeShape) === VOLUME_SHAPES.cube) {
    return position.abs().greaterThan(gate).any().select(float(0), float(1));
  }
  return dot(position, position)
    .greaterThan(gate.mul(gate))
    .select(float(0), float(1));
}

/**
 * @typedef {import("three/webgpu").MeshBasicNodeMaterial & {
 *   raymarchBoundaryMode?: string,
 *   raymarchVolumeShape?: string,
 * }} FieldCacheBakeMaterial
 */

function createReferenceFieldBakeMaterial({
  boundaryMode,
  volumeShape,
  evaluateSourceField,
}) {
  const material = /** @type {FieldCacheBakeMaterial} */ (
    new MeshBasicNodeMaterial()
  );
  material.name = "BaryonFieldCacheBakeMaterial";
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;

  // The whole payload is built inside one function body. A TSL Loop and its
  // accumulators only exist on a function stack — assembled at material
  // construction time they are silently dropped, leaving a shader that writes
  // its initial values and costs nothing.
  const payload = Fn(() => {
    const voxelIndex = deriveFieldCacheFragmentVoxelIndexNode();
    const position = toFieldCacheVoxelPositionNode(voxelIndex);
    const observed = evaluateSourceField({
      voxelIndex,
      domainMask: deriveBakeGateNode(position, volumeShape),
      boundaryMode,
    });

    const spectral = observed.spectralFirstMoment
      ? vec4(observed.spectralFirstMoment, observed.spectralSecondMoment)
      : vec4(0, 0, 0, 0);

    // Lane x carries the fine-aperture potential, lane y carries the
    // cycle-averaged energy used by local radiance, and lane w feeds the wider
    // topology aperture. No component-ranking statistic participates in the
    // observation.
    return SourceFieldCachePayload(
      vec4(
        observed.radiationPotential,
        observed.totalEnergy,
        observed.spectralSupport ?? float(0),
        observed.radiationPotential,
      ),
      spectral,
    );
  })();

  // Struct members are untyped at the node level; both lanes are vec4 by
  // construction above.
  const fieldLane = /** @type {any} */ (payload.get("field"));
  material.colorNode = fieldLane;
  material.mrtNode = mrt({
    output: fieldLane,
    spectral: payload.get("spectral"),
  });
  material.raymarchBoundaryMode = normalizeBoundaryMode(boundaryMode);
  material.raymarchVolumeShape = normalizeVolumeShape(volumeShape);
  return material;
}

function createApertureKernelWeightNode(radius, apertureFwhmWorld, offset) {
  const sigmaWorld = float(apertureFwhmWorld / (2 * Math.sqrt(2 * Math.LN2)));
  const offsetWorld = radius
    .mul(float(FIELD_CACHE_CELL_SIZE))
    .mul(float(offset));
  return exp(
    offsetWorld.mul(offsetWorld).div(sigmaWorld.mul(sigmaWorld).mul(-2)),
  );
}

/**
 * Gaussian aperture weights vary with apparatus radius but never with voxel.
 * Evaluate the ten non-negative half-kernel entries in the vertex stage and carry
 * three packed constants across the full-screen pass. The fragment stage keeps
 * the original accumulation and normalization order, so this removes repeated
 * transcendental work without changing the fixed world-space aperture.
 */
function createApertureKernelWeightNodes(radius) {
  const topology = Array.from({ length: 7 }, (_, offset) =>
    createApertureKernelWeightNode(
      radius,
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
      offset,
    ),
  );
  const fine = Array.from({ length: 3 }, (_, offset) =>
    createApertureKernelWeightNode(
      radius,
      CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
      offset,
    ),
  );
  const topologyTotal =
    CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS.reduce(
      (total, offset) => total.add(topology[Math.abs(offset)]),
      float(0),
    );
  const fineTotal = CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS.reduce(
    (total, offset) => total.add(fine[Math.abs(offset)]),
    float(0),
  );
  const packedA = vec4(
    topology[0],
    topology[1],
    topology[2],
    topology[3],
  ).toVertexStage();
  const packedB = vec4(
    topology[4],
    topology[5],
    topology[6],
    fine[0],
  ).toVertexStage();
  const packedC = vec4(
    fine[1],
    fine[2],
    topologyTotal,
    fineTotal,
  ).toVertexStage();

  return {
    topology: [
      packedA.x,
      packedA.y,
      packedA.z,
      packedA.w,
      packedB.x,
      packedB.y,
      packedB.z,
    ],
    fine: [packedB.w, packedC.x, packedC.y],
    topologyTotal: packedC.z,
    fineTotal: packedC.w,
  };
}

/**
 * Apply the instrument's fixed world-space resolving aperture while carrying
 * permutation symmetry through the smallest exact stored domain at each axis.
 */
export function createFieldCacheApertureMaterial({
  sourceField,
  sourceSpectral,
  radius,
  direction,
  inputDomain,
}) {
  const material = new MeshBasicNodeMaterial();
  const axis = direction.findIndex((component) => component !== 0);
  material.name = `BaryonFieldCacheAperture${"XYZ"[axis]}Material`;
  material.lights = false;
  material.depthTest = false;
  material.depthWrite = false;
  const apertureWeights = createApertureKernelWeightNodes(radius);

  const payload = Fn(() => {
    const voxelIndex = deriveFieldCacheFragmentVoxelIndexNode();
    const directionNode = vec3(...direction);
    const fineFieldSum = vec3(0).toVar();
    const topologyPotentialSum = float(0).toVar();
    const spectralMomentSum = vec4(0).toVar();
    const accumulateFine = (field, spectral, weight) => {
      fineFieldSum.addAssign(field.xyz.mul(weight));
      spectralMomentSum.addAssign(spectral.mul(weight));
    };

    for (const offset of CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS) {
      const sourceTexel = toSparseFieldCacheAtlasTexelNode(
        voxelIndex.add(directionNode.mul(float(offset))),
        inputDomain,
      ).toVar();
      const field = fixedRenderTargetTextureLoad(sourceField, sourceTexel);
      const topologyWeight = apertureWeights.topology[Math.abs(offset)];
      topologyPotentialSum.addAssign(field.w.mul(topologyWeight));

      if (CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS.includes(offset)) {
        const fineWeight = apertureWeights.fine[Math.abs(offset)];
        accumulateFine(
          field,
          fixedRenderTargetTextureLoad(sourceSpectral, sourceTexel),
          fineWeight,
        );
      }
    }

    const filteredFineField = fineFieldSum.div(apertureWeights.fineTotal);
    const filteredTopologyPotential = topologyPotentialSum.div(
      apertureWeights.topologyTotal,
    );
    return SourceFieldCachePayload(
      vec4(filteredFineField, filteredTopologyPotential),
      spectralMomentSum.div(apertureWeights.fineTotal),
    );
  })();

  const fieldLane = /** @type {any} */ (payload.get("field"));
  material.colorNode = fieldLane;
  material.mrtNode = mrt({
    output: fieldLane,
    spectral: payload.get("spectral"),
  });
  return material;
}

/** Test-only raw-field adapter. The production cache accepts filtered fields. */
export function createReferenceApertureField({ radius, evaluateSourceField }) {
  const targets = Array.from({ length: 2 }, () => {
    const target = new THREE.RenderTarget(
      FIELD_CACHE_ATLAS_WIDTH,
      FIELD_CACHE_ATLAS_HEIGHT,
      {
        type: THREE.FloatType,
        count: 2,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      },
    );
    target.textures.forEach((texture, i) => {
      texture.name = i === 0 ? "output" : "spectral";
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
    });
    return target;
  });
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
  const sourceMaterials = new Map();
  const passes = REFERENCE_APERTURE_PASSES.map((pass, i) => ({
    ...pass,
    output: targets[(i + 1) % 2],
    material: createFieldCacheApertureMaterial({
      sourceField: targets[i % 2].textures[0],
      sourceSpectral: targets[i % 2].textures[1],
      radius,
      direction: pass.direction,
      inputDomain: pass.inputDomain,
    }),
  }));
  return {
    prepare(renderer, { boundaryMode, volumeShape }) {
      const key = `${boundaryMode}:${volumeShape}`;
      if (!sourceMaterials.has(key))
        sourceMaterials.set(
          key,
          createReferenceFieldBakeMaterial({
            boundaryMode,
            volumeShape,
            evaluateSourceField,
          }),
        );
      const previous = renderer.getRenderTarget(),
        autoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        mesh.geometry = geometry.get(FIELD_CACHE_DOMAINS.fundamentalXyz);
        mesh.material = sourceMaterials.get(key);
        renderer.setRenderTarget(targets[0]);
        renderer.render(scene, camera);
        for (const pass of passes) {
          mesh.geometry = geometry.get(pass.outputDomain);
          mesh.material = pass.material;
          renderer.setRenderTarget(pass.output);
          renderer.render(scene, camera);
        }
      } finally {
        renderer.setRenderTarget(previous);
        renderer.autoClear = autoClear;
      }
    },
    evaluateAperture({ voxelIndex }) {
      const texel = toSparseFieldCacheAtlasTexelNode(
        voxelIndex,
        FIELD_CACHE_DOMAINS.fundamentalXyz,
      );
      const field = fixedRenderTargetTextureLoad(targets[1].textures[0], texel);
      const spectral = fixedRenderTargetTextureLoad(
        targets[1].textures[1],
        texel,
      );
      return {
        finePotential: field.x,
        fineEnergy: field.y,
        fineSupport: field.z,
        topologyPotential: field.w,
        fineSpectralFirstMoment: spectral.xy,
        fineSpectralSecondMoment: spectral.zw,
      };
    },
    dispose() {
      targets.forEach((target) => target.dispose());
      geometry.forEach((g) => g.dispose());
      sourceMaterials.forEach((material) => material.dispose());
      passes.forEach((pass) => pass.material.dispose());
    },
  };
}
