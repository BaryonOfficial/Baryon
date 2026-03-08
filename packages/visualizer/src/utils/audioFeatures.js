import { DEFAULTS } from '../defaults.js';
import {
  solveNormalModesForPitch,
  sampleFFTAmplitudeForFrequency,
} from './normalModes.js';

/**
 * @typedef {'idle' | 'decay' | 'active' | 'test'} FieldState
 */

const MAX_STACK_SLOTS = 4;
const HARMONIC_ORDERS = [1, 2, 3, 4];
const HARMONIC_ATTENUATION = [1.0, 0.72, 0.52, 0.38];
const HARMONIC_SUPPORT_FLOOR = 0.1;
const HARMONIC_SUPPORT_RATIO = 0.2;
const MIN_PEAK_CLARITY = 0.72;
const MIN_PEAK_AMPLITUDE = 0.03;
const DECAY_PER_FRAME = 0.9;
const MIN_SPECTRAL_BIN_AMPLITUDE = 0.12;
const MIN_SPECTRAL_BIN_GAP_HZ = 45;
const MAX_SPECTRAL_FREQUENCY = 1800;
const MIC_SILENCE_AVG_AMPLITUDE = 8;
const MIC_SILENCE_RMS = 0.018;

/** @type {{ idle: FieldState, decay: FieldState, active: FieldState, test: FieldState }} */
export const FIELD_STATES = Object.freeze({
  idle: 'idle',
  decay: 'decay',
  active: 'active',
  test: 'test',
});

function normaliseSpectrum(freqData) {
  const result = new Float32Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    result[i] = freqData[i] > 1 ? freqData[i] / 255.0 : freqData[i];
  }
  return result;
}

function getTimeDomainData(analyser) {
  const node = analyser?.analyser;
  if (!node) return null;

  const data = new Float32Array(node.fftSize);
  node.getFloatTimeDomainData(data);
  return data;
}

function computeRms(timeData) {
  if (!timeData?.length) return 0;

  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const value = timeData[i];
    sum += value * value;
  }
  return Math.sqrt(sum / timeData.length);
}

function getAnalyserState(analyser) {
  if (!analyser) return null;
  const timeData = getTimeDomainData(analyser);
  return {
    avgAmplitude: analyser.getAverageFrequency(),
    freqData: normaliseSpectrum(analyser.getFrequencyData()),
    timeData,
    rms: computeRms(timeData),
  };
}

function getActiveAnalyserState(audioState) {
  if (audioState.audioInputMode === 'file') {
    return audioState.sound?.isPlaying ? getAnalyserState(audioState.analyser) : null;
  }
  if (audioState.audioInputMode === 'mic') {
    return audioState.gumStream?.active ? getAnalyserState(audioState.micAnalyser) : null;
  }
  return null;
}

export function getCombinedAnalyserState(audioState) {
  return getActiveAnalyserState(audioState);
}

export function detectPitchYIN(timeData, sampleRate, minHz = 80, maxHz = 1400) {
  if (!timeData?.length || !sampleRate) {
    return null;
  }

  const samples = timeData;
  let rms = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    rms += value * value;
  }
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.01) return null;

  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(Math.floor(sampleRate / minHz), samples.length >> 1);
  if (maxTau <= minTau) return null;

  const yin = new Float32Array(maxTau + 1);
  yin[0] = 1;

  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0, n = samples.length - tau; i < n; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    yin[tau] = sum;
  }

  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += yin[tau];
    yin[tau] = runningSum > 0 ? (yin[tau] * tau) / runningSum : 1;
  }

  const threshold = 0.12;
  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (yin[tau] < threshold) {
      tauEstimate = tau;
      while (tauEstimate + 1 <= maxTau && yin[tauEstimate + 1] < yin[tauEstimate]) {
        tauEstimate++;
      }
      break;
    }
  }

  if (tauEstimate < 0) return null;

  const prev = tauEstimate > minTau ? yin[tauEstimate - 1] : yin[tauEstimate];
  const curr = yin[tauEstimate];
  const next = tauEstimate < maxTau ? yin[tauEstimate + 1] : yin[tauEstimate];
  const denom = prev + next - 2 * curr;
  const betterTau = Math.abs(denom) > 1e-6
    ? tauEstimate + (prev - next) / (2 * denom)
    : tauEstimate;

  const frequency = sampleRate / betterTau;
  if (!Number.isFinite(frequency) || frequency < minHz || frequency > maxHz) {
    return null;
  }

  return {
    frequency,
    amplitude: Math.min(1, rms * 4),
    clarity: 1 - curr,
  };
}

