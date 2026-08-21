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
  AUDIO_SOURCE_KINDS: Object.freeze({
    file: "file",
    system: "system",
  }),
  getDefaultAudioSession: getDefaultAudioSessionMock,
}));

vi.mock("../components/hooks/useAudioLogic", () => ({
  useAudioLogic: vi.fn((options = {}) => {
    const loadRecentFile = async (file) => {
      if (!file) return false;
      options.setFileName?.(file.name);
      const fileUrl = URL.createObjectURL(file);
      await getDefaultAudioSessionMock().loadAudio(fileUrl);
      options.registerRecentFile?.(file);
      const status = getDefaultAudioSessionMock().getStatus();
      options.setIsAudioLoaded?.(status.isAudioLoaded);
      options.setIsPlaying?.(status.isPlaying);
      return true;
    };

    return {
      handleFileChange: (event) =>
        loadRecentFile(event?.target?.files?.[0] ?? null),
      handleRecentFileSelect: loadRecentFile,
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
    };
  }),
}));

import { AudioProvider } from "./AudioProvider.jsx";
import { useAudio, useAudioScene } from "./AudioContext.jsx";
import { observeAudioTransportClock } from "./audioTransportClock.js";
import * as audioTransportClockModule from "./audioTransportClock.js";
import { CONTROL_SETTINGS_VERSION } from "@baryon/engine/controls/persistence";
import { SETTINGS_KEY } from "../components/hooks/baryonControlsState.js";
import { installLocalStorageMock } from "../test/installLocalStorageMock.js";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function AudioHarness({ onValue }) {
  const audio = useAudio();

  useEffect(() => {
    onValue(audio);
  }, [audio, onValue]);

  return null;
}

function AudioSceneHarness({ onValue }) {
  const audioScene = useAudioScene();

  useEffect(() => {
    onValue(audioScene);
  }, [audioScene, onValue]);

  return null;
}

