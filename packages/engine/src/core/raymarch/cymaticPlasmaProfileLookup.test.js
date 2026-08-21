import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  CYMATIC_OBSERVER_REFERENCE,
  derivePeakNormalizedGaussianIntervalAverage,
} from "./cymaticObserverReference.js";
import {
  CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT,
  CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH,
  CYMATIC_PLASMA_PROFILE_TAIL_EPSILON,
  createCymaticPlasmaProfileLookup,
  sampleCymaticPlasmaProfileLookup,
} from "./cymaticPlasmaProfileLookup.js";

const MAXIMUM_INTERVAL_WIDTH_WORLD = 3;
const PROFILE_FWHM_WORLD = Object.freeze([
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.spineWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.coreWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio,
]);

describe("cymatic plasma profile lookup", () => {
  it("stores the four apparatus-fixed interval profiles in one portable texture", () => {
    const lookup = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });

    expect(lookup.data).toBeInstanceOf(Uint16Array);
    expect(lookup.data).toHaveLength(
      CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH *
        CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT *
        4,
    );
    expect(lookup.texture).toBeInstanceOf(THREE.DataTexture);
    expect(lookup.texture.type).toBe(THREE.HalfFloatType);
    expect(lookup.texture.format).toBe(THREE.RGBAFormat);
    expect(lookup.texture.minFilter).toBe(THREE.LinearFilter);
    expect(lookup.texture.magFilter).toBe(THREE.LinearFilter);
    expect(lookup.texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(lookup.texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(lookup.texture.generateMipmaps).toBe(false);
    expect(lookup.texture.colorSpace).toBe(THREE.NoColorSpace);
  });

  it("keeps the quantized filtered profiles within one-thousandth of the canonical physics", () => {
    const lookup = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    const intervalWidths = [
      0,
      1e-7,
      1e-6,
      1e-4,
      0.00425,
      0.0153,
      0.0442,
      0.0935,
      0.1875,
      0.375,
      1,
      MAXIMUM_INTERVAL_WIDTH_WORLD,
    ];
    const distances = new Set([0, 1e-6, 0.002125, 0.00765, 0.0221, 0.04675]);
    for (let index = 0; index <= 512; index += 1) {
      const normalizedDistance = index / 512;
      distances.add(
        lookup.maximumSignedDistanceWorld *
          normalizedDistance *
          normalizedDistance,
      );
    }

    let maximumAbsoluteError = 0;
    for (const signedDistanceWorld of distances) {
      for (const intervalWidthWorld of intervalWidths) {
        const sampledProfiles = sampleCymaticPlasmaProfileLookup(lookup, {
          signedDistanceWorld,
          intervalWidthWorld,
        });
        PROFILE_FWHM_WORLD.forEach((fwhmWorld, channel) => {
          const canonicalProfile = derivePeakNormalizedGaussianIntervalAverage({
            signedDistanceWorld,
            intervalWidthWorld,
            fwhmWorld,
          });
          maximumAbsoluteError = Math.max(
            maximumAbsoluteError,
            Math.abs(sampledProfiles[channel] - canonicalProfile),
          );
        });
      }
    }

    expect(maximumAbsoluteError).toBeLessThan(1e-3);
  });

  it("is symmetric in signed distance and covers the widest production interval", () => {
    const lookup = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    const inputs = {
      signedDistanceWorld: 0.17,
      intervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    };

    expect(sampleCymaticPlasmaProfileLookup(lookup, inputs)).toEqual(
      sampleCymaticPlasmaProfileLookup(lookup, {
        ...inputs,
        signedDistanceWorld: -inputs.signedDistanceWorld,
      }),
    );
    expect(lookup.maximumIntervalWidthWorld).toBe(MAXIMUM_INTERVAL_WIDTH_WORLD);
  });

  it("derives finite support from the declared tail error and returns exact zero beyond it", () => {
    const lookup = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    const maximumFwhmWorld = Math.max(...PROFILE_FWHM_WORLD);
    const tailFwhmMultiple = Math.sqrt(
      Math.log(1 / CYMATIC_PLASMA_PROFILE_TAIL_EPSILON) / (4 * Math.log(2)),
    );
    const expectedMaximumSignedDistanceWorld =
      MAXIMUM_INTERVAL_WIDTH_WORLD * 0.5 + maximumFwhmWorld * tailFwhmMultiple;

    expect(lookup.maximumSignedDistanceWorld).toBeCloseTo(
      expectedMaximumSignedDistanceWorld,
      12,
    );
    expect(lookup.tailEpsilon).toBe(CYMATIC_PLASMA_PROFILE_TAIL_EPSILON);
    let nonzeroTailTexelCount = 0;
    for (
      let intervalIndex = 0;
      intervalIndex < CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT;
      intervalIndex += 1
    ) {
      const normalizedInterval =
        intervalIndex / (CYMATIC_PLASMA_PROFILE_LOOKUP_HEIGHT - 1);
      const intervalWidthWorld =
        MAXIMUM_INTERVAL_WIDTH_WORLD * normalizedInterval * normalizedInterval;
      const supportDistanceWorld =
        intervalWidthWorld * 0.5 + maximumFwhmWorld * tailFwhmMultiple;
      for (
        let distanceIndex = 0;
        distanceIndex < CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH;
        distanceIndex += 1
      ) {
        const normalizedDistance =
          distanceIndex / (CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH - 1);
        const signedDistanceWorld =
          lookup.maximumSignedDistanceWorld *
          normalizedDistance *
          normalizedDistance;
        if (signedDistanceWorld <= supportDistanceWorld) {
          continue;
        }
        const offset =
          (intervalIndex * CYMATIC_PLASMA_PROFILE_LOOKUP_WIDTH +
            distanceIndex) *
          4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (lookup.data[offset + channel] !== 0) {
            nonzeroTailTexelCount += 1;
          }
        }
      }
    }
    expect(nonzeroTailTexelCount).toBe(0);
    expect(
      sampleCymaticPlasmaProfileLookup(lookup, {
        signedDistanceWorld: lookup.maximumSignedDistanceWorld + 1e-9,
        intervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
      }),
    ).toEqual([0, 0, 0, 0]);
    expect(
      sampleCymaticPlasmaProfileLookup(lookup, {
        signedDistanceWorld: -lookup.maximumSignedDistanceWorld - 1e-9,
        intervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
      }),
    ).toEqual([0, 0, 0, 0]);
  });

  it("retains at most the most recent CPU table and disposes its texture once", () => {
    const first = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    const sameRadius = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    expect(sameRadius.data).toBe(first.data);

    const differentRadius = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: 2,
    });
    expect(differentRadius.data).not.toBe(first.data);
    const rebuiltFirstRadius = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: MAXIMUM_INTERVAL_WIDTH_WORLD,
    });
    expect(rebuiltFirstRadius.data).not.toBe(first.data);

    let disposeEvents = 0;
    rebuiltFirstRadius.texture.addEventListener("dispose", () => {
      disposeEvents += 1;
    });
    rebuiltFirstRadius.dispose();
    rebuiltFirstRadius.dispose();
    expect(disposeEvents).toBe(1);
  });
});
