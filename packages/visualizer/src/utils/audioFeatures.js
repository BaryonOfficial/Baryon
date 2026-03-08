function normaliseSpectrum(freqData) {
  const result = new Float32Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    result[i] = freqData[i] > 1 ? freqData[i] / 255.0 : freqData[i];
  }
  return result;
}

function smoothSpectrum(freqData) {
  const smoothed = new Float32Array(freqData.length);
  for (let i = 1; i < freqData.length - 1; i++) {
    smoothed[i] = (freqData[i - 1] + freqData[i] + freqData[i + 1]) / 3;
  }
  smoothed[0] = freqData[0] || 0;
  smoothed[freqData.length - 1] = freqData[freqData.length - 1] || 0;
  return smoothed;
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
    };
  }

  const analyser = soundIsActive ? audioState.analyser : audioState.micAnalyser;
  return {
    avgAmplitude: analyser.getAverageFrequency(),
    freqData: normaliseSpectrum(analyser.getFrequencyData()),
  };
}

export function extractHarmonicPeaks(freqData, count, sampleRate, fftSize) {
  if (!freqData?.length || count <= 0) {
    return [];
  }

  const spectrum = smoothSpectrum(normaliseSpectrum(freqData));
  const hps = new Float32Array(spectrum.length);
  hps.set(spectrum);

  for (let harmonic = 2; harmonic <= 4; harmonic++) {
    for (let i = 0; i < spectrum.length / harmonic; i++) {
      hps[i] *= spectrum[i * harmonic];
    }
  }

  const binHz = sampleRate / fftSize;
  const minBin = Math.max(2, Math.floor(80 / binHz));
  const maxBin = Math.min(spectrum.length - 2, Math.ceil(4000 / binHz));
  const noiseFloor = 0.025;
  const minBinGap = Math.max(2, Math.round(35 / binHz));

  const candidates = [];
  for (let i = minBin; i <= maxBin; i++) {
    const value = hps[i];
    if (
      value > noiseFloor &&
      value >= hps[i - 1] &&
      value > hps[i + 1] &&
      spectrum[i] > noiseFloor
    ) {
      const left = spectrum[i - 1];
      const center = spectrum[i];
      const right = spectrum[i + 1];
      const denom = left - 2 * center + right;
      const offset = Math.abs(denom) > 1e-6 ? 0.5 * (left - right) / denom : 0;
      const refinedBin = i + Math.max(-0.5, Math.min(0.5, offset));

      candidates.push({
        bin: refinedBin,
        frequency: refinedBin * binHz,
        amplitude: Math.min(1, center),
        score: value,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const tooClose = selected.some((item) => Math.abs(item.bin - candidate.bin) < minBinGap);
    if (!tooClose) selected.push(candidate);
  }

  return selected;
}
