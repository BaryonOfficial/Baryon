export const DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS = Object.freeze({
  staleObservationTimeoutMs: 96,
});

export function normalizeAudioFeatureRuntimeSettings(settings = {}) {
  const timeout =
    settings.staleObservationTimeoutMs ??
    DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.staleObservationTimeoutMs;
  if (!Number.isFinite(timeout) || timeout < 32)
    throw new RangeError("Observation stall timeout must be at least 32 ms");
  return Object.freeze({ staleObservationTimeoutMs: timeout });
}
