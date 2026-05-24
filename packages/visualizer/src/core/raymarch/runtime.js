import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import { getBoundaryModeFromValue } from "../modeFamily.js";
import {
  hasRenderAuthority,
  isRenderAuthorityCut,
} from "../renderAuthorityContract.js";
import {
  buildRaymarchEffectiveFieldDescriptor,
  buildRaymarchSpectralLightCacheDescriptor,
  advanceRaymarchCacheGeneration,
  clearQueuedRaymarchCacheRebuild,
  disposeRaymarchEffectiveFieldCache,
  disposeRaymarchSpectralLightCache,
  enqueueRaymarchEffectiveFieldRebuild,
  enqueueRaymarchSpectralLightCacheRebuild,
  getRaymarchEffectiveFieldDescriptorStaleReason,
  isRaymarchEffectiveFieldCacheReadyForDescriptor,
  isRaymarchSpectralLightCacheReadyForDescriptor,
  shouldRebuildRaymarchSpectralLightCache,
  shouldRebuildRaymarchEffectiveFieldCache,
  RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
} from "./fieldCache.js";
import {
  buildRaymarchPhaseSlotSignature,
  copyCanonicalRaymarchPhaseSlots,
} from "./phaseSlotSemantics.js";
import {
  deriveHolographicColorMix,
  deriveHolographicFresnel,
} from "./fieldShaping.js";
import {
  deriveObservationTransfer,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import {
  buildRaymarchPerformanceGovernor,
  copyModalField,
  deriveFieldExcitation,
  inferModalFieldCapacity,
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
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const HASH_FLOAT_VIEW = new Float32Array(1);
const HASH_UINT_VIEW = new Uint32Array(HASH_FLOAT_VIEW.buffer);

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

function readFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hashUint32(value, hash) {
  return Math.imul(hash ^ (value >>> 0), FNV_PRIME) >>> 0;
}

function hashFloat32(value, hash) {
  HASH_FLOAT_VIEW[0] = Math.fround(Number.isFinite(value) ? value : 0);
  return hashUint32(HASH_UINT_VIEW[0], hash);
}

function hashSlot4(values, offset, hash) {
  let nextHash = hash;
  nextHash = hashFloat32(values?.[offset] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[offset + 1] ?? 0, nextHash);
  nextHash = hashFloat32(values?.[offset + 2] ?? 0, nextHash);
  return hashFloat32(values?.[offset + 3] ?? 0, nextHash);
}

function resetRaymarchUploadState(runtimeState) {
  if (runtimeState) {
    runtimeState.raymarchUploadState = null;
  }
}

function clearBufferNode(bufferNode) {
  const array = bufferNode?.value?.array;
  if (!array?.fill) {
    return;
  }

  let hasNonZero = false;
  for (let index = 0; index < array.length; index += 1) {
    if (array[index] !== 0) {
      hasNonZero = true;
      break;
    }
  }
  if (!hasNonZero) {
    return;
  }

  array.fill(0);
  bufferNode.value.needsUpdate = true;
}

function resetCacheActivity(cache) {
  if (!cache) {
    return;
  }

  cache.active = false;
  cache.ready = false;
  cache.rebuildPending = false;
  cache.activeDescriptor = null;
  cache.pendingDescriptor = null;
  advanceRaymarchCacheGeneration(cache);
  clearQueuedRaymarchCacheRebuild(cache);
}

function resetEffectiveFieldRuntimeDiagnostics(effectiveFieldCache) {
  if (!effectiveFieldCache) {
    return;
  }

  effectiveFieldCache.activeEffectiveFieldModeCount = 0;
  effectiveFieldCache.effectiveFieldAuthority = 0;
  effectiveFieldCache.contributingEffectiveFieldModeCount = 0;
  effectiveFieldCache.zeroAmplitudeSkippedModeCount = 0;
  effectiveFieldCache.contributingModalEnergy = 0;
  effectiveFieldCache.bandwidthRejectedModeCount = 0;
  effectiveFieldCache.bandwidthRejectedModalEnergy = 0;
  effectiveFieldCache.effectiveFieldResolvedModalEnergyRatio = 1;
  effectiveFieldCache.effectiveFieldGradientEnvelope = 0;
  effectiveFieldCache.effectiveFieldUnsignedSupportMean = 0;
  effectiveFieldCache.effectiveFieldCancellationRatioMean = 0;
  effectiveFieldCache.effectiveFieldCancellationRatioMax = 0;
  effectiveFieldCache.effectiveFieldSupportDiagnosticSampleCount = 0;
}

function resetRenderAuthorityState(runtimeState) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldRoleBuffer);
  runtimeState.performanceGovernor = null;
  runtimeState.pendingRaymarchPerformanceGovernor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.effectiveFieldModeCount = 0;
  runtimeState.currentModalDescriptor = null;
  runtimeState.currentEffectiveFieldDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.effectiveFieldCache);
  resetCacheActivity(runtimeState.spectralLightCache);
  resetEffectiveFieldRuntimeDiagnostics(runtimeState.effectiveFieldCache);
}

function readRuntimeFieldNoiseFloor(runtimeState) {
  const effectiveFieldCache = runtimeState?.effectiveFieldCache;
  return readFiniteNumber(
    effectiveFieldCache?.densityNoiseFloor ??
      effectiveFieldCache?.fieldNoiseFloor ??
      effectiveFieldCache?.debug?.fieldNoiseFloor,
    0,
  );
}

function deriveRuntimeObservationTransferParameters(runtimeState) {
  return deriveObservationTransferParameters({
    opacityGain: runtimeState?.uniforms?.uOpacityGain?.value,
    stepCompensation: runtimeState?.bloomTuning?.stepCompensation,
    contourSharpness: runtimeState?.uniforms?.uContourSharpness?.value,
    fieldNoiseFloor: readRuntimeFieldNoiseFloor(runtimeState),
  });
}

function syncObservationTransferUniforms(runtimeState) {
  const parameters = deriveRuntimeObservationTransferParameters(runtimeState);
  const uniforms = runtimeState?.uniforms ?? {};
  setIfChanged(
    uniforms.uObservationDensityFadeStart,
    parameters.densityFadeStart,
  );
  setIfChanged(uniforms.uObservationDensityFadeEnd, parameters.densityFadeEnd);
  setIfChanged(uniforms.uObservationTransferGain, parameters.transferGain);
  setIfChanged(uniforms.uObservationDensityFloor, parameters.densityFloor);
  setIfChanged(
    uniforms.uObservationContourSupportScale,
    parameters.contourSupportScale,
  );
  runtimeState.observationTransferParameters = parameters;
  return parameters;
}

