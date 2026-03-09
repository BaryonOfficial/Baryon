function normaliseSpectrum(freqData) {
  const result = new Float32Array(freqData.length);
  for (let i = 0; i < freqData.length; i++) {
    result[i] = freqData[i] > 1 ? freqData[i] / 255.0 : freqData[i];
  }
  return result;
}

function readTimeDomainData(analyserNode) {
  if (!analyserNode) return null;

  const data = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(data);
  return data;
}

export function computeRms(timeData) {
  if (!timeData?.length) return 0;

  let sum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const value = timeData[i];
    sum += value * value;
  }

  return Math.sqrt(sum / timeData.length);
}

export function createAnalyserReader(analyserNode, readFrequencyData) {
  const data = new Uint8Array(analyserNode.frequencyBinCount);

  return {
    analyser: analyserNode,
    getFrequencyData() {
      return readFrequencyData(data);
    },
    getAverageFrequency() {
      const spectrum = readFrequencyData(data);
      let total = 0;
      for (let i = 0; i < spectrum.length; i++) total += spectrum[i];
      return spectrum.length ? total / spectrum.length : 0;
    },
  };
}

export function createNodeAnalyser(audioCtx, sourceNode, fftSize) {
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = fftSize;
  sourceNode.connect(analyserNode);

  return createAnalyserReader(analyserNode, (data) => {
    analyserNode.getByteFrequencyData(data);
    return data;
  });
}

export function sampleAnalyser(analyser) {
  const analyserNode = analyser?.analyser;
  if (!analyserNode) return null;

  const timeData = readTimeDomainData(analyserNode);
  return {
    avgAmplitude: analyser.getAverageFrequency(),
    fftMagnitudes: normaliseSpectrum(analyser.getFrequencyData()),
    timeData,
    rms: computeRms(timeData),
  };
}
