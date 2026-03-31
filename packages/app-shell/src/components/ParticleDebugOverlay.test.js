import { describe, expect, it } from "vitest";
import {
  normalizeDebugOverlayItems,
  resolveDebugOverlayState,
  shouldRenderDebugOverlay,
} from "./ParticleDebugOverlay.jsx";

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

describe("resolveDebugOverlayState", () => {
  it("prefers authoritative overrides over stale local state", () => {
    expect(
      resolveDebugOverlayState({
        localState: {
          enabled: true,
          snapshot: { visualizationMethod: "raymarch" },
        },
        enabledOverride: false,
        snapshotOverride: null,
      }),
    ).toStrictEqual({
      enabled: false,
      snapshot: null,
    });
  });
});

describe("shouldRenderDebugOverlay", () => {
  it("allows authoritative override rendering even when devtools are disabled", () => {
    expect(
      shouldRenderDebugOverlay({
        devtoolsEnabled: false,
        enabledOverride: true,
        overlayState: {
          enabled: true,
          snapshot: { visualizationMethod: "raymarch" },
        },
      }),
    ).toBe(true);
  });
});
