import * as THREE from "three";
import { REACTIVITY_DEFAULTS } from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
} from "../cavityGeometry.js";
import { buildCanonicalFullModalDescriptor } from "../modalDescriptor.js";
import {
  MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_RESOLUTION,
} from "../modalBudgets.js";
import { getBoundaryModeFromValue } from "../modeFamily.js";
import {
  hasRenderAuthority,
  isRenderAuthorityCut,
} from "../renderAuthorityContract.js";
import {
  buildRaymarchModalBasisCacheDescriptor,
  buildRaymarchSpectralLightCacheDescriptor,
  advanceRaymarchCacheGeneration,
  clearQueuedRaymarchCacheRebuild,
  disposeRaymarchModalBasisCache,
  disposeRaymarchSpectralLightCache,
  enqueueRaymarchModalBasisCacheRebuild,
  enqueueRaymarchSpectralLightCacheRebuild,
  getRaymarchModalBasisCacheDescriptorStaleReason,
  isRaymarchModalBasisCacheReadyForDescriptor,
  isRaymarchSpectralLightCacheReadyForDescriptor,
  resolveRaymarchModalBasisCacheDescriptorBlockedReason,
  resolveRaymarchModalBasisCacheDrawableAuthority,
  shouldRebuildRaymarchSpectralLightCache,
  shouldRebuildRaymarchModalBasisCache,
  spectralLightDescriptorsEqual,
  sumLiveSynthesisRepresentableUploadWeight,
  RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
} from "./fieldCache.js";
import {
  buildRaymarchPhaseSlotSignature,
  copyCanonicalRaymarchPhaseSlots,
} from "./phaseSlotSemantics.js";
import {
  deriveLiveSynthesisCancellationSuppression,
  deriveHolographicColorMix,
  deriveHolographicFresnel,
} from "./fieldShaping.js";
import {
  deriveObservationTransfer,
  deriveObservationTransferParameters,
} from "./observationTransfer.js";
import { deriveRaymarchDiagnosticVisibility } from "./diagnosticVisibility.js";
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
} from "./material.js";
import {
  syncFullscreenVolumeHalfExtents,
  VOLUME_BOUNDS_MODES,
} from "./volumeBounds.js";
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
  cache.activePhaseSampleTimeSec = null;
  cache.pendingPhaseSampleTimeSec = null;
  cache.activeCacheBuiltAtSec = null;
  if (cache.backend === "unavailable") {
    cache.backend = "compute";
    cache.lastError = null;
    cache.lastRebuildReason = null;
  }
  advanceRaymarchCacheGeneration(cache);
  clearQueuedRaymarchCacheRebuild(cache);
}

function resetModalBasisCacheRuntimeDiagnostics(modalBasisCache) {
  if (!modalBasisCache) {
    return;
  }

  modalBasisCache.activeBasisPageModeCount = 0;
  modalBasisCache.modalBasisCachePhaseAuthority = 0;
  modalBasisCache.contributingBasisPageModeCount = 0;
  modalBasisCache.zeroAmplitudeSkippedModeCount = 0;
  modalBasisCache.contributingRawModalEnergy = 0;
  modalBasisCache.bandwidthRejectedModeCount = 0;
  modalBasisCache.bandwidthRejectedRawModalEnergy = 0;
  modalBasisCache.contributingPhaseCurrentModalEnergy = 0;
  modalBasisCache.bandwidthRejectedPhaseCurrentModalEnergy = 0;
  modalBasisCache.liveSynthesisResolvedRawModalEnergyRatio = 1;
  modalBasisCache.liveSynthesisResolvedPhaseCurrentModalEnergyRatio = 1;
  modalBasisCache.liveSynthesisRawGradientEnvelope = 0;
  modalBasisCache.liveSynthesisPhaseCurrentGradientEnvelope = 0;
  modalBasisCache.liveSynthesisUnsignedSupportMean = 0;
  modalBasisCache.liveSynthesisCancellationRatioMean = 0;
  modalBasisCache.liveSynthesisCancellationRatioMax = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSampleCount = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticSupportedSampleCount = 0;
  modalBasisCache.liveSynthesisSupportDiagnosticCoverage = 0;
}

function setModalBasisCacheDrawableAuthority(runtimeState, authority) {
  const normalizedAuthority = authority ?? {
    drawable: false,
    state: "modal-basis-cache-absent",
    blockedReason: "cache-unavailable",
    staleReason: null,
  };
  runtimeState.modalBasisCacheDrawableAuthority = normalizedAuthority;
  const cache = runtimeState.modalBasisCache;
  if (cache) {
    cache.modalBasisCacheDrawable = normalizedAuthority.drawable === true;
    cache.modalBasisCacheDrawableState = normalizedAuthority.state;
    cache.modalBasisCacheDrawableBlockedReason =
      normalizedAuthority.blockedReason ?? null;
    cache.modalBasisCacheDrawableStaleReason =
      normalizedAuthority.staleReason ?? null;
  }
  return normalizedAuthority;
}

function blockModalBasisCacheForDescriptor(modalBasisCache, reason) {
  if (!modalBasisCache) {
    return;
  }

  advanceRaymarchCacheGeneration(modalBasisCache);
  modalBasisCache.ready = false;
  modalBasisCache.rebuildPending = false;
  modalBasisCache.activeDescriptor = null;
  modalBasisCache.pendingDescriptor = null;
  modalBasisCache.activePhaseSampleTimeSec = null;
  modalBasisCache.pendingPhaseSampleTimeSec = null;
  modalBasisCache.activeCacheBuiltAtSec = null;
  clearQueuedRaymarchCacheRebuild(modalBasisCache);
  modalBasisCache.lastError = null;
  modalBasisCache.lastRebuildReason = reason ?? "blocked";
}

