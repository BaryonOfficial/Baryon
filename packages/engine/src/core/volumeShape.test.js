import { describe, expect, it } from "vitest";
import { VOLUME_SHAPES, normalizeVolumeShape } from "./volumeShape.js";

describe("volume shape", () => {
  it("keeps sphere and cube as the only finite render domains", () => {
    expect(VOLUME_SHAPES).toEqual({ sphere: "sphere", cube: "cube" });
    expect(Object.isFrozen(VOLUME_SHAPES)).toBe(true);
  });

  it("normalizes unknown values to the spherical default", () => {
    expect(normalizeVolumeShape("cube")).toBe(VOLUME_SHAPES.cube);
    expect(normalizeVolumeShape("sphere")).toBe(VOLUME_SHAPES.sphere);
    expect(normalizeVolumeShape("unbounded")).toBe(VOLUME_SHAPES.sphere);
    expect(normalizeVolumeShape(undefined)).toBe(VOLUME_SHAPES.sphere);
  });
});
