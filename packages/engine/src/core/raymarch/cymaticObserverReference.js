import { clamp01 } from "../../utils/math.js";
import { FIELD_CACHE_DOMAINS } from "./fieldCacheGeometry.js";

const OBSERVER_TIME_EPSILON_SEC = 1e-9;
const GRADIENT_MAGNITUDE_SQUARED_EPSILON = 1e-12;
const DETAIL_AGREEMENT_GRADIENT_EPSILON = 1e-16;
const GAUSSIAN_FWHM_EXPONENT = 4 * Math.LN2;
const GAUSSIAN_UNIT_AREA_SCALE = 2 * Math.sqrt(Math.LN2 / Math.PI);
const GAUSSIAN_CDF_SCALE = 2 * Math.sqrt(Math.LN2);
const ERROR_FUNCTION_P = 0.3275911;
const ERROR_FUNCTION_COEFFICIENTS = Object.freeze([
  1.061405429, -1.453152027, 1.421413741, -0.284496736, 0.254829592,
]);

/**
 * Fixed virtual-instrument calibration.
 *
 * These values describe the observer, not the song or renderer. Audio advances
 * the observer on one fixed clock; camera, frame rate, output resolution,
 * bloom, and modal ranking are intentionally absent.
 */
export const CYMATIC_OBSERVER_REFERENCE = Object.freeze({
  fixedStepSeconds: 1 / 60,
  fineApertureFwhmWorld: 0.104,
  topologyApertureFwhmWorld: 0.26,
  fineResidualScaleWorld: 0.104,
  fineResidualDetailLimit: 0.25,
  geometryExposureSeconds: 0.4,
  radianceExposureSeconds: 0.05,
  sheetFwhmWorld: 0.085,
  spineWidthRatio: 0.18,
  continuitySpineWidthRatio: 0.05,
  coreWidthRatio: 0.52,
  sheathWidthRatio: 1.1,
  spineEnergyWeight: 96,
  coreEnergyWeight: 3.75,
  sheathEnergyWeight: 0.25,
  localEnergyHalfResponse: 0.08,
  plasmaSpineContinuityAuthority: 0.32,
  plasmaDetailSpineHalfResponse: 0.09,
  plasmaDetailSpineLimit: 0.24,
});

export const CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS = Object.freeze({
  minimumSeconds: 0.05,
  maximumSeconds: 2,
});

/**
 * Clamp the operator-selected geometry exposure at the control boundary.
 * Invalid values are contract failures rather than hidden fallback settings.
 */
export function clampCymaticObserverGeometryExposureSeconds(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError("geometryExposureSeconds must be a finite number");
  }
  return Math.min(
    CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.maximumSeconds,
    Math.max(CYMATIC_OBSERVER_GEOMETRY_EXPOSURE_LIMITS.minimumSeconds, value),
  );
}

export const CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS = Object.freeze([
  -2, -1, 0, 1, 2,
]);

export const CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS = Object.freeze([
  -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6,
]);

export const CYMATIC_OBSERVER_APERTURE_PASSES = Object.freeze([
  Object.freeze({
    direction: Object.freeze([1, 0, 0]),
    inputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
    outputDomain: FIELD_CACHE_DOMAINS.halfYz,
  }),
  Object.freeze({
    direction: Object.freeze([0, 1, 0]),
    inputDomain: FIELD_CACHE_DOMAINS.halfYz,
    outputDomain: FIELD_CACHE_DOMAINS.halfXy,
  }),
  Object.freeze({
    direction: Object.freeze([0, 0, 1]),
    inputDomain: FIELD_CACHE_DOMAINS.halfXy,
    outputDomain: FIELD_CACHE_DOMAINS.fundamentalXyz,
  }),
]);

export function deriveCymaticObserverApertureKernel(
  cellSizeWorld,
  apertureFwhmWorld,
  offsets,
) {
  const safeCellSizeWorld = Number.isFinite(cellSizeWorld)
    ? Math.max(0, cellSizeWorld)
    : 0;
  const safeApertureFwhmWorld =
    Number.isFinite(apertureFwhmWorld) && apertureFwhmWorld > 0
      ? apertureFwhmWorld
      : 0;
  const sigmaWorld = safeApertureFwhmWorld / (2 * Math.sqrt(2 * Math.LN2));
  const kernelOffsets = Array.isArray(offsets) ? offsets : [];
  const unnormalizedWeights = kernelOffsets.map((offset) =>
    Math.exp(
      -((offset * safeCellSizeWorld) ** 2) / (2 * sigmaWorld * sigmaWorld),
    ),
  );
  const totalWeight = unnormalizedWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const weights = unnormalizedWeights.map((weight) => weight / totalWeight);
  const varianceWorld = weights.reduce(
    (sum, weight, index) =>
      sum + weight * (kernelOffsets[index] * safeCellSizeWorld) ** 2,
    0,
  );

  return Object.freeze({
    weights: Object.freeze(weights),
    effectiveFwhmWorld: 2 * Math.sqrt(2 * Math.LN2) * Math.sqrt(varianceWorld),
  });
}

