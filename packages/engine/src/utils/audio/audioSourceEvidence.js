import { clamp01 } from "../math.js";

export const AUDIO_SOURCE_EVIDENCE_VERSION = "audio-source-evidence:v1";

const CURRENT_SOURCE_AVG_FLOOR = 0.02;
const CURRENT_SOURCE_TIME_DOMAIN_PEAK_FLOOR = 1e-4;
const SPECTRAL_SIGNAL_PEAK_FLOOR = 0.003;
const SPECTRAL_SIGNAL_RMS_FLOOR = 0.0005;
const FILE_TIME_DOMAIN_SOURCE_PEAK_FLOOR = 0.001;
const FILE_TIME_DOMAIN_SOURCE_AVG_FLOOR = 0.1;
const FILE_WEAK_SPECTRAL_FALLBACK_AVG_MAX = 10;
const FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX = 0.025;
const FILE_WEAK_RESONANT_AVG_MIN = 5;
const FILE_WEAK_RESONANT_AVG_MAX = 10;
const FILE_WEAK_RESONANT_RMS_MAX = 0.03;

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
    hasSpectralSignalEvidence(metrics) ||
    readFinite(metrics?.avgAmplitude) > CURRENT_SOURCE_AVG_FLOOR ||
    ((analysisClass === "line-feed" || analysisClass === "acoustic-mic") &&
      timeDomainEvidence)
  );
}

