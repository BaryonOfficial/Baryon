const STORAGE_KEY = "baryon.audio.inputPreference.v1";

function normalizePreference(value) {
  if (typeof value?.deviceId !== "string" || !value.deviceId.trim()) {
    return null;
  }
  return {
    deviceId: value.deviceId,
    label: typeof value.label === "string" ? value.label.trim() : "",
  };
}

export function readLiveInputPreference(storage) {
  try {
    return normalizePreference(
      JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}

export function writeLiveInputPreference(storage, preference) {
  const normalized = normalizePreference(preference);
  try {
    if (normalized) storage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // A storage restriction must not prevent choosing an audio input.
  }
  return normalized;
}
