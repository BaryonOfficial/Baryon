export const RAYMARCH_QUANTITY_LEDGER_VERSION = "raymarch-render-quantity-v12";

function freezeStringArray(values = []) {
  return Object.freeze([...values]);
}

function freezeStringArrayRecord(value = {}) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entries]) => [
        key,
        freezeStringArray(entries),
      ]),
    ),
  );
}

function createQuantityContract({
  quantity,
  lane,
  surface = "material-transfer",
  represents,
  deepOwner = "material.js material transfer",
  transforms = [],
  allowedConsumerPath = [],
  allowedConsumers = [],
  forbiddenConsumers = [],
  requiredEvidenceByConsumer = {},
}) {
  const resolvedAllowedConsumerPath =
    allowedConsumerPath.length > 0 ? allowedConsumerPath : allowedConsumers;
  return Object.freeze({
    quantity,
    lane,
    surface,
    represents,
    deepOwner,
    transforms: freezeStringArray(transforms),
    allowedConsumerPath: freezeStringArray(resolvedAllowedConsumerPath),
    allowedConsumers: freezeStringArray(allowedConsumers),
    forbiddenConsumers: freezeStringArray(forbiddenConsumers),
    requiredEvidenceByConsumer: freezeStringArrayRecord(
      requiredEvidenceByConsumer,
    ),
  });
}

function createSourceSurfaceAudit({
  surface,
  file,
  owner,
  startToken,
  endToken,
  requiredTokens = [],
  requiredPatterns = [],
  forbiddenTokens = [],
}) {
  return Object.freeze({
    surface,
    file,
    owner,
    startToken,
    endToken,
    requiredTokens: freezeStringArray(requiredTokens),
    requiredPatterns: freezeStringArray(requiredPatterns),
    forbiddenTokens: freezeStringArray(forbiddenTokens),
  });
}

