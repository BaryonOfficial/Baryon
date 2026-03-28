import { describe, expect, it } from "vitest";
import { normalizeDebugOverlayItems } from "./ParticleDebugOverlay.jsx";

describe("normalizeDebugOverlayItems", () => {
  it("returns null when none are provided", () => {
    expect(normalizeDebugOverlayItems(null)).toBeNull();
    expect(normalizeDebugOverlayItems(undefined)).toBeNull();
    expect(normalizeDebugOverlayItems([])).toBeNull();
  });

  it("passes through non-empty host-provided items", () => {
    const items = [{ label: "Authority", value: "listener-local" }];
    expect(normalizeDebugOverlayItems(items)).toBe(items);
  });
});
