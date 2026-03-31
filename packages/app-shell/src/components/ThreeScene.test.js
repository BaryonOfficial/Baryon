import { describe, expect, it } from "vitest";
import { resolveSharedPreviewOverlayState } from "./ThreeScene.jsx";

describe("resolveSharedPreviewOverlayState", () => {
  it("returns an unsupported state when presented performer preview is requested without support", () => {
    expect(
      resolveSharedPreviewOverlayState({
        requested: true,
        rendering: false,
        supported: false,
      }),
    ).toMatchObject({
      state: "unsupported",
    });
  });

  it("returns null once shared preview is actively rendering", () => {
    expect(
      resolveSharedPreviewOverlayState({
        requested: true,
        rendering: true,
        supported: true,
        connected: true,
        canvasAttached: true,
        healthy: true,
        stale: false,
      }),
    ).toBeNull();
  });
});