function sumModalFieldAmplitude(featureFrame) {
  let total = 0;
  const slots =
    featureFrame?.modalDescriptor?.slotViews?.modalFieldSlots ??
    featureFrame?.modalFieldSlots;
  if (slots) {
    for (let i = 3; i < slots.length; i += 4) total += slots[i] ?? 0;
  }
  return total;
}

function estimateModalFieldAmplitude(featureFrame) {
  return estimateAverageModeAmplitude(
    featureFrame?.modalDescriptor?.slotViews?.modalFieldSlots ??
      featureFrame?.modalFieldSlots,
  );
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

function maxRoleAmplitude(modalDescriptor, roleBit) {
  const slots = modalDescriptor?.slotViews?.modalFieldSlots;
  const roleSlots = modalDescriptor?.slotViews?.modalFieldRoleSlots;
  const count = Math.min(
    modalDescriptor?.counts?.modalFieldModeCount ?? 0,
    Math.floor((slots?.length ?? 0) / 4),
  );
  let max = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    if (roleSlots?.length && !((roleSlots[offset] ?? 0) & roleBit)) {
      continue;
    }
    max = Math.max(max, slots?.[offset + 3] ?? 0);
  }
  return max;
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

function buildRuntimeModalDescriptor(
  runtimeState,
  featureFrame,
  { modalFieldCapacity },
) {
  const sourceDescriptor = featureFrame?.modalDescriptor ?? null;
  const slotViews = sourceDescriptor?.slotViews ?? {};
  if (slotViews.modalFieldSlots) {
    return sourceDescriptor;
  }

  return buildCanonicalFullModalDescriptor({
    generation:
      sourceDescriptor?.generation ??
      runtimeState.modalDescriptorGeneration ??
      0,
    maxTotalModes: modalFieldCapacity,
    modalFieldSlots: featureFrame?.modalFieldSlots ?? featureFrame?.modeSlots,
    modalFieldPhaseSlots: featureFrame?.modalFieldPhaseSlots,
    modalFieldColorSlots: featureFrame?.modalFieldColorSlots,
    modalFieldRoleSlots: featureFrame?.modalFieldRoleSlots,
    activeModalFieldModeCount:
      sourceDescriptor?.counts?.validModeCount ?? featureFrame?.activeModeCount,
    roleHistogram: sourceDescriptor?.diagnostics?.roleHistogram,
    observerCandidateModeCount:
      sourceDescriptor?.diagnostics?.observerCandidateModeCount ??
      featureFrame?.debug?.excitedModeCount ??
      featureFrame?.debug?.structuralMetrics?.excitedModeCount,
    observedModalModeCount:
      sourceDescriptor?.diagnostics?.observedModalModeCount ??
      featureFrame?.debug?.observedModalModeCount ??
      featureFrame?.debug?.structuralMetrics?.observedModalModeCount,
    phaseAuthorityModeCount:
      sourceDescriptor?.diagnostics?.phaseAuthorityModeCount ??
      featureFrame?.debug?.modalPhaseCoherentFieldModeCount ??
      featureFrame?.debug?.structuralMetrics?.modalPhaseCoherentFieldModeCount,
    modeIdentityRetentionRatio:
      sourceDescriptor?.diagnostics?.modeIdentityRetentionRatio ??
      featureFrame?.debug?.modalPersistence ??
      featureFrame?.debug?.structuralMetrics?.modalPersistence,
  });
}

function blockOverflowedModalDescriptor(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  clearBufferNode(runtimeState.modalFieldRoleBuffer);
  runtimeState.performanceGovernor = null;
  runtimeState.pendingRaymarchPerformanceGovernor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.effectiveFieldModeCount = 0;
  runtimeState.currentEffectiveFieldDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.effectiveFieldCache);
  resetCacheActivity(runtimeState.spectralLightCache);
  resetEffectiveFieldRuntimeDiagnostics(runtimeState.effectiveFieldCache);
  setIfChanged(runtimeState.uniforms.uModalFieldModeCount, 0);
  setIfChanged(runtimeState.uniforms.uActiveModeCount, 0);
  runtimeState.volumeMesh.visible = false;
  runtimeState.idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
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
  renderAuthority,
) {
  if (runtimeState.auditEnabled) {
    const raymarchDebug = buildRaymarchDebugSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
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

function buildRaymarchDebugSnapshot(
  runtimeState,
  featureFrame,
  fieldState,
  renderAuthority,
) {
  const modalDescriptor =
    runtimeState.currentModalDescriptor ??
    featureFrame?.modalDescriptor ??
    null;
  const avgAmplitude = estimateModalFieldAmplitude(featureFrame);
  const maxBackboneAmplitude = maxRoleAmplitude(modalDescriptor, 1);
  const maxDetailAmplitude = maxRoleAmplitude(modalDescriptor, 2);
  const activeModeCount =
    runtimeState.uniforms.uModalFieldModeCount?.value ??
    runtimeState.uniforms.uActiveModeCount?.value ??
    0;
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
  const totalSlotAmplitude = sumModalFieldAmplitude({ modalDescriptor });
  const modalCoefficientEnergy = renderAuthority
    ? clamp01(totalSlotAmplitude)
    : 0;
  const modalResponseEnergy = renderAuthority
    ? clamp01(
        featureFrame?.modalResponseEnergy ??
          featureFrame?.modalResponseRenderEnergy ??
          featureFrame?.debug?.modalResponseEnergy ??
          0,
      )
    : 0;
  const modalPhaseAuthority = renderAuthority
    ? (featureFrame?.modalPhaseAuthority ?? 0)
    : 0;
  const observationHardSilence =
    isRenderAuthorityCut(featureFrame) ||
    (!renderAuthority && totalSlotAmplitude <= 0 && avgAmplitude <= 0);
  const observationParameters =
    runtimeState.observationTransferParameters ??
    deriveRuntimeObservationTransferParameters(runtimeState);
  const observationTransferDebug = deriveObservationTransfer({
    density: 0,
    modalStructureAnchor: 1,
    ridgeAnchor: 1,
    modalCoefficientEnergy,
    modalResponseEnergy,
    parameters: observationParameters,
  });
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
  const effectiveFieldCache = runtimeState.effectiveFieldCache ?? null;
  const spectralLightCache = runtimeState.spectralLightCache ?? null;
  const effectiveFieldDescriptor =
    runtimeState.currentEffectiveFieldDescriptor ?? null;
  const spectralLightDescriptor =
    runtimeState.currentSpectralLightDescriptor ?? null;
  const effectiveFieldDescriptorFresh =
    isRaymarchEffectiveFieldCacheReadyForDescriptor(
      effectiveFieldCache,
      effectiveFieldDescriptor,
    );
  const effectiveFieldDescriptorStaleReason =
    getRaymarchEffectiveFieldDescriptorStaleReason({
      descriptorFresh: effectiveFieldDescriptorFresh,
      rebuildPending: effectiveFieldCache?.rebuildPending,
      queuedDescriptor: effectiveFieldCache?.queuedDescriptor,
      activeDescriptor: effectiveFieldCache?.activeDescriptor,
      nextDescriptor: effectiveFieldDescriptor,
    });
  const effectiveFieldModeCount =
    effectiveFieldCache?.activeEffectiveFieldModeCount ??
    runtimeState.effectiveFieldModeCount ??
    0;
  const effectiveFieldSemantic =
    effectiveFieldCache?.semantic ?? "canonical-effective-field";
  const effectiveFieldSupportSemantic =
    effectiveFieldCache?.supportSemantic ?? "effective-field-support";
  const effectiveFieldSupportReady = Boolean(
    effectiveFieldCache?.ready && effectiveFieldCache?.supportTexture,
  );
  const effectiveFieldAuthority = readFiniteNumber(
    effectiveFieldCache?.effectiveFieldAuthority ??
      effectiveFieldDescriptor?.phaseAuthority,
    0,
  );
  const effectiveFieldMaxRepresentableModeIndex = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldMaxRepresentableModeIndex ??
      effectiveFieldCache?.effectiveFieldMaxRepresentableModeIndex,
    0,
  );
  const effectiveFieldContributingModeCount = readFiniteNumber(
    effectiveFieldDescriptor?.contributingEffectiveFieldModeCount ??
      effectiveFieldCache?.contributingEffectiveFieldModeCount,
    0,
  );
  const effectiveFieldZeroAmplitudeSkippedModeCount = readFiniteNumber(
    effectiveFieldDescriptor?.zeroAmplitudeSkippedModeCount ??
      effectiveFieldCache?.zeroAmplitudeSkippedModeCount,
    0,
  );
  const effectiveFieldContributingModalEnergy = readFiniteNumber(
    effectiveFieldDescriptor?.contributingModalEnergy ??
      effectiveFieldCache?.contributingModalEnergy,
    0,
  );
  const effectiveFieldBandwidthRejectedModeCount = readFiniteNumber(
    effectiveFieldDescriptor?.bandwidthRejectedModeCount ??
      effectiveFieldCache?.bandwidthRejectedModeCount,
    0,
  );
  const effectiveFieldBandwidthRejectedModalEnergy = readFiniteNumber(
    effectiveFieldDescriptor?.bandwidthRejectedModalEnergy ??
      effectiveFieldCache?.bandwidthRejectedModalEnergy,
    0,
  );
  const effectiveFieldResolvedModalEnergyRatio = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldResolvedModalEnergyRatio ??
      effectiveFieldCache?.effectiveFieldResolvedModalEnergyRatio,
    1,
  );
  const effectiveFieldGradientEnvelope = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldGradientEnvelope ??
      effectiveFieldCache?.effectiveFieldGradientEnvelope,
    0,
  );
  const effectiveFieldUnsignedSupportMean = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldUnsignedSupportMean ??
      effectiveFieldCache?.effectiveFieldUnsignedSupportMean,
    0,
  );
  const effectiveFieldCancellationRatioMean = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldCancellationRatioMean ??
      effectiveFieldCache?.effectiveFieldCancellationRatioMean,
    0,
  );
  const effectiveFieldCancellationRatioMax = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldCancellationRatioMax ??
      effectiveFieldCache?.effectiveFieldCancellationRatioMax,
    0,
  );
  const effectiveFieldSupportDiagnosticSampleCount = readFiniteNumber(
    effectiveFieldDescriptor?.effectiveFieldSupportDiagnosticSampleCount ??
      effectiveFieldCache?.effectiveFieldSupportDiagnosticSampleCount,
    0,
  );
  const spectralLightCacheDescriptorFresh =
    isRaymarchSpectralLightCacheReadyForDescriptor(
      spectralLightCache,
      spectralLightDescriptor,
    );
  const roleHistogram = modalDescriptor?.diagnostics?.roleHistogram ?? {};
  const renderedModalField = summarizeRenderedLayer(
    runtimeState.modalFieldModeBuffer?.value?.array,
    runtimeState.modalFieldColorBuffer?.value?.array,
    activeModeCount,
  );

  return {
    fieldState,
    renderAuthority,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      performanceGovernor?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      performanceGovernor?.uploadedModeCount ?? activeModeCount,
    modalFieldModeCount: activeModeCount,
    backboneModeCount: roleHistogram.backbone ?? 0,
    detailModeCount: roleHistogram.detail ?? 0,
    originalBackboneModeCount: roleHistogram.backbone ?? 0,
    originalDetailModeCount: roleHistogram.detail ?? 0,
    uploadedBackboneModeCount: roleHistogram.backbone ?? 0,
    uploadedDetailModeCount: roleHistogram.detail ?? 0,
    renderedModalFieldModeCount: renderedModalField.count,
    renderedModalFieldColorWeightMax: renderedModalField.colorWeightMax,
    renderedModalFieldAmplitudeTotal: renderedModalField.amplitudeTotal,
    modalDescriptorFieldAuthority:
      modalDescriptor?.fieldAuthority ?? "unavailable",
    modalDescriptorOverflow:
      modalDescriptor?.diagnostics?.descriptorOverflow === true,
    modalDescriptorMaxTotalModes:
      modalDescriptor?.capacity?.maxTotalModes ?? activeModeCount,
    modalDescriptorValidBackboneModeCount:
      modalDescriptor?.counts?.validBackboneModeCount ??
      roleHistogram.backbone ??
      0,
    modalDescriptorValidDetailModeCount:
      modalDescriptor?.counts?.validDetailModeCount ??
      roleHistogram.detail ??
      0,
    modalDescriptorValidModeCount:
      modalDescriptor?.counts?.validModeCount ?? activeModeCount,
    modalDescriptorOverflowBackboneModeCount:
      modalDescriptor?.counts?.overflowBackboneModeCount ?? 0,
    modalDescriptorOverflowDetailModeCount:
      modalDescriptor?.counts?.overflowDetailModeCount ?? 0,
    modalDescriptorPhaseAuthorityModeCount:
      modalDescriptor?.diagnostics?.phaseAuthorityModeCount ??
      effectiveFieldModeCount,
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
    modalCoefficientEnergy,
    modalResponseEnergy,
    observationEnergy: observationTransferDebug.observationEnergy,
    observationAnchorMax: observationTransferDebug.observationAnchor,
    observationSupportMax: observationTransferDebug.observationSupport,
    observedDensityFloorMax: observationTransferDebug.observedDensityFloor,
    observedContourSupportMax: observationTransferDebug.observedContourSupport,
    observationDensityFadeStart: observationParameters.densityFadeStart,
    observationDensityFadeEnd: observationParameters.densityFadeEnd,
    observationTransferGain: observationParameters.transferGain,
    observationDensityFloor: observationParameters.densityFloor,
    observationContourSupportScale: observationParameters.contourSupportScale,
    observationExposureScale: observationParameters.exposureScale,
    observationFieldNoiseFloor: observationParameters.fieldNoiseFloor,
    observationHardSilence,
    modalPhaseAuthority,
    projectionEnergyBudgetBackbone:
      featureFrame?.debug?.projectionEnergyBudgetBackbone ?? 0,
    projectionEnergyBudgetDetail:
      featureFrame?.debug?.projectionEnergyBudgetDetail ?? 0,
    projectionEnergyUsedBackbone:
      featureFrame?.debug?.projectionEnergyUsedBackbone ?? 0,
    projectionEnergyUsedDetail:
      featureFrame?.debug?.projectionEnergyUsedDetail ?? 0,
    projectionRawEnergyBackbone:
      featureFrame?.debug?.projectionRawEnergyBackbone ?? 0,
    projectionRawEnergyDetail:
      featureFrame?.debug?.projectionRawEnergyDetail ?? 0,
    projectionAllocatedEnergyBackbone:
      featureFrame?.debug?.projectionAllocatedEnergyBackbone ?? 0,
    projectionAllocatedEnergyDetail:
      featureFrame?.debug?.projectionAllocatedEnergyDetail ?? 0,
    projectionEnergyScaleBackbone:
      featureFrame?.debug?.projectionEnergyScaleBackbone ?? 0,
    projectionEnergyScaleDetail:
      featureFrame?.debug?.projectionEnergyScaleDetail ?? 0,
    projectionOverlapPressureBackbone:
      featureFrame?.debug?.projectionOverlapPressureBackbone ?? 0,
    projectionOverlapPressureDetail:
      featureFrame?.debug?.projectionOverlapPressureDetail ?? 0,
    projectionCompetitionReduction:
      featureFrame?.debug?.projectionCompetitionReduction ?? 0,
    projectionDenseSpectrumPressure:
      featureFrame?.debug?.projectionDenseSpectrumPressure ?? 0,
    projectionHighQProtection:
      featureFrame?.debug?.projectionHighQProtection ?? 0,
    projectionEnergyNormalizationApplied:
      featureFrame?.debug?.projectionEnergyNormalizationApplied === true,
    highQPhaseAuthority: featureFrame?.debug?.highQPhaseAuthority ?? 0,
    lowQPhaseAuthority: featureFrame?.debug?.lowQPhaseAuthority ?? 0,
    modalPhaseCoherentFieldModeCount:
      featureFrame?.debug?.modalPhaseCoherentFieldModeCount ?? 0,
    modeCoherence: featureFrame?.modeCoherence ?? 0,
    trebleTonalEnergy: featureFrame?.trebleTonalEnergy ?? 0,
    trebleBroadbandEnergy: featureFrame?.trebleBroadbandEnergy ?? 0,
    totalSlotAmplitude,
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
      effectiveFieldCache?.mode ??
      "effective-cached",
    spectralLightEvaluationMode:
      runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ??
      spectralLightCache?.mode ??
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    effectiveFieldActive: effectiveFieldCache?.active ?? false,
    effectiveFieldResolution:
      effectiveFieldCache?.resolution ?? RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
    effectiveFieldRebuildCount: effectiveFieldCache?.rebuildCount ?? 0,
    effectiveFieldRebuildReason:
      effectiveFieldCache?.lastRebuildReason ?? "uninitialized",
    effectiveFieldDescriptorFresh,
    effectiveFieldDescriptorStaleReason,
    effectiveFieldQueuedDescriptorPending: Boolean(
      effectiveFieldCache?.queuedDescriptor,
    ),
    effectiveFieldBackend: effectiveFieldCache?.backend ?? "compute",
    effectiveFieldReady: effectiveFieldCache?.ready ?? false,
    effectiveFieldRebuildPending: effectiveFieldCache?.rebuildPending ?? false,
    effectiveFieldFailedClosed: effectiveFieldCache?.backend === "unavailable",
    effectiveFieldLastError: effectiveFieldCache?.lastError ?? null,
    effectiveFieldModeCount,
    effectiveFieldSemantic,
    effectiveFieldSupportReady,
    effectiveFieldSupportSemantic,
    effectiveFieldAuthority,
    effectiveFieldModeIdentityRetentionRatio:
      effectiveFieldCache?.modeIdentityRetentionRatio ??
      effectiveFieldDescriptor?.modeIdentityRetentionRatio ??
      1,
    effectiveFieldMaxRepresentableModeIndex,
    effectiveFieldContributingModeCount,
    effectiveFieldZeroAmplitudeSkippedModeCount,
    effectiveFieldContributingModalEnergy,
    effectiveFieldBandwidthRejectedModeCount,
    effectiveFieldBandwidthRejectedModalEnergy,
    effectiveFieldResolvedModalEnergyRatio,
    effectiveFieldGradientEnvelope,
    effectiveFieldUnsignedSupportMean,
    effectiveFieldCancellationRatioMean,
    effectiveFieldCancellationRatioMax,
    effectiveFieldSupportDiagnosticSampleCount,
    spectralLightCacheActive: spectralLightCache?.active ?? false,
    spectralLightCacheReady: spectralLightCache?.ready ?? false,
    spectralLightCacheRebuildPending:
      spectralLightCache?.rebuildPending ?? false,
    spectralLightCacheDescriptorFresh,
    spectralLightCacheQueuedDescriptorPending: Boolean(
      spectralLightCache?.queuedDescriptor,
    ),
    spectralLightCacheBackend: spectralLightCache?.backend ?? "compute",
    spectralLightCacheFailedClosed:
      spectralLightCache?.backend === "unavailable",
    spectralLightCacheRebuildCount: spectralLightCache?.rebuildCount ?? 0,
    spectralLightCacheLastError: spectralLightCache?.lastError ?? null,
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
  renderAuthority,
  deltaTime,
) {
  const rt = runtimeState.reactivityTuning;
  const structureSignal = clamp01(featureFrame?.structureSignal ?? 0);
  const energySignal = clamp01(featureFrame?.energySignal ?? 0);
  const changeSignal = clamp01(featureFrame?.changeSignal ?? 0);
  const pulseSignal = clamp01(featureFrame?.pulseSignal ?? 0);
  const modalResponseEnergy = clamp01(
    Math.max(
      featureFrame?.modalResponseEnergy ??
        featureFrame?.modalResponseRenderEnergy ??
        featureFrame?.debug?.modalResponseEnergy ??
        0,
      sumModalFieldAmplitude(featureFrame),
    ),
  );
  const reactivity = Math.max(
    0,
    rt?.reactivity ?? REACTIVITY_DEFAULTS.reactivity,
  );
  if (!renderAuthority) {
    runtimeState.responseEnvelope = 0;
    runtimeState.accentEnvelope = 0;
    runtimeState.motionSignal = 0;
    runtimeState.scaleSignal = 0;
    runtimeState.bloomResponseSignal = 0;
    runtimeState.visualRoot?.scale?.setScalar?.(1);
    return;
  }

  const presentationSignalScale = 1;
  const rhythmicDensity = clamp01(featureFrame?.rhythmicDensity ?? 0);
  const gatedStructureSignal = clamp01(
    structureSignal * reactivity * presentationSignalScale,
  );
  const gatedEnergySignal = clamp01(
    energySignal * reactivity * presentationSignalScale,
  );
  const gatedChangeSignal = clamp01(
    changeSignal * reactivity * presentationSignalScale,
  );
  const gatedPulseSignal = clamp01(
    pulseSignal * reactivity * presentationSignalScale,
  );
  const gatedModalResponseEnergy = clamp01(
    modalResponseEnergy * reactivity * presentationSignalScale,
  );
  const decayReleaseMask = deriveDecayReleaseMask({
    fieldState,
    gatedStructureSignal,
    gatedEnergySignal,
    gatedChangeSignal,
  });
  const envelopeTarget = renderAuthority
    ? clamp01(
        gatedStructureSignal *
          0.34 *
          (1 - decayReleaseMask * DECAY_RELEASE_TARGET_REDUCTION) +
          gatedEnergySignal * 0.38 +
          gatedChangeSignal * 0.23 +
          gatedModalResponseEnergy * 0.48,
      )
    : 0;
  const responseEnvelope = damp(
    runtimeState.responseEnvelope ?? 0,
    envelopeTarget,
    envelopeTarget > (runtimeState.responseEnvelope ?? 0)
      ? RESPONSE_ATTACK
      : renderAuthority
        ? RESPONSE_RELEASE *
          (1 +
            rhythmicDensity * RHYTHMIC_RELEASE_RATE_GAIN +
            decayReleaseMask * DECAY_RELEASE_RATE_GAIN)
        : RESPONSE_IDLE_RELEASE,
    deltaTime,
  );
  const accentTarget = renderAuthority
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
      gatedModalResponseEnergy * 0.08,
  );
  const contourSharpness = runtimeState.uniforms.uContourSharpness?.value ?? 1;
  const contourSignal = clamp01((contourSharpness - 1) / 7);
  const bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      gatedStructureSignal * 0.2 +
      gatedModalResponseEnergy * 0.08 +
      contourSignal * 0.14 * reactivity * presentationSignalScale,
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

