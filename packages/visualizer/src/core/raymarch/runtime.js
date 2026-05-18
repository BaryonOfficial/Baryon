import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import { getBoundaryModeFromValue } from "../modeFamily.js";
import { isFieldDrivenState } from "../fieldState.js";
import { resolveRaymarchFieldCacheOverride } from "../../visualization/fieldEvaluation.js";
import {
  buildRaymarchSpectralLightCacheDescriptor,
  disposeRaymarchPhaseOverlayCache,
  disposeRaymarchFieldCache,
  disposeRaymarchSpectralLightCache,
  enqueueRaymarchPhaseOverlayRebuild,
  enqueueRaymarchFieldCacheRebuild,
  enqueueRaymarchSpectralLightCacheRebuild,
  isRaymarchSpectralLightCacheReadyForDescriptor,
  isRaymarchFieldCacheReadyForDescriptor,
  shouldRebuildRaymarchSpectralLightCache,
  shouldRebuildRaymarchFieldCache,
  buildRaymarchFieldCacheDescriptor,
  RAYMARCH_FIELD_CACHE_RESOLUTION,
  RAYMARCH_PHASE_OVERLAY_BACKBONE_LIMIT,
  RAYMARCH_PHASE_OVERLAY_DETAIL_LIMIT,
  RAYMARCH_PHASE_OVERLAY_RESOLUTION,
} from "./fieldCache.js";
import {
  DETAIL_LAYER_WEIGHT,
  deriveRetainedHighQVisibilityDiagnostics,
  deriveVisibleDensity,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
} from "./fieldShaping.js";
import {
  buildRaymarchPerformanceGovernor,
  copyBudgetedModeLayer,
  deriveFieldExcitation,
  inferLayerCapacity,
} from "./performanceGovernor.js";
import {
  RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES,
  setRaymarchSpectralLightEvaluationMode,
  setRaymarchCavityGeometry,
  setRaymarchFieldEvaluationMode,
} from "./material.js";
import { resolveIdleOverlayVisible } from "../idleLogoVisibility.js";

const EMPTY_BAND_ENERGIES = Object.freeze([0, 0, 0, 0]);
const RESPONSE_ATTACK = 7;
const RESPONSE_RELEASE = 3.6;
const RESPONSE_IDLE_RELEASE = 5.5;
const RHYTHMIC_RELEASE_RATE_GAIN = 2.5;
const DECAY_RELEASE_ENERGY_END = 0.22;
const DECAY_RELEASE_CHANGE_END = 0.12;
const DECAY_RELEASE_STRUCTURE_END = 0.42;
const DECAY_RELEASE_TARGET_REDUCTION = 0.55;
const DECAY_RELEASE_RATE_GAIN = 1.9;
const ACCENT_ATTACK = 15;
const ACCENT_RELEASE = 11;
const DENSITY_RESPONSE_AMOUNT = 0.08;
const THRESHOLD_RESPONSE_REDUCTION = 0.42;
const CONTOUR_RESPONSE_GAIN = 1.85;
const BLOOM_STRENGTH_RESPONSE_GAIN = 0.18;
const BLOOM_RADIUS_RESPONSE_GAIN = 0.16;
const BLOOM_THRESHOLD_RESPONSE_GAIN = 0.08;
const EARLY_EXIT_TRANSMITTANCE_EPSILON = 5e-3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function damp(current, target, smoothing, deltaTime) {
  const factor = 1 - Math.exp(-Math.max(0, smoothing) * Math.max(0, deltaTime));
  return current + (target - current) * factor;
}

function deriveDecayReleaseMask({
  fieldState,
  gatedStructureSignal,
  gatedEnergySignal,
  gatedChangeSignal,
}) {
  if (fieldState !== "decay") {
    return 0;
  }

  const lowEnergyMask = clamp01(
    (DECAY_RELEASE_ENERGY_END - gatedEnergySignal) / DECAY_RELEASE_ENERGY_END,
  );
  const lowChangeMask = clamp01(
    (DECAY_RELEASE_CHANGE_END - gatedChangeSignal) / DECAY_RELEASE_CHANGE_END,
  );
  const lowStructureMask = clamp01(
    (DECAY_RELEASE_STRUCTURE_END - gatedStructureSignal) /
      DECAY_RELEASE_STRUCTURE_END,
  );

  return clamp01(Math.min(lowEnergyMask, lowChangeMask) * lowStructureMask);
}

function estimateAverageModeAmplitude(modeSlots) {
  if (!modeSlots?.length) return 0;

  let total = 0;
  let count = 0;
  for (let i = 0; i < modeSlots.length; i += 4) {
    const amplitude = modeSlots[i + 3] ?? 0;
    if (amplitude <= 0) continue;
    total += amplitude;
    count += 1;
  }

  return count > 0 ? total / count : 0;
}

function setIfChanged(uniformNode, value) {
  if (!uniformNode) return;
  if (uniformNode.value !== value) uniformNode.value = value;
}

// Sum of all slot amplitudes weighted by layer, matching accumulateSpecializedLayer's
// weight assignment (backbone × 1.0, detail × DETAIL_LAYER_WEIGHT). Used to
// normalize the Chladni field in the shader so structural pattern is amplitude-invariant.
function sumLayeredAmplitude(featureFrame) {
  let total = 0;
  const backbone = featureFrame?.backboneSlots;
  const detail = featureFrame?.detailSlots;
  if (backbone) {
    for (let i = 3; i < backbone.length; i += 4) total += backbone[i] ?? 0;
  }
  if (detail) {
    for (let i = 3; i < detail.length; i += 4)
      total += (detail[i] ?? 0) * DETAIL_LAYER_WEIGHT;
  }
  return total;
}

function estimateLayeredAmplitude(featureFrame) {
  const backboneAmplitude = estimateAverageModeAmplitude(
    featureFrame?.backboneSlots,
  );
  const detailAmplitude = estimateAverageModeAmplitude(
    featureFrame?.detailSlots,
  );
  return backboneAmplitude + detailAmplitude * 0.35;
}

function maxSlotAmplitude(slots) {
  if (!slots?.length) return 0;
  let max = 0;
  for (let i = 0; i < slots.length; i += 4) {
    const amp = slots[i + 3] ?? 0;
    if (amp > max) max = amp;
  }
  return max;
}

function summarizeRenderedLayer(modeSlots, colorSlots, count) {
  const slotCount = Math.max(0, Math.floor(count ?? 0));
  let amplitudeTotal = 0;
  let colorWeightMax = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const offset = index * 4;
    amplitudeTotal += modeSlots?.[offset + 3] ?? 0;
    colorWeightMax = Math.max(colorWeightMax, colorSlots?.[offset + 3] ?? 0);
  }
  return {
    count: slotCount,
    amplitudeTotal,
    colorWeightMax,
  };
}

function summarizeRenderedRetention(performanceGovernor) {
  if (!performanceGovernor) {
    return {
      droppedModeCount: 0,
      retainedEnergyRatio: 1,
    };
  }

  const originalModeCount = performanceGovernor.originalModeCount ?? 0;
  const uploadedModeCount = performanceGovernor.uploadedModeCount ?? 0;
  const totalAmplitude =
    (performanceGovernor.backbone?.totalAmplitude ?? 0) +
    (performanceGovernor.detail?.totalAmplitude ?? 0);
  const uploadedAmplitude =
    (performanceGovernor.backbone?.uploadedAmplitude ?? 0) +
    (performanceGovernor.detail?.uploadedAmplitude ?? 0);

  return {
    droppedModeCount: Math.max(0, originalModeCount - uploadedModeCount),
    retainedEnergyRatio:
      totalAmplitude > 0 ? clamp01(uploadedAmplitude / totalAmplitude) : 1,
  };
}

