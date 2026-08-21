import { LIVE_INPUT_ANALYSIS_CLASSES } from "../../core/audio/liveInputAnalysis.js";
import { AUDIO_SOURCE_KINDS } from "../../core/audio/audioSourceSession.js";
import { isLineFeedMeterIdlePauseSignature } from "./lineFeedProgramActivity.js";
import {
  SPECTRAL_EVIDENCE_POLICY,
  computeSpectralEffectiveBinCount,
} from "./spectralEvidence.js";
import {
  advanceObservedModalModes,
  hasObserverContinuityEvidence,
} from "./modalObservedState.js";
import {
  buildAudioSourceEvidenceFrame,
  collectAudioSourceEvidenceInputs,
  resolveAudioRenderBoundary,
} from "./audioSourceEvidence.js";
import { updateModalResponseFrame } from "./modalResponse.js";
import {
  FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  createFastModalDriveEstimator,
} from "./fastModalDriveEstimator.js";

const HARD_SILENCE_MAX_RMS = 0.004;
const LINE_FEED_ZERO_SPECTRUM_HARD_SILENCE_MAX_RMS = 0.0065;

function isLineFeedInput(preparedInputs) {
  return (
    preparedInputs?.resolvedLiveInputAnalysisClass ===
      LIVE_INPUT_ANALYSIS_CLASSES.lineFeed ||
    preparedInputs?.liveInputPolicy === LIVE_INPUT_ANALYSIS_CLASSES.lineFeed
  );
}

function isLineFeedTransportSilentFrame(preparedInputs) {
  return (
    isLineFeedInput(preparedInputs) &&
    computeSpectralEffectiveBinCount(
      preparedInputs?.fftLinearAmplitudesSource,
    ) === 0 &&
    (preparedInputs?.fftPeakAmplitude ?? 0) <=
      SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor
  );
}

export function isModalExcitationHardSilentFrame(preparedInputs) {
  const lineFeedZeroSpectrum = isLineFeedTransportSilentFrame(preparedInputs);
  const maxRms = lineFeedZeroSpectrum
    ? LINE_FEED_ZERO_SPECTRUM_HARD_SILENCE_MAX_RMS
    : HARD_SILENCE_MAX_RMS;

  return (
    (preparedInputs?.analyserRms ?? 0) <= maxRms &&
    (preparedInputs?.fftPeakAmplitude ?? 0) <=
      SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor &&
    computePreparedTimeDataPeakAmplitude(preparedInputs) <=
      SPECTRAL_EVIDENCE_POLICY.analyserAmplitudeFloor
  );
}

function computePreparedTimeDataPeakAmplitude(preparedInputs) {
  const timeData =
    preparedInputs?.snapshot?.timeData ?? preparedInputs?.timeData ?? null;
  if (!(timeData instanceof Float32Array) || timeData.length === 0) {
    return 0;
  }

  let peak = 0;
  for (let index = 0; index < timeData.length; index += 1) {
    peak = Math.max(peak, Math.abs(timeData[index] ?? 0));
  }
  return peak;
}

function hasPreparedAnalysisSource(preparedInputs) {
  return (
    preparedInputs.snapshot != null ||
    preparedInputs.fftLinearAmplitudesSource instanceof Float32Array ||
    preparedInputs.timeData instanceof Float32Array
  );
}

function resolvePreparedSourceEvidence(preparedInputs) {
  const inputs = preparedInputs ?? {};
  if (inputs.sourceEvidence) {
    return inputs.sourceEvidence;
  }

  const auditSettings = inputs.resolvedAuditSettings ?? {};
  return buildAudioSourceEvidenceFrame(
    collectAudioSourceEvidenceInputs({
      sourceKind: inputs.sourceKind ?? AUDIO_SOURCE_KINDS.file,
      hasAnalysisSource: hasPreparedAnalysisSource(inputs),
      status: inputs.status,
      isAcousticLiveInput: inputs.isAcousticLiveInput === true,
      isLineFeedLiveInput: isLineFeedInput(inputs),
      injectTestTone: auditSettings.injectTestTone === true,
      fileMuted:
        inputs.sourceKind === AUDIO_SOURCE_KINDS.file &&
        inputs.sourceMode === "silent",
      lineFeedProgramActive: inputs.lineFeedProgramActive === true,
      liveInputHardSilenceActive: inputs.liveInputHardSilenceActive === true,
      metrics: {
        avgAmplitude: inputs.avgAmplitude ?? 0,
        analyserRms: inputs.analyserRms ?? 0,
        fftPeakAmplitude: inputs.fftPeakAmplitude ?? 0,
        timeDomainPeakAmplitude: computePreparedTimeDataPeakAmplitude(inputs),
        spectralEffectiveBinCount: computeSpectralEffectiveBinCount(
          inputs.fftLinearAmplitudesSource,
        ),
      },
    }),
  );
}

