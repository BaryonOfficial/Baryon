export const AUDIO_ANALYSIS_POLICY = Object.freeze({
  requestedPitchSource: "spectral",
  liveInputSilenceAvgAmplitude: 8,
  liveInputSilenceRms: 0.018,
});

export const SPECTRAL_MODAL_POLICY = Object.freeze({
  harmonicOrders: [1, 2, 3, 4, 5, 6],
  harmonicAttenuation: [1.0, 0.78, 0.6, 0.46, 0.34, 0.25],
  modalRenderLivenessFloor: 0.04,
});
