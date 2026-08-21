import { sampleFFTAmplitudeForFrequency } from "../../core/modalGeometryBackend.js";
import { clamp01, smoothstep } from "../math.js";
import { measureModalDriveResponse } from "./modalDriveAnalysis.js";
import { deriveResonantSparseEvidence } from "./resonantSparseEvidence.js";
import {
  classifyObservedModeRenderLayer,
  computeModalObservation,
  computeModalObserverNoiseFloor,
  getObservedModeRenderLayer,
} from "./modalObservedScoring.js";
import { deriveObservedModalPhaseState } from "./modalPhaseSlots.js";
import { computeSpectralEffectiveBinCount } from "./spectralEvidence.js";

// This module owns finite-window measurement confidence only. Physical modal
// amplitude and energy remain in modalResponse; field handoff remains in
// modalFieldContinuity.
const SOURCE_COUPLED_OBSERVER_PROFILE = Object.freeze({
  layer: "source-coupled",
  minModeCount: 1,
  minObservationConfidence: 0.0008,
  responseStart: 0.015,
  responseFull: 0.13,
  drivePeakStart: 0.00016,
  drivePeakFull: 0.009,
  snrStart: 1.1,
  snrFull: 4,
  periodicityStart: 0.28,
  periodicityFull: 0.72,
  tonalnessStart: 0.34,
  tonalnessFull: 0.78,
  distributionStart: 0.18,
  distributionFull: 0.58,
  energyGain: 0.34,
  attackWindowScale: 0.75,
  releaseWindowScale: 1.5,
  minObservedDrive: 0.002,
  minObservationCoherence: 0.32,
  sparseEvidenceFloor: 0.08,
});

const RESONANT_OBSERVER_PROFILE = Object.freeze({
  layer: "resonant",
  minModeCount: 2,
  minObservationConfidence: 0.00045,
  responseStart: 0.02,
  responseFull: 0.18,
  drivePeakStart: 0.00018,
  drivePeakFull: 0.006,
  snrStart: 1.25,
  snrFull: 5,
  periodicityStart: 0.36,
  periodicityFull: 0.86,
  tonalnessStart: 0.52,
  tonalnessFull: 0.9,
  distributionStart: 0.12,
  distributionFull: 0.48,
  energyGain: 0.45,
  attackWindowScale: 1,
  releaseWindowScale: 1.5,
  minObservedDrive: 0.0025,
  minObservationCoherence: 0.5,
  minRingSupport: 0.08,
  authorityMinAgeMs: 180,
  sparseEvidenceFloor: 0,
});

const MODAL_OBSERVER_PROFILES = Object.freeze({
  [SOURCE_COUPLED_OBSERVER_PROFILE.layer]: SOURCE_COUPLED_OBSERVER_PROFILE,
  [RESONANT_OBSERVER_PROFILE.layer]: RESONANT_OBSERVER_PROFILE,
});

const OBSERVED_SOURCE_ENVELOPE_ATTACK = 0.34;
const OBSERVED_SOURCE_ENVELOPE_RELEASE = 0.24;
const COHERENT_BACKGROUND_DRIVE_START = 0.00012;
const COHERENT_BACKGROUND_MIN_PERIODICITY = 0.68;
const COHERENT_BACKGROUND_MIN_TONALNESS = 0.58;
const COHERENT_BACKGROUND_MAX_DISTRIBUTION = 0.18;
const BROADBAND_OBSERVATION_MAX_AVERAGE_DRIVE = 0.008;
const DEFAULT_OBSERVATION_WINDOW_MS = (1024 / 48000) * 1000;

export function getModalObserverProfile(layer) {
  const profile = MODAL_OBSERVER_PROFILES[layer];
  if (!profile) {
    throw new RangeError(`Unknown modal observer layer: ${String(layer)}`);
  }
  return profile;
}

function getObservationConfidence(entry) {
  return entry?.observationConfidence ?? 0;
}

function hasObservedModalDrive(entry, profile) {
  return (entry?.observedDrive ?? 0) >= profile.minObservedDrive;
}

