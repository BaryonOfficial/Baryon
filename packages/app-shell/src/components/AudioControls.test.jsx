/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAudioMock, useAudioTransportClockMock, useDraggableFloatingUiMock } =
  vi.hoisted(() => ({
    useAudioMock: vi.fn(),
    useAudioTransportClockMock: vi.fn(),
    useDraggableFloatingUiMock: vi.fn(),
  }));

vi.mock("../context/AudioContext.jsx", () => ({
  useAudio: useAudioMock,
}));

vi.mock("../context/audioTransportClock.js", () => ({
  useAudioTransportClock: useAudioTransportClockMock,
}));

vi.mock("./hooks/useDraggableFloatingUi.js", () => ({
  useDraggableFloatingUi: useDraggableFloatingUiMock,
}));

import { ListenerControls } from "./AudioControls.jsx";

describe("ListenerControls compact dock layout", () => {
  let container = null;
  let root = null;
  let originalActEnvironment;

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
    useAudioMock.mockReset();
    useAudioTransportClockMock.mockReset();
    useDraggableFloatingUiMock.mockReset();
    if (originalActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
    }
  });

  function createRecentUpload(name = "set-a.wav") {
    return {
      id: `${name}:0:0`,
      name,
      file: {},
      size: 0,
      lastModified: 0,
    };
  }

  function renderControls(audioOverrides = {}, { viewportWidth = 900 } = {}) {
    useDraggableFloatingUiMock.mockReturnValue({
      dragOffset: { x: 0, y: 0 },
      isDragging: false,
      handlePointerDown: () => {},
      handlePointerUp: () => {},
      handleDoubleClick: () => {},
    });

    useAudioMock.mockReturnValue({
      soundCloudEnabled: false,
      playbackSource: "local-file",
      selectedSource: "file",
      displayName: "Upload Audio",
      liveReturnLocalFile: null,
      queuedNextLocalFile: null,
      hasQueuedNextLocalFile: false,
      recentUploads: [],
      isPlaying: false,
      isLiveInputActive: false,
      liveInputDeviceKind: "system",
      isAudioLoaded: false,
      volume: 1,
      isMuted: false,
      isEngineReady: true,
      handleFileChange: () => {},
      handleRecentUploadSelect: () => {},
      handlePlayPause: () => {},
      handleStop: () => {},
      handleVolumeChange: () => {},
      handleMuteToggle: () => {},
      setShowDeviceMenu: () => {},
      showSoundCloudPanel: false,
      setShowSoundCloudPanel: () => {},
      soundCloudInput: "",
      setSoundCloudInput: () => {},
      soundCloudError: "",
      soundCloudInfo: null,
      soundCloudQueue: [],
      soundCloudCollectionTitle: "",
      soundCloudCurrentTrack: null,
      soundCloudCurrentIndex: 0,
      isSoundCloudLoading: false,
      loadSoundCloudTrack: () => {},
      scrubPreviewSeconds: null,
      isScrubbing: false,
      beginScrub: () => Promise.resolve(),
      previewScrub: () => {},
      commitScrub: () => Promise.resolve(),
      cancelScrub: () => Promise.resolve(),
      ...audioOverrides,
    });
    useAudioTransportClockMock.mockReturnValue({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: viewportWidth,
    });

    act(() => {
      root.render(<ListenerControls showSourceLiveButton={false} />);
    });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  }

  it("shows source and system when the system source is selected", () => {
    renderControls({
      playbackSource: "local-file",
      selectedSource: "system",
      liveInputDeviceKind: "live",
    });

    const trackMeta = container.querySelector(".am-compact-track-meta");
    const trackTitle = container.querySelector(".am-compact-track-title");

    expect(trackMeta?.textContent).toBe("Source");
    expect(trackTitle?.textContent).toBe("System");
  });

  it("shows upload-audio placeholder copy for the file source before a file is loaded", () => {
    renderControls({
      playbackSource: "local-file",
      selectedSource: "file",
      displayName: "Upload Audio",
    });

    const trackMeta = container.querySelector(".am-compact-track-meta");
    const trackTitle = container.querySelector(".am-compact-track-title");

    expect(trackMeta?.textContent).toBe("Source");
    expect(trackTitle?.textContent).toBe("Upload Audio File");
  });

  it("uses a semantic button for the full track upload trigger", () => {
    renderControls(
      {
        playbackSource: "local-file",
        selectedSource: "file",
        displayName: "Upload Audio",
      },
      { viewportWidth: 1200 },
    );

    const trackTrigger = container.querySelector(".am-track");

    expect(trackTrigger?.tagName).toBe("BUTTON");
    expect(trackTrigger?.getAttribute("type")).toBe("button");
  });

  it("marks the full play button active from playback state", () => {
    renderControls(
      {
        selectedSource: "file",
        isPlaying: true,
        isAudioLoaded: true,
      },
      { viewportWidth: 1200 },
    );

    const playButton = container.querySelector(".am-btn--play");

    expect(playButton?.classList.contains("am-btn--play-active")).toBe(true);
    expect(playButton?.getAttribute("aria-label")).toBe("Pause");
  });

  it("shows the loaded file name for the file source on compact layouts", () => {
    renderControls({
      playbackSource: "local-file",
      selectedSource: "file",
      displayName: "set-break-live.wav",
      isAudioLoaded: true,
    });

    const trackMeta = container.querySelector(".am-compact-track-meta");
    const trackTitle = container.querySelector(".am-compact-track-title");

    expect(trackMeta?.textContent).toBe("Source");
    expect(trackTitle?.textContent).toBe("set-break-live.wav");
  });

  it("disables compact playback controls when system is selected", () => {
    renderControls({
      selectedSource: "system",
      isAudioLoaded: true,
    });

    const playButton = container.querySelector('[aria-label="Play"]');
    const stopButton = container.querySelector('[aria-label="Stop"]');
    const timeline = container.querySelector(
      '[data-testid="playback-timeline"]',
    );

    expect(playButton?.hasAttribute("disabled")).toBe(true);
    expect(stopButton?.hasAttribute("disabled")).toBe(true);
    expect(timeline).toBeNull();
  });

  it("keeps long file names inside the compact dock width budget", () => {
    renderControls({
      selectedSource: "file",
      displayName:
        "very-long-recording-name-that-should-not-stretch-the-compact-dock-layout.wav",
      isAudioLoaded: true,
    });

    const shell = container.querySelector(".am-compact-shell");
    const playerShell = container.querySelector(".am-player-shell--compact");
    const title = container.querySelector(".am-compact-track-title");

    expect(shell).not.toBeNull();
    expect(playerShell).not.toBeNull();
    expect(title).not.toBeNull();
    expect(title.textContent).toContain("very-long-recording-name");
    expect(window.getComputedStyle(title).textOverflow).toBe("ellipsis");
    expect(window.getComputedStyle(title).whiteSpace).toBe("nowrap");
  });

  it("reserves a stable compact status slot width for longer playing copy", () => {
    renderControls({
      isPlaying: true,
      isAudioLoaded: true,
    });

    const stateChip = container.querySelector(".am-compact-state-chip");

    expect(stateChip).not.toBeNull();
    expect(stateChip.textContent).toContain("Playing");
    expect(window.getComputedStyle(stateChip).minWidth).toBe("4.5rem");
    expect(window.getComputedStyle(stateChip).justifyContent).toBe("center");
  });

  it("keeps recent uploads in the transport cluster and out of the source cluster", () => {
    renderControls({
      recentUploads: [createRecentUpload()],
      isAudioLoaded: true,
    });

    const sourceActions = container.querySelector(".am-compact-source-actions");
    const transportCluster = container.querySelector(
      ".am-compact-transport-right",
    );

    expect(sourceActions).not.toBeNull();
    expect(transportCluster).not.toBeNull();
    expect(
      sourceActions?.querySelector('[aria-label="Recent uploads"]'),
    ).toBeNull();
    expect(
      transportCluster?.querySelector('[aria-label="Recent uploads"]'),
    ).not.toBeNull();
  });

  it("keeps playback controls grouped inside the compact transport cluster", () => {
    renderControls({
      recentUploads: [createRecentUpload()],
      isAudioLoaded: true,
    });

    const unifiedActions = container.querySelector(
      ".am-compact-unified-actions",
    );
    const sourceActions = container.querySelector(".am-compact-source-actions");
    const transportCluster = container.querySelector(
      ".am-compact-transport-right",
    );
    const playbackGroup = container.querySelector(
      ".am-compact-action-group--playback",
    );

    expect(unifiedActions).not.toBeNull();
    expect(sourceActions).not.toBeNull();
    expect(transportCluster).not.toBeNull();
    expect(playbackGroup).not.toBeNull();
    expect(playbackGroup?.querySelector('[aria-label="Play"]')).not.toBeNull();
    expect(playbackGroup?.querySelector('[aria-label="Stop"]')).not.toBeNull();
    expect(
      playbackGroup?.querySelector(".am-compact-header-button"),
    ).toBeNull();
    expect(playbackGroup?.querySelector(".ac-source-compact-btn")).toBeNull();
    expect(
      playbackGroup?.querySelector('[aria-label="Recent uploads"]'),
    ).toBeNull();
  });

  it("places compact source controls before the transport group in the unified action row", () => {
    renderControls({
      recentUploads: [createRecentUpload()],
      isAudioLoaded: true,
    });

    const unifiedActions = container.querySelector(
      ".am-compact-unified-actions",
    );
    const sourceControls = container.querySelector(
      ".am-compact-unified-actions .am-compact-source-actions",
    );
    const transportControls = container.querySelector(
      ".am-compact-unified-actions .am-compact-transport-right",
    );

    expect(unifiedActions?.firstElementChild).toBe(sourceControls);
    expect(sourceControls).not.toBeNull();
    expect(transportControls).not.toBeNull();
    expect(
      sourceControls?.querySelector(".am-compact-header-button"),
    ).not.toBeNull();
    expect(
      sourceControls?.querySelector('[aria-label="Use file source"]'),
    ).not.toBeNull();
    expect(
      sourceControls?.querySelector('[aria-label="Use system source"]'),
    ).not.toBeNull();
  });

  it("uses tighter compact transport sizing after removing utility controls from the dock", () => {
    renderControls({
      isAudioLoaded: true,
    });

    const playButton = container.querySelector(
      ".am-compact-action-group--playback [aria-label='Play']",
    );

    expect(playButton).not.toBeNull();
    expect(window.getComputedStyle(playButton).width).toBe("40px");
    expect(window.getComputedStyle(playButton).height).toBe("40px");
  });
});
