function freezeAudit({
  file,
  startToken,
  endToken,
  requiredTokens = [],
  forbiddenTokens = [],
}) {
  return Object.freeze({
    file,
    startToken,
    endToken,
    requiredTokens: Object.freeze([...requiredTokens]),
    forbiddenTokens: Object.freeze([...forbiddenTokens]),
  });
}

/**
 * Executable source surfaces for ownership properties that are otherwise easy
 * to regress silently. These audits intentionally test semantic boundaries,
 * not formatting or exact implementation structure.
 */
export const RAYMARCH_RENDER_SURFACE_AUDITS = Object.freeze({
  scaleSpaceAperture: freezeAudit({
    file: "fieldCacheBake.js",
    startToken: "function createApertureKernelWeightNode",
    endToken: "// Fixed scale-space aperture owner end.",
    requiredTokens: [
      "CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld",
      "CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld",
      "CYMATIC_OBSERVER_FINE_APERTURE_KERNEL_OFFSETS",
      "CYMATIC_OBSERVER_TOPOLOGY_APERTURE_KERNEL_OFFSETS",
      "filteredFineField",
      "filteredTopologyPotential",
      "spectralMomentSum",
    ],
    forbiddenTokens: [
      "threshold",
      "modalPage",
      "pageIndex",
      "meanColor",
      "spectralAuthority",
    ],
  }),
  completeFieldBake: freezeAudit({
    file: "fieldCacheBake.js",
    startToken: "function assertCymaticObserverBakeOptions",
    endToken: "// Modal field cache bake owner end.",
    requiredTokens: [
      "assertCymaticObserverBakeOptions",
      "createFieldCacheApertureMaterial",
      "createCymaticObserverMaterial",
      "modalFieldSpectralMomentUniforms",
      'names: ["topology", "source", "organization"]',
      "currentTopologyField",
      "observationTimeSeconds",
      "observationAdvancing",
    ],
    forbiddenTokens: [
      "modalPage",
      "pageIndex",
      "fineFieldTexture",
      "uHolographicBaseRadianceGain",
      "uCarrierCoreFwhmWorld",
    ],
  }),
  persistentObserver: freezeAudit({
    file: "cymaticObserverNode.js",
    startToken: "function deriveCurrentObservationSource",
    endToken: "// Stateful cymatic observer GPU owner end.",
    requiredTokens: [
      "currentTopologyField.x.sub(previousTopologyField.x)",
      "currentSource",
      "previousSource",
      "gradientValidity",
      "fineDetailAgreement",
      "fineResidual",
      "previousGeometry",
      "previousAppearance",
      "geometryBlend",
      "radianceBlend",
      "spectralAssimilation",
      "historyPosition",
      "deriveSpectralEvidenceNode",
      "previousAppearance.xy",
      "spectralDirection.x",
      "spectralSeedDirectionNode",
      "resolveSpectralChromaticityNode",
      "spectralChromaticity.r",
      "spectralChromaticity.g",
      "spectralChromaticity.b",
      "deriveFineDetailAuthorityNode",
    ],
    forbiddenTokens: [
      "camera",
      "frameRate",
      "bloom",
      "threshold",
      "opticalFlow",
      "currentFineField",
      "scaleCoherence",
      "spectralPurity",
      "spectralAuthority",
      "staticColor",
      "historyAxes",
      "neighborNumerator",
      "recoverSpectralDirectionNode",
    ],
  }),
  plasmaCarrier: freezeAudit({
    file: "cymaticPlasmaCarrierNode.js",
    startToken: "export function deriveCymaticPlasmaCarrierNode",
    endToken: "// Fixed-width cymatic plasma carrier owner end.",
    requiredTokens: [
      "layerProfiles",
      "fineDetailAgreement",
      "fineResidual",
      "detailSpineAuthority",
      "surfaceAuthority",
      "normalDotRay",
    ],
    forbiddenTokens: [
      "uContourSharpness",
      "uCarrierCoreFwhmWorld",
      "audioEnergy",
      "bloom",
      "spectralPurity",
      "scalePersistence",
    ],
  }),
  plasmaProfiles: freezeAudit({
    file: "cymaticPlasmaProfileLookup.js",
    startToken: "const PROFILE_CHANNEL_FWHM_WORLD",
    endToken: "// Fixed-profile presentation cache owner end.",
    requiredTokens: [
      "continuitySpineWidthRatio",
      "spineWidthRatio",
      "coreWidthRatio",
      "sheathWidthRatio",
      "derivePeakNormalizedGaussianIntervalAverage",
      "HalfFloatType",
      "LinearFilter",
      "sampleCymaticPlasmaProfileLookupNode",
    ],
    forbiddenTokens: [
      "audioEnergy",
      "bloom",
      "spectralPurity",
      "uCarrierCoreFwhmWorld",
    ],
  }),
  plasmaTransferCpu: freezeAudit({
    file: "cymaticPlasmaTransfer.js",
    startToken: "export function deriveCymaticPlasmaTransfer",
    endToken: "// Canonical cymatic plasma optical transfer owner end.",
    requiredTokens: [
      "safeLocalRadiance",
      "organizedContinuitySpineDensity",
      "organizedDetailSpineDensity",
      "organizedSpineDensity",
      "CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION",
      "CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION",
      "organizedCoreDensity",
      "organizedSheathDensity",
      "CYMATIC_PLASMA_EXTINCTION_COEFFICIENT",
      "CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT",
      "CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT",
      "CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT",
      "continuitySpineRadianceAllocation",
      "detailSpineRadianceAllocation",
      "bodyRadianceAllocation",
      "baseRadiance",
      "accentRadiance",
    ],
    forbiddenTokens: [
      "holographicBaseRadianceGain",
      "carrierColumnDensityScale",
      "trapSalience",
      "densityFloor",
    ],
  }),
  plasmaTransferGpu: freezeAudit({
    file: "cymaticPlasmaTransferNode.js",
    startToken: "export function deriveCymaticPlasmaTransferNode",
    endToken: "// Canonical cymatic plasma optical transfer node owner end.",
    requiredTokens: [
      "organizedContinuitySpineDensity",
      "organizedDetailSpineDensity",
      "CYMATIC_PLASMA_CONTINUITY_SPINE_EXCITATION",
      "CYMATIC_PLASMA_DETAIL_SPINE_EXCITATION",
      "organizedCoreDensity",
      "organizedSheathDensity",
      "CYMATIC_PLASMA_EXTINCTION_COEFFICIENT",
      "CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT",
      "CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT",
      "CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT",
      "continuitySpineRadianceAllocation",
      "detailSpineRadianceAllocation",
      "bodyRadianceAllocation",
      "baseRadiance",
      "accentRadiance",
    ],
    forbiddenTokens: [
      "holographicBaseRadianceGain",
      "carrierColumnDensityScale",
      "trapSalience",
      "densityFloor",
    ],
  }),
  productionMaterial: freezeAudit({
    file: "material.js",
    startToken: "function createVolumetricOpticalModel",
    endToken: "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    requiredTokens: [
      "sampleCymaticObserver",
      "deriveCymaticPlasmaCarrierNode",
      "deriveCymaticPlasmaTransferNode",
      "observer.localRadiance",
      "observer.localSpectralChromaticity",
      "observer.localFineDetailAuthority",
      "localSpectralChromaticity",
      "spectralPresentationEnabled",
      "spectralChroma",
      "presentedSpectralChromaticity",
    ],
    forbiddenTokens: [
      "deriveObservationTransfer",
      "trapWeighted",
      "uHolographicBaseRadianceGain",
      "uCarrierCoreFwhmWorld",
      "uContourSharpness",
      "fallback fog",
      "localSpectralColor",
      "localSpectralAuthority",
      "observer.localSpectralChromaticity,",
      "resolveSpectralChromaticityNode(",
      "resolveInterpolatedSpectralChromaticityNode(",
      "uSpectralMix",
      "spectralMix",
      "uSpectralColorEnabled",
      "spectralColorEnabled",
      "spectralColorFieldEnabled",
    ],
  }),
  beerLambertIntegration: freezeAudit({
    file: "SafeVolumetricLightingModel.js",
    startToken: "export function createSafeVolumetricOutputNode",
    endToken: "// Safe volumetric lighting model owner end.",
    requiredTokens: [
      "exp",
      "accumulatedTransmittance",
      "baseRadiance",
      "accentRadiance",
    ],
    forbiddenTokens: ["additive-only", "cameraSlice"],
  }),
  runtimePlasmaProbe: freezeAudit({
    file: "runtimeDiagnostics.js",
    startToken: "function buildPlasmaProbe",
    endToken: "function buildDebugSnapshot",
    requiredTokens: [
      "deriveCymaticPlasmaTransfer",
      "deriveCymaticPlasmaCarrier",
      "detailSpineDensity",
      "preBloomRadiance",
    ],
    forbiddenTokens: [
      "deriveObservationTransfer",
      "deriveAcousticEnergyMaterialTransfer",
      "holographicBaseRadianceGain",
      "trapSalience",
    ],
  }),
});