function getRaymarchUploadState(runtimeState) {
  if (!runtimeState.raymarchUploadState) {
    runtimeState.raymarchUploadState = {
      modalField: null,
      modalFieldPhase: null,
      modalFieldRole: null,
      spectralLightDescriptorSignature: null,
    };
  }

  return runtimeState.raymarchUploadState;
}

function buildLayerUploadSignature({
  slots,
  colorSlots,
  layer,
  includeColors,
}) {
  const capacity = Math.max(0, Math.floor(layer?.capacity ?? 0));
  const activeCount = Math.min(
    Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
    capacity,
  );
  let slotHash = FNV_OFFSET_BASIS;
  let colorHash = includeColors ? FNV_OFFSET_BASIS : 0;

  for (let slotIndex = 0; slotIndex < activeCount; slotIndex += 1) {
    const sourceOffset = slotIndex * 4;
    slotHash = hashUint32(slotIndex, slotHash);
    slotHash = hashSlot4(slots, sourceOffset, slotHash);
    if (includeColors) {
      colorHash = hashUint32(slotIndex, colorHash);
      colorHash = hashSlot4(colorSlots, sourceOffset, colorHash);
    }
  }

  return {
    capacity,
    activeCount,
    includeColors: Boolean(includeColors),
    slotHash: slotHash >>> 0,
    colorHash: colorHash >>> 0,
  };
}

function layerModeUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.slotHash !== next.slotHash
  );
}

function layerColorUploadSignatureChanged(previous, next) {
  return (
    !previous ||
    previous.capacity !== next.capacity ||
    previous.activeCount !== next.activeCount ||
    previous.includeColors !== next.includeColors ||
    previous.colorHash !== next.colorHash
  );
}

function applyLayerUploadIfChanged({
  uploadState,
  key,
  slots,
  colorSlots,
  targetSlots,
  targetColorSlots,
  modeBufferNode,
  colorBufferNode,
  layer,
  includeColors,
}) {
  const signature = buildLayerUploadSignature({
    slots,
    colorSlots,
    layer,
    includeColors,
  });
  const previous = uploadState[key]?.signature ?? null;
  const modeChanged = layerModeUploadSignatureChanged(previous, signature);
  const colorChanged = layerColorUploadSignatureChanged(previous, signature);

  if (modeChanged || colorChanged) {
    copyLayerUpload({
      slots,
      colorSlots,
      targetSlots,
      targetColorSlots,
      layer,
      includeColors,
    });
    if (modeChanged) {
      modeBufferNode.value.needsUpdate = true;
    }
    if (includeColors && colorChanged && colorBufferNode?.value) {
      colorBufferNode.value.needsUpdate = true;
    }
    uploadState[key] = { signature };
  }

  return signature;
}

