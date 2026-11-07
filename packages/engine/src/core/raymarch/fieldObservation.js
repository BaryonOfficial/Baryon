import { CAVITY_ACOUSTIC_DEFAULTS } from "../../defaults.js";

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