export function deriveCymaticFineDetailAgreement({
  finePotential = 0,
  fineGradientNormalized = [0, 0, 0],
  topologyPotential = 0,
  topologyGradientNormalized = [0, 0, 0],
  radius = 1,
} = {}) {
  const fineGradient = readFiniteVector3(fineGradientNormalized);
  const topologyGradient = readFiniteVector3(topologyGradientNormalized);
  if (
    !fineGradient ||
    !topologyGradient ||
    !Number.isFinite(finePotential) ||
    !Number.isFinite(topologyPotential)
  ) {
    return 0;
  }

  const safeRadius = Number.isFinite(radius) ? Math.max(1e-4, radius) : 1;
  const fineMagnitudeSquared = fineGradient.reduce(
    (sum, component) => sum + component * component,
    0,
  );
  const topologyMagnitudeSquared = topologyGradient.reduce(
    (sum, component) => sum + component * component,
    0,
  );
  const fineMagnitude = Math.sqrt(fineMagnitudeSquared);
  const topologyMagnitude = Math.sqrt(topologyMagnitudeSquared);
  const fineValidity =
    fineMagnitudeSquared /
    (fineMagnitudeSquared + DETAIL_AGREEMENT_GRADIENT_EPSILON);
  const topologyValidity =
    topologyMagnitudeSquared /
    (topologyMagnitudeSquared + DETAIL_AGREEMENT_GRADIENT_EPSILON);
  const fineDistanceWorld =
    finePotential / Math.max(fineMagnitude / safeRadius, 1e-8);
  const topologyDistanceWorld =
    topologyPotential / Math.max(topologyMagnitude / safeRadius, 1e-8);
  const normalizedDisplacement =
    (topologyDistanceWorld - fineDistanceWorld) /
    CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld;
  const distanceAgreement = Math.exp(
    -GAUSSIAN_FWHM_EXPONENT * normalizedDisplacement * normalizedDisplacement,
  );
  const normalDot = fineGradient.reduce(
    (sum, component, index) => sum + component * topologyGradient[index],
    0,
  );
  const normalAgreement = clamp01(
    normalDot /
      Math.max(
        fineMagnitude * topologyMagnitude,
        DETAIL_AGREEMENT_GRADIENT_EPSILON,
      ),
  );

  return clamp01(
    fineValidity * topologyValidity * distanceAgreement * normalAgreement,
  );
}

/**
 * Canonical topology plus a bounded material-only fine residual.
 *
 * The returned signed distance and normal depend exclusively on the topology
 * aperture. Fine-field changes can therefore alter detail observables but
 * cannot introduce another zero crossing or connected component.
 */
export function deriveCymaticTopologyContinuation({
  topologyPotential = 0,
  topologyGradientNormalized = [0, 0, 0],
  finePotential = 0,
  fineGradientNormalized = [0, 0, 0],
  radius = 1,
} = {}) {
  const safeRadius = Number.isFinite(radius) ? Math.max(1e-4, radius) : 1;
  const topologyGradient = readFiniteVector3(topologyGradientNormalized) ?? [
    0, 0, 0,
  ];
  const fineGradient = readFiniteVector3(fineGradientNormalized) ?? [0, 0, 0];
  const topologyMagnitude = Math.hypot(...topologyGradient);
  const fineMagnitude = Math.hypot(...fineGradient);
  const safeTopologyPotential = Number.isFinite(topologyPotential)
    ? topologyPotential
    : 0;
  const safeFinePotential = Number.isFinite(finePotential) ? finePotential : 0;
  const signedDistanceWorld =
    safeTopologyPotential / Math.max(topologyMagnitude / safeRadius, 1e-8);
  const fineDistanceWorld =
    safeFinePotential / Math.max(fineMagnitude / safeRadius, 1e-8);
  const residualWorld = fineDistanceWorld - signedDistanceWorld;
  const normalizedResidual =
    residualWorld / CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld;

  return {
    signedDistanceWorld,
    surfaceNormalWorld:
      topologyMagnitude > 1e-8
        ? topologyGradient.map((component) => component / topologyMagnitude)
        : [0, 0, 0],
    fineResidual: normalizedResidual / (1 + Math.abs(normalizedResidual)),
    fineDetailAgreement: deriveCymaticFineDetailAgreement({
      finePotential: safeFinePotential,
      fineGradientNormalized: fineGradient,
      topologyPotential: safeTopologyPotential,
      topologyGradientNormalized: topologyGradient,
      radius: safeRadius,
    }),
  };
}

