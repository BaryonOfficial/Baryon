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

  it("shows the source control without the compact file dock in system mode", () => {
    renderControls({
      playbackSource: "local-file",
      selectedSource: "system",
      liveInputDeviceKind: "live",
      recentUploads: [createRecentUpload()],
    });

    const sourceControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );

    expect(sourceControl).not.toBeNull();
    expect(
      sourceControl?.querySelector('[data-testid="file-source-tab"]'),
    ).not.toBeNull();
    expect(
      sourceControl?.querySelector('[data-testid="live-input-source-tab"]'),
    ).not.toBeNull();
    expect(container.querySelector(".am-player-shell")).toBeNull();
    expect(container.querySelector(".am-compact-header-button")).toBeNull();
    expect(container.querySelector('[aria-label="Play"]')).toBeNull();
    expect(container.querySelector('[aria-label="Stop"]')).toBeNull();
    expect(container.querySelector('[aria-label="Recent uploads"]')).toBeNull();
    expect(container.querySelector(".am-compact-volume-row")).toBeNull();
  });

  it("aligns the standalone source control to the top-right overlay rail", () => {
    renderControls({
      playbackSource: "local-file",
      selectedSource: "system",
      liveInputDeviceKind: "system",
    });

    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(injectedCss).toContain(`.am-source-mode-shell {
  position: fixed;
  right: 0.9rem;`);
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

  it("removes the full file dock when system is selected", () => {
    renderControls(
      {
        selectedSource: "system",
        recentUploads: [createRecentUpload()],
        isAudioLoaded: true,
      },
      { viewportWidth: 1200 },
    );

    expect(
      container.querySelector('[data-testid="source-mode-control"]'),
    ).not.toBeNull();
    expect(container.querySelector(".am-player-shell")).toBeNull();
    expect(container.querySelector(".am-track")).toBeNull();
    expect(container.querySelector(".am-source-icon")).toBeNull();
    expect(container.querySelector(".am-transport")).toBeNull();
    expect(container.querySelector(".am-volume-row")).toBeNull();
    expect(container.querySelector(".am-recent-panel")).toBeNull();
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

  it("keeps the full dock stop button bare while using shared pill metrics", () => {
    renderControls(
      {
        selectedSource: "file",
        isAudioLoaded: false,
      },
      { viewportWidth: 1200 },
    );

    const stopButton = container.querySelector(".am-btn--stop");
    const transport = container.querySelector(".am-transport");
    const divider = container.querySelector(".am-divider");
    const terminalDivider = container.querySelector(".am-divider--terminal");
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(stopButton?.disabled).toBe(true);
    expect(injectedCss).toContain(".am-btn--stop:disabled");
    expect(injectedCss).toContain("border-color: transparent;");
    expect(injectedCss).toContain("gap: var(--baryon-audio-pill-gap);");
    expect(injectedCss).toContain("padding: var(--baryon-audio-pill-padding);");
    expect(injectedCss).toContain(
      "border-radius: var(--baryon-audio-pill-radius);",
    );
    expect(injectedCss).toContain(
      "min-height: var(--baryon-audio-pill-min-height);",
    );
    expect(window.getComputedStyle(transport).gap).toBe("8px");
    expect(window.getComputedStyle(divider).marginLeft).toBe("8px");
    expect(window.getComputedStyle(divider).marginRight).toBe("8px");
    expect(window.getComputedStyle(terminalDivider).marginLeft).toBe("8px");
    expect(window.getComputedStyle(terminalDivider).marginRight).toBe("0px");
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

  it("keeps the compact file dock out of system mode", () => {
    renderControls({
      selectedSource: "system",
      isAudioLoaded: true,
    });

    const playButton = container.querySelector('[aria-label="Play"]');
    const stopButton = container.querySelector('[aria-label="Stop"]');
    const timeline = container.querySelector(
      '[data-testid="playback-timeline"]',
    );

    expect(
      container.querySelector('[data-testid="source-mode-control"]'),
    ).not.toBeNull();
    expect(container.querySelector(".am-player-shell--compact")).toBeNull();
    expect(playButton).toBeNull();
    expect(stopButton).toBeNull();
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

  it("keeps playback status in the separate source mode control", () => {
    renderControls({
      isPlaying: true,
      isAudioLoaded: true,
    });

    const sourceControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );
    const statusLight = sourceControl?.querySelector(".am-source-mode-light");

    expect(sourceControl).not.toBeNull();
    expect(statusLight?.getAttribute("aria-label")).toBe("Playing");
    expect(container.querySelector(".am-compact-state-chip")).toBeNull();
  });

  it("integrates the source-mode status light with the selector spacing", () => {
    renderControls({
      isAudioLoaded: false,
    });

    const sourceControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );
    const statusLight = sourceControl?.querySelector(".am-source-mode-light");
    const statusDot = sourceControl?.querySelector(".am-status-dot");
    const sourceSelector = sourceControl?.querySelector(".ac-source-selector");
    const sourceCluster = sourceControl?.querySelector(".ac-source-cluster");
    const sourceTabs = sourceControl?.querySelector(".ac-source-tabs");

    expect(sourceControl).not.toBeNull();
    expect(sourceControl?.firstElementChild).toBe(sourceSelector);
    expect(sourceControl?.lastElementChild).toBe(statusLight);
    expect(window.getComputedStyle(sourceControl).gap).toBe(
      "var(--baryon-source-selector-gap)",
    );
    expect(window.getComputedStyle(statusLight).width).toBe("12px");
    expect(window.getComputedStyle(statusLight).height).toBe(
      "var(--baryon-source-selector-inner-min-height)",
    );
    expect(window.getComputedStyle(statusLight).justifyContent).toBe("center");
    expect(statusDot).not.toBeNull();
    expect(window.getComputedStyle(sourceCluster).gap).toBe("6px");
    expect(
      window.getComputedStyle(sourceTabs).getPropertyValue("--tab-file-width"),
    ).toBe("2.86rem");
    expect(
      window
        .getComputedStyle(sourceTabs)
        .getPropertyValue("--tab-system-width"),
    ).toBe("4rem");
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
    expect(
      playbackGroup?.querySelector('[data-testid="file-source-tab"]'),
    ).toBeNull();
    expect(
      playbackGroup?.querySelector('[aria-label="Recent uploads"]'),
    ).toBeNull();
  });

  it("keeps source mode controls outside the compact file dock", () => {
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
    const sourceModeControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );

    expect(unifiedActions?.firstElementChild).toBe(sourceControls);
    expect(sourceControls).not.toBeNull();
    expect(transportControls).not.toBeNull();
    expect(sourceModeControl).not.toBeNull();
    expect(
      sourceControls?.querySelector(".am-compact-header-button"),
    ).not.toBeNull();
    expect(
      sourceControls?.querySelector('[data-testid="file-source-tab"]'),
    ).toBeNull();
    expect(
      sourceControls?.querySelector('[data-testid="live-input-source-tab"]'),
    ).toBeNull();
    expect(
      sourceModeControl?.querySelector('[data-testid="file-source-tab"]'),
    ).not.toBeNull();
    expect(
      sourceModeControl?.querySelector('[data-testid="live-input-source-tab"]'),
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
