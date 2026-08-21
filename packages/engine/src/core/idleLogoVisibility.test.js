import { describe, expect, it } from "vitest";

import { resolveIdleOverlayVisible } from "./idleLogoVisibility.js";

describe("idle logo visibility ownership", () => {
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