function AudioRenderHarness({ onAudioRender, onClockRender }) {
  const audio = useAudio();

  onAudioRender(audio);
  useEffect(() => observeAudioTransportClock(onClockRender), [onClockRender]);
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
  let audioEndedCallback = null;

  it("audioTransportClock keeps snapshot getters internal", () => {
    expect("getAudioTransportClockSnapshot" in audioTransportClockModule).toBe(
      false,
    );
    expect("useAudioTransportClock" in audioTransportClockModule).toBe(false);
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
    audioEndedCallback = null;
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

  function renderProvider(
    onValue,
    {
      platform = "desktop",
      demoAudioFileLoader = null,
      loadAudioResult = true,
      onSceneValue = null,
    } = {},
  ) {
    let sessionAcousticIntent = "ambient";
    let sessionStatus = {
      isAudioLoaded: true,
      isPlaying: false,
      isLiveInputActive: false,
      volume: 1,
      muted: false,
      liveInputDeviceKind: null,
      liveInputKind: null,
      liveInputAnalysisClass: "auto",
      resolvedLiveInputAnalysisClass: "auto",
      selectedLiveInputDeviceId: null,
      selectedLiveInputDeviceLabel: "",
      sourceSession: {
        kind: "file",
        phase: "ready",
        sessionId: 0,
        timelineRevision: 0,
        terminalReason: null,
        systemCapture: null,
      },
    };

    const getStatus = () => ({
      ...sessionStatus,
      liveInputAcousticIntent: sessionAcousticIntent,
      sourceSession: {
        ...sessionStatus.sourceSession,
        systemCapture: sessionStatus.sourceSession.systemCapture
          ? { ...sessionStatus.sourceSession.systemCapture }
          : null,
      },
    });

    const replaceSource = (kind) => {
      const nextKind = kind === "system" ? "system" : "file";
      const previousSource = sessionStatus.sourceSession;
      if (previousSource.kind === nextKind) {
        return getStatus().sourceSession;
      }
      sessionStatus = {
        ...sessionStatus,
        isPlaying: false,
        isLiveInputActive: false,
        liveInputDeviceKind: null,
        liveInputKind: null,
        resolvedLiveInputAnalysisClass: "auto",
        selectedLiveInputDeviceId: null,
        selectedLiveInputDeviceLabel: "",
        sourceSession: {
          kind: nextKind,
          phase: "ready",
          sessionId: previousSource.sessionId + 1,
          timelineRevision:
            nextKind === "file" ? previousSource.timelineRevision : 0,
          terminalReason: null,
          systemCapture: null,
        },
      };
      return getStatus().sourceSession;
    };

    session = {
      getStatus,
      getTransportState: () => ({
        currentTimeSeconds: 0,
        durationSeconds: 0,
        canSeek: false,
      }),
      seekTo: vi.fn(async () => {}),
      setLiveInputAnalysisSettings: vi.fn((settings = {}) => {
        sessionAcousticIntent =
          settings.acousticIntent ?? sessionAcousticIntent;
      }),
      setAudioEndedCallback: vi.fn((callback) => {
        audioEndedCallback = callback;
      }),
      stopAudio: vi.fn(() => {
        sessionStatus = {
          ...sessionStatus,
          isPlaying: false,
          sourceSession:
            sessionStatus.sourceSession.kind === "file"
              ? {
                  ...sessionStatus.sourceSession,
                  phase: "ready",
                  terminalReason: "stopped",
                }
              : sessionStatus.sourceSession,
        };
      }),
      stopLiveInputStream: vi.fn(() => {
        sessionStatus = {
          ...sessionStatus,
          isLiveInputActive: false,
          liveInputDeviceKind: null,
          liveInputKind: null,
          resolvedLiveInputAnalysisClass: "auto",
          selectedLiveInputDeviceId: null,
          selectedLiveInputDeviceLabel: "",
          sourceSession:
            sessionStatus.sourceSession.kind === "system"
              ? {
                  ...sessionStatus.sourceSession,
                  phase: "stopped",
                  terminalReason: "stopped",
                  systemCapture: null,
                }
              : sessionStatus.sourceSession,
        };
        return getStatus();
      }),
      selectSource: vi.fn((kind) => {
        const nextKind = kind === "system" ? "system" : "file";
        if (nextKind === sessionStatus.sourceSession.kind) {
          return getStatus().sourceSession;
        }
        if (nextKind === "file") {
          session.stopLiveInputStream();
        }
        return replaceSource(nextKind);
      }),
      loadAudio: vi.fn(async () => {
        if (loadAudioResult === false) {
          return false;
        }
        const previousSource = sessionStatus.sourceSession;
        sessionStatus = {
          ...sessionStatus,
          isAudioLoaded: true,
          isPlaying: false,
          isLiveInputActive: false,
          liveInputDeviceKind: null,
          liveInputKind: null,
          resolvedLiveInputAnalysisClass: "auto",
          selectedLiveInputDeviceId: null,
          selectedLiveInputDeviceLabel: "",
          sourceSession: {
            kind: "file",
            phase: "ready",
            sessionId: previousSource.sessionId + 1,
            timelineRevision: previousSource.timelineRevision + 1,
            terminalReason: null,
            systemCapture: null,
          },
        };
        return true;
      }),
      playPauseAudio: vi.fn(async () => {
        if (sessionStatus.sourceSession.kind !== "file") {
          return false;
        }
        const isPlaying = !sessionStatus.isPlaying;
        sessionStatus = {
          ...sessionStatus,
          isPlaying,
          sourceSession: {
            ...sessionStatus.sourceSession,
            phase: isPlaying ? "active" : "paused",
            terminalReason: null,
          },
        };
        return true;
      }),
      startLiveInputStream: vi.fn(async (deviceId, deviceKind, deviceLabel) => {
        if (sessionStatus.sourceSession.kind !== "system") {
          replaceSource("system");
        }
        sessionStatus = {
          ...sessionStatus,
          isAudioLoaded: false,
          isPlaying: false,
          isLiveInputActive: true,
          liveInputDeviceKind: deviceKind,
          liveInputKind: deviceKind,
          resolvedLiveInputAnalysisClass:
            deviceKind === "system" ? "line-feed" : "live",
          selectedLiveInputDeviceId: deviceId,
          selectedLiveInputDeviceLabel: deviceLabel,
          sourceSession: {
            ...sessionStatus.sourceSession,
            phase: "active",
            terminalReason: null,
            systemCapture: {
              deviceId,
              deviceKind,
              deviceLabel,
            },
          },
        };
        return true;
      }),
      dispose: () => Promise.resolve(),
    };
    getDefaultAudioSessionMock.mockReturnValue(session);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <AudioProvider
          platform={platform}
          demoAudioFileLoader={demoAudioFileLoader}
        >
          <AudioHarness onValue={onValue} />
          {onSceneValue ? <AudioSceneHarness onValue={onSceneValue} /> : null}
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

  it("hydrates acoustic intent from v2 control settings", async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 2,
        controls: {
          liveInputAcousticIntent: "vocal",
        },
      }),
    );
    const onValue = vi.fn();
    renderProvider(onValue);

    expect(onValue.mock.lastCall[0].liveInputAcousticIntent).toBe("vocal");
  });

  it("migrates acoustic intent persistence to current control settings", async () => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 2,
        bloomStrength: 2.1,
        liveInputAcousticIntent: "ambient",
        liveInputAnalysisOverrides: {
          "device-1": "line-feed",
        },
        controls: {
          backgroundColor: "#112233",
        },
      }),
    );
    const onValue = vi.fn();
    renderProvider(onValue);

    await act(async () => {
      onValue.mock.lastCall[0].setLiveInputAcousticIntent("vocal");
    });

    const settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
    expect(settings).toEqual({
      version: CONTROL_SETTINGS_VERSION,
      liveInputAnalysisOverrides: {
        "device-1": "line-feed",
      },
      controls: {
        backgroundColor: "#112233",
        liveInputAcousticIntent: "vocal",
      },
    });
    expect(settings).not.toHaveProperty("liveInputAcousticIntent");
    expect(settings).not.toHaveProperty("bloomStrength");
  });

  it("persists analysis overrides without retaining stale top-level controls", async () => {
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
        deviceId: "device-1",
        label: "BlackHole 2ch (Virtual)",
      },
    ]);
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 2,
        bloomStrength: 2.1,
        liveInputAcousticIntent: "ambient",
        controls: {
          backgroundColor: "#112233",
        },
      }),
    );
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });

    await act(async () => {
      await onValue.mock.lastCall[0].requestLiveInputPermission();
    });
    await act(async () => {
      onValue.mock.lastCall[0].setSelectedLiveInputAnalysisClass("line-feed");
    });

    const settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
    expect(settings).toEqual({
      version: CONTROL_SETTINGS_VERSION,
      liveInputAnalysisOverrides: {
        "device-1": "line-feed",
      },
      controls: {
        backgroundColor: "#112233",
      },
    });
    expect(settings).not.toHaveProperty("liveInputAcousticIntent");
    expect(settings).not.toHaveProperty("bloomStrength");
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

  it("starts live input through the canonical Go Live action", async () => {
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
    await act(async () => {
      await audio.handleLiveInputAction();
    });

    expect(session.startLiveInputStream).toHaveBeenCalledWith(
      "main-window-device-9",
      "system",
      "BlackHole 2ch (Virtual)",
    );
  });

  it("preserves device contention through the provider runtime owner", async () => {
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
        label: "Studio Audio Interface",
      },
    ]);
    const onValue = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderProvider(onValue, { platform: "web" });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.requestLiveInputPermission();
    });
    session.startLiveInputStream.mockRejectedValue(
      Object.assign(new Error("Could not start audio source"), {
        name: "NotReadableError",
      }),
    );

    audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.handleLiveInputAction();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.liveInputRuntimeStatus).toMatchObject({
      active: false,
      phase: "error",
      errorCode: "device-unavailable",
    });
    consoleError.mockRestore();
  });

  it("cancels a pending Go Live request when the source switches to File", async () => {
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

    const pendingStart = createDeferred();
    session.startLiveInputStream.mockReturnValue(pendingStart.promise);
    let startRequest;
    audio = onValue.mock.lastCall[0];
    await act(async () => {
      startRequest = audio.handleLiveInputAction();
      await Promise.resolve();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.sourceSession.kind).toBe("system");
    expect(session.startLiveInputStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audio.handleSourceChange("file");
    });
    pendingStart.resolve();
    await act(async () => {
      await startRequest;
    });

    audio = onValue.mock.lastCall[0];
    expect(session.stopLiveInputStream).toHaveBeenCalledTimes(1);
    expect(audio.sourceSession.kind).toBe("file");
    expect(audio.liveInputUiState).not.toBe("active");
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
    const onSceneValue = vi.fn();
    renderProvider(onValue, { onSceneValue });

    let audio = onValue.mock.lastCall[0];
    expect(audio.selectedLiveDeviceId).toBeNull();

    await act(async () => {
      onSceneValue.mock.lastCall[0].setLiveInputRuntimeStatus({
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

  it("keeps frame-owned line-feed status across control refreshes", async () => {
    const onValue = vi.fn();
    const onSceneValue = vi.fn();
    renderProvider(onValue, { onSceneValue });

    session.getStatus = () => ({
      isAudioLoaded: true,
      isPlaying: false,
      isLiveInputActive: true,
      volume: 1,
      muted: false,
      liveInputDeviceKind: "system",
      liveInputKind: "system",
      liveInputAnalysisClass: "auto",
      resolvedLiveInputAnalysisClass: "line-feed",
      liveInputAcousticIntent: "ambient",
      selectedLiveInputDeviceId: "runtime-blackhole-id",
      selectedLiveInputDeviceLabel: "BlackHole 2ch (Virtual)",
      sourceSession: {
        kind: "system",
        phase: "active",
        sessionId: 1,
        timelineRevision: 0,
        terminalReason: null,
        systemCapture: {
          deviceId: "runtime-blackhole-id",
          deviceKind: "system",
          deviceLabel: "BlackHole 2ch (Virtual)",
        },
      },
    });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      onSceneValue.mock.lastCall[0].setLiveInputRuntimeStatus({
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
        sourceBoundaryState: "live",
        signalState: "ok",
        errorCode: "none",
      });
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("__baryon-controls-change", {
          detail: { boundaryMode: "dirichlet" },
        }),
      );
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.liveInputRuntimeStatus).toMatchObject({
      active: true,
      phase: "listening",
      gateOpen: true,
      sourceBoundaryState: "live",
      signalState: "ok",
      resolvedAnalysisClass: "line-feed",
    });
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

  async function flushAsyncWork() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("selects System through the session owner and blocks File play", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    let audio = onValue.mock.lastCall[0];

    await act(async () => {
      await audio.handleFileChange({
        target: { files: [new File(["audio"], "track.wav")], value: "" },
      });
    });

    audio = onValue.mock.lastCall[0];

    await act(async () => {
      await audio.handleSourceChange("system");
    });

    audio = onValue.mock.lastCall[0];

    expect(audio.sourceSession.kind).toBe("system");
    expect(session.selectSource).toHaveBeenCalledWith("system");
    expect(session.getStatus().isPlaying).toBe(false);
    expect(handleLocalStopMock).not.toHaveBeenCalled();

    await act(async () => {
      await audio.handlePlayPause();
    });

    expect(handleLocalPlayPauseMock).not.toHaveBeenCalled();
  });

  it("builds an ordered queue from multi-file uploads without interrupting the active track", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);
    const first = new File(["first"], "first.wav");
    const second = new File(["second"], "second.wav");
    const third = new File(["third"], "third.wav");

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: { files: [first, second], value: "" },
      });
    });

    let audio = onValue.mock.lastCall[0];
    expect(audio.localFileQueue.map((entry) => entry.name)).toEqual([
      "first.wav",
      "second.wav",
    ]);
    expect(audio.activeLocalFileQueueIndex).toBe(0);
    expect(audio.hasNextLocalFile).toBe(true);
    expect(session.loadAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audio.handleFileChange({
        target: { files: [third], value: "" },
      });
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.localFileQueue.map((entry) => entry.name)).toEqual([
      "first.wav",
      "second.wav",
      "third.wav",
    ]);
    expect(audio.activeLocalFileQueueIndex).toBe(0);
    expect(session.loadAudio).toHaveBeenCalledTimes(1);
  });

  it("plays any selected queue entry without rebuilding the queue", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);
    const first = new File(["first"], "first.wav");
    const second = new File(["second"], "second.wav");
    const third = new File(["third"], "third.wav");

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: { files: [first, second, third], value: "" },
      });
    });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.playLocalFileAtQueueIndex(2);
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.localFileQueue.map((entry) => entry.name)).toEqual([
      "first.wav",
      "second.wav",
      "third.wav",
    ]);
    expect(audio.activeLocalFileQueueIndex).toBe(2);
    expect(audio.displayName).toBe("third.wav");
    expect(session.loadAudio).toHaveBeenCalledTimes(2);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audio.playLocalFileAtQueueIndex(2);
    });

    expect(session.loadAudio).toHaveBeenCalledTimes(2);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
  });

  it("autoplays a selected recent upload", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: {
          files: [new File(["audio"], "recent.wav")],
          value: "",
        },
      });
    });

    let audio = onValue.mock.lastCall[0];
    await act(async () => {
      await audio.handleRecentUploadSelect(audio.recentUploads[0].id);
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.displayName).toBe("recent.wav");
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale queue load reclaim the active index after the queue is replaced", async () => {
    const onValue = vi.fn();
    const firstLoad = createDeferred();
    const demoAudioFileLoader = vi.fn(
      async () => new File(["demo"], "baryon-demo.mp3"),
    );
    renderProvider(onValue, { demoAudioFileLoader });
    session.loadAudio
      .mockImplementationOnce(() => firstLoad.promise)
      .mockResolvedValue(undefined);

    let pendingUpload;
    await act(async () => {
      pendingUpload = onValue.mock.lastCall[0].handleFileChange({
        target: {
          files: [
            new File(["first"], "first.wav"),
            new File(["second"], "second.wav"),
          ],
          value: "",
        },
      });
      await Promise.resolve();
    });

    let audio = onValue.mock.lastCall[0];
    expect(audio.localFileQueue).toHaveLength(2);
    expect(audio.activeLocalFileQueueIndex).toBe(0);

    let demoLoadResult;
    await act(async () => {
      demoLoadResult = await audio.loadDemoAudioFile({ autoPlay: false });
    });
    expect(demoAudioFileLoader).toHaveBeenCalledTimes(1);
    expect(demoLoadResult).toMatchObject({ ok: true });

    firstLoad.resolve();
    await act(async () => {
      await pendingUpload;
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.localFileQueue).toEqual([]);
    expect(audio.activeLocalFileQueueIndex).toBe(-1);
  });

  it("keeps Next available while the selected queue file is still loading", async () => {
    const onValue = vi.fn();
    const firstLoad = createDeferred();
    renderProvider(onValue);
    session.loadAudio
      .mockImplementationOnce(() => firstLoad.promise)
      .mockResolvedValue(undefined);

    let pendingFirstLoad;
    await act(async () => {
      pendingFirstLoad = onValue.mock.lastCall[0].handleFileChange({
        target: {
          files: [
            new File(["first"], "first.wav"),
            new File(["second"], "second.wav"),
          ],
          value: "",
        },
      });
      await Promise.resolve();
    });

    let audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(0);
    expect(audio.hasNextLocalFile).toBe(true);

    await act(async () => {
      await audio.playNextLocalFile();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(1);
    expect(audio.displayName).toBe("second.wav");
    expect(session.loadAudio).toHaveBeenCalledTimes(2);

    firstLoad.resolve();
    await act(async () => {
      await pendingFirstLoad;
    });

    expect(onValue.mock.lastCall[0].activeLocalFileQueueIndex).toBe(1);
  });

  it("autoplays the next queued file exactly once when the active file ends", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);
    const first = new File(["first"], "first.wav");
    const second = new File(["second"], "second.wav");
    const third = new File(["third"], "third.wav");

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: { files: [first, second, third], value: "" },
      });
    });

    expect(audioEndedCallback).toEqual(expect.any(Function));

    await act(async () => {
      await Promise.all([audioEndedCallback(), audioEndedCallback()]);
    });

    let audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(1);
    expect(audio.displayName).toBe("second.wav");
    expect(session.loadAudio).toHaveBeenCalledTimes(2);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audioEndedCallback();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(2);
    expect(session.loadAudio).toHaveBeenCalledTimes(3);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(2);

    await act(async () => {
      await audioEndedCallback();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(2);
    expect(session.loadAudio).toHaveBeenCalledTimes(3);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(2);
  });

  it("leaves natural queue advance idle when autoplay is disabled", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);
    const first = new File(["first"], "first.wav");
    const second = new File(["second"], "second.wav");

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: { files: [first, second], value: "" },
      });
    });

    let audio = onValue.mock.lastCall[0];
    expect(audio.isLocalFileQueueAutoplayEnabled).toBe(true);

    act(() => {
      audio.toggleLocalFileQueueAutoplay();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.isLocalFileQueueAutoplayEnabled).toBe(false);

    await act(async () => {
      await audioEndedCallback();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(0);
    expect(audio.displayName).toBe("first.wav");
    expect(session.loadAudio).toHaveBeenCalledTimes(1);
    expect(session.playPauseAudio).not.toHaveBeenCalled();

    await act(async () => {
      await audio.playNextLocalFile();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(1);
    expect(audio.displayName).toBe("second.wav");
    expect(session.loadAudio).toHaveBeenCalledTimes(2);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
  });

  it("returns a progressed track to idle before loading the previous track at zero", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);
    const first = new File(["first"], "first.wav");
    const second = new File(["second"], "second.wav");

    await act(async () => {
      await onValue.mock.lastCall[0].handleFileChange({
        target: { files: [first, second], value: "" },
      });
    });

    await act(async () => {
      await onValue.mock.lastCall[0].playNextLocalFile();
    });

    let currentTimeSeconds = 24;
    session.getTransportState = () => ({
      currentTimeSeconds,
      durationSeconds: 120,
      canSeek: true,
    });
    let audio = onValue.mock.lastCall[0];

    expect(audio.activeLocalFileQueueIndex).toBe(1);
    expect(audio.hasPreviousLocalFile).toBe(true);

    await act(async () => {
      await audio.restartOrLoadPreviousLocalFile();
    });

    audio = onValue.mock.lastCall[0];
    expect(session.stopAudio).toHaveBeenCalledTimes(1);
    expect(session.seekTo).not.toHaveBeenCalled();
    expect(audio.activeLocalFileQueueIndex).toBe(1);
    expect(audio.displayName).toBe("second.wav");

    currentTimeSeconds = 0;
    await act(async () => {
      await audio.restartOrLoadPreviousLocalFile();
    });

    audio = onValue.mock.lastCall[0];
    expect(audio.activeLocalFileQueueIndex).toBe(0);
    expect(audio.displayName).toBe("first.wav");
    expect(audio.hasPreviousLocalFile).toBe(false);
    expect(session.loadAudio).toHaveBeenCalledTimes(3);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
  });

  it("does not expose transport state through the shared audio context", async () => {
    const onValue = vi.fn();
    renderProvider(onValue);

    expect(onValue.mock.lastCall[0].transportState).toBeUndefined();
    expect(onValue.mock.lastCall[0].setIsAudioLoaded).toBeUndefined();
    expect(onValue.mock.lastCall[0].setSelectedSource).toBeUndefined();
  });

  it("loads a desktop bridge demo audio file through the local file pipeline", async () => {
    const hadCreateObjectUrl = "createObjectURL" in globalThis.URL;
    const hadRevokeObjectUrl = "revokeObjectURL" in globalThis.URL;
    const hadWindowCreateObjectUrl = "createObjectURL" in window.URL;
    const hadWindowRevokeObjectUrl = "revokeObjectURL" in window.URL;
    const originalCreateObjectUrl = globalThis.URL.createObjectURL;
    const originalRevokeObjectUrl = globalThis.URL.revokeObjectURL;
    const originalWindowCreateObjectUrl = window.URL.createObjectURL;
    const originalWindowRevokeObjectUrl = window.URL.revokeObjectURL;
    const createObjectUrl = vi.fn(() => "blob:desktop-demo-audio");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrl,
    });
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectUrl,
    });

    const demoAudioFileLoader = vi.fn(
      async () =>
        new window.File(["audio"], "baryon-demo.mp3", {
          type: "audio/mpeg",
          lastModified: 0,
        }),
    );
    const onValue = vi.fn();
    try {
      renderProvider(onValue, { platform: "desktop", demoAudioFileLoader });

      let audio = onValue.mock.lastCall[0];
      await act(async () => {
        await audio.loadDemoAudioFile();
      });

      audio = onValue.mock.lastCall[0];
      expect(demoAudioFileLoader).toHaveBeenCalledTimes(1);
      expect(session.loadAudio).toHaveBeenCalledWith("blob:desktop-demo-audio");
      expect(audio.displayName).toBe("baryon-demo.mp3");
      expect(audio.sourceSession.kind).toBe("file");
      expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
    } finally {
      if (hadCreateObjectUrl) {
        Object.defineProperty(globalThis.URL, "createObjectURL", {
          configurable: true,
          writable: true,
          value: originalCreateObjectUrl,
        });
      } else {
        delete globalThis.URL.createObjectURL;
      }
      if (hadWindowCreateObjectUrl) {
        Object.defineProperty(window.URL, "createObjectURL", {
          configurable: true,
          writable: true,
          value: originalWindowCreateObjectUrl,
        });
      } else {
        delete window.URL.createObjectURL;
      }
      if (hadRevokeObjectUrl) {
        Object.defineProperty(globalThis.URL, "revokeObjectURL", {
          configurable: true,
          writable: true,
          value: originalRevokeObjectUrl,
        });
      } else {
        delete globalThis.URL.revokeObjectURL;
      }
      if (hadWindowRevokeObjectUrl) {
        Object.defineProperty(window.URL, "revokeObjectURL", {
          configurable: true,
          writable: true,
          value: originalWindowRevokeObjectUrl,
        });
      } else {
        delete window.URL.revokeObjectURL;
      }
    }
  });

  it("preloads the desktop demo without autoplaying it", async () => {
    const originalCreateObjectUrl = window.URL.createObjectURL;
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:preloaded-desktop-demo"),
    });
    const demoAudioFileLoader = vi.fn(
      async () =>
        new window.File(["audio"], "baryon-demo.mp3", {
          type: "audio/mpeg",
        }),
    );
    const onValue = vi.fn();
    try {
      renderProvider(onValue, { platform: "desktop", demoAudioFileLoader });

      await flushAsyncWork();

      expect(demoAudioFileLoader).toHaveBeenCalledTimes(1);
      expect(session.loadAudio).toHaveBeenCalledTimes(1);
      expect(session.playPauseAudio).not.toHaveBeenCalled();
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(window.URL, "createObjectURL", {
          configurable: true,
          writable: true,
          value: originalCreateObjectUrl,
        });
      } else {
        delete window.URL.createObjectURL;
      }
    }
  });

  it("does not let a pending desktop demo preload reclaim System after Go Live", async () => {
    const originalCreateObjectUrl = window.URL.createObjectURL;
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn(() => "blob:pending-desktop-demo"),
    });
    const pendingDemoFile = createDeferred();
    const demoAudioFileLoader = vi.fn(() => pendingDemoFile.promise);
    const onValue = vi.fn();

    try {
      renderProvider(onValue, { platform: "desktop", demoAudioFileLoader });
      expect(demoAudioFileLoader).toHaveBeenCalledTimes(1);

      await act(async () => {
        onValue.mock.lastCall[0].setSelectedDevice("loopback-1");
        await Promise.resolve();
      });

      await act(async () => {
        await onValue.mock.lastCall[0].handleLiveInputAction();
      });
      expect(session.startLiveInputStream).toHaveBeenCalledTimes(1);

      pendingDemoFile.resolve(
        new window.File(["audio"], "baryon-demo.mp3", {
          type: "audio/mpeg",
        }),
      );
      await flushAsyncWork();

      expect(session.loadAudio).not.toHaveBeenCalled();
      expect(onValue.mock.lastCall[0].sourceSession.kind).toBe("system");
    } finally {
      if (originalCreateObjectUrl) {
        Object.defineProperty(window.URL, "createObjectURL", {
          configurable: true,
          writable: true,
          value: originalCreateObjectUrl,
        });
      } else {
        delete window.URL.createObjectURL;
      }
    }
  });

  it("preloads the demo audio on web startup without autoplaying it", async () => {
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });

    await flushAsyncWork();

    const audio = onValue.mock.lastCall[0];
    expect(session.loadAudio).toHaveBeenCalledWith("/audio/baryon-demo.mp3");
    expect(session.playPauseAudio).not.toHaveBeenCalled();
    expect(audio.displayName).toBe("baryon-demo.mp3");
    expect(audio.sourceSession.kind).toBe("file");
  });

  it("starts the already-preloaded web demo without loading or decoding it again", async () => {
    const onValue = vi.fn();
    renderProvider(onValue, { platform: "web" });
    await flushAsyncWork();

    let audio = onValue.mock.lastCall[0];
    expect(session.loadAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      await audio.loadDemoAudioFile();
    });

    audio = onValue.mock.lastCall[0];
    expect(session.loadAudio).toHaveBeenCalledTimes(1);
    expect(session.playPauseAudio).toHaveBeenCalledTimes(1);
    expect(audio.displayName).toBe("baryon-demo.mp3");
  });

  it("does not let a superseded web preload claim transport authority", async () => {
    const onValue = vi.fn();
    renderProvider(onValue, {
      platform: "web",
      loadAudioResult: false,
    });
    await flushAsyncWork();

    let result;
    await act(async () => {
      result = await onValue.mock.lastCall[0].loadDemoAudioFile();
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Demo audio load was superseded.",
    });
    expect(session.loadAudio).toHaveBeenCalledTimes(2);
    expect(session.playPauseAudio).not.toHaveBeenCalled();
    expect(onValue.mock.lastCall[0].displayName).toBe("Upload Audio");
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
        sourceSession: {
          kind: "file",
          phase: "active",
          sessionId: 1,
          timelineRevision: 0,
          terminalReason: null,
          systemCapture: null,
        },
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
      selectSource: () => {},
      loadAudio: async () => {},
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
      await audio.handleFileChange({
        target: { files: [new File(["audio"], "track.wav")], value: "" },
      });
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
    expect(postTickAudioCalls).toHaveLength(0);
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
