export const DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS = Object.freeze({
  runtime: "worker",
  fastCadenceMs: 16,
  structuralCadenceMs: 33,
  chromaCadenceMs: 66,
  tempoCadenceMs: 120,
  staleDriveTimeoutMs: 96,
  workerRestartTimeoutMs: 288,
});

export function normalizeAudioFeatureRuntimeSettings(settings = {}) {
  return Object.freeze({
    ...DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS,
    ...settings,
    fastCadenceMs: Math.max(
      8,
      Math.round(
        settings.fastCadenceMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.fastCadenceMs,
      ),
    ),
    structuralCadenceMs: Math.max(
      16,
      Math.round(
        settings.structuralCadenceMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.structuralCadenceMs,
      ),
    ),
    chromaCadenceMs: Math.max(
      16,
      Math.round(
        settings.chromaCadenceMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.chromaCadenceMs,
      ),
    ),
    tempoCadenceMs: Math.max(
      16,
      Math.round(
        settings.tempoCadenceMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.tempoCadenceMs,
      ),
    ),
    staleDriveTimeoutMs: Math.max(
      32,
      Math.round(
        settings.staleDriveTimeoutMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.staleDriveTimeoutMs,
      ),
    ),
    workerRestartTimeoutMs: Math.max(
      96,
      Math.round(
        settings.workerRestartTimeoutMs ??
          DEFAULT_AUDIO_FEATURE_RUNTIME_SETTINGS.workerRestartTimeoutMs,
      ),
    ),
  });
}
