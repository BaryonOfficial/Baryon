import { expect, test } from "vitest";
import { assertAudioFeatureAuthorityRole } from "./audioFeatureAuthorityRole.js";

test("rejects missing or unknown audio feature authority roles", () => {
  expect(() => assertAudioFeatureAuthorityRole(undefined)).toThrow(TypeError);
  expect(() => assertAudioFeatureAuthorityRole("automatic")).toThrow(TypeError);
});
