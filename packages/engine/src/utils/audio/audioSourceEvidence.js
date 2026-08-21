import { clamp01 } from "../math.js";
import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";

export const AUDIO_SOURCE_EVIDENCE_VERSION = "audio-source-evidence:v1";

/** @typedef {import("../../core/audio/audioSourceSession.js").AudioSourceKind} AudioSourceKind */
/**
 * @typedef {object} AudioSourceEvidenceOptions
 * @property {AudioSourceKind} [sourceKind]
 * @property {{
 *   hasAnalysisSource?: boolean;
 *   isPlaying?: boolean;
 *   isLiveInputActive?: boolean;
 *   lastPlaybackEndReason?: string | null;
 *   naturalRingdownActive?: boolean;
 * } | null} [status]
 * @property {boolean} [hasAnalysisSource]
 * @property {unknown} [analysisSnapshot]
 * @property {boolean} [includeSnapshotAsAnalysisSource]
 * @property {boolean} [isPlaying]
 * @property {boolean} [isLiveInputActive]
 * @property {string | null} [playbackEndReason]
 * @property {boolean} [naturalRingdownActive]
 * @property {boolean} [isAcousticLiveInput]
 * @property {boolean} [isLineFeedLiveInput]
 * @property {boolean} [injectTestTone]
 * @property {boolean} [preparationOnly]
 * @property {boolean} [fileMuted]
 * @property {boolean} [lineFeedProgramActive]
 * @property {boolean} [liveInputHardSilenceActive]
 * @property {Record<string, number | undefined>} [metrics]
 */

const CURRENT_SOURCE_TIME_DOMAIN_PEAK_FLOOR = 1e-4;
const FILE_TIME_DOMAIN_SOURCE_PEAK_FLOOR = 0.004;
const FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX = 0.025;

function readFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hasMetricEvidence(metrics, analysisClass = "none") {
  if (analysisClass === "file") {
    return hasFileMetricEvidence(metrics);
  }

  const timeDomainEvidence =
    readFinite(metrics?.timeDomainPeakAmplitude) >
    CURRENT_SOURCE_TIME_DOMAIN_PEAK_FLOOR;

  return (
    readFinite(metrics?.credibleSpectralPeakCount) > 0 ||
    ((analysisClass === "line-feed" || analysisClass === "acoustic-mic") &&
      timeDomainEvidence)
  );
}

function hasFileMetricEvidence(metrics) {
  if (readFinite(metrics?.credibleSpectralPeakCount) > 0) {
    return true;
  }

  if (
    readFinite(metrics?.timeDomainPeakAmplitude) >
    FILE_TIME_DOMAIN_SOURCE_PEAK_FLOOR
  ) {
    return true;
  }

  const modalObservationPolicy = deriveModalObservationPolicy({
    analysisClass: "file",
    metrics,
  });
  if (modalObservationPolicy.suppressWeakSpectralFallbackDrive) {
    return false;
  }

  return readFinite(metrics?.analyserRms) > FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX;
}

function hasResidualMetricEvidence(metrics) {
  return (
    readFinite(metrics?.analyserRms) > 0 ||
    readFinite(metrics?.fftPeakAmplitude) > 0 ||
    readFinite(metrics?.timeDomainPeakAmplitude) > 0
  );
}

function deriveSourceEnergy(metrics) {
  return clamp01(
    Math.max(
      readFinite(metrics?.analyserRms) * 2.8,
      readFinite(metrics?.timeDomainPeakAmplitude),
    ),
  );
}

function normalizeMetrics(metrics = {}) {
  return {
    avgAmplitude: readFinite(metrics.avgAmplitude),
    analyserRms: readFinite(metrics.analyserRms),
    fftPeakAmplitude: readFinite(metrics.fftPeakAmplitude),
    timeDomainPeakAmplitude: readFinite(metrics.timeDomainPeakAmplitude),
    credibleSpectralPeakCount: Math.max(
      0,
      Math.floor(readFinite(metrics.credibleSpectralPeakCount)),
    ),
    spectralEffectiveBinCount: Math.max(
      0,
      readFinite(metrics.spectralEffectiveBinCount),
    ),
  };
}

function deriveModalObservationPolicy({ analysisClass, metrics }) {
  const fileAnalysis = analysisClass === "file";
  return {
    suppressWeakSpectralFallbackDrive:
      fileAnalysis &&
      metrics.credibleSpectralPeakCount === 0 &&
      metrics.analyserRms < FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX,
  };
}

