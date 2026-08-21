export const RAYMARCH_QUANTITY_LEDGER_VERSION = "cymatic-observer-quantity-v11";
export const RAYMARCH_OPTICAL_FIELD_REPRESENTATION =
  "complete-modal-gorkov-field-fixed-scale-space-persistent-topology-u0-observer";
export const RAYMARCH_SPECTRAL_PHASE_REPRESENTATION =
  "observer-phase-cache-nearest-rgb-companion";

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
  admittedModalDescriptor: contract({
    quantity: "admittedModalDescriptor",
    lane: "modal-field",
    represents:
      "the complete cache-resolved set of admitted eigenmode identities",
    deepOwner: "audioFeatureModalProjection.js modal descriptor",
    transforms: ["apparatus admission", "stable descriptor ordering"],
    allowedConsumers: [
      "modalFieldPacket",
      "modalCoefficientPacket",
      "diagnostics",
    ],
    forbiddenConsumers: [
      "performanceTierPaging",
      "cameraRanking",
      "materialRanking",
    ],
  }),
  modalCoefficientPacket: contract({
    quantity: "modalCoefficientPacket",
    lane: "modal-field",
    represents:
      "per-mode pressure amplitudes and phases at one authoritative audio time",
    deepOwner: "runtimeModalUpload.js radiation potential packet",
    transforms: [
      "modal response",
      "cache-passband transfer",
      "deterministic packing",
    ],
    allowedConsumers: ["completeAcousticField", "diagnostics"],
    forbiddenConsumers: [
      "bloom",
      "camera",
      "frameRate",
      "performanceTierPaging",
    ],
  }),
  modalSpectralPacket: contract({
    quantity: "modalSpectralPacket",
    lane: "spectral-phase",
    represents:
      "per-shell first and second circular pitch basis independent of acoustic amplitude",
    deepOwner: "modal descriptor spectral moment slot views",
    transforms: ["response-frequency phase fold", "deterministic packing"],
    allowedConsumers: ["fieldSpectralMomentEvidence", "diagnostics"],
    forbiddenConsumers: [
      "fieldPotential",
      "observerGeometry",
      "observerRadiance",
    ],
  }),
  fieldSpectralMomentEvidence: contract({
    quantity: "fieldSpectralMomentEvidence",
    lane: "spectral-phase",
    represents:
      "additive local first moment M1, second moment M2, and nonnegative support W",
    deepOwner: "radiationPotentialObservation.js coherent shell observation",
    transforms: [
      "squared local shell support q=S^2",
      "linear fine-aperture filtering before normalization",
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
      "cycle-averaged Gor'kov potential and gradient from every admitted mode",
    deepOwner: "fieldCacheBake.js complete modal bake",
    transforms: ["coherent same-frequency shells", "cycle-averaged energy"],
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
    deepOwner: "cymaticObserverNode.js geometry ping-pong lane",
    transforms: [
      "field-derived advection",
      "fixed 200 ms exponential exposure",
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
  observerSurfaceNormal: contract({
    quantity: "observerSurfaceNormal",
    lane: "observer-state",
    surface: "material-transfer",
    represents:
      "local normalized topology-aperture gradient whose nonzero direction proves persistent U=0 surface validity",
    deepOwner: "cymaticObserverNode.js geometry ping-pong lane",
    transforms: ["gradient normalization", "fixed 200 ms geometry exposure"],
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
      "compressed absolute local acoustic energy",
      "continuous topology-gradient validity",
      "fixed 50 ms exponential exposure",
    ],
    allowedConsumers: [
      "observerGeometryAssimilation",
      "plasmaCarrier",
      "diagnostics",
    ],
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
      "fixed 200 ms geometry exposure",
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
      "fast local acoustic energy response carried with the observed sheet",
    deepOwner: "cymaticObserverNode.js appearance blue lane",
    transforms: [
      "field-local energy",
      "field-derived advection",
      "fixed 50 ms exponential exposure",
      "bounded compression",
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
      "cymaticObserverNode.js appearance xy phase direction and response-derived reset seed",
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
      "cymaticObserverNode.js two-harmonic projection; fieldCacheSampling.js nearest organization-lane fetch",
    transforms: [
      "pinned two-harmonic phase projection",
      "RGB organization-lane half-float packing",
      "nearest observer-voxel fetch",
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
