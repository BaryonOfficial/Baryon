function ensureTypedBuffer(existing, length, Type) {
  if (existing?.length === length) {
    return existing;
  }

  return new Type(length);
}

function normaliseSpectrumInto(freqData, result) {
  for (let i = 0; i < freqData.length; i++) {
    const value = freqData[i];
    result[i] = value > 1 ? value / 255.0 : value;
  }

  return result;
}

function computeAverageFrequency(freqData) {
  let total = 0;
  for (let i = 0; i < freqData.length; i++) {
    total += freqData[i];
  }

  return freqData.length ? total / freqData.length : 0;
}

function fillTimeDomainData(analyserNode, buffer) {
  if (!analyserNode || !buffer) return null;

  analyserNode.getFloatTimeDomainData(buffer);
  return buffer;
}

function refreshSpectrumCache(reader) {
  const analyserNode = reader?.analyser;
  if (!analyserNode) {
    return null;
  }

  const frequencyBinCount = analyserNode.frequencyBinCount;
  reader._rawFrequencyData = ensureTypedBuffer(
    reader._rawFrequencyData,
    frequencyBinCount,
    Uint8Array,
  );

  const sourceData =
    reader._readFrequencyData(reader._rawFrequencyData) ??
    reader._rawFrequencyData;
  reader._spectrumData = sourceData;

  reader._normalizedFrequencyData = ensureTypedBuffer(
    reader._normalizedFrequencyData,
    sourceData.length,
    Float32Array,
  );
  normaliseSpectrumInto(sourceData, reader._normalizedFrequencyData);
  reader._averageFrequency = computeAverageFrequency(sourceData);

  return {
    avgAmplitude: reader._averageFrequency,
    fftMagnitudes: reader._normalizedFrequencyData,
  };
}

function getReaderSpectrumSnapshot(analyser) {
  if (typeof analyser?._refreshSpectrumData === "function") {
    return analyser._refreshSpectrumData();
  }

  return null;
}

function getTimeDomainData(analyser, analyserNode) {
  const buffer = analyser?._timeDomainData
    ? ensureTypedBuffer(
        analyser._timeDomainData,
        analyserNode.fftSize,
        Float32Array,
      )
    : new Float32Array(analyserNode.fftSize);
  const timeData = fillTimeDomainData(analyserNode, buffer);

  if (analyser?._timeDomainData) {
    analyser._timeDomainData = timeData;
  }

  return timeData;
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
  return {
    analyser: analyserNode,
    _readFrequencyData: readFrequencyData,
    _rawFrequencyData: new Uint8Array(analyserNode.frequencyBinCount),
    _spectrumData: null,
    _normalizedFrequencyData: new Float32Array(analyserNode.frequencyBinCount),
    _timeDomainData: new Float32Array(analyserNode.fftSize),
    _averageFrequency: 0,
    _refreshSpectrumData() {
      return refreshSpectrumCache(this);
    },
    getFrequencyData() {
      refreshSpectrumCache(this);
      return this._spectrumData;
    },
    getAverageFrequency() {
      refreshSpectrumCache(this);
      return this._averageFrequency;
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

  const cachedSpectrum = getReaderSpectrumSnapshot(analyser);
  const timeData = getTimeDomainData(analyser, analyserNode);

  if (cachedSpectrum) {
    return {
      avgAmplitude: cachedSpectrum.avgAmplitude,
      fftMagnitudes: cachedSpectrum.fftMagnitudes,
      timeData,
      rms: computeRms(timeData),
    };
  }

  const frequencyData = analyser.getFrequencyData();

  return {
    avgAmplitude: analyser.getAverageFrequency(),
    fftMagnitudes: normaliseSpectrumInto(
      frequencyData,
      new Float32Array(frequencyData.length),
    ),
    timeData,
    rms: computeRms(timeData),
  };
}
