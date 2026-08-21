import {
  AUDIT_DEFAULTS,
  CAVITY_ACOUSTIC_DEFAULTS,
  DEFAULT_FFT_SIZE,
  DEFAULT_SAMPLE_RATE,
  SIMULATION_DEFAULTS,
} from "../../defaults.js";
import {
  DEFAULT_EFFECTIVE_CAVITY_GEOMETRY,
  DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  normalizeCavityGeometry,
  resolveEffectiveCavityGeometry,
} from "../../core/cavityGeometry.js";
import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisSettings,
  normalizeResolvedLiveInputAnalysisClass,
} from "../../core/audio/liveInputAnalysis.js";
import {
  isAcousticLiveInputDeviceKind,
  isLoopbackLiveInputDeviceKind,
  normalizeLiveInputDeviceKind,
} from "../../core/audio/inputDeviceSemantics.js";
import {
  AUDIO_SOURCE_KINDS,
  isPreparedFileAwaitingPlayback,
} from "../../core/audio/audioSourceSession.js";
import { buildAnalysisSessionKey } from "./analysisSession.js";
import { resolveFrameDeltaMs } from "./analysisTiming.js";
import {
  buildAudioSourceEvidenceFrame,
  collectAudioSourceEvidenceInputs,
} from "./audioSourceEvidence.js";
import { projectWaterAcousticDrive } from "./waterAcousticNonlinearity.js";
import { buildSilentAudioFeatureFrame } from "./audioFeatureSilence.js";
import { resolveAudioFeatureFrameTimeMs } from "./audioFeatureSignals.js";
import {
  applyTestToneToSnapshot,
  resolveAudioTestToneSignal,
} from "./audioFeatureTestTone.js";
import { binIndexToFrequencyHz } from "./binFrequency.js";
import {
  resetLineFeedProgramActivityState,
  resolveLineFeedProgramActivity,
} from "./lineFeedProgramActivity.js";
import {
  EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
  computeLiveInputMetrics,
  resetLiveInputGateState,
  resolveLiveInputNoiseGate,
} from "./liveInputNoiseGate.js";
import {
  SPECTRAL_EVIDENCE_POLICY,
  computeSpectralEffectiveBinCount,
  findCredibleSpectralPeaks,
} from "./spectralEvidence.js";

/** @typedef {import("../../core/cavityGeometry.js").CavityGeometry} CavityGeometry */

const BASIC_FFT_CREDIBLE_PEAK_LIMIT = 4;

function resolvePreparedLiveInputAnalysisClass(
  sourceKind,
  liveInputDeviceKind,
  status,
  settings,
) {
  const resolvedFromStatus = normalizeResolvedLiveInputAnalysisClass(
    status?.resolvedLiveInputAnalysisClass,
  );
  if (sourceKind !== AUDIO_SOURCE_KINDS.system) {
    return resolvedFromStatus;
  }
  if (isLoopbackLiveInputDeviceKind(liveInputDeviceKind)) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }

  return normalizeResolvedLiveInputAnalysisClass(
    status?.resolvedLiveInputAnalysisClass ??
      settings?.analysisClass ??
      DEFAULT_RESOLVED_LIVE_INPUT_ANALYSIS_CLASS,
  );
}

function resolvePreparedLiveInputPolicy({
  resolvedLiveInputAnalysisClass,
  settings,
}) {
  if (resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed) {
    return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  }

  return normalizeLiveInputAcousticIntent(settings?.acousticIntent);
}