export function createCymaticObserverClockState() {
  return {
    resetToken: undefined,
    stepIndex: null,
  };
}

export function resolveCymaticObserverStepIndex(timeSeconds) {
  const safeTime = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
  return Math.floor(
    (safeTime + OBSERVER_TIME_EPSILON_SEC) /
      CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
  );
}

/**
 * Resolve observer evolution from the authoritative audio timeline.
 *
 * A reset seeds the observer from the current field immediately, so first
 * paint never waits through the geometry exposure. Repeated render ticks,
 * paused time, and camera-only frames return zero steps. A non-advancing
 * timestamp still rebases the clock so resuming cannot integrate the held
 * interval as if the current field had been present throughout it.
 *
 * @param {{ resetToken?: unknown, stepIndex?: number | null }} state
 * @param {{
 *   resetToken?: unknown,
 *   observationTimeSeconds?: number,
 *   advancing?: boolean,
 * }} [options]
 */
export function resolveCymaticObserverStep(
  state,
  { resetToken, observationTimeSeconds, advancing = true } = {},
) {
  const nextStepIndex = resolveCymaticObserverStepIndex(observationTimeSeconds);
  const tokenChanged =
    state.resetToken !== undefined && state.resetToken !== resetToken;
  const timelineMovedBackward =
    Number.isFinite(state.stepIndex) && nextStepIndex < state.stepIndex;
  const reset =
    state.resetToken === undefined || tokenChanged || timelineMovedBackward;

  state.resetToken = resetToken;
  if (reset) {
    state.stepIndex = nextStepIndex;
    return {
      reset: true,
      stepCount: 0,
      deltaTimeSeconds: 0,
      stepIndex: nextStepIndex,
    };
  }

  if (advancing !== true) {
    state.stepIndex = nextStepIndex;
    return {
      reset: false,
      stepCount: 0,
      deltaTimeSeconds: 0,
      stepIndex: nextStepIndex,
    };
  }

  if (nextStepIndex <= state.stepIndex) {
    return {
      reset: false,
      stepCount: 0,
      deltaTimeSeconds: 0,
      stepIndex: state.stepIndex,
    };
  }

  const stepCount = nextStepIndex - state.stepIndex;
  state.stepIndex = nextStepIndex;
  return {
    reset: false,
    stepCount,
    deltaTimeSeconds: stepCount * CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
    stepIndex: nextStepIndex,
  };
}

export function deriveCymaticObserverBlend(deltaTimeSeconds, exposureSeconds) {
  if (
    !Number.isFinite(deltaTimeSeconds) ||
    deltaTimeSeconds <= 0 ||
    !Number.isFinite(exposureSeconds) ||
    exposureSeconds <= 0
  ) {
    return 0;
  }
  return clamp01(1 - Math.exp(-deltaTimeSeconds / exposureSeconds));
}

export function resolveCymaticObserverFieldInterval(
  substepIndex,
  substepCount,
) {
  const count = Math.max(1, Math.floor(substepCount ?? 1));
  const index = Math.min(count - 1, Math.max(0, Math.floor(substepIndex ?? 0)));
  return {
    previousFieldMix: index / count,
    currentFieldMix: (index + 1) / count,
  };
}

export function compressCymaticObserverEnergy(energy) {
  const safeEnergy = Number.isFinite(energy) ? Math.max(0, energy) : 0;
  return (
    safeEnergy /
    (safeEnergy + CYMATIC_OBSERVER_REFERENCE.localEnergyHalfResponse)
  );
}

/**
 * Continuous evidence that a persistent level-set sample is acoustically live.
 * Energy alone cannot validate a surface, and a gradient without energy is only
 * stale geometry, so both must be present.
 */
export function deriveCymaticObserverSurfaceSupport({
  localEnergy = 0,
  topologyGradientNormalized = [0, 0, 0],
} = {}) {
  const gradient = readFiniteVector3(topologyGradientNormalized);
  if (!gradient) {
    return 0;
  }
  const gradientMagnitudeSquared = gradient.reduce(
    (sum, component) => sum + component * component,
    0,
  );
  const gradientValidity =
    gradientMagnitudeSquared /
    (gradientMagnitudeSquared + DETAIL_AGREEMENT_GRADIENT_EPSILON);
  return (
    clamp01(Number.isFinite(localEnergy) ? localEnergy : 0) * gradientValidity
  );
}

