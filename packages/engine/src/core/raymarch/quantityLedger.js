export const RAYMARCH_QUANTITY_LEDGER_VERSION =
  "broadband-observer-quantity-v13";
export const RAYMARCH_OPTICAL_FIELD_REPRESENTATION =
  "complete-broadband-moment-gorkov-field-fixed-scale-space-persistent-topology-u0-observer";
export const RAYMARCH_SPECTRAL_PHASE_REPRESENTATION =
  "observer-phase-cache-filtered-rgb-companion";

function freezeStrings(values = []) {
  return Object.freeze([...values]);
}

function freezeStringRecord(value = {}) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entries]) => [
        key,
        freezeStrings(entries),
      ]),
    ),
  );
}

function contract({
  quantity,
  lane,
  surface = "pipeline",
  represents,
  deepOwner,
  transforms = [],
  allowedConsumers = [],
  forbiddenConsumers = [],
}) {
  return Object.freeze({
    quantity,
    lane,
    surface,
    represents,
    deepOwner,
    transforms: freezeStrings(transforms),
    allowedConsumerPath: freezeStrings(allowedConsumers),
    allowedConsumers: freezeStrings(allowedConsumers),
    forbiddenConsumers: freezeStrings(forbiddenConsumers),
    requiredEvidenceByConsumer: Object.freeze({}),
  });
}