function resolveObservationWindowMs(driveBuffer, sampleRate) {
  return driveBuffer instanceof Float32Array &&
    driveBuffer.length > 0 &&
    Number.isFinite(sampleRate) &&
    sampleRate > 0
    ? (driveBuffer.length / sampleRate) * 1000
    : DEFAULT_OBSERVATION_WINDOW_MS;
}

/**
 * Advance estimator confidence, not physical modal energy.
 *
 * The observation is already a finite-window measurement. Its state therefore
 * follows a frame-rate-independent one-pole filter whose time constants are
 * expressed in measurement windows. Q is deliberately absent: oscillator
 * ring-up and residue remain owned by modalResponse.
 */
function advanceObservationConfidence({
  previousConfidence,
  measuredConfidence,
  deltaMs,
  observationWindowMs,
  profile,
  hardSilentFrame,
}) {
  const previous = clamp01(previousConfidence);
  const target = hardSilentFrame ? 0 : clamp01(measuredConfidence);
  const windowScale =
    target >= previous ? profile.attackWindowScale : profile.releaseWindowScale;
  const tauMs = Math.max(1, observationWindowMs * windowScale);
  const memory = Math.exp(-Math.max(0, deltaMs) / tauMs);
  return clamp01(target + (previous - target) * memory);
}

export function updateObservedSourceAmplitude(previous, drivePeak) {
  const target = clamp01(drivePeak);
  const previousAmplitude = Number.isFinite(previous?.sourceAmplitude)
    ? clamp01(previous.sourceAmplitude)
    : target;
  const rate =
    target >= previousAmplitude
      ? OBSERVED_SOURCE_ENVELOPE_ATTACK
      : OBSERVED_SOURCE_ENVELOPE_RELEASE;
  return clamp01(previousAmplitude + (target - previousAmplitude) * rate);
}

export function hasObserverContinuityEvidence({
  drivePeak,
  driveSource,
  periodicity,
  tonalness,
  distributedExcitation,
}) {
  if (
    driveSource === "time-domain" &&
    drivePeak >= COHERENT_BACKGROUND_DRIVE_START &&
    periodicity >= RESONANT_OBSERVER_PROFILE.periodicityStart
  ) {
    return true;
  }

  return (
    drivePeak >= COHERENT_BACKGROUND_DRIVE_START &&
    periodicity >= COHERENT_BACKGROUND_MIN_PERIODICITY &&
    tonalness >= COHERENT_BACKGROUND_MIN_TONALNESS &&
    distributedExcitation <= COHERENT_BACKGROUND_MAX_DISTRIBUTION
  );
}

function createObservedModalModeEntry({
  atlasEntry,
  previous,
  modalDriveResponse,
  observedDrive,
  measuredConfidence,
  observationConfidence,
  localNoiseFloor,
  observedSnr,
  observerCoherence,
  currentFrameAtMs,
  dominantDriveFrequencyHz,
  dominantDriveSpectralSupport,
  allowBassHarmonicDriver,
  hardSilentFrame = false,
}) {
  const profile = getModalObserverProfile(atlasEntry?.layer);
  const existingCoherence = previous?.coherence ?? observerCoherence;
  const coherence =
    observedDrive > 0
      ? clamp01(existingCoherence * 0.72 + observerCoherence * 0.28)
      : clamp01(existingCoherence * 0.96);
  const firstObservedAtMs = previous?.firstObservedAtMs ?? currentFrameAtMs;
  const lastObservedAtMs = hasObservedModalDrive({ observedDrive }, profile)
    ? currentFrameAtMs
    : (previous?.lastObservedAtMs ?? firstObservedAtMs);
  const confidence = clamp01(observationConfidence);
  const renderLayer = classifyObservedModeRenderLayer({
    atlasEntry,
    observedSnr,
    observerCoherence,
    observationConfidence: confidence,
    observedDrive,
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
    allowBassHarmonicDriver,
    resonantMinObservationConfidence:
      RESONANT_OBSERVER_PROFILE.minObservationConfidence,
    sourceCoupledObserverSnrStart: SOURCE_COUPLED_OBSERVER_PROFILE.snrStart,
    sourceCoupledObserverMinObservedDrive:
      SOURCE_COUPLED_OBSERVER_PROFILE.minObservedDrive,
  });
  const phaseState = deriveObservedModalPhaseState({
    layer: atlasEntry?.layer ?? "resonant",
    previous,
    observedPhaseRad: modalDriveResponse?.phase,
    observedDrive,
    observationConfidence: confidence,
    observedSnr,
    observerCoherence,
    currentFrameAtMs,
    observationProfile: profile,
    hardSilentFrame,
  });

  return {
    ...atlasEntry,
    renderLayer,
    observationConfidence: confidence,
    phase: phaseState.phase,
    phaseOffsetRad: phaseState.phaseOffsetRad,
    phaseVelocityRadPerSec: phaseState.phaseVelocityRadPerSec,
    phaseCoherence: phaseState.phaseCoherence,
    phaseAuthority: phaseState.phaseAuthority,
    lastPhaseObservedAtMs: phaseState.lastPhaseObservedAtMs,
    coherence,
    observedDrive,
    measuredConfidence,
    observedSnr,
    localNoiseFloor,
    firstObservedAtMs,
    lastObservedAtMs,
  };
}