function deriveLightAsymmetry(primaryIntensity, secondaryIntensity) {
  const strongest = Math.max(primaryIntensity, secondaryIntensity, 1e-4);
  return Math.abs(primaryIntensity - secondaryIntensity) / strongest;
}

function getRuntimeBoundaryMode(runtimeState) {
  return getBoundaryModeFromValue(
    runtimeState.uniforms.uBoundaryMode?.value ?? 1,
  );
}

function getRuntimeEffectiveCavityGeometry(runtimeState) {
  return normalizeCavityGeometry(
    runtimeState?.effectiveCavityGeometry ??
      runtimeState?.volumeMesh?.userData?.raymarchCavityGeometry ??
      DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  );
}

function getRaymarchFieldCacheOverride() {
  return resolveRaymarchFieldCacheOverride(
    typeof window === "undefined"
      ? undefined
      : /** @type {any} */ (window).__baryonFieldCacheOverride,
  );
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

function publishRaymarchRuntimeAuditSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
) {
  if (runtimeState.auditEnabled) {
    const raymarchDebug = buildRaymarchDebugSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
    );
    runtimeState.debugSnapshot = featureFrame?.debug
      ? { ...featureFrame.debug, raymarchDebug, ...raymarchDebug }
      : raymarchDebug;
    publishAuditSnapshot(runtimeState.debugSnapshot);
  } else {
    runtimeState.debugSnapshot = null;
    publishAuditSnapshot(null);
  }
}