export const RAYMARCH_QUANTITY_LEDGER = Object.freeze({
  acousticPcm: contract({
    quantity: "acousticPcm",
    lane: "audio-source",
    represents:
      "consecutive signed dimensionless full-scale PCM per channel, before acoustic preparation",
    deepOwner:
      "audioSetup.js source epoch and audioPcmCapture.worklet.js sample clock",
    transforms: [
      "mono duplication or independent stereo preservation",
      "bounded transfer without sample replacement",
    ],
    allowedConsumers: ["preparedAcousticDrive", "diagnostics"],
    forbiddenConsumers: [
      "renderFrameClock",
      "peakSelection",
      "perChannelNormalization",
    ],
  }),
  preparedAcousticDrive: contract({
    quantity: "preparedAcousticDrive",
    lane: "audio-source",
    represents:
      "causally prepared dimensionless waveform with explicit integer preparation delay",
    deepOwner: "streamingAcousticDrive.js",
    transforms: [
      "declared nonlinear frame transform",
      "overlap-add",
      "causal DC removal",
    ],
    allowedConsumers: ["modalState", "diagnostics"],
    forbiddenConsumers: ["displayCadence", "winningFrequency", "silentGapFill"],
  }),
  modalTopology: contract({
    quantity: "modalTopology",
    lane: "modal-field",
    represents:
      "complete eligible spatial families, signed source amplitude overlaps, common shell poles and channel semantics",
    deepOwner:
      "modalExcitationAtlas.js and audioFeatureEngine.worker.js immutable topology",
    transforms: [
      "apparatus admission",
      "group common shell poles",
      "source energy coupling to amplitude exactly once",
    ],
    allowedConsumers: ["modalState", "completeAcousticField", "diagnostics"],
    forbiddenConsumers: [
      "performanceTierPaging",
      "cameraRanking",
      "musicDominanceRanking",
    ],
  }),
  modalState: contract({
    quantity: "modalState",
    lane: "modal-field",
    represents:
      "raw signed dimensionless pressure P and velocity-basis R per shell and channel; not pressure magnitudes or hertz labels",
    deepOwner: "broadbandModalResponse.js consecutive sample-hold propagation",
    transforms: [
      "passive pressure-velocity equations",
      "exact affine matrix-exponential sample hold",
      "declared apparatus damping",
    ],
    allowedConsumers: [
      "modalResponseMoments",
      "responseSpectrum",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "renderNormalization",
      "amplitudeFloor",
      "frameRate",
      "winningFrequency",
    ],
  }),
  modalResponseMoments: contract({
    quantity: "modalResponseMoments",
    lane: "modal-field",
    represents:
      "raw exponentially observed pressure/velocity second moments in coefficient-amplitude squared, including every off-diagonal shell pair and the channel ensemble mean",
    deepOwner: "modalResponseMoments.js",
    transforms: [
      "continuous within-sample observation",
      "dense symmetric raw moments, without mean subtraction",
      "one common spatial mean total-response energy",
    ],
    allowedConsumers: ["completeAcousticField", "diagnostics"],
    forbiddenConsumers: [
      "rankTruncation",
      "PSDRepair",
      "perModeNormalization",
      "confidenceGain",
    ],
  }),
  responseSpectrum: contract({
    quantity: "responseSpectrum",
    lane: "spectral-phase",
    represents:
      "complete finite-history response spectrum reconstructed from input bins, transition powers and endpoint corrections at one accepted acoustic sample",
    deepOwner: "broadbandResponseSpectrum.js and broadbandSpectralExpansion.js",
    transforms: [
      "zero-padded rectangular finite history",
      "full-bin complex response reconstruction including free motion",
    ],
    allowedConsumers: ["fieldSpectralMomentEvidence", "diagnostics"],
    forbiddenConsumers: [
      "fieldPotential",
      "observerGeometry",
      "acousticStateAdvance",
      "peakSelection",
    ],
  }),
  fieldSpectralMomentEvidence: contract({
    quantity: "fieldSpectralMomentEvidence",
    lane: "spectral-phase",
    represents:
      "additive local first/second circular moments and nonnegative response spectral support, normalized by the common total response energy",
    deepOwner:
      "broadbandSpectralProjection.js full-bin matrices and broadbandMomentField.js spatial quadratic evaluation",
    transforms: [
      "complete coherent field at each bin",
      "additive response-energy weighting, without squared per-bin support",
      "independent-channel ensemble mean",
      "linear fine-aperture filtering before moment normalization",
    ],
    allowedConsumers: ["resolvedSpectralMomentEvidence", "diagnostics"],
    forbiddenConsumers: [
      "fieldPotential",
      "observerGeometry",
      "materialPalette",
      "staticColor",
    ],
  }),
  resolvedSpectralMomentEvidence: contract({
    quantity: "resolvedSpectralMomentEvidence",
    lane: "spectral-phase",
    represents:
      "bounded normalized moments m1 and m2 plus support-derived presence p",
    deepOwner: "fieldCacheBake.js float32 field resolve",
    transforms: [
      "divide by max(W,2^-16)",
      "radial unit-disk clamp",
      "presence W/(W+2^-16)",
    ],
    allowedConsumers: ["observerLocalSpectralPhase", "diagnostics"],
    forbiddenConsumers: [
      "fieldPotential",
      "observerGeometry",
      "staticColor",
      "chromaAttenuation",
    ],
  }),
  completeAcousticField: contract({
    quantity: "completeAcousticField",
    lane: "field-cache",
    represents:
      "dimensionless normalized Gor'kov potential proxy and normalized-coordinate gradient from complete raw pressure/velocity second moments",
    deepOwner:
      "broadbandCosineProjection.js, broadbandMomentField.js and fieldCacheBake.js",
    transforms: [
      "signed family overlaps and full cross-shell interference",
      "exact quadratic product-to-sum projection",
      "one common total-response normalization",
    ],
    allowedConsumers: [
      "fineApertureResolvedField",
      "topologyApertureResolvedField",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "cameraSlice",
      "modalPaging",
      "renderResolution",
      "bloom",
    ],
  }),
  fineApertureResolvedField: contract({
    quantity: "fineApertureResolvedField",
    lane: "field-cache",
    represents:
      "complete potential and gradient after the fine material-detail aperture",
    deepOwner: "fieldCacheBake.js fixed scale-space pass",
    transforms: ["fixed 0.104 world-unit Gaussian aperture"],
    allowedConsumers: [
      "fineDetailAgreement",
      "fineResidualDetail",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "observerTopology",
      "implicitSurfaceMotion",
      "observerGeometry",
      "camera",
      "frameRate",
      "outputResolution",
      "performanceTier",
    ],
  }),
  topologyApertureResolvedField: contract({
    quantity: "topologyApertureResolvedField",
    lane: "field-cache",
    represents:
      "the complete potential and gradient after the fixed topology aperture",
    deepOwner: "fieldCacheBake.js fixed scale-space pass",
    transforms: ["fixed 0.26 world-unit Gaussian aperture"],
    allowedConsumers: [
      "observerTopology",
      "implicitSurfaceMotion",
      "fineDetailAgreement",
      "fineResidualDetail",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "camera",
      "frameRate",
      "outputResolution",
      "performanceTier",
    ],
  }),
  fineDetailAgreement: contract({
    quantity: "fineDetailAgreement",
    lane: "field-cache",
    represents:
      "continuous amplitude-normalized agreement of fine detail with canonical topology",
    deepOwner: "fieldCacheBake.js scale-space resolve",
    transforms: [
      "signed surface displacement in world units",
      "surface-normal agreement",
      "continuous gradient validity",
      "unit clamp",
    ],
    allowedConsumers: ["observerFineDetail", "diagnostics"],
    forbiddenConsumers: [
      "observerTopology",
      "implicitSurfaceMotion",
      "observerGeometry",
      "modalAdmission",
      "modeRanking",
      "thresholdGate",
      "camera",
      "frameRate",
      "bloom",
    ],
  }),
  fineResidualDetail: contract({
    quantity: "fineResidualDetail",
    lane: "field-cache",
    represents:
      "bounded signed fine-minus-topology surface displacement used only as material detail",
    deepOwner: "fieldCacheBake.js scale-space resolve",
    transforms: [
      "surface-distance difference in world units",
      "fixed apparatus-scale normalization",
      "continuous signed saturation",
    ],
    allowedConsumers: ["observerFineDetail", "diagnostics"],
    forbiddenConsumers: [
      "observerTopology",
      "implicitSurfaceMotion",
      "observerGeometry",
      "surfaceIntersection",
      "modalAdmission",
      "camera",
      "frameRate",
      "bloom",
    ],
  }),
  implicitSurfaceMotion: contract({
    quantity: "implicitSurfaceMotion",
    lane: "observer-state",
    represents:
      "minimum-norm motion of the topology-aperture-resolved U=0 surface",
    deepOwner: "cymaticObserverNode.js implicit field backtrace",
    transforms: ["potential delta", "gradient-normal backtrace"],
    allowedConsumers: ["observerHistoryAdvection", "diagnostics"],
    forbiddenConsumers: ["opticalFlow", "particleSimulation", "cameraMotion"],
  }),
  observerGeometryPersistence: contract({
    quantity: "observerGeometryPersistence",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "advected finite-exposure signed level set of the topology-aperture-resolved U=0 sheet",
    deepOwner:
      "cymaticGeometryObservation.js and cymaticObserverNode.js geometry ping-pong lane",
    transforms: [
      "field-derived advection and continuous geometric validity",
      "explicit availability; directly seed first valid history",
      "fixed 400 ms exponential exposure",
      "fixed-width sheet extraction at material sampling",
    ],
    allowedConsumers: ["plasmaCarrier", "diagnostics"],
    forbiddenConsumers: [
      "audioEnergyGain",
      "spectralColorGain",
      "camera",
      "frameRate",
      "bloom",
    ],
  }),
  observerGeometryAvailability: contract({
    quantity: "observerGeometryAvailability",
    lane: "observer-state",
    represents:
      "binary support marking whether valid geometry history has actually been seeded at a voxel; not acoustic energy or a normal magnitude",
    deepOwner:
      "cymaticGeometryObservation.js and cymaticObserverNode.js availability ping-pong lane",
    transforms: [
      "first valid geometric observation establishes history",
      "transport with matching geometry history",
    ],
    allowedConsumers: ["observerGeometryAssimilation", "diagnostics"],
    forbiddenConsumers: [
      "audioEnergyGain",
      "observerRadiance",
      "spectralColorGain",
    ],
  }),
  observerSurfaceNormal: contract({
    quantity: "observerSurfaceNormal",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "local normalized topology-aperture gradient; direction and explicit history availability are distinct quantities",
    deepOwner: "cymaticObserverNode.js geometry ping-pong lane",
    transforms: ["gradient normalization", "fixed 400 ms geometry exposure"],
    allowedConsumers: ["plasmaCarrier", "plasmaTangentResponse", "diagnostics"],
    forbiddenConsumers: ["observerRadiance", "observerSpectralPhase"],
  }),
  observerSurfaceSupport: contract({
    quantity: "observerSurfaceSupport",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "continuous acoustic support for a valid persistent topology surface",
    deepOwner: "cymaticObserverNode.js appearance alpha lane",
    transforms: [
      "fixed amplitude-like optical transduction of absolute local acoustic energy",
      "continuous topology-gradient validity",
      "fixed 50 ms exponential exposure",
    ],
    allowedConsumers: ["plasmaCarrier", "diagnostics"],
    forbiddenConsumers: [
      "patternPersistence",
      "spectralColorGain",
      "camera",
      "frameRate",
      "bloom",
    ],
  }),
  observerFineDetail: contract({
    quantity: "observerFineDetail",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "audio-time-persistent bounded material authority derived from fine agreement and residual",
    deepOwner: "cymaticObserverNode.js organization alpha lane",
    transforms: [
      "agreement times bounded residual reinforcement",
      "field-derived advection",
      "fixed 400 ms geometry exposure",
    ],
    allowedConsumers: ["plasmaDetailSpine", "diagnostics"],
    forbiddenConsumers: [
      "observerTopology",
      "implicitSurfaceMotion",
      "observerGeometry",
      "modalAdmission",
      "camera",
      "frameRate",
      "outputResolution",
      "bloom",
    ],
  }),
  observerLocalRadiance: contract({
    quantity: "observerLocalRadiance",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "bounded optical excitation from raw local acoustic energy carried with the observed sheet",
    deepOwner: "cymaticObserverNode.js appearance blue lane",
    transforms: [
      "field-local energy",
      "fixed sqrt(E / (E + 5e-4)) optical response",
      "field-derived advection",
      "fixed 50 ms exponential exposure",
    ],
    allowedConsumers: ["plasmaAccentRadiance", "diagnostics"],
    forbiddenConsumers: [
      "observerGeometry",
      "modalAdmission",
      "surfaceWidth",
      "bloom",
    ],
  }),
  observerLocalSpectralPhase: contract({
    quantity: "observerLocalSpectralPhase",
    lane: "spectral-phase",
    surface: "observer-state",
    represents:
      "unit circular hue direction H stored directly until material sampling",
    deepOwner:
      "cymaticObserverNode.js appearance xy phase direction and fixed reference reset seed",
    transforms: [
      "first/second-moment evidence resolution",
      "fixed-aperture spatial moment resolution",
      "local transported phase history",
      "field-derived advection",
      "fixed 100 ms exponential exposure",
    ],
    allowedConsumers: ["spectralColorimetry", "diagnostics"],
    forbiddenConsumers: [
      "plasmaDensity",
      "observerGeometry",
      "modalAdmission",
      "staticColorFallback",
      "camera",
      "frameRate",
    ],
  }),
  observerLocalSpectralChromaticity: contract({
    quantity: "observerLocalSpectralChromaticity",
    lane: "spectral-phase",
    surface: "material-transfer",
    represents:
      "unit-Rec.709-luminance RGB chromaticity derived from one resolved observer phase",
    deepOwner:
      "cymaticObserverNode.js two-harmonic projection; fieldCacheBake.js filterable presentation copy; fieldCacheSampling.js trilinear chromaticity reconstruction",
    transforms: [
      "pinned two-harmonic phase projection",
      "RGB organization-lane half-float packing",
      "convex trilinear presentation reconstruction",
    ],
    allowedConsumers: [
      "operatorSpectralChroma",
      "plasmaBaseRadiance",
      "plasmaAccentRadiance",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "plasmaDensity",
      "observerGeometry",
      "modalAdmission",
      "staticColorFallback",
      "evidenceDerivedChromaAttenuation",
      "camera",
      "frameRate",
    ],
  }),
  observerAudioClock: contract({
    quantity: "observerAudioClock",
    lane: "observer-state",
    represents:
      "fixed-step observer time derived exclusively from authoritative audio time",
    deepOwner: "cymaticObserverReference.js observer clock",
    transforms: ["1/60 s quantization", "audio timestamp delta"],
    allowedConsumers: ["observerHistoryAdvection", "observerExposure"],
    forbiddenConsumers: [
      "renderFrameClock",
      "camera",
      "outputResolution",
      "bloom",
      "performanceTier",
    ],
  }),
  plasmaContinuitySpineDensity: contract({
    quantity: "plasmaContinuitySpineDensity",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "thin emissive layer carried by every valid persistent topology U=0 surface",
    deepOwner: "cymaticPlasmaCarrierNode.js",
    transforms: [
      "fixed continuity Gaussian width ratio",
      "fixed layer weight",
      "fixed valid-surface continuity authority",
    ],
    allowedConsumers: ["plasmaEmission", "plasmaExtinction", "diagnostics"],
    forbiddenConsumers: ["audioDensityWidth", "bloomWidth", "cameraWidth"],
  }),
  plasmaDetailSpineDensity: contract({
    quantity: "plasmaDetailSpineDensity",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "bounded narrow emissive reinforcement from fine detail on the canonical topology sheet",
    deepOwner: "cymaticPlasmaCarrierNode.js",
    transforms: [
      "fixed detail Gaussian width ratio",
      "fixed layer weight",
      "continuous saturating fine-detail authority",
    ],
    allowedConsumers: ["plasmaEmission", "plasmaExtinction", "diagnostics"],
    forbiddenConsumers: ["audioDensityWidth", "bloomWidth", "cameraWidth"],
  }),
  plasmaCoreDensity: contract({
    quantity: "plasmaCoreDensity",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "colored core layer carried by every valid persistent topology surface",
    deepOwner: "cymaticPlasmaCarrierNode.js",
    transforms: [
      "fixed Gaussian width ratio",
      "fixed layer weight",
      "binary valid-surface authority",
    ],
    allowedConsumers: ["plasmaEmission", "plasmaExtinction", "diagnostics"],
    forbiddenConsumers: ["audioDensityWidth", "bloomWidth", "cameraWidth"],
  }),
  plasmaSheathDensity: contract({
    quantity: "plasmaSheathDensity",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "restrained nonzero continuity sheath for every valid topology U=0 surface",
    deepOwner: "cymaticPlasmaCarrierNode.js",
    transforms: [
      "fixed Gaussian width ratio",
      "fixed layer weight",
      "continuous topology-surface validity",
    ],
    allowedConsumers: ["plasmaEmission", "plasmaExtinction", "diagnostics"],
    forbiddenConsumers: ["audioDensityWidth", "bloomWidth", "cameraWidth"],
  }),
  plasmaExtinction: contract({
    quantity: "plasmaExtinction",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "local Beer-Lambert extinction owned by organized plasma density",
    deepOwner: "cymaticPlasmaTransfer.js",
    transforms: [
      "fixed continuity/detail spine, core, and sheath densities",
      "fixed extinction coefficient",
    ],
    allowedConsumers: ["volumeTransmittance", "diagnostics"],
    forbiddenConsumers: ["bloom", "exposure", "cameraDepthHeuristic"],
  }),
  plasmaBaseRadiance: contract({
    quantity: "plasmaBaseRadiance",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "scene-linear locally colored self-emission before volume integration",
    deepOwner: "cymaticPlasmaTransfer.js",
    transforms: [
      "local spectral chromaticity",
      "fixed continuity/detail spine, core, and sheath excitation",
      "bounded tinted spine",
      "independent fixed continuity/detail/body source-radiance-to-extinction allocations",
    ],
    allowedConsumers: ["volumeBaseRadiance", "diagnostics"],
    forbiddenConsumers: ["observerGeometry", "bloomFeedback", "modeRanking"],
  }),
  plasmaAccentRadiance: contract({
    quantity: "plasmaAccentRadiance",
    lane: "plasma-material",
    surface: "material-transfer",
    represents:
      "bounded local audio accent on the same plasma sheet, before bloom",
    deepOwner: "cymaticPlasmaTransfer.js",
    transforms: ["local excitation authority", "fixed accent coefficient"],
    allowedConsumers: ["volumeAccentRadiance", "diagnostics"],
    forbiddenConsumers: ["observerGeometry", "surfaceWidth", "bloomFeedback"],
  }),
  volumeTransmittance: contract({
    quantity: "volumeTransmittance",
    lane: "volume-integration",
    represents:
      "front-to-back Beer-Lambert transmittance through the complete observed volume",
    deepOwner: "SafeVolumetricLightingModel.js",
    transforms: ["exponential extinction", "camera-ordered ray integration"],
    allowedConsumers: [
      "volumeBaseRadiance",
      "volumeAccentRadiance",
      "outputCoverage",
      "diagnostics",
    ],
    forbiddenConsumers: ["plasmaEmission", "observerState"],
  }),
  volumeBaseRadiance: contract({
    quantity: "volumeBaseRadiance",
    lane: "volume-integration",
    represents: "front-to-back integrated premultiplied plasma base radiance",
    deepOwner: "SafeVolumetricLightingModel.js",
    transforms: ["Beer-Lambert integration"],
    allowedConsumers: ["sceneLinearOutput", "baseAov", "diagnostics"],
    forbiddenConsumers: ["observerState", "modalField"],
  }),
  volumeAccentRadiance: contract({
    quantity: "volumeAccentRadiance",
    lane: "volume-integration",
    represents: "front-to-back integrated premultiplied plasma accent radiance",
    deepOwner: "SafeVolumetricLightingModel.js",
    transforms: ["Beer-Lambert integration"],
    allowedConsumers: ["sceneLinearOutput", "accentAov", "diagnostics"],
    forbiddenConsumers: ["observerState", "modalField"],
  }),
  outputCoverage: contract({
    quantity: "outputCoverage",
    lane: "volume-integration",
    represents: "one minus complete-volume transmittance",
    deepOwner: "SafeVolumetricLightingModel.js",
    transforms: ["one minus transmittance", "unit clamp"],
    allowedConsumers: ["outputAlpha", "coverageAov", "diagnostics"],
    forbiddenConsumers: ["plasmaEmission", "observerState"],
  }),
  optionalBloom: contract({
    quantity: "optionalBloom",
    lane: "presentation",
    represents:
      "downstream enhancement of already legible scene-linear plasma radiance",
    deepOwner: "outputPipeline.js",
    transforms: ["thresholded post-process blur"],
    allowedConsumers: ["displayOutput"],
    forbiddenConsumers: [
      "plasmaEmission",
      "plasmaExtinction",
      "observerState",
      "modalField",
    ],
  }),
  performanceResolution: contract({
    quantity: "performanceResolution",
    lane: "performance",
    represents:
      "numerical cache, march, and output resolution chosen for throughput",
    deepOwner: "performance profile and raymarch step controller",
    transforms: ["bounded numerical resolution selection"],
    allowedConsumers: ["fieldCacheResolution", "raymarchStepBudget"],
    forbiddenConsumers: [
      "modalAdmission",
      "observerClock",
      "observerExposure",
      "plasmaCalibration",
    ],
  }),
});

