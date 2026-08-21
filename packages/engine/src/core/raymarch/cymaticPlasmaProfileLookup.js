import * as THREE from "three";
import { abs, float, min, sqrt, vec2 } from "three/tsl";
import {
  CYMATIC_OBSERVER_REFERENCE,
  derivePeakNormalizedGaussianIntervalAverage,
} from "./cymaticObserverReference.js";
import { fixedDataTexture } from "./fixedOrientationTextureNode.js";

export const CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH = 1024;
export const CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT = 512;
export const CYMATIC_PLASMA_PROFILE_TAIL_EPSILON = 1e-8;

const PROFILE_CHANNEL_FWHM_WORLD = Object.freeze([
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.spineWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.coreWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio,
]);
const MAXIMUM_PROFILE_FWHM_WORLD = Math.max(...PROFILE_CHANNEL_FWHM_WORLD);
const PROFILE_TAIL_FWHM_MULTIPLE = Math.sqrt(
  Math.log(1 / CYMATIC_PLASMA_PROFILE_TAIL_EPSILON) / (4 * Math.log(2)),
);

// Runtime radii are normally stable, so retain only the most recently built
// CPU table for remounts at the same radius. Unlike the former Map, this has a
// fixed four-megabyte upper bound even if an operator visits many radii.
let mostRecentLookupData = null;

function normalizeMaximumIntervalWidthWorld(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("maximumIntervalWidthWorld must be positive");
  }
  return value;
}

function resolveMaximumSignedDistanceWorld(maximumIntervalWidthWorld) {
  // Past the widest interval edge, even the broadest fixed Gaussian is below
  // the declared presentation-cache tolerance. This gives the finite texture
  // domain a physical error contract instead of an arbitrary world margin.
  return (
    maximumIntervalWidthWorld * 0.5 +
    MAXIMUM_PROFILE_FWHM_WORLD * PROFILE_TAIL_FWHM_MULTIPLE
  );
}

function resolveProfileSupportDistanceWorld(intervalWidthWorld) {
  return (
    Math.max(0, intervalWidthWorld) * 0.5 +
    MAXIMUM_PROFILE_FWHM_WORLD * PROFILE_TAIL_FWHM_MULTIPLE
  );
}

function buildLookupData({
  maximumIntervalWidthWorld,
  maximumSignedDistanceWorld,
}) {
  if (
    mostRecentLookupData?.maximumIntervalWidthWorld ===
      maximumIntervalWidthWorld &&
    mostRecentLookupData?.maximumSignedDistanceWorld ===
      maximumSignedDistanceWorld
  ) {
    return mostRecentLookupData.data;
  }

  const data = new Uint16Array(
    CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH *
      CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT *
      4,
  );
  for (
    let intervalIndex = 0;
    intervalIndex < CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT;
    intervalIndex += 1
  ) {
    const normalizedInterval =
      intervalIndex / (CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT - 1);
    const intervalWidthWorld =
      maximumIntervalWidthWorld * normalizedInterval * normalizedInterval;
    for (
      let distanceIndex = 0;
      distanceIndex < CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH;
      distanceIndex += 1
    ) {
      const normalizedDistance =
        distanceIndex / (CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH - 1);
      const signedDistanceWorld =
        maximumSignedDistanceWorld * normalizedDistance * normalizedDistance;
      const texelOffset =
        (intervalIndex * CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH + distanceIndex) *
        4;
      if (
        signedDistanceWorld >
        resolveProfileSupportDistanceWorld(intervalWidthWorld)
      ) {
        continue;
      }
      PROFILE_CHANNEL_FWHM_WORLD.forEach((fwhmWorld, channel) => {
        data[texelOffset + channel] = THREE.DataUtils.toHalfFloat(
          derivePeakNormalizedGaussianIntervalAverage({
            signedDistanceWorld,
            intervalWidthWorld,
            fwhmWorld,
          }),
        );
      });
    }
  }

  mostRecentLookupData = {
    maximumIntervalWidthWorld,
    maximumSignedDistanceWorld,
    data,
  };
  return data;
}

/**
 * Cache the four apparatus-fixed interval profiles once rather than evaluate
 * twelve exponential paths at every camera quadrature sample.
 *
 * The lookup is a presentation cache of the canonical CPU profile, not a new
 * physical representation. Distance and interval axes are quadratic so the
 * narrow sheet receives most of the filter resolution. RGBA16F matches the
 * persistent observer precision and is linearly filterable on both supported
 * renderer backends.
 */
