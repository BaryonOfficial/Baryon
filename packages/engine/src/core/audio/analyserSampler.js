function ensureTypedBuffer(existing, length, Type) {
  if (existing?.length === length) {
    return existing;
  }

  return new Type(length);
}

function normaliseSpectrumInto(freqData, result) {
  // Byte spectra (getByteFrequencyData) arrive as 0-255 and need scaling;
  // Float32 spectra are already normalized to 0-1. Dispatch on the buffer
  // type rather than per-value so a raw byte of 1 maps to ~0.004, not 1.0.
  const byteScaled = freqData instanceof Uint8Array;
  for (let i = 0; i < freqData.length; i++) {
    const value = freqData[i];
    result[i] = byteScaled ? value / 255 : value;
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
  // Preserve the reader's raw buffer type (Uint8Array for byte readers,
  // Float32Array for float readers) — getFloatFrequencyData requires a
  // Float32Array, so re-allocating as bytes would corrupt float readers.
  const RawType = reader._rawFrequencyData?.constructor ?? Uint8Array;
  reader._rawFrequencyData = ensureTypedBuffer(
    reader._rawFrequencyData,
    frequencyBinCount,
    RawType,
  );

  const sourceData =
    reader._readFrequencyData(reader._rawFrequencyData) ??
    reader._rawFrequencyData;
  reader._spectrumData = sourceData;

  reader._fftLinearAmplitudes = ensureTypedBuffer(
    reader._fftLinearAmplitudes,
    sourceData.length,
    Float32Array,
  );
  normaliseSpectrumInto(sourceData, reader._fftLinearAmplitudes);
  reader._averageFrequency =
    reader._computeMeterLevel(reader._fftLinearAmplitudes) * 255;

  return {
    avgAmplitude: reader._averageFrequency,
    fftLinearAmplitudes: reader._fftLinearAmplitudes,
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

/**
 * @param {AnalyserNode} analyserNode
 * @param {(data: Uint8Array | Float32Array) => Uint8Array | Float32Array} readFrequencyData
 * @param {Uint8ArrayConstructor | Float32ArrayConstructor} [RawType=Uint8Array]
 * @param {(data: Float32Array) => number} [computeMeterLevel=computeAverageFrequency]
 */
export function createAnalyserReader(
  analyserNode,
  readFrequencyData,
  RawType = Uint8Array,
  computeMeterLevel = computeAverageFrequency,
) {
  return {
    analyser: analyserNode,
    _readFrequencyData: readFrequencyData,
    _computeMeterLevel: computeMeterLevel,
    _rawFrequencyData: new RawType(analyserNode.frequencyBinCount),
    _spectrumData: null,
    _fftLinearAmplitudes: new Float32Array(analyserNode.frequencyBinCount),
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

function normalizeDecibelMagnitude(value, minDecibels, maxDecibels) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const span = Math.max(1e-6, maxDecibels - minDecibels);
  return Math.max(0, Math.min(1, (value - minDecibels) / span));
}

function decibelsToLinearAmplitude(value, minDecibels) {
  if (!Number.isFinite(value) || value <= minDecibels) {
    return 0;
  }
  return Math.max(0, Math.min(1, 10 ** (value / 20)));
}

export function createNodeAnalyser(audioCtx, sourceNode, fftSize) {
  const analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = fftSize;
  analyserNode.smoothingTimeConstant = 0;
  sourceNode.connect(analyserNode);

  const supportsFloatFrequencyData =
    typeof analyserNode.getFloatFrequencyData === "function";
  const minDecibels = Number.isFinite(analyserNode.minDecibels)
    ? analyserNode.minDecibels
    : -100;
  const maxDecibels = Number.isFinite(analyserNode.maxDecibels)
    ? analyserNode.maxDecibels
    : -30;
  const decibelSpan = Math.max(1e-6, maxDecibels - minDecibels);
  // Preserve the raw analyser meter while projecting the FFT to linear
  // amplitude. Reconstructing either representation from the other is lossy
  // once the linear projection clips or the analyser reports its floor.
  let legacyMeterLevel = 0;

  return createAnalyserReader(
    analyserNode,
    (data) => {
      if (!supportsFloatFrequencyData) {
        const byteData = new Uint8Array(data.length);
        analyserNode.getByteFrequencyData(byteData);
        let meterTotal = 0;
        for (let index = 0; index < data.length; index += 1) {
          const byteValue = byteData[index] ?? 0;
          meterTotal += byteValue / 255;
          data[index] =
            byteValue <= 0
              ? 0
              : decibelsToLinearAmplitude(
                  minDecibels + (byteValue / 255) * decibelSpan,
                  minDecibels,
                );
        }
        legacyMeterLevel = data.length ? meterTotal / data.length : 0;
        return data;
      }

      analyserNode.getFloatFrequencyData(data);
      let meterTotal = 0;
      for (let index = 0; index < data.length; index += 1) {
        const decibels = data[index];
        meterTotal += normalizeDecibelMagnitude(
          decibels,
          minDecibels,
          maxDecibels,
        );
        data[index] = decibelsToLinearAmplitude(decibels, minDecibels);
      }
      legacyMeterLevel = data.length ? meterTotal / data.length : 0;
      return data;
    },
    Float32Array,
    () => legacyMeterLevel,
  );
}

export function sampleAnalyser(analyser) {
  const analyserNode = analyser?.analyser;
  if (!analyserNode) return null;

  const cachedSpectrum = getReaderSpectrumSnapshot(analyser);
  const timeData = getTimeDomainData(analyser, analyserNode);

  if (cachedSpectrum) {
    return {
      avgAmplitude: cachedSpectrum.avgAmplitude,
      fftLinearAmplitudes: cachedSpectrum.fftLinearAmplitudes,
      timeData,
      rms: computeRms(timeData),
    };
  }

  const frequencyData = analyser.getFrequencyData();

  return {
    avgAmplitude: analyser.getAverageFrequency(),
    fftLinearAmplitudes: normaliseSpectrumInto(
      frequencyData,
      new Float32Array(frequencyData.length),
    ),
    timeData,
    rms: computeRms(timeData),
  };
}
