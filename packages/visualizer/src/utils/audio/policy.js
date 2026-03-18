export const AUDIO_ANALYSIS_POLICY = Object.freeze({
  requestedPitchSource: "spectral",
  minPeakClarity: 0.72,
  micSilenceAvgAmplitude: 8,
  micSilenceRms: 0.018,
  micSignalPeakAmplitude: 0.16,
});

export const SPECTRAL_MODAL_POLICY = Object.freeze({
  harmonicOrders: [1, 2, 3, 4, 5, 6],
  harmonicAttenuation: [1.0, 0.78, 0.6, 0.46, 0.34, 0.25],
  harmonicSupportFloor: 0.1,
  harmonicSupportRatio: 0.2,
  minSpectralBinAmplitude: 0.09,
  minSpectralBinGapHz: 20,
  maxSpectralFrequency: 3500,
});