function hasFileMetricEvidence(metrics) {
  if (hasSpectralSignalEvidence(metrics)) {
    return true;
  }

  if (
    readFinite(metrics?.timeDomainPeakAmplitude) >
      FILE_TIME_DOMAIN_SOURCE_PEAK_FLOOR &&
    readFinite(metrics?.avgAmplitude) > FILE_TIME_DOMAIN_SOURCE_AVG_FLOOR
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

  return (
    readFinite(metrics?.avgAmplitude) > CURRENT_SOURCE_AVG_FLOOR ||
    readFinite(metrics?.analyserRms) > FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX
  );
}

function hasResidualMetricEvidence(metrics) {
  return (
    readFinite(metrics?.avgAmplitude) > 0 ||
    readFinite(metrics?.analyserRms) > 0 ||
    readFinite(metrics?.preModalFftPeak) > 0 ||
    readFinite(metrics?.timeDomainPeakAmplitude) > 0
  );
}

function hasSpectralSignalEvidence(metrics) {
  return (
    readFinite(metrics?.preModalFftPeak) > SPECTRAL_SIGNAL_PEAK_FLOOR ||
    (readFinite(metrics?.nonZeroFftBinCount) > 0 &&
      readFinite(metrics?.analyserRms) > SPECTRAL_SIGNAL_RMS_FLOOR)
  );
}

function deriveSourceEnergy(metrics) {
  return clamp01(
    Math.max(
      readFinite(metrics?.analyserRms) * 2.8,
      readFinite(metrics?.avgAmplitude) / 96,
      readFinite(metrics?.preModalFftPeak),
    ),
  );
}

function normalizeMetrics(metrics = {}) {
  return {
    avgAmplitude: readFinite(metrics.avgAmplitude),
    analyserRms: readFinite(metrics.analyserRms),
    preModalFftPeak: readFinite(metrics.preModalFftPeak),
    timeDomainPeakAmplitude: readFinite(metrics.timeDomainPeakAmplitude),
    nonZeroFftBinCount: Math.max(
      0,
      Math.floor(readFinite(metrics.nonZeroFftBinCount)),
    ),
  };
}

function deriveModalObservationPolicy({ analysisClass, metrics }) {
  const fileAnalysis = analysisClass === "file";
  return {
    suppressWeakSpectralFallbackDrive:
      fileAnalysis &&
      metrics.avgAmplitude < FILE_WEAK_SPECTRAL_FALLBACK_AVG_MAX &&
      metrics.analyserRms < FILE_WEAK_SPECTRAL_FALLBACK_RMS_MAX,
    suppressWeakResonantDrive:
      fileAnalysis &&
      metrics.avgAmplitude >= FILE_WEAK_RESONANT_AVG_MIN &&
      metrics.avgAmplitude < FILE_WEAK_RESONANT_AVG_MAX &&
      metrics.analyserRms < FILE_WEAK_RESONANT_RMS_MAX,
  };
}

export function collectAudioSourceEvidenceInputs({
  inputMode = "idle",
  status = null,
  hasAnalysisSource = false,
  analysisSnapshot = null,
  includeSnapshotAsAnalysisSource = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
  injectTestTone = false,
  fileMuted = false,
  lineFeedProgramActive = true,
  liveInputHardSilenceActive = false,
  metrics = {},
} = {}) {
  const testToneActive = injectTestTone === true;
  return {
    inputMode,
    hasAnalysisSource:
      hasAnalysisSource === true ||
      status?.hasAnalysisSource === true ||
      (includeSnapshotAsAnalysisSource === true && analysisSnapshot != null) ||
      testToneActive,
    isPlaying: status?.isPlaying === true,
    isLiveInputActive: status?.isLiveInputActive === true,
    isAcousticLiveInput: isAcousticLiveInput === true,
    isLineFeedLiveInput: isLineFeedLiveInput === true,
    injectTestTone: testToneActive,
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

function resolveSourceKind({
  inputMode = "idle",
  injectTestTone = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
}) {
  if (injectTestTone) {
    return "test";
  }
  if (isAcousticLiveInput || inputMode === "mic") {
    return "mic";
  }
  if (inputMode === "system" || isLineFeedLiveInput) {
    return "system";
  }
  if (inputMode === "file") {
    return "file";
  }
  return "none";
}

function resolveAnalysisClass({
  sourceKind,
  injectTestTone = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
}) {
  if (injectTestTone || sourceKind === "test") {
    return "test";
  }
  if (isLineFeedLiveInput || sourceKind === "system") {
    return "line-feed";
  }
  if (isAcousticLiveInput || sourceKind === "mic") {
    return "acoustic-mic";
  }
  if (sourceKind === "file") {
    return "file";
  }
  return "none";
}

function isTransportPresent({
  sourceKind,
  inputMode,
  playing,
  liveInputActive,
}) {
  return (
    sourceKind !== "none" ||
    inputMode === "file" ||
    inputMode === "live" ||
    inputMode === "system" ||
    playing ||
    liveInputActive
  );
}

export function buildAudioSourceEvidenceFrame({
  inputMode = "idle",
  hasAnalysisSource = false,
  isPlaying = false,
  isLiveInputActive = false,
  isAcousticLiveInput = false,
  isLineFeedLiveInput = false,
  injectTestTone = false,
  fileMuted = false,
  lineFeedProgramActive = true,
  liveInputHardSilenceActive = false,
  metrics = {},
} = {}) {
  const normalizedMetrics = normalizeMetrics(metrics);
  const sourceKind = resolveSourceKind({
    inputMode,
    injectTestTone,
    isAcousticLiveInput,
    isLineFeedLiveInput,
  });
  const analysisClass = resolveAnalysisClass({
    sourceKind,
    injectTestTone,
    isAcousticLiveInput,
    isLineFeedLiveInput,
  });
  const playing = isPlaying === true;
  const liveInputActive = isLiveInputActive === true;
  const fileTransportMuted =
    fileMuted === true ||
    (sourceKind === "file" && inputMode === "file" && !playing);
  const lineFeedFreshSignal =
    lineFeedProgramActive === true ||
    hasSpectralSignalEvidence(normalizedMetrics);
  const lineFeedTransportMuted =
    analysisClass === "line-feed" && !lineFeedFreshSignal;
  const lineFeedProgramBridgeEvidence =
    analysisClass === "line-feed" &&
    lineFeedProgramActive === true &&
    hasResidualMetricEvidence(normalizedMetrics);
  const micHardSilence =
    sourceKind === "mic" &&
    liveInputHardSilenceActive === true &&
    !hasSpectralSignalEvidence(normalizedMetrics);
  const transportPresent = isTransportPresent({
    sourceKind,
    inputMode,
    playing,
    liveInputActive,
  });
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
      fileMuted: fileTransportMuted,
      lineFeedProgramActive: lineFeedProgramActive === true,
      micHardSilence,
    },
  };

  if (injectTestTone) {
    return liveSourceEvidence(evidence, 1);
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
      inputMode: "idle",
      hasAnalysisSource: false,
    });
  const sourceBoundaryState = evidence.sourceBoundaryState ?? "absent";

  if (sourceBoundaryState === "absent" || sourceBoundaryState === "muted") {
    return closeRenderBoundary(evidence, sourceBoundaryState);
  }

  if (evidence.sourceKind === "test" || evidence.analysisClass === "test") {
    return liveRenderBoundary(
      evidence,
      Math.max(1, evidence.sourceEnergy ?? 0),
    );
  }

  if (sourceBoundaryState === "zero") {
    const retainedModalEnergy = clamp01(
      modalResponse?.modalResponseEnergy ?? 0,
    );
    const resolvedRenderBoundaryState =
      retainedModalEnergy > 0 ? "muted" : "zero";

    return closeRenderBoundary(evidence, resolvedRenderBoundaryState);
  }

  if (evidence.currentSourceEvidence !== true) {
    return closeRenderBoundary(evidence, "zero");
  }

  return liveRenderBoundary(evidence, clamp01(evidence.sourceEnergy ?? 0));
}