function computeBasicFftSummary(fftLinearAmplitudes, sampleRate) {
  const summary = {
    peakMagnitude: 0,
    crediblePeakCount: 0,
    spectralEffectiveBinCount: 0,
    spectralCentroid: 0,
  };
  if (!fftLinearAmplitudes?.length) return summary;

  const nyquist = sampleRate ? sampleRate * 0.5 : 0;
  let weightedFrequency = 0;
  let powerTotal = 0;
  for (let i = 0; i < fftLinearAmplitudes.length; i += 1) {
    const amplitude = fftLinearAmplitudes[i] ?? 0;
    if (amplitude > summary.peakMagnitude) {
      summary.peakMagnitude = amplitude;
    }
    if (amplitude > 0 && sampleRate) {
      const frequency = binIndexToFrequencyHz(
        i,
        fftLinearAmplitudes.length,
        sampleRate,
      );
      const power = amplitude * amplitude;
      weightedFrequency += frequency * power;
      powerTotal += power;
    }
  }
  summary.spectralEffectiveBinCount =
    computeSpectralEffectiveBinCount(fftLinearAmplitudes);
  summary.crediblePeakCount = findCredibleSpectralPeaks(
    fftLinearAmplitudes,
    sampleRate,
    BASIC_FFT_CREDIBLE_PEAK_LIMIT,
  ).length;

  if (powerTotal > Number.EPSILON) {
    summary.spectralCentroid = Math.min(
      1,
      weightedFrequency / powerTotal / Math.max(1, nyquist),
    );
  }

  return summary;
}

function computeTimeDataPeakAmplitude(timeData) {
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return 0;
  }

  let peak = 0;
  for (let index = 0; index < timeData.length; index += 1) {
    peak = Math.max(peak, Math.abs(timeData[index] ?? 0));
  }
  return peak;
}

function buildAnalysisInputsSignature({
  sourceKind,
  analysisInputMode,
  requestedCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_REQUESTED_CAVITY_GEOMETRY
  ),
  effectiveCavityGeometry = /** @type {CavityGeometry} */ (
    DEFAULT_EFFECTIVE_CAVITY_GEOMETRY
  ),
  liveInputDeviceKind,
  resolvedLiveInputAnalysisClass,
  calibrationVersion,
  resolvedAuditSettings,
  liveInputNoiseGateActive,
  liveInputHardSilenceActive,
  liveInputCalibrationInvalid,
  liveInputCalibrationInvalidReason,
  sourceMode,
}) {
  return JSON.stringify({
    sourceKind,
    analysisInputMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    calibrationVersion,
    injectTestTone: Boolean(resolvedAuditSettings?.injectTestTone),
    testToneHz:
      resolvedAuditSettings?.injectTestTone === true
        ? resolvedAuditSettings.testToneHz
        : null,
    testToneSignal: resolveAudioTestToneSignal(
      resolvedAuditSettings?.testToneSignal,
    ),
    freezeModeSlots: Boolean(resolvedAuditSettings?.freezeModeSlots),
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    sourceMode,
  });
}

function shouldMuteFileTransportSource({
  sourceKind,
  status,
  auditSettings,
  preparedFileAnalysis,
}) {
  return (
    sourceKind === AUDIO_SOURCE_KINDS.file &&
    preparedFileAnalysis !== true &&
    status?.isPlaying !== true &&
    status?.naturalRingdownActive !== true &&
    auditSettings?.injectTestTone !== true
  );
}

function buildMutedAnalysisSnapshot(snapshot, fftSize) {
  const safeFftSize =
    Number.isFinite(fftSize) && fftSize > 0 ? fftSize : DEFAULT_FFT_SIZE;
  return {
    ...(snapshot ?? {}),
    sourceMode: "silent",
    avgAmplitude: 0,
    rms: 0,
    fftLinearAmplitudes: new Float32Array(safeFftSize / 2),
    timeData: new Float32Array(safeFftSize),
  };
}

function resolvePreparedSourceMode({
  sourceKind,
  isAcousticLiveInput,
  isLineFeedLiveInput,
  injectTestTone,
}) {
  if (injectTestTone) return "test";
  if (isAcousticLiveInput) return "mic";
  if (isLineFeedLiveInput) return LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  return sourceKind === AUDIO_SOURCE_KINDS.file ? "file" : "silent";
}

