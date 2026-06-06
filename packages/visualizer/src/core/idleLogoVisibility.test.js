import { describe, expect, it } from "vitest";

import { hasLiveInputStarted } from "./idleLogoVisibility.js";

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
});
