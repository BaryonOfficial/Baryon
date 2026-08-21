import { getFloat32Bits } from "../../utils/hash32.js";
import { clamp01 } from "../../utils/math.js";
import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";
import { deriveModalFieldCacheTransferAmplitude } from "./fieldCachePassband.js";

const STRUCTURAL_PROJECTION_EPSILON = 1e-12;

export const MODAL_FIELD_NORMALIZATION_FLOOR = 0.01;
export const STRUCTURAL_PROJECTION_REFERENCE_ENERGY = 0.01;

function readModalFieldCoordinate(slots, offset, componentOffset) {
  const value = slots?.[offset + componentOffset];
  return Math.fround(Number.isFinite(value) ? value : 0);
}

function getCanonicalModalFieldIdentityKey(u, v, w) {
  return `${getFloat32Bits(u)}:${getFloat32Bits(v)}:${getFloat32Bits(w)}`;
}

function collectCanonicalModalFieldTerms(
  identitySlots,
  activeCount,
  modalCoefficientSlots,
) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const entriesByKey = new Map();

  for (let slotIndex = 0; slotIndex < clampedActiveCount; slotIndex += 1) {
    const offset = slotIndex * 3;
    const amplitude = Math.abs(modalCoefficientSlots?.[slotIndex] ?? 0);
    if (!(amplitude > 0)) {
      continue;
    }

    const u = readModalFieldCoordinate(identitySlots, offset, 0);
    const v = readModalFieldCoordinate(identitySlots, offset, 1);
    const w = readModalFieldCoordinate(identitySlots, offset, 2);
    const key = getCanonicalModalFieldIdentityKey(u, v, w);
    const entry = entriesByKey.get(key);
    if (entry) {
      entry.amplitude += amplitude;
    } else {
      entriesByKey.set(key, { u, v, w, amplitude });
    }
  }

  return Array.from(entriesByKey.values());
}

export function deriveLiveSynthesisCancellationRatio(field, unsignedSupport) {
  if (!(unsignedSupport > MODAL_FIELD_NORMALIZATION_FLOOR)) {
    return 0;
  }

  return clamp01(1 - Math.abs(field) / unsignedSupport);
}

