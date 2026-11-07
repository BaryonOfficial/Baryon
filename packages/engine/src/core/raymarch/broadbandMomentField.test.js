import { describe, expect, it } from "vitest";
import { createBroadbandMomentField } from "./broadbandMomentField.js";

function createField() {
  return createBroadbandMomentField({
    families: [
      { u: 2, v: 2, w: 2, shellIndex: 0, sourceAmplitudeOverlap: 1 },
      { u: 4, v: 4, w: 4, shellIndex: 1, sourceAmplitudeOverlap: 0.5 },
    ],
    shellCount: 2,
  });
}

function observation() {
  return {
    pressureMoments: new Float64Array([1, -0.1, -0.1, 0.2]),
    velocityMoments: new Float64Array([1, 0.1, 0.1, 0.2]),
  };
}

describe("broadband moment upload admission", () => {
  it("accepts signed cross terms and exact silence", () => {
    const field = createField();
    try {
      expect(() => field.update(observation())).not.toThrow();
      expect(() =>
        field.update({
          pressureMoments: new Float64Array(4),
          velocityMoments: new Float64Array(4),
        }),
      ).not.toThrow();
    } finally {
      field.dispose();
    }
  });

  it.each(["pressureMoments", "velocityMoments"])(
    "rejects every invalid %s entry, including finite Float32 overflow",
    (quantity) => {
      const field = createField();
      try {
        for (const value of [NaN, Infinity, -Infinity, 1e40, -1e40]) {
          for (let index = 0; index < 4; index++) {
            const invalid = observation();
            invalid[quantity][index] = value;
            expect(() => field.update(invalid)).toThrow(RangeError);
          }
        }
        expect(() => field.update(observation())).not.toThrow();
      } finally {
        field.dispose();
      }
    },
  );

  it("rejects a mismatched matrix shape", () => {
    const field = createField();
    try {
      expect(() =>
        field.update({
          ...observation(),
          pressureMoments: new Float64Array(3),
        }),
      ).toThrow("cosine moment dimensions do not match topology");
    } finally {
      field.dispose();
    }
  });
});
