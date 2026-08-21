import { clamp01 } from "../../utils/math.js";

/**
 * Fixed optical calibration of the virtual cymatic observer.
 *
 * These values belong to the apparatus, not the song, camera, output
 * resolution, performance tier, or post-processing chain.
 */
export const CYMATIC_PLASMA_RADIANCE_GAIN = Math.SQRT2;
export const CYMATIC_PLASMA_EXTINCTION_COEFFICIENT = 0.6;
export const CYMATIC_PLASMA_EMISSION_COEFFICIENT = 0.1125;
export const CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION = 130;
export const CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION = 25;
export const CYMATIC_PLASMA_CORE_EXCITATION = 0.12;
export const CYMATIC_PLASMA_SHEATH_EXCITATION = 0.002;
export const CYMATIC_PLASMA_SPINE_WHITE_MIX = 0;
export const CYMATIC_PLASMA_CORE_WHITE_MIX = 0.02;
export const CYMATIC_PLASMA_INTRINSIC_EMISSION = 0.32;
export const CYMATIC_PLASMA_TANGENT_EMISSION = 0.75;
export const CYMATIC_PLASMA_TANGENT_FOCUS = 1;
export const CYMATIC_PLASMA_TANGENT_APERTURE_FILL = 2;
export const CYMATIC_PLASMA_AUDIO_ACCENT = 0.2;
export const CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT = 24;
export const CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT = 3;
export const CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT = 2;

function readFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readNonnegative(value, fallback = 0) {
  return Math.max(0, readFinite(value, fallback));
}

function readColor(value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [];
  return [
    readNonnegative(source[0], fallback[0]),
    readNonnegative(source[1], fallback[1]),
    readNonnegative(source[2], fallback[2]),
  ];
}

function multiplyColor(color, scalar) {
  return color.map((channel) => channel * scalar);
}

function addColor(left, right) {
  return left.map((channel, index) => channel + (right[index] ?? 0));
}

function mixColor(left, right, amount) {
  return left.map(
    (channel, index) =>
      channel + ((right[index] ?? channel) - channel) * amount,
  );
}

/**
 * Convert persistent observer state into one emission-extinction material.
 *
 * The observer has already resolved the complete field, finite aperture,
 * motion, persistence, radiance, and local spectral colour. This transfer
 * changes none of those quantities. It only gives the fixed-width plasma
 * layers their calibrated optical response.
 */