function createModalStackState(capacity) {
  return {
    slots: new Float32Array(capacity * 4),
    referenceSlots: new Float32Array(capacity * 4),
    harmonicSupport: new Float32Array(HARMONIC_ORDERS.length),
    fundamental: 0,
    fundamentalConfidence: 0,
    analysisEngine: 'none',
    uniqueModeCount: 0,
    lastStableAt: 0,
  };
}

export function createAudioFeatureState(capacity = DEFAULTS.capacity) {
  return {
    capacity,
    modeSlots: new Float32Array(capacity * 4),
    referenceModeSlots: new Float32Array(capacity * 4),
    fftMagnitudes: new Float32Array(0),
    modalStackState: createModalStackState(capacity),
    audit: {
      frame: 0,
      frozenModeSlots: new Float32Array(capacity * 4),
      lastSnapshot: null,
      settings: {
        enabled: false,
        freezeModeSlots: false,
        injectTestTone: false,
        pitchSourceMode: 'auto',
        testToneHz: 440,
        testToneAmplitude: 0.5,
        logEveryFrames: 30,
      },
    },
    frameId: 0,
  };
}

function clearModalStack(state) {
  state.slots.fill(0);
  state.referenceSlots.fill(0);
  state.harmonicSupport.fill(0);
  state.fundamental = 0;
  state.fundamentalConfidence = 0;
  state.analysisEngine = 'none';
  state.uniqueModeCount = 0;
}

function decayModalStack(state) {
  for (let i = 0; i < state.slots.length; i += 4) {
    state.slots[i + 3] *= DECAY_PER_FRAME;
    state.referenceSlots[i + 3] *= DECAY_PER_FRAME;
  }
}

function writeSlot(target, index, mode, amplitude) {
  const offset = index * 4;
  target[offset] = mode.u;
  target[offset + 1] = mode.v;
  target[offset + 2] = mode.w;
  target[offset + 3] = amplitude;
}

function buildModalSlotsFromFundamental({
  frequency,
  confidence,
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
}) {
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const primarySupport = sampleFFTAmplitudeForFrequency(
    frequency,
    fftMagnitudes,
    sampleRate,
    fftSize
  );
  const supportThreshold = Math.max(HARMONIC_SUPPORT_FLOOR, primarySupport * HARMONIC_SUPPORT_RATIO);

  let slotIndex = 0;
  for (let i = 0; i < HARMONIC_ORDERS.length && slotIndex < Math.min(capacity, MAX_STACK_SLOTS); i++) {
    const harmonicFrequency = frequency * HARMONIC_ORDERS[i];
    const support = sampleFFTAmplitudeForFrequency(
      harmonicFrequency,
      fftMagnitudes,
      sampleRate,
      fftSize
    );
    harmonicSupport[i] = support;

    if (i > 0 && support < supportThreshold) {
      continue;
    }

    const mode = solveNormalModesForPitch(harmonicFrequency, radius);
    if (!mode) continue;

    const key = `${mode.u}:${mode.v}:${mode.w}`;
    if (seenModes.has(key)) continue;
    seenModes.add(key);

    const attenuation = HARMONIC_ATTENUATION[i] ?? HARMONIC_ATTENUATION[HARMONIC_ATTENUATION.length - 1];
    const amplitude = support * attenuation * (i === 0 ? confidence : Math.max(0.5, confidence));
    writeSlot(slots, slotIndex, mode, amplitude);
    writeSlot(referenceSlots, slotIndex, mode, support);
    slotIndex++;
  }

  return {
    slots,
    referenceSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
  };
}

