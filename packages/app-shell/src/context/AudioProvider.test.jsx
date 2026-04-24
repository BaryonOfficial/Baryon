/* @vitest-environment jsdom */

import React, { useEffect } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { useAudioTransportClock } from "./audioTransportClock.js";
import * as audioTransportClockModule from "./audioTransportClock.js";

function AudioHarness({ onValue }) {
  const audio = useAudio();

  useEffect(() => {
    onValue(audio);
  }, [audio, onValue]);

  return null;
}

function AudioRenderHarness({ onAudioRender, onClockRender }) {
  const audio = useAudio();
  const transportClock = useAudioTransportClock();

  onAudioRender(audio);
  onClockRender(transportClock);
  return null;
}

describe("AudioProvider source transport gating", () => {
  let container = null;
  let root = null;
  let session = null;
  let animationFrameCallbacks = [];
  let nextAnimationFrameId = 1;
  let originalActEnvironment;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;

  it("audioTransportClock keeps snapshot getters internal", () => {
    expect("getAudioTransportClockSnapshot" in audioTransportClockModule).toBe(
      false,
    );
  });

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

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
    animationFrameCallbacks = [];
    nextAnimationFrameId = 1;
    if (originalRequestAnimationFrame) {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      originalRequestAnimationFrame = null;
    }
    if (originalCancelAnimationFrame) {
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      originalCancelAnimationFrame = null;
    }
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function renderProvider(onValue) {
    let sessionAcousticIntent = "ambient";
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
        liveInputAcousticIntent: sessionAcousticIntent,
      }),
      getTransportState: () => ({
        currentTimeSeconds: 0,
        durationSeconds: 0,
        canSeek: false,
      }),
      seekTo: () => {},
      setLiveInputAnalysisSettings: vi.fn((settings = {}) => {
        sessionAcousticIntent =
          settings.acousticIntent ?? sessionAcousticIntent;
      }),
      setAudioEndedCallback: () => {},
      stopAudio: () => {},
      stopLiveInputStream: vi.fn(),
      playPauseAudio: async () => {},
      startLiveInputStream: vi.fn(async () => {}),
      dispose: () => Promise.resolve(),
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

  it("updates acoustic intent without toggling live input or changing device", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    let audio = onValue.mock.lastCall[0];

    await act(async () => {
      audio.setLiveInputAcousticIntent("vocal");
    });

    audio = onValue.mock.lastCall[0];

    expect(audio.liveInputAcousticIntent).toBe("vocal");
    expect(session.setLiveInputAnalysisSettings).toHaveBeenCalledWith({
      acousticIntent: "vocal",
    });
    expect(session.stopLiveInputStream).not.toHaveBeenCalled();
    expect(session.startLiveInputStream).not.toHaveBeenCalled();
  });

  function installAnimationFrameHarness() {
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    animationFrameCallbacks = [];
    nextAnimationFrameId = 1;
    window.requestAnimationFrame = (callback) => {
      const id = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrameCallbacks.push({ id, callback });
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      animationFrameCallbacks = animationFrameCallbacks.filter(
        (entry) => entry.id !== id,
      );
    };
  }

  async function flushAnimationFrame(nextNow = 0) {
    const nextCallback = animationFrameCallbacks.shift()?.callback ?? null;
    await act(async () => {
      nextCallback?.(nextNow);
      await Promise.resolve();
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

  it("does not expose transport state through the shared audio context", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    const audio = onValue.mock.lastCall[0];

    await act(async () => {
      audio.setIsAudioLoaded(true);
    });

    expect(onValue.mock.lastCall[0].transportState).toBeUndefined();
  });

  it("keeps non-timeline audio consumers stable while the transport clock ticks", async () => {
    let transportTimeSeconds = 0;
    const onAudioRender = vi.fn();
    const onClockRender = vi.fn();
    installAnimationFrameHarness();
    session = {
      getStatus: () => ({
        isAudioLoaded: true,
        isPlaying: true,
        isLiveInputActive: false,
        volume: 1,
        muted: false,
        liveInputDeviceKind: null,
        liveInputKind: null,
        liveInputAnalysisClass: "auto",
        resolvedLiveInputAnalysisClass: "auto",
      }),
      getTransportState: () => ({
        currentTimeSeconds: transportTimeSeconds,
        durationSeconds: 120,
        canSeek: true,
      }),
      seekTo: () => {},
      setLiveInputAnalysisSettings: () => {},
      setAudioEndedCallback: () => {},
      stopAudio: () => {},
      stopLiveInputStream: () => {},
      playPauseAudio: async () => {},
      startLiveInputStream: async () => {},
      dispose: () => Promise.resolve(),
    };
    getDefaultAudioSessionMock.mockReturnValue(session);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <AudioProvider platform="desktop">
          <AudioRenderHarness
            onAudioRender={onAudioRender}
            onClockRender={onClockRender}
          />
        </AudioProvider>,
      );
      await Promise.resolve();
    });

    const audio = onAudioRender.mock.lastCall[0];

    await act(async () => {
      audio.setIsAudioLoaded(true);
      await Promise.resolve();
    });

    const audioRenderBaseline = onAudioRender.mock.calls.length;
    const initialClockRenderCount = onClockRender.mock.calls.length;
    const stableAudioReference = onAudioRender.mock.lastCall[0];
    expect(stableAudioReference.transportState).toBeUndefined();

    transportTimeSeconds = 1;
    await flushAnimationFrame(16);
    transportTimeSeconds = 2;
    await flushAnimationFrame(32);
    transportTimeSeconds = 3;
    await flushAnimationFrame(48);

    const postTickAudioCalls =
      onAudioRender.mock.calls.slice(audioRenderBaseline);
    expect(postTickAudioCalls.length).toBeGreaterThan(0);
    for (const [audioValue] of postTickAudioCalls) {
      expect(audioValue).toBe(stableAudioReference);
    }
    expect(onClockRender.mock.calls.length).toBeGreaterThan(
      initialClockRenderCount,
    );
    expect(onClockRender.mock.lastCall[0]).toMatchObject({
      currentTimeSeconds: 3,
      durationSeconds: 120,
      canSeek: true,
    });
  });
});