function buildPhaseUploadSignature({ phaseSlots, layer, capacity }) {
  const resolvedCapacity = Math.max(0, Math.floor(capacity ?? 0));
  const activeCount = Math.min(
    Math.max(0, Math.floor(layer?.uploadedActiveCount ?? 0)),
    resolvedCapacity,
  );
  const phaseSignature = buildRaymarchPhaseSlotSignature({
    phaseSlots,
    activeCount,
    includeSlotIndex: true,
  });

  return {
    capacity: resolvedCapacity,
    activeCount,
    activePhaseCount: phaseSignature.activePhaseCount,
    slotHash: phaseSignature.slotHash,
  };
}

function phaseUploadSignatureEquals(previous, next) {
  return Boolean(
    previous &&
    previous.capacity === next.capacity &&
    previous.activeCount === next.activeCount &&
    previous.activePhaseCount === next.activePhaseCount &&
    previous.slotHash === next.slotHash,
  );
}

function applyLayerPhaseUploadIfChanged({
  uploadState,
  key,
  phaseSlots,
  targetPhaseSlots,
  phaseBufferNode,
  layer,
  capacity,
}) {
  if (!targetPhaseSlots || !layer) {
    uploadState[key] = null;
    return 0;
  }

  const signature = buildPhaseUploadSignature({
    phaseSlots,
    layer,
    capacity,
  });
  const previous = uploadState[key]?.signature ?? null;
  if (phaseUploadSignatureEquals(previous, signature)) {
    return uploadState[key]?.activeCount ?? 0;
  }

  const activeCount = copyLayerPhaseUpload({
    phaseSlots,
    targetPhaseSlots,
    layer,
    capacity,
  });
  if (phaseBufferNode?.value) {
    phaseBufferNode.value.needsUpdate = activeCount > 0;
  }
  uploadState[key] = {
    signature,
    activeCount,
  };
  return activeCount;
}