export function createCymaticPlasmaProfileLookup({
  maximumIntervalWidthWorld,
}) {
  const normalizedMaximumIntervalWidthWorld =
    normalizeMaximumIntervalWidthWorld(maximumIntervalWidthWorld);
  const maximumSignedDistanceWorld = resolveMaximumSignedDistanceWorld(
    normalizedMaximumIntervalWidthWorld,
  );
  const data = buildLookupData({
    maximumIntervalWidthWorld: normalizedMaximumIntervalWidthWorld,
    maximumSignedDistanceWorld,
  });
  const profileTexture = new THREE.DataTexture(
    data,
    CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH,
    CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  profileTexture.name = "BaryonCymaticPlasmaProfileLookup";
  profileTexture.minFilter = THREE.LinearFilter;
  profileTexture.magFilter = THREE.LinearFilter;
  profileTexture.wrapS = THREE.ClampToEdgeWrapping;
  profileTexture.wrapT = THREE.ClampToEdgeWrapping;
  profileTexture.generateMipmaps = false;
  profileTexture.colorSpace = THREE.NoColorSpace;
  profileTexture.needsUpdate = true;
  let disposed = false;

  return {
    data,
    texture: profileTexture,
    maximumIntervalWidthWorld: normalizedMaximumIntervalWidthWorld,
    maximumSignedDistanceWorld,
    tailEpsilon: CYMATIC_PLASMA_PROFILE_TAIL_EPSILON,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      profileTexture.dispose();
    },
  };
}

function resolveLookupCoordinate(value, maximum, size) {
  const normalized = Math.sqrt(Math.min(1, Math.max(0, value / maximum)));
  return normalized * (size - 1);
}

/** CPU mirror of the hardware-linear RGBA16F sample used by fidelity tests. */
export function sampleCymaticPlasmaProfileLookup(
  lookup,
  { signedDistanceWorld = 0, intervalWidthWorld = 0 } = {},
) {
  const boundedIntervalWidthWorld = Math.min(
    lookup.maximumIntervalWidthWorld,
    Math.max(0, intervalWidthWorld),
  );
  const distanceCoordinate = resolveLookupCoordinate(
    Math.abs(signedDistanceWorld),
    lookup.maximumSignedDistanceWorld,
    CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH,
  );
  const intervalCoordinate = resolveLookupCoordinate(
    boundedIntervalWidthWorld,
    lookup.maximumIntervalWidthWorld,
    CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT,
  );
  const lowerDistance = Math.floor(distanceCoordinate);
  const upperDistance = Math.min(
    CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH - 1,
    lowerDistance + 1,
  );
  const lowerInterval = Math.floor(intervalCoordinate);
  const upperInterval = Math.min(
    CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT - 1,
    lowerInterval + 1,
  );
  const distanceMix = distanceCoordinate - lowerDistance;
  const intervalMix = intervalCoordinate - lowerInterval;
  const readChannel = (distanceIndex, intervalIndex, channel) =>
    THREE.DataUtils.fromHalfFloat(
      lookup.data[
        (intervalIndex * CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH + distanceIndex) *
          4 +
          channel
      ],
    );

  return PROFILE_CHANNEL_FWHM_WORLD.map((_, channel) => {
    const lower =
      readChannel(lowerDistance, lowerInterval, channel) * (1 - distanceMix) +
      readChannel(upperDistance, lowerInterval, channel) * distanceMix;
    const upper =
      readChannel(lowerDistance, upperInterval, channel) * (1 - distanceMix) +
      readChannel(upperDistance, upperInterval, channel) * distanceMix;
    return lower * (1 - intervalMix) + upper * intervalMix;
  });
}

/** GPU sample matching sampleCymaticPlasmaProfileLookup's texel geometry. */
export function sampleCymaticPlasmaProfileLookupNode(
  lookup,
  { signedDistanceWorld, intervalWidthWorld },
) {
  const absoluteDistanceWorld = abs(signedDistanceWorld).toVar();
  // The sole production owner supplies Gauss weight times a bounded absolute
  // normal cosine, so this coordinate is already in [0, maximum width].
  const distanceCoordinate = sqrt(
    min(
      absoluteDistanceWorld.div(float(lookup.maximumSignedDistanceWorld)),
      float(1),
    ),
  );
  const intervalCoordinate = sqrt(
    intervalWidthWorld.div(float(lookup.maximumIntervalWidthWorld)),
  );
  const lookupUv = vec2(
    distanceCoordinate
      .mul(float(CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH - 1))
      .add(0.5)
      .div(float(CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH)),
    intervalCoordinate
      .mul(float(CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT - 1))
      .add(0.5)
      .div(float(CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT)),
  );
  const sampledProfiles = fixedDataTexture(lookup.texture, lookupUv).level(
    float(0),
  );
  return { profiles: sampledProfiles };
}

// Fixed-profile presentation cache owner end.