function buildRaymarchDebugSnapshot(runtimeState, featureFrame, fieldState) {
  const avgAmplitude = estimateLayeredAmplitude(featureFrame);
  const maxBackboneAmplitude = maxSlotAmplitude(featureFrame?.backboneSlots);
  const maxDetailAmplitude = maxSlotAmplitude(featureFrame?.detailSlots);
  const activeModeCount = runtimeState.uniforms.uActiveModeCount.value;
  const fieldExcitation = deriveFieldExcitation(featureFrame);
  const performanceGovernor = runtimeState.performanceGovernor ?? null;
  const densityGain = runtimeState.uniforms.uDensityGain.value;
  const absorption = runtimeState.uniforms.uAbsorption.value;
  const opacityGain = runtimeState.uniforms.uOpacityGain?.value ?? 1;
  const stepBudget = Math.round(runtimeState.volumeMesh.material.steps);
  const rimBloomBias = runtimeState.uniforms.uRimBloomBias?.value ?? 0;
  const rimCompression = runtimeState.uniforms.uRimCompression?.value ?? 0;
  const holographicIntensity =
    runtimeState.uniforms.uHolographicIntensity?.value ?? 0;
  const holographicShift = runtimeState.uniforms.uHolographicShift?.value ?? 0;
  const holographicFresnelPower =
    runtimeState.uniforms.uHolographicFresnelPower?.value ?? 0;
  const bloomResponseBias = runtimeState.bloomTuning?.bloomResponseBias ?? 0;
  const stepReference = runtimeState.bloomTuning?.stepReference ?? stepBudget;
  const stepCompensation = runtimeState.bloomTuning?.stepCompensation ?? 1;
  const lowStepBloomGuard = runtimeState.bloomTuning?.lowStepBloomGuard ?? 0;
  const effectiveBloomStrength =
    runtimeState.bloomTuning?.effectiveStrength ?? 0;
  const effectiveBloomRadius = runtimeState.bloomTuning?.effectiveRadius ?? 0;
  const effectiveBloomThreshold =
    runtimeState.bloomTuning?.effectiveThreshold ?? 0;
  const transientEnergy = featureFrame?.transientEnergy ?? 0;
  const spectralFlux = featureFrame?.spectralFlux ?? 0;
  const structureSignal = featureFrame?.structureSignal ?? 0;
  const energySignal = featureFrame?.energySignal ?? 0;
  const changeSignal = featureFrame?.changeSignal ?? 0;
  const changeBreakdown =
    featureFrame?.debug?.changeBreakdown ??
    featureFrame?.changeBreakdown ??
    null;
  const pulseSignal = featureFrame?.pulseSignal ?? 0;
  const modalVisibilityEnergy = featureFrame?.modalVisibilityEnergy ?? 0;
  const modalObserverVisibilityEnergy =
    featureFrame?.modalObserverVisibilityEnergy ?? 0;
  const modalVisibilityRetainedHighQEnergy =
    featureFrame?.modalVisibilityRetainedHighQEnergy ?? 0;
  const modalPhaseAuthority = featureFrame?.modalPhaseAuthority ?? 0;
  const modalVisibilityDensityDebug = deriveVisibleDensity({
    density: 0,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    modalStructureAnchor: 1,
    ridgeAnchor: 1,
  });
  const retainedHighQVisibilityDebug = deriveRetainedHighQVisibilityDiagnostics(
    {
      modalVisibilityEnergy,
      modalObserverVisibilityEnergy,
      modalVisibilityRetainedHighQEnergy,
    },
  );
  const avgDensity = Math.min(
    1,
    avgAmplitude * densityGain * absorption * (0.75 + transientEnergy * 0.2),
  );
  const avgOpacity = Math.min(
    1,
    avgDensity * opacityGain * (stepBudget / 48) * (0.8 + spectralFlux * 0.12),
  );
  const earlyExitRatio = Math.min(1, avgOpacity * 0.72);
  const bloomRisk = Math.min(
    1,
    avgDensity *
      (1 + rimBloomBias * 0.22) *
      (1 - rimCompression * 0.12) *
      (0.7 + effectiveBloomStrength * 1.6) *
      (1.1 - effectiveBloomThreshold * 0.4) *
      (1 - bloomResponseBias * 0.18),
  );
  const {
    avgRaySegmentLength = 0,
    missRatio = 0,
    avgSilhouetteSuppression = 0,
  } = runtimeState.stabilityStats ?? {};
  const primaryLightIntensity =
    runtimeState.sceneLighting?.primary?.intensity ?? 0;
  const secondaryLightIntensity =
    runtimeState.sceneLighting?.secondary?.intensity ?? 0;
  const { holographicFresnel } = deriveHolographicFresnel({
    normalViewDot: 0.35,
    holographicIntensity,
    holographicFresnelPower,
  });
  const { colorMix: holographicColorMix, emissiveLift } =
    deriveHolographicColorMix({
      baseColor: [0.34, 0.62, 0.9],
      surfaceColor: [0.66, 0.86, 1.0],
      holographicShift,
      holographicFresnel,
    });
  const holographicReferenceStrength =
    holographicFresnel * (0.7 + holographicColorMix * 0.3) + emissiveLift * 0.2;
  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const requestedCavityGeometry = normalizeCavityGeometry(
    runtimeState?.requestedCavityGeometry,
  );
  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const fieldCache = runtimeState.fieldCache ?? null;
  const spectralLightCache = runtimeState.spectralLightCache ?? null;
  const phaseOverlayCache = runtimeState.phaseOverlayCache ?? null;
  const fieldCacheOverride = getRaymarchFieldCacheOverride();
  const renderedBackbone = summarizeRenderedLayer(
    runtimeState.backboneModeBuffer?.value?.array,
    runtimeState.backboneColorBuffer?.value?.array,
    runtimeState.uniforms.uBackboneModeCount.value,
  );
  const renderedDetail = summarizeRenderedLayer(
    runtimeState.detailModeBuffer?.value?.array,
    runtimeState.detailColorBuffer?.value?.array,
    runtimeState.uniforms.uDetailModeCount.value,
  );
  const renderedRetention = summarizeRenderedRetention(performanceGovernor);
  const phaseOverlayModeCount =
    phaseOverlayCache?.activePhaseModeCount ??
    runtimeState.phaseOverlayModeCount ??
    0;
  const phaseOverlaySemantic =
    phaseOverlayCache?.semantic ?? "signed-displacement";

  return {
    fieldState,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      performanceGovernor?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      performanceGovernor?.uploadedModeCount ?? activeModeCount,
    backboneModeCount: runtimeState.uniforms.uBackboneModeCount.value,
    detailModeCount: runtimeState.uniforms.uDetailModeCount.value,
    originalBackboneModeCount:
      performanceGovernor?.backbone?.originalActiveCount ??
      runtimeState.uniforms.uBackboneModeCount.value,
    originalDetailModeCount:
      performanceGovernor?.detail?.originalActiveCount ??
      runtimeState.uniforms.uDetailModeCount.value,
    uploadedBackboneModeCount:
      performanceGovernor?.backbone?.uploadedActiveCount ??
      runtimeState.uniforms.uBackboneModeCount.value,
    uploadedDetailModeCount:
      performanceGovernor?.detail?.uploadedActiveCount ??
      runtimeState.uniforms.uDetailModeCount.value,
    renderedBackboneModeCount: renderedBackbone.count,
    renderedDetailModeCount: renderedDetail.count,
    renderedBackboneColorWeightMax: renderedBackbone.colorWeightMax,
    renderedDetailColorWeightMax: renderedDetail.colorWeightMax,
    renderedBackboneAmplitudeTotal: renderedBackbone.amplitudeTotal,
    renderedDetailAmplitudeTotal: renderedDetail.amplitudeTotal,
    renderedDroppedModeCount: renderedRetention.droppedModeCount,
    renderedRetainedEnergyRatio: renderedRetention.retainedEnergyRatio,
    dominantFrequency:
      featureFrame?.debug?.dominantFrequency ??
      featureFrame?.debug?.fundamentalFrequency ??
      0,
    fieldExcitation,
    complexityScore: performanceGovernor?.complexityScore ?? 0,
    complexityExcitation: performanceGovernor?.excitation ?? fieldExcitation,
    complexityWeightedPermutationLoad:
      performanceGovernor?.weightedPermutationLoad ?? 0,
    complexityCountLoad: performanceGovernor?.countLoad ?? 0,
    proactiveStepBudget: performanceGovernor?.proactiveStepBudget ?? stepBudget,
    proactiveRenderScale: performanceGovernor?.proactiveRenderScale ?? 1,
    bloomStrengthGuard: performanceGovernor?.bloomStrengthScale ?? 1,
    bloomThresholdGuard: performanceGovernor?.bloomThresholdOffset ?? 0,
    bloomGuardAllowed: performanceGovernor?.bloomAllowed ?? true,
    maxBackboneAmplitude,
    maxDetailAmplitude,
    detailBackboneRatio:
      maxDetailAmplitude / Math.max(maxBackboneAmplitude, 1e-4),
    avgOpacity,
    avgDensity,
    opacityGain,
    earlyExitEnabled: true,
    earlyExitThreshold: EARLY_EXIT_TRANSMITTANCE_EPSILON,
    earlyExitRatio,
    stepBudget,
    transientEnergy,
    spectralCentroid: featureFrame?.spectralCentroid ?? 0,
    spectralFlux,
    beatDetected: featureFrame?.beatDetected ?? false,
    beatPulseId: featureFrame?.beatPulseId ?? 0,
    beatStrength: featureFrame?.beatStrength ?? 0,
    beatConfidence: featureFrame?.beatConfidence ?? 0,
    structureSignal,
    energySignal,
    changeSignal,
    changeBreakdown: changeBreakdown ? { ...changeBreakdown } : null,
    pulseSignal,
    modalVisibilityEnergy,
    modalObserverVisibilityEnergy,
    modalVisibilityRetainedHighQEnergy,
    modalPhaseAuthority,
    projectionEnergyBudgetBackbone:
      featureFrame?.debug?.projectionEnergyBudgetBackbone ?? 0,
    projectionEnergyBudgetDetail:
      featureFrame?.debug?.projectionEnergyBudgetDetail ?? 0,
    projectionEnergyUsedBackbone:
      featureFrame?.debug?.projectionEnergyUsedBackbone ?? 0,
    projectionEnergyUsedDetail:
      featureFrame?.debug?.projectionEnergyUsedDetail ?? 0,
    projectionCompetitionReduction:
      featureFrame?.debug?.projectionCompetitionReduction ?? 0,
    projectionDenseSpectrumPressure:
      featureFrame?.debug?.projectionDenseSpectrumPressure ?? 0,
    projectionHighQProtection:
      featureFrame?.debug?.projectionHighQProtection ?? 0,
    projectionConservationApplied:
      featureFrame?.debug?.projectionConservationApplied === true,
    highQPhaseAuthority: featureFrame?.debug?.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: featureFrame?.debug?.lowQPhaseAuthority ?? 0,
    modalPhaseOverlayModeCount:
      featureFrame?.debug?.modalPhaseOverlayModeCount ?? 0,
    modalVisibilityDensityLiftMax: modalVisibilityDensityDebug.modalLift,
    modalVisibilityVisibleDensityMax:
      modalVisibilityDensityDebug.modalVisibleDensity,
    ...retainedHighQVisibilityDebug,
    modeCoherence: featureFrame?.modeCoherence ?? 0,
    trebleTonalEnergy: featureFrame?.trebleTonalEnergy ?? 0,
    trebleBroadbandEnergy: featureFrame?.trebleBroadbandEnergy ?? 0,
    totalSlotAmplitude: sumLayeredAmplitude(featureFrame),
    spectralBandEnergies: featureFrame?.spectralBandEnergies
      ? Array.from(featureFrame.spectralBandEnergies)
      : null,
    responseEnvelope: runtimeState.responseEnvelope ?? 0,
    motionSignal: runtimeState.motionSignal ?? 0,
    scaleSignal: runtimeState.scaleSignal ?? 0,
    bloomResponseSignal: runtimeState.bloomResponseSignal ?? 0,
    visualScale: runtimeState.visualRoot?.scale?.x ?? 1,
    stepReference,
    stepCompensation,
    lowStepBloomGuard,
    rimBloomBias,
    rimCompression,
    holographicIntensity,
    holographicShift,
    holographicFresnelPower,
    bloomResponseBias,
    effectiveBloomStrength,
    effectiveBloomRadius,
    effectiveBloomThreshold,
    bloomRisk,
    effectiveThreshold: runtimeState.uniforms.uThreshold?.value ?? 0,
    effectiveContourSharpness:
      runtimeState.uniforms.uContourSharpness?.value ?? 0,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    boundaryMaterialMode:
      runtimeState.volumeMesh?.userData?.raymarchBoundaryMode ?? boundaryMode,
    materialCavityGeometry:
      runtimeState.volumeMesh?.userData?.raymarchCavityGeometry ??
      effectiveCavityGeometry,
    fieldEvaluationMode:
      runtimeState.volumeMesh?.userData?.raymarchFieldEvaluationMode ??
      fieldCache?.mode ??
      "direct",
    spectralLightEvaluationMode:
      runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ??
      spectralLightCache?.mode ??
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    fieldCacheActive: fieldCache?.active ?? false,
    fieldCacheResolution:
      fieldCache?.resolution ?? RAYMARCH_FIELD_CACHE_RESOLUTION,
    fieldCacheRebuildCount: fieldCache?.rebuildCount ?? 0,
    fieldCacheRebuildReason: fieldCache?.lastRebuildReason ?? "uninitialized",
    fieldCacheHysteresisState:
      (fieldCache?.active ?? false) ? "cached" : "direct",
    fieldCacheOverride,
    fieldCacheBackend: fieldCache?.backend ?? "compute",
    fieldCacheReady: fieldCache?.ready ?? false,
    fieldCacheRebuildPending: fieldCache?.rebuildPending ?? false,
    fieldCacheLastError: fieldCache?.lastError ?? null,
    spectralLightCacheActive: spectralLightCache?.active ?? false,
    spectralLightCacheReady: spectralLightCache?.ready ?? false,
    spectralLightCacheRebuildPending:
      spectralLightCache?.rebuildPending ?? false,
    spectralLightCacheRebuildCount: spectralLightCache?.rebuildCount ?? 0,
    spectralLightCacheLastError: spectralLightCache?.lastError ?? null,
    phaseOverlayActive: phaseOverlayCache?.active ?? false,
    phaseOverlayReady: phaseOverlayCache?.ready ?? false,
    phaseOverlayPending: phaseOverlayCache?.rebuildPending ?? false,
    phaseOverlayBackend: phaseOverlayCache?.backend ?? "compute",
    phaseOverlayResolution:
      phaseOverlayCache?.resolution ?? RAYMARCH_PHASE_OVERLAY_RESOLUTION,
    phaseOverlayRebuildCount: phaseOverlayCache?.rebuildCount ?? 0,
    phaseOverlayLastError: phaseOverlayCache?.lastError ?? null,
    phaseOverlayModeCount,
    phaseOverlaySemantic,
    signedPhaseOverlayActive: phaseOverlayCache?.active ?? false,
    signedPhaseOverlayModeCount: phaseOverlayModeCount,
    signedPhaseOverlaySemantic: phaseOverlaySemantic,
    phaseOverlayStrength:
      runtimeState.uniforms.uModalPhaseOverlayStrength?.value ?? 0,
    spectralMix: runtimeState.uniforms.uSpectralMix?.value ?? 0,
    holographicReferenceStrength,
    avgRaySegmentLength,
    missRatio,
    avgSilhouetteSuppression,
    primaryLightIntensity,
    secondaryLightIntensity,
    sceneLightAsymmetry: deriveLightAsymmetry(
      primaryLightIntensity,
      secondaryLightIntensity,
    ),
    volumeVisible: runtimeState.volumeMesh.visible,
    idleOverlayVisible: runtimeState.idleOverlay.visible,
    idleLogoSuppressedForLive: runtimeState.idleLogoSuppressedForLive === true,
  };
}

