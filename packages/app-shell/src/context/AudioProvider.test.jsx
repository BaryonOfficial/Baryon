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

vi.mock("@baryon/engine/audio", () => ({
  getDefaultAudioSession: getDefaultAudioSessionMock,
}));

vi.mock("../components/hooks/useAudioLogic", () => ({
  useAudioLogic: vi.fn((options = {}) => ({
    handleFileChange: () => {},
    handleRecentFileSelect: () => {},
    handlePlayPause: handleLocalPlayPauseMock,
    handleStop: handleLocalStopMock,
    handleVolumeChange: () => {},
    handleMuteToggle: () => {},
    refreshAudioInputs: async () => {
      const audioInputs = await refreshAudioInputsMock();
      options.setAudioDevices?.(audioInputs);
      if (
        audioInputs.length > 0 &&
        !audioInputs.some(
          (device) => device.deviceId === options.selectedDevice,
        )
      ) {
        options.setSelectedDevice?.(audioInputs[0].deviceId);
      }
      return audioInputs;
    },
  })),
}));

import { AudioProvider } from "./AudioProvider.jsx";
import { useAudio } from "./AudioContext.jsx";
import { useAudioTransportClock } from "./audioTransportClock.js";
import * as audioTransportClockModule from "./audioTransportClock.js";
import { installLocalStorageMock } from "../test/installLocalStorageMock.js";

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
  let originalMediaPause;
  let originalMediaLoad;
  let originalIsSecureContextDescriptor;
  let originalMediaDevicesDescriptor;

  it("audioTransportClock keeps snapshot getters internal", () => {
    expect("getAudioTransportClockSnapshot" in audioTransportClockModule).toBe(
      false,
    );
  });

  beforeEach(() => {
    installLocalStorageMock();
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalIsSecureContextDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "isSecureContext",
    );
    originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices",
    );
    originalMediaPause = window.HTMLMediaElement.prototype.pause;
    originalMediaLoad = window.HTMLMediaElement.prototype.load;
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
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
    window.localStorage?.clear?.();
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
    window.HTMLMediaElement.prototype.pause = originalMediaPause;
    window.HTMLMediaElement.prototype.load = originalMediaLoad;
    if (originalIsSecureContextDescriptor) {
      Object.defineProperty(
        window,
        "isSecureContext",
        originalIsSecureContextDescriptor,
      );
    } else {
      delete window.isSecureContext;
    }
    if (originalMediaDevicesDescriptor) {
      Object.defineProperty(
        navigator,
        "mediaDevices",
        originalMediaDevicesDescriptor,
      );
    } else {
      delete navigator.mediaDevices;
    }
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function renderProvider(onValue, { platform = "desktop" } = {}) {
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
        <AudioProvider platform={platform}>
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

  it("passes the selected live input label to the audio runtime", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
        enumerateDevices: vi.fn(async () => []),
      },
    });
    refreshAudioInputsMock.mockResolvedValue([
      {
        kind: "audioinput",
        deviceId: "main-window-device-9",
        label: "BlackHole 2ch (Virtual)",
      },
    ]);
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.requestLiveInputPermission();
    });

    audio = onValue.mock.lastCall[0];

    expect(audio.selectedLiveDeviceId).toBe("main-window-device-9");
    expect(audio.selectedLiveInputDeviceKind).toBe("system");

    await act(async () => {
      await audio.handleSystemToggle();
    });

    expect(session.startLiveInputStream).toHaveBeenCalledWith(
      "main-window-device-9",
      "system",
      "BlackHole 2ch (Virtual)",
    );
  });

  it("keeps a selected live endpoint by label when the browser device id changes", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
        enumerateDevices: vi.fn(async () => []),
      },
    });
    refreshAudioInputsMock
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "stale-blackhole-id",
          label: "BlackHole 2ch (Virtual)",
        },
      ])
      .mockResolvedValueOnce([
        {
          kind: "audioinput",
          deviceId: "macbook-mic",
          label: "Default - MacBook Pro Microphone (Built-in)",
        },
        {
          kind: "audioinput",
          deviceId: "current-blackhole-id",
          label: "BlackHole 2ch (Virtual)",
        },
      ]);
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.requestLiveInputPermission();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveDeviceId).toBe("stale-blackhole-id");
    expect(audio.selectedLiveInputDeviceKind).toBe("system");

    await act(async () => {
      await audio.handleSystemToggle();
    });

    expect(session.startLiveInputStream).toHaveBeenCalledWith(
      "current-blackhole-id",
      "system",
      "BlackHole 2ch (Virtual)",
    );
    expect(session.startLiveInputStream).not.toHaveBeenCalledWith(
      "macbook-mic",
      expect.anything(),
      expect.anything(),
    );
  });

  it("uses runtime-selected live endpoint semantics when local devices are unavailable", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    let audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveDeviceId).toBeNull();

    await act(async () => {
      audio.setLiveInputRuntimeStatus({
        active: true,
        phase: "listening",
        liveInputDeviceKind: "system",
        liveInputKind: "system",
        selectedDeviceId: "runtime-blackhole-id",
        selectedDeviceLabel: "BlackHole 2ch (Virtual)",
        requestedAnalysisClass: "auto",
        acousticIntent: "ambient",
        resolvedAnalysisClass: "line-feed",
        calibrationActive: false,
        gateOpen: true,
        hardSilence: false,
        calibrationInvalid: false,
        calibrationInvalidReason: "none",
        signalState: "ok",
        errorCode: "none",
      });
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveDeviceId).toBe("runtime-blackhole-id");
    expect(audio.selectedLiveInputDeviceKind).toBe("system");
    expect(audio.selectedLiveInputKind).toBe("system");
    expect(audio.selectedResolvedLiveInputAnalysisClass).toBe("line-feed");

    await act(async () => {
      await audio.handleSystemToggle();
    });

    expect(session.startLiveInputStream).toHaveBeenCalledWith(
      "runtime-blackhole-id",
      "system",
      "BlackHole 2ch (Virtual)",
    );
  });

  it("owns selected device-kind override in the audio context", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
        enumerateDevices: vi.fn(async () => []),
      },
    });
    refreshAudioInputsMock.mockResolvedValue([
      {
        kind: "audioinput",
        deviceId: "blackhole-1",
        label: "BlackHole 2ch (Virtual)",
      },
    ]);
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.requestLiveInputPermission();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveInputDeviceKind).toBe("system");
    expect(audio.selectedLiveInputDeviceKindOverride).toBeNull();

    await act(async () => {
      audio.saveDeviceKindOverride("blackhole-1", "live");
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveInputDeviceKind).toBe("live");
    expect(audio.selectedLiveInputDeviceKindOverride).toBe("live");
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