/** @param {AudioSourceEvidenceOptions} [options] */
export function collectAudioSourceEvidenceInputs({
  sourceKind = AUDIO_SOURCE_KINDS.file,
  status = null,
  hasAnalysisSource = false,
  analysisSnapshot = null,
  includeSnapshotAsAnalysisSource = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
  injectTestTone = false,
  preparationOnly = false,
  fileMuted = false,
  lineFeedProgramActive = true,
  liveInputHardSilenceActive = false,
  metrics = {},
} = {}) {
  const testToneActive = injectTestTone === true;
  return {
    sourceKind,
    hasAnalysisSource:
      hasAnalysisSource === true ||
      status?.hasAnalysisSource === true ||
      (includeSnapshotAsAnalysisSource === true && analysisSnapshot != null) ||
      testToneActive,
    isPlaying: status?.isPlaying === true,
    isLiveInputActive: status?.isLiveInputActive === true,
    playbackEndReason:
      typeof status?.lastPlaybackEndReason === "string"
        ? status.lastPlaybackEndReason
        : null,
    naturalRingdownActive: status?.naturalRingdownActive === true,
    isAcousticLiveInput: isAcousticLiveInput === true,
    isLineFeedLiveInput: isLineFeedLiveInput === true,
    injectTestTone: testToneActive,
    preparationOnly: preparationOnly === true,
    fileMuted: fileMuted === true,
    lineFeedProgramActive: lineFeedProgramActive === true,
    liveInputHardSilenceActive: liveInputHardSilenceActive === true,
    metrics,
  };
}

function closeSourceEvidence(evidence, sourceBoundaryState) {
  return {
    ...evidence,
    sourceBoundaryState,
    currentSourceEvidence: false,
    sourceEnergy: 0,
  };
}

function liveSourceEvidence(evidence, sourceEnergy) {
  return {
    ...evidence,
    sourceBoundaryState: "live",
    currentSourceEvidence: true,
    sourceEnergy: clamp01(sourceEnergy),
  };
}

function preparedSourceEvidence(evidence, sourceEnergy) {
  return {
    ...evidence,
    sourceBoundaryState: "prepared",
    currentSourceEvidence: false,
    sourceEnergy: clamp01(sourceEnergy),
  };
}

function closeRenderBoundary(evidence, renderBoundaryState) {
  return {
    ...evidence,
    rawSourceBoundaryState: evidence.sourceBoundaryState ?? "absent",
    renderBoundaryState,
    sourceBoundaryState: renderBoundaryState,
    currentSourceEvidence: false,
    sourceEnergy: 0,
  };
}

function liveRenderBoundary(evidence, sourceEnergy) {
  return {
    ...evidence,
    rawSourceBoundaryState: evidence.sourceBoundaryState ?? "live",
    renderBoundaryState: "live",
    sourceBoundaryState: "live",
    currentSourceEvidence: true,
    sourceEnergy: clamp01(sourceEnergy),
  };
}

function preparedRenderBoundary(evidence, sourceEnergy) {
  return {
    ...evidence,
    rawSourceBoundaryState: evidence.sourceBoundaryState ?? "prepared",
    renderBoundaryState: "prepared",
    sourceBoundaryState: "prepared",
    currentSourceEvidence: false,
    sourceEnergy: clamp01(sourceEnergy),
  };
}

function resolveAnalysisClass({
  sourceKind,
  injectTestTone = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
}) {
  if (injectTestTone) {
    return "test";
  }
  if (isAcousticLiveInput) {
    return "acoustic-mic";
  }
  if (isLineFeedLiveInput || sourceKind === AUDIO_SOURCE_KINDS.system) {
    return "line-feed";
  }
  if (sourceKind === AUDIO_SOURCE_KINDS.file) {
    return "file";
  }
  return "none";
}

function isTransportPresent({
  hasAnalysisSource,
  playing,
  liveInputActive,
  naturalRingdownActive,
}) {
  return (
    hasAnalysisSource ||
    playing ||
    liveInputActive ||
    naturalRingdownActive
  );
}

