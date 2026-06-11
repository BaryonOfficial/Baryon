import { describe, expect, it } from "vitest";
import {
  estimateProjectedSphereStats,
  intersectRaySphereSegment,
} from "./intersection.js";

describe("raymarch sphere intersection", () => {
  it("returns null when a ray misses the sphere", () => {
    const segment = intersectRaySphereSegment(
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      1,
      10,
    );

    expect(segment).toBeNull();
  });

  it("returns a bounded segment when a ray starts outside and hits", () => {
    const segment = intersectRaySphereSegment(
      { x: 0, y: 0, z: -3 },
      { x: 0, y: 0, z: 1 },
      1,
      10,
    );

    expect(segment).toEqual({
      enter: 2,
      exit: 4,
      length: 2,
    });
  });

  it("clamps entry to zero when a ray starts inside the sphere", () => {
    const segment = intersectRaySphereSegment(
      { x: 0, y: 0, z: 0.25 },
      { x: 0, y: 0, z: 1 },
      1,
      10,
    );

    expect(segment?.enter).toBe(0);
    expect(segment?.exit).toBeCloseTo(0.75);
    expect(segment?.length).toBeCloseTo(0.75);
  });

  it("shrinks segment length at grazing angles", () => {
    const centerHit = intersectRaySphereSegment(
      { x: 0, y: 0, z: -3 },
      { x: 0, y: 0, z: 1 },
      1,
      10,
    );
    const grazingHit = intersectRaySphereSegment(
      { x: 0.92, y: 0, z: -3 },
      { x: 0, y: 0, z: 1 },
      1,
      10,
    );

    expect(grazingHit).not.toBeNull();
    expect(grazingHit.length).toBeLessThan(centerHit.length);
  });

  it("estimates projected stability metrics for the debug snapshot", () => {
    const stats = estimateProjectedSphereStats({ radius: 3, samples: 21 });

    expect(stats.avgRaySegmentLength).toBeGreaterThan(0);
    expect(stats.missRatio).toBeGreaterThan(0);
    expect(stats.missRatio).toBeLessThan(1);
  });
});