export function deriveCymaticObserverGeometryAssimilation(
  geometryBlend,
  surfaceSupport,
) {
  return (
    clamp01(Number.isFinite(geometryBlend) ? geometryBlend : 0) *
    clamp01(Number.isFinite(surfaceSupport) ? surfaceSupport : 0)
  );
}

export function blendCymaticObserverSignedDistance(
  previousSignedDistanceWorld,
  currentSignedDistanceWorld,
  blend,
) {
  const previous = Number.isFinite(previousSignedDistanceWorld)
    ? previousSignedDistanceWorld
    : 0;
  const current = Number.isFinite(currentSignedDistanceWorld)
    ? currentSignedDistanceWorld
    : previous;
  const amount = clamp01(Number.isFinite(blend) ? blend : 0);
  return previous + (current - previous) * amount;
}

export function deriveCymaticObserverSurfaceProfile(
  signedDistanceWorld,
  surfaceAuthority = 1,
) {
  const distance = Number.isFinite(signedDistanceWorld)
    ? signedDistanceWorld
    : 0;
  const authority = clamp01(
    Number.isFinite(surfaceAuthority) ? surfaceAuthority : 0,
  );
  const normalizedDistance =
    distance / CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld;
  return (
    Math.exp(-4 * Math.LN2 * normalizedDistance * normalizedDistance) *
    authority
  );
}

function readFiniteVector3(value) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    return null;
  }
  const vector = Array.from(/** @type {ArrayLike<number>} */ (value)).slice(
    0,
    3,
  );
  return vector.length === 3 && vector.every(Number.isFinite) ? vector : null;
}

function approximateErrorFunction(value) {
  const magnitude = Math.abs(value);
  const t = 1 / (1 + ERROR_FUNCTION_P * magnitude);
  const polynomial =
    t *
    ERROR_FUNCTION_COEFFICIENTS.reduce(
      (sum, coefficient) => coefficient + t * sum,
      0,
    );
  const approximation = 1 - polynomial * Math.exp(-magnitude * magnitude);
  return Math.sign(value) * approximation;
}

export function derivePeakNormalizedGaussianIntervalAverage({
  signedDistanceWorld,
  intervalWidthWorld,
  fwhmWorld,
}) {
  const safeFwhmWorld = Math.max(1e-6, fwhmWorld);
  const safeDistance = Number.isFinite(signedDistanceWorld)
    ? signedDistanceWorld
    : Number.MAX_VALUE;
  const safeIntervalWidthWorld = Number.isFinite(intervalWidthWorld)
    ? Math.max(0, intervalWidthWorld)
    : 0;
  const normalizedDistance = safeDistance / safeFwhmWorld;
  const pointProfile = Math.exp(
    -GAUSSIAN_FWHM_EXPONENT * normalizedDistance * normalizedDistance,
  );
  if (safeIntervalWidthWorld <= 1e-6) {
    return pointProfile;
  }

  const halfInterval = safeIntervalWidthWorld * 0.5;
  const cdfScale = GAUSSIAN_CDF_SCALE / safeFwhmWorld;
  const intervalEnergy = clamp01(
    0.5 *
      (approximateErrorFunction((safeDistance + halfInterval) * cdfScale) -
        approximateErrorFunction((safeDistance - halfInterval) * cdfScale)),
  );
  return (
    (intervalEnergy * safeFwhmWorld) /
    (GAUSSIAN_UNIT_AREA_SCALE * safeIntervalWidthWorld)
  );
}

/**
 * Fixed optical layers integrated over one deterministic ray interval.
 *
 * Each layer is the interval average of one peak-normalized Gaussian around
 * the persistent signed surface. This preserves the declared width and
 * integrated energy when performance changes the ray sample budget, rather
 * than letting a point-sample lattice make the sheet grainy or flicker.
 */