function resetRenderAuthorityState(runtimeState) {
  clearBufferNode(runtimeState.modalFieldModeBuffer);
  clearBufferNode(runtimeState.modalFieldColorBuffer);
  clearBufferNode(runtimeState.modalFieldPhaseBuffer);
  runtimeState.performanceGovernor = null;
  runtimeState.pendingRaymarchPerformanceGovernor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.currentModalDescriptor = null;
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  runtimeState.modalBasisCacheDrawableAuthority = null;
  runtimeState.modalSlotByModeKey = new Map();
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.modalBasisCache);
  resetCacheActivity(runtimeState.spectralLightCache);
  resetModalBasisCacheRuntimeDiagnostics(runtimeState.modalBasisCache);
  runtimeState.renderAuthorityResetApplied = true;
}

function readRuntimeFieldNoiseFloor(runtimeState) {
  const modalBasisCache = runtimeState?.modalBasisCache;
  return readFiniteNumber(
    modalBasisCache?.densityNoiseFloor ??
      modalBasisCache?.fieldNoiseFloor ??
      modalBasisCache?.debug?.fieldNoiseFloor,
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
  const uniforms = runtimeState?.uniforms ?? {};
  const opacityGain = uniforms.uOpacityGain?.value;
  const stepCompensation = runtimeState?.bloomTuning?.stepCompensation;
  const contourSharpness = uniforms.uContourSharpness?.value;
  const fieldNoiseFloor = readRuntimeFieldNoiseFloor(runtimeState);
  const inputCache =
    runtimeState.observationTransferInputCache ??
    (runtimeState.observationTransferInputCache = {});

  if (
    runtimeState.observationTransferParameters &&
    inputCache.opacityGain === opacityGain &&
    inputCache.stepCompensation === stepCompensation &&
    inputCache.contourSharpness === contourSharpness &&
    inputCache.fieldNoiseFloor === fieldNoiseFloor
  ) {
    return runtimeState.observationTransferParameters;
  }

  inputCache.opacityGain = opacityGain;
  inputCache.stepCompensation = stepCompensation;
  inputCache.contourSharpness = contourSharpness;
  inputCache.fieldNoiseFloor = fieldNoiseFloor;

  const parameters = deriveObservationTransferParameters({
    opacityGain,
    stepCompensation,
    contourSharpness,
    fieldNoiseFloor,
  });
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

export function sumUploadedModalFieldAmplitude(modeSlots, activeCount) {
  return sumLiveSynthesisRepresentableUploadWeight({
    modalFieldSlots: modeSlots,
    activeCount,
    resolution: RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  });
}

export function resolveRaymarchTotalSlotAmplitude(runtimeState, activeCount) {
  const resolution =
    runtimeState?.modalBasisCache?.resolution ??
    RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION;
  const clampedActiveCount = Math.max(0, Math.floor(activeCount ?? 0));
  const uploadedFromBuffer = sumLiveSynthesisRepresentableUploadWeight({
    modalFieldSlots: runtimeState?.modalFieldModeBuffer?.value?.array,
    activeCount: clampedActiveCount,
    resolution,
  });
  return uploadedFromBuffer;
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

function maxModalFieldAmplitude(modalDescriptor, activeCount = null) {
  const slots = modalDescriptor?.slotViews?.modalFieldSlots;
  const count = Math.min(
    Number.isFinite(activeCount) && activeCount > 0
      ? Math.floor(activeCount)
      : (modalDescriptor?.counts?.modalFieldModeCount ?? 0),
    Math.floor((slots?.length ?? 0) / 4),
  );
  let max = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
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

function resolveProductBasisAtlasPageCapacity(runtimeState) {
  return Math.max(
    1,
    Math.round(
      runtimeState.modalBasisCache?.basisCapacity ??
        MODAL_BASIS_ATLAS_PAGE_CAPACITY,
    ),
  );
}

function buildRuntimeModalDescriptor(
  runtimeState,
  featureFrame,
  { modalFieldCapacity },
) {
  const sourceDescriptor = featureFrame?.modalDescriptor ?? null;
  const slotViews = sourceDescriptor?.slotViews ?? {};
  const basisAtlasPageCapacity =
    resolveProductBasisAtlasPageCapacity(runtimeState);
  if (slotViews.modalFieldSlots) {
    if (
      sourceDescriptor?.diagnostics?.basisAtlasPageCapacity ===
      basisAtlasPageCapacity
    ) {
      return sourceDescriptor;
    }
  }

  if (!runtimeState.modalSlotByModeKey) {
    runtimeState.modalSlotByModeKey = new Map();
  }

  return buildCanonicalFullModalDescriptor({
    generation:
      sourceDescriptor?.generation ??
      runtimeState.modalDescriptorGeneration ??
      0,
    maxTotalModes: modalFieldCapacity,
    basisAtlasPageCapacity,
    basisCacheResolution:
      runtimeState.modalBasisCache?.resolution ?? MODAL_BASIS_CACHE_RESOLUTION,
    stableSlotByModeKey: runtimeState.modalSlotByModeKey,
    modalFieldSlots: featureFrame?.modalFieldSlots,
    modalFieldPhaseSlots: featureFrame?.modalFieldPhaseSlots,
    modalFieldColorSlots: featureFrame?.modalFieldColorSlots,
    modalFieldMetadataSlots: featureFrame?.modalFieldMetadataSlots,
    activeModalFieldModeCount:
      sourceDescriptor?.counts?.validModeCount ?? featureFrame?.activeModeCount,
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
  runtimeState.performanceGovernor = null;
  runtimeState.pendingRaymarchPerformanceGovernor = null;
  runtimeState.spectralLightBuffersUploaded = false;
  runtimeState.modalBasisPhaseAuthorityModeCount = 0;
  runtimeState.currentModalBasisCacheDescriptor = null;
  runtimeState.currentSpectralLightDescriptor = null;
  resetRaymarchUploadState(runtimeState);
  resetCacheActivity(runtimeState.modalBasisCache);
  resetCacheActivity(runtimeState.spectralLightCache);
  resetModalBasisCacheRuntimeDiagnostics(runtimeState.modalBasisCache);
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
    if (runtimeState.auditEnabled) {
      publishAuditSnapshot(runtimeState.debugSnapshot);
    }
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
  const activeModeCount =
    runtimeState.uniforms.uModalFieldModeCount?.value ??
    runtimeState.uniforms.uActiveModeCount?.value ??
    0;
  const peakModalFieldAmplitude = maxModalFieldAmplitude(
    modalDescriptor,
    activeModeCount,
  );
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
  const totalSlotAmplitude = resolveRaymarchTotalSlotAmplitude(
    runtimeState,
    activeModeCount,
  );
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
  const rawDiagnosticDensity = Math.min(
    1,
    avgAmplitude * densityGain * absorption * (0.75 + transientEnergy * 0.2),
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
  const modalBasisCache = runtimeState.modalBasisCache ?? null;
  const spectralLightCache = runtimeState.spectralLightCache ?? null;
  const modalBasisCacheDescriptor =
    runtimeState.currentModalBasisCacheDescriptor ?? null;
  const spectralLightDescriptor =
    runtimeState.currentSpectralLightDescriptor ?? null;
  const modalBasisCacheDiagnosticDescriptor =
    modalBasisCache?.ready && modalBasisCache?.activeDescriptor
      ? modalBasisCache.activeDescriptor
      : modalBasisCacheDescriptor;
  const modalBasisCacheDescriptorFresh =
    isRaymarchModalBasisCacheReadyForDescriptor(
      modalBasisCache,
      modalBasisCacheDescriptor,
    );
  const modalBasisCacheDescriptorStaleReason =
    getRaymarchModalBasisCacheDescriptorStaleReason({
      descriptorFresh: modalBasisCacheDescriptorFresh,
      rebuildPending: modalBasisCache?.rebuildPending,
      queuedDescriptor: modalBasisCache?.queuedDescriptor,
      activeDescriptor: modalBasisCache?.activeDescriptor,
      nextDescriptor: modalBasisCacheDescriptor,
    });
  const modalBasisCacheQueuedDescriptorAgeMs =
    modalBasisCache?.queuedDescriptor &&
    Number.isFinite(modalBasisCache?.queuedDescriptorAtSec)
      ? Math.max(
          0,
          ((runtimeState.uniforms.uTime?.value ?? 0) -
            modalBasisCache.queuedDescriptorAtSec) *
            1000,
        )
      : null;
  const modalBasisCacheAgeMs =
    Number.isFinite(modalBasisCache?.activeCacheBuiltAtSec) &&
    Number.isFinite(runtimeState.uniforms.uTime?.value)
      ? Math.max(
          0,
          ((runtimeState.uniforms.uTime?.value ?? 0) -
            modalBasisCache.activeCacheBuiltAtSec) *
            1000,
        )
      : null;
  const modalBasisCacheModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingBasisPageModeCount ??
      modalBasisCache?.activeBasisPageModeCount,
    0,
  );
  const modalBasisPhaseAuthorityModeCount = readFiniteNumber(
    modalBasisCacheDescriptor?.phaseModeCount ??
      runtimeState.modalBasisPhaseAuthorityModeCount,
    0,
  );
  const modalBasisCacheSemantic =
    modalBasisCache?.semantic ?? "modal-basis-cache";
  const modalBasisCacheSupportSemantic = "coefficient-invariant-basis-support";
  const modalBasisCacheSupportReady = Boolean(modalBasisCache?.ready);
  const modalBasisCachePhaseAuthority = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.phaseAuthority ??
      modalBasisCache?.modalBasisCachePhaseAuthority,
    0,
  );
  const modalBasisCacheMaxRepresentableModeIndex = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.modalBasisCacheMaxRepresentableModeIndex ??
      modalBasisCache?.modalBasisCacheMaxRepresentableModeIndex,
    0,
  );
  const modalBasisCacheContributingModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingBasisPageModeCount ??
      modalBasisCache?.contributingBasisPageModeCount,
    0,
  );
  const modalBasisCacheZeroAmplitudeSkippedModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.zeroAmplitudeSkippedModeCount ??
      modalBasisCache?.zeroAmplitudeSkippedModeCount,
    0,
  );
  const modalBasisCacheContributingRawModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingRawModalEnergy ??
      modalBasisCache?.contributingRawModalEnergy,
    0,
  );
  const modalBasisCacheBandwidthRejectedModeCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedModeCount ??
      modalBasisCache?.bandwidthRejectedModeCount,
    0,
  );
  const modalBasisCacheBandwidthRejectedRawModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedRawModalEnergy ??
      modalBasisCache?.bandwidthRejectedRawModalEnergy,
    0,
  );
  const modalBasisCacheContributingPhaseCurrentModalEnergy = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.contributingPhaseCurrentModalEnergy ??
      modalBasisCache?.contributingPhaseCurrentModalEnergy,
    0,
  );
  const modalBasisCacheBandwidthRejectedPhaseCurrentModalEnergy =
    readFiniteNumber(
      modalBasisCacheDiagnosticDescriptor?.bandwidthRejectedPhaseCurrentModalEnergy ??
        modalBasisCache?.bandwidthRejectedPhaseCurrentModalEnergy,
      0,
    );
  const liveSynthesisResolvedRawModalEnergyRatio = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisResolvedRawModalEnergyRatio ??
      modalBasisCache?.liveSynthesisResolvedRawModalEnergyRatio,
    1,
  );
  const liveSynthesisResolvedPhaseCurrentModalEnergyRatio = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisResolvedPhaseCurrentModalEnergyRatio ??
      modalBasisCache?.liveSynthesisResolvedPhaseCurrentModalEnergyRatio,
    1,
  );
  const liveSynthesisRawGradientEnvelope = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisRawGradientEnvelope ??
      modalBasisCache?.liveSynthesisRawGradientEnvelope,
    0,
  );
  const liveSynthesisPhaseCurrentGradientEnvelope = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisPhaseCurrentGradientEnvelope ??
      modalBasisCache?.liveSynthesisPhaseCurrentGradientEnvelope,
    0,
  );
  const liveSynthesisUnsignedSupportMean = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisUnsignedSupportMean ??
      modalBasisCache?.liveSynthesisUnsignedSupportMean,
    0,
  );
  const liveSynthesisCancellationRatioMean = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisCancellationRatioMean ??
      modalBasisCache?.liveSynthesisCancellationRatioMean,
    0,
  );
  const liveSynthesisCancellationRatioMax = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisCancellationRatioMax ??
      modalBasisCache?.liveSynthesisCancellationRatioMax,
    0,
  );
  const liveSynthesisSupportDiagnosticSampleCount = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisSupportDiagnosticSampleCount ??
      modalBasisCache?.liveSynthesisSupportDiagnosticSampleCount,
    0,
  );
  const modalBasisCacheSupportedSampleCount =
    modalBasisCache?.liveSynthesisSupportDiagnosticSupportedSampleCount;
  const modalBasisCacheDescriptorSupportedSampleCount =
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisSupportDiagnosticSupportedSampleCount;
  const liveSynthesisSupportDiagnosticSupportedSampleCount = readFiniteNumber(
    modalBasisCacheDescriptorSupportedSampleCount ??
      modalBasisCacheSupportedSampleCount,
    0,
  );
  const liveSynthesisSupportDiagnosticCoverage = readFiniteNumber(
    modalBasisCacheDiagnosticDescriptor?.liveSynthesisSupportDiagnosticCoverage ??
      modalBasisCache?.liveSynthesisSupportDiagnosticCoverage,
    0,
  );
  const hasLiveSynthesisSupportMetrics =
    renderAuthority &&
    liveSynthesisSupportDiagnosticSampleCount > 0 &&
    liveSynthesisSupportDiagnosticCoverage > 0;
  const sampledObservationAnchor = hasLiveSynthesisSupportMetrics
    ? clamp01(liveSynthesisUnsignedSupportMean)
    : 0;
  const sampledObservationSignedAuthority = hasLiveSynthesisSupportMetrics
    ? deriveLiveSynthesisCancellationSuppression({
        effectiveCancellationRatio: liveSynthesisCancellationRatioMean,
        effectiveUnsignedSupport: sampledObservationAnchor,
      })
    : 0;
  const sampledObservationTransferDebug = deriveObservationTransfer({
    density: 0,
    modalStructureAnchor: sampledObservationAnchor,
    ridgeAnchor: sampledObservationAnchor,
    signedRadianceAuthority: sampledObservationSignedAuthority,
    modalCoefficientEnergy,
    modalResponseEnergy,
    parameters: observationParameters,
  });
  const diagnosticUsesSampledSupport = hasLiveSynthesisSupportMetrics;
  const diagnosticObservationAnchor = diagnosticUsesSampledSupport
    ? sampledObservationAnchor
    : observationTransferDebug.observationAnchor;
  const diagnosticSignedRadianceAuthority = diagnosticUsesSampledSupport
    ? sampledObservationSignedAuthority
    : 1;
  const diagnosticVisibility = deriveRaymarchDiagnosticVisibility({
    rawDensityEstimate: rawDiagnosticDensity,
    observationAnchor: diagnosticObservationAnchor,
    ridgeAnchor: diagnosticObservationAnchor,
    signedRadianceAuthority: diagnosticSignedRadianceAuthority,
    modalCoefficientEnergy,
    modalResponseEnergy,
    opacityGain,
    stepBudget,
    spectralFlux,
    parameters: observationParameters,
  });
  const avgDensity = diagnosticVisibility.avgDensity;
  const avgOpacity = diagnosticVisibility.avgOpacity;
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
  const modalBasisCacheDrawableAuthority =
    runtimeState.modalBasisCacheDrawableAuthority ??
    resolveRaymarchModalBasisCacheDrawableAuthority(
      modalBasisCache,
      modalBasisCacheDescriptor,
    );
  const modalBasisCacheDrawable =
    modalBasisCacheDrawableAuthority.drawable === true;
  const spectralLightCacheDescriptorFresh =
    isRaymarchSpectralLightCacheReadyForDescriptor(
      spectralLightCache,
      spectralLightDescriptor,
    );
  const renderedModalField = summarizeRenderedLayer(
    runtimeState.modalFieldModeBuffer?.value?.array,
    runtimeState.modalFieldColorBuffer?.value?.array,
    activeModeCount,
  );

  return {
    fieldState,
    renderAuthority,
    volumeBounds: runtimeState.volumeBounds ?? VOLUME_BOUNDS_MODES.sphere,
    modeSlotCount: activeModeCount,
    originalModeSlotCount:
      performanceGovernor?.originalModeCount ?? activeModeCount,
    uploadedModeSlotCount:
      performanceGovernor?.uploadedModeCount ?? activeModeCount,
    modalFieldModeCount: activeModeCount,
    renderedModalFieldModeCount: renderedModalField.count,
    renderedModalFieldColorWeightMax: renderedModalField.colorWeightMax,
    renderedModalFieldAmplitudeTotal: renderedModalField.amplitudeTotal,
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
      modalDescriptor?.diagnostics?.phaseAuthorityModeCount ??
      modalBasisPhaseAuthorityModeCount,
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
    peakModalFieldAmplitude,
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
    observationReferenceAnchor: observationTransferDebug.observationAnchor,
    observationReferenceSupport: observationTransferDebug.observationSupport,
    observationReferenceDensityFloor:
      observationTransferDebug.observedDensityFloor,
    observationReferenceContourSupport:
      observationTransferDebug.observedContourSupport,
    observationSampledAnchor: sampledObservationTransferDebug.observationAnchor,
    observationSampledSignedAuthority: sampledObservationSignedAuthority,
    observationSampledSupport:
      sampledObservationTransferDebug.observationSupport,
    observationSampledDensityFloor:
      sampledObservationTransferDebug.observedDensityFloor,
    observationSampledContourSupport:
      sampledObservationTransferDebug.observedContourSupport,
    observationDensityFadeStart: observationParameters.densityFadeStart,
    observationDensityFadeEnd: observationParameters.densityFadeEnd,
    observationTransferGain: observationParameters.transferGain,
    observationDensityFloor: observationParameters.densityFloor,
    observationContourSupportScale: observationParameters.contourSupportScale,
    observationExposureScale: observationParameters.exposureScale,
    observationFieldNoiseFloor: observationParameters.fieldNoiseFloor,
    observationHardSilence,
    modalPhaseAuthority,
    projectionEnergyBudgetSourceCoupled:
      featureFrame?.debug?.projectionEnergyBudgetSourceCoupled ?? 0,
    projectionEnergyBudgetResonant:
      featureFrame?.debug?.projectionEnergyBudgetResonant ?? 0,
    projectionEnergyUsedSourceCoupled:
      featureFrame?.debug?.projectionEnergyUsedSourceCoupled ?? 0,
    projectionEnergyUsedResonant:
      featureFrame?.debug?.projectionEnergyUsedResonant ?? 0,
    projectionRawEnergySourceCoupled:
      featureFrame?.debug?.projectionRawEnergySourceCoupled ?? 0,
    projectionRawEnergyResonant:
      featureFrame?.debug?.projectionRawEnergyResonant ?? 0,
    projectionAllocatedEnergySourceCoupled:
      featureFrame?.debug?.projectionAllocatedEnergySourceCoupled ?? 0,
    projectionAllocatedEnergyResonant:
      featureFrame?.debug?.projectionAllocatedEnergyResonant ?? 0,
    projectionEnergyScaleSourceCoupled:
      featureFrame?.debug?.projectionEnergyScaleSourceCoupled ?? 0,
    projectionEnergyScaleResonant:
      featureFrame?.debug?.projectionEnergyScaleResonant ?? 0,
    projectionOverlapPressureSourceCoupled:
      featureFrame?.debug?.projectionOverlapPressureSourceCoupled ?? 0,
    projectionOverlapPressureResonant:
      featureFrame?.debug?.projectionOverlapPressureResonant ?? 0,
    projectionCompetitionReduction:
      featureFrame?.debug?.projectionCompetitionReduction ?? 0,
    projectionLoad: featureFrame?.debug?.projectionLoad ?? 0,
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
    spectralLightEvaluationMode:
      runtimeState.volumeMesh?.userData?.raymarchSpectralLightEvaluationMode ??
      spectralLightCache?.mode ??
      RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
    modalBasisCacheActive: modalBasisCache?.active ?? false,
    modalBasisCacheResolution:
      modalBasisCache?.resolution ?? RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
    modalBasisCacheRebuildCount: modalBasisCache?.rebuildCount ?? 0,
    modalBasisCacheRebuildReason:
      modalBasisCache?.lastRebuildReason ?? "uninitialized",
    modalBasisCacheGeneration: modalBasisCache?.generation ?? 0,
    modalBasisCacheMode: modalBasisCache?.mode ?? "off",
    modalBasisCacheAgeMs,
    modalBasisCacheDiagnosticReason:
      modalBasisCacheDescriptorStaleReason ??
      modalBasisCache?.lastRebuildReason ??
      "uninitialized",
    modalBasisAtlasDepth:
      modalBasisCache?.basisAtlasDepth ??
      modalBasisCacheDescriptor?.basisAtlasDepth ??
      0,
    liveSynthesisModeCount:
      modalBasisCache?.liveSynthesisModeCount ??
      modalBasisCacheDescriptor?.liveSynthesisModeCount ??
      0,
    liveModalFrameAgeMs: null,
    modalBasisCacheDescriptorFresh,
    modalBasisCacheDescriptorStaleReason,
    modalBasisCacheQueuedDescriptorPending: Boolean(
      modalBasisCache?.queuedDescriptor,
    ),
    modalBasisCacheQueuedDescriptorAgeMs,
    modalBasisCacheBackend: modalBasisCache?.backend ?? "compute",
    modalBasisCacheReady: modalBasisCache?.ready ?? false,
    modalBasisCacheRebuildPending: modalBasisCache?.rebuildPending ?? false,
    modalBasisCacheFailedClosed: !modalBasisCacheDrawable,
    modalBasisCacheLastError: modalBasisCache?.lastError ?? null,
    modalBasisCacheDrawable,
    modalBasisCacheDrawableState:
      modalBasisCacheDrawableAuthority.state ?? "modal-basis-cache-absent",
    modalBasisCacheDrawableBlockedReason:
      modalBasisCacheDrawableAuthority.blockedReason ?? null,
    modalBasisCacheDrawableStaleReason:
      modalBasisCacheDrawableAuthority.staleReason ?? null,
    modalBasisCacheModeCount,
    modalBasisCacheSemantic,
    modalBasisCacheSupportReady,
    modalBasisCacheSupportSemantic,
    modalBasisCachePhaseAuthority,
    modalBasisCacheModeIdentityRetentionRatio:
      modalBasisCache?.modeIdentityRetentionRatio ??
      modalBasisCacheDescriptor?.modeIdentityRetentionRatio ??
      1,
    modalBasisCacheMaxRepresentableModeIndex,
    modalBasisCacheContributingModeCount,
    modalBasisCacheZeroAmplitudeSkippedModeCount,
    modalBasisCacheContributingRawModalEnergy,
    modalBasisCacheBandwidthRejectedModeCount,
    modalBasisCacheBandwidthRejectedRawModalEnergy,
    modalBasisCacheContributingPhaseCurrentModalEnergy,
    modalBasisCacheBandwidthRejectedPhaseCurrentModalEnergy,
    liveSynthesisResolvedRawModalEnergyRatio,
    liveSynthesisResolvedPhaseCurrentModalEnergyRatio,
    liveSynthesisRawGradientEnvelope,
    liveSynthesisPhaseCurrentGradientEnvelope,
    liveSynthesisUnsignedSupportMean,
    liveSynthesisCancellationRatioMean,
    liveSynthesisCancellationRatioMax,
    liveSynthesisSupportDiagnosticSampleCount,
    liveSynthesisSupportDiagnosticSupportedSampleCount,
    liveSynthesisSupportDiagnosticCoverage,
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
  const uploadedModeCount = Math.max(
    0,
    Math.round(runtimeState?.uniforms?.uModalFieldModeCount?.value ?? 0),
  );
  const uploadedSlotAmplitude = resolveRaymarchTotalSlotAmplitude(
    runtimeState,
    uploadedModeCount,
  );
  const modalResponseEnergy = clamp01(
    Math.max(
      featureFrame?.modalResponseEnergy ??
        featureFrame?.modalResponseRenderEnergy ??
        featureFrame?.debug?.modalResponseEnergy ??
        0,
      uploadedSlotAmplitude,
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
  const bloomResponseSignal = clamp01(
    responseEnvelope * 0.44 +
      accentEnvelope * 0.22 +
      gatedStructureSignal * 0.2 +
      gatedModalResponseEnergy * 0.08,
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
  uniforms.uContourSharpness.value = clamp(baseContourSharpness, 1, 8);
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
    if (
      includeColors &&
      colorBufferNode?.value &&
      (colorChanged || modeChanged)
    ) {
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

function updateModalBasisCache(
  runtimeState,
  renderer,
  { modalFieldCapacity, schedulerTimeSec = null },
  { modalBasisCacheDescriptor },
) {
  const modalBasisCache = runtimeState.modalBasisCache;
  if (!runtimeState.volumeMesh) {
    setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return "unavailable";
  }

  if (!modalBasisCache) {
    setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return "unavailable";
  }

  modalBasisCache.active = true;
  modalBasisCache.mode = "modal-basis-cached";

  const descriptorBlockedReason =
    resolveRaymarchModalBasisCacheDescriptorBlockedReason(
      modalBasisCacheDescriptor,
    );
  if (descriptorBlockedReason) {
    blockModalBasisCacheForDescriptor(modalBasisCache, descriptorBlockedReason);
    const authority = setModalBasisCacheDrawableAuthority(
      runtimeState,
      resolveRaymarchModalBasisCacheDrawableAuthority(
        modalBasisCache,
        modalBasisCacheDescriptor,
      ),
    );
    return authority.drawable ? "modal-basis-cached" : "unavailable";
  }

  const { needsRebuild, reason } = shouldRebuildRaymarchModalBasisCache(
    modalBasisCache,
    modalBasisCacheDescriptor,
  );

  if (needsRebuild) {
    enqueueRaymarchModalBasisCacheRebuild(
      modalBasisCache,
      renderer,
      modalBasisCacheDescriptor,
      reason,
      {
        modalFieldModeBuffer: runtimeState.modalFieldModeBuffer,
        modalFieldPhaseBuffer: runtimeState.modalFieldPhaseBuffer,
        modalFieldCapacity,
        uniforms: runtimeState.uniforms,
        schedulerTimeSec,
      },
    );
  }

  const authority = setModalBasisCacheDrawableAuthority(
    runtimeState,
    resolveRaymarchModalBasisCacheDrawableAuthority(
      modalBasisCache,
      modalBasisCacheDescriptor,
    ),
  );

  if (authority.drawable) {
    return "modal-basis-cached";
  }
  return "unavailable";
}

function deactivateSpectralLightCacheEvaluation(
  spectralLightCache,
  spectralLightEvaluationMode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off,
) {
  resetCacheActivity(spectralLightCache);
  spectralLightCache.mode = spectralLightEvaluationMode;
  return spectralLightEvaluationMode;
}

function resolveRenderableSpectralLightCacheEvaluation(spectralLightCache) {
  if (spectralLightCache?.ready && spectralLightCache?.activeDescriptor) {
    spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.cached;
  }
  spectralLightCache.mode = RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
}

function resolveSpectralLightEvaluationMode(
  runtimeState,
  renderer,
  { modalFieldCapacity },
  { spectralLightEnabled, spectralLightDescriptor },
) {
  const spectralLightCache = runtimeState.spectralLightCache;
  if (!spectralLightCache) {
    return RAYMARCH_SPECTRAL_LIGHT_EVALUATION_MODES.off;
  }

  if (!spectralLightEnabled) {
    return deactivateSpectralLightCacheEvaluation(spectralLightCache);
  }

  if (spectralLightCache.backend === "unavailable") {
    return deactivateSpectralLightCacheEvaluation(spectralLightCache);
  }

  spectralLightCache.active = true;

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
      if (spectralLightCache.backend === "unavailable") {
        return deactivateSpectralLightCacheEvaluation(spectralLightCache);
      }
    }
  }

  return resolveRenderableSpectralLightCacheEvaluation(spectralLightCache);
}

function updateRaymarchEvaluationModes(
  runtimeState,
  renderer,
  capacities,
  { spectralLightEnabled, modalBasisCacheDescriptor, spectralLightDescriptor },
) {
  if (!runtimeState.volumeMesh) {
    return;
  }

  updateModalBasisCache(runtimeState, renderer, capacities, {
    modalBasisCacheDescriptor,
  });

  const spectralLightEvaluationMode = resolveSpectralLightEvaluationMode(
    runtimeState,
    renderer,
    capacities,
    {
      spectralLightEnabled,
      spectralLightDescriptor,
    },
  );
  setRaymarchSpectralLightEvaluationMode(
    runtimeState.volumeMesh,
    spectralLightEvaluationMode,
  );
}

function applyRaymarchRuntimeUploadAuthority({
  runtimeState,
  featureFrame,
  renderer,
  time,
  uniforms,
  volumeMesh,
  modalDescriptor,
  modalFieldCapacity,
  modalFieldPhaseCapacity,
  modalFieldModeBuffer,
  modalFieldColorBuffer,
  modalFieldPhaseBuffer,
  spectralLightEnabled,
  effectiveCavityGeometry,
}) {
  const descriptorSlots = modalDescriptor.slotViews;
  const requestedStepBudget = resolveRequestedRaymarchStepBudget(
    runtimeState,
    volumeMesh,
  );
  const requestedRenderScale = 1;
  const productBasisAtlasPageCapacity =
    resolveProductBasisAtlasPageCapacity(runtimeState);
  const productUploadCapacity = Math.min(
    modalFieldCapacity,
    productBasisAtlasPageCapacity,
  );
  const performanceGovernor =
    takePendingRaymarchPerformanceGovernor(runtimeState, featureFrame, {
      modalFieldCapacity: productUploadCapacity,
      cavityGeometry: effectiveCavityGeometry,
      requestedStepBudget,
      requestedRenderScale,
    }) ??
    buildRaymarchPerformanceGovernor({
      modalFieldSlots: descriptorSlots.modalFieldSlots,
      modalFieldCapacity: productUploadCapacity,
      featureFrame,
      cavityGeometry: effectiveCavityGeometry,
      requestedStepBudget,
      requestedRenderScale,
    });
  const modalFieldLayer = performanceGovernor.modalField;
  runtimeState.performanceGovernor = performanceGovernor;

  const uploadState = getRaymarchUploadState(runtimeState);
  applyLayerUploadIfChanged({
    uploadState,
    key: "modalField",
    slots: descriptorSlots.modalFieldSlots,
    colorSlots: descriptorSlots.modalFieldColorSlots,
    targetSlots: modalFieldModeBuffer.value.array,
    targetColorSlots: modalFieldColorBuffer.value.array,
    modeBufferNode: modalFieldModeBuffer,
    colorBufferNode: modalFieldColorBuffer,
    layer: modalFieldLayer,
    includeColors: spectralLightEnabled,
  });

  const modalFieldPhaseAuthorityModeCount = applyLayerPhaseUploadIfChanged({
    uploadState,
    key: "modalFieldPhase",
    phaseSlots: descriptorSlots.modalFieldPhaseSlots,
    targetPhaseSlots: modalFieldPhaseBuffer?.value?.array ?? null,
    phaseBufferNode: modalFieldPhaseBuffer,
    layer: modalFieldLayer,
    capacity: Math.min(modalFieldPhaseCapacity, productUploadCapacity),
  });
  runtimeState.modalBasisPhaseAuthorityModeCount =
    modalFieldPhaseAuthorityModeCount;

  const modalFieldModeCount = modalFieldLayer.uploadedActiveCount;
  setIfChanged(uniforms.uModalFieldModeCount, modalFieldModeCount);
  setIfChanged(uniforms.uActiveModeCount, modalFieldModeCount);
  setIfChanged(
    uniforms.uTotalSlotAmplitude,
    resolveRaymarchTotalSlotAmplitude(runtimeState, modalFieldModeCount),
  );

  const boundaryMode = getRuntimeBoundaryMode(runtimeState);
  const descriptorRadius = runtimeState.uniforms.uRadius?.value ?? 1;
  const modalBasisCacheDescriptor = buildRaymarchModalBasisCacheDescriptor({
    modalFieldSlots: modalFieldModeBuffer?.value?.array,
    modalFieldPhaseSlots: modalFieldPhaseBuffer?.value?.array,
    modalFieldCount: modalFieldModeCount,
    boundaryMode,
    cavityGeometry: effectiveCavityGeometry,
    radius: descriptorRadius,
    time,
    phaseModeCount: runtimeState.modalBasisPhaseAuthorityModeCount,
    phaseAuthority: featureFrame?.modalPhaseAuthority ?? 0,
    descriptorOverflow: modalDescriptor.diagnostics.descriptorOverflow,
    modeIdentityRetentionRatio:
      modalDescriptor.diagnostics.modeIdentityRetentionRatio,
    resolution:
      runtimeState.modalBasisCache?.resolution ??
      RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
    basisCapacity: runtimeState.modalBasisCache?.basisCapacity,
    basisPacking: runtimeState.modalBasisCache?.basisPacking,
  });

  let spectralLightDescriptor = null;
  if (spectralLightEnabled) {
    const nextSpectralLightDescriptor =
      buildRaymarchSpectralLightCacheDescriptor({
        modalFieldSlots: modalFieldModeBuffer?.value?.array,
        modalFieldColorSlots: modalFieldColorBuffer?.value?.array,
        modalFieldCount: modalFieldModeCount,
        boundaryMode,
        cavityGeometry: effectiveCavityGeometry,
        radius: descriptorRadius,
      });
    spectralLightDescriptor = spectralLightDescriptorsEqual(
      runtimeState.currentSpectralLightDescriptor,
      nextSpectralLightDescriptor,
    )
      ? runtimeState.currentSpectralLightDescriptor
      : nextSpectralLightDescriptor;
  }

  runtimeState.currentModalBasisCacheDescriptor = modalBasisCacheDescriptor;
  runtimeState.currentSpectralLightDescriptor = spectralLightDescriptor;
  runtimeState.spectralLightBuffersUploaded = spectralLightEnabled;
  const normalizedCavityGeometry = normalizeCavityGeometry(
    effectiveCavityGeometry,
  );
  if (
    runtimeState.volumeMesh?.userData?.raymarchCavityGeometry !==
    normalizedCavityGeometry
  ) {
    setRaymarchCavityGeometry(
      runtimeState.volumeMesh,
      normalizedCavityGeometry,
    );
  }
  updateRaymarchEvaluationModes(
    runtimeState,
    renderer,
    {
      modalFieldCapacity,
      schedulerTimeSec: time,
    },
    {
      spectralLightEnabled,
      modalBasisCacheDescriptor,
      spectralLightDescriptor,
    },
  );
}

export function tickRaymarchRuntime(
  runtimeState,
  featureFrame,
  time,
  deltaTime,
  renderer = null,
) {
  const { uniforms, volumeMesh, idleOverlay } = runtimeState;
  if (runtimeState.volumeBounds === VOLUME_BOUNDS_MODES.fullscreenBox) {
    syncFullscreenVolumeHalfExtents(runtimeState, renderer);
  }
  const modalFieldModeBuffer = runtimeState.modalFieldModeBuffer;
  const modalFieldColorBuffer = runtimeState.modalFieldColorBuffer;
  const modalFieldPhaseBuffer = runtimeState.modalFieldPhaseBuffer;
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
  if (!renderAuthority) {
    updateReactiveResponse(
      runtimeState,
      featureFrame,
      fieldState,
      renderAuthority,
      deltaTime,
    );
  }
  setIfChanged(
    uniforms.uFieldState,
    runtimeState.fieldStateValues[fieldState] ??
      runtimeState.fieldStateValues.idle,
  );

  if (!renderAuthority) {
    if (runtimeState.renderAuthorityResetApplied !== true) {
      resetRenderAuthorityState(runtimeState);
    }
    setIfChanged(uniforms.uModalFieldModeCount, 0);
    setIfChanged(uniforms.uActiveModeCount, 0);
    setIfChanged(uniforms.uAverageAmplitude, 0);
    setIfChanged(uniforms.uTransientEnergy, 0);
    setIfChanged(uniforms.uSpectralCentroid, 0);
    setIfChanged(uniforms.uSpectralFlux, 0);
    setIfChanged(uniforms.uStructureSignal, 0);
    setIfChanged(uniforms.uEnergySignal, 0);
    setIfChanged(uniforms.uChangeSignal, 0);
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
    const idleBandEnergies = uniforms.uBandEnergies.value;
    if (
      idleBandEnergies.x !== 0 ||
      idleBandEnergies.y !== 0 ||
      idleBandEnergies.z !== 0 ||
      idleBandEnergies.w !== 0
    ) {
      idleBandEnergies.set(0, 0, 0, 0);
    }
    const idleDensityGain =
      runtimeState.baseDensityGain ?? uniforms.uDensityGain.value;
    setIfChanged(uniforms.uDensityGain, idleDensityGain);
    setIfChanged(
      uniforms.uDensityAbsorption,
      idleDensityGain * uniforms.uAbsorption.value,
    );
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
  runtimeState.renderAuthorityResetApplied = false;

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
  applyRaymarchRuntimeUploadAuthority({
    runtimeState,
    featureFrame,
    renderer,
    time,
    uniforms,
    volumeMesh,
    modalDescriptor,
    modalFieldCapacity,
    modalFieldPhaseCapacity,
    modalFieldModeBuffer,
    modalFieldColorBuffer,
    modalFieldPhaseBuffer,
    spectralLightEnabled,
    effectiveCavityGeometry,
  });
  updateReactiveResponse(
    runtimeState,
    featureFrame,
    fieldState,
    renderAuthority,
    deltaTime,
  );
  setIfChanged(uniforms.uAverageAmplitude, featureFrame?.averageAmplitude ?? 0);
  setIfChanged(uniforms.uTransientEnergy, featureFrame?.transientEnergy ?? 0);
  setIfChanged(uniforms.uSpectralCentroid, featureFrame?.spectralCentroid ?? 0);
  setIfChanged(uniforms.uSpectralFlux, featureFrame?.spectralFlux ?? 0);
  setIfChanged(uniforms.uStructureSignal, featureFrame?.structureSignal ?? 0);
  setIfChanged(uniforms.uEnergySignal, featureFrame?.energySignal ?? 0);
  setIfChanged(uniforms.uChangeSignal, featureFrame?.changeSignal ?? 0);
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
  const activeModalFieldModeCount =
    uniforms.uModalFieldModeCount?.value ??
    uniforms.uActiveModeCount?.value ??
    0;
  setIfChanged(
    uniforms.uTotalSlotAmplitude,
    resolveRaymarchTotalSlotAmplitude(runtimeState, activeModalFieldModeCount),
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
  const nextDensityGain =
    (runtimeState.baseDensityGain ?? uniforms.uDensityGain.value) *
    (1 + (runtimeState.scaleSignal ?? 0) * DENSITY_RESPONSE_AMOUNT);
  setIfChanged(uniforms.uDensityGain, nextDensityGain);
  setIfChanged(
    uniforms.uDensityAbsorption,
    nextDensityGain * uniforms.uAbsorption.value,
  );
  const bandEnergies = featureFrame?.bandEnergies ?? EMPTY_BAND_ENERGIES;
  const bandEnergyValues = uniforms.uBandEnergies.value;
  const nextBandEnergy0 = bandEnergies[0] ?? 0;
  const nextBandEnergy1 = bandEnergies[1] ?? 0;
  const nextBandEnergy2 = bandEnergies[2] ?? 0;
  const nextBandEnergy3 = bandEnergies[3] ?? 0;
  if (
    bandEnergyValues.x !== nextBandEnergy0 ||
    bandEnergyValues.y !== nextBandEnergy1 ||
    bandEnergyValues.z !== nextBandEnergy2 ||
    bandEnergyValues.w !== nextBandEnergy3
  ) {
    bandEnergyValues.set(
      nextBandEnergy0,
      nextBandEnergy1,
      nextBandEnergy2,
      nextBandEnergy3,
    );
  }

  const modalBasisCacheDrawable =
    runtimeState.modalBasisCacheDrawableAuthority?.drawable === true;
  volumeMesh.visible = renderAuthority && modalBasisCacheDrawable;
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
  disposeRaymarchModalBasisCache(runtimeState?.modalBasisCache);
  disposeRaymarchSpectralLightCache(runtimeState?.spectralLightCache);
  runtimeState?.points?.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materialCache = child.userData?.raymarchMaterialCache;
    if (materialCache) {
      Object.values(materialCache).forEach((boundaryMaterials) => {
        Object.values(boundaryMaterials).forEach((material) => {
          material?.dispose?.();
        });
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
