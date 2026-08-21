import { abs, clamp, dot, float, inverseSqrt, max, min } from "three/tsl";
import { CYMATIC_OBSERVER_REFERENCE } from "./cymaticObserverReference.js";
import { sampleCymaticPlasmaProfileLookupNode } from "./cymaticPlasmaProfileLookup.js";

const NORMAL_EPSILON_SQUARED = 1e-16;
const TOTAL_LAYER_WEIGHT =
  CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight +
  CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight +
  CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight;

/**
 * Resolve geometry and fixed optical profiles before fetching appearance.
 *
 * `unitRayDirLocal` is owned and normalized once by the volume integrator. The
 * packed profile sample is the exact representation boundary: all-zero RGBA16F
 * support means every downstream material coefficient is exactly zero.
 */
export function deriveCymaticPlasmaProfileSampleNode({
  signedDistanceWorld,
  profileLookup,
  surfaceNormalWorld,
  surfaceNormalSquaredMagnitude,
  unitRayDirLocal,
  stepSize,
}) {
  const hasSurfaceDirection = surfaceNormalSquaredMagnitude
    .greaterThan(float(NORMAL_EPSILON_SQUARED))
    .toVar();
  const normalDotRay = hasSurfaceDirection
    .select(
      min(
        abs(dot(surfaceNormalWorld, unitRayDirLocal)).mul(
          inverseSqrt(
            max(surfaceNormalSquaredMagnitude, float(NORMAL_EPSILON_SQUARED)),
          ),
        ),
        float(1),
      ),
      float(0),
    )
    .uniformFlow()
    .toVar();
  // The sole production caller passes the nonnegative Gauss interval weight.
  const intervalWidthWorld = stepSize.mul(normalDotRay).toVar();
  const lookupSample = sampleCymaticPlasmaProfileLookupNode(profileLookup, {
    signedDistanceWorld,
    intervalWidthWorld,
  });
  const layerProfiles = lookupSample.profiles.toVar();
  return {
    signedDistanceWorld,
    layerProfiles,
    surfaceNormalSquaredMagnitude,
    hasSurfaceDirection,
    normalDotRay,
    intervalWidthWorld,
  };
}

/**
 * Decompose one persistent signed surface into apparatus-fixed plasma layers.
 *
 * Audio content may change topology, radiance, and colour, but never material
 * thickness. Segment integration makes the same sheet converge across
 * performance tiers without a stochastic offset or a content-dependent blur.
 *
 * @param {{
 *   profileSample: any,
 *   surfaceSupport: any,
 *   fineDetailAuthority?: any,
 *   fineDetailAgreement?: any,
 *   fineResidual?: any,
 * }} inputs
 */
export function deriveCymaticPlasmaCarrierNode({
  profileSample,
  surfaceSupport,
  fineDetailAuthority = null,
  fineDetailAgreement = float(0),
  fineResidual = float(0),
}) {
  const {
    layerProfiles,
    hasSurfaceDirection,
    normalDotRay,
    intervalWidthWorld,
  } = profileSample;
  const surfaceAuthority = hasSurfaceDirection
    .select(surfaceSupport, float(0))
    .uniformFlow()
    .toVar();
  const boundedFineDetailAgreement = clamp(
    fineDetailAgreement,
    float(0),
    float(1),
  );
  const boundedFineResidual = clamp(fineResidual, float(-1), float(1));
  const resolvedFineDetailAuthority = fineDetailAuthority
    ? fineDetailAuthority
    : clamp(
        boundedFineDetailAgreement.mul(
          float(1).add(
            boundedFineResidual.mul(
              float(CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit),
            ),
          ),
        ),
        float(0),
        float(1),
      );
  const materializedFineDetailAuthority = resolvedFineDetailAuthority.toVar();
  const continuitySpineAuthority = surfaceAuthority
    .mul(float(CYMATIC_OBSERVER_REFERENCE.plasmaSpineContinuityAuthority))
    .toVar();
  const detailSpineAuthority = materializedFineDetailAuthority
    .mul(float(CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineLimit))
    .div(
      materializedFineDetailAuthority.add(
        float(CYMATIC_OBSERVER_REFERENCE.plasmaDetailSpineHalfResponse),
      ),
    )
    .mul(surfaceAuthority)
    .toVar();
  const spineAuthority = continuitySpineAuthority.add(detailSpineAuthority);
  const continuityAuthority = surfaceAuthority;
  const continuitySpineProfile = layerProfiles.x;
  const spineProfile = layerProfiles.y;
  const coreProfile = layerProfiles.z;
  const sheathProfile = layerProfiles.w;
  return {
    continuitySpineDensity: continuitySpineProfile
      .mul(
        float(
          CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / TOTAL_LAYER_WEIGHT,
        ),
      )
      .mul(continuitySpineAuthority),
    detailSpineDensity: spineProfile
      .mul(
        float(
          CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / TOTAL_LAYER_WEIGHT,
        ),
      )
      .mul(detailSpineAuthority),
    spineDensity: continuitySpineProfile
      .mul(continuitySpineAuthority)
      .add(spineProfile.mul(detailSpineAuthority))
      .mul(
        float(
          CYMATIC_OBSERVER_REFERENCE.spineEnergyWeight / TOTAL_LAYER_WEIGHT,
        ),
      ),
    coreDensity: coreProfile
      .mul(
        float(CYMATIC_OBSERVER_REFERENCE.coreEnergyWeight / TOTAL_LAYER_WEIGHT),
      )
      .mul(surfaceAuthority),
    sheathDensity: sheathProfile
      .mul(
        float(
          CYMATIC_OBSERVER_REFERENCE.sheathEnergyWeight / TOTAL_LAYER_WEIGHT,
        ),
      )
      .mul(continuityAuthority),
    surfaceAuthority,
    continuitySpineAuthority,
    detailSpineAuthority,
    spineAuthority,
    fineDetailAuthority: materializedFineDetailAuthority,
    continuityAuthority,
    normalDotRay,
    intervalWidthWorld,
  };
}

// Fixed-width cymatic plasma carrier owner end.