export function deriveCymaticPlasmaCarrier({
  signedDistanceWorld = 0,
  surfaceNormalWorld = [0, 0, 0],
  surfaceSupport = 0,
  rayDirLocal = [0, 0, 0],
  stepSize = 0,
  fineDetailAgreement = 0,
  fineResidual = 0,
} = {}) {
  const totalWeight =
    CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight +
    CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight +
    CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight;
  const normal = readFiniteVector3(surfaceNormalWorld);
  const ray = readFiniteVector3(rayDirLocal);
  const normalMagnitude = normal ? Math.hypot(...normal) : 0;
  const rayMagnitude = ray ? Math.hypot(...ray) : 0;
  const normalDotRay =
    normalMagnitude > 1e-8 && rayMagnitude > 1e-8
      ? Math.abs(
          normal.reduce(
            (sum, component, index) => sum + component * ray[index],
            0,
          ) /
            (normalMagnitude * rayMagnitude),
        )
      : 0;
  const intervalWidthWorld =
    Math.max(0, Number.isFinite(stepSize) ? stepSize : 0) * normalDotRay;
  const surfaceAuthority =
    normalMagnitude > 1e-8
      ? clamp01(Number.isFinite(surfaceSupport) ? surfaceSupport : 0)
      : 0;
  const boundedFineDetailAgreement = clamp01(
    Number.isFinite(fineDetailAgreement) ? fineDetailAgreement : 0,
  );
  const boundedFineResidual = Math.max(
    -1,
    Math.min(1, Number.isFinite(fineResidual) ? fineResidual : 0),
  );
  const boundedFineDetailAuthority = clamp01(
    boundedFineDetailAgreement *
      (1 +
        boundedFineResidual *
          CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit),
  );
  const continuitySpineAuthority =
    surfaceAuthority *
    CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority;
  const detailSpineAuthority =
    surfaceAuthority *
    ((CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineLimit *
      boundedFineDetailAuthority) /
      (boundedFineDetailAuthority +
        CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineHalfResponse));
  const spineAuthority = continuitySpineAuthority + detailSpineAuthority;
  const continuityAuthority = surfaceAuthority;
  const deriveLayerProfile = (widthRatio) =>
    derivePeakNormalizedGaussianIntervalAverage({
      signedDistanceWorld,
      intervalWidthWorld,
      fwhmWorld: CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld * widthRatio,
    });
  const spineProfile = deriveLayerProfile(
    CYMATIC_OBSERVER_REFERENCE.spineWidthRatio,
  );
  const continuitySpineProfile = deriveLayerProfile(
    CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio,
  );
  const coreProfile = deriveLayerProfile(
    CYMATIC_OBSERVER_REFERENCE.coreWidthRatio,
  );
  const sheathProfile = deriveLayerProfile(
    CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio,
  );
  return {
    continuitySpineDensity:
      continuitySpineProfile *
      (CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / totalWeight) *
      continuitySpineAuthority,
    detailSpineDensity:
      spineProfile *
      (CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / totalWeight) *
      detailSpineAuthority,
    spineDensity:
      (CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / totalWeight) *
      (continuitySpineProfile * continuitySpineAuthority +
        spineProfile * detailSpineAuthority),
    coreDensity:
      coreProfile *
      (CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight / totalWeight) *
      surfaceAuthority,
    sheathDensity:
      sheathProfile *
      (CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight / totalWeight) *
      continuityAuthority,
    surfaceAuthority,
    continuitySpineAuthority,
    detailSpineAuthority,
    spineAuthority,
    fineDetailAuthority: boundedFineDetailAuthority,
    continuityAuthority,
    normalDotRay,
    intervalWidthWorld,
  };
}

/**
 * Backward displacement of an implicit U=0 surface in normalized cavity space.
 *
 * From dU/dt + v dot grad(U) = 0, the minimum-norm normal velocity is
 * v = -(dU/dt) grad(U) / |grad(U)|^2. Integrating over the field interval
 * cancels dt, leaving the potential delta below.
 */
export function deriveImplicitSurfaceBacktraceDisplacementNormalized({
  previousPotential = 0,
  currentPotential = 0,
  currentGradientNormalized = [0, 0, 0],
} = {}) {
  const gradient = Array.from(currentGradientNormalized ?? []).slice(0, 3);
  if (
    gradient.length !== 3 ||
    !gradient.every(Number.isFinite) ||
    !Number.isFinite(previousPotential) ||
    !Number.isFinite(currentPotential)
  ) {
    return [0, 0, 0];
  }

  const gradientMagnitudeSquared = gradient.reduce(
    (sum, component) => sum + component * component,
    0,
  );
  if (gradientMagnitudeSquared <= GRADIENT_MAGNITUDE_SQUARED_EPSILON) {
    return [0, 0, 0];
  }

  const potentialDelta = currentPotential - previousPotential;
  return gradient.map(
    (component) => (potentialDelta * component) / gradientMagnitudeSquared,
  );
}

// Deterministic cymatic observer reference owner end.
