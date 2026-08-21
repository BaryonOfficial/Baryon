/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAudioMock, observeAudioTransportClockMock } = vi.hoisted(() => ({
  useAudioMock: vi.fn(),
  observeAudioTransportClockMock: vi.fn(),
}));

vi.mock("../context/AudioContext.jsx", () => ({
  useAudio: useAudioMock,
}));

vi.mock("../context/audioTransportClock.js", () => ({
  observeAudioTransportClock: observeAudioTransportClockMock,
}));

import { ListenerControls } from "./AudioControls.jsx";

describe("ListenerControls file player layout", () => {
  let container = null;
  let root = null;
  let originalActEnvironment;
  let transportClockSnapshot;
  let transportClockObservers;

  beforeEach(() => {
    originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    transportClockSnapshot = {
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    };
    transportClockObservers = new Set();
    observeAudioTransportClockMock.mockImplementation((observer) => {
      transportClockObservers.add(observer);
      observer(transportClockSnapshot);
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        transportClockObservers.delete(observer);
      };
    });
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
    observeAudioTransportClockMock.mockReset();
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

  function renderControls(
    audioOverrides = {},
    { transportClockOverrides = {}, onRender = null } = {},
  ) {
    useAudioMock.mockReturnValue({
      sourceSession: { kind: "file" },
      displayName: "Upload Audio",
      localFileQueue: [],
      activeLocalFileQueueIndex: -1,
      hasPreviousLocalFile: false,
      hasNextLocalFile: false,
      isLocalFileQueueAutoplayEnabled: true,
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
      loadDemoAudioFile: () => {},
      handlePlayPause: () => {},
      handleVolumeChange: () => {},
      handleMuteToggle: () => {},
      setShowDeviceMenu: () => {},
      scrubPreviewSeconds: null,
      isScrubbing: false,
      beginScrub: () => Promise.resolve(),
      previewScrub: () => {},
      commitScrub: () => Promise.resolve(),
      restartOrLoadPreviousLocalFile: () => Promise.resolve(),
      playLocalFileAtQueueIndex: () => Promise.resolve(),
      playNextLocalFile: () => Promise.resolve(),
      toggleLocalFileQueueAutoplay: () => {},
      cancelScrub: () => Promise.resolve(),
      ...audioOverrides,
    });
    transportClockSnapshot = {
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
      ...transportClockOverrides,
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      const controls = <ListenerControls showSourceLiveButton={false} />;
      root.render(
        onRender ? (
          <React.Profiler id="listener-controls" onRender={onRender}>
            {controls}
          </React.Profiler>
        ) : (
          controls
        ),
      );
    });
  }

  function publishTransportClock(overrides = {}) {
    transportClockSnapshot = {
      ...transportClockSnapshot,
      ...overrides,
    };
    act(() => {
      for (const observer of transportClockObservers) {
        observer(transportClockSnapshot);
      }
    });
  }

  it("shows the source control without the compact file dock in system mode", () => {
    renderControls({
      sourceSession: { kind: "system" },
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

  it("aligns the source control bottom edge with the compact player", () => {
    renderControls({
      sourceSession: { kind: "system" },
      liveInputDeviceKind: "system",
    });

    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(injectedCss).toContain(`.am-source-mode-shell {
  --baryon-source-selector-radius: 10px;
  --baryon-source-selector-segment-radius: 7px;
  position: fixed;
  right: 0.9rem;
  bottom: 16px;`);
    expect(injectedCss).toContain(`.am-player-shell--compact {
  align-items: center;
  bottom: 16px;`);
  });

  it("uses the compact desktop grid and restores the stacked mobile player", () => {
    renderControls(
      {
        isAudioLoaded: true,
      },
      {
        transportClockOverrides: {
          currentTimeSeconds: 18,
          durationSeconds: 156,
          canSeek: true,
        },
      },
    );

    const trackSection = container.querySelector(".am-compact-track-section");
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");
    const mobileLayoutCss = injectedCss.slice(
      injectedCss.lastIndexOf("@media (max-width: 720px)"),
      injectedCss.lastIndexOf("@media (max-width: 640px)"),
    );
    const smallMobileCss = injectedCss.slice(
      injectedCss.lastIndexOf("@media (max-width: 480px)"),
      injectedCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );

    expect(trackSection).not.toBeNull();
    expect(trackSection?.querySelector(".am-compact-identity")).not.toBeNull();
    expect(trackSection?.querySelector(".am-timeline-shell")).not.toBeNull();
    expect(injectedCss).toContain(
      "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);",
    );
    expect(injectedCss).toContain("grid-template-rows: auto auto;");
    expect(injectedCss).toContain(`.am-compact-track-section {
  display: contents;
}`);
    expect(injectedCss).toContain(`.am-compact-identity {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr);`);
    expect(injectedCss).toContain(`.am-compact-source-actions {
  display: none;`);
    expect(injectedCss).toContain(`.am-compact-card .am-timeline-shell {
  grid-column: 1 / -1;
  grid-row: 1;`);
    expect(injectedCss).toContain(`.am-compact-volume-row {
  grid-column: 3;
  grid-row: 2;`);
    expect(injectedCss).toContain("width: 8.5rem;");
    expect(injectedCss).toContain(`@media (max-width: 720px) {
  .am-source-mode-shell`);
    expect(injectedCss).toContain(`  .am-compact-card {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    border-radius: 16px;
  }`);
    expect(injectedCss).toContain(`  .am-compact-card .am-timeline-shell {
    order: 2;
    grid-column: auto;
    grid-row: auto;
    margin-top: 2px;
  }`);
    expect(injectedCss).toContain(`  .am-compact-identity {
    order: 1;
    grid-column: auto;
    grid-row: auto;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }`);
    expect(injectedCss).toContain(`  .am-compact-unified-actions {
    order: 3;
    grid-column: auto;
    grid-row: auto;
    width: 100%;
  }`);
    expect(injectedCss).toContain(`  .am-compact-volume-row {
    order: 4;
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    justify-self: stretch;
    padding: 0 12px;
  }`);
    expect(injectedCss).toContain("width: min(19rem, calc(100vw - 1.5rem));");
    expect(injectedCss).toContain(`@media (max-width: 480px) {
  .am-source-mode-shell`);
    expect(mobileLayoutCss).toContain("grid-template-columns: 44px 48px 44px;");
    expect(mobileLayoutCss).toContain(`  .am-compact-action {
    min-width: 44px;
    height: 44px;
  }`);
    expect(smallMobileCss).not.toContain(".am-compact-utility");
    expect(smallMobileCss).not.toContain(".am-compact-action");
    expect(injectedCss).toContain("width: min(32rem, calc(100vw - 1.5rem));");
    expect(injectedCss).not.toContain("@media (min-width: 1100px)");
    expect(injectedCss).not.toContain(
      "width: min(46rem, calc(100vw - 1.5rem));",
    );
  });

  it("projects transport ticks without committing the React control tree", () => {
    const onRender = vi.fn();
    const beginScrub = vi.fn(() => Promise.resolve());
    const previewScrub = vi.fn();
    const commitScrub = vi.fn(() => Promise.resolve());
    const cancelScrub = vi.fn(() => Promise.resolve());
    renderControls(
      {
        isAudioLoaded: true,
        beginScrub,
        previewScrub,
        commitScrub,
        cancelScrub,
      },
      {
        transportClockOverrides: {
          currentTimeSeconds: 1,
          durationSeconds: 180,
          canSeek: true,
        },
        onRender,
      },
    );

    const timeline = container.querySelector(
      '[data-testid="playback-timeline"]',
    );
    const currentTime = container.querySelector(".am-timeline-time");
    const initialCommitCount = onRender.mock.calls.length;
    expect(timeline?.value).toBe("1");

    for (
      let currentTimeSeconds = 2;
      currentTimeSeconds <= 101;
      currentTimeSeconds += 1
    ) {
      publishTransportClock({ currentTimeSeconds });
    }

    expect(timeline?.value).toBe("101");
    expect(timeline?.title).toBe("Playback position 1:41 of 3:00");
    expect(currentTime?.textContent).toBe("1:41");
    expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
    expect(beginScrub).not.toHaveBeenCalled();
    expect(previewScrub).not.toHaveBeenCalled();
    expect(commitScrub).not.toHaveBeenCalled();
    expect(cancelScrub).not.toHaveBeenCalled();
  });

  it("keeps clock projection gated until a scrub commit settles", async () => {
    let resolveCommit;
    const commitScrub = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCommit = resolve;
        }),
    );
    renderControls(
      {
        isAudioLoaded: true,
        beginScrub: vi.fn(() => Promise.resolve()),
        commitScrub,
      },
      {
        transportClockOverrides: {
          currentTimeSeconds: 5,
          durationSeconds: 120,
          canSeek: true,
        },
      },
    );

    const timeline = container.querySelector(
      '[data-testid="playback-timeline"]',
    );
    timeline.value = "20";
    await act(async () => {
      timeline.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await Promise.resolve();
    });

    publishTransportClock({
      currentTimeSeconds: 30,
      durationSeconds: 240,
    });
    expect(timeline.value).toBe("20");
    expect(timeline.max).toBe("240");

    await act(async () => {
      timeline.dispatchEvent(new Event("pointerup", { bubbles: true }));
      await Promise.resolve();
    });
    expect(commitScrub).toHaveBeenCalledWith(20);

    publishTransportClock({ currentTimeSeconds: 40 });
    expect(timeline.value).toBe("20");

    await act(async () => {
      resolveCommit();
      await Promise.resolve();
    });
    expect(timeline.value).toBe("40");
    expect(timeline.title).toBe("Playback position 0:40 of 4:00");
  });

  it("hides the timeline immediately when seekability is lost mid-commit", async () => {
    let resolveCommit;
    const commitScrub = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCommit = resolve;
        }),
    );
    renderControls(
      {
        isAudioLoaded: true,
        beginScrub: vi.fn(() => Promise.resolve()),
        commitScrub,
      },
      {
        transportClockOverrides: {
          currentTimeSeconds: 5,
          durationSeconds: 120,
          canSeek: true,
        },
      },
    );

    const timeline = container.querySelector(
      '[data-testid="playback-timeline"]',
    );
    timeline.value = "20";
    await act(async () => {
      timeline.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await Promise.resolve();
      timeline.dispatchEvent(new Event("pointerup", { bubbles: true }));
      await Promise.resolve();
    });
    expect(commitScrub).toHaveBeenCalledWith(20);

    publishTransportClock({
      currentTimeSeconds: 0,
      durationSeconds: 0,
      canSeek: false,
    });
    expect(
      container.querySelector('[data-testid="playback-timeline"]'),
    ).toBeNull();

    await act(async () => {
      resolveCommit();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="playback-timeline"]'),
    ).toBeNull();
  });

  it("shows upload-audio placeholder copy for the file source before a file is loaded", () => {
    renderControls({
      sourceSession: { kind: "file" },
      displayName: "Upload Audio",
    });

    const trackMeta = container.querySelector(".am-compact-track-meta");
    const trackTitle = container.querySelector(".am-compact-track-title");
    const inlineUploadIcon = trackMeta?.querySelector(
      ".am-compact-track-meta-upload",
    );
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(trackMeta?.textContent).toBe("Source");
    expect(trackTitle?.textContent).toBe("Upload Audio File");
    expect(inlineUploadIcon).not.toBeNull();
    expect(inlineUploadIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(window.getComputedStyle(inlineUploadIcon).display).toBe(
      "inline-flex",
    );
    expect(inlineUploadIcon?.querySelector("svg")).not.toBeNull();
    expect(injectedCss).toContain(`  .am-compact-track-meta-upload {
    display: none;
  }`);
  });

  it("uses the canonical upload button", () => {
    renderControls({
      sourceSession: { kind: "file" },
      displayName: "Upload Audio",
    });

    const trackTrigger = container.querySelector(
      '.am-compact-source-actions [aria-label="Upload audio files"]',
    );

    expect(trackTrigger?.tagName).toBe("BUTTON");
    expect(trackTrigger?.getAttribute("type")).toBe("button");
    expect(trackTrigger?.classList.contains("am-compact-utility")).toBe(true);
    expect(window.getComputedStyle(trackTrigger).borderStyle).toBe("none");
    expect(window.getComputedStyle(trackTrigger).borderRadius).toBe("0px");
    expect(window.getComputedStyle(trackTrigger).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("opens the file picker from the source area", () => {
    renderControls({
      sourceSession: { kind: "file" },
      displayName: "Upload Audio",
    });

    const sourceTrigger = container.querySelector(
      '[data-testid="compact-source-trigger"]',
    );
    const fileInput = container.querySelector('input[type="file"]');
    const fileInputClick = vi.spyOn(fileInput, "click");

    act(() => {
      sourceTrigger?.click();
    });

    expect(sourceTrigger?.tagName).toBe("BUTTON");
    expect(sourceTrigger?.getAttribute("aria-label")).toBe(
      "Upload audio files",
    );
    expect(fileInputClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the file player fixed so sliders own pointer gestures", () => {
    renderControls({ isAudioLoaded: true });

    const playerShell = container.querySelector(".am-player-shell");

    expect(playerShell).not.toBeNull();
    expect(playerShell?.getAttribute("style")).toBeNull();
    expect(playerShell?.getAttribute("title")).toBeNull();
  });

  it("accepts multiple audio files from one upload selection", () => {
    renderControls();

    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput?.multiple).toBe(true);
    expect(fileInput?.getAttribute("accept")).toBe("audio/*");
  });

  it("starts the preloaded demo audio from the compact file dock", () => {
    const loadDemoAudioFile = vi.fn();
    renderControls({
      sourceSession: { kind: "file" },
      loadDemoAudioFile,
    });

    const demoButton = container.querySelector(
      '[aria-label="Play demo audio"]',
    );

    expect(demoButton).not.toBeNull();
    expect(demoButton?.classList.contains("am-compact-hover-action")).toBe(
      true,
    );
    expect(demoButton?.textContent).toBe("");
    act(() => {
      demoButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(loadDemoAudioFile).toHaveBeenCalledTimes(1);
  });

  it("keeps recent-upload UI out of system mode", () => {
    renderControls({
      sourceSession: { kind: "system" },
      recentUploads: [createRecentUpload()],
      isAudioLoaded: true,
    });

    expect(
      container.querySelector('[data-testid="source-mode-control"]'),
    ).not.toBeNull();
    expect(container.querySelector(".am-player-shell")).toBeNull();
    expect(container.querySelector(".am-compact-card")).toBeNull();
    expect(container.querySelector(".am-file-list-panel")).toBeNull();
  });

  it("marks the canonical play button active", () => {
    renderControls({
      sourceSession: { kind: "file" },
      isPlaying: true,
      isAudioLoaded: true,
    });

    const playButton = container.querySelector(".am-compact-action--primary");

    expect(playButton?.classList.contains("am-compact-action--active")).toBe(
      true,
    );
    expect(playButton?.getAttribute("aria-label")).toBe("Pause");
  });

  it("uses the queue-aware transport without legacy controls", () => {
    renderControls({
      sourceSession: { kind: "file" },
      isAudioLoaded: false,
    });

    const playerShell = container.querySelector(".am-player-shell");
    const playbackGroup = container.querySelector(
      ".am-compact-action-group--playback",
    );

    expect(playerShell?.classList.contains("am-player-shell--compact")).toBe(
      true,
    );
    expect(
      playbackGroup?.querySelector('[aria-label="Previous track"]'),
    ).not.toBeNull();
    expect(
      playbackGroup?.querySelector('[aria-label="Next track"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="Stop"]')).toBeNull();
    expect(container.querySelector(".am-divider")).toBeNull();
    expect(container.querySelector(".am-compact-volume-row")).not.toBeNull();
  });

  it("shows the loaded file name for the file source on compact layouts", () => {
    renderControls({
      sourceSession: { kind: "file" },
      displayName: "set-break-live.wav",
      isAudioLoaded: true,
    });

    const trackMeta = container.querySelector(".am-compact-track-meta");
    const trackTitle = container.querySelector(".am-compact-track-title");

    expect(trackMeta?.textContent).toBe("Source");
    expect(trackTitle?.textContent).toBe("set-break-live.wav");
  });

  it("shows the active position when the compact player has an autoplay queue", () => {
    renderControls({
      sourceSession: { kind: "file" },
      displayName: "first.wav",
      localFileQueue: [
        createRecentUpload("first.wav"),
        createRecentUpload("second.wav"),
      ],
      activeLocalFileQueueIndex: 0,
      hasNextLocalFile: true,
      isAudioLoaded: true,
    });

    expect(container.querySelector(".am-compact-track-meta")?.textContent).toBe(
      "Queue 1/2",
    );
    expect(container.querySelector('[aria-label="Next track"]')?.disabled).toBe(
      false,
    );
  });

  it("keeps long file names inside the compact dock width budget", () => {
    renderControls({
      sourceSession: { kind: "file" },
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

  it("shows a connected silent line feed without the starting pulse", () => {
    renderControls({
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      liveInputRuntimeStatus: {
        active: true,
        phase: "weak-signal",
        resolvedAnalysisClass: "line-feed",
        signalState: "silent",
        sourceBoundaryState: "muted",
      },
    });

    const sourceControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );
    const statusLight = sourceControl?.querySelector(".am-source-mode-light");
    const statusDot = /** @type {HTMLElement | null} */ (
      sourceControl?.querySelector(".am-status-dot")
    );

    expect(statusLight?.getAttribute("aria-label")).toBe(
      "Live input connected — waiting for audio",
    );
    expect(statusDot?.style.background).not.toBe("rgb(215, 25, 33)");
    expect(statusDot?.style.animation).toBe("none");
  });

  it("uses green for a line feed with current source evidence", () => {
    renderControls({
      isLiveInputActive: true,
      liveInputDeviceKind: "system",
      liveInputRuntimeStatus: {
        active: true,
        phase: "listening",
        resolvedAnalysisClass: "line-feed",
        signalState: "ok",
        sourceBoundaryState: "live",
      },
    });

    const sourceControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );
    const statusLight = sourceControl?.querySelector(".am-source-mode-light");
    const statusDot = /** @type {HTMLElement | null} */ (
      sourceControl?.querySelector(".am-status-dot")
    );

    expect(statusLight?.getAttribute("aria-label")).toBe("Line feed listening");
    expect(statusDot?.style.background).toBe("rgb(74, 158, 92)");
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
    expect(
      window
        .getComputedStyle(sourceControl)
        .getPropertyValue("--baryon-source-selector-radius"),
    ).toBe("10px");
    expect(
      window
        .getComputedStyle(sourceControl)
        .getPropertyValue("--baryon-source-selector-segment-radius"),
    ).toBe("7px");
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

  it("reveals Queue, Demo, and Autoplay above the pane on hover", () => {
    const toggleLocalFileQueueAutoplay = vi.fn();
    renderControls({
      recentUploads: [createRecentUpload()],
      isAudioLoaded: true,
      toggleLocalFileQueueAutoplay,
    });

    const sourceActions = container.querySelector(".am-compact-source-actions");
    const compactCard = container.querySelector(".am-compact-card");
    const utilityRow = container.querySelector(".am-compact-hover-actions");
    const queueButton = utilityRow?.querySelector(
      '[aria-label="Recent uploads"]',
    );
    const demoButton = utilityRow?.querySelector(
      '[aria-label="Play demo audio"]',
    );
    const autoplayButton = utilityRow?.querySelector('[aria-label="Autoplay"]');
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(sourceActions).not.toBeNull();
    expect(compactCard).not.toBeNull();
    expect(utilityRow).not.toBeNull();
    expect(container.querySelector(".am-compact-footer-actions")).toBeNull();
    expect(
      sourceActions?.querySelector('[aria-label="Upload audio files"]'),
    ).not.toBeNull();
    expect(
      sourceActions?.querySelector('[aria-label="Recent uploads"]'),
    ).toBeNull();
    expect(
      sourceActions?.querySelector('[aria-label="Play demo audio"]'),
    ).toBeNull();
    expect(sourceActions?.querySelector('[aria-label="Autoplay"]')).toBeNull();
    expect(queueButton).not.toBeNull();
    expect(
      utilityRow?.querySelector('[aria-label="Upload audio files"]'),
    ).toBeNull();
    expect(demoButton).not.toBeNull();
    expect(autoplayButton).not.toBeNull();
    expect(queueButton?.getAttribute("data-tooltip")).toBe("Recent uploads");
    expect(demoButton?.getAttribute("data-tooltip")).toBe("Demo audio");
    expect(autoplayButton?.getAttribute("data-tooltip")).toBe("Autoplay on");
    expect(autoplayButton?.getAttribute("aria-pressed")).toBe("true");
    expect(injectedCss).toContain(".am-compact-hover-action::after {");
    expect(injectedCss).toContain(`.am-compact-hover-action:hover::after,
.am-compact-hover-action:focus-visible::after {`);
    expect(compactCard?.getAttribute("data-utility-state")).toBe("collapsed");
    expect(window.getComputedStyle(utilityRow).position).toBe("absolute");
    expect(window.getComputedStyle(utilityRow).pointerEvents).toBe("none");
    expect(
      window.getComputedStyle(
        utilityRow?.querySelector(".am-compact-hover-action"),
      ).width,
    ).toBe("44px");
    expect(
      window.getComputedStyle(
        utilityRow?.querySelector(".am-compact-hover-action"),
      ).height,
    ).toBe("28px");

    act(() => {
      compactCard.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(compactCard?.getAttribute("data-utility-state")).toBe("expanded");
    expect(
      utilityRow?.classList.contains("am-compact-hover-actions--expanded"),
    ).toBe(true);
    expect(window.getComputedStyle(utilityRow).pointerEvents).toBe("auto");

    act(() => {
      compactCard.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });

    expect(compactCard?.getAttribute("data-utility-state")).toBe("collapsed");

    act(() => {
      autoplayButton.focus();
    });

    expect(compactCard?.getAttribute("data-utility-state")).toBe("expanded");

    act(() => {
      autoplayButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(toggleLocalFileQueueAutoplay).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector(".am-compact-transport-right")
        ?.querySelector('[aria-label="Recent uploads"]'),
    ).toBeNull();
  });

  it("keeps the shell-free Queue icon visible but disabled when empty", () => {
    renderControls();

    const utilityRow = container.querySelector(".am-compact-hover-actions");
    const queueButton = utilityRow?.querySelector('[aria-label="Queue"]');

    expect(queueButton).not.toBeNull();
    expect(queueButton?.disabled).toBe(true);
    expect(queueButton?.getAttribute("title")).toBe("Queue");
    expect(queueButton?.getAttribute("data-tooltip")).toBe("Queue");
    expect(window.getComputedStyle(queueButton).borderStyle).toBe("none");
    expect(window.getComputedStyle(queueButton).borderRadius).toBe("0px");
    expect(window.getComputedStyle(queueButton).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
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
    expect(
      playbackGroup?.querySelector('[aria-label="Previous track"]'),
    ).not.toBeNull();
    expect(
      playbackGroup?.querySelector('[aria-label="Next track"]'),
    ).not.toBeNull();
    expect(playbackGroup?.querySelector('[aria-label="Stop"]')).toBeNull();
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
      ".am-compact-identity .am-compact-source-actions",
    );
    const transportControls = container.querySelector(
      ".am-compact-unified-actions .am-compact-transport-right",
    );
    const sourceModeControl = container.querySelector(
      '[data-testid="source-mode-control"]',
    );

    expect(sourceControls).not.toBeNull();
    expect(transportControls).not.toBeNull();
    expect(sourceModeControl).not.toBeNull();
    expect(sourceControls?.querySelector(".am-compact-utility")).not.toBeNull();
    expect(
      sourceControls?.querySelector(".am-compact-header-button"),
    ).toBeNull();
    expect(
      sourceControls?.querySelector('[data-testid="file-source-tab"]'),
    ).toBeNull();
    expect(
      sourceControls?.querySelector('[data-testid="live-input-source-tab"]'),
    ).toBeNull();
    expect(
      unifiedActions?.querySelector(".am-compact-source-actions"),
    ).toBeNull();
    expect(
      sourceModeControl?.querySelector('[data-testid="file-source-tab"]'),
    ).not.toBeNull();
    expect(
      sourceModeControl?.querySelector('[data-testid="live-input-source-tab"]'),
    ).not.toBeNull();
  });

  it("uses compact desktop controls with touch-sized mobile targets", () => {
    renderControls({
      isAudioLoaded: true,
    });

    const playButton = container.querySelector(
      ".am-compact-action-group--playback [aria-label='Play']",
    );
    const compactCard = container.querySelector(".am-compact-card");
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(playButton).not.toBeNull();
    expect(window.getComputedStyle(playButton).width).toBe("40px");
    expect(window.getComputedStyle(playButton).height).toBe("40px");
    expect(window.getComputedStyle(compactCard).paddingTop).toBe("8px");
    expect(window.getComputedStyle(compactCard).paddingBottom).toBe("8px");
    expect(injectedCss).toContain("grid-template-columns: repeat(3, 44px);");
    expect(window.getComputedStyle(playButton).borderStyle).toBe("none");
    expect(window.getComputedStyle(playButton).backgroundColor).toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("optically aligns the volume icons around the slider above mobile", () => {
    renderControls({ isAudioLoaded: true });

    const volumeRow = container.querySelector(".am-compact-volume-row");
    const volumeSlider = volumeRow?.querySelector(
      '[aria-label="App playback volume"]',
    );
    const volumeStart = volumeRow?.querySelector(".am-btn--volume");
    const volumeEnd = volumeRow?.querySelector(".am-compact-volume-end");
    const injectedCss = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent ?? "")
      .join("\n");

    expect(volumeRow).not.toBeNull();
    expect(volumeStart).not.toBeNull();
    expect(volumeEnd).not.toBeNull();
    expect(volumeRow?.querySelector(".am-compact-volume-value")).toBeNull();
    expect(window.getComputedStyle(volumeRow).borderTopStyle).toBe("none");
    expect(window.getComputedStyle(volumeRow).paddingLeft).toBe("0px");
    expect(window.getComputedStyle(volumeRow).paddingRight).toBe("0px");
    expect(window.getComputedStyle(volumeSlider).borderRadius).toBe("999px");
    expect(window.getComputedStyle(volumeStart).width).toBe("24px");
    expect(window.getComputedStyle(volumeEnd).width).toBe("24px");
    expect(window.getComputedStyle(volumeStart).justifyContent).toBe(
      "flex-end",
    );
    expect(window.getComputedStyle(volumeEnd).justifyContent).toBe(
      "flex-start",
    );
    expect(window.getComputedStyle(volumeEnd).paddingLeft).toBe("0px");
    expect(injectedCss).toContain(`  .am-compact-volume-end,
  .am-compact-volume-row .am-btn--volume {
    justify-content: center;
  }`);
  });

  it("runs the queue-aware previous and next transport actions", () => {
    const restartOrLoadPreviousLocalFile = vi.fn(() => Promise.resolve());
    const playNextLocalFile = vi.fn(() => Promise.resolve());
    renderControls(
      {
        isAudioLoaded: true,
        localFileQueue: [
          createRecentUpload("first.wav"),
          createRecentUpload("second.wav"),
        ],
        activeLocalFileQueueIndex: 0,
        hasPreviousLocalFile: false,
        hasNextLocalFile: true,
        restartOrLoadPreviousLocalFile,
        playNextLocalFile,
      },
      {
        transportClockOverrides: {
          currentTimeSeconds: 25,
          durationSeconds: 30,
          canSeek: true,
        },
      },
    );

    const backButton = container.querySelector('[aria-label="Previous track"]');
    const forwardButton = container.querySelector('[aria-label="Next track"]');

    act(() => {
      backButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      forwardButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(restartOrLoadPreviousLocalFile).toHaveBeenCalledTimes(1);
    expect(playNextLocalFile).toHaveBeenCalledTimes(1);
  });

  it("keeps previous available while a selected earlier queue file is loading", () => {
    renderControls({
      isAudioLoaded: false,
      hasPreviousLocalFile: true,
    });

    expect(
      container.querySelector('[aria-label="Previous track"]')?.disabled,
    ).toBe(false);
  });

  it("shows the full queue in a scrollable list and plays any selected entry", () => {
    const playLocalFileAtQueueIndex = vi.fn(() => Promise.resolve());
    const queueEntries = Array.from({ length: 8 }, (_, index) =>
      createRecentUpload(`track-${index + 1}.wav`),
    );
    renderControls({
      localFileQueue: queueEntries,
      activeLocalFileQueueIndex: 0,
      recentUploads: [],
      isAudioLoaded: true,
      playLocalFileAtQueueIndex,
    });

    const queueButton = container.querySelector('[aria-label="Queue"]');
    expect(queueButton).not.toBeNull();

    act(() => {
      queueButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const queuePanel = container.querySelector(
      '[data-testid="local-file-queue-panel"]',
    );
    const queueList = queuePanel?.querySelector(".am-file-list-items");
    const queueHelper = queuePanel?.querySelector(".am-file-list-helper");
    const firstTrack = queuePanel?.querySelector(
      '[aria-label="Play track-1.wav"]',
    );
    const thirdTrack = queuePanel?.querySelector(
      '[aria-label="Play track-3.wav"]',
    );
    const firstTrackMain = firstTrack?.querySelector(".am-file-list-item-main");
    const secondTrackAction = queuePanel
      ?.querySelector('[aria-label="Play track-2.wav"]')
      ?.querySelector(".am-file-list-item-action");

    expect(queuePanel).not.toBeNull();
    expect(queueList?.children).toHaveLength(8);
    expect(window.getComputedStyle(queueList).overflowY).toBe("auto");
    expect(queueHelper?.textContent).toBe("Select a track · Autoplay on");
    expect(window.getComputedStyle(queuePanel).paddingTop).toBe("10px");
    expect(window.getComputedStyle(queuePanel).borderRadius).toBe("10px");
    expect(window.getComputedStyle(firstTrack).paddingTop).toBe("8px");
    expect(window.getComputedStyle(firstTrack).borderRadius).toBe("7px");
    expect(window.getComputedStyle(firstTrackMain).flexDirection).toBe("row");
    expect(window.getComputedStyle(secondTrackAction).opacity).toBe("0");
    expect(thirdTrack).not.toBeNull();

    act(() => {
      thirdTrack.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(playLocalFileAtQueueIndex).toHaveBeenCalledWith(2);
  });
});