function updateReactiveResponse(
  runtimeState,
  featureFrame,
  fieldState,
  fieldDriven,
  deltaTime,
) {
  const rt = runtimeState.reactivityTuning;
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const modalVisibilityEnergy = clamp01(
    featureFrame?.modalVisibilityEnergy ?? 0,
  );
  const reactivity = Math.max(
    0,
    rt?.reactivity ?? REACTIVITY_DEFAULTS.reactivity,
  );
  const rhythmicDensity = clamp01(featureFrame?.rhythmicDensity ?? 0);
  const gatedStructureSignal = clamp01(structureSignal * reactivity);
  const gatedEnergySignal = clamp01(energySignal * reactivity);
  const gatedChangeSignal = clamp01(changeSignal * reactivity);
  const gatedPulseSignal = clamp01(pulseSignal * reactivity);
  const gatedModalVisibilityEnergy = clamp01(
    modalVisibilityEnergy * reactivity,
  );
  const decayReleaseMask = deriveDecayReleaseMask({
    fieldState,
    gatedStructureSignal,
    gatedEnergySignal,
    gatedChangeSignal,
  });
  const envelopeTarget = fieldDriven
    ? clamp01(
        gatedStructureSignal *
          0.34 *
          (1 - decayReleaseMask * DECAY_RELEASE_TARGET_REDUCTION) +
          gatedEnergySignal * 0.38 +
          gatedChangeSignal * 0.23 +
          gatedModalVisibilityEnergy * 0.48,
      )
    : 0;
  const responseEnvelope = damp(
    runtimeState.responseEnvelope ?? 0,
    envelopeTarget,
    envelopeTarget > (runtimeState.responseEnvelope ?? 0)
      ? RESPONSE_ATTACK
      : fieldDriven
        ? RESPONSE_RELEASE *
          (1 +
            rhythmicDensity * RHYTHMIC_RELEASE_RATE_GAIN +
            decayReleaseMask * DECAY_RELEASE_RATE_GAIN)
        : RESPONSE_IDLE_RELEASE,
    deltaTime,
  );
  const accentTarget = fieldDriven
    ? clamp01(gatedChangeSignal * 0.74 + gatedPulseSignal * 0.42)
    : 0;
  const accentEnvelope = damp(
    runtimeState.accentEnvelope ?? 0,
    accentTarget,
    accentTarget > (runtimeState.accentEnvelope ?? 0)
      ? ACCENT_ATTACK
      : ACCENT_RELEASE,
    deltaTime,
  );
  const scaleSignal = clamp01(
    responseEnvelope * 0.56 +
      gatedEnergySignal * 0.24 +
      accentEnvelope * 0.14 +
      gatedStructureSignal * 0.06 +
      gatedModalVisibilityEnergy * 0.08,
  );
  const contourSharpness = runtimeState.uniforms.uContourSharpness?.value ?? 1;
  const contourSignal = clamp01((contourSharpness - 1) / 7);
  const bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      gatedStructureSignal * 0.2 +
      gatedModalVisibilityEnergy * 0.08 +
      contourSignal * 0.14 * reactivity,
  );

  runtimeState.responseEnvelope = responseEnvelope;
  runtimeState.accentEnvelope = accentEnvelope;
  runtimeState.motionSignal = clamp01(
    gatedChangeSignal * 0.62 + accentEnvelope * 0.22 + gatedEnergySignal * 0.16,
  );
  runtimeState.scaleSignal = scaleSignal;
  runtimeState.bloomResponseSignal = bloomResponseSignal;
  runtimeState.visualRoot?.scale?.setScalar?.(1);
}