function mapModalResponseEntries(modalResponse) {
  return new Map(
    (modalResponse?.entries ?? []).map((entry) => [entry.modeKey, entry]),
  );
}

function mapModalOscillatorStates(modalResponse) {
  return new Map(
    (modalResponse?.oscillatorStates ?? []).map((entry) => [
      entry.modeKey,
      entry,
    ]),
  );
}

function resolveLineFeedModalActivity(preparedInputs, modalObserverMetrics) {
  const lineFeedInput = isLineFeedInput(preparedInputs);
  const lineFeedProgramActive = preparedInputs?.lineFeedProgramActive === true;
  const lineFeedProgramRenderActive =
    lineFeedProgramActive ||
    (lineFeedInput &&
      !isLineFeedMeterIdlePauseSignature({
        avgAmplitude: preparedInputs?.avgAmplitude,
        rms: preparedInputs?.analyserRms,
        transportSpectrumSilent: isLineFeedTransportSilentFrame(preparedInputs),
        timeDomainPeakAmplitude:
          computePreparedTimeDataPeakAmplitude(preparedInputs),
      }) &&
      modalObserverMetrics.resonantRingSupport > 0.08 &&
      modalObserverMetrics.resonantObservationConfidence > 0.003);

  return {
    lineFeedProgramActive,
    lineFeedProgramRenderActive,
  };
}

function resolvePreparedModalResponseTimeData(preparedInputs) {
  if (
    preparedInputs?.waterAcousticDrive?.timeDomainData instanceof Float32Array
  ) {
    return preparedInputs.waterAcousticDrive.timeDomainData;
  }
  if (preparedInputs?.snapshot?.timeData instanceof Float32Array) {
    return preparedInputs.snapshot.timeData;
  }
  if (preparedInputs?.timeData instanceof Float32Array) {
    return preparedInputs.timeData;
  }
  return null;
}

function hasFiniteStructuralTimeDrive(timeDomainData) {
  const start = Math.max(
    0,
    timeDomainData.length - FAST_MODAL_DRIVE_WINDOW_SAMPLES,
  );
  for (let index = start; index < timeDomainData.length; index += 1) {
    const sample = timeDomainData[index];
    if (Number.isFinite(sample) && sample !== 0) {
      return true;
    }
  }
  return false;
}

function resolveStructuralExactDrive({
  state,
  atlas,
  fftLinearAmplitudes,
  timeDomainData,
  sampleRate,
  hardSilence,
}) {
  if (
    computeSpectralEffectiveBinCount(fftLinearAmplitudes) > 0 ||
    !(timeDomainData instanceof Float32Array) ||
    timeDomainData.length < FAST_MODAL_DRIVE_WINDOW_SAMPLES ||
    !(Number.isFinite(sampleRate) && sampleRate > 0) ||
    !hasFiniteStructuralTimeDrive(timeDomainData)
  ) {
    return null;
  }

  const cached = state.structuralExactDriveEstimator;
  const estimator =
    cached?.atlas === atlas && cached.sampleRate === sampleRate
      ? cached.estimator
      : createFastModalDriveEstimator({
          committedModes: atlas,
          sampleRate,
        });
  if (estimator !== cached?.estimator) {
    state.structuralExactDriveEstimator = {
      atlas,
      sampleRate,
      estimator,
    };
  }
  return estimator.evaluate(timeDomainData, 1, hardSilence);
}