/** @param {AudioSourceEvidenceOptions} [options] */
export function buildAudioSourceEvidenceFrame({
  sourceKind = AUDIO_SOURCE_KINDS.file,
  hasAnalysisSource = false,
  isPlaying = false,
  isLiveInputActive = false,
  playbackEndReason = null,
  naturalRingdownActive = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
  injectTestTone = false,
  preparationOnly = false,
  fileMuted = false,
  lineFeedProgramActive = true,
  liveInputHardSilenceActive = false,
  metrics = {},
} = {}) {
  const normalizedMetrics = normalizeMetrics(metrics);
  const analysisClass = resolveAnalysisClass({
    sourceKind,
    injectTestTone,
    isAcousticLiveInput,
    isLineFeedLiveInput,
  });
  const playing = isPlaying === true;
  const liveInputActive = isLiveInputActive === true;
  const preparedFileAnalysis =
    preparationOnly === true &&
    sourceKind === AUDIO_SOURCE_KINDS.file &&
    !playing;
  const fileTransportMuted =
    fileMuted === true ||
    (sourceKind === AUDIO_SOURCE_KINDS.file &&
      !playing &&
      !preparedFileAnalysis &&
      naturalRingdownActive !== true);
  const lineFeedFreshSignal = lineFeedProgramActive === true;
  const lineFeedTransportMuted =
    analysisClass === "line-feed" && !lineFeedFreshSignal;
  const lineFeedProgramBridgeEvidence =
    analysisClass === "line-feed" &&
    lineFeedProgramActive === true &&
    hasResidualMetricEvidence(normalizedMetrics);
  const micHardSilence =
    analysisClass === "acoustic-mic" && liveInputHardSilenceActive === true;
  const transportPresent = isTransportPresent({
    hasAnalysisSource,
    playing,
    liveInputActive,
    naturalRingdownActive: naturalRingdownActive === true,
  }) || preparedFileAnalysis;
  const metricEvidence = hasMetricEvidence(normalizedMetrics, analysisClass);
  const evidence = {
    ownerVersion: AUDIO_SOURCE_EVIDENCE_VERSION,
    sourceKind,
    analysisClass,
    metrics: normalizedMetrics,
    modalObservationPolicy: deriveModalObservationPolicy({
      analysisClass,
      metrics: normalizedMetrics,
    }),
    transport: {
      playing,
      liveInputActive,
      playbackEndReason:
        typeof playbackEndReason === "string" ? playbackEndReason : null,
      naturalRingdownActive: naturalRingdownActive === true,
      preparationOnly: preparedFileAnalysis,
      fileMuted: fileTransportMuted,
      lineFeedProgramActive: lineFeedProgramActive === true,
      micHardSilence,
    },
  };

  if (injectTestTone) {
    return liveSourceEvidence(evidence, 1);
  }

  if (preparedFileAnalysis) {
    return metricEvidence
      ? preparedSourceEvidence(
          evidence,
          deriveSourceEnergy(normalizedMetrics),
        )
      : closeSourceEvidence(evidence, "zero");
  }

  if (!hasAnalysisSource && !transportPresent) {
    return closeSourceEvidence(evidence, "absent");
  }

  if (fileTransportMuted || lineFeedTransportMuted || micHardSilence) {
    return closeSourceEvidence(evidence, "muted");
  }

  if (
    !hasAnalysisSource ||
    (!metricEvidence && !lineFeedProgramBridgeEvidence)
  ) {
    return closeSourceEvidence(evidence, "zero");
  }

  return liveSourceEvidence(evidence, deriveSourceEnergy(normalizedMetrics));
}

export function resolveAudioRenderBoundary({
  sourceEvidence = null,
  modalResponse = null,
} = {}) {
  const evidence =
    sourceEvidence ??
    buildAudioSourceEvidenceFrame({
      sourceKind: AUDIO_SOURCE_KINDS.file,
      hasAnalysisSource: false,
    });
  const sourceBoundaryState = evidence.sourceBoundaryState ?? "absent";

  if (sourceBoundaryState === "absent" || sourceBoundaryState === "muted") {
    return closeRenderBoundary(evidence, sourceBoundaryState);
  }

  if (evidence.analysisClass === "test") {
    return liveRenderBoundary(
      evidence,
      Math.max(1, evidence.sourceEnergy ?? 0),
    );
  }

  if (sourceBoundaryState === "prepared") {
    return preparedRenderBoundary(evidence, evidence.sourceEnergy ?? 0);
  }

  if (sourceBoundaryState === "zero") {
    const retainedModalEnergy = clamp01(
      modalResponse?.modalResponseEnergy ?? 0,
    );
    const resolvedRenderBoundaryState =
      retainedModalEnergy > 0 &&
      evidence.transport?.naturalRingdownActive !== true
        ? "muted"
        : "zero";

    return closeRenderBoundary(evidence, resolvedRenderBoundaryState);
  }

  if (evidence.currentSourceEvidence !== true) {
    return closeRenderBoundary(evidence, "zero");
  }

  return liveRenderBoundary(evidence, clamp01(evidence.sourceEnergy ?? 0));
}
