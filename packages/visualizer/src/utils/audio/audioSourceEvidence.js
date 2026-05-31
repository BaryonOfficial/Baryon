export const AUDIO_SOURCE_EVIDENCE_VERSION = "audio-source-evidence:v1";
const DEFAULT_SOURCE_EVIDENCE_INPUT_FLOOR = 0.00008;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function readFinite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hasMetricEvidence(metrics) {
  return (
    readFinite(metrics?.avgAmplitude) > 0 ||
    readFinite(metrics?.analyserRms) > 0 ||
    readFinite(metrics?.preModalFftPeak) > 0
  );
}

function hasSpectralSignalEvidence(metrics) {
  return (
    readFinite(metrics?.preModalFftPeak) > 0.003 ||
    (readFinite(metrics?.nonZeroFftBinCount) > 0 &&
      readFinite(metrics?.analyserRms) > 0.0005)
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
    nonZeroFftBinCount: Math.max(
      0,
      Math.floor(readFinite(metrics.nonZeroFftBinCount)),
    ),
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

function isTransportPresent({ sourceKind, inputMode, playing, liveInputActive }) {
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
  const metricEvidence = hasMetricEvidence(normalizedMetrics);
  const evidence = {
    ownerVersion: AUDIO_SOURCE_EVIDENCE_VERSION,
    sourceKind,
    analysisClass,
    metrics: normalizedMetrics,
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

  if (!hasAnalysisSource || !metricEvidence) {
    return closeSourceEvidence(evidence, "zero");
  }

  return liveSourceEvidence(evidence, deriveSourceEnergy(normalizedMetrics));
}

export function resolveAudioRenderBoundary({
  sourceEvidence = null,
  modalResponse = null,
  observerContinuity = false,
  inputEnergyFloor = DEFAULT_SOURCE_EVIDENCE_INPUT_FLOOR,
} = {}) {
  const evidence =
    sourceEvidence ??
    buildAudioSourceEvidenceFrame({
      inputMode: "idle",
      hasAnalysisSource: false,
    });
  const sourceBoundaryState = evidence.sourceBoundaryState ?? "absent";

  if (sourceBoundaryState === "absent" || sourceBoundaryState === "muted") {
    return closeSourceEvidence(evidence, sourceBoundaryState);
  }

  if (evidence.sourceKind === "test" || evidence.analysisClass === "test") {
    return liveSourceEvidence(evidence, Math.max(1, evidence.sourceEnergy ?? 0));
  }

  if (sourceBoundaryState === "zero") {
    const retainedModalEnergy = clamp01(
      modalResponse?.modalResponseEnergy ?? 0,
    );
    const resolvedSourceBoundaryState =
      retainedModalEnergy > 0 ? "muted" : "zero";

    return closeSourceEvidence(evidence, resolvedSourceBoundaryState);
  }

  const modalInputEnergy = clamp01(
    modalResponse?.modalResponseInputEnergy ?? 0,
  );
  const currentSourceEvidence =
    evidence.currentSourceEvidence === true ||
    modalInputEnergy >= inputEnergyFloor ||
    observerContinuity === true;
  const resolvedSourceBoundaryState = currentSourceEvidence ? "live" : "zero";

  if (!currentSourceEvidence) {
    return closeSourceEvidence(evidence, resolvedSourceBoundaryState);
  }

  return liveSourceEvidence(
    evidence,
    Math.max(clamp01(evidence.sourceEnergy ?? 0), modalInputEnergy),
  );
}