function buildModalSlotsFromSpectralPeaks({
  fftMagnitudes,
  sampleRate,
  fftSize,
  radius,
  capacity,
}) {
  const slots = new Float32Array(capacity * 4);
  const referenceSlots = new Float32Array(capacity * 4);
  const harmonicSupport = new Float32Array(HARMONIC_ORDERS.length);
  const seenModes = new Set();
  const peaks = findSpectralPeakFrequencies(
    fftMagnitudes,
    sampleRate,
    fftSize,
    Math.min(capacity, MAX_STACK_SLOTS) * 2
  );

  let slotIndex = 0;
  for (const peak of peaks) {
    if (slotIndex >= Math.min(capacity, MAX_STACK_SLOTS)) break;
    const mode = solveNormalModesForPitch(peak.frequency, radius);
    if (!mode) continue;

    const key = `${mode.u}:${mode.v}:${mode.w}`;
    if (seenModes.has(key)) continue;
    seenModes.add(key);

    const attenuation = HARMONIC_ATTENUATION[Math.min(slotIndex, HARMONIC_ATTENUATION.length - 1)];
    writeSlot(slots, slotIndex, mode, peak.amplitude * attenuation);
    writeSlot(referenceSlots, slotIndex, mode, peak.amplitude);
    harmonicSupport[slotIndex] = peak.amplitude;
    slotIndex++;
  }

  return {
    slots,
    referenceSlots,
    harmonicSupport,
    uniqueModeCount: slotIndex,
    peaks,
  };
}

function copyFloatArray(target, source) {
  target.fill(0);
  target.set(source.subarray(0, target.length));
}

function countActiveSlots(modeSlots, capacity) {
  let count = 0;
  const limit = Math.min(modeSlots.length, capacity * 4);
  for (let i = 0; i < limit; i += 4) {
    if (modeSlots[i + 3] > 0) count++;
  }
  return count;
}

function findSpectralPeakFrequencies(fftMagnitudes, sampleRate, fftSize, count) {
  if (!fftMagnitudes?.length || !sampleRate || !fftSize || count <= 0) {
    return [];
  }

  const nyquist = sampleRate * 0.5;
  const minBinGap = Math.max(
    1,
    Math.round((MIN_SPECTRAL_BIN_GAP_HZ / nyquist) * (fftSize * 0.5 - 1))
  );
  const candidates = [];

  for (let i = 1; i < fftMagnitudes.length - 1; i++) {
    const amplitude = fftMagnitudes[i];
    if (
      amplitude >= MIN_SPECTRAL_BIN_AMPLITUDE &&
      amplitude >= fftMagnitudes[i - 1] &&
      amplitude > fftMagnitudes[i + 1]
    ) {
      const frequency = (i / (fftSize * 0.5 - 1)) * nyquist;
      if (frequency > 0 && frequency <= MAX_SPECTRAL_FREQUENCY) {
        candidates.push({ bin: i, amplitude, frequency });
      }
    }
  }

  candidates.sort((a, b) => b.amplitude - a.amplitude);

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const tooClose = selected.some((existing) => Math.abs(existing.bin - candidate.bin) < minBinGap);
    if (!tooClose) selected.push(candidate);
  }

  return selected;
}

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
  const modalStackState = featureState?.modalStackState ?? createModalStackState(capacity);

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

  if (
    inputMode !== 'idle' &&
    !auditSettings.injectTestTone &&
    timeData &&
    audioState.pitchService?.pushFrame
  ) {
    const micNoiseGateActive = inputMode === 'mic'
      && avgAmplitude < MIC_SILENCE_AVG_AMPLITUDE
      && analyserRms < MIC_SILENCE_RMS;
    if (!micNoiseGateActive) {
    audioState.pitchService.pushFrame({
      source: inputMode,
      samples: timeData,
      sampleRate,
      timestamp: performance.now(),
    });
    }
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
  const micNoiseGateActive = !auditSettings.injectTestTone
    && inputMode === 'mic'
    && avgAmplitude < MIC_SILENCE_AVG_AMPLITUDE
    && analyserRms < MIC_SILENCE_RMS;

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
    // Spectral stack is already committed above.
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
  const hasModalField = activeModeCount > 0;
  /** @type {FieldState} */
  let fieldState = FIELD_STATES.idle;
  if (auditSettings.injectTestTone) {
    fieldState = FIELD_STATES.test;
  } else if (hasModalField) {
    fieldState = usedDecay ? FIELD_STATES.decay : FIELD_STATES.active;
  }
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
