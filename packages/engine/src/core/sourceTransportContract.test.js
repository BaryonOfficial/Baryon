import { describe, expect, it } from "vitest";

import {
  hasActiveFilePlaybackTransport,
  hasActiveSourceTransport,
  hasLiveInputStarted,
} from "./sourceTransportContract.js";

describe("source transport ownership", () => {
  it("reads live input state from source evidence when direct state is absent", () => {
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
          sourceLabel: "system",
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

  it("does not let live transport own file observer continuation", () => {
    expect(
      hasActiveFilePlaybackTransport({
        sourceEvidence: {
          transport: {
            playing: false,
            liveInputActive: true,
          },
        },
      }),
    ).toBe(false);
    expect(
      hasActiveFilePlaybackTransport({
        sourceEvidence: {
          transport: {
            playing: true,
            liveInputActive: false,
          },
        },
      }),
    ).toBe(true);
  });
});
