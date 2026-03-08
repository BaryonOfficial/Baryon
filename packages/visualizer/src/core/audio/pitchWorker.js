function detectPitchYIN(timeData, sampleRate, minHz = 60, maxHz = 1400) {
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
  if (rms < 0.008) return null;

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

  const threshold = 0.16;
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
    confidence: Math.max(0, Math.min(1, 1 - curr)),
    rms,
  };
}

self.onmessage = (event) => {
  const { type, samples, sampleRate, source, timestamp } = event.data ?? {};

  if (type !== 'analyze' || !(samples instanceof Float32Array)) {
    return;
  }

  try {
    const result = detectPitchYIN(samples, sampleRate);
    self.postMessage({
      type: 'pitch',
      source,
      timestamp,
      result,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      source,
      timestamp,
      message: String(error?.message ?? error),
    });
  }
};
