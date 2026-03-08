import { DEFAULTS } from '../../defaults.js';
import { sampleFFTAmplitudeForFrequency } from '../normalModes.js';
import { getActiveAnalyserState } from './analyserState.js';
import { detectPitchYIN } from './pitchFallback.js';
import {
  MAX_STACK_SLOTS,
  createAudioFeatureState,
  clearModalStack,
  decayModalStack,
  copyFloatArray,
  countActiveSlots,
} from './modalStack.js';
import {
  buildModalSlotsFromFundamental,
  buildModalSlotsFromSpectralPeaks,
} from './modalResolvers.js';
import { deriveFieldState } from './fieldState.js';
import { FIELD_STATES } from './types.js';

const MIN_PEAK_CLARITY = 0.72;
const MIN_PEAK_AMPLITUDE = 0.03;
const MIC_SILENCE_AVG_AMPLITUDE = 8;
const MIC_SILENCE_RMS = 0.018;

export { createAudioFeatureState, FIELD_STATES };

export function buildAudioFeatureFrame(audioState, featureState, radius) {
  const capacity = featureState?.capacity ?? DEFAULTS.capacity;
  const modeSlots = featureState?.modeSlots ?? new Float32Array(capacity * 4);
  const referenceModeSlots = featureState?.referenceModeSlots ?? new Float32Array(capacity * 4);
  const auditState = featureState?.audit;
  const auditSettings = auditState?.settings ?? {
    enabled: false,
    freezeModeSlots: false,
    injectTestTone: false,
    pitchSourceMode: 'auto',
    testToneHz: 440,
    testToneAmplitude: 0.5,
    logEveryFrames: 30,
  };
  const sampleRate = audioState.audioCtx?.sampleRate ?? 44100;
  const fftSize = audioState.fftSize ?? 4096;
  const inputMode = audioState.audioInputMode ?? 'idle';
  const analyserState = getActiveAnalyserState(audioState);
  const soundActive = inputMode === 'file' && Boolean(audioState.sound?.isPlaying);
  const micActive = inputMode === 'mic' && Boolean(audioState.gumStream?.active);
  const currentFrame = (featureState?.frameId ?? 0) + 1;
  const modalStackState = featureState?.modalStackState ?? createAudioFeatureState(capacity).modalStackState;

  if (featureState) {
    featureState.frameId = currentFrame;
    featureState.modalStackState = modalStackState;
  }

  let sourceMode = inputMode === 'file' ? 'file' : inputMode === 'mic' ? 'mic' : 'silent';
  if (auditSettings.injectTestTone) sourceMode = 'test';

  if (!analyserState && !auditSettings.injectTestTone) {
    modeSlots.fill(0);
    referenceModeSlots.fill(0);
    clearModalStack(modalStackState);

    const silentFft = featureState?.fftMagnitudes?.length
      ? featureState.fftMagnitudes
      : new Float32Array((audioState.fftSize ?? 0) / 2);
    silentFft.fill(0);
    if (featureState) {
      featureState.fftMagnitudes = silentFft;
    }

    return {
      fieldState: FIELD_STATES.idle,
      hasModalField: false,
      soundActive,
      micActive,
      averageAmplitude: 0,
      fftMagnitudes: silentFft,
      modeSlots,
      referenceModeSlots,
      sourceMode: 'silent',
      debug: {
        audioInputMode: inputMode,
        pitchSource: 'none',
        requestedPitchSource: auditSettings.pitchSourceMode,
        analysisEngine: 'none',
        fieldState: FIELD_STATES.idle,
        workerState: audioState.pitchService?.getPitchState?.(inputMode)?.state ?? 'none',
        pitchFrameAge: null,
        workerStatus: audioState.pitchService?.getStatus?.() ?? null,
        fileActive: soundActive,
        micActive,
        analysisSourceUsed: inputMode === 'idle' ? 'none' : inputMode,
        fundamentalFrequency: 0,
        fundamentalConfidence: 0,
        dominantFrequency: 0,
        dominantAmplitude: 0,
        avgAmplitude: 0,
        harmonicSupport: Array.from(modalStackState.harmonicSupport),
        uniqueModeCount: 0,
        nonZeroFFTBinCount: 0,
        modeSlotCount: 0,
        currentModeSlots: Array.from(modeSlots),
        referenceModeSlots: Array.from(referenceModeSlots),
        slotAmplitudeDeltas: Array.from(referenceModeSlots),
      },
    };
  }

  let avgAmplitude = analyserState?.avgAmplitude ?? 0;
  let freqData = analyserState?.freqData ?? null;
  const timeData = analyserState?.timeData ?? null;
  const analyserRms = analyserState?.rms ?? 0;

  if (auditSettings.injectTestTone) {
    if (!freqData) {
      freqData = new Float32Array(fftSize / 2);
    }
    freqData.fill(0);
    const testBinAmplitude = Math.max(0, Math.min(1, auditSettings.testToneAmplitude));
    avgAmplitude = testBinAmplitude * 255;
    const bin = Math.round((auditSettings.testToneHz / (sampleRate * 0.5)) * (freqData.length - 1));
    const index = Math.max(0, Math.min(freqData.length - 1, bin));
    freqData[index] = testBinAmplitude;
  }

  const micNoiseGateActive = !auditSettings.injectTestTone
    && inputMode === 'mic'
    && avgAmplitude < MIC_SILENCE_AVG_AMPLITUDE
    && analyserRms < MIC_SILENCE_RMS;

  if (
    inputMode !== 'idle' &&
    !auditSettings.injectTestTone &&
    timeData &&
    audioState.pitchService?.pushFrame &&
    !micNoiseGateActive
  ) {
    audioState.pitchService.pushFrame({
      source: inputMode,
      samples: timeData,
      sampleRate,
      timestamp: performance.now(),
    });
  }

  const workerPitchState = inputMode !== 'idle'
    ? audioState.pitchService?.getPitchState?.(inputMode) ?? { state: 'none' }
    : { state: 'none' };
  const workerPitch = inputMode !== 'idle'
    ? audioState.pitchService?.getLatestPitch?.(inputMode) ?? null
    : null;
  const workerStatus = audioState.pitchService?.getStatus?.() ?? null;
  const fallbackFrame = detectPitchYIN(timeData, sampleRate);
  const requestedPitchSource = auditSettings.pitchSourceMode ?? 'auto';

  const fallbackPeak = fallbackFrame && fallbackFrame.amplitude > MIN_PEAK_AMPLITUDE && fallbackFrame.clarity > MIN_PEAK_CLARITY
    ? fallbackFrame
    : null;

  let selectedFrequency = 0;
  let selectedConfidence = 0;
  let analysisEngine = 'none';
  let pitchSource = 'none';
  let spectralCandidates = [];
  let usedDecay = false;

  if (auditSettings.injectTestTone) {
    selectedFrequency = auditSettings.testToneHz;
    selectedConfidence = 1;
    analysisEngine = 'test';
    pitchSource = 'test';
  } else if (requestedPitchSource === 'worker') {
    if (workerPitch) {
      selectedFrequency = workerPitch.frequency;
      selectedConfidence = workerPitch.confidence ?? 1;
      analysisEngine = 'worker';
      pitchSource = 'worker';
    }
  } else if (requestedPitchSource === 'fallback') {
    if (fallbackPeak) {
      selectedFrequency = fallbackPeak.frequency;
      selectedConfidence = fallbackPeak.clarity;
      analysisEngine = 'fallback';
      pitchSource = 'fallback';
    }
  } else if (workerPitch) {
    selectedFrequency = workerPitch.frequency;
    selectedConfidence = workerPitch.confidence ?? 1;
    analysisEngine = 'worker';
    pitchSource = 'worker';
  } else if (requestedPitchSource === 'auto' && !micNoiseGateActive) {
    const spectralStack = buildModalSlotsFromSpectralPeaks({
      fftMagnitudes: freqData,
      sampleRate,
      fftSize,
      radius,
      capacity,
    });
    spectralCandidates = spectralStack.peaks;
    if (spectralStack.uniqueModeCount > 0) {
      copyFloatArray(modalStackState.slots, spectralStack.slots);
      copyFloatArray(modalStackState.referenceSlots, spectralStack.referenceSlots);
      modalStackState.harmonicSupport.set(spectralStack.harmonicSupport);
      modalStackState.fundamental = spectralCandidates[0]?.frequency ?? 0;
      modalStackState.fundamentalConfidence = spectralCandidates[0]?.amplitude ?? 0;
      modalStackState.analysisEngine = 'spectral';
      modalStackState.uniqueModeCount = spectralStack.uniqueModeCount;
      modalStackState.lastStableAt = performance.now();
      analysisEngine = 'spectral';
      pitchSource = 'spectral';
    }
  } else if (fallbackPeak) {
    selectedFrequency = fallbackPeak.frequency;
    selectedConfidence = fallbackPeak.clarity;
    analysisEngine = 'fallback';
    pitchSource = 'fallback';
  }

  if (selectedFrequency > 0 && selectedConfidence >= MIN_PEAK_CLARITY) {
    const stackBuild = buildModalSlotsFromFundamental({
      frequency: selectedFrequency,
      confidence: selectedConfidence,
      fftMagnitudes: freqData,
      sampleRate,
      fftSize,
      radius,
      capacity,
    });
    copyFloatArray(modalStackState.slots, stackBuild.slots);
    copyFloatArray(modalStackState.referenceSlots, stackBuild.referenceSlots);
    modalStackState.harmonicSupport.set(stackBuild.harmonicSupport);
    modalStackState.fundamental = selectedFrequency;
    modalStackState.fundamentalConfidence = selectedConfidence;
    modalStackState.analysisEngine = analysisEngine;
    modalStackState.uniqueModeCount = stackBuild.uniqueModeCount;
    modalStackState.lastStableAt = performance.now();
  } else if (analysisEngine === 'spectral') {
    // Spectral stack already committed above.
  } else if (
    requestedPitchSource !== 'fallback' &&
    workerPitchState.state === 'grace' &&
    !micNoiseGateActive &&
    modalStackState.analysisEngine !== 'none'
  ) {
    decayModalStack(modalStackState);
    usedDecay = true;
  } else if (
    requestedPitchSource === 'worker' &&
    workerPitchState.state === 'grace' &&
    !micNoiseGateActive &&
    modalStackState.analysisEngine === 'worker'
  ) {
    decayModalStack(modalStackState);
    usedDecay = true;
  } else {
    clearModalStack(modalStackState);
  }

  copyFloatArray(modeSlots, modalStackState.slots);
  copyFloatArray(referenceModeSlots, modalStackState.referenceSlots);

  let returnedModeSlots = modeSlots;
  if (auditSettings.freezeModeSlots && auditState) {
    if (auditState.frozenModeSlots.every((value) => value === 0)) {
      auditState.frozenModeSlots.set(modeSlots);
    }
    returnedModeSlots = auditState.frozenModeSlots;
  } else if (auditState) {
    auditState.frozenModeSlots.fill(0);
  }

  let fftMagnitudes = featureState?.fftMagnitudes;
  if (!fftMagnitudes || fftMagnitudes.length !== freqData.length) {
    fftMagnitudes = new Float32Array(freqData.length);
    if (featureState) {
      featureState.fftMagnitudes = fftMagnitudes;
    }
  }
  fftMagnitudes.set(freqData);

  const slotAmplitudeDeltas = new Float32Array(Math.min(capacity, MAX_STACK_SLOTS));
  const slotLimit = Math.min(slotAmplitudeDeltas.length, returnedModeSlots.length / 4);
  for (let i = 0; i < slotLimit; i++) {
    slotAmplitudeDeltas[i] = returnedModeSlots[i * 4 + 3] - referenceModeSlots[i * 4 + 3];
  }

  const dominantFrequency = modalStackState.fundamental || selectedFrequency;
  const dominantAmplitude = dominantFrequency
    ? sampleFFTAmplitudeForFrequency(dominantFrequency, fftMagnitudes, sampleRate, fftSize)
    : 0;

  const activeModeCount = countActiveSlots(returnedModeSlots, capacity);
  const { fieldState, hasModalField } = deriveFieldState({
    injectTestTone: auditSettings.injectTestTone,
    activeModeCount,
    usedDecay,
  });
  if (fieldState === FIELD_STATES.idle && !auditSettings.injectTestTone) {
    sourceMode = 'silent';
  }

  const debug = {
    audioInputMode: inputMode,
    pitchSource,
    requestedPitchSource,
    analysisEngine,
    fieldState,
    workerState: workerPitchState.state,
    pitchFrameAge: workerPitch?.ageMs ?? null,
    workerStatus,
    fileActive: soundActive,
    micActive,
    micNoiseGateActive,
    analysisSourceUsed: inputMode === 'idle' ? 'none' : inputMode,
    fundamentalFrequency: modalStackState.fundamental,
    fundamentalConfidence: modalStackState.fundamentalConfidence,
    dominantFrequency,
    dominantAmplitude,
    avgAmplitude,
    analyserRms,
    harmonicSupport: Array.from(modalStackState.harmonicSupport),
    spectralCandidates: spectralCandidates.map((peak) => ({
      frequency: peak.frequency,
      amplitude: peak.amplitude,
    })),
    uniqueModeCount: modalStackState.uniqueModeCount,
    nonZeroFFTBinCount: fftMagnitudes.reduce((count, value) => count + (value > 0.001 ? 1 : 0), 0),
    modeSlotCount: activeModeCount,
    currentModeSlots: Array.from(returnedModeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    slotAmplitudeDeltas: Array.from(slotAmplitudeDeltas),
    referencePitchBinAmplitude: dominantFrequency
      ? sampleFFTAmplitudeForFrequency(dominantFrequency, fftMagnitudes, sampleRate, fftSize)
      : 0,
  };

  if (auditState) {
    auditState.frame += 1;
    auditState.lastSnapshot = debug;
  }

  return {
    fieldState,
    hasModalField,
    soundActive,
    micActive,
    averageAmplitude: avgAmplitude,
    fftMagnitudes,
    modeSlots: returnedModeSlots,
    referenceModeSlots,
    sourceMode,
    debug,
    audit: auditSettings,
  };
}
