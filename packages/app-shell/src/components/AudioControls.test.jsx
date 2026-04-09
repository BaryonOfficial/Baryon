/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAudioMock, useDraggableFloatingUiMock } = vi.hoisted(() => ({
  useAudioMock: vi.fn(),
  useDraggableFloatingUiMock: vi.fn(),
}));

vi.mock("../context/AudioContext.jsx", () => ({
  useAudio: useAudioMock,
}));

vi.mock("./hooks/useDraggableFloatingUi.js", () => ({
  useDraggableFloatingUi: useDraggableFloatingUiMock,
}));

import { ListenerControls } from "./AudioControls.jsx";

describe("ListenerControls compact dock layout", () => {
  let container = null;
  let root = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
    useAudioMock.mockReset();
    useDraggableFloatingUiMock.mockReset();
  });

  function renderControls(audioOverrides = {}) {
    useDraggableFloatingUiMock.mockReturnValue({
      dragOffset: { x: 0, y: 0 },
      isDragging: false,
      handlePointerDown: () => {},
      handlePointerUp: () => {},
      handleDoubleClick: () => {},
    });

    useAudioMock.mockReturnValue({
      soundCloudEnabled: false,
      activeSource: "upload",
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
      transportState: {
        currentTimeSeconds: 0,
        durationSeconds: 0,
        canSeek: false,
      },
      scrubPreviewSeconds: null,
      isScrubbing: false,
      beginScrub: () => Promise.resolve(),
      previewScrub: () => {},
      commitScrub: () => Promise.resolve(),
      cancelScrub: () => Promise.resolve(),
      ...audioOverrides,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 900,
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
      activeSource: "upload",
      selectedSource: "system",
      liveInputDeviceKind: "live",
    });

    expect(container.textContent).toContain("Source");
    expect(container.textContent).toContain("System");
    expect(container.textContent).not.toContain("Mic");
  });

  it("shows upload-audio placeholder copy for the file source before a file is loaded", () => {
    renderControls({
      activeSource: "upload",
      selectedSource: "file",
      displayName: "Upload Audio",
    });

    expect(container.textContent).toContain("Source");
    expect(container.textContent).toContain("Upload Audio File");
  });

  it("shows the loaded file name for the file source on compact layouts", () => {
    renderControls({
      activeSource: "upload",
      selectedSource: "file",
      displayName: "set-break-live.wav",
      isAudioLoaded: true,
    });

    expect(container.textContent).toContain("Source");
    expect(container.textContent).toContain("set-break-live.wav");
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

  it("keeps recent uploads outside the compact dock so primary controls stay visible", () => {
    renderControls({
      recentUploads: [{ name: "set-a.wav", file: {} }],
      isAudioLoaded: true,
    });

    const dock = container.querySelector(".am-compact-dock");
    const recentButton = dock?.querySelector('[aria-label="Recent uploads"]');

    expect(dock).not.toBeNull();
    expect(recentButton).toBeNull();
    expect(
      container.querySelector(
        ".am-compact-unified-actions [aria-label='Recent uploads']",
      ),
    ).not.toBeNull();
  });

  it("keeps the compact dock as a transport-only pill", () => {
    renderControls({
      recentUploads: [{ name: "set-a.wav", file: {} }],
      isAudioLoaded: true,
    });

    const unifiedActions = container.querySelector(
      ".am-compact-unified-actions",
    );
    const dock = container.querySelector(".am-compact-dock");
    const stopButton = dock?.querySelector('[aria-label="Stop"]');
    const headerButton = dock?.querySelector(".am-compact-header-button");
    const sourceButton = dock?.querySelector(".ac-source-compact-btn");
    const recentButton = dock?.querySelector('[aria-label="Recent uploads"]');

    expect(unifiedActions).not.toBeNull();
    expect(dock).not.toBeNull();
    expect(stopButton).not.toBeNull();
    expect(window.getComputedStyle(dock).display).toBe("flex");
    expect(headerButton).toBeNull();
    expect(sourceButton).toBeNull();
    expect(recentButton).toBeNull();
  });

  it("places compact source controls before the transport group in the unified action row", () => {
    renderControls({
      recentUploads: [{ name: "set-a.wav", file: {} }],
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
      ".am-compact-dock [aria-label='Play']",
    );

    expect(playButton).not.toBeNull();
    expect(window.getComputedStyle(playButton).width).toBe("40px");
    expect(window.getComputedStyle(playButton).height).toBe("40px");
  });
});
