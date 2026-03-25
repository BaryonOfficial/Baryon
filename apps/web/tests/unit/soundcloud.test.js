import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSoundCloudClientId,
  canUseNativeStreamPlayback,
  isHlsStream,
  isSoundCloudUrl,
  resolveSoundCloudQueue,
  resolveSoundCloudStream,
} from "../../../../packages/app-shell/src/utils/soundcloud.js";

test("accepts standard and shortlink SoundCloud URLs", () => {
  assert.equal(isSoundCloudUrl("https://soundcloud.com/artist/track"), true);
  assert.equal(isSoundCloudUrl("https://on.soundcloud.com/abc123"), true);
  assert.equal(isSoundCloudUrl("https://example.com/not-soundcloud"), false);
});

test("fails fast when the SoundCloud client id is missing", () => {
  assert.throws(
    () => assertSoundCloudClientId({}),
    /VITE_SOUNDCLOUD_CLIENT_ID/,
  );
});

test("resolves a public track into a playable queue item", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /\/resolve\?/);
    return {
      ok: true,
      async json() {
        return {
          kind: "track",
          id: 101,
          urn: "urn:soundcloud:tracks:101",
          title: "Native Track",
          duration: 120000,
          permalink_url: "https://soundcloud.com/artist/native-track",
          user: {
            username: "Artist",
          },
          media: {
            transcodings: [
              {
                url: "https://api.soundcloud.com/media/soundcloud:tracks:101/stream/hls",
                format: {
                  protocol: "hls",
                  mime_type: "application/vnd.apple.mpegurl",
                },
              },
            ],
          },
        };
      },
    };
  };

  const result = await resolveSoundCloudQueue(
    "https://soundcloud.com/artist/native-track",
    {
      clientId: "client-id",
      fetchImpl,
    },
  );

  assert.equal(result.kind, "track");
  assert.equal(result.title, "Native Track");
  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].title, "Native Track");
  assert.equal(result.queue[0].protocol, "hls");
});

test("resolves a public playlist into an ordered queue", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        kind: "playlist",
        title: "My Playlist",
        permalink_url: "https://soundcloud.com/artist/sets/my-playlist",
        tracks: [
          {
            id: 1,
            title: "First",
            duration: 1000,
            urn: "urn:soundcloud:tracks:1",
            media: {
              transcodings: [
                {
                  url: "https://api.soundcloud.com/media/1/stream/hls",
                  format: {
                    protocol: "hls",
                    mime_type: "application/vnd.apple.mpegurl",
                  },
                },
              ],
            },
          },
          {
            id: 2,
            title: "Second",
            duration: 2000,
            urn: "urn:soundcloud:tracks:2",
            media: {
              transcodings: [
                {
                  url: "https://api.soundcloud.com/media/2/stream/hls",
                  format: {
                    protocol: "hls",
                    mime_type: "application/vnd.apple.mpegurl",
                  },
                },
              ],
            },
          },
        ],
      };
    },
  });

  const result = await resolveSoundCloudQueue(
    "https://soundcloud.com/artist/sets/my-playlist",
    {
      clientId: "client-id",
      fetchImpl,
    },
  );

  assert.equal(result.kind, "playlist");
  assert.equal(result.queue.length, 2);
  assert.equal(result.queue[0].title, "First");
  assert.equal(result.queue[1].title, "Second");
});

test("passes shortlinks through SoundCloud resolve", async () => {
  let requestedUrl = "";
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return {
          kind: "track",
          id: 999,
          title: "Resolved Shortlink",
          urn: "urn:soundcloud:tracks:999",
          media: {
            transcodings: [
              {
                url: "https://api.soundcloud.com/media/999/stream/hls",
                format: {
                  protocol: "hls",
                  mime_type: "application/vnd.apple.mpegurl",
                },
              },
            ],
          },
        };
      },
    };
  };

  await resolveSoundCloudQueue("https://on.soundcloud.com/abc123", {
    clientId: "client-id",
    fetchImpl,
  });

  assert.match(requestedUrl, /url=https%3A%2F%2Fon\.soundcloud\.com%2Fabc123/);
});

test("rejects non-SoundCloud URLs with a user-facing error", async () => {
  await assert.rejects(
    () =>
      resolveSoundCloudQueue("https://example.com/not-soundcloud", {
        clientId: "client-id",
        fetchImpl: async () => {
          throw new Error("should not fetch");
        },
      }),
    /Paste a valid SoundCloud track or playlist URL/,
  );
});

test("resolves a track transcoding into a playable stream URL", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /client_id=client-id/);
    return {
      ok: true,
      async json() {
        return {
          url: "https://cf-hls-media.sndcdn.com/media/playlist.m3u8",
        };
      },
    };
  };

  const result = await resolveSoundCloudStream(
    {
      transcodingUrl: "https://api.soundcloud.com/media/track/stream/hls",
      mimeType: "application/vnd.apple.mpegurl",
      protocol: "hls",
    },
    {
      clientId: "client-id",
      fetchImpl,
    },
  );

  assert.equal(
    result.streamUrl,
    "https://cf-hls-media.sndcdn.com/media/playlist.m3u8",
  );
  assert.equal(result.mimeType, "application/vnd.apple.mpegurl");
  assert.equal(result.protocol, "hls");
});

test("detects HLS streams and native playback capability", () => {
  assert.equal(
    isHlsStream({
      mimeType: "application/vnd.apple.mpegurl",
      protocol: "hls",
    }),
    true,
  );
  assert.equal(
    canUseNativeStreamPlayback(
      {
        canPlayType: (mimeType) =>
          mimeType === "application/vnd.apple.mpegurl" ? "probably" : "",
      },
      "application/vnd.apple.mpegurl",
    ),
    true,
  );
});
