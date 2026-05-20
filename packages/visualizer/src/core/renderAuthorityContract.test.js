import { describe, expect, it } from "vitest";
import {
  allowsAudioMotion,
  hasRenderAuthority,
  isRenderAuthorityCut,
} from "./renderAuthorityContract.js";

describe("render authority contract", () => {
  it("recognizes source-cut render authority", () => {
    expect(isRenderAuthorityCut({ renderAuthorityCut: true })).toBe(true);
    expect(isRenderAuthorityCut({ renderAuthorityCut: false })).toBe(false);
    expect(isRenderAuthorityCut({})).toBe(false);
  });

  it("blocks render and motion when source cut retains modal diagnostics", () => {
    const sourceCutDecayTail = {
      fieldState: "decay",
      renderAuthorityCut: true,
      renderAuthority: false,
      modalResponseEnergy: 0.72,
      modalResponseRenderEnergy: 0,
      debug: {
        modalResponseEnergy: 0.84,
      },
    };

    expect(hasRenderAuthority(sourceCutDecayTail)).toBe(false);
    expect(allowsAudioMotion(sourceCutDecayTail)).toBe(false);
  });

  it("allows active and test frames with render authority", () => {
    expect(
      hasRenderAuthority({
        fieldState: "active",
        renderAuthority: true,
        hasModalField: true,
        activeModeCount: 1,
      }),
    ).toBe(true);
    expect(hasRenderAuthority({ fieldState: "test" })).toBe(true);
    expect(allowsAudioMotion({ renderAuthority: true })).toBe(true);
  });

  it("does not treat decay as authority by itself", () => {
    expect(hasRenderAuthority({ fieldState: "decay" })).toBe(false);
    expect(allowsAudioMotion({ fieldState: "decay" })).toBe(false);
  });

  it("does not infer authority from stale render-shaped fields", () => {
    const staleFrame = {
      fieldState: "active",
      hasModalField: true,
      activeModeCount: 3,
      modalCoefficientEnergy: 0.4,
      modalResponseRenderEnergy: 0.5,
      observationEnergy: 0.6,
      modalVisibilityEnergy: 0.7,
      modalObserverVisibilityEnergy: 0.8,
      backboneSlots: new Float32Array([3, 4, 6, 0.8]),
      detailSlots: new Float32Array([4, 5, 5, 0.4]),
      modeSlots: new Float32Array([2, 3, 7, 0.5]),
    };

    expect(hasRenderAuthority(staleFrame)).toBe(false);
    expect(allowsAudioMotion(staleFrame)).toBe(false);
  });
});