function updateLaserResponse(runtimeState, featureFrame) {
  const uniforms = runtimeState.uniforms;
  const baseThreshold =
    runtimeState.baseThreshold ?? uniforms.uThreshold?.value ?? 0.001;
  const baseContourSharpness =
    runtimeState.baseContourSharpness ?? uniforms.uContourSharpness?.value ?? 1;
  const baseBloomStrength =
    runtimeState.bloomTuning?.baseStrength ??
    runtimeState.bloomTuning?.effectiveStrength ??
    0;
  const baseBloomRadius =
    runtimeState.bloomTuning?.baseRadius ??
    runtimeState.bloomTuning?.effectiveRadius ??
    0;
  const baseBloomThreshold =
    runtimeState.bloomTuning?.baseThreshold ??
    runtimeState.bloomTuning?.effectiveThreshold ??
    0;
  const reactiveGate = clamp01(runtimeState.reactivityTuning?.reactivity ?? 1);
  const transientEnergy =
    clamp01(featureFrame?.transientEnergy ?? 0) * reactiveGate;
  const spectralFlux = clamp01(featureFrame?.spectralFlux ?? 0) * reactiveGate;
  const rawChangeSignal =
    clamp01(featureFrame?.changeSignal ?? 0) * reactiveGate;
  const rawPulseSignal = clamp01(featureFrame?.pulseSignal ?? 0) * reactiveGate;
  const responseEnvelope = clamp01(runtimeState.responseEnvelope ?? 0);
  const accentEnvelope = clamp01(runtimeState.accentEnvelope ?? 0);
  const bloomResponseSignal = clamp01(runtimeState.bloomResponseSignal ?? 0);
  const thresholdResponse = clamp01(
    responseEnvelope * 0.24 +
      accentEnvelope * 0.58 +
      bloomResponseSignal * 0.22 +
      transientEnergy * 0.18,
  );
  const contourResponse = clamp01(
    responseEnvelope * 0.2 +
      accentEnvelope * 0.66 +
      bloomResponseSignal * 0.28 +
      transientEnergy * 0.34 +
      spectralFlux * 0.22,
  );
  const bloomStrengthPulse = clamp01(
    accentEnvelope * 0.84 + transientEnergy * 0.4,
  );
  const bloomThresholdPulse = clamp01(
    accentEnvelope * 0.2 +
      rawChangeSignal * 0.34 +
      rawPulseSignal * 0.24 +
      transientEnergy * 0.18 +
      bloomResponseSignal * 0.04,
  );
  const bloomStrengthTransientGate = 0.94 + transientEnergy * 0.06;

  uniforms.uThreshold.value = Math.max(
    0.001,
    baseThreshold * (1 - thresholdResponse * THRESHOLD_RESPONSE_REDUCTION),
  );
  uniforms.uContourSharpness.value = clamp(
    baseContourSharpness + contourResponse * CONTOUR_RESPONSE_GAIN,
    1,
    8,
  );
  const bt = runtimeState.bloomTuning;
  const performanceGovernor = runtimeState.performanceGovernor ?? null;
  const bloomStrengthScale = performanceGovernor?.bloomStrengthScale ?? 1;
  const bloomThresholdOffset = performanceGovernor?.bloomThresholdOffset ?? 0;
  const bloomAllowed = performanceGovernor?.bloomAllowed ?? true;
  bt.effectiveStrength =
    baseBloomStrength *
    (1 + bloomStrengthPulse * BLOOM_STRENGTH_RESPONSE_GAIN) *
    bloomStrengthScale *
    bloomStrengthTransientGate;
  bt.effectiveRadius = Math.max(
    0,
    baseBloomRadius * (1 - bloomStrengthPulse * BLOOM_RADIUS_RESPONSE_GAIN),
  );
  bt.effectiveThreshold = clamp(
    baseBloomThreshold +
      bloomThresholdPulse * BLOOM_THRESHOLD_RESPONSE_GAIN +
      bloomThresholdOffset,
    0,
    1,
  );
  bt.bloomAllowed = bloomAllowed;
}

function copyLayerUpload({
  slots,
  colorSlots,
  targetSlots,
  targetColorSlots,
  layer,
  includeColors,
}) {
  copyBudgetedModeLayer({
    sourceSlots: slots,
    sourceColorSlots: colorSlots,
    targetSlots,
    targetColorSlots,
    selectedIndices: layer.selectedIndices,
    capacity: layer.capacity,
    includeColors,
  });
}

function copyLayerPhaseUpload({
  phaseSlots,
  targetPhaseSlots,
  layer,
  capacity,
}) {
  if (!targetPhaseSlots || !layer) {
    return 0;
  }
  copyBudgetedModeLayer({
    sourceSlots: phaseSlots,
    sourceColorSlots: null,
    targetSlots: targetPhaseSlots,
    targetColorSlots: null,
    selectedIndices: layer.selectedIndices,
    capacity,
    includeColors: false,
  });
  let activePhaseCount = 0;
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  for (let slotIndex = 0; slotIndex < resolvedCapacity; slotIndex += 1) {
    const offset = slotIndex * 4;
    const authority =
      (targetPhaseSlots[offset + 2] ?? 0) * (targetPhaseSlots[offset + 3] ?? 0);
    if (authority > 1e-4) {
      activePhaseCount += 1;
    }
  }
  return activePhaseCount;
}

function resolveFieldEvaluationMode(
  runtimeState,
  renderer,
  { backboneCapacity, detailCapacity },
  { requestedMode, cachedRequested, fieldDescriptor },
) {
  const fieldCache = runtimeState.fieldCache;
  if (!fieldCache || !runtimeState.volumeMesh) {
    return "direct";
  }

  fieldCache.active = cachedRequested;
  fieldCache.mode = requestedMode;
  if (!cachedRequested) {
    if (fieldCache.lastRebuildReason === "uninitialized") {
      fieldCache.lastRebuildReason = "inactive";
    }
    return "direct";
  }

  const { needsRebuild, reason } = shouldRebuildRaymarchFieldCache(
    fieldCache,
    fieldDescriptor,
  );

  if (needsRebuild) {
    enqueueRaymarchFieldCacheRebuild(
      fieldCache,
      renderer,
      fieldDescriptor,
      reason,
      {
        backboneModeBuffer: runtimeState.backboneModeBuffer,
        detailModeBuffer: runtimeState.detailModeBuffer,
        backboneCapacity,
        detailCapacity,
        uniforms: runtimeState.uniforms,
      },
    );
  }

  let fieldEvaluationMode = "direct";
  if (
    fieldCache.backend !== "unavailable" &&
    isRaymarchFieldCacheReadyForDescriptor(fieldCache, fieldDescriptor)
  ) {
    fieldEvaluationMode = "cached";
  } else if (cachedRequested && fieldCache.ready) {
    fieldEvaluationMode = "cached";
  }

  return fieldEvaluationMode;
}