export const RAYMARCH_QUANTITY_LEDGER = Object.freeze({
  sourceEnergy: createQuantityContract({
    quantity: "sourceEnergy",
    lane: "audio-evidence",
    surface: "pipeline",
    represents: "current normalized audio source energy after boundary policy",
    deepOwner:
      "audioSourceEvidence.js resolves source boundaries; modalEnergyLedger.js clamps and publishes it",
    transforms: ["source-boundary resolution", "clamp01"],
    allowedConsumerPath: [
      "audio evidence",
      "modal response",
      "modal energy ledger",
    ],
    allowedConsumers: [
      "storedModalEnergy",
      "projectedRenderEnergy",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "phaseState",
      "sourceRadiance",
      "displayCompression",
    ],
  }),
  sourceBoundaryModalObservationPolicy: createQuantityContract({
    quantity: "sourceBoundaryModalObservationPolicy",
    lane: "audio-evidence",
    surface: "pipeline",
    represents:
      "source-class weak-signal suppression policy before modal observation",
    deepOwner:
      "audioSourceEvidence.js derives policy from source class and source metrics",
    transforms: ["source-boundary classification", "metric thresholding"],
    allowedConsumerPath: [
      "audio evidence",
      "modal observation admission",
      "modal excitation",
    ],
    allowedConsumers: ["modalObservationSuppression", "diagnostics"],
    forbiddenConsumers: [
      "storedModalEnergy",
      "projectedRenderEnergy",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
      "sourceRadiance",
    ],
  }),
  storedModalEnergy: createQuantityContract({
    quantity: "storedModalEnergy",
    lane: "modal-response",
    surface: "pipeline",
    represents:
      "retained modal response energy before render-boundary projection",
    deepOwner:
      "modalResponse.js computes retained response; modalEnergyLedger.js reads it",
    transforms: ["modal response integration", "damping", "clamp01"],
    allowedConsumerPath: ["modal response", "projected render energy"],
    allowedConsumers: ["projectedRenderEnergy", "diagnostics"],
    forbiddenConsumers: [
      "renderAuthority",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "sourceRadiance",
      "displayCompression",
    ],
  }),
  projectedRenderEnergy: createQuantityContract({
    quantity: "projectedRenderEnergy",
    lane: "projection",
    surface: "pipeline",
    represents:
      "bounded render-facing energy after source/render boundary caps",
    deepOwner: "modalEnergyLedger.js",
    transforms: [
      "slot amplitude square",
      "boundary suppression",
      "stored-energy cap",
    ],
    allowedConsumerPath: [
      "modal energy ledger",
      "feature frame render authority",
      "runtime upload authority",
    ],
    allowedConsumers: [
      "renderAuthority",
      "modalAmplitudeCoefficient",
      "observationEnergy",
      "runtimeUploadAuthority",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "phaseState",
      "displayCompression",
    ],
  }),
  modalAmplitudeCoefficient: createQuantityContract({
    quantity: "modalAmplitudeCoefficient",
    lane: "canonical-descriptor",
    surface: "pipeline",
    represents:
      "nonnegative modal coefficient/amplitude uploaded for field synthesis",
    deepOwner:
      "buildFeatureFrame.js publishes slots; modalDescriptor.js canonicalizes them",
    transforms: [
      "projected energy scale",
      "continuity admission",
      "descriptor merge",
    ],
    allowedConsumerPath: [
      "canonical modal descriptor",
      "runtime coefficient upload",
      "field/support synthesis",
    ],
    allowedConsumers: [
      "runtimeUploadAuthority",
      "signedField",
      "unsignedSupport",
      "structuralProjectionDrive",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "phaseState",
      "displayCompression",
    ],
  }),
  modalIdentityTopology: createQuantityContract({
    quantity: "modalIdentityTopology",
    lane: "canonical-descriptor",
    surface: "pipeline",
    represents: "canonical modal tuple identity and basis-cache topology",
    deepOwner:
      "modalDescriptor.js and fieldCache.js basis identity descriptors",
    transforms: [
      "descriptor admission",
      "stable slot assignment",
      "basis page assignment",
    ],
    allowedConsumerPath: [
      "canonical modal descriptor",
      "runtime upload authority",
      "basis/cache topology",
    ],
    allowedConsumers: [
      "runtimeUploadAuthority",
      "basisIdentity",
      "modalBasisCacheDescriptor",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalAmplitudeCoefficient",
      "phaseState",
      "phaseAuthorityCoherence",
      "displayCompression",
    ],
  }),
  runtimeUploadAuthority: createQuantityContract({
    quantity: "runtimeUploadAuthority",
    lane: "runtime-upload",
    surface: "pipeline",
    represents:
      "single writer authority for live GPU buffers and cache submissions",
    deepOwner: "runtime.js applyRaymarchRuntimeUploadAuthority",
    transforms: [
      "capacity selection",
      "buffer upload",
      "cache descriptor publication",
    ],
    allowedConsumerPath: [
      "runtime upload authority",
      "live buffers",
      "basis/cache topology",
    ],
    allowedConsumers: [
      "liveBuffers",
      "modalBasisCacheDescriptor",
      "liveFieldProjectionCache",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "sourceEnergy",
      "storedModalEnergy",
      "projectedRenderEnergy",
      "displayCompression",
    ],
  }),
  phaseState: createQuantityContract({
    quantity: "phaseState",
    lane: "phase",
    surface: "pipeline",
    represents: "phase offset and angular velocity for live phase motion",
    deepOwner:
      "modalPhaseSlots.js publishes phase slots; runtime.js uploads them",
    transforms: ["unwrap", "velocity clamp", "time evaluation"],
    allowedConsumerPath: [
      "phase slots",
      "phase interference carrier",
      "material transfer modulation",
    ],
    allowedConsumers: [
      "interferenceContrast",
      "phaseInterferenceTransfer",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
      "projectedRenderEnergy",
    ],
  }),
  phaseAuthorityCoherence: createQuantityContract({
    quantity: "phaseAuthorityCoherence",
    lane: "phase",
    surface: "pipeline",
    represents:
      "bounded confidence that phase state may affect interference transfer",
    deepOwner:
      "modalPhaseSlots.js and fieldCache.js phase interference projection",
    transforms: ["coherence times authority", "support weighting", "clamp01"],
    allowedConsumerPath: [
      "phase authority/coherence",
      "phase interference carrier",
      "material transfer modulation",
    ],
    allowedConsumers: [
      "interferenceContrast",
      "phaseInterferenceAuthority",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
      "projectedRenderEnergy",
      "sourceRadiance",
    ],
  }),
  signedField: createQuantityContract({
    quantity: "signedField",
    lane: "field",
    surface: "pipeline",
    represents: "signed modal field after coefficient-weighted basis summation",
    deepOwner:
      "fieldCache.js live projection cache; material.js direct synthesis only while no committed cache is active",
    transforms: ["basis evaluation", "coefficient weighting", "normalization"],
    allowedConsumerPath: [
      "live buffers",
      "field/support carriers",
      "pressure/radiation carrier",
      "material transfer",
    ],
    allowedConsumers: [
      "normalizedPressure",
      "cancellation",
      "matchedFieldGradient",
      "diagnostics",
    ],
    forbiddenConsumers: ["displayCompression", "modalIdentityTopology"],
  }),
  normalizedPressure: createQuantityContract({
    quantity: "normalizedPressure",
    lane: "field",
    surface: "pipeline",
    represents:
      "normalized signed pressure proxy derived from coherent modal summation, not calibrated pascals",
    deepOwner: "fieldCache.js pressure/radiation carrier",
    transforms: [
      "coherent signed modal summation",
      "slot-amplitude normalization",
      "signed-unit clamp",
      "pressure/radiation texture write",
    ],
    allowedConsumerPath: [
      "field/support carriers",
      "pressure/radiation carrier",
      "diagnostics",
    ],
    allowedConsumers: [
      "cancellation",
      "normalizedRadiationPotential",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "displayCompression",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "fixedWorldSpaceCarrierDensity",
      "sourceRadiance",
      "laserIrradiance",
    ],
  }),
  normalizedVelocityProxy: createQuantityContract({
    quantity: "normalizedVelocityProxy",
    lane: "field",
    surface: "pipeline",
    represents:
      "normalized gradient-magnitude proxy for particle velocity, not calibrated fluid velocity",
    deepOwner: "fieldCache.js pressure/radiation carrier",
    transforms: [
      "coherent modal gradient summation",
      "slot-amplitude normalization",
      "gradient magnitude",
      "clamp01",
    ],
    allowedConsumerPath: [
      "field gradients",
      "pressure/radiation carrier",
      "diagnostics",
    ],
    allowedConsumers: ["normalizedRadiationPotential", "diagnostics"],
    forbiddenConsumers: [
      "displayCompression",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "fixedWorldSpaceCarrierDensity",
      "sourceRadiance",
      "matchedFieldGradient",
    ],
  }),
  normalizedRadiationPotential: createQuantityContract({
    quantity: "normalizedRadiationPotential",
    lane: "field",
    surface: "pipeline",
    represents:
      "visualization-only normalized pressure-energy minus velocity-energy balance gated by explicit material contrast",
    deepOwner: "fieldCache.js pressure/radiation carrier",
    transforms: [
      "normalized pressure energy",
      "normalized velocity-proxy energy",
      "explicit material-contrast weighting",
      "signed-unit clamp",
    ],
    allowedConsumerPath: ["pressure/radiation carrier", "diagnostics"],
    allowedConsumers: ["diagnostics"],
    forbiddenConsumers: [
      "displayCompression",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "fixedWorldSpaceCarrierDensity",
      "sourceRadiance",
      "topologyAdmission",
      "matchedFieldGradient",
    ],
  }),
  unsignedSupport: createQuantityContract({
    quantity: "unsignedSupport",
    lane: "support",
    surface: "pipeline",
    represents: "unsigned local field support before radiance transfer",
    deepOwner: "fieldCache.js and material.js live support synthesis",
    transforms: ["absolute field contribution sum", "amplitude normalization"],
    allowedConsumerPath: ["field/support carriers", "diagnostics"],
    allowedConsumers: ["cancellation", "diagnostics"],
    forbiddenConsumers: ["sourceRadiance", "extinction"],
  }),
  cancellation: createQuantityContract({
    quantity: "cancellation",
    lane: "field",
    surface: "pipeline",
    represents:
      "destructive-interference ratio derived from signed field and support",
    deepOwner: "fieldCache.js deriveLiveSynthesisCancellationRatio",
    transforms: ["abs signed field over unsigned support", "clamp01"],
    allowedConsumerPath: ["field/support carriers", "diagnostics"],
    allowedConsumers: ["diagnostics"],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "sourceRadiance",
    ],
  }),
  interferenceContrast: createQuantityContract({
    quantity: "interferenceContrast",
    lane: "phase",
    surface: "pipeline",
    represents: "signed coherent-versus-independent phase energy contrast",
    deepOwner: "fieldCache.js phase interference carrier",
    transforms: [
      "phase coherent energy",
      "independent phase energy",
      "signed contrast normalization",
    ],
    allowedConsumerPath: ["phase interference diagnostics"],
    allowedConsumers: ["diagnostics"],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
    ],
  }),
  displayCompression: createQuantityContract({
    quantity: "displayCompression",
    lane: "display",
    surface: "pipeline",
    represents:
      "post-material scene-referred luminance and bloom headroom compression",
    deepOwner: "displayRadiance.js and outputPipeline.js",
    transforms: [
      "luminance shoulder",
      "channel ceiling",
      "bloom headroom scale",
    ],
    allowedConsumerPath: [
      "material radiance",
      "display compression",
      "final output",
    ],
    allowedConsumers: ["finalOutput", "displayDiagnostics"],
    forbiddenConsumers: [
      "sourceEnergy",
      "storedModalEnergy",
      "projectedRenderEnergy",
      "modalAmplitudeCoefficient",
      "modalIdentityTopology",
      "runtimeUploadAuthority",
    ],
  }),
  displayProjectionAmplitude: createQuantityContract({
    quantity: "displayProjectionAmplitude",
    lane: "display",
    surface: "pipeline",
    represents: "display-only projection shortlist amplitude after ranking",
    deepOwner: "modalExcitation.js buildProjectionShortlist",
    transforms: ["display score", "rank/cap shortlist", "clamp01"],
    allowedConsumerPath: [
      "projection shortlist",
      "display slot amplitude",
      "material transfer",
    ],
    allowedConsumers: [
      "displaySlotAmplitude",
      "displayShortlist",
      "spectralLightColor",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "storedModalEnergy",
      "projectedRenderEnergy",
      "modalAmplitudeCoefficient",
      "modalIdentityTopology",
      "renderAuthority",
      "sourceRadiance",
    ],
  }),
  spectralLanePacket: createQuantityContract({
    quantity: "spectralLanePacket",
    lane: "spectral",
    surface: "pipeline",
    represents:
      "per-modal normalized wavelength-lane distribution plus phase, spread, confidence, and display-energy metadata",
    deepOwner:
      "modalExcitation.js createEntrySpectralLightComponent and writeLayerEntry",
    transforms: [
      "octave-folded spectral phase",
      "lane-kernel normalization",
      "packed lane storage",
    ],
    allowedConsumerPath: [
      "modal spectral packet",
      "canonical modal descriptor",
      "spectral lane cache",
    ],
    allowedConsumers: [
      "spectralLaneRadiance",
      "runtimeUploadAuthority",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "spectralDisplayProjection",
      "displayCompression",
      "staticColor",
      "rgbAverage",
      "renderAuthority",
      "projectedRenderEnergy",
    ],
    requiredEvidenceByConsumer: {
      spectralLaneRadiance: ["laneDistribution", "modal coefficient"],
    },
  }),
  spectralLaneRadiance: createQuantityContract({
    quantity: "spectralLaneRadiance",
    lane: "spectral",
    surface: "field-cache",
    represents:
      "nonnegative local spectral lane radiance after modal structural support and lane distribution are applied; display energy and spectral confidence remain packet metadata, not extinguishing radiance gates",
    deepOwner: "fieldCache.js spectral lane cache compute",
    transforms: [
      "basis support sampling",
      "modal coefficient weighting",
      "lane radiance accumulation",
      "dominance and entropy diagnostics",
      "support-weighted spectral confidence diagnostics",
    ],
    allowedConsumerPath: [
      "spectral lane cache",
      "material spectral lane transfer",
      "display projection",
    ],
    allowedConsumers: [
      "spectralDisplayProjection",
      "spectralLaneDiagnostics",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "staticColor",
      "rgbAverage",
      "modalFieldColorBuffer",
      "displayCompression",
      "renderAuthority",
      "projectedRenderEnergy",
    ],
  }),
  spectralDisplayProjection: createQuantityContract({
    quantity: "spectralDisplayProjection",
    lane: "spectral",
    surface: "material-transfer",
    represents:
      "unit-luminance linear RGB chromaticity projected from spectral lane ratios",
    deepOwner: "material.js spectral lane-to-chromaticity projection",
    transforms: [
      "lane texture sampling",
      "normalized lane RGB projection",
      "linear-luminance chromaticity normalization",
    ],
    allowedConsumerPath: [
      "material spectral lane transfer",
      "material chromaticity",
      "laser-excited emission source radiance",
    ],
    allowedConsumers: ["materialChromaticity", "sourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "spectralLanePacket",
      "spectralLaneRadiance",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
      "staticColor",
      "rgbAverage",
      "organizedDensity",
      "incidentLaserIrradiance",
    ],
  }),
  diagnostics: createQuantityContract({
    quantity: "diagnostics",
    lane: "diagnostics",
    surface: "pipeline",
    represents: "read-only audit and probe values",
    deepOwner: "producer-specific debug snapshots",
    transforms: ["sampling", "summarization", "serialization"],
    allowedConsumerPath: ["owner-owned quantity", "diagnostics"],
    allowedConsumers: ["debugSnapshot", "tests", "developerTools"],
    forbiddenConsumers: [
      "renderAuthority",
      "runtimeUploadAuthority",
      "projectedRenderEnergy",
      "sourceRadiance",
    ],
  }),
  structuralProjectionDrive: createQuantityContract({
    quantity: "structuralProjectionDrive",
    lane: "structural",
    represents: "normalized modal structural energy drive",
    transforms: ["energy normalization", "bounded support projection"],
    allowedConsumers: [
      "modalCoefficientEnergy",
      "detectorIntegratedAcousticEnergy",
      "diagnostics",
    ],
    forbiddenConsumers: ["phaseCurrent", "topologyIdentity", "sourceRadiance"],
  }),
  modalCoefficientEnergy: createQuantityContract({
    quantity: "modalCoefficientEnergy",
    lane: "structural",
    represents: "bounded canonical modal coefficient energy",
    transforms: ["clamp01", "structural projection drive"],
    allowedConsumers: ["detectorIntegratedAcousticEnergy", "diagnostics"],
    forbiddenConsumers: [
      "phaseCurrent",
      "topologyIdentity",
      "rawAmplitudeNormalizer",
    ],
  }),
  modalEnergyAmplitude: createQuantityContract({
    quantity: "modalEnergyAmplitude",
    lane: "structural",
    represents:
      "RMS modal coefficient amplitude equal to the square root of summed canonical modal coefficient energy",
    deepOwner:
      "fieldCache.js derives the represented energy; runtime.js publishes uModalEnergyAmplitude",
    transforms: ["canonical modal coefficient energy sum", "square root"],
    allowedConsumerPath: [
      "canonical modal coefficient energy",
      "field and gradient normalization",
      "diagnostics",
    ],
    allowedConsumers: [
      "normalizedPressure",
      "normalizedGradient",
      "normalizedUnsignedSupport",
      "diagnostics",
    ],
    forbiddenConsumers: ["sourceRadiance", "displayCompression"],
  }),
  matchedFieldGradient: createQuantityContract({
    quantity: "matchedFieldGradient",
    lane: "field",
    surface: "field-cache",
    represents:
      "coherent scalar pressure proxy and its spatial gradient in one matched linear-amplitude representation",
    deepOwner:
      "fieldCache.js live field texture; material.js direct synthesis mirrors the same tuple",
    transforms: [
      "coherent modal basis summation",
      "shared coefficient-amplitude normalization when direct synthesis is active",
      "single RGBA tuple storage",
    ],
    allowedConsumerPath: [
      "live field projection",
      "local zero-set distance",
      "fixed world-space carrier",
    ],
    allowedConsumers: [
      "localZeroSetDistance",
      "fixedWorldSpaceCarrierDensity",
      "carrierNormalViewCosine",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "detectorIntegratedAcousticEnergy",
      "sourceRadiance",
      "displayCompression",
    ],
  }),
  localZeroSetDistance: createQuantityContract({
    quantity: "localZeroSetDistance",
    lane: "carrier",
    represents:
      "amplitude-invariant local distance to the pressure zero set, abs(field) divided by gradient magnitude, in normalized cavity world units",
    deepOwner: "carrierDensityNode.js deriveFixedWorldSpaceCarrierDensityNode",
    transforms: [
      "absolute scalar field",
      "matched gradient magnitude",
      "degenerate-gradient rejection",
    ],
    allowedConsumers: ["fixedWorldSpaceCarrierDensity", "diagnostics"],
    forbiddenConsumers: [
      "sourceRadiance",
      "incidentLaserIrradiance",
      "displayCompression",
    ],
  }),
  fixedWorldSpaceCarrierDensity: createQuantityContract({
    quantity: "fixedWorldSpaceCarrierDensity",
    lane: "carrier",
    represents:
      "unit-area core and sheath concentration sampled over the ray interval in normalized cavity coordinates",
    deepOwner: "carrierDensityNode.js deriveFixedWorldSpaceCarrierDensityNode",
    transforms: [
      "fixed core FWHM",
      "fixed sheath-to-core width ratio",
      "fixed normalized core/sheath energy split",
      "Gaussian interval integration",
    ],
    allowedConsumers: [
      "organizedCoreDensity",
      "organizedSheathDensity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "radialVisibilityCompensation",
      "centerVisibilityCompensation",
      "edgeVisibilityCompensation",
      "profileVisibilityCompensation",
      "frameVisibilityCompensation",
    ],
  }),
  carrierNormalViewCosine: createQuantityContract({
    quantity: "carrierNormalViewCosine",
    lane: "optical-detector",
    represents:
      "absolute cosine between the matched local zero-set normal and current ray direction",
    deepOwner: "carrierDensityNode.js deriveFixedWorldSpaceCarrierDensityNode",
    transforms: [
      "matched gradient normalization",
      "absolute dot with local ray direction",
      "unit-interval clamp at the Fresnel consumer",
    ],
    allowedConsumers: ["holographicFresnelEmission", "diagnostics"],
    forbiddenConsumers: [
      "organizedCoreDensity",
      "organizedSheathDensity",
      "organizedDensity",
      "sigmaS",
      "sigmaA",
      "extinction",
      "incidentLaserIrradiance",
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "frameVisibilityCompensation",
    ],
  }),
  detectorIntegratedAcousticEnergy: createQuantityContract({
    quantity: "detectorIntegratedAcousticEnergy",
    lane: "energy",
    represents:
      "nonnegative normalized acoustic energy after finite detector-window integration of coherent cross terms",
    deepOwner:
      "fieldCache.js detector integration; material.js consumes its detector-integrated and independent spatial energy with phase authority",
    transforms: [
      "modal coefficient energy",
      "frequency-separation sinc window",
      "phase cross-term integration",
      "incoherent residual preservation",
      "local spatial-energy normalization",
    ],
    allowedConsumers: [
      "organizedCoreDensity",
      "organizedSheathDensity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "frameVisibilityCompensation",
      "displayCompression",
    ],
  }),
  materialChromaticity: createQuantityContract({
    quantity: "materialChromaticity",
    lane: "optical-material",
    represents:
      "nonnegative linear RGB chromaticity normalized to unit luminance; static and spectral modes own color ratios only",
    deepOwner: "material.js normalizeMaterialChromaticityNode",
    transforms: [
      "nonnegative RGB clamp",
      "linear-luminance normalization",
      "spectral-lane RGB projection",
    ],
    allowedConsumers: [
      "baseSourceRadiance",
      "accentSourceRadiance",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "organizedDensity",
      "sigmaS",
      "sigmaA",
      "extinction",
      "incidentLaserIrradiance",
      "pitchVisibilityCompensation",
    ],
  }),
  surfaceChromaticity: createQuantityContract({
    quantity: "surfaceChromaticity",
    lane: "optical-material",
    represents:
      "nonnegative unit-luminance linear RGB tint used only by the grazing-angle emission lane",
    deepOwner: "material.js normalizeMaterialChromaticityNode",
    transforms: ["nonnegative RGB clamp", "linear-luminance normalization"],
    allowedConsumers: ["baseSourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "organizedDensity",
      "sigmaS",
      "sigmaA",
      "extinction",
      "incidentLaserIrradiance",
    ],
  }),
  holographicFresnelEmission: createQuantityContract({
    quantity: "holographicFresnelEmission",
    lane: "optical-detector",
    represents:
      "bounded grazing-angle emission authority from carrier normal-view cosine and explicit holographic controls",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "one minus absolute normal-view cosine",
      "explicit Fresnel power",
      "bounded holographic intensity",
    ],
    allowedConsumers: ["fresnelEmissionSourceStrength", "diagnostics"],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "organizedDensity",
      "sigmaS",
      "sigmaA",
      "extinction",
      "incidentLaserIrradiance",
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "frameVisibilityCompensation",
    ],
  }),
  materialDensityScale: createQuantityContract({
    quantity: "materialDensityScale",
    lane: "optical-material",
    represents:
      "nonnegative dimensionless operator scale applied once to organized core and sheath material",
    deepOwner:
      "material.js normalizes densityGain against the shipped material-density baseline",
    transforms: [
      "density gain divided by reference density gain",
      "nonnegative clamp",
    ],
    allowedConsumers: [
      "organizedCoreDensity",
      "organizedSheathDensity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "scatteringCoefficient",
      "absorptionCoefficient",
      "laserExcitedEmissionCoefficient",
    ],
  }),
  carrierColumnDensityScale: createQuantityContract({
    quantity: "carrierColumnDensityScale",
    lane: "optical-material",
    represents:
      "bounded [0,1] column-density normalization derived from the admitted modes' energy-weighted RMS spatial wavenumber",
    deepOwner:
      "observationTransfer.js derives the scale; fieldCache.js owns the descriptor wavenumber statistic",
    transforms: [
      "reference wavenumber divided by admitted RMS spatial wavenumber",
      "clamp to [minScale, 1]",
    ],
    allowedConsumers: [
      "organizedCoreDensity",
      "organizedSheathDensity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "materialDensityScale",
      "scatteringCoefficient",
      "absorptionCoefficient",
      "laserExcitedEmissionCoefficient",
      "displayCompression",
    ],
  }),
  scatteringCoefficient: createQuantityContract({
    quantity: "scatteringCoefficient",
    lane: "optical-material",
    represents: "fixed dimensionless scattering interaction coefficient",
    deepOwner: "observationTransfer.js fixed reference coefficient",
    transforms: ["nonnegative material calibration"],
    allowedConsumers: ["sigmaS", "diagnostics"],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "displayCompression",
    ],
  }),
  absorptionCoefficient: createQuantityContract({
    quantity: "absorptionCoefficient",
    lane: "optical-material",
    represents: "fixed dimensionless absorption interaction coefficient",
    deepOwner: "observationTransfer.js fixed reference coefficient",
    transforms: ["nonnegative material calibration"],
    allowedConsumers: ["sigmaA", "extinction", "diagnostics"],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "sourceRadiance",
    ],
  }),
  laserExcitedEmissionCoefficient: createQuantityContract({
    quantity: "laserExcitedEmissionCoefficient",
    lane: "optical-material",
    represents:
      "scene-linear radiance emitted per unit organized carrier density and per normalized path length",
    deepOwner: "observationTransfer.js fixed reference coefficient",
    transforms: ["nonnegative material calibration"],
    allowedConsumers: [
      "emissionSourceStrength",
      "coreEmissionSourceStrength",
      "sheathEmissionSourceStrength",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "sigmaS",
      "sigmaA",
      "extinction",
      "displayCompression",
    ],
  }),
  organizedCoreDensity: createQuantityContract({
    quantity: "organizedCoreDensity",
    lane: "material-transfer",
    represents:
      "core carrier concentration weighted once by detector-integrated acoustic energy per normalized cavity length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "core density times detector-integrated acoustic energy",
      "material density scale applied once",
    ],
    allowedConsumers: [
      "organizedDensity",
      "coreEmissionSourceStrength",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "frameVisibilityCompensation",
      "displayCompression",
    ],
  }),
  organizedSheathDensity: createQuantityContract({
    quantity: "organizedSheathDensity",
    lane: "material-transfer",
    represents:
      "linked sheath carrier concentration weighted once by detector-integrated acoustic energy per normalized cavity length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "sheath density times detector-integrated acoustic energy",
      "material density scale applied once",
    ],
    allowedConsumers: [
      "organizedDensity",
      "sheathEmissionSourceStrength",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "frameVisibilityCompensation",
      "displayCompression",
    ],
  }),
  organizedDensity: createQuantityContract({
    quantity: "organizedDensity",
    lane: "material-transfer",
    represents:
      "sum of organized core and sheath concentrations per normalized cavity length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "organized core density plus organized sheath density",
      "nonnegative clamp",
    ],
    allowedConsumers: [
      "sigmaS",
      "sigmaA",
      "emissionSourceStrength",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "radialVisibilityCompensation",
      "centerVisibilityCompensation",
      "edgeVisibilityCompensation",
      "profileVisibilityCompensation",
      "frameVisibilityCompensation",
    ],
  }),
  sigmaS: createQuantityContract({
    quantity: "sigmaS",
    lane: "material-transfer",
    represents:
      "local scattering extinction coefficient in inverse normalized cavity lengths",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: ["organized density times scattering coefficient"],
    allowedConsumers: ["extinction", "diagnostics"],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "displayCompression",
    ],
  }),
  sigmaA: createQuantityContract({
    quantity: "sigmaA",
    lane: "material-transfer",
    represents:
      "local absorption extinction coefficient in inverse normalized cavity lengths",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: ["organized density times absorption coefficient"],
    allowedConsumers: ["extinction", "diagnostics"],
    forbiddenConsumers: [
      "sourceRadiance",
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
    ],
  }),
  extinction: createQuantityContract({
    quantity: "extinction",
    lane: "material-transfer",
    represents:
      "sum of local scattering and absorption coefficients in inverse normalized cavity lengths",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: ["sigmaS plus sigmaA"],
    allowedConsumers: ["volumeTransmittance", "opacity", "diagnostics"],
    forbiddenConsumers: [
      "sourceRadiance",
      "materialChromaticity",
      "displayCompression",
    ],
  }),
  emissionSourceStrength: createQuantityContract({
    quantity: "emissionSourceStrength",
    lane: "material-transfer",
    represents:
      "isotropic scene-linear laser-excited source radiance per normalized path length before chromaticity and lane gain",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: ["organized density times laser-excited emission coefficient"],
    allowedConsumers: ["fresnelEmissionSourceStrength", "diagnostics"],
    forbiddenConsumers: [
      "sigmaS",
      "sigmaA",
      "extinction",
      "fixedWorldSpaceCarrierDensity",
      "displayCompression",
    ],
  }),
  coreEmissionSourceStrength: createQuantityContract({
    quantity: "coreEmissionSourceStrength",
    lane: "material-transfer",
    represents:
      "intrinsic scene-linear source strength of the narrow organized carrier core per normalized path length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "organized core density times laser-excited emission coefficient",
    ],
    allowedConsumers: ["baseSourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "sigmaS",
      "sigmaA",
      "extinction",
      "displayCompression",
    ],
  }),
  sheathEmissionSourceStrength: createQuantityContract({
    quantity: "sheathEmissionSourceStrength",
    lane: "material-transfer",
    represents:
      "intrinsic scene-linear source strength of the linked organized sheath per normalized path length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "organized sheath density times laser-excited emission coefficient",
    ],
    allowedConsumers: ["baseSourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "sigmaS",
      "sigmaA",
      "extinction",
      "displayCompression",
    ],
  }),
  fresnelEmissionSourceStrength: createQuantityContract({
    quantity: "fresnelEmissionSourceStrength",
    lane: "material-transfer",
    represents:
      "additive scene-linear grazing-angle source strength before volume integration",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "intrinsic emission source strength",
      "bounded holographic Fresnel authority",
      "fixed display-optics Fresnel emission gain",
    ],
    allowedConsumers: ["baseSourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "sigmaS",
      "sigmaA",
      "extinction",
      "displayCompression",
    ],
  }),
  incidentLaserIrradiance: createQuantityContract({
    quantity: "incidentLaserIrradiance",
    lane: "optical-transport",
    represents:
      "relative scene-linear total and zero-order optical power per area from the current transport apparatus profile",
    deepOwner:
      "laserTransport.js simultaneous ray and order resolve plus its transport texture",
    transforms: [
      "fixed energy-conserving reference and diffracted order split",
      "nonnegative computed irradiance",
    ],
    allowedConsumers: ["laserCausticAccentAuthority", "diagnostics"],
    forbiddenConsumers: [
      "holographicBaseRadiance",
      "baseSourceRadiance",
      "organizedDensity",
      "sigmaS",
      "sigmaA",
      "extinction",
      "fixedWorldSpaceCarrierDensity",
    ],
  }),
  holographicBaseRadianceGain: createQuantityContract({
    quantity: "holographicBaseRadianceGain",
    lane: "calibration",
    represents:
      "nonnegative dimensionless emission-radiance calibration gain selected by the target logarithmic sweep with no unity ceiling",
    deepOwner:
      "observationCalibration.js evidence selector; visualizationUniforms.js holds the unselected fail-closed runtime value",
    transforms: [
      "half-stop evidence search",
      "lowest complete passing selection",
    ],
    allowedConsumers: [
      "baseSourceRadiance",
      "accentSourceRadiance",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "organizedDensity",
      "extinction",
      "laserCausticAccentAuthority",
    ],
  }),
  laserCausticAccentAuthority: createQuantityContract({
    quantity: "laserCausticAccentAuthority",
    lane: "optical-transport",
    represents:
      "bounded readiness-gated positive excess of current total irradiance above the attenuated zero-order straight reference",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror; the material consumes it through the test-only off/current selector under the signed approve-base decision",
    transforms: [
      "attenuated zero-order reference",
      "positive excess",
      "bounded compression",
      "zero-preserving connected peak response",
      "readiness gating",
    ],
    allowedConsumers: ["accentSourceRadiance", "diagnostics"],
    forbiddenConsumers: [
      "baseSourceRadiance",
      "holographicBaseRadianceGain",
      "fixedWorldSpaceCarrierDensity",
      "organizedDensity",
      "extinction",
    ],
  }),
  baseSourceRadiance: createQuantityContract({
    quantity: "baseSourceRadiance",
    lane: "material-transfer",
    represents:
      "scene-linear holographic base source radiance per normalized path length before volume integration",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "white-point core chromaticity times core emission source strength",
      "material chromaticity times sheath emission source strength",
      "surface-tinted chromaticity times Fresnel emission source strength",
      "holographic base radiance gain",
    ],
    allowedConsumers: [
      "accentSourceRadiance",
      "sourceRadiance",
      "volumeBaseRadiance",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "laserTransportReady",
      "incidentLaserIrradiance",
      "laserCausticAccentAuthority",
      "extinction",
    ],
  }),
  accentSourceRadiance: createQuantityContract({
    quantity: "accentSourceRadiance",
    lane: "material-transfer",
    represents:
      "scene-linear laser-caustic accent source radiance per normalized path length before volume integration",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: [
      "bounded fraction of calibrated base source radiance",
      "bounded laser accent authority",
    ],
    allowedConsumers: ["sourceRadiance", "volumeAccentRadiance", "diagnostics"],
    forbiddenConsumers: [
      "baseSourceRadiance",
      "fixedWorldSpaceCarrierDensity",
      "extinction",
    ],
  }),
  sourceRadiance: createQuantityContract({
    quantity: "sourceRadiance",
    lane: "material-transfer",
    represents:
      "sum of base and accent scene-linear source radiance per normalized path length",
    deepOwner:
      "observationTransfer.js CPU oracle and observationTransferNode.js GPU mirror",
    transforms: ["base source radiance plus accent source radiance"],
    allowedConsumers: [
      "volumeRadianceIntegral",
      "displayCompression",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "organizedDensity",
      "extinction",
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "radialVisibilityCompensation",
      "centerVisibilityCompensation",
      "edgeVisibilityCompensation",
      "profileVisibilityCompensation",
      "frameVisibilityCompensation",
    ],
  }),
  laserTransportReady: createQuantityContract({
    quantity: "laserTransportReady",
    lane: "optical-transport",
    represents:
      "bounded authority permitting the current transport result to contribute only to laser caustic accent evaluation",
    deepOwner: "laserTransport.js readiness channel",
    transforms: ["boolean or bounded readiness normalization"],
    allowedConsumers: ["laserCausticAccentAuthority", "diagnostics"],
    forbiddenConsumers: [
      "organizedDensity",
      "fixedWorldSpaceCarrierDensity",
      "detectorIntegratedAcousticEnergy",
      "baseSourceRadiance",
    ],
  }),
  volumeBaseRadiance: createQuantityContract({
    quantity: "volumeBaseRadiance",
    lane: "volume-integration",
    represents:
      "premultiplied base radiance integrated along the production ray under the shared transmittance recurrence",
    deepOwner: "SafeVolumetricLightingModel.js accumulatedBaseRadiance",
    transforms: [
      "exact homogeneous segment recurrence",
      "shared transmittance",
    ],
    allowedConsumers: [
      "sourceRadianceOutput",
      "baseRadianceAov",
      "diagnostics",
    ],
    forbiddenConsumers: ["accentSourceRadiance", "displayCompression"],
  }),
  volumeAccentRadiance: createQuantityContract({
    quantity: "volumeAccentRadiance",
    lane: "volume-integration",
    represents:
      "premultiplied accent radiance integrated along the same production ray and transmittance recurrence as the base",
    deepOwner: "SafeVolumetricLightingModel.js accumulatedAccentRadiance",
    transforms: [
      "exact homogeneous segment recurrence",
      "shared transmittance",
    ],
    allowedConsumers: [
      "sourceRadianceOutput",
      "accentRadianceAov",
      "diagnostics",
    ],
    forbiddenConsumers: ["baseSourceRadiance", "displayCompression"],
  }),
  volumeTransmittance: createQuantityContract({
    quantity: "volumeTransmittance",
    lane: "volume-integration",
    represents:
      "scalar production-ray transmission after the single shared extinction recurrence",
    deepOwner: "SafeVolumetricLightingModel.js transmittance",
    transforms: ["exponential extinction per segment"],
    allowedConsumers: [
      "opacity",
      "transmittanceAov",
      "coverage",
      "diagnostics",
    ],
    forbiddenConsumers: ["baseSourceRadiance", "accentSourceRadiance"],
  }),
  volumeCoverage: createQuantityContract({
    quantity: "volumeCoverage",
    lane: "volume-integration",
    represents: "one minus production-ray transmittance",
    deepOwner: "SafeVolumetricLightingModel.js raymarchCoverageNode",
    transforms: ["one minus transmittance", "unit saturation"],
    allowedConsumers: ["outputAlpha", "coverageAov", "diagnostics"],
    forbiddenConsumers: ["baseSourceRadiance", "accentSourceRadiance"],
  }),
});

