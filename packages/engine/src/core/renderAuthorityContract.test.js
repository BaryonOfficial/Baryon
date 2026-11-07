import { describe, expect, it } from "vitest";
import { createAudioFeaturePacketFixture } from "../testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "../utils/audio/audioFeaturePacketCodec.js";
import {
  hasRenderAuthority,
  allowsAudioMotion,
} from "./renderAuthorityContract.js";

describe("v3 render authority", () => {
  it("requires a complete matching model and explicit authority", () => {
    const f = createAudioFeaturePacketFixture(),
      view = createRendererFeatureView(f.model());
    expect(hasRenderAuthority(view)).toBe(true);
    expect(allowsAudioMotion(view)).toBe(true);
    expect(hasRenderAuthority({ ...view, renderAuthority: false })).toBe(false);
    expect(
      hasRenderAuthority({
        energyLedger: { projectedRenderEnergy: 1 },
        renderAuthority: true,
      }),
    ).toBe(false);
    const stale = structuredClone(view);
    stale.observation.sourceGeneration++;
    expect(hasRenderAuthority(stale)).toBe(false);
  });
  it("holds a paused response without granting motion", () => {
    const f = createAudioFeaturePacketFixture(),
      model = f.model();
    const paused = createRendererFeatureView({
      ...model,
      observation: { ...model.observation, sourcePhase: "paused" },
    });
    expect(hasRenderAuthority(paused)).toBe(true);
    expect(allowsAudioMotion(paused)).toBe(false);
  });
  it("has no amplitude floor that can remove valid quiet geometry", () => {
    const f = createAudioFeaturePacketFixture(),
      model = f.model();
    const quiet = structuredClone(model);
    for (const key of ["pressure", "velocity"])
      for (let i = 0; i < quiet.observation[key].length; i++)
        quiet.observation[key][i] *= 1e-12;
    for (const key of ["pressureMoments", "velocityMoments"])
      for (let i = 0; i < quiet.observation[key].length; i++)
        quiet.observation[key][i] *= 1e-24;
    quiet.observation.normalizationEnergy *= 1e-24;
    expect(hasRenderAuthority(createRendererFeatureView(quiet))).toBe(true);
  });
});
