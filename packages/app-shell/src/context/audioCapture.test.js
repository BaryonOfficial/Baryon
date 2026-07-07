import { describe, expect, it, vi } from "vitest";

const { sessionMock } = vi.hoisted(() => ({
  sessionMock: {
    createCaptureStream: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock("@baryon/engine/audio", () => ({
  getDefaultAudioSession: () => sessionMock,
}));

import {
  createPlaybackAudioCaptureStream,
  readPlaybackAudioCaptureStatus,
} from "./audioCapture.js";

describe("playback audio capture boundary", () => {
  it("forwards capture stream creation to the default audio session", () => {
    const capture = { stream: {}, stop: vi.fn() };
    sessionMock.createCaptureStream.mockReturnValueOnce(capture);

    expect(createPlaybackAudioCaptureStream()).toBe(capture);
  });

  it("reduces session status to the recording-relevant audio facts", () => {
    sessionMock.getStatus.mockReturnValueOnce({
      isLiveInputActive: true,
      isAudioLoaded: false,
      isPlaying: false,
      unrelated: "ignored",
    });
    expect(readPlaybackAudioCaptureStatus()).toEqual({
      isLiveInputActive: true,
      hasPlaybackAudio: false,
    });

    sessionMock.getStatus.mockReturnValueOnce({
      isLiveInputActive: false,
      isAudioLoaded: true,
      isPlaying: false,
    });
    expect(readPlaybackAudioCaptureStatus()).toEqual({
      isLiveInputActive: false,
      hasPlaybackAudio: false,
    });

    sessionMock.getStatus.mockReturnValueOnce({
      isLiveInputActive: false,
      isAudioLoaded: true,
      isPlaying: true,
    });
    expect(readPlaybackAudioCaptureStatus()).toEqual({
      isLiveInputActive: false,
      hasPlaybackAudio: true,
    });
  });
});
