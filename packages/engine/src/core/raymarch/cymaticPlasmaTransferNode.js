import { clamp, float, max, min, mix, pow, vec3 } from "three/tsl";
import {
  CYMATIC_PLASMA_AUDIO_ACCENT,
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CORE_EXCITATION,
  CYMATIC_PLASMA_CORE_WHITE_MIX,
  CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EMISSION_COEFFICIENT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_INTRINSIC_EMISSION,
  CYMATIC_PLASMA_RADIANCE_GAIN,
  CYMATIC_PLASMA_SHEATH_EXCITATION,
  CYMATIC_PLASMA_SPINE_WHITE_MIX,
  CYMATIC_PLASMA_TANGENT_APERTURE_FILL,
  CYMATIC_PLASMA_TANGENT_EMISSION,
  CYMATIC_PLASMA_TANGENT_FOCUS,
} from "./cymaticPlasmaTransfer.js";

/**
 * Resolve operator-controlled material calibration once per camera fragment.
 *
 * These values do not depend on the quadrature position. Returning explicit
 * variables lets Three place them before the ray loop instead of repeating
 * their clamps and calibration arithmetic at every sample.
 */
export function prepareCymaticPlasmaTransferUniformsNode({
  materialDensityScale,
  tangentAuthority,
  tangentPower,
  audioAccentGain,
}) {
  const safeMaterialDensityScale = max(materialDensityScale, float(0)).toVar();
  const safeTangentAuthority = clamp(
    tangentAuthority,
    float(0),
    float(1),
  ).toVar();
  const safeTangentPower = max(tangentPower, float(0.01))
    .mul(float(CYMATIC_PLASMA_TANGENT_FOCUS))
    .toVar();
  const tangentApertureScale = safeTangentPower
    .add(float(1))
    .mul(float(CYMATIC_PLASMA_TANGENT_APERTURE_FILL))
    .toVar();
  const maximumTangentResponse = safeTangentAuthority
    .mul(float(CYMATIC_PLASMA_TANGENT_EMISSION))
    .toVar();
  const maximumSpineResponseScale = float(CYMATIC_PLASMA_INTRINSIC_EMISSION)
    .add(maximumTangentResponse)
    .mul(float(CYMATIC_PLASMA_RADIANCE_GAIN))
    .toVar();
  const safeAudioAccentGain = max(audioAccentGain, float(0)).toVar();
  return {
    safeMaterialDensityScale,
    safeTangentPower,
    tangentApertureScale,
    maximumTangentResponse,
    maximumSpineResponseScale,
    safeAudioAccentGain,
  };
}

/**
 * GPU projection of deriveCymaticPlasmaTransfer's three production outputs.
 *
 * The CPU owner retains the expanded diagnostic ledger. This node factors the
 * same linear radiance terms before building the shader graph so each camera
 * sample does scalar work once instead of repeating it independently in RGB.
 * The radiance-limit denominators retain the canonical 1e-8 zero-density
 * behavior; no density cancellation or visibility threshold is introduced.
 *
 * @param {{
 *   localRadiance: any,
 *   continuitySpineDensity: any,
 *   detailSpineDensity: any,
 *   coreDensity: any,
 *   sheathDensity: any,
 *   materialColor: any,
 *   tangentColor: any,
 *   normalDotRay: any,
 *   preparedUniforms: any,
 * }} args
 */