export function auditRaymarchSourceSurface(surfaceName, source) {
  const audit = RAYMARCH_RENDER_SURFACE_AUDITS[surfaceName];
  if (!audit) {
    throw new Error(`Unknown raymarch source surface audit: ${surfaceName}.`);
  }
  if (typeof source !== "string") {
    throw new Error(
      `Raymarch source surface audit ${surfaceName} requires source text.`,
    );
  }

  const start = source.indexOf(audit.startToken);
  if (start < 0) {
    throw new Error(
      `Raymarch source surface audit ${surfaceName} is missing start token: ${audit.startToken}.`,
    );
  }
  const end = source.indexOf(audit.endToken, start + audit.startToken.length);
  if (end < 0) {
    throw new Error(
      `Raymarch source surface audit ${surfaceName} is missing end token: ${audit.endToken}.`,
    );
  }
  const block = source.slice(start, end);
  for (const token of audit.requiredTokens) {
    if (!block.includes(token)) {
      throw new Error(
        `Raymarch source surface audit ${surfaceName} is missing required token: ${token}.`,
      );
    }
  }
  for (const token of audit.forbiddenTokens) {
    if (block.includes(token)) {
      throw new Error(
        `Raymarch source surface audit ${surfaceName} contains forbidden token: ${token}.`,
      );
    }
  }
  return true;
}
