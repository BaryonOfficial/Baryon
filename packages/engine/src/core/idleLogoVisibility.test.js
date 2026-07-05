import { describe, expect, it } from "vitest";

import {
  hasActiveSourceTransport,
  hasLiveInputStarted,
  resolveIdleOverlayVisible,
} from "./idleLogoVisibility.js";

describe("idle logo visibility ownership", () => {
  it("reads live input state from source evidence transport when direct state is absent", () => {
    expect(
      hasLiveInputStarted({
        sourceEvidence: {
          transport: {
            liveInputActive: true,
          },
        },
      }),
    ).toBe(true);
  });

  it("does not infer live input state from source-mode mirrors", () => {
    expect(
      hasLiveInputStarted({
        debug: {
          audioInputMode: "system",
        },
        sourceMode: "line-feed",
      }),
    ).toBe(false);
  });

  it("treats active file playback evidence as source transport", () => {
    expect(
      hasActiveSourceTransport({
        sourceEvidence: {
          transport: {
            playing: true,
            liveInputActive: false,
          },
        },
      }),
    ).toBe(true);
  });

  it("does not infer file transport from status mirrors", () => {
    expect(
      hasActiveSourceTransport({
        isPlaying: true,
        sourceMode: "file",
      }),
    ).toBe(false);
  });

  it("keeps the idle overlay hidden while source transport is active", () => {
    const runtimeState = {};

    expect(
      resolveIdleOverlayVisible(
        runtimeState,
        {
          fieldState: "idle",
          sourceEvidence: {
            transport: {
              playing: true,
              liveInputActive: false,
            },
          },
        },
        false,
      ),
    ).toBe(false);
    expect(runtimeState.idleLogoSuppressedForActiveTransport).toBe(true);
    expect(runtimeState.idleLogoSuppressedForLive).toBe(false);
  });
});