function resolvePreparedInputClassification({
  status,
  liveInputAnalysisSettings,
  injectTestTone,
}) {
  const sourceSession = status?.sourceSession;
  const sourceKind =
    sourceSession?.kind === AUDIO_SOURCE_KINDS.system
      ? AUDIO_SOURCE_KINDS.system
      : AUDIO_SOURCE_KINDS.file;
  const {
    liveInputCalibrationVersion: calibrationVersion = 0,
    liveInputAcousticIntent: statusAcousticIntent,
    isPlaying = false,
    isLiveInputActive = false,
  } = status ?? {};
  const rawLiveInputDeviceKind =
    sourceSession?.systemCapture?.deviceKind ?? null;
  const liveInputDeviceKind =
    rawLiveInputDeviceKind == null
      ? null
      : normalizeLiveInputDeviceKind(rawLiveInputDeviceKind);
  const resolvedLiveInputAnalysisClass = resolvePreparedLiveInputAnalysisClass(
    sourceKind,
    liveInputDeviceKind,
    status,
    liveInputAnalysisSettings,
  );
  const isLineFeedLiveInput =
    sourceKind === AUDIO_SOURCE_KINDS.system &&
    isLiveInputActive === true &&
    resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed;
  const isAcousticLiveInput =
    sourceKind === AUDIO_SOURCE_KINDS.system &&
    isLiveInputActive === true &&
    isAcousticLiveInputDeviceKind(liveInputDeviceKind) &&
    resolvedLiveInputAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.acousticMic;
  const resolvedLiveInputAnalysisSettings = normalizeLiveInputAnalysisSettings({
    acousticIntent: statusAcousticIntent,
    ...liveInputAnalysisSettings,
  });
  const liveInputPolicy = resolvePreparedLiveInputPolicy({
    resolvedLiveInputAnalysisClass,
    settings: resolvedLiveInputAnalysisSettings,
  });
  return {
    sourceKind,
    analysisInputMode: isAcousticLiveInput ? "live" : "file",
    calibrationVersion,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    resolvedLiveInputAnalysisSettings,
    isLineFeedLiveInput,
    isAcousticLiveInput,
    isLiveInputActive: isLiveInputActive === true,
    soundActive: Boolean(
      sourceKind === AUDIO_SOURCE_KINDS.file
        ? isPlaying
        : isLineFeedLiveInput && isLiveInputActive,
    ),
    micActive: Boolean(isLiveInputActive && isAcousticLiveInput),
    liveInputPolicy,
    liveInputAcousticIntent:
      liveInputPolicy === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
        ? DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT
        : normalizeLiveInputAcousticIntent(liveInputPolicy),
    sourceMode: resolvePreparedSourceMode({
      sourceKind,
      isAcousticLiveInput,
      isLineFeedLiveInput,
      injectTestTone,
    }),
  };
}

function resolvePreparedSnapshot({
  analysisSnapshot,
  auditSettings,
  fftSize,
  sampleRate,
  fileTransportSourceMuted,
  sourceMode,
}) {
  const rawSnapshot = auditSettings.injectTestTone
    ? applyTestToneToSnapshot({
        analysisSnapshot,
        auditSettings,
        fftSize,
        sampleRate,
      })
    : analysisSnapshot;
  return {
    rawSnapshot,
    snapshot: fileTransportSourceMuted
      ? buildMutedAnalysisSnapshot(rawSnapshot, fftSize)
      : rawSnapshot,
    sourceMode: fileTransportSourceMuted ? "silent" : sourceMode,
  };
}

function readSnapshotMetrics(snapshot, fftSize, sampleRate) {
  const avgAmplitude = snapshot?.avgAmplitude ?? 0;
  const analyserRms = snapshot?.rms ?? 0;
  const timeDomainPeakAmplitude = computeTimeDataPeakAmplitude(
    snapshot?.timeData,
  );
  const fftLinearAmplitudesSource =
    snapshot?.fftLinearAmplitudes ?? new Float32Array(fftSize / 2);
  const fftSummary = computeBasicFftSummary(
    fftLinearAmplitudesSource,
    sampleRate,
  );
  return {
    avgAmplitude,
    analyserRms,
    timeDomainPeakAmplitude,
    fftLinearAmplitudesSource,
    fftSummary,
    fftPeakAmplitude: fftSummary.peakMagnitude,
    spectralCentroidHint: fftSummary.spectralCentroid,
  };
}

