/* @vitest-environment jsdom */

import React, { useEffect, useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDefaultAudioSessionMock } = vi.hoisted(() => ({
  getDefaultAudioSessionMock: vi.fn(),
}));

vi.mock("@baryon/engine/audio", () => ({
  getDefaultAudioSession: getDefaultAudioSessionMock,
}));

import { useAudioLogic } from "./useAudioLogic.jsx";

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function AudioLogicHarness({ onValue, renderVersion }) {
  const [fileName, setFileName] = useState("Upload Audio");
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiveInputActive, setIsLiveInputActive] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const logic = useAudioLogic({
    setFileName,
    resetFileName: () => setFileName("Upload Audio"),
    registerRecentFile: () => {},
    setIsAudioLoaded,
    setIsPlaying,
    setIsLiveInputActive,
    setLiveInputDeviceKind: () => {},
    setVolume,
    setIsMuted,
    setAudioDevices,
    setSelectedDevice,
    isAudioLoaded,
    isLiveInputActive,
    selectedDevice,
  });

  useEffect(() => {
    onValue({
      ...logic,
      audioDevices,
      fileName,
      isAudioLoaded,
      isMuted,
      isPlaying,
      renderVersion,
      volume,
    });
  }, [
    audioDevices,
    fileName,
    isAudioLoaded,
    isMuted,
    isPlaying,
    logic,
    onValue,
    renderVersion,
    volume,
  ]);

  return null;
}

describe("useAudioLogic local file lifetime", () => {
  let container;
  let root;
  let originalActEnvironment;
  let originalMediaDevices;
  let originalCreateObjectUrl;
  let originalRevokeObjectUrl;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    originalMediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        enumerateDevices: vi.fn(async () => []),
        removeEventListener: vi.fn(),
      },
    });
    originalCreateObjectUrl = URL.createObjectURL;
    originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:pending-audio");
    URL.revokeObjectURL = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    vi.restoreAllMocks();
  });

  it("keeps a pending local-file load alive without replaying it across consumer rerenders", async () => {
    const loadDeferred = createDeferred();
    let isSessionAudioLoaded = false;
    const session = {
      getStatus: () => ({
        isAudioLoaded: isSessionAudioLoaded,
        isPlaying: false,
        isLiveInputActive: false,
        liveInputDeviceKind: null,
        muted: false,
        volume: 1,
      }),
      loadAudio: vi.fn(async () => {
        await loadDeferred.promise;
        isSessionAudioLoaded = true;
        return true;
      }),
      stopLiveInputStream: vi.fn(),
    };
    getDefaultAudioSessionMock.mockReturnValue(session);
    const onValue = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AudioLogicHarness, {
          onValue,
          renderVersion: 0,
        }),
      );
    });

    let pendingLoad;
    await act(async () => {
      pendingLoad = onValue.mock.lastCall[0].handleRecentFileSelect(
        new File(["audio"], "queue-1.mp3", { type: "audio/mpeg" }),
      );
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        React.createElement(AudioLogicHarness, {
          onValue,
          renderVersion: 1,
        }),
      );
    });

    loadDeferred.resolve();
    let loaded;
    await act(async () => {
      loaded = await pendingLoad;
    });

    expect(loaded).toBe(true);
    expect(session.loadAudio).toHaveBeenCalledTimes(1);
    expect(onValue.mock.lastCall[0].fileName).toBe("queue-1.mp3");
    expect(onValue.mock.lastCall[0].isAudioLoaded).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:pending-audio");
  });
});
