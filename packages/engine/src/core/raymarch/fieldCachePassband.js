import { clamp, clamp01 } from "../../utils/math.js";

/**
 * Spatial wavenumber (mode-index units) below which the 128-cubed cache
 * representation remains unattenuated.
 */
export const FIELD_CACHE_PASSBAND_REFERENCE_WAVENUMBER = 8;

/**
 * Standard deviation of the numerical cache reconstruction rolloff on the
 * normalized basis domain [-1, 1]. This is a representation property,
 * independent of source geometry, tracer physics, and display quality tier.
 */
export const FIELD_CACHE_PASSBAND_ROLLOFF_STANDARD_DEVIATION_NORMALIZED = 0.035;

/**
 * Mode index to normalized angular spatial wavenumber. A mode of index n
 * carries n half-wavelengths across the basis domain [-1, 1], so its
 * wavelength is 4/n and k_n = n*pi/2. The field cache reconstruction prefilter
 * and the modal source coupling both convert with this same factor; the
 * The previous passband used pi per index, which made its exponent four times
 * too strong and left sigma absorbing the error as hand tuning.
 */
const BASIS_ANGULAR_WAVENUMBER_PER_INDEX = Math.PI * 0.5;

/**
 * Numerical passband boundary for ray integration. A mode transferred below
 * one quarter of its reference amplitude is still present in the cached
 * field, but it no longer owns the minimum spatial sampling budget. This is a
 * -12 dB amplitude cutoff on the already-applied cache prefilter, not a
 * physical aperture attenuation or a second modal admission threshold.
 */
export const FIELD_CACHE_PASSBAND_MIN_TRANSFER_AMPLITUDE = 0.25;

/**
 * Numerical support boundary for spatial modal topology. Below one percent
 * amplitude (-40 dB) the numerical cache prefilter has removed the mode from
 * the represented field to the accuracy the cache is designed to retain.
 * The acoustic mode still exists; it remains available to audio-only spectral
 * evidence, but it must not be instantiated as a spatial mode triple.
 */
export const FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE = 0.01;

function readFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Relative modulation transfer of the numerical field-cache prefilter.
 *
 * Rectangular cavity modes have normalized angular spatial wavenumber πk/2.
 * The Gaussian reconstruction prefilter therefore transfers amplitude by
 * exp(-0.5 (π σ k / 2)^2). The optical calibration is referenced at the existing
 * carrier wavenumber, so lower-order content remains exactly unchanged while
 * shorter-wavelength structure rolls off continuously instead of collapsing
 * into an unresolved emissive wash.
 */
export function deriveModalFieldCacheTransferAmplitude(spatialWavenumber) {
  const safeWavenumber = readFinite(spatialWavenumber, 0);
  if (!(safeWavenumber > FIELD_CACHE_PASSBAND_REFERENCE_WAVENUMBER)) {
    return 1;
  }
  const referenceWavenumberSquared =
    FIELD_CACHE_PASSBAND_REFERENCE_WAVENUMBER ** 2;
  const excessWavenumberSquared = Math.max(
    0,
    safeWavenumber * safeWavenumber - referenceWavenumberSquared,
  );
  const passbandAngularSigma =
    BASIS_ANGULAR_WAVENUMBER_PER_INDEX *
    FIELD_CACHE_PASSBAND_ROLLOFF_STANDARD_DEVIATION_NORMALIZED;
  return clamp01(
    Math.exp(
      -0.5 *
        passbandAngularSigma *
        passbandAngularSigma *
        excessWavenumberSquared,
    ),
  );
}

/**
 * Solve the numerical passband transfer for the largest spatial wavenumber
 * that remains materially represented by the field cache. The transfer is
 * referenced at the calibrated carrier wavenumber, so
 *
 *   H(k) = exp(-0.5 (πσ/2)^2 (k² - k_ref²)).
 *
 * Inverting H at the numerical passband boundary keeps the render sampler
 * derived from the same observation model that shapes the field.
 */