export function deriveCymaticPlasmaTransferNode({
  localRadiance,
  continuitySpineDensity,
  detailSpineDensity,
  coreDensity,
  sheathDensity,
  materialColor,
  tangentColor,
  normalDotRay,
  preparedUniforms,
}) {
  const {
    safeMaterialDensityScale,
    safeTangentPower,
    tangentApertureScale,
    maximumTangentResponse,
    maximumSpineResponseScale,
    safeAudioAccentGain,
  } = preparedUniforms;
  const organizedContinuitySpineDensity = continuitySpineDensity.mul(
    safeMaterialDensityScale,
  );
  const organizedDetailSpineDensity = detailSpineDensity.mul(
    safeMaterialDensityScale,
  );
  const organizedCoreDensity = coreDensity.mul(safeMaterialDensityScale);
  const organizedSheathDensity = sheathDensity.mul(safeMaterialDensityScale);

  const continuitySpineExtinction = organizedContinuitySpineDensity.mul(
    float(CYMATIC_PLASMA_EXTINCTION_COEFFICIENT),
  );
  const detailSpineExtinction = organizedDetailSpineDensity.mul(
    float(CYMATIC_PLASMA_EXTINCTION_COEFFICIENT),
  );
  const bodyExtinction = organizedCoreDensity
    .add(organizedSheathDensity)
    .mul(float(CYMATIC_PLASMA_EXTINCTION_COEFFICIENT));
  const extinction = continuitySpineExtinction
    .add(detailSpineExtinction)
    .add(bodyExtinction);

  const continuitySpineEmissionSourceStrength = organizedContinuitySpineDensity
    .mul(float(CYMATIC_PLASMA_EMISSION_COEFFICIENT))
    .mul(float(CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION));
  const detailSpineEmissionSourceStrength = organizedDetailSpineDensity
    .mul(float(CYMATIC_PLASMA_EMISSION_COEFFICIENT))
    .mul(float(CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION));
  const coreEmissionSourceStrength = organizedCoreDensity
    .mul(float(CYMATIC_PLASMA_EMISSION_COEFFICIENT))
    .mul(float(CYMATIC_PLASMA_CORE_EXCITATION));
  const sheathEmissionSourceStrength = organizedSheathDensity
    .mul(float(CYMATIC_PLASMA_EMISSION_COEFFICIENT))
    .mul(float(CYMATIC_PLASMA_SHEATH_EXCITATION));

  const safeMaterialColor = materialColor;
  const safeTangentColor = tangentColor;
  // The carrier owns normalDotRay as a bounded absolute cosine, so the angular
  // response is nonnegative and only its upper saturation remains necessary.
  const tangentProfile = min(
    pow(float(1).sub(normalDotRay), safeTangentPower).mul(tangentApertureScale),
    float(1),
  );
  const tangentResponse = tangentProfile.mul(maximumTangentResponse);

  const spineEmissionColor =
    CYMATIC_PLASMA_SPINE_WHITE_MIX === 0
      ? safeMaterialColor
      : mix(safeMaterialColor, vec3(1), float(CYMATIC_PLASMA_SPINE_WHITE_MIX));
  const coreEmissionColor = mix(
    safeMaterialColor,
    vec3(1),
    float(CYMATIC_PLASMA_CORE_WHITE_MIX),
  );
  const spinePeakColor = max(
    spineEmissionColor.x,
    max(spineEmissionColor.y, spineEmissionColor.z),
  );
  const localSpineResponseScale = float(CYMATIC_PLASMA_INTRINSIC_EMISSION)
    .add(tangentResponse)
    .mul(float(CYMATIC_PLASMA_RADIANCE_GAIN));

  const unallocatedContinuitySpinePeakRadiance =
    continuitySpineEmissionSourceStrength
      .mul(maximumSpineResponseScale)
      .mul(spinePeakColor);
  const unallocatedDetailSpinePeakRadiance = detailSpineEmissionSourceStrength
    .mul(maximumSpineResponseScale)
    .mul(spinePeakColor);
  const continuitySpineRadianceLimit = continuitySpineExtinction.mul(
    float(CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT),
  );
  const detailSpineRadianceLimit = detailSpineExtinction.mul(
    float(CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT),
  );
  const continuitySpineRadianceAllocation = min(
    float(1),
    continuitySpineRadianceLimit.div(
      max(unallocatedContinuitySpinePeakRadiance, float(1e-8)),
    ),
  );
  const detailSpineRadianceAllocation = min(
    float(1),
    detailSpineRadianceLimit.div(
      max(unallocatedDetailSpinePeakRadiance, float(1e-8)),
    ),
  );
  const allocatedSpineEmissionSourceStrength =
    continuitySpineEmissionSourceStrength
      .mul(continuitySpineRadianceAllocation)
      .add(
        detailSpineEmissionSourceStrength.mul(detailSpineRadianceAllocation),
      );
  const spineBaseRadiance = spineEmissionColor.mul(
    allocatedSpineEmissionSourceStrength.mul(localSpineResponseScale),
  );

  const intrinsicBodyEmissionRadiance = coreEmissionColor
    .mul(coreEmissionSourceStrength)
    .add(safeMaterialColor.mul(sheathEmissionSourceStrength))
    .toVar();
  const intrinsicBodyBaseRadiance = intrinsicBodyEmissionRadiance
    .mul(float(CYMATIC_PLASMA_INTRINSIC_EMISSION))
    .toVar();
  const chromaticTangentEmissionSourceStrength = coreEmissionSourceStrength.add(
    sheathEmissionSourceStrength,
  );
  const unallocatedBodyBaseRadiance = intrinsicBodyBaseRadiance
    .add(
      safeTangentColor.mul(
        chromaticTangentEmissionSourceStrength.mul(tangentResponse),
      ),
    )
    .mul(float(CYMATIC_PLASMA_RADIANCE_GAIN));
  const unallocatedBodyRadianceCeiling = intrinsicBodyBaseRadiance
    .add(
      safeTangentColor.mul(
        chromaticTangentEmissionSourceStrength.mul(maximumTangentResponse),
      ),
    )
    .mul(float(CYMATIC_PLASMA_RADIANCE_GAIN));
  const unallocatedBodyPeakRadiance = max(
    unallocatedBodyRadianceCeiling.x,
    max(unallocatedBodyRadianceCeiling.y, unallocatedBodyRadianceCeiling.z),
  );
  const bodyRadianceLimit = bodyExtinction.mul(
    float(CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT),
  );
  const bodyRadianceAllocation = min(
    float(1),
    bodyRadianceLimit.div(max(unallocatedBodyPeakRadiance, float(1e-8))),
  );
  const baseRadiance = spineBaseRadiance.add(
    unallocatedBodyBaseRadiance.mul(bodyRadianceAllocation),
  );
  // Observer appearance is an RGBA16F interpolation of bounded producer
  // lanes, so local radiance already belongs to [0, 1].
  const audioAccentAuthority = min(
    localRadiance.mul(safeAudioAccentGain),
    float(1),
  );
  const accentRadiance = baseRadiance
    .mul(float(CYMATIC_PLASMA_AUDIO_ACCENT))
    .mul(audioAccentAuthority);

  return {
    baseRadiance,
    accentRadiance,
    extinction,
  };
}

// Canonical cymatic plasma optical transfer node owner end.