function resolvePreparedLiveInputGate({
  isAcousticLiveInput,
  analysisMemory,
  auditSettings,
  inputMode,
  metrics,
  sampleRate,
  currentFrameAtMs,
  calibrationVersion,
  liveInputAnalysisSettings,
  liveInputPolicy,
}) {
  if (isAcousticLiveInput) {
    const gate = resolveLiveInputNoiseGate({
      analysisMemory,
      injectTestTone: auditSettings.injectTestTone,
      inputMode,
      rms: metrics.analyserRms,
      fftLinearAmplitudes: metrics.fftLinearAmplitudesSource,
      sampleRate,
      timeDomainPeakAmplitude: metrics.timeDomainPeakAmplitude,
      spectralCentroidHint: metrics.spectralCentroidHint,
      currentFrameAtMs,
      calibrationVersion,
      liveInputAnalysisSettings,
    });
    return {
      ...gate,
      gateDiagnostics:
        gate.gateDiagnostics ?? EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
    };
  }

  resetLiveInputGateState(analysisMemory.bandState, {
    inputMode,
    policy: liveInputPolicy,
    calibrationVersion,
  });
  return {
    active: false,
    hardSilence: false,
    invalid: false,
    invalidReason: "none",
    gateDiagnostics: EMPTY_LIVE_INPUT_GATE_DIAGNOSTICS,
  };
}

function buildLineFeedMetrics(isLineFeedLiveInput, metrics, sampleRate) {
  if (!isLineFeedLiveInput) return null;
  return {
    ...computeLiveInputMetrics({
      rms: metrics.analyserRms,
      fftLinearAmplitudes: metrics.fftLinearAmplitudesSource,
      sampleRate,
      timeDomainPeakAmplitude: metrics.timeDomainPeakAmplitude,
      spectralCentroid: metrics.spectralCentroidHint,
    }),
    avgAmplitude: metrics.avgAmplitude,
    timeDomainPeakAmplitude: metrics.timeDomainPeakAmplitude,
    credibleSpectralPeakCount: metrics.fftSummary.crediblePeakCount,
    transportSpectrumSilent:
      metrics.fftSummary.spectralEffectiveBinCount === 0 &&
      metrics.fftPeakAmplitude <=
        SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor,
  };
}

function resolvePreparedLineFeedActivity({
  isLineFeedLiveInput,
  bandState,
  metrics,
  currentFrameAtMs,
  injectTestTone,
  analysisSessionKey,
}) {
  if (isLineFeedLiveInput) {
    const activity = resolveLineFeedProgramActivity({
      bandState,
      metrics,
      deltaMs: resolveFrameDeltaMs(
        bandState.lineFeedProgramPreviousFrameAtMs ?? 0,
        currentFrameAtMs,
      ),
      currentFrameAtMs,
      enabled: !injectTestTone,
      analysisSessionKey,
    });
    return {
      ...activity,
      programActive: activity.programActive === true,
      programExcitation: activity.programExcitation ?? 0,
      deviceFloorRms: activity.deviceFloorRms ?? 0,
    };
  }

  resetLineFeedProgramActivityState(bandState, analysisSessionKey);
  return {
    programActive: true,
    programExcitation: 1,
    deviceFloorRms: 0,
    quietHoldMs: 0,
  };
}