export function deriveStructuralProjectionDrive({
  modalIdentitySlots,
  modalCoefficientSlots,
  activeCount,
  referenceEnergy = STRUCTURAL_PROJECTION_REFERENCE_ENERGY,
}) {
  const clampedActiveCount = Math.max(0, Math.round(activeCount || 0));
  const projectionReferenceEnergy =
    Number.isFinite(referenceEnergy) && referenceEnergy > 0
      ? referenceEnergy
      : STRUCTURAL_PROJECTION_REFERENCE_ENERGY;

  if (!modalIdentitySlots || clampedActiveCount <= 0) {
    return {
      amplitudeSum: 0,
      structuralEnergy: 0,
      effectiveModeCount: 0,
      rmsStructuralAmplitude: 0,
      projectionEnergyDrive: 0,
      structuralConcentration: 0,
      rmsSpatialWavenumber: 0,
      observedStructuralEnergy: 0,
      observedRmsSpatialWavenumber: 0,
      resolvedObservationEnergyFraction: 0,
      referenceEnergy: projectionReferenceEnergy,
    };
  }

  let amplitudeSum = 0;
  let structuralEnergy = 0;
  let admittedEnergy = 0;
  let admittedWavenumberEnergy = 0;
  let observedStructuralEnergy = 0;
  let observedWavenumberEnergy = 0;
  const canonicalTerms = collectCanonicalModalFieldTerms(
    modalIdentitySlots,
    clampedActiveCount,
    modalCoefficientSlots,
  );

  for (const term of canonicalTerms) {
    const amplitude = Math.max(0, term.amplitude);
    if (!(amplitude > 0)) {
      continue;
    }

    // Cache representability is already owned by atlas admission. Every term
    // that reaches this projection therefore contributes continuously; this
    // diagnostic must not impose a second spatial cutoff.
    const termEnergy = amplitude * amplitude;
    const spatialWavenumberSquared =
      term.u * term.u + term.v * term.v + term.w * term.w;
    const apertureTransferAmplitude = deriveModalFieldCacheTransferAmplitude(
      Math.sqrt(spatialWavenumberSquared),
    );
    const observedTermEnergy =
      termEnergy * apertureTransferAmplitude * apertureTransferAmplitude;
    admittedEnergy += termEnergy;
    admittedWavenumberEnergy += termEnergy * spatialWavenumberSquared;
    observedStructuralEnergy += observedTermEnergy;
    observedWavenumberEnergy += observedTermEnergy * spatialWavenumberSquared;
    amplitudeSum += amplitude;
    structuralEnergy += termEnergy;
  }

  const hasStructuralEnergy = structuralEnergy > STRUCTURAL_PROJECTION_EPSILON;
  const hasAmplitudeSum = amplitudeSum > STRUCTURAL_PROJECTION_EPSILON;
  const amplitudeSumSquared = amplitudeSum * amplitudeSum;
  const effectiveModeCount =
    hasStructuralEnergy && hasAmplitudeSum
      ? amplitudeSumSquared / structuralEnergy
      : 0;
  const structuralConcentration =
    hasStructuralEnergy && hasAmplitudeSum
      ? clamp01(structuralEnergy / amplitudeSumSquared)
      : 0;
  const rmsStructuralAmplitude = hasStructuralEnergy
    ? Math.sqrt(structuralEnergy / Math.max(effectiveModeCount, 1))
    : 0;
  const projectionEnergyDrive = hasStructuralEnergy
    ? clamp01(structuralEnergy / (structuralEnergy + projectionReferenceEnergy))
    : 0;
  const rmsSpatialWavenumber =
    admittedEnergy > STRUCTURAL_PROJECTION_EPSILON
      ? Math.sqrt(admittedWavenumberEnergy / admittedEnergy)
      : 0;
  const observedRmsSpatialWavenumber =
    observedStructuralEnergy > STRUCTURAL_PROJECTION_EPSILON
      ? Math.sqrt(observedWavenumberEnergy / observedStructuralEnergy)
      : 0;
  const resolvedObservationEnergyFraction =
    admittedEnergy > STRUCTURAL_PROJECTION_EPSILON
      ? clamp01(observedStructuralEnergy / admittedEnergy)
      : 0;

  return {
    amplitudeSum,
    structuralEnergy,
    effectiveModeCount,
    rmsStructuralAmplitude,
    projectionEnergyDrive,
    structuralConcentration,
    rmsSpatialWavenumber,
    observedStructuralEnergy,
    observedRmsSpatialWavenumber,
    resolvedObservationEnergyFraction,
    referenceEnergy: projectionReferenceEnergy,
  };
}

// Structural projection owner end.

const UNAVAILABLE_RADIATION_MATERIAL_CONTRAST = Object.freeze({
  pressureEnergyWeight: 0,
  velocityEnergyWeight: 0,
  semantic: "unavailable-no-material-contrast",
  ready: false,
});

// Default radiation tracer: a subwavelength alpha-quartz sphere suspended in
// 20 C water. The quartz scalar is its orientation-averaged adiabatic bulk
// modulus, not rho*c_L^2: a solid longitudinal wave also carries shear
// stiffness, so treating longitudinal speed as bulk compressibility would
// make the particle spuriously rigid. The Gor'kov monopole contrast
// f1 = 1 − κ_p/κ_0 and dipole contrast
// f2 = 2(rhoRatio − 1)/(2*rhoRatio + 1) weight normalized pressure and
// velocity energies. Particle radius scales only the omitted dimensional
// prefactor, so the carrier remains a normalized potential rather than force.
const RADIATION_TRACER_PROPERTIES = Object.freeze({
  mediumDensityKgPerM3: CAVITY_ACOUSTIC_DEFAULTS.mediumDensityKgPerM3,
  mediumSoundSpeedMetersPerSecond:
    CAVITY_ACOUSTIC_DEFAULTS.soundSpeedMetersPerSecond,
  particleDensityKgPerM3: 2648,
  particleAdiabaticBulkModulusPascal: 37.8e9,
});

