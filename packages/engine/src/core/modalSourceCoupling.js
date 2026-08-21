import { clamp01 } from "../utils/math.js";
import {
  BOUNDARY_MODES,
  getUniquePermutationCount,
  normalizeBoundaryMode,
} from "./modeFamily.js";

/**
 * Declared acoustic source for the reference apparatus.
 *
 * Mono audio contains no measured source geometry, so the geometry has to
 * belong to the apparatus rather than be inferred from the signal. Baryon
 * declares one compact centered Gaussian drive plus a uniform compensating
 * return. Its volume integral is exactly zero, which is the compatibility
 * condition for a sealed rigid cavity: a source cannot inject net volume into
 * an incompressible closed domain. The return has zero overlap with every
 * non-constant Neumann mode, so it preserves the centered source's supported
 * modal symmetries while correctly removing the forbidden constant mode.
 */
export const DEFAULT_MODAL_SOURCE_PROFILE = Object.freeze({
  kind: "gaussian-volume",
  // FWHM is about 0.00235 of the normalized half-side. This compact reference
  // footprint keeps the apparatus source finite without asking an unmeasured
  // transducer width to erase legitimate high-order modal response. Its
  // Gaussian overlap supplies the asymptotic spatial low-pass required by a
  // finite source; resolved-band washout belongs to the observation model.
  standardDeviationNormalized: 0.001,
  normalization: "zero-mean-unit-core-integral",
  centerNormalized: Object.freeze([0, 0, 0]),
  semantic: "centered-zero-mean-gaussian-drive-in-cubical-cavity",
});

function normalizeGaussianSourceProfile(sourceProfile) {
  if (
    sourceProfile?.kind !== "gaussian-volume" ||
    sourceProfile?.normalization !== "zero-mean-unit-core-integral"
  ) {
    throw new TypeError(
      "Modal source profile must be a zero-mean-unit-core-integral gaussian-volume source",
    );
  }
  const standardDeviationNormalized =
    sourceProfile.standardDeviationNormalized;
  if (
    !Number.isFinite(standardDeviationNormalized) ||
    standardDeviationNormalized <= 0 ||
    standardDeviationNormalized > 2
  ) {
    throw new TypeError(
      "Modal source standardDeviationNormalized must be in (0, 2]",
    );
  }
  const center = sourceProfile.centerNormalized;
  if (
    !Array.isArray(center) ||
    center.length !== 3 ||
    center.some((coordinate) => coordinate !== 0)
  ) {
    throw new TypeError(
      "The declared modal source must remain centered at normalized [0, 0, 0]",
    );
  }

  return { standardDeviationNormalized };
}

function uniformAxisBasisAverage(index, boundaryMode) {
  const normalizedIndex = Math.max(0, Math.round(index));
  if (normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.neumann) {
    return normalizedIndex === 0 ? 1 : 0;
  }
  if (normalizedIndex === 0 || normalizedIndex % 2 === 0) {
    return 0;
  }
  return (2 * Math.SQRT2) / (normalizedIndex * Math.PI);
}

function centeredAxisBasisValue(index, boundaryMode) {
  const normalizedIndex = Math.max(0, Math.round(index));
  if (normalizeBoundaryMode(boundaryMode) === BOUNDARY_MODES.dirichlet) {
    if (normalizedIndex % 2 === 0) {
      return 0;
    }
    return (
      Math.SQRT2 * (normalizedIndex % 4 === 1 ? 1 : -1)
    );
  }

  if (normalizedIndex === 0) {
    return 1;
  }
  if (normalizedIndex % 2 !== 0) {
    return 0;
  }
  return Math.SQRT2 * (normalizedIndex % 4 === 0 ? 1 : -1);
}

/**
 * Generalized-force coupling of the centered finite monopole to one normalized
 * rectangular-cavity permutation family.
 *
 * The compact unit-integral core overlaps axis mode n by
 * `B_n(x₀)·exp(-(kₙσ)²/2)`. The uniform unit-integral return is subtracted
 * analytically. At the cavity centre, the rigid-wall Neumann selection rule is
 * exact: every axis order must be even. Any odd order places the core on a
 * nodal plane and receives zero generalized force; the return is orthogonal to
 * every non-constant Neumann eigenfunction.
 *
 * Every unique permutation has the same value at the centre. Their normalized
 * coherent family sum therefore contributes `sqrt(N)` times the axis product,
 * where N is the unique permutation count. The returned signed
 * `generalizedForce` retains that absolute normalized-basis overlap and source
 * phase. The bounded `couplingAmplitude` is the finite-contact transfer
 * conditional on support, normalized to the same family's centre antinode.
 * Keeping these separate prevents the family-degeneracy factor from being
 * counted again by the engine's already family-normalized modal-energy state.
 */
export function computeRectangularModalSourceCoupling({
  u,
  v,
  w,
  boundaryMode = BOUNDARY_MODES.neumann,
  sourceProfile = DEFAULT_MODAL_SOURCE_PROFILE,
}) {
  const { standardDeviationNormalized } =
    normalizeGaussianSourceProfile(sourceProfile);
  const centeredFamilyValue =
    Math.sqrt(getUniquePermutationCount(u, v, w)) *
    centeredAxisBasisValue(u, boundaryMode) *
    centeredAxisBasisValue(v, boundaryMode) *
    centeredAxisBasisValue(w, boundaryMode);
  const uniformFamilyValue =
    Math.sqrt(getUniquePermutationCount(u, v, w)) *
    uniformAxisBasisAverage(u, boundaryMode) *
    uniformAxisBasisAverage(v, boundaryMode) *
    uniformAxisBasisAverage(w, boundaryMode);
  const modeMagnitude = Math.sqrt(u * u + v * v + w * w);
  const contactPhase =
    standardDeviationNormalized * Math.PI * 0.5 * modeMagnitude;
  const finiteSourceTransfer = Math.exp(
    -0.5 * contactPhase * contactPhase,
  );
  const rawGeneralizedForce =
    centeredFamilyValue * finiteSourceTransfer - uniformFamilyValue;
  const sourceSupported = Math.abs(rawGeneralizedForce) > Number.EPSILON;
  const generalizedForce = sourceSupported ? rawGeneralizedForce : 0;
  const couplingAmplitude = sourceSupported
    ? clamp01(
        Math.abs(generalizedForce) /
          Math.max(Math.abs(centeredFamilyValue), Number.EPSILON),
      )
    : 0;

  return {
    generalizedForce,
    couplingAmplitude,
    couplingEnergy: clamp01(couplingAmplitude * couplingAmplitude),
    sourceSupported,
  };
}

export function buildModalSourceProfileCacheKey(
  sourceProfile = DEFAULT_MODAL_SOURCE_PROFILE,
) {
  const { standardDeviationNormalized } =
    normalizeGaussianSourceProfile(sourceProfile);
  return [
    sourceProfile.kind,
    sourceProfile.normalization,
    sourceProfile.semantic,
    sourceProfile.centerNormalized.join(","),
    standardDeviationNormalized,
  ].join(":");
}
