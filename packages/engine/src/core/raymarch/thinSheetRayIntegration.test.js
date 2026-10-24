import { describe, expect, it } from "vitest";
import {
  deriveCenteredRaymarchIntervals,
  integrateRadiativeTransferRay,
} from "./SafeVolumetricLightingModel.js";
import {
  CYMATIC_OBSERVER_REFERENCE,
  derivePeakNormalizedGaussianIntervalAverage,
} from "./cymaticObserverReference.js";
import {
  createCymaticPlasmaProfileLookup,
  sampleCymaticPlasmaProfileLookup,
} from "./cymaticPlasmaProfileLookup.js";

const CONTINUITY_FWHM_WORLD =
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
  CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio;
const PROFILE_FWHM_WORLD = [
  CONTINUITY_FWHM_WORLD,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.spineWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.coreWidthRatio,
  CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
    CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio,
];

function* planarSheetCases() {
  const entryDistance = 1.25;
  for (const chordLength of [6, 5.37]) {
    for (const sampleBudget of [16, 17, 24, 32, 40, 64, 80, 96, 104, 128]) {
      const intervals = deriveCenteredRaymarchIntervals({
        entryDistance,
        exitDistance: entryDistance + chordLength,
        referenceLength: 6,
        sampleBudget,
      });
      for (const normalDotRay of [1, 0.5, 0.05]) {
        for (let index = 0; index < 101; index += 1) {
          yield {
            intervals,
            normalDotRay,
            chordLength,
            // Cover the complete chord, including sheets clipped by its ends.
            sheetDistance: entryDistance + (chordLength * (index + 0.5)) / 101,
            chordCenter: entryDistance + chordLength * 0.5,
          };
        }
      }
    }
  }
}

function wholeChordArea(
  { chordCenter, sheetDistance, chordLength, normalDotRay },
  fwhmWorld,
) {
  return (
    chordLength *
    derivePeakNormalizedGaussianIntervalAverage({
      signedDistanceWorld: (chordCenter - sheetDistance) * normalDotRay,
      intervalWidthWorld: chordLength * normalDotRay,
      fwhmWorld,
    })
  );
}