export const RAYMARCH_RENDER_SURFACE_AUDITS = Object.freeze({
  sourceBoundaryModalObservationPolicy: createSourceSurfaceAudit({
    surface: "sourceBoundaryModalObservationPolicy",
    file: "audioSourceEvidence.js",
    owner: "audioSourceEvidence.js source boundary",
    startToken: "function deriveModalObservationPolicy({",
    endToken: "export function collectAudioSourceEvidenceInputs",
    requiredTokens: [
      'analysisClass === "file"',
      "suppressWeakSpectralFallbackDrive",
    ],
    forbiddenTokens: [],
  }),
  modalObservationSourcePolicyConsumer: createSourceSurfaceAudit({
    surface: "modalObservationSourcePolicyConsumer",
    file: "modalObservedScoring.js",
    owner: "sourceBoundaryModalObservationPolicy",
    startToken: "export function computeModalObservation({",
    endToken: "export function getResonantHarmonicCoupling",
    requiredTokens: ["sourceBoundarySuppressWeakSpectralFallbackDrive"],
    forbiddenTokens: [
      'analysisClass === "file"',
      "avgAmplitude < 10",
      "analyserRms < 0.025",
    ],
  }),
  modalProjectionDisplayScore: createSourceSurfaceAudit({
    surface: "modalProjectionDisplayScore",
    file: "modalExcitation.js",
    owner: "displayProjectionAmplitude",
    startToken: "function buildProjectionShortlist(",
    endToken: "function getDisplayScore(",
    requiredTokens: ["displayProjectionAmplitude", "getSignalScore"],
    forbiddenTokens: ["signalAmplitude", "storedEnergy", "forcingEnergy"],
  }),
  spectralLanePacketPublisher: createSourceSurfaceAudit({
    surface: "spectralLanePacketPublisher",
    file: "modalExcitation.js",
    owner: "spectralLanePacket",
    startToken: "function createEntrySpectralLightComponent(",
    endToken: "function writeShortlistedEntries(",
    requiredTokens: [
      "displayEnergy",
      "spectralConfidence",
      "spectralSpread",
      "laneDistribution",
      "layerBuffer.spectralMeta[offset + 3] = spectralLight.displayEnergy;",
    ],
    forbiddenTokens: [
      "projectedRenderEnergy",
      "modalFieldColorBuffer",
      "spectralLightCacheTexture",
    ],
  }),
  spectralLaneRadianceCache: createSourceSurfaceAudit({
    surface: "spectralLaneRadianceCache",
    file: "fieldCache.js",
    owner: "spectralLaneRadiance",
    startToken: "function createSpectralLaneCacheComputeKernel({",
    endToken: "function getOrCreateRaymarchSpectralLaneCacheComputeNode(",
    requiredTokens: [
      "modalFieldSpectralLaneABuffer",
      "modalFieldSpectralLaneBBuffer",
      "modalFieldSpectralMetaBuffer",
      "spectralLaneTextureA",
      "spectralLaneTextureB",
      "spectralLaneStatsTexture",
      "dominance",
      "entropy",
    ],
    forbiddenTokens: [
      "colorSum.div",
      "displayEnergy",
      "modalFieldColorBuffer",
      "spectralLightCacheTexture",
      "cachedSpectralLightEnabled",
    ],
  }),
  fieldCacheMatchedFieldGradient: createSourceSurfaceAudit({
    surface: "fieldCacheMatchedFieldGradient",
    file: "fieldCache.js",
    owner: "matchedFieldGradient",
    startToken: "// Physical pressure and ∇p are the acousto-optic carrier.",
    endToken: "textureStore(\n        writeSupportTexture,",
    requiredTokens: [
      "stay linear in coefficient amplitude",
      "vec4(fieldSum, gradXSum, gradYSum, gradZSum)",
    ],
    forbiddenTokens: [
      "normalizedPressure",
      "normalizedVelocityProxy",
      "normalizedRadiationPotential",
      "visibility",
    ],
  }),
  materialMatchedFieldGradient: createSourceSurfaceAudit({
    surface: "materialMatchedFieldGradient",
    file: "material.js",
    owner: "matchedFieldGradient",
    startToken: "function sampleLiveFieldProjectionCacheNode({",
    endToken: "function samplePhaseInterferenceCarrierNode({",
    requiredTokens: [
      "texture3D(modalLiveFieldTexture).sample(basisUv)",
      "field: fieldSample.x",
      "gradient: vec3(fieldSample.y, fieldSample.z, fieldSample.w)",
      "exactly the same normalization",
    ],
    forbiddenTokens: [
      "normalizedPressure",
      "modalPressureRadiationTexture",
      "materialColor",
      "sourceRadiance",
    ],
  }),
  materialChromaticity: createSourceSurfaceAudit({
    surface: "materialChromaticity",
    file: "material.js",
    owner: "materialChromaticity",
    startToken: "function normalizeMaterialChromaticityNode(color) {",
    endToken: "function sampleSpectralLaneCacheNode({",
    requiredTokens: [
      "LINEAR_RGB_LUMINANCE",
      "normalizeMaterialChromaticityNode",
      "projectSpectralLaneRadianceToRgbNode",
      "spectralChromaticity",
      "fallbackChromaticity",
      "chromaticity only",
    ],
    forbiddenTokens: [
      "dominanceGain",
      "entropyGain",
      "spectralReadability",
      "uBeatPulse",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
  materialFieldNormalization: createSourceSurfaceAudit({
    surface: "materialFieldNormalization",
    file: "material.js",
    owner: "modalEnergyAmplitude",
    startToken: "const modalCoefficientEnergy = clamp(",
    endToken: "const activeMask =",
    requiredTokens: [
      "uStructuralProjectionDrive",
      "uModalEnergyAmplitude",
      "modalCoefficientEnergy",
      "modalEnergyAmplitude",
      "MODAL_BASIS_CACHE_ENERGY_EPSILON",
    ],
    forbiddenTokens: [
      "uTotalSlotAmplitude",
      "uStructureSignal",
      "uModalResponseEnergy",
      "uModeCoherence",
      "uTrebleBroadbandEnergy",
      "uAverageAmplitude",
      "RAYMARCH_AVERAGE_AMPLITUDE_SHADER_REFERENCE",
    ],
  }),
  materialGaussianIntervalIntegration: createSourceSurfaceAudit({
    surface: "materialGaussianIntervalIntegration",
    file: "carrierDensityNode.js",
    owner: "fixedWorldSpaceCarrierDensity",
    startToken: "function deriveNormalizedGaussianIntervalAverageNode({",
    endToken: "function deriveFixedWorldSpaceCarrierDensityNode({",
    requiredTokens: [
      "localFieldDistance",
      "intervalWidthWorld",
      "fwhmWorld",
      "intervalEnergy",
      "pointProfile",
      "approximateErrorFunctionNode",
    ],
    forbiddenTokens: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
  materialLocalZeroSetDistance: createSourceSurfaceAudit({
    surface: "materialLocalZeroSetDistance",
    file: "carrierDensityNode.js",
    owner: "localZeroSetDistance",
    startToken: "export function deriveFixedWorldSpaceCarrierDensityNode({",
    endToken: "// Fixed world-space carrier density node owner end.",
    requiredTokens: [
      "gradientMagnitude",
      "localFieldDistance",
      "abs(fieldValue).div",
      "max(gradientMagnitude, gradientEpsilon)",
      "greaterThan(gradientEpsilon)",
    ],
    forbiddenTokens: [
      "normalizedPressure",
      "modalPressureRadiationTexture",
      "observedDensityFloor",
      "projectedCausticRadianceDensity",
      "highlightMask",
      "whiteEmission",
    ],
  }),
  materialFixedWorldSpaceCarrier: createSourceSurfaceAudit({
    surface: "materialFixedWorldSpaceCarrier",
    file: "carrierDensityNode.js",
    owner: "fixedWorldSpaceCarrierDensity",
    startToken: "export function deriveFixedWorldSpaceCarrierDensityNode({",
    endToken: "// Fixed world-space carrier density node owner end.",
    requiredTokens: [
      "coreFwhmWorld",
      "sheathFwhmWorld",
      "coreEnergyFraction",
      "sheathEnergyFraction",
      "intervalWidthWorld",
      "deriveNormalizedGaussianIntervalAverageNode",
      "carrierDensity",
      "normalDotRay",
    ],
    forbiddenTokens: [
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "uBeatPulse",
      "pitchVisibilityCompensation",
      "frameBrightness",
    ],
  }),
  materialDetectorWindowedEnergy: createSourceSurfaceAudit({
    surface: "materialDetectorWindowedEnergy",
    file: "material.js",
    owner: "detectorIntegratedAcousticEnergy",
    startToken: "const phaseInterferenceCarrier =",
    endToken: "const assignLiveFieldSample =",
    requiredTokens: [
      "phaseEnergyCarrierAuthority",
      "detectorIntegratedAcousticEnergy",
      "modalCoefficientEnergy.mul",
      "phaseInterferenceCarrier.independentSpatialEnergy",
      "phaseInterferenceCarrier.detectorIntegratedSpatialEnergy",
    ],
    forbiddenTokens: [
      "uBeatPulse",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
      "dominantFrequency",
      "spectralCentroid",
    ],
  }),
  acousticEnergyTransferCpuOwner: createSourceSurfaceAudit({
    surface: "acousticEnergyTransferCpuOwner",
    file: "observationTransfer.js",
    owner: "observationTransfer.js CPU oracle",
    startToken: "export function deriveAcousticEnergyMaterialTransfer({",
    endToken: "// Acoustic energy material transfer CPU owner end.",
    requiredTokens: [
      "detectorIntegratedEnergy",
      "coreDensity",
      "sheathDensity",
      "materialDensityScale",
      "carrierColumnDensityScale",
      "organizedCoreDensity",
      "organizedSheathDensity",
      "organizedDensity",
      "scatteringCoefficient",
      "absorptionCoefficient",
      "laserExcitedEmissionCoefficient",
      "sigmaS",
      "sigmaA",
      "extinction",
      "emissionSourceStrength",
      "coreEmissionSourceStrength",
      "sheathEmissionSourceStrength",
      "normalDotRay",
      "holographicIntensity",
      "holographicFresnelPower",
      "holographicFresnel",
      "fresnelEmissionSourceStrength",
      "holographicBaseRadianceGain",
      "laserAccentAuthority",
      "baseRadiance",
      "accentRadiance",
      "sourceRadiance",
    ],
    forbiddenTokens: [
      "projectedCausticRadianceDensity",
      "visibleDensity",
      "observedDensityFloor",
      "highlightMask",
      "whiteEmission",
      "dominantFrequency",
      "beat",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
  acousticEnergyTransferNodeOwner: createSourceSurfaceAudit({
    surface: "acousticEnergyTransferNodeOwner",
    file: "observationTransferNode.js",
    owner: "observationTransferNode.js GPU owner",
    startToken: "export function deriveAcousticEnergyMaterialTransferNode",
    endToken: "// Acoustic energy material transfer node owner end.",
    requiredTokens: [
      "deriveAcousticEnergyMaterialTransferNode",
      "detectorIntegratedEnergy",
      "coreDensity",
      "sheathDensity",
      "materialDensityScale",
      "carrierColumnDensityScale",
      "organizedCoreDensity",
      "organizedSheathDensity",
      "organizedDensity",
      "scatteringCoefficient",
      "absorptionCoefficient",
      "laserExcitedEmissionCoefficient",
      "sigmaS",
      "sigmaA",
      "extinction",
      "emissionSourceStrength",
      "coreEmissionSourceStrength",
      "sheathEmissionSourceStrength",
      "normalDotRay",
      "holographicIntensity",
      "holographicFresnelPower",
      "holographicFresnel",
      "fresnelEmissionSourceStrength",
      "holographicBaseRadianceGain",
      "laserAccentAuthority",
      "baseRadiance",
      "accentRadiance",
      "sourceRadiance",
    ],
    forbiddenTokens: [
      "projectedCausticRadianceDensity",
      "visibleDensity",
      "observedDensityFloor",
      "highlightMask",
      "whiteEmission",
      "dominantFrequency",
      "uBeatPulse",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
  materialEmissionExtinctionTransfer: createSourceSurfaceAudit({
    surface: "materialEmissionExtinctionTransfer",
    file: "material.js",
    owner: "observationTransferNode.js emission-extinction GPU owner",
    startToken: "if (spectralLaneTransferEnabled) {",
    endToken: "const RAYMARCH_DOMAIN_GEOMETRY_MARGIN",
    requiredTokens: [
      "deriveAcousticEnergyMaterialTransferNode",
      "detectorIntegratedEnergy: detectorIntegratedAcousticEnergy",
      "coreDensity,",
      "sheathDensity,",
      "materialDensityScale,",
      "carrierColumnDensityScale: uCarrierColumnDensityScale",
      "materialColor",
      "surfaceColor",
      "scatteringCoefficient",
      "absorptionCoefficient",
      "laserExcitedEmissionCoefficient",
      "holographicIntensity: uHolographicIntensity",
      "holographicFresnelPower: uHolographicFresnelPower",
      "normalDotRay: carrier.normalDotRay",
      "holographicBaseRadianceGain: uHolographicBaseRadianceGain",
      "laserAccentAuthority,",
      "baseRadiance",
      "accentRadiance",
      "extinction",
    ],
    forbiddenTokens: [
      "visibleDensity",
      "observationDensity",
      "observedDensityFloor",
      "projectedCausticRadianceDensity",
      "supportRevealContribution",
      "highlightMask",
      "hotCoreInput",
      "whiteEmission",
      "uBeatPulse",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
      "laserTransportReady",
      "laserIrradiance",
    ],
  }),
  fieldCacheDetectorWindowedEnergy: createSourceSurfaceAudit({
    surface: "fieldCacheDetectorWindowedEnergy",
    file: "fieldCache.js",
    owner: "detectorIntegratedAcousticEnergy",
    startToken: "export function deriveDetectorIntegratedModalEnergy({",
    endToken: "function accumulatePhaseInterferenceContrastAtPoint({",
    requiredTokens: [
      "integrationTimeSec",
      "frequencySeparationHz",
      "normalizedSinc",
      "detectorWindowSec",
      "detectorIntegratedCoherentEnergy",
      "incoherentResidualEnergy",
      "detectorIntegratedEnergy",
    ],
    forbiddenTokens: [
      "pitchVisibilityCompensation",
      "beatVisibilityCompensation",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
  runtimeMaterialProbeDiagnostics: createSourceSurfaceAudit({
    surface: "runtimeMaterialProbeDiagnostics",
    file: "runtime.js",
    owner: "runtime.js read-only emission-extinction probe diagnostics",
    startToken:
      "    materialProbeDetectorIntegratedEnergy,\n    materialProbeCarrierDensity,",
    endToken: "    materialProbePreBloomRadiance,",
    requiredTokens: [
      "materialProbeMaterialDensityScale",
      "materialProbeOrganizedCoreDensity",
      "materialProbeOrganizedSheathDensity",
      "materialProbeOrganizedDensity",
      "materialProbeScatteringCoefficient",
      "materialProbeAbsorptionCoefficient",
      "materialProbeLaserExcitedEmissionCoefficient",
      "materialProbeSigmaS",
      "materialProbeSigmaA",
      "materialProbeExtinction",
      "materialProbeEmissionSourceStrength",
      "materialProbeCoreEmissionSourceStrength",
      "materialProbeSheathEmissionSourceStrength",
      "materialProbeFresnelEmissionSourceStrength",
      "materialProbeHolographicFresnel",
      "materialProbeHolographicBaseRadianceGain",
      "materialProbeBaseRadiance",
      "materialProbeAccentRadiance",
    ],
    forbiddenTokens: [
      "materialProbePhysicalDensity",
      "materialProbeObservationDensity",
      "materialProbeCausticVisibleDensity",
      "materialProbeProjectedCausticRadiance",
      "materialProbeVisibleDensity",
      "materialProbeHighlight",
      "materialProbeWhiteEmission",
    ],
  }),
  runtimeMaterialProbeTransfer: createSourceSurfaceAudit({
    surface: "runtimeMaterialProbeTransfer",
    file: "runtime.js",
    owner: "runtime.js emission-extinction diagnostic material probe",
    startToken: "const materialProbeCarrierDensity =",
    endToken: "const materialProbeBloomAmplification =",
    requiredTokens: [
      "materialProbeCarrierDensity",
      "materialProbeCoreDensity",
      "materialProbeSheathDensity",
      "materialProbeDetectorIntegratedEnergy",
      "materialProbeLaserTransportReady",
      "deriveAcousticEnergyMaterialTransfer",
      "REFERENCE_SCATTERING_COEFFICIENT",
      "materialAbsorptionCoefficient",
      "REFERENCE_LASER_EXCITED_EMISSION_COEFFICIENT",
      "materialDensityScale: densityGain / RAYMARCH_DEFAULTS.densityGain",
      "carrierColumnDensityScale: materialProbeCarrierColumnDensityScale",
      "holographicIntensity",
      "holographicFresnelPower",
      "normalDotRay: 1",
      "materialProbeHolographicBaseRadianceGain",
      "laserAccentAuthority: 0",
      "materialProbeTransfer.extinction",
      "materialProbeTransfer.sourceRadiance",
    ],
    forbiddenTokens: [
      "materialProbePhysicalDensity",
      "materialProbeObservationDensity",
      "materialProbeCausticVisibleDensity",
      "materialProbeProjectedCausticRadiance",
      "materialProbeVisibleDensity",
      "materialProbeHighlight",
      "materialProbeWhiteEmission",
      "dominantFrequency",
      "beatDetected",
      "radialDistance",
      "centerWeight",
      "edgeWeight",
      "visibilityProfile",
      "frameBrightness",
    ],
  }),
});

export const RAYMARCH_RENDER_QUANTITY_LANES = freezeStringArrayRecord(
  Object.values(RAYMARCH_QUANTITY_LEDGER).reduce((lanes, contract) => {
    lanes[contract.lane] ??= [];
    lanes[contract.lane].push(contract.quantity);
    return lanes;
  }, {}),
);

export const RAYMARCH_MATERIAL_TRANSFER_LANES = freezeStringArrayRecord(
  Object.values(RAYMARCH_QUANTITY_LEDGER)
    .filter((contract) => contract.surface === "material-transfer")
    .reduce((lanes, contract) => {
      lanes[contract.lane] ??= [];
      lanes[contract.lane].push(contract.quantity);
      return lanes;
    }, {}),
);

export const RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY = freezeStringArrayRecord(
  Object.fromEntries(
    Object.entries(RAYMARCH_QUANTITY_LEDGER)
      .filter(([, contract]) => contract.forbiddenConsumers.length > 0)
      .map(([quantityName, contract]) => [
        quantityName,
        contract.forbiddenConsumers,
      ]),
  ),
);

export function getRaymarchQuantityContract(quantityName) {
  return RAYMARCH_QUANTITY_LEDGER[quantityName] ?? null;
}

export function auditRaymarchSourceSurface(surfaceName, source) {
  const audit = RAYMARCH_RENDER_SURFACE_AUDITS[surfaceName] ?? null;
  if (!audit) {
    throw new Error(`Unknown raymarch source surface audit: ${surfaceName}.`);
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
  const surfaceSource = source.slice(start, end);
  for (const requiredToken of audit.requiredTokens) {
    if (!surfaceSource.includes(requiredToken)) {
      throw new Error(
        `Raymarch source surface audit ${surfaceName} is missing required token: ${requiredToken}.`,
      );
    }
  }
  for (const requiredPattern of audit.requiredPatterns) {
    if (!new RegExp(requiredPattern, "m").test(surfaceSource)) {
      throw new Error(
        `Raymarch source surface audit ${surfaceName} is missing required pattern: ${requiredPattern}.`,
      );
    }
  }
  for (const forbiddenToken of audit.forbiddenTokens) {
    if (surfaceSource.includes(forbiddenToken)) {
      throw new Error(
        `Raymarch source surface audit ${surfaceName} contains forbidden token: ${forbiddenToken}.`,
      );
    }
  }
  return Object.freeze({
    surface: audit.surface,
    file: audit.file,
    owner: audit.owner,
    start,
    end,
  });
}

export function isRaymarchQuantityConsumerAllowed(quantityName, consumerName) {
  const contract = getRaymarchQuantityContract(quantityName);
  if (!contract) {
    return false;
  }
  if (contract.forbiddenConsumers.includes(consumerName)) {
    return false;
  }
  return (
    contract.allowedConsumers.includes(consumerName) ||
    contract.allowedConsumers.includes("*")
  );
}

export function assertRaymarchQuantityConsumerAllowed(
  quantityName,
  consumerName,
) {
  if (!isRaymarchQuantityConsumerAllowed(quantityName, consumerName)) {
    throw new Error(
      `Raymarch quantity contract violation: ${quantityName} cannot feed ${consumerName}.`,
    );
  }
}