function resolveSpectralLightEvaluationMode(
  runtimeState,
  renderer,
  { backboneCapacity, detailCapacity },
  {
    spectralLightEnabled,
    fieldEvaluationMode,
    spectralLightDescriptor,
    cachedRequested,
  },
) {
  const spectralLightCache = runtimeState.spectralLightCache;
  if (!spectralLightCache) {
    return spectralLightEnabled
      ? RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct
      : RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  }

  const spectralLightCachedRequested =
    cachedRequested && spectralLightCache.backend !== "unavailable";
  spectralLightCache.active =
    spectralLightCachedRequested && spectralLightEnabled;

  if (!spectralLightEnabled) {
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  }

  if (!spectralLightCachedRequested) {
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
  }

  spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;

  const spectralLightUploadReady =
    Boolean(spectralLightDescriptor) &&
    runtimeState.spectralLightBuffersUploaded === true;
  if (spectralLightUploadReady) {
    const spectralLightRebuild = shouldRebuildRaymarchSpectralLightCache(
      spectralLightCache,
      spectralLightDescriptor,
    );
    if (spectralLightRebuild.needsRebuild) {
      enqueueRaymarchSpectralLightCacheRebuild(
        spectralLightCache,
        renderer,
        spectralLightDescriptor,
        spectralLightRebuild.reason,
        {
          backboneModeBuffer: runtimeState.backboneModeBuffer,
          detailModeBuffer: runtimeState.detailModeBuffer,
          backboneColorBuffer: runtimeState.backboneColorBuffer,
          detailColorBuffer: runtimeState.detailColorBuffer,
          backboneCapacity,
          detailCapacity,
          uniforms: runtimeState.uniforms,
        },
      );
    }
  }

  if (fieldEvaluationMode !== "cached") {
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
  }

  if (
    spectralLightCache.backend !== "unavailable" &&
    spectralLightDescriptor &&
    isRaymarchSpectralLightCacheReadyForDescriptor(
      spectralLightCache,
      spectralLightDescriptor,
    )
  ) {
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
  }

  if (spectralLightCache.ready) {
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
  }

  return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
}

function updatePhaseOverlayCache(
  runtimeState,
  renderer,
  { backbonePhaseCapacity, detailPhaseCapacity },
  { fieldDescriptor, fieldEvaluationMode, featureFrame, timeMs },
) {
  const phaseOverlayCache = runtimeState.phaseOverlayCache;
  const phaseStrengthUniform =
    runtimeState.uniforms.uModalPhaseOverlayStrength ?? null;
  const phaseAuthority = clamp01(featureFrame?.modalPhaseAuthority ?? 0);
  const phaseModeCount = runtimeState.phaseOverlayModeCount ?? 0;
  const cachedFieldActive = fieldEvaluationMode === "cached";

  if (!phaseOverlayCache || !runtimeState.volumeMesh) {
    setIfChanged(phaseStrengthUniform, 0);
    return;
  }

  phaseOverlayCache.active = cachedFieldActive && phaseAuthority > 0;
  phaseOverlayCache.activePhaseModeCount = phaseModeCount;

  if (
    !cachedFieldActive ||
    !(phaseAuthority > 0) ||
    phaseModeCount <= 0 ||
    phaseOverlayCache.backend === "unavailable"
  ) {
    setIfChanged(phaseStrengthUniform, 0);
    return;
  }

  const elapsedMs = timeMs - (phaseOverlayCache.lastUpdateTimeMs ?? -Infinity);
  const cadenceElapsed =
    elapsedMs >= (phaseOverlayCache.updateIntervalMs ?? 1000 / 15);

  if (!phaseOverlayCache.rebuildPending && cadenceElapsed) {
    const result = enqueueRaymarchPhaseOverlayRebuild(
      phaseOverlayCache,
      renderer,
      {
        ...fieldDescriptor,
        phaseModeCount,
        phaseAuthority: Math.round(phaseAuthority * 1000) / 1000,
      },
      phaseOverlayCache.ready ? "phase-update" : "initial",
      {
        backboneModeBuffer: runtimeState.backboneModeBuffer,
        detailModeBuffer: runtimeState.detailModeBuffer,
        backbonePhaseBuffer: runtimeState.backbonePhaseBuffer,
        detailPhaseBuffer: runtimeState.detailPhaseBuffer,
        backboneCapacity: backbonePhaseCapacity,
        detailCapacity: detailPhaseCapacity,
        uniforms: runtimeState.uniforms,
      },
    );
    if (result.enqueued) {
      phaseOverlayCache.lastUpdateTimeMs = timeMs;
      runtimeState.phaseOverlayUploadCount =
        (runtimeState.phaseOverlayUploadCount ?? 0) + 1;
    }
  }

  const phaseOverlayReady =
    phaseOverlayCache.backend !== "unavailable" && phaseOverlayCache.ready;
  setIfChanged(phaseStrengthUniform, phaseOverlayReady ? phaseAuthority : 0);
}

function updateRaymarchEvaluationModes(
  runtimeState,
  renderer,
  capacities,
  { spectralLightEnabled, fieldDescriptor, spectralLightDescriptor },
) {
  if (!runtimeState.fieldCache || !runtimeState.volumeMesh) {
    return;
  }

  const requestedMode = getRaymarchFieldCacheOverride();
  const cachedRequested =
    requestedMode === "cached" &&
    runtimeState.fieldCache.backend !== "unavailable";
  const fieldEvaluationMode = resolveFieldEvaluationMode(
    runtimeState,
    renderer,
    capacities,
    {
      requestedMode,
      cachedRequested,
      fieldDescriptor,
    },
  );
  setRaymarchFieldEvaluationMode(runtimeState.volumeMesh, fieldEvaluationMode);

  const spectralLightEvaluationMode = resolveSpectralLightEvaluationMode(
    runtimeState,
    renderer,
    capacities,
    {
      spectralLightEnabled,
      fieldEvaluationMode,
      spectralLightDescriptor,
      cachedRequested,
    },
  );
  setRaymarchSpectralLightEvaluationMode(
    runtimeState.volumeMesh,
    spectralLightEvaluationMode,
  );
}

