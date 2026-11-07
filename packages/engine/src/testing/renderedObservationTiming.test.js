import { describe, expect, it } from "vitest";
import { retainRenderedObservation } from "./renderedObservationTiming.js";

describe("rendered observation timing", () => {
  it("retains the consumed source endpoint while newer audio only updates a cache", () => {
    const first = retainRenderedObservation(null, {
      baked: true,
      sourceTimeSeconds: 1,
      preparationDelaySeconds: 2048 / 48000,
    });
    const cached = retainRenderedObservation(first, {
      baked: false,
      sourceTimeSeconds: 1.01,
      preparationDelaySeconds: 2048 / 48000,
    });
    expect(cached).toBe(first);
    expect(cached.renderedSourceTimeSeconds).toBe(1);
    expect(cached.renderedAvailabilityTimeSeconds).toBe(1 + 2048 / 48000);
    const next = retainRenderedObservation(cached, {
      baked: true,
      sourceTimeSeconds: 1.02,
      preparationDelaySeconds: 2048 / 48000,
    });
    expect(next.renderedSourceTimeSeconds).toBe(1.02);
    expect(next.renderedAvailabilityTimeSeconds).toBe(1.02 + 2048 / 48000);
    // An in-flight timing record must keep its own source endpoint.
    expect(first.renderedSourceTimeSeconds).toBe(1);
  });

  it("requires a measured source seed instead of inheriting warm-up timing", () => {
    expect(() =>
      retainRenderedObservation(null, {
        baked: false,
        sourceTimeSeconds: 0.01,
        preparationDelaySeconds: 0,
      }),
    ).toThrow("unseeded");
    expect(
      retainRenderedObservation(null, {
        baked: true,
        sourceTimeSeconds: 0.01,
        preparationDelaySeconds: 0,
      }),
    ).toEqual({
      renderedSourceTimeSeconds: 0.01,
      renderedAvailabilityTimeSeconds: 0.01,
    });
  });

  it.each([
    { sourceTimeSeconds: NaN, preparationDelaySeconds: 0 },
    { sourceTimeSeconds: 0, preparationDelaySeconds: Infinity },
    { sourceTimeSeconds: 0, preparationDelaySeconds: -1 },
    { sourceTimeSeconds: -1, preparationDelaySeconds: 0 },
  ])("rejects invalid observation timing %j", (timing) => {
    expect(() =>
      retainRenderedObservation(null, { ...timing, baked: true }),
    ).toThrow("invalid");
  });
});
