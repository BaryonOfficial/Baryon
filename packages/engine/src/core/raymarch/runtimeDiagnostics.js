// Read-only projection of canonical runtime state for tests, developer tools,
// and the optional browser audit surface. Diagnostics may observe the live
// observer and plasma contracts, but never decide render, cache, or replay
// authority.
import { RAYMARCH_DEFAULTS } from "../../defaults.js";
import { clamp01 } from "../../utils/math.js";
import { normalizeCavityGeometry } from "../cavityGeometry.js";
import {
  CYMATIC_OBSERVER_REFERENCE,
  deriveCymaticPlasmaCarrier,
} from "./cymaticObserverReference.js";
import { SPECTRAL_PHASE_FIELD_REFERENCE } from "./spectralPhaseFieldReference.js";
import {
  CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
  CYMATIC_PLASMA_EMISSION_COEFFICIENT,
  CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
  CYMATIC_PLASMA_RADIANCE_GAIN,
  deriveCymaticPlasmaTransfer,
} from "./cymaticPlasmaTransfer.js";
import { CYMATIC_OBSERVER_CHECKPOINT_BYTES } from "./fieldCacheGeometry.js";
import { deriveFieldExcitation } from "./fieldAnalysis.js";
import {
  RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
  RAYMARCH_MATERIAL_TRANSFER_LANES,
  RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
  RAYMARCH_QUANTITY_LEDGER_VERSION,
  RAYMARCH_RENDER_QUANTITY_LANES,
  RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
} from "./quantityLedger.js";
import { readRuntimeModalResponseEnergy } from "./runtimeModalResponse.js";
import {
  RENDER_AUTHORITY_DISPLAY_HOLD_SEC,
  getRuntimeBoundaryMode,
  getRuntimeEffectiveCavityGeometry,
  resolveRaymarchStructuralProjectionDrive,
} from "./runtimeStateSelectors.js";

const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;
const MATERIAL_OUTPUT_VISIBLE_EPSILON = 1e-5;
const STATIC_OUTPUT_CHROMATICITY_SEMANTIC =
  "derived-from-static-uColor-linear-rgb;expected-not-gpu-readback";
const SPECTRAL_OUTPUT_CHROMATICITY_SEMANTIC =
  "observer-local-spectral-rgb;not-derivable-without-gpu-readback";
const EMPTY_ABSENT_DIAGNOSTIC_SOURCES = Object.freeze([]);

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function readUniformColorRgb(uniformNode, fallback) {
  const value = uniformNode?.value ?? uniformNode;
  if (
    Number.isFinite(value?.r) &&
    Number.isFinite(value?.g) &&
    Number.isFinite(value?.b)
  ) {
    return [value.r, value.g, value.b];
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return [
      readFiniteNumber(value[0], fallback[0]),
      readFiniteNumber(value[1], fallback[1]),
      readFiniteNumber(value[2], fallback[2]),
    ];
  }
  return fallback;
}

function computeLinearLuminance(rgb) {
  return (
    readFiniteNumber(rgb?.[0], 0) * 0.2126 +
    readFiniteNumber(rgb?.[1], 0) * 0.7152 +
    readFiniteNumber(rgb?.[2], 0) * 0.0722
  );
}

function normalizeLinearRgbChromaticity(rgb) {
  const nonnegativeRgb = [
    Math.max(0, readFiniteNumber(rgb?.[0], 0)),
    Math.max(0, readFiniteNumber(rgb?.[1], 0)),
    Math.max(0, readFiniteNumber(rgb?.[2], 0)),
  ];
  const luminance = Math.max(computeLinearLuminance(nonnegativeRgb), 1e-6);
  return nonnegativeRgb.map((channel) => channel / luminance);
}

function maxModalFieldAmplitude(modalDescriptor, activeCount = null) {
  const slots = modalDescriptor?.slotViews?.modalCoefficientSlots;
  const count = Math.min(
    Number.isFinite(activeCount) && activeCount > 0
      ? Math.floor(activeCount)
      : (modalDescriptor?.counts?.modalFieldModeCount ?? 0),
    slots?.length ?? 0,
  );
  let maxAmplitude = 0;
  for (let index = 0; index < count; index += 1) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(slots?.[index] ?? 0));
  }
  return maxAmplitude;
}