function summarizeObservedLayerModes(modes, layer) {
  const profile = getModalObserverProfile(layer);
  let count = 0;
  let observationConfidenceSum = 0;
  let observedDrive = 0;
  let observedSnr = 0;
  let coherence = 0;
  let noiseFloor = 0;
  let phaseAuthority = 0;
  let phaseCoherence = 0;
  let phaseCoherentFieldModeCount = 0;

  for (const entry of modes?.values?.() ?? []) {
    if (getObservedModeRenderLayer(entry) !== layer) {
      continue;
    }
    const observationConfidence = getObservationConfidence(entry);
    if (observationConfidence <= 0) {
      continue;
    }
    count += 1;
    observationConfidenceSum += observationConfidence;
    observedDrive += entry?.observedDrive ?? 0;
    observedSnr += Math.min(entry?.observedSnr ?? 0, profile.snrFull);
    coherence += entry?.coherence ?? 0;
    noiseFloor += entry?.localNoiseFloor ?? 0;
    const entryPhaseAuthority = clamp01(entry?.phaseAuthority ?? 0);
    if (entryPhaseAuthority > 0) {
      phaseCoherentFieldModeCount += 1;
      phaseAuthority += entryPhaseAuthority;
      phaseCoherence += entry?.phaseCoherence ?? 0;
    }
  }

  const averageObservedDrive = count > 0 ? observedDrive / count : 0;
  const averageCoherence = count > 0 ? coherence / count : 0;
  const averageSnr = count > 0 ? observedSnr / count : 0;

  return {
    count,
    confidence: clamp01(observationConfidenceSum),
    observedDrive: clamp01(averageObservedDrive),
    observedSnr: clamp01(averageSnr / profile.snrFull),
    coherence: clamp01(averageCoherence),
    noiseFloor: count > 0 ? clamp01(noiseFloor / count) : 0,
    phaseAuthority: clamp01(phaseAuthority),
    phaseCoherence:
      phaseCoherentFieldModeCount > 0
        ? clamp01(phaseCoherence / phaseCoherentFieldModeCount)
        : 0,
    phaseCoherentFieldModeCount,
  };
}

function summarizeObservedModes(modes) {
  const resonant = summarizeObservedLayerModes(modes, "resonant");
  const sourceCoupled = summarizeObservedLayerModes(modes, "source-coupled");
  const observedModalModeCount = resonant.count + sourceCoupled.count;
  const resonantRingSupport =
    resonant.count >= RESONANT_OBSERVER_PROFILE.minModeCount &&
    resonant.confidence >= RESONANT_OBSERVER_PROFILE.minObservationConfidence
      ? clamp01(
          Math.max(
            RESONANT_OBSERVER_PROFILE.minRingSupport,
            resonant.confidence * 24,
            resonant.observedDrive * 2.2,
          ) *
            smoothstep(
              1,
              RESONANT_OBSERVER_PROFILE.minModeCount,
              resonant.count,
            ) *
            Math.max(0.5, resonant.coherence),
        )
      : 0;

  return {
    observedModalModeCount,
    sourceCoupledObservedModeCount: sourceCoupled.count,
    sourceCoupledObservationConfidence: sourceCoupled.confidence,
    sourceCoupledObservedDrive: sourceCoupled.observedDrive,
    sourceCoupledObservedSnr: sourceCoupled.observedSnr,
    sourceCoupledObservedCoherence: sourceCoupled.coherence,
    sourceCoupledPhaseAuthority: sourceCoupled.phaseAuthority,
    resonantObservedModeCount: resonant.count,
    resonantObservationConfidence: resonant.confidence,
    resonantRingSupport,
    resonantObservedDrive: resonant.observedDrive,
    resonantObservedSnr: resonant.observedSnr,
    resonantObservedCoherence: resonant.coherence,
    resonantObservedNoiseFloor: resonant.noiseFloor,
    resonantPhaseAuthority: resonant.phaseAuthority,
    modalPhaseAuthority: clamp01(
      resonant.phaseAuthority + sourceCoupled.phaseAuthority * 0.45,
    ),
    modalPhaseCoherentFieldModeCount:
      resonant.phaseCoherentFieldModeCount +
      sourceCoupled.phaseCoherentFieldModeCount,
  };
}