export function deriveFieldCachePassbandMaxResolvedWavenumber(
  minTransferAmplitude = FIELD_CACHE_PASSBAND_MIN_TRANSFER_AMPLITUDE,
) {
  const safeTransferAmplitude = clamp(
    readFinite(
      minTransferAmplitude,
      FIELD_CACHE_PASSBAND_MIN_TRANSFER_AMPLITUDE,
    ),
    Number.EPSILON,
    1,
  );
  const passbandAngularSigma =
    BASIS_ANGULAR_WAVENUMBER_PER_INDEX *
    FIELD_CACHE_PASSBAND_ROLLOFF_STANDARD_DEVIATION_NORMALIZED;
  const excessWavenumberSquared =
    (-2 * Math.log(safeTransferAmplitude)) /
    (passbandAngularSigma * passbandAngularSigma);
  return Math.sqrt(
    FIELD_CACHE_PASSBAND_REFERENCE_WAVENUMBER ** 2 + excessWavenumberSquared,
  );
}

/**
 * Map the fixed numerical cache passband onto a declared acoustic
 * apparatus.
 *
 * Rectangular cavity modes obey f_n = c|n|/(2L). The 128-cubed cache owns the
 * supported modal wavenumber range; side length and sound speed map that range
 * into Hz. The visible edge is its -12 dB numerical passband. The -40 dB tail
 * is the spatial-admission boundary. Frequencies above that tail remain valid
 * audio evidence, but cannot own cached rendered topology.
 */
export function deriveCavityModalFieldCacheBandwidth({
  sideLengthMeters,
  soundSpeedMetersPerSecond,
  boundaryMode = "neumann",
  visibleTransferAmplitude = FIELD_CACHE_PASSBAND_MIN_TRANSFER_AMPLITUDE,
  tailTransferAmplitude = FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE,
}) {
  const safeSideLengthMeters = readFinite(sideLengthMeters, 0);
  const safeSoundSpeedMetersPerSecond = readFinite(
    soundSpeedMetersPerSecond,
    0,
  );
  const frequencyScaleHz =
    safeSideLengthMeters > 0 && safeSoundSpeedMetersPerSecond > 0
      ? safeSoundSpeedMetersPerSecond / (2 * safeSideLengthMeters)
      : 0;
  // The declared centered finite monopole adds a source-selection boundary on
  // top of the cavity spectrum. Dirichlet modes must be odd on every axis, so
  // (1,1,1) remains the floor. A centered rigid-wall Neumann source is zero on
  // every family containing an odd axis order, making (0,0,2) the first driven
  // family rather than the undriven mathematical eigenmode (0,0,1).
  const minimumModeWavenumber =
    boundaryMode === "dirichlet" ? Math.sqrt(3) : 2;
  const visibleMaxWavenumber = deriveFieldCachePassbandMaxResolvedWavenumber(
    visibleTransferAmplitude,
  );
  const tailMaxWavenumber = deriveFieldCachePassbandMaxResolvedWavenumber(
    tailTransferAmplitude,
  );

  return {
    frequencyScaleHz,
    minimumModeWavenumber,
    minimumModeFrequencyHz: frequencyScaleHz * minimumModeWavenumber,
    visibleMaxWavenumber,
    visibleMaxFrequencyHz: frequencyScaleHz * visibleMaxWavenumber,
    tailMaxWavenumber,
    tailMaxFrequencyHz: frequencyScaleHz * tailMaxWavenumber,
    visibleTransferAmplitude: clamp(
      readFinite(
        visibleTransferAmplitude,
        FIELD_CACHE_PASSBAND_MIN_TRANSFER_AMPLITUDE,
      ),
      Number.EPSILON,
      1,
    ),
    tailTransferAmplitude: clamp(
      readFinite(
        tailTransferAmplitude,
        FIELD_CACHE_PASSBAND_TAIL_TRANSFER_AMPLITUDE,
      ),
      Number.EPSILON,
      1,
    ),
  };
}