function buildFieldDescriptorSignature({
  modalFieldSignature,
  modalFieldCount,
  boundaryMode,
  cavityGeometry,
  radius,
}) {
  return {
    modalFieldCount,
    boundaryMode,
    cavityGeometry,
    radius: Number.isFinite(radius) ? radius : 1,
    modalFieldHash: modalFieldSignature?.slotHash ?? 0,
  };
}

function fieldDescriptorSignatureEquals(previous, next) {
  return Boolean(
    previous &&
    previous.modalFieldCount === next.modalFieldCount &&
    previous.boundaryMode === next.boundaryMode &&
    previous.cavityGeometry === next.cavityGeometry &&
    previous.radius === next.radius &&
    previous.modalFieldHash === next.modalFieldHash,
  );
}

function buildSpectralLightDescriptorSignature({
  fieldSignature,
  modalFieldSignature,
}) {
  return {
    ...fieldSignature,
    modalFieldColorHash: modalFieldSignature?.colorHash ?? 0,
  };
}

function spectralLightDescriptorSignatureEquals(previous, next) {
  return Boolean(
    fieldDescriptorSignatureEquals(previous, next) &&
    previous.modalFieldColorHash === next.modalFieldColorHash,
  );
}

function copyLayerUpload({
  slots,
  colorSlots,
  targetSlots,
  targetColorSlots,
  layer,
  includeColors,
}) {
  copyModalField({
    sourceSlots: slots,
    sourceColorSlots: colorSlots,
    targetSlots,
    targetColorSlots,
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
  return copyCanonicalRaymarchPhaseSlots({
    sourceSlots: phaseSlots,
    targetSlots: targetPhaseSlots,
    capacity,
  });
}

function resolveRequestedRaymarchStepBudget(runtimeState, volumeMesh) {
  return (
    runtimeState.effectiveRaymarchSteps ??
    runtimeState.requestedRaymarchSteps ??
    volumeMesh.material.steps
  );
}

function takePendingRaymarchPerformanceGovernor(
  runtimeState,
  featureFrame,
  {
    modalFieldCapacity,
    cavityGeometry,
    requestedStepBudget,
    requestedRenderScale,
  },
) {
  const pending = runtimeState.pendingRaymarchPerformanceGovernor ?? null;
  if (!pending) {
    return null;
  }

  runtimeState.pendingRaymarchPerformanceGovernor = null;
  const matches =
    pending.featureFrame === featureFrame &&
    pending.modalFieldCapacity === modalFieldCapacity &&
    pending.cavityGeometry === cavityGeometry &&
    pending.requestedStepBudget === requestedStepBudget &&
    pending.requestedRenderScale === requestedRenderScale;

  return matches ? (pending.governor ?? null) : null;
}

function updateEffectiveFieldCache(
  runtimeState,
  renderer,
  { modalFieldCapacity, schedulerTimeSec = null },
  { effectiveFieldDescriptor },
) {
  const effectiveFieldCache = runtimeState.effectiveFieldCache;
  if (!effectiveFieldCache || !runtimeState.volumeMesh) {
    return "unavailable";
  }

  effectiveFieldCache.active = true;
  effectiveFieldCache.mode = "effective-cached";
  effectiveFieldCache.activeEffectiveFieldModeCount =
    effectiveFieldDescriptor?.phaseModeCount ?? 0;
  effectiveFieldCache.effectiveFieldAuthority =
    effectiveFieldDescriptor?.phaseAuthority ?? 0;
  effectiveFieldCache.modeIdentityRetentionRatio =
    effectiveFieldDescriptor?.modeIdentityRetentionRatio ?? 1;

  const { needsRebuild, reason } = shouldRebuildRaymarchEffectiveFieldCache(
    effectiveFieldCache,
    effectiveFieldDescriptor,
  );

  if (needsRebuild) {
    enqueueRaymarchEffectiveFieldRebuild(
      effectiveFieldCache,
      renderer,
      effectiveFieldDescriptor,
      reason,
      {
        modalFieldModeBuffer: runtimeState.modalFieldModeBuffer,
        modalFieldPhaseBuffer: runtimeState.modalFieldPhaseBuffer,
        modalFieldCapacity,
        uniforms: runtimeState.uniforms,
        schedulerTimeSec,
        phaseRebuildMinIntervalSec:
          runtimeState.effectiveFieldPhaseRebuildMinIntervalSec,
      },
    );
  }

  return effectiveFieldCache.backend === "unavailable"
    ? "unavailable"
    : "effective-cached";
}

function resolveSpectralLightEvaluationMode(
  runtimeState,
  renderer,
  { modalFieldCapacity },
  { spectralLightEnabled, spectralLightDescriptor, debugDirectRequested },
) {
  const spectralLightCache = runtimeState.spectralLightCache;
  if (!spectralLightCache) {
    if (!spectralLightEnabled) {
      return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
    }
    return debugDirectRequested
      ? RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct
      : RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
  }

  if (!spectralLightEnabled) {
    spectralLightCache.active = false;
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
    clearQueuedRaymarchCacheRebuild(spectralLightCache);
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  }

  if (debugDirectRequested) {
    spectralLightCache.active = false;
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
    clearQueuedRaymarchCacheRebuild(spectralLightCache);
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.direct;
  }

  spectralLightCache.active = true;
  spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;

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
          modalFieldModeBuffer: runtimeState.modalFieldModeBuffer,
          modalFieldColorBuffer: runtimeState.modalFieldColorBuffer,
          modalFieldCapacity,
          uniforms: runtimeState.uniforms,
        },
      );
    }
  }

  return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
}