export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
) {
  const {
    backboneModeBuffer,
    detailModeBuffer,
    backboneColorBuffer,
    detailColorBuffer,
    uniforms,
    volumeMesh,
    idleOverlay,
  } = runtimeState;
  const backboneCapacity = inferLayerCapacity(
    runtimeState.backboneCapacity,
    backboneModeBuffer.value.array,
  );
  const detailCapacity = inferLayerCapacity(
    runtimeState.detailCapacity,
    detailModeBuffer.value.array,
  );
  const backbonePhaseCapacity = inferLayerCapacity(
    runtimeState.backbonePhaseCapacity ?? RAYMARCH_PHASE_OVERLAY_BACKBONE_LIMIT,
    runtimeState.backbonePhaseBuffer?.value?.array,
  );
  const detailPhaseCapacity = inferLayerCapacity(
    runtimeState.detailPhaseCapacity ?? RAYMARCH_PHASE_OVERLAY_DETAIL_LIMIT,
    runtimeState.detailPhaseBuffer?.value?.array,
  );

  uniforms.uTime.value = time;
  const fieldState = featureFrame?.fieldState ?? "idle";
  const fieldDriven = isFieldDrivenState(fieldState);
  updateReactiveResponse(
    runtimeState,
    featureFrame,
    fieldState,
    fieldDriven,
    deltaTime,
  );
  setIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  if (!fieldDriven) {
    runtimeState.performanceGovernor = null;
    runtimeState.spectralLightBuffersUploaded = false;
    runtimeState.phaseOverlayModeCount = 0;
    if (runtimeState.phaseOverlayCache) {
      runtimeState.phaseOverlayCache.active = false;
      runtimeState.phaseOverlayCache.activePhaseModeCount = 0;
    }
    setIfChanged(uniforms.uBackboneModeCount, 0);
    setIfChanged(uniforms.uDetailModeCount, 0);
    setIfChanged(uniforms.uActiveModeCount, 0);
    setIfChanged(uniforms.uAverageAmplitude, 0);
    setIfChanged(uniforms.uTransientEnergy, 0);
    setIfChanged(uniforms.uSpectralCentroid, 0);
    setIfChanged(uniforms.uSpectralFlux, 0);
    setIfChanged(uniforms.uStructureSignal, 0);
    setIfChanged(uniforms.uEnergySignal, 0);
    setIfChanged(uniforms.uChangeSignal, 0);
    setIfChanged(uniforms.uPulseSignal, 0);
    setIfChanged(uniforms.uBassSalience, 0);
    setIfChanged(uniforms.uTimbreSpread, 0);
    setIfChanged(uniforms.uSpectralNovelty, 0);
    setIfChanged(uniforms.uBeatPulse, 0);
    setIfChanged(uniforms.uBeatPhase, 0);
    setIfChanged(uniforms.uTempoNorm, 0);
    setIfChanged(uniforms.uRhythmicDensity, 0);
    setIfChanged(uniforms.uTrebleBroadbandEnergy, 0);
    setIfChanged(uniforms.uModeCoherence, 0);
    setIfChanged(uniforms.uTotalSlotAmplitude, 0);
    setIfChanged(uniforms.uModalVisibilityEnergy, 0);
    setIfChanged(uniforms.uModalPhaseOverlayStrength, 0);
    setIfChanged(uniforms.uKeyTintStrength, 0);
    setIfChanged(uniforms.uKeyMode, 0);
    uniforms.uBandEnergies.value.set(0, 0, 0, 0);
    uniforms.uDensityGain.value =
      runtimeState.baseDensityGain ?? uniforms.uDensityGain.value;
    uniforms.uDensityAbsorption.value =
      uniforms.uDensityGain.value * uniforms.uAbsorption.value;
    volumeMesh.visible = false;
    idleOverlay.visible = resolveIdleOverlayVisible(
      runtimeState,
      featureFrame,
      fieldDriven,
    );
    publishRaymarchRuntimeAuditSnapshot(runtimeState, featureFrame, fieldState);
    return;
  }

  const spectralLightEnabled = (uniforms.uSpectralMix?.value ?? 0) > 0;
  const performanceGovernor = buildRaymarchPerformanceGovernor({
    backboneSlots: featureFrame?.backboneSlots,
    detailSlots: featureFrame?.detailSlots,
    backboneColorSlots: featureFrame?.backboneColorSlots,
    detailColorSlots: featureFrame?.detailColorSlots,
    backboneCapacity,
    detailCapacity,
    featureFrame,
    cavityGeometry: getRuntimeEffectiveCavityGeometry(runtimeState),
    requestedStepBudget:
      runtimeState.effectiveRaymarchSteps ??
      runtimeState.requestedRaymarchSteps ??
      volumeMesh.material.steps,
    requestedRenderScale: 1,
    spectralLightEnabled,
  });
  const { backbone: backboneLayer, detail: detailLayer } = performanceGovernor;
  runtimeState.performanceGovernor = performanceGovernor;
  const backboneArray = backboneModeBuffer.value.array;
  const backboneColorArray = backboneColorBuffer.value.array;
  copyLayerUpload({
    slots: featureFrame?.backboneSlots,
    colorSlots: featureFrame?.backboneColorSlots,
    targetSlots: backboneArray,
    targetColorSlots: backboneColorArray,
    layer: backboneLayer,
    includeColors: spectralLightEnabled,
  });
  backboneModeBuffer.value.needsUpdate = true;
  if (spectralLightEnabled) {
    backboneColorBuffer.value.needsUpdate = true;
  }

  const detailArray = detailModeBuffer.value.array;
  const detailColorArray = detailColorBuffer.value.array;
  copyLayerUpload({
    slots: featureFrame?.detailSlots,
    colorSlots: featureFrame?.detailColorSlots,
    targetSlots: detailArray,
    targetColorSlots: detailColorArray,
    layer: detailLayer,
    includeColors: spectralLightEnabled,
  });
  detailModeBuffer.value.needsUpdate = true;
  if (spectralLightEnabled) {
    detailColorBuffer.value.needsUpdate = true;
  }

  const backbonePhaseArray =
    runtimeState.backbonePhaseBuffer?.value?.array ?? null;
  const detailPhaseArray = runtimeState.detailPhaseBuffer?.value?.array ?? null;
  const backbonePhaseModeCount = copyLayerPhaseUpload({
    phaseSlots: featureFrame?.backbonePhaseSlots,
    targetPhaseSlots: backbonePhaseArray,
    layer: backboneLayer,
    capacity: backbonePhaseCapacity,
  });
  const detailPhaseModeCount = copyLayerPhaseUpload({
    phaseSlots: featureFrame?.detailPhaseSlots,
    targetPhaseSlots: detailPhaseArray,
    layer: detailLayer,
    capacity: detailPhaseCapacity,
  });
  runtimeState.phaseOverlayModeCount =
    backbonePhaseModeCount + detailPhaseModeCount;
  if (runtimeState.backbonePhaseBuffer?.value) {
    runtimeState.backbonePhaseBuffer.value.needsUpdate =
      backbonePhaseModeCount > 0;
  }
  if (runtimeState.detailPhaseBuffer?.value) {
    runtimeState.detailPhaseBuffer.value.needsUpdate = detailPhaseModeCount > 0;
  }

  const backboneModeCount = backboneLayer.uploadedActiveCount;
  const detailModeCount = detailLayer.uploadedActiveCount;
  setIfChanged(uniforms.uBackboneModeCount, backboneModeCount);
  setIfChanged(uniforms.uDetailModeCount, detailModeCount);
  setIfChanged(uniforms.uActiveModeCount, backboneModeCount + detailModeCount);
  const fieldDescriptor = buildRaymarchFieldCacheDescriptor({
    backboneSlots: runtimeState.backboneModeBuffer?.value?.array,
    detailSlots: runtimeState.detailModeBuffer?.value?.array,
    backboneCount: backboneModeCount,
    detailCount: detailModeCount,
    boundaryMode: getRuntimeBoundaryMode(runtimeState),
    cavityGeometry: getRuntimeEffectiveCavityGeometry(runtimeState),
    radius: runtimeState.uniforms.uRadius?.value ?? 1,
  });
  const spectralLightDescriptor = spectralLightEnabled
    ? buildRaymarchSpectralLightCacheDescriptor({
        backboneSlots: runtimeState.backboneModeBuffer?.value?.array,
        detailSlots: runtimeState.detailModeBuffer?.value?.array,
        backboneColorSlots: runtimeState.backboneColorBuffer?.value?.array,
        detailColorSlots: runtimeState.detailColorBuffer?.value?.array,
        backboneCount: backboneModeCount,
        detailCount: detailModeCount,
        boundaryMode: getRuntimeBoundaryMode(runtimeState),
        cavityGeometry: getRuntimeEffectiveCavityGeometry(runtimeState),
        radius: runtimeState.uniforms.uRadius?.value ?? 1,
      })
    : null;
  runtimeState.spectralLightBuffersUploaded = spectralLightEnabled;
  setRaymarchCavityGeometry(
    runtimeState.volumeMesh,
    getRuntimeEffectiveCavityGeometry(runtimeState),
  );
  updateRaymarchEvaluationModes(
    runtimeState,
    renderer,
    {
      backboneCapacity,
      detailCapacity,
    },
    {
      spectralLightEnabled,
      fieldDescriptor,
      spectralLightDescriptor,
    },
  );
  updatePhaseOverlayCache(
    runtimeState,
    renderer,
    {
      backbonePhaseCapacity,
      detailPhaseCapacity,
    },
    {
      fieldDescriptor,
      fieldEvaluationMode:
        runtimeState.volumeMesh?.userData?.raymarchFieldEvaluationMode ??
        "direct",
      featureFrame,
      timeMs: time * 1000,
    },
  );
  setIfChanged(uniforms.uAverageAmplitude, featureFrame?.averageAmplitude ?? 0);
  setIfChanged(uniforms.uTransientEnergy, featureFrame?.transientEnergy ?? 0);
  setIfChanged(uniforms.uSpectralCentroid, featureFrame?.spectralCentroid ?? 0);
  setIfChanged(uniforms.uSpectralFlux, featureFrame?.spectralFlux ?? 0);
  setIfChanged(uniforms.uStructureSignal, featureFrame?.structureSignal ?? 0);
  setIfChanged(uniforms.uEnergySignal, featureFrame?.energySignal ?? 0);
  setIfChanged(uniforms.uChangeSignal, featureFrame?.changeSignal ?? 0);
  setIfChanged(uniforms.uPulseSignal, featureFrame?.pulseSignal ?? 0);
  setIfChanged(uniforms.uBassSalience, featureFrame?.bassSalience ?? 0);
  setIfChanged(uniforms.uTimbreSpread, featureFrame?.timbreSpread ?? 0);
  setIfChanged(uniforms.uSpectralNovelty, featureFrame?.spectralNovelty ?? 0);
  const beatTarget =
    featureFrame?.beatDetected && (featureFrame?.beatStrength ?? 0) > 0.3
      ? clamp01(
          (featureFrame.beatStrength ?? 0) * 0.8 +
            (featureFrame.beatConfidence ?? 0) * 0.2,
        )
      : 0;
  runtimeState.beatPulseEnvelope = damp(
    runtimeState.beatPulseEnvelope ?? 0,
    beatTarget,
    beatTarget > (runtimeState.beatPulseEnvelope ?? 0) ? 25 : 8,
    deltaTime,
  );
  setIfChanged(uniforms.uBeatPulse, runtimeState.beatPulseEnvelope);
  setIfChanged(uniforms.uBeatPhase, featureFrame?.beatPhase ?? 0);
  setIfChanged(
    uniforms.uTempoNorm,
    clamp01(((featureFrame?.estimatedTempo ?? 0) - 40) / 200),
  );
  setIfChanged(uniforms.uRhythmicDensity, featureFrame?.rhythmicDensity ?? 0);
  setIfChanged(
    uniforms.uTrebleBroadbandEnergy,
    featureFrame?.trebleBroadbandEnergy ?? 0,
  );
  setIfChanged(uniforms.uModeCoherence, featureFrame?.modeCoherence ?? 0);
  setIfChanged(uniforms.uTotalSlotAmplitude, sumLayeredAmplitude(featureFrame));
  setIfChanged(
    uniforms.uModalVisibilityEnergy,
    featureFrame?.modalVisibilityEnergy ?? 0,
  );
  setIfChanged(
    uniforms.uModalObserverVisibilityEnergy,
    featureFrame?.modalObserverVisibilityEnergy ?? 0,
  );
  setIfChanged(
    uniforms.uModalVisibilityRetainedHighQEnergy,
    featureFrame?.modalVisibilityRetainedHighQEnergy ?? 0,
  );

  // Key tonic hue — EMA with circular shortest-path wrapping
  const rawKeyHue = featureFrame?.keyTonicHue ?? runtimeState.keyHue;
  const keyConf = featureFrame?.keyConfidence ?? 0;
  if (keyConf > 0.35) {
    let hueDelta = rawKeyHue - runtimeState.keyHue;
    if (hueDelta > 0.5) hueDelta -= 1;
    if (hueDelta < -0.5) hueDelta += 1;
    runtimeState.keyHue = (runtimeState.keyHue + hueDelta * 0.01 + 1) % 1;
  }
  runtimeState.keyModeSmooth = damp(
    runtimeState.keyModeSmooth,
    featureFrame?.keyMode === "minor" ? 1 : 0,
    2.0,
    deltaTime,
  );
  uniforms.uKeyTint.value.setHSL(runtimeState.keyHue, 0.68, 0.6);
  setIfChanged(uniforms.uKeyTintStrength, clamp01(keyConf * 1.4));
  setIfChanged(uniforms.uKeyMode, runtimeState.keyModeSmooth);

  updateLaserResponse(runtimeState, featureFrame);
  uniforms.uDensityGain.value =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.scaleSignal ?? 0) * DENSITY_RESPONSE_AMOUNT);
  uniforms.uDensityAbsorption.value =
    uniforms.uDensityGain.value * uniforms.uAbsorption.value;
  const bandEnergies = featureFrame?.bandEnergies ?? EMPTY_BAND_ENERGIES;
  uniforms.uBandEnergies.value.set(
    bandEnergies[0] ?? 0,
    bandEnergies[1] ?? 0,
    bandEnergies[2] ?? 0,
    bandEnergies[3] ?? 0,
  );

  volumeMesh.visible = fieldDriven;
  idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    fieldDriven,
  );
  publishRaymarchRuntimeAuditSnapshot(runtimeState, featureFrame, fieldState);
}

