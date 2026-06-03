export const RAYMARCH_QUANTITY_LEDGER_VERSION =
  "raymarch-render-quantity-v2";

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
  forbiddenTokens = [],
}) {
  return Object.freeze({
    surface,
    file,
    owner,
    startToken,
    endToken,
    requiredTokens: freezeStringArray(requiredTokens),
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
    allowedConsumers: ["storedModalEnergy", "projectedRenderEnergy", "diagnostics"],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "phaseState",
      "whiteEmissionFieldAuthority",
      "displayCompression",
    ],
  }),
  storedModalEnergy: createQuantityContract({
    quantity: "storedModalEnergy",
    lane: "modal-response",
    surface: "pipeline",
    represents: "retained modal response energy before render-boundary projection",
    deepOwner: "modalResponse.js computes retained response; modalEnergyLedger.js reads it",
    transforms: ["modal response integration", "damping", "clamp01"],
    allowedConsumerPath: ["modal response", "projected render energy"],
    allowedConsumers: ["projectedRenderEnergy", "diagnostics"],
    forbiddenConsumers: [
      "renderAuthority",
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "whiteEmissionFieldAuthority",
      "displayCompression",
    ],
  }),
  projectedRenderEnergy: createQuantityContract({
    quantity: "projectedRenderEnergy",
    lane: "projection",
    surface: "pipeline",
    represents: "bounded render-facing energy after source/render boundary caps",
    deepOwner: "modalEnergyLedger.js",
    transforms: ["slot amplitude square", "boundary suppression", "stored-energy cap"],
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
    represents: "nonnegative modal coefficient/amplitude uploaded for field synthesis",
    deepOwner: "buildFeatureFrame.js publishes slots; modalDescriptor.js canonicalizes them",
    transforms: ["projected energy scale", "continuity admission", "descriptor merge"],
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
    forbiddenConsumers: ["modalIdentityTopology", "phaseState", "displayCompression"],
  }),
  modalIdentityTopology: createQuantityContract({
    quantity: "modalIdentityTopology",
    lane: "canonical-descriptor",
    surface: "pipeline",
    represents: "canonical modal tuple identity and basis-cache topology",
    deepOwner: "modalDescriptor.js and fieldCache.js basis identity descriptors",
    transforms: ["descriptor admission", "stable slot assignment", "basis page assignment"],
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
    represents: "single writer authority for live GPU buffers and cache submissions",
    deepOwner: "runtime.js applyRaymarchRuntimeUploadAuthority",
    transforms: ["capacity selection", "buffer upload", "cache descriptor publication"],
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
    deepOwner: "modalPhaseSlots.js publishes phase slots; runtime.js uploads them",
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
    represents: "bounded confidence that phase state may affect interference transfer",
    deepOwner: "modalPhaseSlots.js and fieldCache.js phase interference projection",
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
      "whiteEmissionFieldAuthority",
    ],
  }),
  signedField: createQuantityContract({
    quantity: "signedField",
    lane: "field",
    surface: "pipeline",
    represents: "signed modal field after coefficient-weighted basis summation",
    deepOwner: "fieldCache.js and material.js live field synthesis",
    transforms: ["basis evaluation", "coefficient weighting", "normalization"],
    allowedConsumerPath: ["live buffers", "field/support carriers", "material transfer"],
    allowedConsumers: [
      "cancellation",
      "causticRidgeAuthority",
      "physicalCausticDensity",
      "diagnostics",
    ],
    forbiddenConsumers: ["displayCompression", "modalIdentityTopology"],
  }),
  unsignedSupport: createQuantityContract({
    quantity: "unsignedSupport",
    lane: "support",
    surface: "pipeline",
    represents: "unsigned local field support before radiance transfer",
    deepOwner: "fieldCache.js and material.js live support synthesis",
    transforms: ["absolute field contribution sum", "amplitude normalization"],
    allowedConsumerPath: ["field/support carriers", "observation transfer"],
    allowedConsumers: [
      "cancellation",
      "observationAnchor",
      "supportVisibleDensity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  cancellation: createQuantityContract({
    quantity: "cancellation",
    lane: "field",
    surface: "pipeline",
    represents: "destructive-interference ratio derived from signed field and support",
    deepOwner: "fieldCache.js deriveLiveSynthesisCancellationRatio",
    transforms: ["abs signed field over unsigned support", "clamp01"],
    allowedConsumerPath: ["field/support carriers", "material transfer"],
    allowedConsumers: [
      "cancellationSuppression",
      "observationAnchor",
      "causticVisibility",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "whiteEmissionFieldAuthority",
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
    allowedConsumerPath: [
      "phase interference carrier",
      "material optical focus transfer",
    ],
    allowedConsumers: ["phaseInterferenceTransfer", "opticalFocus", "diagnostics"],
    forbiddenConsumers: [
      "modalIdentityTopology",
      "modalAmplitudeCoefficient",
      "renderAuthority",
    ],
  }),
  observationDensity: createQuantityContract({
    quantity: "observationDensity",
    lane: "observation",
    surface: "material-transfer",
    represents: "post-observation density including physical density or support floor",
    deepOwner: "observationTransfer.js and material.js deriveObservationTransferNode",
    transforms: ["physical visible density", "observed density floor", "max"],
    allowedConsumerPath: ["material transfer", "support reveal", "opacity"],
    allowedConsumers: [
      "stabilizedDensity",
      "supportVisibleDensity",
      "opacity",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  causticRidgeAuthority: createQuantityContract({
    quantity: "causticRidgeAuthority",
    lane: "caustic",
    surface: "pipeline",
    represents: "local ridge/caustic authority from field, gradient, and shell focus",
    deepOwner: "material.js material transfer",
    transforms: ["local support", "gradient evidence", "shell focus", "edge fade"],
    allowedConsumerPath: ["material transfer", "caustic radiance", "white emission evidence"],
    allowedConsumers: [
      "physicalCausticDensity",
      "causticVisibleDensity",
      "whiteEmissionRidgeEvidence",
      "diagnostics",
    ],
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
    represents: "post-material scene-referred luminance and bloom headroom compression",
    deepOwner: "displayRadiance.js and outputPipeline.js",
    transforms: ["luminance shoulder", "channel ceiling", "bloom headroom scale"],
    allowedConsumerPath: ["material radiance", "display compression", "final output"],
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
      "whiteEmissionFieldAuthority",
    ],
  }),
  structuralProjectionDrive: createQuantityContract({
    quantity: "structuralProjectionDrive",
    lane: "structural",
    represents: "normalized modal structural energy drive",
    transforms: ["energy normalization", "bounded support projection"],
    allowedConsumers: [
      "modalCoefficientEnergy",
      "observationEnergy",
      "whiteEmissionStructuralDrive",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "phaseCurrent",
      "topologyIdentity",
      "causticRadianceContribution",
    ],
  }),
  modalCoefficientEnergy: createQuantityContract({
    quantity: "modalCoefficientEnergy",
    lane: "structural",
    represents: "bounded modal energy/support coefficient for visibility",
    transforms: ["clamp01", "structural projection drive"],
    allowedConsumers: [
      "observationEnergy",
      "observationSupport",
      "whiteEmissionStructuralDrive",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "phaseCurrent",
      "topologyIdentity",
      "rawAmplitudeNormalizer",
    ],
  }),
  modalStructureAnchor: createQuantityContract({
    quantity: "modalStructureAnchor",
    lane: "structural",
    represents: "local modal support anchor for observation transfer",
    transforms: ["caustic ridge authority", "signed radiance suppression"],
    allowedConsumers: [
      "observationAnchor",
      "observedDensityFloor",
      "observedContourSupport",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
    ],
  }),
  visibleDensity: createQuantityContract({
    quantity: "visibleDensity",
    lane: "observation",
    surface: "boundary-transfer",
    represents: "post-observation density including physical density or support floor",
    deepOwner:
      "observationTransfer.js return-shape boundary; material core consumes observationDensity",
    transforms: ["max physicalVisibleDensity observedDensityFloor"],
    allowedConsumerPath: [
      "observation-transfer boundary",
      "observationDensity",
      "diagnostics/probes",
    ],
    allowedConsumers: [
      "observationDensity",
      "diagnostics",
      "probeBoundary",
      "observationTransferReturnBoundary",
    ],
    forbiddenConsumers: [
      "stabilizedDensity",
      "supportVisibleDensity",
      "opacity",
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  observedDensityFloor: createQuantityContract({
    quantity: "observedDensityFloor",
    lane: "observation",
    represents: "support floor that reveals quiet coherent modal structure",
    transforms: ["observation support", "modal structure anchor"],
    allowedConsumers: [
      "visibleDensity",
      "supportVisibleDensity",
      "observationDiagnostics",
    ],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  observedContourSupport: createQuantityContract({
    quantity: "observedContourSupport",
    lane: "observation",
    represents: "low-amplitude contour support for structure accent",
    transforms: ["ridge-gated observation support"],
    allowedConsumers: ["contourAccent", "observationDiagnostics"],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  physicalCausticDensity: createQuantityContract({
    quantity: "physicalCausticDensity",
    lane: "caustic",
    represents: "physical caustic/laser density before observation floor",
    transforms: ["laser caustic radiance", "density absorption", "active mask"],
    allowedConsumers: [
      "causticVisibleDensity",
      "highlightMask",
      "hotCoreInput",
      "causticRadianceContribution",
      "diagnostics",
    ],
    forbiddenConsumers: ["supportRevealContribution"],
  }),
  causticVisibleDensity: createQuantityContract({
    quantity: "causticVisibleDensity",
    lane: "caustic",
    represents: "visibility-gated physical caustic density",
    transforms: ["physical caustic density", "density fade gate"],
    allowedConsumers: [
      "highlightMask",
      "hotCoreInput",
      "causticRadianceContribution",
    ],
    forbiddenConsumers: [
      "supportRevealContribution",
      "observedDensityFloor",
    ],
  }),
  photographicLaserCausticRadiance: createQuantityContract({
    quantity: "photographicLaserCausticRadiance",
    lane: "caustic",
    represents: "focused optical caustic radiance after blackfield scaling",
    transforms: ["laser caustic density", "photographic focus scale"],
    allowedConsumers: [
      "physicalCausticDensity",
      "density",
      "hotCoreInput",
      "volumeColor",
    ],
    forbiddenConsumers: ["supportRevealContribution"],
  }),
  supportVisibleDensity: createQuantityContract({
    quantity: "supportVisibleDensity",
    lane: "support",
    represents: "non-caustic support/floor density used only for dark structure reveal",
    transforms: ["stabilized density minus caustic visible density"],
    allowedConsumers: ["supportRevealContribution", "opacity"],
    forbiddenConsumers: [
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  photographicBodyContribution: createQuantityContract({
    quantity: "photographicBodyContribution",
    lane: "body",
    represents: "body/support contribution to density, not caustic evidence",
    transforms: ["optical body attenuation", "blackfield body attenuation"],
    allowedConsumers: ["density", "supportVisibleDensity", "bodyCrowding"],
    forbiddenConsumers: [
      "physicalCausticDensity",
      "highlightMask",
      "hotCoreInput",
      "whiteEmissionFieldAuthority",
      "causticRadianceContribution",
    ],
  }),
  cancellationSuppression: createQuantityContract({
    quantity: "cancellationSuppression",
    lane: "caustic",
    represents: "radiance suppression from signed cancellation, where one means no loss",
    transforms: ["live synthesis cancellation ratio", "unsigned support"],
    allowedConsumers: [
      "signedRadianceAuthority",
      "causticVisibility",
      "observationAnchor",
      "densitySuppression",
    ],
    forbiddenConsumers: [
      "whiteEmissionRidgeEvidence",
      "whiteEmissionLocalEvidence",
      "whiteEmissionFieldAuthority",
    ],
  }),
  photographicFocus: createQuantityContract({
    quantity: "photographicFocus",
    lane: "caustic",
    represents: "optical focus strength, not standalone emission evidence",
    transforms: ["photographic shell focus", "optical focus"],
    allowedConsumers: [
      "photographicRadianceScale",
      "photographicFringeWeight",
      "whiteEmissionLocalEvidence",
      "holographicEmissionLift",
    ],
    forbiddenConsumers: ["whiteEmissionFieldAuthority"],
    requiredEvidenceByConsumer: {
      whiteEmissionLocalEvidence: ["whiteEmissionRidgeEvidence"],
    },
  }),
  whiteEmissionRidgeEvidence: createQuantityContract({
    quantity: "whiteEmissionRidgeEvidence",
    lane: "emission",
    represents: "local ridge/caustic evidence required before white emission",
    transforms: ["ridge concentration", "caustic ridge authority"],
    allowedConsumers: ["whiteEmissionLocalEvidence"],
    forbiddenConsumers: ["crowdingReliefOnly"],
  }),
  whiteEmissionLocalEvidence: createQuantityContract({
    quantity: "whiteEmissionLocalEvidence",
    lane: "emission",
    represents: "local field evidence after ridge-gated focus",
    transforms: ["ridge evidence", "ridge-gated photographic focus"],
    allowedConsumers: ["whiteEmissionFieldAuthority"],
    forbiddenConsumers: ["crowdingReliefOnly"],
  }),
  whiteEmissionFieldAuthority: createQuantityContract({
    quantity: "whiteEmissionFieldAuthority",
    lane: "emission",
    represents: "multiplicative authority for high white emission",
    transforms: ["local field evidence", "structural drive"],
    allowedConsumers: [
      "crowdedWhiteEmissionMix",
      "spectralLightWhiteEmissionMix",
      "staticWhiteEmissionMix",
    ],
    forbiddenConsumers: ["crowdingReliefOnly"],
  }),
  causticRadianceContribution: createQuantityContract({
    quantity: "causticRadianceContribution",
    lane: "caustic",
    represents: "colored caustic radiance contribution",
    transforms: ["volume color", "caustic visible density"],
    allowedConsumers: ["finalRadiance"],
    forbiddenConsumers: ["supportRevealContribution"],
  }),
  supportRevealContribution: createQuantityContract({
    quantity: "supportRevealContribution",
    lane: "support",
    represents: "dark body/support reveal contribution",
    transforms: ["surface color", "dark body ratio", "support visible density"],
    allowedConsumers: ["finalRadiance"],
    forbiddenConsumers: ["highlightMask", "hotCoreInput", "whiteEmission"],
  }),
});

export const RAYMARCH_RENDER_SURFACE_AUDITS = Object.freeze({
  materialObservationCore: createSourceSurfaceAudit({
    surface: "materialObservationCore",
    file: "material.js",
    owner: "material.js material transfer",
    startToken: "const observationTransfer = deriveObservationTransferNode(",
    endToken: "const contourMix = smoothstep(",
    requiredTokens: [
      "const { observationDensity } = observationTransfer;",
      "const causticVisibleDensity =",
      "const highlightMask =",
      "const stabilizedDensity = observationDensity;",
    ],
    forbiddenTokens: ["visibleDensity", "observedDensityFloor"],
  }),
  materialHighlightAuthority: createSourceSurfaceAudit({
    surface: "materialHighlightAuthority",
    file: "material.js",
    owner: "causticVisibleDensity",
    startToken: "const highlightMask = smoothstep(",
    endToken: "const stabilizedDensity = observationDensity;",
    requiredTokens: ["causticVisibleDensity"],
    forbiddenTokens: [
      "visibleDensity",
      "observationDensity",
      "observedDensityFloor",
      "supportVisibleDensity",
    ],
  }),
  materialHotCoreAuthority: createSourceSurfaceAudit({
    surface: "materialHotCoreAuthority",
    file: "material.js",
    owner: "photographicLaserCausticRadiance plus caustic highlight evidence",
    startToken: "const hotCoreInput =",
    endToken: "const hotCoreMix =",
    requiredTokens: ["photographicLaserCausticRadiance", "highlightMask"],
    forbiddenTokens: [
      "visibleDensity",
      "observationDensity",
      "observedDensityFloor",
      "supportVisibleDensity",
      "cancellationSuppression",
    ],
  }),
  materialWhiteEmissionAuthority: createSourceSurfaceAudit({
    surface: "materialWhiteEmissionAuthority",
    file: "material.js",
    owner: "whiteEmissionFieldAuthority",
    startToken: "const whiteEmissionRidgeEvidence =",
    endToken: "const whiteEmissionFieldCrowding =",
    requiredTokens: [
      "whiteEmissionRidgeEvidence",
      "whiteEmissionLocalEvidence",
      "whiteEmissionStructuralDrive",
      "whiteEmissionFieldAuthority",
    ],
    forbiddenTokens: [
      "visibleDensity",
      "observationDensity",
      "observedDensityFloor",
      "supportVisibleDensity",
      "cancellationSuppression",
    ],
  }),
  runtimeMaterialProbeTransfer: createSourceSurfaceAudit({
    surface: "runtimeMaterialProbeTransfer",
    file: "runtime.js",
    owner: "runtime.js diagnostic material probe",
    startToken: "const materialProbePhysicalDensity =",
    endToken: "const materialProbePreBloomRadiance =",
    requiredTokens: [
      "materialProbeObservationDensity",
      "materialProbeCausticVisibleDensity",
      "deriveMaterialRadianceTransfer",
    ],
    forbiddenTokens: [
      "visibleDensity",
      "materialProbeVisibleDensity",
      "whiteEmissionFieldAuthority",
      "renderAuthority",
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