function advancePhysicalModalResponseFrame({
  state,
  atlas,
  preparedInputs,
  fastSignalState,
  driveAnalysis,
  deltaMs,
  strictHardSilentFrame,
  lineFeedProgramRenderActive,
  preparedSourceEvidence,
}) {
  const {
    periodicity,
    tonalness,
    distributedExcitation,
    drivePeak,
    driveSource,
  } = driveAnalysis;
  const preModalContinuityEvidence = hasObserverContinuityEvidence({
    drivePeak,
    driveSource,
    periodicity,
    tonalness,
    distributedExcitation,
  });
  const hardSilence =
    strictHardSilentFrame &&
    !lineFeedProgramRenderActive &&
    !preModalContinuityEvidence;
  const timeDomainData = resolvePreparedModalResponseTimeData(preparedInputs);
  const modalDriveFftLinearAmplitudes =
    preparedInputs.waterAcousticDrive?.fftLinearAmplitudes ??
    fastSignalState.fftLinearAmplitudes;
  const exactDriveResult = resolveStructuralExactDrive({
    state,
    atlas,
    fftLinearAmplitudes: modalDriveFftLinearAmplitudes,
    timeDomainData,
    sampleRate: preparedInputs.sampleRate,
    hardSilence,
  });
  const modalResponse = updateModalResponseFrame({
    modes: atlas,
    fftLinearAmplitudes: modalDriveFftLinearAmplitudes,
    timeDomainData,
    sampleRate: preparedInputs.sampleRate,
    // Oscillator history belongs to the response integrator. Observer and
    // projection maps carry transformed quantities and must never replace it.
    previousOscillatorStates: state.modalOscillatorStates,
    deltaMs,
    inputRms: preparedInputs.analyserRms,
    normalizedInputAmplitude:
      fastSignalState.sourceNormalization?.normalizedRms,
    hardSilence,
    coherence: Math.max(tonalness, periodicity),
    exactDriveResult,
  });
  const resolvedSourceEvidence = resolveAudioRenderBoundary({
    sourceEvidence: preparedSourceEvidence,
    modalResponse,
  });

  state.modalOscillatorStates = mapModalOscillatorStates(modalResponse);

  return {
    modalResponse,
    modalResponseByMode: mapModalResponseEntries(modalResponse),
    freshCouplingEvidence: modalResponse.modalResponseInputEnergyScale > 0,
    resolvedSourceEvidence,
  };
}

export function advanceModalObservationResponseFrame({
  state,
  atlas,
  preparedInputs,
  fastSignalState,
  driveAnalysis,
  deltaMs,
  sourceCoupledCapacity,
  resonantCapacity,
  allowBassHarmonicDriver,
  strictHardSilentFrame,
}) {
  const preparedSourceEvidence = resolvePreparedSourceEvidence(preparedInputs);
  const preparedModalObservationPolicy =
    preparedSourceEvidence.modalObservationPolicy ?? {};
  const observedModalResult = advanceObservedModalModes({
    previousModes: state.observedModes,
    atlas,
    driveAnalysis,
    fftLinearAmplitudes: fastSignalState.fftLinearAmplitudes,
    sampleRate: preparedInputs.sampleRate,
    fftSize: preparedInputs.fftSize,
    currentFrameAtMs: preparedInputs.currentFrameAtMs,
    deltaMs,
    sourceCoupledCapacity,
    resonantCapacity,
    allowBassHarmonicDriver,
    hardSilentFrame: strictHardSilentFrame,
    suppressWeakSpectralFallbackDrive:
      preparedModalObservationPolicy.suppressWeakSpectralFallbackDrive,
  });
  state.observedModes = observedModalResult.observedModes;

  const modalObserverMetrics = observedModalResult.summary;
  const lineFeedActivity = resolveLineFeedModalActivity(
    preparedInputs,
    modalObserverMetrics,
  );
  const responseFrame = advancePhysicalModalResponseFrame({
    state,
    atlas,
    preparedInputs,
    fastSignalState,
    driveAnalysis,
    deltaMs,
    strictHardSilentFrame,
    lineFeedProgramRenderActive: lineFeedActivity.lineFeedProgramRenderActive,
    preparedSourceEvidence,
  });
  const { modalResponse, resolvedSourceEvidence } = responseFrame;

  return {
    modalObserverMetrics,
    observationByMode: observedModalResult.observationByMode,
    modalResponse,
    modalResponseByMode: responseFrame.modalResponseByMode,
    freshCouplingEvidence: responseFrame.freshCouplingEvidence,
    resolvedSourceEvidence,
    lineFeedProgramActive: lineFeedActivity.lineFeedProgramActive,
  };
}
