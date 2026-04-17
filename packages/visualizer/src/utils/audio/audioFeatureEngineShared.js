export const DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS = Object.freeze(
  /** @type {{ runtime: string, structuralCadenceMs: number, snapshotPublishCadenceMs: number, chromaCadenceMs: number, tempoCadenceMs: number, maxSnapshotAgeMs: number }} */ ({
    runtime: "worker",
    structuralCadenceMs: 33,
    snapshotPublishCadenceMs: 33,
    chromaCadenceMs: 66,
    tempoCadenceMs: 120,
    maxSnapshotAgeMs: 96,
  }),
);

export function normalizeAudioFeatureEngineSettings(settings = {}) {
  return Object.freeze({
    ...DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS,
    ...settings,
    structuralCadenceMs: Math.max(
      16,
      Math.round(
        settings?.structuralCadenceMs ??
          DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS.structuralCadenceMs,
      ),
    ),
    snapshotPublishCadenceMs: Math.max(
      16,
      Math.round(
        settings?.snapshotPublishCadenceMs ??
          DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS.snapshotPublishCadenceMs,
      ),
    ),
    chromaCadenceMs: Math.max(
      16,
      Math.round(
        settings?.chromaCadenceMs ??
          DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS.chromaCadenceMs,
      ),
    ),
    tempoCadenceMs: Math.max(
      16,
      Math.round(
        settings?.tempoCadenceMs ??
          DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS.tempoCadenceMs,
      ),
    ),
    maxSnapshotAgeMs: Math.max(
      32,
      Math.round(
        settings?.maxSnapshotAgeMs ??
          DEFAULT_AUDIO_FEATURE_ENGINE_SETTINGS.maxSnapshotAgeMs,
      ),
    ),
  });
}