export function deriveCymaticPlasmaTransfer({
  localRadiance = 0,
  continuitySpineDensity = 0,
  detailSpineDensity = 0,
  coreDensity = 0,
  sheathDensity = 0,
  materialDensityScale = 1,
  materialColor = [1, 1, 1],
  tangentColor = [1, 1, 1],
  normalDotRay = 1,
  tangentAuthority = 0,
  tangentPower = 1,
  audioAccentGain = 0,
} = {}) {
  const safeLocalRadiance = clamp01(readFinite(localRadiance));
  const safeContinuitySpineDensity = readNonnegative(continuitySpineDensity);
  const safeDetailSpineDensity = readNonnegative(detailSpineDensity);
  const safeCoreDensity = readNonnegative(coreDensity);
  const safeSheathDensity = readNonnegative(sheathDensity);
  const safeMaterialDensityScale = readNonnegative(materialDensityScale, 1);
  const organizedContinuitySpineDensity =
    safeContinuitySpineDensity * safeMaterialDensityScale;
  const organizedDetailSpineDensity =
    safeDetailSpineDensity * safeMaterialDensityScale;
  const organizedSpineDensity =
    organizedContinuitySpineDensity + organizedDetailSpineDensity;
  const organizedCoreDensity = safeCoreDensity * safeMaterialDensityScale;
  const organizedSheathDensity = safeSheathDensity * safeMaterialDensityScale;
  const organizedDensity =
    organizedSpineDensity + organizedCoreDensity + organizedSheathDensity;
  const continuitySpineExtinction =
    organizedContinuitySpineDensity * CYMATIC_PLASMA_EXTINCTION_COEFFICIENT;
  const detailSpineExtinction =
    organizedDetailSpineDensity * CYMATIC_PLASMA_EXTINCTION_COEFFICIENT;
  const spineExtinction = continuitySpineExtinction + detailSpineExtinction;
  const bodyExtinction =
    (organizedCoreDensity + organizedSheathDensity) *
    CYMATIC_PLASMA_EXTINCTION_COEFFICIENT;
  const extinction = spineExtinction + bodyExtinction;
  const continuitySpineEmissionSourceStrength =
    organizedContinuitySpineDensity *
    CYMATIC_PLASMA_EMISSION_COEFFICIENT *
    CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION;
  const detailSpineEmissionSourceStrength =
    organizedDetailSpineDensity *
    CYMATIC_PLASMA_EMISSION_COEFFICIENT *
    CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION;
  const spineEmissionSourceStrength =
    continuitySpineEmissionSourceStrength + detailSpineEmissionSourceStrength;
  const coreEmissionSourceStrength =
    organizedCoreDensity *
    CYMATIC_PLASMA_EMISSION_COEFFICIENT *
    CYMATIC_PLASMA_CORE_EXCITATION;
  const sheathEmissionSourceStrength =
    organizedSheathDensity *
    CYMATIC_PLASMA_EMISSION_COEFFICIENT *
    CYMATIC_PLASMA_SHEATH_EXCITATION;
  const emissionSourceStrength =
    spineEmissionSourceStrength +
    coreEmissionSourceStrength +
    sheathEmissionSourceStrength;
  const resolvedMaterialColor = readColor(materialColor, [1, 1, 1]);
  const resolvedTangentColor = readColor(tangentColor, [1, 1, 1]);
  const safeNormalDotRay = clamp01(Math.abs(readFinite(normalDotRay, 1)));
  const safeTangentAuthority = clamp01(readFinite(tangentAuthority));
  const safeTangentPower =
    Math.max(0.01, readFinite(tangentPower, 1)) * CYMATIC_PLASMA_TANGENT_FOCUS;
  const tangentProfile = clamp01(
    (1 - safeNormalDotRay) ** safeTangentPower *
      (safeTangentPower + 1) *
      CYMATIC_PLASMA_TANGENT_APERTURE_FILL,
  );
  const tangentResponse =
    tangentProfile * safeTangentAuthority * CYMATIC_PLASMA_TANGENT_EMISSION;
  const maximumTangentResponse =
    safeTangentAuthority * CYMATIC_PLASMA_TANGENT_EMISSION;
  const spineEmissionColor = mixColor(
    resolvedMaterialColor,
    [1, 1, 1],
    CYMATIC_PLASMA_SPINE_WHITE_MIX,
  );
  const coreEmissionColor = mixColor(
    resolvedMaterialColor,
    [1, 1, 1],
    CYMATIC_PLASMA_CORE_WHITE_MIX,
  );
  const intrinsicContinuitySpineEmissionRadiance = multiplyColor(
    spineEmissionColor,
    continuitySpineEmissionSourceStrength,
  );
  const intrinsicDetailSpineEmissionRadiance = multiplyColor(
    spineEmissionColor,
    detailSpineEmissionSourceStrength,
  );
  const intrinsicSpineEmissionRadiance = addColor(
    intrinsicContinuitySpineEmissionRadiance,
    intrinsicDetailSpineEmissionRadiance,
  );
  const intrinsicBodyEmissionRadiance = addColor(
    multiplyColor(coreEmissionColor, coreEmissionSourceStrength),
    multiplyColor(resolvedMaterialColor, sheathEmissionSourceStrength),
  );
  const intrinsicEmissionRadiance = addColor(
    intrinsicSpineEmissionRadiance,
    intrinsicBodyEmissionRadiance,
  );
  const continuitySpineTangentEmissionSourceStrength =
    continuitySpineEmissionSourceStrength * tangentResponse;
  const detailSpineTangentEmissionSourceStrength =
    detailSpineEmissionSourceStrength * tangentResponse;
  const spineTangentEmissionSourceStrength =
    continuitySpineTangentEmissionSourceStrength +
    detailSpineTangentEmissionSourceStrength;
  const chromaticTangentEmissionSourceStrength =
    (coreEmissionSourceStrength + sheathEmissionSourceStrength) *
    tangentResponse;
  const tangentEmissionSourceStrength =
    spineTangentEmissionSourceStrength + chromaticTangentEmissionSourceStrength;
  const maximumContinuitySpineTangentEmissionSourceStrength =
    continuitySpineEmissionSourceStrength * maximumTangentResponse;
  const maximumDetailSpineTangentEmissionSourceStrength =
    detailSpineEmissionSourceStrength * maximumTangentResponse;
  const maximumSpineTangentEmissionSourceStrength =
    maximumContinuitySpineTangentEmissionSourceStrength +
    maximumDetailSpineTangentEmissionSourceStrength;
  const maximumChromaticTangentEmissionSourceStrength =
    (coreEmissionSourceStrength + sheathEmissionSourceStrength) *
    maximumTangentResponse;
  const tangentEmissionRadiance = addColor(
    multiplyColor(spineEmissionColor, spineTangentEmissionSourceStrength),
    multiplyColor(resolvedTangentColor, chromaticTangentEmissionSourceStrength),
  );
  const unallocatedContinuitySpineBaseRadiance = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicContinuitySpineEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        spineEmissionColor,
        continuitySpineTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const unallocatedDetailSpineBaseRadiance = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicDetailSpineEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        spineEmissionColor,
        detailSpineTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const unallocatedSpineBaseRadiance = addColor(
    unallocatedContinuitySpineBaseRadiance,
    unallocatedDetailSpineBaseRadiance,
  );
  const unallocatedBodyBaseRadiance = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicBodyEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        resolvedTangentColor,
        chromaticTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const unallocatedBaseRadiance = addColor(
    unallocatedSpineBaseRadiance,
    unallocatedBodyBaseRadiance,
  );
  // Calibrate the bounded material against the maximum angular lobe once.
  // Using the local focus response here would act as per-sample auto exposure
  // and erase the fold-width change owned by Laser Focus.
  const unallocatedContinuitySpineRadianceCeiling = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicContinuitySpineEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        spineEmissionColor,
        maximumContinuitySpineTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const unallocatedDetailSpineRadianceCeiling = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicDetailSpineEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        spineEmissionColor,
        maximumDetailSpineTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const unallocatedSpineRadianceCeiling = addColor(
    unallocatedContinuitySpineRadianceCeiling,
    unallocatedDetailSpineRadianceCeiling,
  );
  const unallocatedBodyRadianceCeiling = multiplyColor(
    addColor(
      multiplyColor(
        intrinsicBodyEmissionRadiance,
        CYMATIC_PLASMA_INTRINSIC_EMISSION,
      ),
      multiplyColor(
        resolvedTangentColor,
        maximumChromaticTangentEmissionSourceStrength,
      ),
    ),
    CYMATIC_PLASMA_RADIANCE_GAIN,
  );
  const continuitySpineRadianceLimit =
    continuitySpineExtinction *
    CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT;
  const detailSpineRadianceLimit =
    detailSpineExtinction *
    CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT;
  const bodyRadianceLimit =
    bodyExtinction * CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT;
  const continuitySpineRadianceAllocation = Math.min(
    1,
    continuitySpineRadianceLimit /
      Math.max(Math.max(...unallocatedContinuitySpineRadianceCeiling), 1e-8),
  );
  const detailSpineRadianceAllocation = Math.min(
    1,
    detailSpineRadianceLimit /
      Math.max(Math.max(...unallocatedDetailSpineRadianceCeiling), 1e-8),
  );
  const bodyRadianceAllocation = Math.min(
    1,
    bodyRadianceLimit /
      Math.max(Math.max(...unallocatedBodyRadianceCeiling), 1e-8),
  );
  const continuitySpineBaseRadiance = multiplyColor(
    unallocatedContinuitySpineBaseRadiance,
    continuitySpineRadianceAllocation,
  );
  const detailSpineBaseRadiance = multiplyColor(
    unallocatedDetailSpineBaseRadiance,
    detailSpineRadianceAllocation,
  );
  const spineBaseRadiance = addColor(
    continuitySpineBaseRadiance,
    detailSpineBaseRadiance,
  );
  const bodyBaseRadiance = multiplyColor(
    unallocatedBodyBaseRadiance,
    bodyRadianceAllocation,
  );
  const baseRadiance = addColor(spineBaseRadiance, bodyBaseRadiance);
  const safeAudioAccentGain = readNonnegative(audioAccentGain);
  const safeAudioAccentAuthority = clamp01(
    safeLocalRadiance * safeAudioAccentGain,
  );
  const accentRadiance = multiplyColor(
    baseRadiance,
    CYMATIC_PLASMA_AUDIO_ACCENT * safeAudioAccentAuthority,
  );

  return {
    localRadiance: safeLocalRadiance,
    continuitySpineDensity: safeContinuitySpineDensity,
    detailSpineDensity: safeDetailSpineDensity,
    spineDensity: safeContinuitySpineDensity + safeDetailSpineDensity,
    coreDensity: safeCoreDensity,
    sheathDensity: safeSheathDensity,
    materialDensityScale: safeMaterialDensityScale,
    organizedContinuitySpineDensity,
    organizedDetailSpineDensity,
    organizedSpineDensity,
    organizedCoreDensity,
    organizedSheathDensity,
    organizedDensity,
    continuitySpineExtinction,
    detailSpineExtinction,
    spineExtinction,
    bodyExtinction,
    extinction,
    continuitySpineEmissionSourceStrength,
    detailSpineEmissionSourceStrength,
    spineEmissionSourceStrength,
    coreEmissionSourceStrength,
    sheathEmissionSourceStrength,
    emissionSourceStrength,
    normalDotRay: safeNormalDotRay,
    tangentAuthority: safeTangentAuthority,
    tangentPower: safeTangentPower,
    tangentProfile,
    tangentResponse,
    maximumTangentResponse,
    spineEmissionColor,
    coreEmissionColor,
    intrinsicEmissionRadiance,
    intrinsicContinuitySpineEmissionRadiance,
    intrinsicDetailSpineEmissionRadiance,
    spineTangentEmissionSourceStrength,
    continuitySpineTangentEmissionSourceStrength,
    detailSpineTangentEmissionSourceStrength,
    chromaticTangentEmissionSourceStrength,
    tangentEmissionSourceStrength,
    maximumSpineTangentEmissionSourceStrength,
    maximumContinuitySpineTangentEmissionSourceStrength,
    maximumDetailSpineTangentEmissionSourceStrength,
    maximumChromaticTangentEmissionSourceStrength,
    tangentEmissionRadiance,
    intrinsicSpineEmissionRadiance,
    intrinsicBodyEmissionRadiance,
    unallocatedContinuitySpineBaseRadiance,
    unallocatedDetailSpineBaseRadiance,
    unallocatedSpineBaseRadiance,
    unallocatedBodyBaseRadiance,
    unallocatedBaseRadiance,
    unallocatedContinuitySpineRadianceCeiling,
    unallocatedDetailSpineRadianceCeiling,
    unallocatedSpineRadianceCeiling,
    unallocatedBodyRadianceCeiling,
    continuitySpineRadianceLimit,
    detailSpineRadianceLimit,
    bodyRadianceLimit,
    continuitySpineRadianceAllocation,
    detailSpineRadianceAllocation,
    bodyRadianceAllocation,
    continuitySpineBaseRadiance,
    detailSpineBaseRadiance,
    spineBaseRadiance,
    bodyBaseRadiance,
    audioAccentAuthority: safeAudioAccentAuthority,
    baseRadiance,
    accentRadiance,
    sourceRadiance: addColor(baseRadiance, accentRadiance),
  };
}

// Canonical cymatic plasma optical transfer owner end.
