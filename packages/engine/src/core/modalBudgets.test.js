import { describe, expect, it } from "vitest";
import { AUDIO_DEFAULTS } from "../defaults.js";
import {
  MODAL_BASIS_ATLAS_PAGE_CAPACITY,
  MODAL_BASIS_CACHE_PAGE_CAPACITY,
  MODAL_BASIS_HANDOFF_MODE_COUNT,
  MODAL_BASIS_CACHE_RESOLUTION,
  MODAL_BASIS_STEADY_MODE_COUNT,
  MODAL_LIVE_SYNTHESIS_MODE_COUNT,
  MODAL_SEMANTIC_DESCRIPTOR_CAPACITY,
  getModalBasisCacheMaxRepresentableModeIndex,
} from "./modalBudgets.js";
import {
  RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
  RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION,
  RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
  RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
} from "./raymarch/fieldCache.js";

describe("modalBudgets", () => {
  it("keeps semantic, steady, handoff, and cache budgets distinct", () => {
    expect(MODAL_BASIS_STEADY_MODE_COUNT).toBe(12);
    expect(MODAL_BASIS_HANDOFF_MODE_COUNT).toBe(1);
    expect(RAYMARCH_MODAL_BASIS_CACHE_CAPACITY).toBe(13);
    expect(MODAL_SEMANTIC_DESCRIPTOR_CAPACITY).toBe(
      AUDIO_DEFAULTS.maxModalFieldDescriptorModes,
    );
    expect(MODAL_BASIS_ATLAS_PAGE_CAPACITY).toBe(MODAL_BASIS_STEADY_MODE_COUNT);
    expect(MODAL_BASIS_CACHE_PAGE_CAPACITY).toBe(
      RAYMARCH_MODAL_BASIS_CACHE_CAPACITY,
    );
    expect(MODAL_LIVE_SYNTHESIS_MODE_COUNT).toBe(
      RAYMARCH_LIVE_SYNTHESIS_MODE_COUNT,
    );
    expect(MODAL_SEMANTIC_DESCRIPTOR_CAPACITY).toBeGreaterThan(
      MODAL_BASIS_CACHE_PAGE_CAPACITY,
    );
    expect(MODAL_BASIS_CACHE_PAGE_CAPACITY).toBe(
      MODAL_BASIS_STEADY_MODE_COUNT + MODAL_BASIS_HANDOFF_MODE_COUNT,
    );
    expect(MODAL_LIVE_SYNTHESIS_MODE_COUNT).toBe(
      MODAL_BASIS_CACHE_PAGE_CAPACITY,
    );
  });

  it("re-exports the representable-mode index helper from fieldCache", () => {
    expect(
      getModalBasisCacheMaxRepresentableModeIndex(MODAL_BASIS_CACHE_RESOLUTION),
    ).toBe(
      Math.max(
        1,
        Math.floor(
          RAYMARCH_MODAL_BASIS_CACHE_RESOLUTION /
            RAYMARCH_MODAL_BASIS_MIN_SAMPLES_PER_CYCLE,
        ),
      ),
    );
  });
});