function appendResonantSparseEvidence({
  modalObserverMetrics,
  distributedExcitation,
  periodicity,
  fftLinearAmplitudes,
}) {
  return {
    ...modalObserverMetrics,
    ...deriveResonantSparseEvidence({
      resonantObservedSnr: modalObserverMetrics.resonantObservedSnr,
      resonantObservedCoherence: modalObserverMetrics.resonantObservedCoherence,
      resonantObservedDrive: modalObserverMetrics.resonantObservedDrive,
      resonantRingSupport: modalObserverMetrics.resonantRingSupport,
      resonantObservationConfidence:
        modalObserverMetrics.resonantObservationConfidence,
      distributedExcitation,
      periodicity,
      spectralEffectiveBinCount:
        computeSpectralEffectiveBinCount(fftLinearAmplitudes),
      modeCoherence: modalObserverMetrics.resonantObservedCoherence,
    }),
  };
}

function summarizeObservedState(modes, driveAnalysis, fftLinearAmplitudes) {
  return appendResonantSparseEvidence({
    modalObserverMetrics: summarizeObservedModes(modes),
    distributedExcitation: driveAnalysis.distributedExcitation,
    periodicity: driveAnalysis.periodicity,
    fftLinearAmplitudes,
  });
}

export function hasAgedObservedLayerModes({
  modes,
  layer,
  currentFrameAtMs,
  minAgeMs,
}) {
  for (const entry of modes?.values?.() ?? []) {
    if (
      getObservedModeRenderLayer(entry) === layer &&
      currentFrameAtMs - (entry?.firstObservedAtMs ?? currentFrameAtMs) >=
        minAgeMs
    ) {
      return true;
    }
  }
  return false;
}

function pruneObservedModesByLayer(
  modes,
  { sourceCoupledCapacity, resonantCapacity },
) {
  const byLayer = new Map();
  for (const entry of modes?.values?.() ?? []) {
    const layer = getModalObserverProfile(entry?.layer).layer;
    if (!byLayer.has(layer)) {
      byLayer.set(layer, []);
    }
    byLayer.get(layer).push(entry);
  }

  const nextModes = new Map();
  for (const [layer, entries] of byLayer) {
    const requestedCapacity =
      layer === "source-coupled" ? sourceCoupledCapacity : resonantCapacity;
    if (!Number.isFinite(requestedCapacity)) {
      throw new TypeError(
        `Missing modal observer capacity for layer: ${layer}`,
      );
    }
    const capacity = Math.max(0, Math.floor(requestedCapacity));
    for (const entry of entries
      .sort(
        (left, right) =>
          (right.observationConfidence ?? 0) -
          (left.observationConfidence ?? 0),
      )
      .slice(0, capacity)) {
      nextModes.set(entry.modeKey, entry);
    }
  }
  return nextModes;
}