export const RAYMARCH_RENDER_QUANTITY_LANES = freezeStringRecord(
  Object.values(RAYMARCH_QUANTITY_LEDGER).reduce((lanes, entry) => {
    lanes[entry.lane] ??= [];
    lanes[entry.lane].push(entry.quantity);
    return lanes;
  }, {}),
);

export const RAYMARCH_MATERIAL_TRANSFER_LANES = freezeStringRecord(
  Object.values(RAYMARCH_QUANTITY_LEDGER)
    .filter((entry) => entry.surface === "material-transfer")
    .reduce((lanes, entry) => {
      lanes[entry.lane] ??= [];
      lanes[entry.lane].push(entry.quantity);
      return lanes;
    }, {}),
);

export const RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY = freezeStringRecord(
  Object.fromEntries(
    Object.entries(RAYMARCH_QUANTITY_LEDGER)
      .filter(([, entry]) => entry.forbiddenConsumers.length > 0)
      .map(([name, entry]) => [name, entry.forbiddenConsumers]),
  ),
);

export function getRaymarchQuantityContract(quantityName) {
  return RAYMARCH_QUANTITY_LEDGER[quantityName] ?? null;
}

export function isRaymarchQuantityConsumerAllowed(quantityName, consumerName) {
  const entry = getRaymarchQuantityContract(quantityName);
  if (!entry || entry.forbiddenConsumers.includes(consumerName)) {
    return false;
  }
  return (
    entry.allowedConsumers.includes(consumerName) ||
    entry.allowedConsumers.includes("*")
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
