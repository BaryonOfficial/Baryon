import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAIN_HALF_EXTENT,
  FIELD_CACHE_RESOLUTION,
} from "./fieldCacheGeometry.js";
import {
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS as fineOffsets,
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS as topologyOffsets,
  CYMATIC_OBSERVER_REFERENCE,
  deriveCymaticObserverApertureKernel,
} from "./cymaticObserverReference.js";

/**
 * Finite, clamp-extended spatial measurement of each cosine basis function.
 * These are dimensionless lookup weights, not new acoustic modes. Filtering
 * each tensor factor distributes over the complete quadratic field sum. This
 * does not commute the aperture through gradients, distances or persistence.
 * null radius requests the unfiltered basis for the raw-field reference lane.
 */
export function writeBroadbandApertureBasis(data, width, radius = null) {
  const half = FIELD_CACHE_RESOLUTION / 2;
  if (!Number.isInteger(width) || width < 1 || data.length !== width * half * 4)
    throw new RangeError("cosine basis dimensions do not match the cache");
  if (radius !== null && (!Number.isFinite(radius) || radius <= 0))
    throw new RangeError("aperture radius must be finite and positive");
  const kernels =
    radius === null
      ? [
          { offsets: [0], weights: [1] },
          { offsets: [0], weights: [1] },
        ]
      : [
          {
            offsets: fineOffsets,
            fwhm: CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
          },
          {
            offsets: topologyOffsets,
            fwhm: CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
          },
        ].map(({ offsets, fwhm }) => ({
          offsets,
          weights: deriveCymaticObserverApertureKernel(
            radius * FIELD_CACHE_CELL_SIZE,
            fwhm,
            offsets,
          ).weights,
        }));
  data.fill(0);
  for (let i = 0; i < half; i++)
    for (let q = 0; q < width; q++)
      for (let lane = 0; lane < kernels.length; lane++) {
        const { offsets, weights } = kernels[lane];
        let value = 0;
        for (let tap = 0; tap < offsets.length; tap++) {
          const voxel = Math.max(
            0,
            Math.min(FIELD_CACHE_RESOLUTION - 1, i + half + offsets[tap]),
          );
          const coordinate =
            (voxel + 0.5) * FIELD_CACHE_CELL_SIZE -
            FIELD_CACHE_DOMAIN_HALF_EXTENT;
          value += weights[tap] * Math.cos(q * Math.PI * (coordinate + 1));
        }
        data[4 * (i * width + q) + lane] = value;
      }
  return data;
}
// Finite aperture basis owner end.
