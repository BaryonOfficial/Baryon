import * as THREE from "three";
import {
  If,
  Loop,
  array,
  dot,
  float,
  int,
  ivec2,
  textureLoad,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { deriveModeFamilyEvaluationScalars } from "../core/modeFamily.js";
import { evaluatePermutationFamilyFieldGradientFromBasisLookupNode } from "../core/modeFamilyNode.js";
import { RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST as contrast } from "../core/raymarch/fieldObservation.js";
import { fixedRenderTargetTextureLoad } from "../core/raymarch/fixedOrientationTextureNode.js";

// Isolated G2 experiment, not a production packet or second state owner.
// Immutable topology folds the existing signed family basis into shell columns.
// Publications replace complete raw moment matrices; reading them advances no
// audio. The only approximation here is Float32 evaluation, not rank reduction.
export function createBroadbandMomentFieldProbe({
  families,
  shellCount,
  boundaryMode = "neumann",
  spectralMatrixTexture = null,
}) {
  if (!["neumann", "dirichlet"].includes(boundaryMode))
    throw new RangeError("unsupported broadband boundary");
  const makeTexture = (data, width, height) => {
    const value = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    value.minFilter = THREE.NearestFilter;
    value.magFilter = THREE.NearestFilter;
    value.generateMipmaps = false;
    value.colorSpace = THREE.NoColorSpace;
    value.needsUpdate = true;
    return value;
  };
  const identityData = new Float32Array(families.length * 4);
  const projectionData = new Float32Array(families.length * 4);
  const weights = new Float64Array(shellCount);
  for (let i = 0; i < families.length; i++) {
    const family = families[i];
    const { u, v, w, shellIndex, sourceAmplitudeOverlap } = family;
    const scalars = deriveModeFamilyEvaluationScalars(u, v, w, boundaryMode);
    identityData.set([u, v, w, shellIndex], i * 4);
    projectionData.set(
      [
        scalars.familyScale * sourceAmplitudeOverlap,
        scalars.threeTermUVMask,
        scalars.threeTermVWMask,
        2 / (Math.PI * Math.hypot(u, v, w)),
      ],
      i * 4,
    );
    weights[shellIndex] += sourceAmplitudeOverlap ** 2;
  }
  const identity = makeTexture(identityData, families.length, 1);
  const projection = makeTexture(projectionData, families.length, 1);
  const momentData = new Float32Array(shellCount * shellCount * 4);
  const moments = makeTexture(momentData, shellCount, shellCount);
  const norm = uniform(0);
  return {
    update(observation) {
      if (
        observation.pressureMoments.length !== shellCount ** 2 ||
        observation.velocityMoments.length !== shellCount ** 2
      )
        throw new RangeError("moment dimensions do not match probe topology");
      let normalization = 0;
      for (let i = 0; i < shellCount; i++)
        normalization +=
          weights[i] *
          (observation.pressureMoments[i * shellCount + i] +
            observation.velocityMoments[i * shellCount + i]);
      if (!Number.isFinite(normalization) || normalization < 0)
        throw new RangeError("invalid probe normalization");
      // Validate the complete upload before mutating a texture's backing data.
      // This also prevents a finite Float64 observation becoming Inf on upload.
      if (!Number.isFinite(Math.fround(normalization)))
        throw new RangeError("probe normalization exceeds Float32 range");
      for (let i = 0; i < shellCount ** 2; i++) {
        const p = observation.pressureMoments[i];
        const v = observation.velocityMoments[i];
        if (
          !Number.isFinite(Math.fround(p)) ||
          !Number.isFinite(Math.fround(v))
        )
          throw new RangeError("probe moment exceeds finite Float32 range");
      }
      for (let i = 0; i < shellCount ** 2; i++) {
        momentData[i * 4] = observation.pressureMoments[i];
        momentData[i * 4 + 1] = observation.velocityMoments[i];
      }
      norm.value = normalization;
      moments.needsUpdate = true;
    },
    // Call inside a TSL Fn stack. All arrays are per spatial sample, not
    // history buffers; changing a view cannot change the uploaded observation.
    evaluate({ voxelIndex, basisLookup }) {
      // r185's runtime preserves array element access through VarNode, while
      // its declarations erase the ArrayNode methods. Keep that typing gap
      // local to the two shader arrays.
      const pressure = /** @type {any} */ (array("float", shellCount).toVar());
      const velocity = /** @type {any} */ (array("vec3", shellCount).toVar());
      const p2 = float(0).toVar();
      const v2 = float(0).toVar();
      const potential = float(0).toVar();
      // Raw additive harmonic evidence, normalized by the same common display
      // scale. Signed color matrices are never treated as PSD acoustic moments.
      const spectral = vec4(0).toVar();
      const secondImaginary = float(0).toVar();
      If(norm.greaterThan(0), () => {
        Loop(shellCount, ({ i }) => {
          pressure.element(i).assign(0);
          velocity.element(i).assign(vec3(0));
        });
        Loop(families.length, ({ i }) => {
          const mode = textureLoad(identity, ivec2(i, 0)).toVar();
          const s = textureLoad(projection, ivec2(i, 0)).toVar();
          const family =
            evaluatePermutationFamilyFieldGradientFromBasisLookupNode({
              u: mode.x,
              v: mode.y,
              w: mode.z,
              voxelIndex,
              scale: float(Math.PI),
              boundaryMode,
              basisLookup,
              familyScalars: {
                familyScale: s.x,
                threeTermUVMask: s.y,
                threeTermVWMask: s.z,
              },
            });
          pressure.element(int(mode.w)).addAssign(family.field);
          velocity.element(int(mode.w)).addAssign(family.gradient.mul(s.w));
        });
        Loop(shellCount, ({ i }) => {
          // Factor the i-side basis out of the triangular row. This preserves
          // every pair and its multiplicity while avoiding repeated i-side
          // array loads and velocity dot products inside the inner loop.
          const rowPressure = float(0).toVar();
          const rowVelocity = vec3(0).toVar();
          const pi = pressure.element(i).toVar();
          const vi = velocity.element(i).toVar();
          const diagonal = textureLoad(moments, ivec2(i, i)).toVar();
          // Named nested loops are supported by r185 LoopNode; its types still
          // explicitly leave `name` as a TODO.
          const namedLoop = /** @type {any} */ (Loop);
          namedLoop(
            { start: int(i).add(1), end: int(shellCount), name: "j" },
            ({ j }) => {
              const c = textureLoad(moments, ivec2(j, i)).toVar();
              rowPressure.addAssign(c.x.mul(pressure.element(j)));
              rowVelocity.addAssign(c.y.mul(velocity.element(j)));
            },
          );
          // Off-diagonal pairs occur twice in a symmetric quadratic form.
          // Apply that factor once per row rather than once per inner pair.
          p2.addAssign(
            pi
              .mul(rowPressure)
              .mul(2)
              .add(diagonal.x.mul(pi.mul(pi))),
          );
          v2.addAssign(
            dot(vi, rowVelocity)
              .mul(2)
              .add(diagonal.y.mul(dot(vi, vi))),
          );
          if (spectralMatrixTexture) {
            namedLoop(
              { start: int(i), end: int(shellCount), name: "colorJ" },
              ({ colorJ: j }) => {
                const p = pi
                  .mul(pressure.element(j))
                  .mul(contrast.pressureEnergyWeight)
                  .toVar();
                const v = dot(vi, velocity.element(j))
                  .mul(contrast.velocityEnergyWeight)
                  .toVar();
                const multiplicity = i.equal(j).select(float(1), float(2));
                const cp = fixedRenderTargetTextureLoad(
                  spectralMatrixTexture,
                  ivec2(j, i),
                );
                const cv = fixedRenderTargetTextureLoad(
                  spectralMatrixTexture,
                  ivec2(j, i.add(shellCount)),
                );
                const imaginary = fixedRenderTargetTextureLoad(
                  spectralMatrixTexture,
                  ivec2(j, i.add(2 * shellCount)),
                );
                spectral.addAssign(cp.mul(p).add(cv.mul(v)).mul(multiplicity));
                secondImaginary.addAssign(
                  imaginary.x.mul(p).add(imaginary.y.mul(v)).mul(multiplicity),
                );
              },
            );
          }
        });
        potential.assign(
          p2
            .mul(contrast.pressureEnergyWeight)
            .sub(v2.mul(contrast.velocityEnergyWeight))
            .div(norm),
        );
        if (spectralMatrixTexture) {
          spectral.divAssign(norm);
          secondImaginary.divAssign(norm);
        }
      });
      return {
        radiationPotential: potential,
        pressureEnergy: p2,
        velocityEnergy: v2,
        totalEnergy: p2.add(v2),
        spectralSupport: spectralMatrixTexture ? spectral.x : null,
        spectralFirstMoment: spectralMatrixTexture ? spectral.yz : null,
        spectralSecondMoment: spectralMatrixTexture
          ? vec2(spectral.w, secondImaginary)
          : null,
      };
    },
    dispose() {
      identity.dispose();
      projection.dispose();
      moments.dispose();
    },
  };
}
