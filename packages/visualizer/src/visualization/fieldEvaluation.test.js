import { describe, expect, it } from "vitest";
import {
  normalizeRaymarchFieldCacheOverride,
  resolveRaymarchFieldCacheOverride,
} from "./fieldEvaluation.js";

describe("fieldEvaluation", () => {
  it("normalizes the supported field-evaluation overrides", () => {
    expect(normalizeRaymarchFieldCacheOverride("cached")).toBe("cached");
    expect(normalizeRaymarchFieldCacheOverride("analytic")).toBe("analytic");
  });

  it("falls back invalid explicit override values to cached", () => {
    expect(normalizeRaymarchFieldCacheOverride("weird")).toBe("cached");
  });

  it("resolves unset override values to cached", () => {
    expect(resolveRaymarchFieldCacheOverride(undefined)).toBe("cached");
    expect(resolveRaymarchFieldCacheOverride(null)).toBe("cached");
  });
});
