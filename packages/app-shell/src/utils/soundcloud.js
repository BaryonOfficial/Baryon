const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
  "on.soundcloud.com",
]);

export const SOUNDCLOUD_ENABLED = false;

const SOUNDCLOUD_API_BASE = "https://api.soundcloud.com";
const HLS_MIME_TYPES = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
]);

function getDefaultFetch() {
  if (typeof fetch !== "function") {
    throw new Error("Fetch is not available in this environment");
  }
  return fetch.bind(globalThis);
}

function buildApiUrl(pathname, params = {}) {
  const url = new URL(pathname, SOUNDCLOUD_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function normalizeTrackUrn(track) {
  if (typeof track?.urn === "string" && track.urn.trim()) {
    return track.urn.trim();
  }

  if (track?.id) {
    return `urn:soundcloud:tracks:${track.id}`;
  }

  return "";
}

function normalizeTrackDurationSeconds(track) {
  const durationMs = Number(track?.duration);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;
}

function selectPlayableTranscoding(track) {
  const transcodings = Array.isArray(track?.media?.transcodings)
    ? track.media.transcodings.filter(
        (transcoding) =>
          transcoding?.url &&
          transcoding?.format?.protocol &&
          transcoding?.snipped !== true,
      )
    : [];

  if (transcodings.length === 0) {
    return null;
  }

  const progressive = transcodings.find(
    (transcoding) => transcoding.format.protocol === "progressive",
  );
  if (progressive) {
    return progressive;
  }

  return (
    transcodings.find((transcoding) => transcoding.format.protocol === "hls") ||
    transcodings[0]
  );
}

function normalizeTrack(track, index) {
  const transcoding = selectPlayableTranscoding(track);
  const urn = normalizeTrackUrn(track);

  if (!transcoding || !urn) {
    return null;
  }

  return {
    id: track?.id ?? `${urn}-${index}`,
    urn,
    title: String(track?.title || "Untitled Track").trim(),
    artistName: String(track?.user?.username || "").trim(),
    artworkUrl: String(
      track?.artwork_url || track?.user?.avatar_url || "",
    ).trim(),
    permalinkUrl: String(track?.permalink_url || "").trim(),
    durationSeconds: normalizeTrackDurationSeconds(track),
    transcodingUrl: String(transcoding.url).trim(),
    protocol: String(transcoding.format.protocol || "").trim(),
    mimeType: String(transcoding.format.mime_type || "").trim(),
  };
}

function normalizeQueue(resource) {
  if (resource?.kind === "playlist" || Array.isArray(resource?.tracks)) {
    const queue = (resource.tracks || []).flatMap((track, index) => {
      const normalizedTrack = normalizeTrack(track, index);
      return normalizedTrack ? [normalizedTrack] : [];
    });

    return {
      kind: "playlist",
      title: String(resource?.title || "SoundCloud Playlist").trim(),
      canonicalUrl: String(resource?.permalink_url || "").trim(),
      artistName: String(resource?.user?.username || "").trim(),
      queue,
    };
  }

  const track = normalizeTrack(resource, 0);
  return {
    kind: "track",
    title: String(resource?.title || "SoundCloud Track").trim(),
    canonicalUrl: String(resource?.permalink_url || "").trim(),
    artistName: String(resource?.user?.username || "").trim(),
    queue: track ? [track] : [],
  };
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`SoundCloud request failed: ${response.status}`);
  }
  return response.json();
}

export function isSoundCloudUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return SOUNDCLOUD_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function getSoundCloudClientId(env = import.meta.env) {
  return String(env?.VITE_SOUNDCLOUD_CLIENT_ID || "").trim();
}

export function assertSoundCloudClientId(env = import.meta.env) {
  const clientId = getSoundCloudClientId(env);
  if (!clientId) {
    throw new Error(
      "SoundCloud playback requires VITE_SOUNDCLOUD_CLIENT_ID to be configured.",
    );
  }
  return clientId;
}

export async function resolveSoundCloudQueue(
  inputUrl,
  { clientId = assertSoundCloudClientId(), fetchImpl = getDefaultFetch() } = {},
) {
  const nextUrl = String(inputUrl || "").trim();

  if (!isSoundCloudUrl(nextUrl)) {
    throw new Error("Paste a valid SoundCloud track or playlist URL.");
  }

  const resource = await fetchJson(
    buildApiUrl("/resolve", {
      url: nextUrl,
      client_id: clientId,
    }),
    fetchImpl,
  );
  const queueData = normalizeQueue(resource);

  if (queueData.queue.length === 0) {
    throw new Error(
      "SoundCloud could not find a playable public track in that link.",
    );
  }

  return {
    ...queueData,
    canonicalUrl: queueData.canonicalUrl || nextUrl,
  };
}

export async function resolveSoundCloudStream(
  track,
  { clientId = assertSoundCloudClientId(), fetchImpl = getDefaultFetch() } = {},
) {
  const transcodingUrl = String(track?.transcodingUrl || "").trim();
  if (!transcodingUrl) {
    throw new Error("SoundCloud track does not expose a playable stream.");
  }

  const response = await fetchJson(
    buildApiUrl(transcodingUrl, {
      client_id: clientId,
    }),
    fetchImpl,
  );
  const streamUrl = String(response?.url || "").trim();

  if (!streamUrl) {
    throw new Error("SoundCloud did not return a playable stream URL.");
  }

  return {
    streamUrl,
    mimeType: String(track?.mimeType || "").trim(),
    protocol: String(track?.protocol || "").trim(),
  };
}

export function isHlsStream({ streamUrl = "", mimeType = "", protocol = "" }) {
  const normalizedMimeType = String(mimeType || "")
    .trim()
    .toLowerCase();
  const normalizedProtocol = String(protocol || "")
    .trim()
    .toLowerCase();
  return (
    normalizedProtocol === "hls" ||
    HLS_MIME_TYPES.has(normalizedMimeType) ||
    String(streamUrl || "")
      .toLowerCase()
      .includes(".m3u8")
  );
}

export function canUseNativeStreamPlayback(audioElement, mimeType = "") {
  if (!audioElement?.canPlayType) {
    return false;
  }

  const normalizedMimeType = String(mimeType || "").trim();
  if (!normalizedMimeType) {
    return false;
  }

  return audioElement.canPlayType(normalizedMimeType) !== "";
}