export function computeGorkovContrastFactors({
  mediumDensityKgPerM3,
  mediumSoundSpeedMetersPerSecond,
  particleDensityKgPerM3,
  particleAdiabaticBulkModulusPascal,
} = RADIATION_TRACER_PROPERTIES) {
  const mediumStiffness =
    mediumDensityKgPerM3 * mediumSoundSpeedMetersPerSecond ** 2;
  const compressibilityRatio =
    mediumStiffness / particleAdiabaticBulkModulusPascal;
  const densityRatio = particleDensityKgPerM3 / mediumDensityKgPerM3;
  return {
    monopole: 1 - compressibilityRatio,
    dipole: (2 * (densityRatio - 1)) / (2 * densityRatio + 1),
  };
}

const TRACER_CONTRAST = computeGorkovContrastFactors();

export const RAYMARCH_VISUALIZATION_RADIATION_MATERIAL_CONTRAST = Object.freeze(
  {
    pressureEnergyWeight: TRACER_CONTRAST.monopole / 3,
    velocityEnergyWeight: TRACER_CONTRAST.dipole / 2,
    semantic: "gorkov-normalized-alpha-quartz-tracer-in-water",
    ready: true,
  },
);

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clampSignedUnit(value) {
  return Math.max(-1, Math.min(1, readFiniteNumber(value, 0)));
}

function normalizeRadiationMaterialContrast(radiationMaterialContrast) {
  if (
    !radiationMaterialContrast ||
    typeof radiationMaterialContrast !== "object"
  ) {
    return UNAVAILABLE_RADIATION_MATERIAL_CONTRAST;
  }

  const pressureEnergyWeight = Math.max(
    0,
    readFiniteNumber(radiationMaterialContrast.pressureEnergyWeight, 0),
  );
  const velocityEnergyWeight = Math.max(
    0,
    readFiniteNumber(radiationMaterialContrast.velocityEnergyWeight, 0),
  );
  if (!(pressureEnergyWeight > 0 || velocityEnergyWeight > 0)) {
    return UNAVAILABLE_RADIATION_MATERIAL_CONTRAST;
  }

  return {
    pressureEnergyWeight,
    velocityEnergyWeight,
    semantic:
      typeof radiationMaterialContrast.semantic === "string" &&
      radiationMaterialContrast.semantic
        ? radiationMaterialContrast.semantic
        : "normalized-pressure-velocity-material-contrast",
    ready: true,
  };
}

/**
 * The velocity inputs must be the acoustic-velocity-weighted modal gradient
 * sum `Σ c_m ∇Ψ_m / k_m`, not the raw field gradient: linearized Euler gives
 * `v = ∇p / (ρω)` and the cavity dispersion `ω_m = c·k_m`, so each mode's
 * gradient contributes with weight `1/k_m`. The raw gradient over-weights a
 * high-order mode's velocity energy by `k²` and skews the Gor'kov balance.
 */
export function deriveNormalizedPressureRadiationFields({
  normalizedPressure,
  velocityX,
  velocityY,
  velocityZ,
  radiationMaterialContrast = null,
}) {
  const pressure = clampSignedUnit(normalizedPressure);
  const normalizedVelocityProxy = clamp01(
    Math.hypot(
      readFiniteNumber(velocityX, 0),
      readFiniteNumber(velocityY, 0),
      readFiniteNumber(velocityZ, 0),
    ),
  );
  const normalizedPressureEnergy = clamp01(pressure * pressure);
  const normalizedVelocityEnergy = clamp01(
    normalizedVelocityProxy * normalizedVelocityProxy,
  );
  const materialContrast = normalizeRadiationMaterialContrast(
    radiationMaterialContrast,
  );
  const normalizedRadiationPotential = materialContrast.ready
    ? clampSignedUnit(
        normalizedPressureEnergy * materialContrast.pressureEnergyWeight -
          normalizedVelocityEnergy * materialContrast.velocityEnergyWeight,
      )
    : 0;

  return {
    normalizedPressure: pressure,
    normalizedPressureProvenance: "structural-signed-modal-phasor",
    normalizedVelocityProxy,
    normalizedPressureEnergy,
    normalizedVelocityEnergy,
    normalizedRadiationPotential,
    radiationPotentialReady: materialContrast.ready,
    radiationMaterialContrastSemantic: materialContrast.semantic,
    radiationPressureEnergyWeight: materialContrast.pressureEnergyWeight,
    radiationVelocityEnergyWeight: materialContrast.velocityEnergyWeight,
  };
}

// Normalized pressure radiation owner end.
