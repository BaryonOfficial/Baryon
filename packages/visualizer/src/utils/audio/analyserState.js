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

export {
  computeRms,
  getActiveAnalyserState,
};
