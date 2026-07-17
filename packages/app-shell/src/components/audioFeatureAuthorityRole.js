import { AUDIO_FEATURE_AUTHORITY_ROLES } from "@baryon/engine/audio-features";

const AUDIO_FEATURE_AUTHORITY_ROLE_VALUES = new Set(
  Object.values(AUDIO_FEATURE_AUTHORITY_ROLES),
);

export function assertAudioFeatureAuthorityRole(role) {
  if (!AUDIO_FEATURE_AUTHORITY_ROLE_VALUES.has(role)) {
    throw new TypeError(
      `audioFeatureAuthorityRole must be one of: ${[
        ...AUDIO_FEATURE_AUTHORITY_ROLE_VALUES,
      ].join(", ")}`,
    );
  }

  return role;
}