describe("thin-sheet ray integration", () => {
  it("preserves a translated sheet between the former Gauss intervals", () => {
    const samples = deriveCenteredRaymarchIntervals({
      entryDistance: 0,
      exitDistance: 6,
      referenceLength: 6,
      sampleBudget: 64,
    });
    const sheetDistance = 0.09375;
    const area = samples.reduce(
      (sum, { distance, intervalWidth }) =>
        sum +
        intervalWidth *
          derivePeakNormalizedGaussianIntervalAverage({
            signedDistanceWorld: distance - sheetDistance,
            intervalWidthWorld: intervalWidth,
            fwhmWorld: CONTINUITY_FWHM_WORLD,
          }),
      0,
    );
    const expectedArea =
      CONTINUITY_FWHM_WORLD * Math.sqrt(Math.PI / (4 * Math.log(2)));

    expect(area / expectedArea).toBeCloseTo(1, 12);
  });

  it("tiles the visible chord with centered intervals, including a partial final panel", () => {
    for (const sampleBudget of [1, 5, 16, 40, 64, 104]) {
      for (const exitDistance of [1.071, 6.37, 7]) {
        const entryDistance = 1;
        const samples = deriveCenteredRaymarchIntervals({
          entryDistance,
          exitDistance,
          referenceLength: 6,
          sampleBudget,
        });
        let previousEnd = entryDistance;
        for (const { distance, intervalWidth } of samples) {
          expect(distance - intervalWidth * 0.5).toBeCloseTo(previousEnd, 12);
          previousEnd = distance + intervalWidth * 0.5;
        }
        expect(previousEnd).toBeCloseTo(exitDistance, 12);
      }
    }
  });

  it("preserves all four planar layer areas across translations, oblique rays, and budgets", () => {
    let maximumRelativeError = 0;
    for (const fixture of planarSheetCases()) {
      for (const fwhmWorld of PROFILE_FWHM_WORLD) {
        const area = fixture.intervals.reduce(
          (sum, { distance, intervalWidth }) =>
            sum +
            intervalWidth *
              derivePeakNormalizedGaussianIntervalAverage({
                signedDistanceWorld:
                  (distance - fixture.sheetDistance) * fixture.normalDotRay,
                intervalWidthWorld: intervalWidth * fixture.normalDotRay,
                fwhmWorld,
              }),
          0,
        );
        const expectedArea = wholeChordArea(fixture, fwhmWorld);
        maximumRelativeError = Math.max(
          maximumRelativeError,
          Math.abs(area / expectedArea - 1),
        );
      }
    }
    // The canonical erf approximation has a 1e-9 residual beside zero;
    // splitting precisely on the surface can retain that residual after clamp.
    expect(maximumRelativeError).toBeLessThan(1e-8);
  });

  it("bounds packed RGBA16F layer area error across the same cases", () => {
    const lookup = createCymaticPlasmaProfileLookup({
      maximumIntervalWidthWorld: 3,
    });
    let maximumRelativeError = 0;
    for (const fixture of planarSheetCases()) {
      const areas = [0, 0, 0, 0];
      for (const { distance, intervalWidth } of fixture.intervals) {
        const profiles = sampleCymaticPlasmaProfileLookup(lookup, {
          signedDistanceWorld:
            (distance - fixture.sheetDistance) * fixture.normalDotRay,
          intervalWidthWorld: intervalWidth * fixture.normalDotRay,
        });
        profiles.forEach((profile, channel) => {
          areas[channel] += profile * intervalWidth;
        });
      }
      PROFILE_FWHM_WORLD.forEach((fwhmWorld, channel) => {
        const expectedArea = wholeChordArea(fixture, fwhmWorld);
        maximumRelativeError = Math.max(
          maximumRelativeError,
          Math.abs(areas[channel] / expectedArea - 1),
        );
      });
    }
    lookup.texture.dispose();
    // Lookup interpolation near an interval edge limits relative precision
    // for the narrow continuity layer, despite <1e-3 absolute profile error.
    expect(maximumRelativeError).toBeLessThan(0.015);
  });

  it("preserves sheet optical depth and proportional radiance in either camera order", () => {
    const extinctionScale = 20;
    const sourceScale = [4, 2, 1];
    for (const sampleBudget of [16, 17, 32, 64, 104]) {
      for (const cameraAtRayStart of [true, false]) {
        for (const sheetDistance of [0.09375, 2.71, 5.368]) {
          const chordLength = 5.37;
          const normalDotRay = 0.5;
          const area = wholeChordArea(
            {
              chordCenter: chordLength * 0.5,
              sheetDistance,
              chordLength,
              normalDotRay,
            },
            CONTINUITY_FWHM_WORLD,
          );
          const expectedTransmittance = Math.exp(-extinctionScale * area);
          const ray = integrateRadiativeTransferRay({
            entryDistance: 0,
            exitDistance: chordLength,
            referenceLength: 6,
            sampleBudget,
            cameraAtRayStart,
            sample: (distance, intervalWidth) => {
              const profile = derivePeakNormalizedGaussianIntervalAverage({
                signedDistanceWorld: (distance - sheetDistance) * normalDotRay,
                intervalWidthWorld: intervalWidth * normalDotRay,
                fwhmWorld: CONTINUITY_FWHM_WORLD,
              });
              return {
                baseSourceRadiance: sourceScale.map(
                  (channel) => channel * profile,
                ),
                extinction: extinctionScale * profile,
              };
            },
          });
          expect(ray.transmittance).toBeCloseTo(expectedTransmittance, 12);
          expect(ray.baseRadiance).toEqual(
            sourceScale.map((channel) =>
              expect.closeTo(
                (channel / extinctionScale) * (1 - expectedTransmittance),
                12,
              ),
            ),
          );
        }
      }
    }
  });
});