export function advanceObservedModalModes({
  previousModes,
  atlas,
  driveAnalysis,
  fftLinearAmplitudes,
  sampleRate,
  fftSize,
  currentFrameAtMs,
  deltaMs,
  sourceCoupledCapacity,
  resonantCapacity,
  allowBassHarmonicDriver,
  hardSilentFrame,
  suppressWeakSpectralFallbackDrive,
}) {
  const {
    driveBuffer,
    drivePeak,
    driveSource,
    periodicity,
    tonalness,
    distributedExcitation,
    dominantDriveFrequencyHz,
    dominantDriveSpectralSupport,
  } = driveAnalysis;
  const nextModes = new Map();
  const hadPreviousObservedModes = (previousModes?.size ?? 0) > 0;
  const observationWindowMs = resolveObservationWindowMs(
    driveBuffer,
    sampleRate,
  );
  const observationByMode = new Map();

  for (const atlasEntry of atlas) {
    const profile = getModalObserverProfile(atlasEntry.layer);
    const modalDriveResponse = measureModalDriveResponse(
      driveBuffer,
      sampleRate,
      atlasEntry.naturalFrequencyHz,
    );
    const spectralSupport = sampleFFTAmplitudeForFrequency(
      atlasEntry.naturalFrequencyHz,
      fftLinearAmplitudes,
      sampleRate,
      fftSize,
    );
    const localNoiseFloor = computeModalObserverNoiseFloor({
      fftLinearAmplitudes,
      sampleRate,
      frequencyHz: atlasEntry.naturalFrequencyHz,
    });
    const observation = computeModalObservation({
      atlasEntry,
      response: modalDriveResponse,
      spectralSupport,
      localNoiseFloor,
      drivePeak,
      periodicity,
      tonalness,
      distributedExcitation,
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
      driveSource,
      sourceBoundarySuppressWeakSpectralFallbackDrive:
        suppressWeakSpectralFallbackDrive === true,
      profile,
    });
    observationByMode.set(atlasEntry.modeKey, {
      modalDriveResponse,
      spectralSupport,
      observedDrive: observation.observedDrive,
      measuredConfidence: observation.measuredConfidence,
      observerCoherence: observation.observerCoherence,
    });
    const previous = previousModes?.get(atlasEntry.modeKey) ?? null;
    const observationConfidence = advanceObservationConfidence({
      previousConfidence: previous?.observationConfidence ?? 0,
      measuredConfidence: observation.measuredConfidence,
      deltaMs,
      observationWindowMs,
      profile,
      hardSilentFrame,
    });

    if (observationConfidence < profile.minObservationConfidence) {
      continue;
    }

    const entry = createObservedModalModeEntry({
      atlasEntry,
      previous,
      modalDriveResponse,
      observedDrive: observation.observedDrive,
      measuredConfidence: observation.measuredConfidence,
      observationConfidence,
      localNoiseFloor,
      observedSnr: observation.observedSnr,
      observerCoherence: observation.observerCoherence,
      currentFrameAtMs,
      dominantDriveFrequencyHz,
      dominantDriveSpectralSupport,
      allowBassHarmonicDriver,
      hardSilentFrame,
    });
    nextModes.set(entry.modeKey, entry);
  }

  const sortedModes = Array.from(nextModes.values()).sort(
    (left, right) =>
      (right.observationConfidence ?? 0) - (left.observationConfidence ?? 0),
  );
  const observedEntries = sortedModes.filter((entry) =>
    hasObservedModalDrive(entry, getModalObserverProfile(entry.layer)),
  );
  const currentObservationCount = observedEntries.length;
  const averageCurrentObservedDrive =
    currentObservationCount > 0
      ? observedEntries.reduce(
          (total, entry) => total + Math.max(0, entry.observedDrive ?? 0),
          0,
        ) / currentObservationCount
      : 0;
  const broadbandLikeObservation =
    !hadPreviousObservedModes &&
    currentObservationCount >=
      Math.max(1, sourceCoupledCapacity + resonantCapacity) &&
    averageCurrentObservedDrive < BROADBAND_OBSERVATION_MAX_AVERAGE_DRIVE;
  const observedModes = broadbandLikeObservation
    ? new Map()
    : pruneObservedModesByLayer(
        new Map(sortedModes.map((entry) => [entry.modeKey, entry])),
        { sourceCoupledCapacity, resonantCapacity },
      );

  return {
    observedModes,
    summary: summarizeObservedState(
      observedModes,
      driveAnalysis,
      fftLinearAmplitudes,
    ),
    observationByMode,
  };
}
