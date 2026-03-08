import { DEFAULTS } from '../defaults.js';
import {
  resolvePitchHistoryToModes,
  resolvePitchHistoryToModesWithFFT,
  sampleFFTAmplitudeForFrequency,
} from './normalModes.js';

function normaliseSpectrum(freqData) {
  const result = new Float32Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    result[i] = freqData[i] > 1 ? freqData[i] / 255.0 : freqData[i];
  }
  return result;
}

function combineFrequencyData(freqData1, freqData2) {
  const length = Math.max(freqData1.length, freqData2.length);
  const result = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const a = freqData1[i] || 0;
    const b = freqData2[i] || 0;
    result[i] = Math.sqrt(a * a + b * b);
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

function combineTimeDomainData(timeData1, timeData2) {
  const length = Math.max(timeData1.length, timeData2.length);
  const result = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    const a = timeData1[i] || 0;
    const b = timeData2[i] || 0;
    result[i] = (a + b) * 0.5;
  }

  return result;
}

export function getCombinedAnalyserState(audioState) {
  const soundIsActive = Boolean(audioState.sound?.isPlaying && audioState.analyser);
  const micIsActive = Boolean(audioState.gumStream?.active && audioState.micAnalyser);

  if (!soundIsActive && !micIsActive) {
    return null;
  }

  if (soundIsActive && micIsActive) {
    return {
      avgAmplitude: Math.sqrt(
        audioState.analyser.getAverageFrequency() ** 2 +
        audioState.micAnalyser.getAverageFrequency() ** 2
      ),
      freqData: normaliseSpectrum(
        combineFrequencyData(
          audioState.analyser.getFrequencyData(),
          audioState.micAnalyser.getFrequencyData()
        )
      ),
      timeData: combineTimeDomainData(
        getTimeDomainData(audioState.analyser),
        getTimeDomainData(audioState.micAnalyser)
      ),
    };
  }

  const analyser = soundIsActive ? audioState.analyser : audioState.micAnalyser;
  return {
    avgAmplitude: analyser.getAverageFrequency(),
    freqData: normaliseSpectrum(analyser.getFrequencyData()),
    timeData: getTimeDomainData(analyser),
  };
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
    yin[tau] = runningSum > 0 ? yin[tau] * tau / runningSum : 1;
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

export function createAudioFeatureState(capacity = DEFAULTS.capacity) {
  const historySize = Math.max(3, Math.min(capacity, 5));

  return {
    capacity,
    historySize,
    pitchHistory: Array.from({ length: historySize }, () => ({
      frequency: 0,
      amplitude: 0,
    })),
    modeSlots: new Float32Array(capacity * 4),
    referenceModeSlots: new Float32Array(capacity * 4),
    fftMagnitudes: new Float32Array(0),
    workletPitchScratch: new Float32Array(capacity),
    audit: {
      frame: 0,
      frozenModeSlots: new Float32Array(capacity * 4),
      lastSnapshot: null,
      settings: {
        enabled: false,
        freezeModeSlots: false,
        injectTestTone: false,
        testToneHz: 440,
        testToneAmplitude: 0.5,
        logEveryFrames: 30,
      },
    },
  };
}

function readWorkletPitch(audioState, featureState) {
  const reader = audioState.audioReader;
  const scratch = featureState?.workletPitchScratch;
  if (!reader || !scratch || reader.available_read() < 1) {
    return null;
  }

  scratch.fill(0);
  const read = reader.dequeue(scratch);
  if (!read) {
    return null;
  }

  const latestPitch = scratch[Math.max(0, read - 1)];
  return Number.isFinite(latestPitch) && latestPitch > 0 ? latestPitch : null;
}

export function buildAudioFeatureFrame(audioState, featureState, radius) {
  const capacity = featureState?.capacity ?? DEFAULTS.capacity;
  const history = featureState?.pitchHistory ?? [];
  const modeSlots = featureState?.modeSlots ?? new Float32Array(capacity * 4);
  const referenceModeSlots = featureState?.referenceModeSlots ?? new Float32Array(capacity * 4);
  const auditState = featureState?.audit;
  const auditSettings = auditState?.settings ?? {
    enabled: false,
    freezeModeSlots: false,
    injectTestTone: false,
    testToneHz: 440,
    testToneAmplitude: 0.5,
    logEveryFrames: 30,
  };
  const sampleRate = audioState.audioCtx?.sampleRate ?? 44100;
  const fftSize = audioState.fftSize ?? 4096;

  const combinedState = getCombinedAnalyserState(audioState);
  const soundActive = Boolean(audioState.sound?.isPlaying);
  const micActive = Boolean(audioState.gumStream?.active);
  const engaged = auditSettings.injectTestTone
    ? true
    : Boolean(audioState.sound?.started || micActive);

  let sourceMode = 'silent';
  if (soundActive && micActive) sourceMode = 'mixed';
  else if (soundActive) sourceMode = 'file';
  else if (micActive) sourceMode = 'mic';
  if (auditSettings.injectTestTone) sourceMode = 'test';

  if (!combinedState && !auditSettings.injectTestTone) {
    modeSlots.fill(0);
    referenceModeSlots.fill(0);
    for (let i = 0; i < history.length; i++) {
      history[i] = { frequency: 0, amplitude: 0 };
    }

    const silentFft = featureState?.fftMagnitudes?.length
      ? featureState.fftMagnitudes
      : new Float32Array((audioState.fftSize ?? 0) / 2);
    silentFft.fill(0);
    if (featureState) {
      featureState.fftMagnitudes = silentFft;
    }

    return {
      engaged,
      soundActive,
      micActive,
      averageAmplitude: 0,
      fftMagnitudes: silentFft,
      modeSlots,
      referenceModeSlots,
      sourceMode,
      debug: {
        pitchSource: 'none',
        dominantFrequency: 0,
        workletPitch: null,
        avgAmplitude: 0,
        nonZeroFFTBinCount: 0,
        modeSlotCount: 0,
        currentModeSlots: Array.from(modeSlots),
        referenceModeSlots: Array.from(referenceModeSlots),
        slotAmplitudeDeltas: Array.from(referenceModeSlots),
      },
    };
  }

  let avgAmplitude = combinedState?.avgAmplitude ?? 0;
  let freqData = combinedState?.freqData ?? null;
  const timeData = combinedState?.timeData ?? null;

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

  const workletPitch = readWorkletPitch(audioState, featureState);
  const yinPeak = detectPitchYIN(timeData, sampleRate);
  const dominantPeak = auditSettings.injectTestTone
    ? {
        frequency: auditSettings.testToneHz,
        amplitude: Math.max(0, Math.min(1, auditSettings.testToneAmplitude)),
        clarity: 1,
      }
    : workletPitch
    ? {
        frequency: workletPitch,
        amplitude: Math.min(1, avgAmplitude / 96),
        clarity: 1,
      }
    : yinPeak;

  if (dominantPeak && dominantPeak.amplitude > 0.03 && dominantPeak.clarity > 0.75) {
    if (auditSettings.injectTestTone) {
      history[0] = {
        frequency: dominantPeak.frequency,
        amplitude: dominantPeak.amplitude * Math.min(1, dominantPeak.clarity),
      };
      for (let i = 1; i < history.length; i++) {
        history[i] = {
          frequency: 0,
          amplitude: 0,
        };
      }
    } else {
      for (let i = history.length - 1; i > 0; i--) {
        history[i] = history[i - 1];
      }

      history[0] = {
        frequency: dominantPeak.frequency,
        amplitude: dominantPeak.amplitude * Math.min(1, dominantPeak.clarity),
      };
    }
  } else {
    for (let i = 0; i < history.length; i++) {
      const item = history[i];
      history[i] = {
        frequency: item.frequency,
        amplitude: item.amplitude * 0.92,
      };
    }
  }

  modeSlots.fill(0);
  modeSlots.set(resolvePitchHistoryToModes(history, radius));
  referenceModeSlots.fill(0);
  referenceModeSlots.set(
    resolvePitchHistoryToModesWithFFT(history, radius, freqData, sampleRate, fftSize)
  );

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

  const slotAmplitudeDeltas = new Float32Array(history.length);
  let modeSlotCount = 0;
  for (let i = 0; i < history.length; i++) {
    if (returnedModeSlots[i * 4 + 3] > 0) {
      modeSlotCount++;
    }
    slotAmplitudeDeltas[i] =
      returnedModeSlots[i * 4 + 3] - referenceModeSlots[i * 4 + 3];
  }

  const debug = {
    pitchSource: auditSettings.injectTestTone
      ? 'test'
      : workletPitch
      ? 'worklet'
      : yinPeak
      ? 'yin'
      : 'none',
    dominantFrequency: dominantPeak?.frequency ?? 0,
    dominantAmplitude: dominantPeak?.amplitude ?? 0,
    workletPitch,
    avgAmplitude,
    nonZeroFFTBinCount: fftMagnitudes.reduce((count, value) => count + (value > 0.001 ? 1 : 0), 0),
    modeSlotCount,
    currentModeSlots: Array.from(returnedModeSlots),
    referenceModeSlots: Array.from(referenceModeSlots),
    slotAmplitudeDeltas: Array.from(slotAmplitudeDeltas),
    referencePitchBinAmplitude: dominantPeak
      ? sampleFFTAmplitudeForFrequency(dominantPeak.frequency, fftMagnitudes, sampleRate, fftSize)
      : 0,
  };

  if (auditState) {
    auditState.frame += 1;
    auditState.lastSnapshot = debug;
  }

  return {
    engaged,
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
