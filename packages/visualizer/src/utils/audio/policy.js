export const AUDIO_ANALYSIS_POLICY = Object.freeze({
  requestedPitchSource: "spectral",
  minPeakClarity: 0.72,
  micSilenceAvgAmplitude: 8,
  micSilenceRms: 0.018,
  micSignalPeakAmplitude: 0.16,
});

export const SPECTRAL_MODAL_POLICY = Object.freeze({
  harmonicOrders: [1, 2, 3, 4],
  harmonicAttenuation: [1.0, 0.72, 0.52, 0.38],
  harmonicSupportFloor: 0.1,
  harmonicSupportRatio: 0.2,
  minSpectralBinAmplitude: 0.12,
  minSpectralBinGapHz: 45,
  maxSpectralFrequency: 1800,
});
