import { describe, expect, it } from "vitest";
import { AUDIO_DEFAULTS } from "../defaults.js";
import { MODAL_SEMANTIC_DESCRIPTOR_CAPACITY } from "./modalBudgets.js";

describe("modalBudgets", () => {
  it("keeps one semantic capacity across analysis and rendering", () => {
    expect(MODAL_SEMANTIC_DESCRIPTOR_CAPACITY).toBe(
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    );
  });
});