function summarizeRenderedLayer(spectralMomentSlots, count) {
  const slotCount = Math.max(0, Math.floor(count ?? 0));
  let spectralMomentRadiusMax = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    spectralMomentRadiusMax = Math.max(
      spectralMomentRadiusMax,
      Math.hypot(
        spectralMomentSlots?.[offset] ?? 0,
        spectralMomentSlots?.[offset + 1] ?? 0,
      ),
    );
  }
  return { count: slotCount, spectralMomentRadiusMax };
}

function deriveLightAsymmetry(primaryIntensity, secondaryIntensity) {
  const strongest = Math.max(primaryIntensity, secondaryIntensity, 1e-4);
  return Math.abs(primaryIntensity - secondaryIntensity) / strongest;
}

function deriveVisibilityGate({
  renderAuthority,
  displayHold,
  sourceBoundaryState,
  activeModeCount,
  volumeVisible,
  extinction,
  preBloomRadiance,
  postBloomRisk,
}) {
  const materialOutputVisible =
    Math.max(extinction, preBloomRadiance, postBloomRisk) >
    MATERIAL_OUTPUT_VISIBLE_EPSILON;
  if (!renderAuthority) {
    return {
      state: displayHold
        ? "render-authority-display-hold"
        : "render-authority-off",
      blockedReason:
        sourceBoundaryState ??
        (displayHold
          ? "render-authority-display-continuity"
          : "render-authority"),
      materialOutputVisible,
    };
  }
  if (!(activeModeCount > 0)) {
    return {
      state: "modal-packet-empty",
      blockedReason: "modal-field-empty",
      materialOutputVisible,
    };
  }
  if (volumeVisible !== true) {
    return {
      state: "volume-hidden",
      blockedReason: "hard-gate-hidden",
      materialOutputVisible,
    };
  }
  return {
    state: "visible",
    blockedReason: null,
    materialOutputVisible,
  };
}

function buildPlasmaProbe(
  runtimeState,
  localRadiance,
  bloomRisk,
  surfaceAuthority = 0,
) {
  const safeSurfaceAuthority = clamp01(surfaceAuthority);
  const carrier = deriveCymaticPlasmaCarrier({
    signedDistanceWorld: 0,
    surfaceNormalWorld: [safeSurfaceAuthority, 0, 0],
    surfaceSupport: safeSurfaceAuthority,
    rayDirLocal: [1, 0, 0],
    fineDetailAgreement: safeSurfaceAuthority,
    fineResidual: 0,
  });
  const materialColor = readUniformColorRgb(
    runtimeState.uniforms.uColor,
    [0.34, 0.62, 0.9],
  );
  const tangentColor = readUniformColorRgb(
    runtimeState.uniforms.uCausticColor,
    [0.36, 0.89, 0.96],
  );
  const materialDensityScale =
    Math.max(0, runtimeState.uniforms.uDensityGain?.value ?? 0) /
    RAYMARCH_DEFAULTS.densityGain;
  const transfer = deriveCymaticPlasmaTransfer({
    localRadiance,
    continuitySpineDensity: carrier.continuitySpineDensity,
    detailSpineDensity: carrier.detailSpineDensity,
    coreDensity: carrier.coreDensity,
    sheathDensity: carrier.sheathDensity,
    materialDensityScale,
    materialColor,
    tangentColor,
    normalDotRay: 1,
    tangentAuthority: runtimeState.uniforms.uCausticStrength?.value ?? 0,
    tangentPower: runtimeState.uniforms.uLaserFocus?.value ?? 1,
    audioAccentGain: 0,
  });
  const preBloomRadiance = computeLinearLuminance(transfer.sourceRadiance);
  const bloomAmplification =
    1 +
    bloomRisk * Math.max(0, runtimeState.bloomTuning?.effectiveStrength ?? 0);
  const spectralPresentationEnabled =
    (runtimeState.uniforms.uSpectralPresentationEnabled?.value ?? 0) > 0;
  const staticColorActive = !spectralPresentationEnabled;

  return {
    fineDetailAuthority: carrier.fineDetailAuthority,
    continuitySpineDensity: carrier.continuitySpineDensity,
    detailSpineDensity: carrier.detailSpineDensity,
    spineDensity: carrier.spineDensity,
    coreDensity: carrier.coreDensity,
    sheathDensity: carrier.sheathDensity,
    materialColor,
    spectralPresentationEnabled,
    staticColorActive,
    expectedOutputChromaticityLinearRgb: staticColorActive
      ? normalizeLinearRgbChromaticity(materialColor)
      : null,
    outputChromaticitySemantic: staticColorActive
      ? STATIC_OUTPUT_CHROMATICITY_SEMANTIC
      : SPECTRAL_OUTPUT_CHROMATICITY_SEMANTIC,
    transfer,
    preBloomRadiance,
    postBloomRisk: preBloomRadiance * bloomAmplification,
    bloomAmplification,
  };
}

function buildDebugSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  const modalDescriptor =
    runtimeState.currentModalDescriptor ??
    featureFrame?.modalDescriptor ??
    null;
  const activeModeCount = Math.max(
    0,
    Math.floor(runtimeState.uniforms.uModalFieldModeCount?.value ?? 0),
  );
  const structuralProjection =
    runtimeState.raymarchStructuralProjection ??
    resolveRaymarchStructuralProjectionDrive(
      runtimeState,
      activeModeCount,
      featureFrame,
    );
  const localRadiance = renderAuthority
    ? clamp01(structuralProjection.projectionEnergyDrive)
    : 0;
  const stepBudget = Math.max(
    1,
    Math.round(runtimeState.volumeMesh?.material?.steps ?? 1),
  );
  const densityGain = runtimeState.uniforms.uDensityGain?.value ?? 0;
  const effectiveBloomStrength =
    runtimeState.bloomTuning?.effectiveStrength ?? 0;
  const effectiveBloomRadius = runtimeState.bloomTuning?.effectiveRadius ?? 0;
  const effectiveBloomThreshold =
    runtimeState.bloomTuning?.effectiveThreshold ?? 0;
  const bloomRisk = clamp01(
    localRadiance *
      (0.7 + Math.max(0, effectiveBloomStrength) * 1.6) *
      (1.1 - clamp01(effectiveBloomThreshold) * 0.4),
  );
  const plasmaProbe = buildPlasmaProbe(
    runtimeState,
    localRadiance,
    bloomRisk,
    renderAuthority && activeModeCount > 0 ? 1 : 0,
  );
  const sourceBoundaryState =
    featureFrame?.energyLedger?.sourceBoundaryState ?? null;
  const displayHold = runtimeState.renderAuthorityDisplayHoldActive === true;
  const visibilityGate = deriveVisibilityGate({
    renderAuthority,
    displayHold,
    sourceBoundaryState,
    activeModeCount,
    volumeVisible: runtimeState.volumeMesh?.visible === true,
    extinction: plasmaProbe.transfer.extinction,
    preBloomRadiance: plasmaProbe.preBloomRadiance,
    postBloomRisk: plasmaProbe.postBloomRisk,
  });
  const renderedModalField = summarizeRenderedLayer(
    runtimeState.modalFieldSpectralMomentBuffer?.value?.array,
    activeModeCount,
  );
  const coefficientFrame = renderAuthority
    ? runtimeState.radiationPotentialCoefficientFrame
    : null;
  const raymarchFieldAnalysis = runtimeState.raymarchFieldAnalysis ?? null;
  const projectedRenderEnergy = Math.max(
    0,
    readFiniteNumber(featureFrame?.energyLedger?.projectedRenderEnergy, 0),
  );
  const renderEnergyEpsilon = Math.max(
    0,
    readFiniteNumber(featureFrame?.energyLedger?.renderEnergyEpsilon, 1e-6),
  );
  const primaryLightIntensity =
    runtimeState.sceneLighting?.primary?.intensity ?? 0;
  const secondaryLightIntensity =
    runtimeState.sceneLighting?.secondary?.intensity ?? 0;
  const staticMaterialColorLinearRgb = readUniformColorRgb(
    runtimeState.uniforms.uColor,
    [0.34, 0.62, 0.9],
  );
  const transfer = plasmaProbe.transfer;
  const frameDebug = featureFrame?.debug ?? {};
  const observerState = runtimeState.fieldCache?.getObserverState?.() ?? null;

  return {
    fieldState,
    renderAuthority,
    renderAuthorityDisplayHold: displayHold,
    renderAuthorityDisplayHoldAgeSec:
      runtimeState.renderAuthorityDisplayHoldAgeSec ?? null,
    renderAuthorityDisplayHoldMaxSec: RENDER_AUTHORITY_DISPLAY_HOLD_SEC,
    projectedRenderEnergy,
    renderEnergyEpsilon,
    sourceBoundaryState,
    observationHardSilence:
      !renderAuthority && projectedRenderEnergy <= renderEnergyEpsilon,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      raymarchFieldAnalysis?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      raymarchFieldAnalysis?.uploadedModeCount ?? activeModeCount,
    modalFieldModeCount: activeModeCount,
    renderedModalFieldModeCount: renderedModalField.count,
    renderedModalFieldSpectralMomentRadiusMax:
      renderedModalField.spectralMomentRadiusMax,
    renderedModalFieldAmplitudeTotal: structuralProjection.amplitudeSum,
    structuralProjectionAmplitudeSum: structuralProjection.amplitudeSum,
    structuralProjectionEnergy: structuralProjection.structuralEnergy,
    structuralProjectionEffectiveModeCount:
      structuralProjection.effectiveModeCount,
    structuralProjectionRmsAmplitude:
      structuralProjection.rmsStructuralAmplitude,
    structuralProjectionDrive: structuralProjection.projectionEnergyDrive,
    structuralProjectionConcentration:
      structuralProjection.structuralConcentration,
    structuralProjectionRmsSpatialWavenumber:
      structuralProjection.rmsSpatialWavenumber,
    structuralProjectionObservedEnergy:
      structuralProjection.observedStructuralEnergy,
    structuralProjectionObservedRmsSpatialWavenumber:
      structuralProjection.observedRmsSpatialWavenumber,
    structuralProjectionResolvedObservationEnergyFraction:
      structuralProjection.resolvedObservationEnergyFraction,
    structuralProjectionReferenceEnergy: structuralProjection.referenceEnergy,
    totalSlotAmplitude: structuralProjection.amplitudeSum,
    modalCoefficientEnergy: localRadiance,
    modalResponseEnergy: renderAuthority
      ? clamp01(readRuntimeModalResponseEnergy(runtimeState, featureFrame))
      : 0,
    modalPhaseAuthority: renderAuthority
      ? (featureFrame?.modalPhaseAuthority ?? 0)
      : 0,
    modalDescriptorFieldAuthority:
      modalDescriptor?.fieldAuthority ?? "unavailable",
    modalDescriptorOverflow:
      modalDescriptor?.diagnostics?.descriptorOverflow === true,
    modalDescriptorMaxTotalModes:
      modalDescriptor?.capacity?.maxTotalModes ?? activeModeCount,
    modalDescriptorValidModeCount:
      modalDescriptor?.counts?.validModeCount ?? activeModeCount,
    modalDescriptorOverflowModeCount:
      modalDescriptor?.counts?.overflowModeCount ?? 0,
    modalDescriptorPhaseAuthorityModeCount:
      modalDescriptor?.diagnostics?.phaseAuthorityModeCount ?? 0,
    modalVarietyAudit: modalDescriptor?.diagnostics?.modalVarietyAudit ?? null,
    dominantFrequency:
      frameDebug.dominantFrequency ?? frameDebug.fundamentalFrequency ?? 0,
    fieldExcitation: deriveFieldExcitation(featureFrame),
    complexityScore: raymarchFieldAnalysis?.complexityScore ?? 0,
    complexityExcitation:
      raymarchFieldAnalysis?.excitation ?? deriveFieldExcitation(featureFrame),
    complexityWeightedPermutationLoad:
      raymarchFieldAnalysis?.weightedPermutationLoad ?? 0,
    complexityCountLoad: raymarchFieldAnalysis?.countLoad ?? 0,
    peakModalFieldAmplitude: maxModalFieldAmplitude(
      modalDescriptor,
      activeModeCount,
    ),
    transientEnergy: featureFrame?.transientEnergy ?? 0,
    spectralCentroid: featureFrame?.spectralCentroid ?? 0,
    spectralFlux: featureFrame?.spectralFlux ?? 0,
    structureSignal: featureFrame?.structureSignal ?? 0,
    energySignal: featureFrame?.energySignal ?? 0,
    changeSignal: featureFrame?.changeSignal ?? 0,
    changeBreakdown:
      featureFrame?.debug?.changeBreakdown ??
      featureFrame?.changeBreakdown ??
      null,
    pulseSignal: featureFrame?.pulseSignal ?? 0,
    beatDetected: featureFrame?.beatDetected ?? false,
    beatPulseId: featureFrame?.beatPulseId ?? 0,
    beatStrength: featureFrame?.beatStrength ?? 0,
    beatConfidence: featureFrame?.beatConfidence ?? 0,
    modeCoherence: featureFrame?.modeCoherence ?? 0,
    trebleTonalEnergy: featureFrame?.trebleTonalEnergy ?? 0,
    trebleBroadbandEnergy: featureFrame?.trebleBroadbandEnergy ?? 0,
    projectionRawEnergySourceCoupled:
      frameDebug.projectionRawEnergySourceCoupled ?? 0,
    projectionRawEnergyResonant: frameDebug.projectionRawEnergyResonant ?? 0,
    projectionOverlapPressureSourceCoupled:
      frameDebug.projectionOverlapPressureSourceCoupled ?? 0,
    projectionOverlapPressureResonant:
      frameDebug.projectionOverlapPressureResonant ?? 0,
    projectionLoad: frameDebug.projectionLoad ?? 0,
    projectionResonantProtection: frameDebug.projectionResonantProtection ?? 0,
    projectionConservationApplied:
      frameDebug.projectionConservationApplied ?? false,
    resonantPhaseAuthority: frameDebug.resonantPhaseAuthority ?? 0,
    sourceCoupledPhaseAuthority: frameDebug.sourceCoupledPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      frameDebug.modalPhaseCoherentFieldModeCount ?? 0,
    spectralBandEnergies: featureFrame?.spectralBandEnergies
      ? Array.from(featureFrame.spectralBandEnergies)
      : null,
    observerStateOwner: "fieldCache.cymaticObserver",
    observerBakeExecuted:
      runtimeState?.cymaticObserverBakeResult?.baked === true,
    observerAdvanced:
      runtimeState?.cymaticObserverBakeResult?.advanced === true,
    observerStepCount: Math.max(
      0,
      Math.floor(runtimeState?.cymaticObserverBakeResult?.stepCount ?? 0),
    ),
    observerStepIndex: Number.isFinite(
      runtimeState?.cymaticObserverBakeResult?.stepIndex,
    )
      ? Math.max(
          0,
          Math.floor(runtimeState.cymaticObserverBakeResult.stepIndex),
        )
      : null,
    observerCheckpointKeyActive:
      typeof observerState?.checkpointKey === "string",
    observerCheckpointSaved:
      runtimeState?.cymaticObserverBakeResult?.checkpointSaved === true,
    observerCheckpointRestored:
      runtimeState?.cymaticObserverBakeResult?.checkpointRestored === true,
    observerCheckpointStepIndex: observerState?.checkpointStepIndex ?? null,
    observerCheckpointSaveCount:
      runtimeState.cymaticObserverCheckpointSaveCount ?? 0,
    observerCheckpointRestoreCount:
      runtimeState.cymaticObserverCheckpointRestoreCount ?? 0,
    observerCheckpointLastEvent:
      runtimeState.cymaticObserverCheckpointLastEvent ?? null,
    observerCheckpointBytes: CYMATIC_OBSERVER_CHECKPOINT_BYTES,
    observerFixedStepSeconds: CYMATIC_OBSERVER_REFERENCE.fixedStepSeconds,
    observerFineApertureFwhmWorld:
      CYMATIC_OBSERVER_REFERENCE.fineApertureFwhmWorld,
    observerTopologyApertureFwhmWorld:
      CYMATIC_OBSERVER_REFERENCE.topologyApertureFwhmWorld,
    observerFineResidualScaleWorld:
      CYMATIC_OBSERVER_REFERENCE.fineResidualScaleWorld,
    observerFineResidualDetailLimit:
      CYMATIC_OBSERVER_REFERENCE.fineResidualDetailLimit,
    observerGeometryExposureSeconds:
      runtimeState.cymaticObserverTuning.geometryExposureSeconds,
    observerRadianceExposureSeconds:
      CYMATIC_OBSERVER_REFERENCE.radianceExposureSeconds,
    observerSpectralExposureSeconds:
      SPECTRAL_PHASE_FIELD_REFERENCE.spectralExposureSeconds,
    observerSheetFwhmWorld: CYMATIC_OBSERVER_REFERENCE.sheetFwhmWorld,
    observerSpineWidthRatio: CYMATIC_OBSERVER_REFERENCE.spineWidthRatio,
    observerContinuitySpineWidthRatio:
      CYMATIC_OBSERVER_REFERENCE.continuitySpineWidthRatio,
    observerCoreWidthRatio: CYMATIC_OBSERVER_REFERENCE.coreWidthRatio,
    observerSheathWidthRatio: CYMATIC_OBSERVER_REFERENCE.sheathWidthRatio,
    plasmaRadianceGain: CYMATIC_PLASMA_RADIANCE_GAIN,
    plasmaExtinctionCoefficient: CYMATIC_PLASMA_EXTINCTION_COEFFICIENT,
    plasmaEmissionCoefficient: CYMATIC_PLASMA_EMISSION_COEFFICIENT,
    plasmaContinuitySpineRadiancePerExtinctionLimit:
      CYMATIC_PLASMA_CONTINUITY_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    plasmaDetailSpineRadiancePerExtinctionLimit:
      CYMATIC_PLASMA_DETAIL_SPINE_RADIANCE_PER_EXTINCTION_LIMIT,
    plasmaBodyRadiancePerExtinctionLimit:
      CYMATIC_PLASMA_BODY_RADIANCE_PER_EXTINCTION_LIMIT,
    plasmaProbeLocalRadiance: localRadiance,
    plasmaProbeFineDetailAuthority: plasmaProbe.fineDetailAuthority,
    plasmaProbeContinuitySpineDensity: plasmaProbe.continuitySpineDensity,
    plasmaProbeDetailSpineDensity: plasmaProbe.detailSpineDensity,
    plasmaProbeSpineDensity: plasmaProbe.spineDensity,
    plasmaProbeCoreDensity: plasmaProbe.coreDensity,
    plasmaProbeSheathDensity: plasmaProbe.sheathDensity,
    plasmaProbeMaterialDensityScale: transfer.materialDensityScale,
    plasmaProbeOrganizedSpineDensity: transfer.organizedSpineDensity,
    plasmaProbeOrganizedContinuitySpineDensity:
      transfer.organizedContinuitySpineDensity,
    plasmaProbeOrganizedDetailSpineDensity:
      transfer.organizedDetailSpineDensity,
    plasmaProbeOrganizedCoreDensity: transfer.organizedCoreDensity,
    plasmaProbeOrganizedSheathDensity: transfer.organizedSheathDensity,
    plasmaProbeOrganizedDensity: transfer.organizedDensity,
    plasmaProbeContinuitySpineExtinction: transfer.continuitySpineExtinction,
    plasmaProbeDetailSpineExtinction: transfer.detailSpineExtinction,
    plasmaProbeSpineExtinction: transfer.spineExtinction,
    plasmaProbeBodyExtinction: transfer.bodyExtinction,
    plasmaProbeExtinction: transfer.extinction,
    plasmaProbeSpineEmissionSourceStrength:
      transfer.spineEmissionSourceStrength,
    plasmaProbeContinuitySpineEmissionSourceStrength:
      transfer.continuitySpineEmissionSourceStrength,
    plasmaProbeDetailSpineEmissionSourceStrength:
      transfer.detailSpineEmissionSourceStrength,
    plasmaProbeCoreEmissionSourceStrength: transfer.coreEmissionSourceStrength,
    plasmaProbeSheathEmissionSourceStrength:
      transfer.sheathEmissionSourceStrength,
    plasmaProbeEmissionSourceStrength: transfer.emissionSourceStrength,
    plasmaProbeContinuitySpineRadianceAllocation:
      transfer.continuitySpineRadianceAllocation,
    plasmaProbeDetailSpineRadianceAllocation:
      transfer.detailSpineRadianceAllocation,
    plasmaProbeBodyRadianceAllocation: transfer.bodyRadianceAllocation,
    plasmaProbeSpineBaseRadiance: transfer.spineBaseRadiance,
    plasmaProbeBodyBaseRadiance: transfer.bodyBaseRadiance,
    plasmaProbeBaseRadiance: transfer.baseRadiance,
    plasmaProbeAccentRadiance: transfer.accentRadiance,
    plasmaProbePreBloomRadiance: plasmaProbe.preBloomRadiance,
    plasmaProbePostBloomRisk: plasmaProbe.postBloomRisk,
    plasmaProbeBloomAmplification: plasmaProbe.bloomAmplification,
    plasmaProbeModalPacketReady: activeModeCount > 0,
    staticColorActive: plasmaProbe.staticColorActive,
    staticMaterialColorLinearRgb,
    expectedOutputChromaticityLinearRgb:
      plasmaProbe.expectedOutputChromaticityLinearRgb,
    outputChromaticitySemantic: plasmaProbe.outputChromaticitySemantic,
    avgDensity: transfer.organizedDensity,
    avgOpacity: 1 - Math.exp(-transfer.extinction),
    materialOutputVisible: visibilityGate.materialOutputVisible,
    visibilityGateState: visibilityGate.state,
    visibilityGateBlockedReason: visibilityGate.blockedReason,
    earlyExitEnabled: true,
    earlyExitThreshold: EARLY_EXIT_TRANSMITTANCE_EPSILON,
    earlyExitRatio: Math.min(1, 1 - Math.exp(-transfer.extinction)),
    densityGain,
    stepBudget,
    stepReference: runtimeState.bloomTuning?.stepReference ?? stepBudget,
    stepCompensation: runtimeState.bloomTuning?.stepCompensation ?? 1,
    lowStepBloomGuard: runtimeState.bloomTuning?.lowStepBloomGuard ?? 0,
    causticStrength: runtimeState.uniforms.uCausticStrength?.value ?? 0,
    laserFocus: runtimeState.uniforms.uLaserFocus?.value ?? 0,
    effectiveBloomStrength,
    effectiveBloomRadius,
    effectiveBloomThreshold,
    bloomRisk,
    responseEnvelope: runtimeState.responseEnvelope ?? 0,
    motionSignal: runtimeState.motionSignal ?? 0,
    scaleSignal: runtimeState.scaleSignal ?? 0,
    bloomResponseSignal: runtimeState.bloomResponseSignal ?? 0,
    visualScale: runtimeState.visualRoot?.scale?.x ?? 1,
    volumeVisible: runtimeState.volumeMesh?.visible ?? false,
    idleOverlayVisible: runtimeState.idleOverlay?.visible ?? false,
    boundaryMode: getRuntimeBoundaryMode(runtimeState),
    requestedCavityGeometry: normalizeCavityGeometry(
      runtimeState.requestedCavityGeometry,
    ),
    effectiveCavityGeometry: getRuntimeEffectiveCavityGeometry(runtimeState),
    boundaryMaterialMode:
      runtimeState.volumeMesh?.userData?.raymarchBoundaryMode ??
      getRuntimeBoundaryMode(runtimeState),
    materialCavityGeometry:
      runtimeState.volumeMesh?.userData?.raymarchCavityGeometry ??
      getRuntimeEffectiveCavityGeometry(runtimeState),
    auditFixtureBaseOnly: runtimeState.auditFixtureBaseOnly === true,
    spectralChroma: runtimeState.uniforms.uSpectralChroma?.value ?? 1,
    spectralPresentationEnabled: plasmaProbe.spectralPresentationEnabled,
    spectralColorFieldImplementationState:
      RAYMARCH_SPECTRAL_PHASE_REPRESENTATION,
    opticalFieldRepresentation: RAYMARCH_OPTICAL_FIELD_REPRESENTATION,
    radiationPotentialModeCapacity: Math.max(
      0,
      Math.floor(runtimeState.modalFieldCapacity ?? 0),
    ),
    radiationPotentialObservedCoefficientEnergy: Math.max(
      0,
      readFiniteNumber(coefficientFrame?.observedCoefficientEnergy, 0),
    ),
    radiationPotentialObservedCoefficientNorm: Math.max(
      0,
      readFiniteNumber(coefficientFrame?.observedCoefficientNorm, 0),
    ),
    radiationPotentialNormalizedEnergyNorm: Math.max(
      0,
      Math.sqrt(
        Math.max(0, readFiniteNumber(coefficientFrame?.normalizedEnergySum, 0)),
      ),
    ),
    radiationPotentialBakeModeCount: Math.max(
      0,
      Math.floor(
        readFiniteNumber(
          coefficientFrame?.analyticPotentialEvaluationCountPerSample,
          0,
        ),
      ),
    ),
    radiationPotentialExposureDrive: Math.max(
      0,
      readFiniteNumber(coefficientFrame?.exposureDrive, 0),
    ),
    radiationPotentialPacketStatus:
      renderAuthority && activeModeCount > 0 ? "live" : "none",
    renderQuantityLedgerVersion: RAYMARCH_QUANTITY_LEDGER_VERSION,
    renderQuantityOwnershipLanes: RAYMARCH_RENDER_QUANTITY_LANES,
    renderMaterialTransferLanes: RAYMARCH_MATERIAL_TRANSFER_LANES,
    renderQuantityForbiddenConsumers: RAYMARCH_FORBIDDEN_CONSUMER_SUMMARY,
    primaryLightIntensity,
    secondaryLightIntensity,
    sceneLightAsymmetry: deriveLightAsymmetry(
      primaryLightIntensity,
      secondaryLightIntensity,
    ),
    idleLogoSuppressedForLive: runtimeState.idleLogoSuppressedForLive === true,
    idleLogoSuppressedForActiveTransport:
      runtimeState.idleLogoSuppressedForActiveTransport === true,
    absentDiagnosticSources: EMPTY_ABSENT_DIAGNOSTIC_SOURCES,
  };
}

function publishAuditSnapshot(snapshot) {
  if (typeof window === "undefined") {
    return;
  }
  if (snapshot == null) {
    delete (/** @type {any} */ (window).__baryonAuditSnapshot);
    return;
  }
  /** @type {any} */ (window).__baryonAuditSnapshot = snapshot;
}

export function publishRaymarchRuntimeAuditSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  if (!(runtimeState.auditEnabled || runtimeState.renderProbeEnabled)) {
    runtimeState.debugSnapshot = null;
    publishAuditSnapshot(null);
    return;
  }

  const raymarchDebug = buildDebugSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
  runtimeState.debugSnapshot = featureFrame?.debug
    ? { ...featureFrame.debug, raymarchDebug, ...raymarchDebug }
    : raymarchDebug;
  if (runtimeState.auditEnabled) {
    publishAuditSnapshot(runtimeState.debugSnapshot);
  } else {
    publishAuditSnapshot(null);
  }
}
