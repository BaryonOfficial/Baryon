export const RAYMARCH_QUANTITY_LEDGER_VERSION =
  "raymarch-material-transfer-v1";

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
  represents,
  transforms = [],
  allowedConsumers = [],
  forbiddenConsumers = [],
  requiredEvidenceByConsumer = {},
}) {
  return Object.freeze({
    quantity,
    lane,
    represents,
    transforms: freezeStringArray(transforms),
    allowedConsumers: freezeStringArray(allowedConsumers),
    forbiddenConsumers: freezeStringArray(forbiddenConsumers),
    requiredEvidenceByConsumer: freezeStringArrayRecord(
      requiredEvidenceByConsumer,
    ),
  });
}

export const RAYMARCH_QUANTITY_LEDGER = Object.freeze({
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
    represents: "post-observation density including physical density or support floor",
    transforms: ["max physicalVisibleDensity observedDensityFloor"],
    allowedConsumers: ["stabilizedDensity", "supportVisibleDensity", "opacity"],
    forbiddenConsumers: [
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

export const RAYMARCH_MATERIAL_TRANSFER_LANES = freezeStringArrayRecord(
  Object.values(RAYMARCH_QUANTITY_LEDGER).reduce((lanes, contract) => {
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