function resolvePreparationContext({
  featureState,
  analysisMemory,
  status,
  auditSettings,
  cavityGeometry,
  frameTimeMs,
}) {
  const auditState = featureState.audit;
  const resolvedAuditSettings = auditSettings ??
    auditState?.settings ?? {
      ...AUDIT_DEFAULTS,
    };
  const requestedCavityGeometry = normalizeCavityGeometry(cavityGeometry);
  return {
    auditState,
    resolvedAuditSettings,
    sampleRate: status?.sampleRate ?? DEFAULT_SAMPLE_RATE,
    fftSize: status?.fftSize ?? DEFAULT_FFT_SIZE,
    currentFrameAtMs: resolveAudioFeatureFrameTimeMs(frameTimeMs),
    requestedCavityGeometry,
    effectiveCavityGeometry: resolveEffectiveCavityGeometry(
      requestedCavityGeometry,
    ),
    currentFrame: (analysisMemory.frameId ?? 0) + 1,
    analysisSessionKey: buildAnalysisSessionKey(status),
  };
}

export function prepareAudioFeatureFrameInputs({
  analysisSnapshot,
  featureState,
  radius,
  cavityAcousticScale = CAVITY_ACOUSTIC_DEFAULTS,
  boundaryMode = SIMULATION_DEFAULTS.boundaryMode,
  cavityGeometry = DEFAULT_REQUESTED_CAVITY_GEOMETRY,
  status,
  auditSettings = undefined,
  beatSettings = undefined,
  frameTimeMs = undefined,
  liveInputAnalysisSettings = undefined,
}) {
  if (!featureState?.analysis) {
    throw new TypeError(
      "prepareAudioFeatureFrameInputs requires an audio feature state",
    );
  }
  const capacity = featureState.capacity;
  const analysisMemory = featureState.analysis;
  const {
    candidateForcingSlots,
    candidateResponseSlots,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    modeSlots,
    signalModeSlots,
    sourceCoupledSpectralMoment,
    resonantSpectralMoment,
    modalFieldSpectralSeedDirection,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroSourceCoupledTargetSlots,
    zeroResonantTargetSlots,
    nonAcousticSourceCoupledTarget,
    nonAcousticResonantTarget,
    nonAcousticPeakDriverScratch,
    acousticSourceCoupledTarget,
    acousticResonantTarget,
    modalExcitationState,
    modalFieldContinuityState,
    modalDescriptorAuthorityState,
    sourceCoupledState,
    resonantState,
    bandState,
  } = analysisMemory;
  const {
    auditState,
    resolvedAuditSettings,
    sampleRate,
    fftSize,
    currentFrameAtMs,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    currentFrame,
    analysisSessionKey,
  } = resolvePreparationContext({
    featureState,
    analysisMemory,
    status,
    auditSettings,
    cavityGeometry,
    frameTimeMs,
  });
  const {
    sourceKind,
    analysisInputMode,
    calibrationVersion,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    resolvedLiveInputAnalysisSettings,
    isLineFeedLiveInput,
    isAcousticLiveInput,
    isLiveInputActive,
    soundActive,
    micActive,
    liveInputPolicy,
    liveInputAcousticIntent,
    sourceMode,
  } = resolvePreparedInputClassification({
    status,
    liveInputAnalysisSettings,
    injectTestTone: resolvedAuditSettings.injectTestTone,
  });
  analysisMemory.frameId = currentFrame;

  const preparedFileAnalysis =
    isPreparedFileAwaitingPlayback(status) &&
    resolvedAuditSettings.injectTestTone !== true;
  const fileTransportSourceMuted = shouldMuteFileTransportSource({
    sourceKind,
    status,
    auditSettings: resolvedAuditSettings,
    preparedFileAnalysis,
  });
  const preparedInputBase = {
    featureState,
    capacity,
    analysisMemory,
    candidateForcingSlots,
    candidateResponseSlots,
    modeSlots,
    signalModeSlots,
    sourceCoupledSpectralMoment,
    resonantSpectralMoment,
    modalFieldSpectralSeedDirection,
    referenceSourceCoupledSlots,
    referenceResonantSlots,
    referenceModeSlots,
    signalReferenceModeSlots,
    bandEnergies,
    zeroSourceCoupledTargetSlots,
    zeroResonantTargetSlots,
    modalFieldContinuityState,
    sourceCoupledState,
    resonantState,
    bandState,
    auditState,
    resolvedAuditSettings,
    sampleRate,
    fftSize,
    sourceKind,
    analysisInputMode,
    calibrationVersion,
    liveInputDeviceKind,
    resolvedLiveInputAnalysisClass,
    isLineFeedLiveInput,
    isAcousticLiveInput,
    soundActive,
    micActive,
    currentFrameAtMs,
    liveInputAcousticIntent,
    liveInputPolicy,
    currentFrame,
    radius,
    cavityAcousticScale,
    boundaryMode,
    requestedCavityGeometry,
    effectiveCavityGeometry,
    status,
    beatSettings,
    analysisSessionKey,
  };

  if (!analysisSnapshot && !resolvedAuditSettings.injectTestTone) {
    if (!isAcousticLiveInput) {
      resetLiveInputGateState(analysisMemory.bandState, {
        inputMode: analysisInputMode,
        policy: liveInputPolicy,
        calibrationVersion,
      });
    }
    const sourceEvidence = buildAudioSourceEvidenceFrame(
      collectAudioSourceEvidenceInputs({
        sourceKind,
        status,
        isAcousticLiveInput,
        isLineFeedLiveInput,
        preparationOnly: preparedFileAnalysis,
        fileMuted: fileTransportSourceMuted,
        metrics: {
          avgAmplitude: 0,
          analyserRms: 0,
          fftPeakAmplitude: 0,
          spectralEffectiveBinCount: 0,
        },
      }),
    );
    return {
      ...preparedInputBase,
      sourceMode,
      sourceEvidence,
      analysisInputsSignature: buildAnalysisInputsSignature({
        sourceKind,
        analysisInputMode,
        requestedCavityGeometry,
        effectiveCavityGeometry,
        liveInputDeviceKind,
        resolvedLiveInputAnalysisClass,
        calibrationVersion,
        resolvedAuditSettings,
        liveInputNoiseGateActive: false,
        liveInputHardSilenceActive: false,
        liveInputCalibrationInvalid: false,
        liveInputCalibrationInvalidReason: "none",
        sourceMode,
      }),
      silentFeatureFrame: buildSilentAudioFeatureFrame({
        featureState,
        sourceKind,
        analysisInputMode,
        soundActive,
        micActive,
        isLiveInputActive,
        sourceEvidence,
        candidateForcingSlots,
        candidateResponseSlots,
        sourceCoupledPhaseSlots,
        resonantPhaseSlots,
        modeSlots,
        sourceCoupledSpectralMoment,
        resonantSpectralMoment,
        modalFieldSpectralSeedDirection,
        referenceModeSlots,
        bandEnergies,
        sourceCoupledState,
        resonantState,
        fftSize,
        auditSettings: resolvedAuditSettings,
        requestedCavityGeometry,
        effectiveCavityGeometry,
      }),
    };
  }

  const {
    rawSnapshot,
    snapshot,
    sourceMode: resolvedSourceMode,
  } = resolvePreparedSnapshot({
    analysisSnapshot,
    auditSettings: resolvedAuditSettings,
    fftSize,
    sampleRate,
    fileTransportSourceMuted,
    sourceMode,
  });
  const metrics = readSnapshotMetrics(snapshot, fftSize, sampleRate);
  const {
    avgAmplitude,
    analyserRms,
    timeDomainPeakAmplitude,
    fftLinearAmplitudesSource,
    fftSummary,
    fftPeakAmplitude,
    spectralCentroidHint,
  } = metrics;
  const waterAcousticDrive = projectWaterAcousticDrive({
    timeDomainData: snapshot?.timeData ?? null,
    fftLinearAmplitudes: fftLinearAmplitudesSource,
    sampleRate,
    cavityAcousticScale,
    scratch: modalExcitationState.waterAcousticDriveScratch,
  });
  const {
    active: liveInputNoiseGateActive,
    hardSilence: liveInputHardSilenceActive,
    invalid: liveInputCalibrationInvalid,
    invalidReason: liveInputCalibrationInvalidReason,
    gateDiagnostics: liveInputGateDiagnostics,
  } = resolvePreparedLiveInputGate({
    isAcousticLiveInput,
    analysisMemory,
    auditSettings: resolvedAuditSettings,
    inputMode: analysisInputMode,
    metrics,
    sampleRate,
    currentFrameAtMs,
    calibrationVersion,
    liveInputAnalysisSettings: resolvedLiveInputAnalysisSettings,
    liveInputPolicy,
  });

  const lineFeedMetrics = buildLineFeedMetrics(
    isLineFeedLiveInput,
    metrics,
    sampleRate,
  );
  const lineFeedProgramActivity = resolvePreparedLineFeedActivity({
    isLineFeedLiveInput,
    bandState: analysisMemory.bandState,
    metrics: lineFeedMetrics,
    currentFrameAtMs,
    injectTestTone: resolvedAuditSettings.injectTestTone,
    analysisSessionKey,
  });
  const sourceEvidence = buildAudioSourceEvidenceFrame(
    collectAudioSourceEvidenceInputs({
      sourceKind,
      status,
      analysisSnapshot: rawSnapshot,
      includeSnapshotAsAnalysisSource: true,
      isAcousticLiveInput,
      isLineFeedLiveInput,
      preparationOnly: preparedFileAnalysis,
      injectTestTone: resolvedAuditSettings.injectTestTone,
      fileMuted: fileTransportSourceMuted,
      lineFeedProgramActive: lineFeedProgramActivity.programActive === true,
      liveInputHardSilenceActive,
      metrics: {
        avgAmplitude,
        analyserRms,
        fftPeakAmplitude,
        credibleSpectralPeakCount: fftSummary.crediblePeakCount,
        timeDomainPeakAmplitude,
        spectralEffectiveBinCount: fftSummary.spectralEffectiveBinCount,
      },
    }),
  );

  return {
    ...preparedInputBase,
    sourceCoupledPhaseSlots,
    resonantPhaseSlots,
    sourceCoupledSpectralMoment,
    resonantSpectralMoment,
    modalFieldSpectralSeedDirection,
    nonAcousticSourceCoupledTarget,
    nonAcousticResonantTarget,
    nonAcousticPeakDriverScratch,
    acousticSourceCoupledTarget,
    acousticResonantTarget,
    modalExcitationState,
    modalDescriptorAuthorityState,
    sourceMode: resolvedSourceMode,
    sourceEvidence,
    snapshot,
    waterAcousticDrive,
    avgAmplitude,
    analyserRms,
    fftLinearAmplitudesSource,
    fftPeakAmplitude,
    spectralCentroidHint,
    spectralEffectiveBinCount: fftSummary.spectralEffectiveBinCount,
    liveInputNoiseGateActive,
    liveInputHardSilenceActive,
    liveInputCalibrationInvalid,
    liveInputCalibrationInvalidReason,
    liveInputGateDiagnostics,
    lineFeedProgramActive: lineFeedProgramActivity.programActive,
    lineFeedProgramExcitation: lineFeedProgramActivity.programExcitation,
    lineFeedDeviceFloorRms: lineFeedProgramActivity.deviceFloorRms,
    analysisInputsSignature: buildAnalysisInputsSignature({
      sourceKind,
      analysisInputMode,
      requestedCavityGeometry,
      effectiveCavityGeometry,
      liveInputDeviceKind,
      resolvedLiveInputAnalysisClass,
      calibrationVersion,
      resolvedAuditSettings,
      liveInputNoiseGateActive,
      liveInputHardSilenceActive,
      liveInputCalibrationInvalid,
      liveInputCalibrationInvalidReason,
      sourceMode: resolvedSourceMode,
    }),
    silentFeatureFrame: null,
  };
}
