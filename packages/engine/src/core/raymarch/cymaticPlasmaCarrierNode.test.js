import { describe, expect, it } from "vitest";
import {
  CYMATIC_OBSERVER_REFERENCE,
  deriveCymaticPlasmaCarrier,
} from "./cymaticObserverReference.js";

describe("cymatic plasma carrier reference", () => {
  it("keeps all optical layers absent when the observer has no geometry", () => {
    expect(deriveCymaticPlasmaCarrier()).toMatchObject({
      continuitySpineDensity: 0,
      detailSpineDensity: 0,
      spineDensity: 0,
      coreDensity: 0,
      sheathDensity: 0,
      normalDotRay: 0,
    });
  });

  it("applies one bounded optical response to the spine at the sheet center", () => {
    const carrier = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });
    const expectedDetailAuthority =
      CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineLimit /
      (1 + CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineHalfResponse);
    const expectedSpineAuthority =
      CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority +
      expectedDetailAuthority;

    expect(carrier.continuitySpineAuthority).toBe(
      CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority,
    );
    expect(carrier.detailSpineAuthority).toBeCloseTo(
      expectedDetailAuthority,
      12,
    );
    expect(carrier.spineAuthority).toBeCloseTo(expectedSpineAuthority, 12);
    expect(carrier.spineAuthority).toBeLessThan(1);
  });

  it("lets fine detail reinforce only the narrow spine, never base geometry", () => {
    const detailed = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
      fineResidual: 1,
    });
    const continuity = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [0.25, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 0,
      fineResidual: -1,
    });
    expect(detailed.continuitySpineDensity).toBeCloseTo(
      continuity.continuitySpineDensity,
      12,
    );
    expect(detailed.coreDensity).toBeCloseTo(continuity.coreDensity, 12);
    expect(detailed.sheathDensity).toBeCloseTo(continuity.sheathDensity, 12);
    expect(detailed.detailSpineDensity).toBeGreaterThan(0);
    expect(continuity.detailSpineDensity).toBe(0);
    expect(continuity.spineDensity).toBeGreaterThan(0);
    expect(continuity.coreDensity).toBeGreaterThan(0);
    expect(continuity.sheathDensity).toBeGreaterThan(0);
    expect(continuity.continuitySpineAuthority).toBe(
      CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority,
    );
    expect(continuity.detailSpineAuthority).toBe(0);
    expect(continuity.spineAuthority).toBe(
      CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority,
    );
    expect(continuity.fineDetailAuthority).toBe(0);
    expect(detailed.fineDetailAuthority).toBe(1);
    expect(continuity.surfaceAuthority).toBe(1);
    expect(continuity.continuityAuthority).toBe(1);
  });

  it("derives fixed layer widths from one continuous Gaussian occupancy", () => {
    const totalWeight =
      CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight +
      CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight +
      CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight;

    const spineHalfMaximum = deriveCymaticPlasmaCarrier({
      signedDistanceWorld:
        (CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
          CYMATIC_OBSERVER_REFERENCE.spineWidthRatio) /
        2,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });
    const coreHalfMaximum = deriveCymaticPlasmaCarrier({
      signedDistanceWorld:
        (CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
          CYMATIC_OBSERVER_REFERENCE.coreWidthRatio) /
        2,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });
    const sheathHalfMaximum = deriveCymaticPlasmaCarrier({
      signedDistanceWorld:
        (CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
          CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio) /
        2,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });

    expect(spineHalfMaximum.detailSpineDensity).toBeCloseTo(
      0.5 *
        (CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / totalWeight) *
        spineHalfMaximum.detailSpineAuthority,
      12,
    );
    const continuitySpineHalfMaximum = deriveCymaticPlasmaCarrier({
      signedDistanceWorld:
        (CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld *
          CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio) /
        2,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
    });
    expect(continuitySpineHalfMaximum.continuitySpineDensity).toBeCloseTo(
      0.5 *
        (CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / totalWeight) *
        continuitySpineHalfMaximum.continuitySpineAuthority,
      12,
    );
    expect(coreHalfMaximum.coreDensity).toBeCloseTo(
      0.5 * (CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight / totalWeight),
      12,
    );
    expect(sheathHalfMaximum.sheathDensity).toBeCloseTo(
      0.5 * (CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight / totalWeight),
      12,
    );
  });

  it("derives view response only from local sheet and ray directions", () => {
    expect(
      deriveCymaticPlasmaCarrier({
        signedDistanceWorld: 0,
        surfaceNormalWorld: [0, 1, 0],
        surfaceSupport: 1,
        rayDirLocal: [0, -2, 0],
      }).normalDotRay,
    ).toBeCloseTo(1, 12);
    expect(
      deriveCymaticPlasmaCarrier({
        signedDistanceWorld: 0,
        surfaceNormalWorld: [0, 1, 0],
        surfaceSupport: 1,
        rayDirLocal: [1, 0, 0],
      }).normalDotRay,
    ).toBeCloseTo(0, 12);
  });

  it("preserves integrated layer energy across raymarch step budgets", () => {
    const integrateCarrier = (sampleCount) => {
      const interval = 1 / sampleCount;
      let integral = 0;
      for (let index = 0; index < sampleCount; index += 1) {
        const signedDistanceWorld = -0.5 + (index + 0.5) * interval;
        const carrier = deriveCymaticPlasmaCarrier({
          signedDistanceWorld,
          surfaceNormalWorld: [1, 0, 0],
          surfaceSupport: 1,
          rayDirLocal: [1, 0, 0],
          stepSize: interval,
        });
        integral +=
          (carrier.spineDensity + carrier.coreDensity + carrier.sheathDensity) *
          interval;
      }
      return integral;
    };

    expect(integrateCarrier(20)).toBeCloseTo(integrateCarrier(80), 5);
  });

  it("attenuates the complete plasma sheet with continuous acoustic support", () => {
    const supported = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });
    const fading = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 0.25,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });
    const silent = deriveCymaticPlasmaCarrier({
      signedDistanceWorld: 0,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 0,
      rayDirLocal: [1, 0, 0],
      fineDetailAgreement: 1,
    });

    for (const density of [
      "continuitySpineDensity",
      "detailSpineDensity",
      "spineDensity",
      "coreDensity",
      "sheathDensity",
    ]) {
      expect(fading[density]).toBeCloseTo(supported[density] * 0.25, 12);
      expect(silent[density]).toBe(0);
    }
    expect(fading.surfaceAuthority).toBeCloseTo(0.25, 12);
  });
});
