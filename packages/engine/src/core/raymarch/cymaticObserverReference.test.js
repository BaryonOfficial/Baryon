import { describe, expect, it } from "vitest";
import {
  FIELD_CACHE_CELL_SIZE,
  FIELD_CACHE_DOMAINS,
} from "./fieldCacheGeometry.js";
import {
  CYMATIC_OBSERVER_APERTURE_PASSES,
  CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
  CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS,
  CYMATIC_OBSERVER_REFERENCE,
  CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
  blendCymaticObserverSignedDistance,
  clampCymaticObserverGeometryExposureSeconds,
  compressCymaticObserverEnergy,
  createCymaticObserverClockState,
  deriveCymaticFineDetailAgreement,
  deriveCymaticObserverApertureKernel,
  deriveCymaticObserverBlend,
  deriveCymaticObserverGeometryAssimilation,
  deriveCymaticObserverSurfaceSupport,
  deriveCymaticObserverSurfaceProfile,
  deriveCymaticPlasmaCarrier,
  deriveCymaticTopologyContinuation,
  deriveImplicitSurfaceBacktraceDisplacementNormalized,
  resolveCymaticObserverFieldInterval,
  resolveCymaticObserverStep,
} from "./cymaticObserverReference.js";

describe("deterministic cymatic observer reference", () => {
  it("advances only on fixed audio-time steps", () => {
    const state = createCymaticObserverClockState();
    const token = "track-a|apparatus-a";

    expect(
      resolveCymaticObserverStep(state, {
        resetToken: token,
        observationTimeSeconds: 1,
      }),
    ).toMatchObject({ reset: true, stepCount: 0 });
    expect(
      resolveCymaticObserverStep(state, {
        resetToken: token,
        observationTimeSeconds: 1.01,
      }),
    ).toMatchObject({ reset: false, stepCount: 0 });

    const advanced = resolveCymaticObserverStep(state, {
      resetToken: token,
      observationTimeSeconds: 1.05,
    });
    expect(advanced.stepCount).toBe(3);
    expect(advanced.deltaTimeSeconds).toBeCloseTo(0.05, 12);
  });

  it("freezes paused time and resets on seek or apparatus change", () => {
    const state = createCymaticObserverClockState();
    resolveCymaticObserverStep(state, {
      resetToken: "track-a|apparatus-a",
      observationTimeSeconds: 4,
    });
    expect(
      resolveCymaticObserverStep(state, {
        resetToken: "track-a|apparatus-a",
        observationTimeSeconds: 5,
        advancing: false,
      }),
    ).toMatchObject({ reset: false, stepCount: 0 });
    expect(
      resolveCymaticObserverStep(state, {
        resetToken: "track-a|apparatus-a",
        observationTimeSeconds: 2,
      }),
    ).toMatchObject({ reset: true, stepCount: 0 });
    expect(
      resolveCymaticObserverStep(state, {
        resetToken: "track-a|apparatus-b",
        observationTimeSeconds: 2,
      }),
    ).toMatchObject({ reset: true, stepCount: 0 });
  });

  it("rebases paused time without integrating the skipped interval on resume", () => {
    const state = createCymaticObserverClockState();
    const resetToken = "track-a|apparatus-a";

    resolveCymaticObserverStep(state, {
      resetToken,
      observationTimeSeconds: 1,
    });
    expect(
      resolveCymaticObserverStep(state, {
        resetToken,
        observationTimeSeconds: 5,
        advancing: false,
      }),
    ).toMatchObject({ reset: false, stepCount: 0 });

    expect(
      resolveCymaticObserverStep(state, {
        resetToken,
        observationTimeSeconds: 5.05,
      }),
    ).toMatchObject({ reset: false, stepCount: 3 });
  });

  it("integrates response analytically independent of frame subdivision", () => {
    const exposure = CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds;
    const whole = deriveCymaticObserverBlend(0.3, exposure);
    const half = deriveCymaticObserverBlend(0.15, exposure);
    const subdivided = half + (1 - half) * half;
    expect(subdivided).toBeCloseTo(whole, 12);
  });

  it("bounds operator-selected geometry exposure without a fallback", () => {
    expect(
      clampCymaticObserverGeometryExposureSeconds(
        CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.minimumSeconds / 2,
      ),
    ).toBe(CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.minimumSeconds);
    expect(
      clampCymaticObserverGeometryExposureSeconds(
        CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.maximumSeconds * 2,
      ),
    ).toBe(CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.maximumSeconds);
    expect(() =>
      clampCymaticObserverGeometryExposureSeconds(Number.NaN),
    ).toThrow("geometryExposureSeconds must be a finite number");
  });

  it("retains geometry longer as exposure increases", () => {
    const deltaTimeSeconds = CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds;
    const fastBlend = deriveCymaticObserverBlend(deltaTimeSeconds, 0.05);
    const defaultBlend = deriveCymaticObserverBlend(
      deltaTimeSeconds,
      CYMATIC_OBSERVER_REFERENCE.geometryExposureSeconds,
    );
    const slowBlend = deriveCymaticObserverBlend(deltaTimeSeconds, 2);

    expect(fastBlend).toBeGreaterThan(defaultBlend);
    expect(defaultBlend).toBeGreaterThan(slowBlend);
  });

  it("subdivides missed frames over one ordered field interval", () => {
    expect(resolveCymaticObserverFieldInterval(0, 3)).toEqual({
      previousFieldMix: 0,
      currentFieldMix: 1 / 3,
    });
    expect(resolveCymaticObserverFieldInterval(1, 3)).toEqual({
      previousFieldMix: 1 / 3,
      currentFieldMix: 2 / 3,
    });
    expect(resolveCymaticObserverFieldInterval(2, 3)).toEqual({
      previousFieldMix: 2 / 3,
      currentFieldMix: 1,
    });
  });

  it("uses one fixed bounded local-energy compression", () => {
    const halfResponse = CYMATIC_OBSERVER_REFERENCE.localEnergyHalfResponse;
    expect(compressCymaticObserverEnergy(0)).toBe(0);
    expect(compressCymaticObserverEnergy(halfResponse)).toBe(0.5);
    expect(compressCymaticObserverEnergy(1e9)).toBeCloseTo(1, 8);
  });

  it("holds persistent geometry when the acoustic surface loses support", () => {
    const supported = deriveCymaticObserverSurfaceSupport({
      localEnergy: 0.75,
      topologyGradientNormalized: [2, 0, 0],
    });
    const unsupported = deriveCymaticObserverSurfaceSupport({
      localEnergy: 0,
      topologyGradientNormalized: [2, 0, 0],
    });
    const undefinedSurface = deriveCymaticObserverSurfaceSupport({
      localEnergy: 0.75,
      topologyGradientNormalized: [0, 0, 0],
    });

    expect(supported).toBeCloseTo(0.75, 12);
    expect(unsupported).toBe(0);
    expect(undefinedSurface).toBe(0);
    expect(
      deriveCymaticObserverGeometryAssimilation(0.4, supported),
    ).toBeCloseTo(0.3, 12);
    expect(deriveCymaticObserverGeometryAssimilation(0.4, unsupported)).toBe(0);
    expect(blendCymaticObserverSignedDistance(-0.12, 0, 0)).toBe(-0.12);
  });

  it("realizes the fine and topology apertures in the same three passes", () => {
    expect(CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS).toEqual([
      -2, -1, 0, 1, 2,
    ]);
    expect(CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS).toEqual([
      -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(CYMATIC_OBSERVER_APERTURE_PASSES).toEqual([
      {
        direction: [1, 0, 0],
        inputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
        outputDomain: FIELD_CACHE_DOMAINS.halfYz,
      },
      {
        direction: [0, 1, 0],
        inputDomain: FIELD_CACHE_DOMAINS.halfYz,
        outputDomain: FIELD_CACHE_DOMAINS.halfXy,
      },
      {
        direction: [0, 0, 1],
        inputDomain: FIELD_CACHE_DOMAINS.halfXy,
        outputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
      },
    ]);

    const fineKernel = deriveCymaticObserverApertureKernel(
      FIELD_CACHE_CELL_SIZE * 3,
      CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
      CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS,
    );
    const topologyKernel = deriveCymaticObserverApertureKernel(
      FIELD_CACHE_CELL_SIZE * 3,
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
      CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS,
    );
    expect(fineKernel.weights).toHaveLength(5);
    expect(topologyKernel.weights).toHaveLength(13);
    expect(
      fineKernel.effectiveFwhmWorld /
        CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    ).toBeGreaterThanOrEqual(0.98);
    expect(
      fineKernel.effectiveFwhmWorld /
        CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    ).toBeLessThanOrEqual(1.02);
    expect(
      topologyKernel.effectiveFwhmWorld /
        CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
    ).toBeGreaterThanOrEqual(0.98);
    expect(
      topologyKernel.effectiveFwhmWorld /
        CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
    ).toBeLessThanOrEqual(1.02);
    expect(
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld /
        CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    ).toBeCloseTo(2.5, 12);
  });

  it("measures amplitude-normalized detail agreement across aperture scales", () => {
    const reference = deriveCymaticFineDetailAgreement({
      finePotential: 0.2,
      fineGradientNormalized: [2, 0, 0],
      topologyPotential: 0.1,
      topologyGradientNormalized: [1, 0, 0],
      radius: 3,
    });
    const amplified = deriveCymaticFineDetailAgreement({
      finePotential: 2,
      fineGradientNormalized: [20, 0, 0],
      topologyPotential: 1,
      topologyGradientNormalized: [10, 0, 0],
      radius: 3,
    });

    expect(reference).toBeCloseTo(1, 12);
    expect(amplified).toBeCloseTo(reference, 12);
    expect(
      deriveCymaticFineDetailAgreement({
        finePotential: 0,
        fineGradientNormalized: [1, 0, 0],
        topologyPotential: CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld,
        topologyGradientNormalized: [1, 0, 0],
        radius: 1,
      }),
    ).toBeCloseTo(1 / 16, 12);
    expect(
      deriveCymaticFineDetailAgreement({
        finePotential: 0,
        fineGradientNormalized: [1, 0, 0],
        topologyPotential: 0,
        topologyGradientNormalized: [0, 1, 0],
        radius: 1,
      }),
    ).toBe(0);
    expect(
      deriveCymaticFineDetailAgreement({
        finePotential: 0,
        fineGradientNormalized: [1, 0, 0],
        topologyPotential: 0,
        topologyGradientNormalized: [Math.SQRT1_2, Math.SQRT1_2, 0],
        radius: 1,
      }),
    ).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("keeps canonical topology fixed while the fine field changes", () => {
    const topology = {
      topologyPotential: 0.06,
      topologyGradientNormalized: [2, 0, 0],
      radius: 3,
    };
    const first = deriveCymaticTopologyContinuation({
      ...topology,
      finePotential: -20,
      fineGradientNormalized: [0, 50, 0],
    });
    const second = deriveCymaticTopologyContinuation({
      ...topology,
      finePotential: 40,
      fineGradientNormalized: [0, 0, -100],
    });

    expect(first.signedDistanceWorld).toBeCloseTo(0.09, 12);
    expect(second.signedDistanceWorld).toBe(first.signedDistanceWorld);
    expect(second.surfaceNormalWorld).toEqual(first.surfaceNormalWorld);
    expect(Math.abs(first.fineResidual)).toBeLessThan(1);
    expect(Math.abs(second.fineResidual)).toBeLessThan(1);
    expect(first.fineResidual).not.toBe(second.fineResidual);
  });

  it("lets fine detail reinforce only the detail spine", () => {
    const observation = {
      signedDistanceWorld: 0.01,
      surfaceNormalWorld: [1, 0, 0],
      surfaceSupport: 1,
      rayDirLocal: [1, 0, 0],
      stepSize: 0.02,
    };
    const pure = deriveCymaticPlasmaCarrier({
      ...observation,
      fineDetailAgreement: 1,
      fineResidual: 1,
    });
    const contested = deriveCymaticPlasmaCarrier({
      ...observation,
      fineDetailAgreement: 0,
      fineResidual: -1,
    });
    expect(contested.continuitySpineDensity).toBeGreaterThan(0);
    expect(contested.coreDensity).toBeGreaterThan(0);
    expect(contested.sheathDensity).toBeGreaterThan(0);
    expect(pure.continuitySpineDensity).toBeCloseTo(
      contested.continuitySpineDensity,
      12,
    );
    expect(pure.coreDensity).toBeCloseTo(contested.coreDensity, 12);
    expect(pure.sheathDensity).toBeCloseTo(contested.sheathDensity, 12);
    expect(pure.detailSpineDensity).toBeGreaterThan(
      contested.detailSpineDensity,
    );
  });

  it("integrates the level set before extracting one fixed-width sheet", () => {
    const previousSurface = -0.06;
    const currentSurface = 0.06;
    const sampleProfile = (position) =>
      deriveCymaticObserverSurfaceProfile(
        blendCymaticObserverSignedDistance(
          position - previousSurface,
          position - currentSurface,
          0.5,
        ),
      );

    expect(sampleProfile(0)).toBeCloseTo(1, 12);
    expect(sampleProfile(-0.06)).toBeLessThan(sampleProfile(0));
    expect(sampleProfile(0.06)).toBeLessThan(sampleProfile(0));
  });

  it("derives backtrace displacement from the implicit field equation", () => {
    expect(
      deriveImplicitSurfaceBacktraceDisplacementNormalized({
        previousPotential: 0.2,
        currentPotential: 0.4,
        currentGradientNormalized: [2, 0, 0],
      }),
    ).toEqual([0.1, 0, 0]);
    expect(
      deriveImplicitSurfaceBacktraceDisplacementNormalized({
        previousPotential: 0.2,
        currentPotential: 0.4,
        currentGradientNormalized: [0, 0, 0],
      }),
    ).toEqual([0, 0, 0]);
  });
});
