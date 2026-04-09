/* @vitest-environment jsdom */

import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getDefaultAudioSessionMock,
  handleLocalPlayPauseMock,
  handleLocalStopMock,
  refreshAudioInputsMock,
} = vi.hoisted(() => ({
  getDefaultAudioSessionMock: vi.fn(),
  handleLocalPlayPauseMock: vi.fn(),
  handleLocalStopMock: vi.fn(),
  refreshAudioInputsMock: vi.fn(async () => []),
}));

vi.mock("@baryon/visualizer/audio", () => ({
  getDefaultAudioSession: getDefaultAudioSessionMock,
}));

vi.mock("../components/hooks/useAudioLogic", () => ({
  useAudioLogic: vi.fn(() => ({
    handleFileChange: () => {},
    handleRecentFileSelect: () => {},
    handlePlayPause: handleLocalPlayPauseMock,
    handleStop: handleLocalStopMock,
    handleVolumeChange: () => {},
    handleMuteToggle: () => {},
    refreshAudioInputs: refreshAudioInputsMock,
  })),
}));

import { AudioProvider } from "./AudioProvider.jsx";
import { useAudio } from "./AudioContext.jsx";

function AudioHarness({ onValue }) {
  const audio = useAudio();

  useEffect(() => {
    onValue(audio);
  }, [audio, onValue]);

  return null;
}

describe("AudioProvider source transport gating", () => {
  let container = null;
  let root = null;
  let session = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    handleLocalPlayPauseMock.mockReset();
    handleLocalStopMock.mockReset();
    refreshAudioInputsMock.mockClear();
    getDefaultAudioSessionMock.mockReset();
    session = null;
  });

  function renderProvider(onValue) {
    session = {
      getStatus: () => ({
        isAudioLoaded: true,
        isPlaying: false,
        isLiveInputActive: false,
        volume: 1,
        muted: false,
        liveInputDeviceKind: null,
        liveInputKind: null,
        liveInputAnalysisClass: "auto",
        resolvedLiveInputAnalysisClass: "auto",
      }),
      getTransportState: () => ({
        currentTimeSeconds: 0,
        durationSeconds: 0,
        canSeek: false,
      }),
      seekTo: () => {},
      setLiveInputAnalysisSettings: () => {},
      stopAudio: () => {},
      stopLiveInputStream: () => {},
      playPauseAudio: async () => {},
      startLiveInputStream: async () => {},
    };
    getDefaultAudioSessionMock.mockReturnValue(session);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <AudioProvider platform="desktop">
          <AudioHarness onValue={onValue} />
        </AudioProvider>,
      );
    });
  }

  it("stops local transport and blocks play while system is selected", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    let audio = onValue.mock.lastCall[0];

    await act(async () => {
      audio.setIsAudioLoaded(true);
    });

    audio = onValue.mock.lastCall[0];

    await act(async () => {
      await audio.handleSourceChange("system");
    });

    audio = onValue.mock.lastCall[0];

    expect(audio.selectedSource).toBe("system");
    expect(handleLocalStopMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audio.handlePlayPause();
    });

    expect(handleLocalPlayPauseMock).not.toHaveBeenCalled();
  });
});