export function disposeRaymarchRuntime(runtimeState) {
  disposeRaymarchFieldCache(runtimeState?.fieldCache);
  disposeRaymarchSpectralLightCache(runtimeState?.spectralLightCache);
  disposeRaymarchPhaseOverlayCache(runtimeState?.phaseOverlayCache);
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materialCache = child.userData?.raymarchMaterialCache;
    if (materialCache) {
      Object.values(materialCache).forEach((material) => {
        material?.dispose?.();
      });
    } else {
      child.material?.dispose?.();
    }
    if (child.isLight && child.shadow?.map) {
      child.shadow.map.dispose?.();
    }
  });
}

export function createRaymarchSceneRoot({ volumeMesh, idleOverlay, radius }) {
  const root = new THREE.Group();
  const visualRoot = new THREE.Group();
  visualRoot.add(volumeMesh);
  visualRoot.add(idleOverlay);
  root.add(visualRoot);

  // Keep the orb primarily self-emissive, but retain a very weak symmetric fill
  // rig so the volume stays readable across backends that expect direct lights.
  const primaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  primaryLight.position.set(radius * 1.15, radius * 0.85, radius * 1.8);
  primaryLight.castShadow = false;
  root.add(primaryLight);

  const secondaryLight = new THREE.PointLight(0xe6f7ff, 0.9, radius * 6, 2);
  secondaryLight.position.set(-radius * 1.15, radius * 0.85, radius * 1.8);
  secondaryLight.castShadow = false;
  root.add(secondaryLight);

  return {
    root,
    visualRoot,
    sceneLighting: {
      primary: primaryLight,
      secondary: secondaryLight,
    },
  };
}