function updateRaymarchEvaluationModes(
  runtimeState,
  renderer,
  capacities,
  { spectralLightEnabled, effectiveFieldDescriptor, spectralLightDescriptor },
) {
  if (!runtimeState.volumeMesh) {
    return;
  }

  const fieldEvaluationMode = updateEffectiveFieldCache(
    runtimeState,
    renderer,
    capacities,
    {
      effectiveFieldDescriptor,
    },
  );
  setRaymarchFieldEvaluationMode(runtimeState.volumeMesh, fieldEvaluationMode);

  const spectralLightEvaluationMode = resolveSpectralLightEvaluationMode(
    runtimeState,
    renderer,
    capacities,
    {
      spectralLightEnabled,
      spectralLightDescriptor,
      debugDirectRequested: false,
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
    uniforms,
    volumeMesh,
    idleOverlay,
  } = runtimeState;
  const modalFieldModeBuffer = runtimeState.modalFieldModeBuffer;
  const modalFieldColorBuffer = runtimeState.modalFieldColorBuffer;
  const modalFieldPhaseBuffer = runtimeState.modalFieldPhaseBuffer;
  const modalFieldRoleBuffer = runtimeState.modalFieldRoleBuffer;
  const modalFieldCapacity = inferModalFieldCapacity(
    runtimeState.modalFieldCapacity,
    modalFieldModeBuffer.value.array,
  );
  const modalFieldPhaseCapacity = inferModalFieldCapacity(
    runtimeState.modalFieldPhaseCapacity ?? runtimeState.modalFieldCapacity,
    modalFieldPhaseBuffer?.value?.array,
  );

  uniforms.uTime.value = time;
  const fieldState = featureFrame?.fieldState ?? "idle";
  const renderAuthority = hasRenderAuthority(featureFrame);
  updateReactiveResponse(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
    deltaTime,
  );
  setIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  if (!renderAuthority) {
    resetRenderAuthorityState(runtimeState);
    setIfChanged(uniforms.uModalFieldModeCount, 0);
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
    setIfChanged(uniforms.uModalResponseEnergy, 0);
    setIfChanged(uniforms.uKeyTintStrength, 0);
    setIfChanged(uniforms.uKeyMode, 0);
    uniforms.uBandEnergies.value.set(0, 0, 0, 0);
    uniforms.uDensityGain.value =
      runtimeState.baseDensityGain ?? uniforms.uDensityGain.value;
    uniforms.uDensityAbsorption.value =
      uniforms.uDensityGain.value * uniforms.uAbsorption.value;
    syncObservationTransferUniforms(runtimeState);
    volumeMesh.visible = false;
    idleOverlay.visible = resolveIdleOverlayVisible(
      runtimeState,
      featureFrame,
      renderAuthority,
    );
    publishRaymarchRuntimeAuditSnapshot(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }

  const spectralLightEnabled = (uniforms.uSpectralMix?.value ?? 0) > 0;
  const effectiveCavityGeometry =
    getRuntimeEffectiveCavityGeometry(runtimeState);
  const modalDescriptor = buildRuntimeModalDescriptor(
    runtimeState,
    featureFrame,
    {
      modalFieldCapacity,
    },
  );
  runtimeState.currentModalDescriptor = modalDescriptor;
  if (modalDescriptor.diagnostics.descriptorOverflow) {
    blockOverflowedModalDescriptor(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
    );
    return;
  }
  const descriptorSlots = modalDescriptor.slotViews;

  const requestedStepBudget = resolveRequestedRaymarchStepBudget(
    runtimeState,
    volumeMesh,
  );
  const requestedRenderScale = 1;
  const performanceGovernor =
    takePendingRaymarchPerformanceGovernor(runtimeState, featureFrame, {
      modalFieldCapacity,
      cavityGeometry: effectiveCavityGeometry,
      requestedStepBudget,
      requestedRenderScale,
    }) ??
    buildRaymarchPerformanceGovernor({
      modalFieldSlots: descriptorSlots.modalFieldSlots,
      modalFieldCapacity,
      featureFrame,
      cavityGeometry: effectiveCavityGeometry,
      requestedStepBudget,
      requestedRenderScale,
    });
  const modalFieldLayer = performanceGovernor.modalField;
  runtimeState.performanceGovernor = performanceGovernor;
  const uploadState = getRaymarchUploadState(runtimeState);
  const modalFieldArray = modalFieldModeBuffer.value.array;
  const modalFieldColorArray = modalFieldColorBuffer.value.array;
  const modalFieldSignature = applyLayerUploadIfChanged({
    uploadState,
    key: "modalField",
    slots: descriptorSlots.modalFieldSlots,
    colorSlots: descriptorSlots.modalFieldColorSlots,
    targetSlots: modalFieldArray,
    targetColorSlots: modalFieldColorArray,
    modeBufferNode: modalFieldModeBuffer,
    colorBufferNode: modalFieldColorBuffer,
    layer: modalFieldLayer,
    includeColors: spectralLightEnabled,
  });

  const modalFieldPhaseArray = modalFieldPhaseBuffer?.value?.array ?? null;
  const modalFieldPhaseModeCount = applyLayerPhaseUploadIfChanged({
    uploadState,
    key: "modalFieldPhase",
    phaseSlots: descriptorSlots.modalFieldPhaseSlots,
    targetPhaseSlots: modalFieldPhaseArray,
    phaseBufferNode: modalFieldPhaseBuffer,
    layer: modalFieldLayer,
    capacity: modalFieldPhaseCapacity,
  });
  if (modalFieldRoleBuffer?.value?.array) {
    copyModalField({
      sourceSlots: descriptorSlots.modalFieldRoleSlots,
      targetSlots: modalFieldRoleBuffer.value.array,
      capacity: modalFieldLayer.capacity,
      includeColors: false,
    });
    modalFieldRoleBuffer.value.needsUpdate = true;
  }
  runtimeState.effectiveFieldModeCount = modalFieldPhaseModeCount;

  const modalFieldModeCount = modalFieldLayer.uploadedActiveCount;
  setIfChanged(uniforms.uModalFieldModeCount, modalFieldModeCount);
  setIfChanged(uniforms.uActiveModeCount, modalFieldModeCount);

  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const descriptorRadius = runtimeState.uniforms.uRadius?.value ?? 1;
  const fieldDescriptorSignature = buildFieldDescriptorSignature({
    modalFieldSignature,
    modalFieldCount: modalFieldModeCount,
    boundaryMode,
    cavityGeometry: effectiveCavityGeometry,
    radius: descriptorRadius,
  });
  const effectiveFieldDescriptor = buildRaymarchEffectiveFieldDescriptor({
    modalFieldSlots: modalFieldModeBuffer?.value?.array,
    modalFieldPhaseSlots: modalFieldPhaseBuffer?.value?.array,
    modalFieldCount: modalFieldModeCount,
    boundaryMode,
    cavityGeometry: effectiveCavityGeometry,
    radius: descriptorRadius,
    phaseModeCount: runtimeState.effectiveFieldModeCount,
    phaseAuthority: featureFrame?.modalPhaseAuthority ?? 0,
    descriptorOverflow: modalDescriptor.diagnostics.descriptorOverflow,
    modeIdentityRetentionRatio:
      modalDescriptor.diagnostics.modeIdentityRetentionRatio,
    resolution:
      runtimeState.effectiveFieldCache?.resolution ??
      RAYMARCH_EFFECTIVE_FIELD_RESOLUTION,
  });

  let spectralLightDescriptor = null;
  if (spectralLightEnabled) {
    const spectralLightDescriptorSignature =
      buildSpectralLightDescriptorSignature({
        fieldSignature: fieldDescriptorSignature,
        modalFieldSignature,
      });
    spectralLightDescriptor = runtimeState.currentSpectralLightDescriptor;
    if (
      !spectralLightDescriptor ||
      !spectralLightDescriptorSignatureEquals(
        uploadState.spectralLightDescriptorSignature,
        spectralLightDescriptorSignature,
      )
    ) {
      spectralLightDescriptor = buildRaymarchSpectralLightCacheDescriptor({
        modalFieldSlots: modalFieldModeBuffer?.value?.array,
        modalFieldColorSlots: modalFieldColorBuffer?.value?.array,
        modalFieldCount: modalFieldModeCount,
        boundaryMode,
        cavityGeometry: effectiveCavityGeometry,
        radius: descriptorRadius,
      });
      uploadState.spectralLightDescriptorSignature =
        spectralLightDescriptorSignature;
    }
  } else {
    uploadState.spectralLightDescriptorSignature = null;
  }

  runtimeState.currentEffectiveFieldDescriptor = effectiveFieldDescriptor;
  runtimeState.currentSpectralLightDescriptor = spectralLightDescriptor;
  runtimeState.spectralLightBuffersUploaded = spectralLightEnabled;
  setRaymarchCavityGeometry(runtimeState.volumeMesh, effectiveCavityGeometry);
  updateRaymarchEvaluationModes(
    runtimeState,
    renderer,
    {
      modalFieldCapacity,
      schedulerTimeSec: time,
    },
    {
      spectralLightEnabled,
      effectiveFieldDescriptor,
      spectralLightDescriptor,
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
  setIfChanged(
    uniforms.uTotalSlotAmplitude,
    sumModalFieldAmplitude({ modalDescriptor }),
  );
  setIfChanged(
    uniforms.uModalResponseEnergy,
    featureFrame?.modalResponseEnergy ??
      featureFrame?.modalResponseRenderEnergy ??
      featureFrame?.debug?.modalResponseEnergy ??
      0,
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
  syncObservationTransferUniforms(runtimeState);
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

  volumeMesh.visible = renderAuthority;
  idleOverlay.visible = resolveIdleOverlayVisible(
    runtimeState,
    featureFrame,
    renderAuthority,
  );
  publishRaymarchRuntimeAuditSnapshot(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
  );
}

export function disposeRaymarchRuntime(runtimeState) {
  disposeRaymarchEffectiveFieldCache(runtimeState?.effectiveFieldCache);
  disposeRaymarchSpectralLightCache(runtimeState?.spectralLightCache);
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
