import { describe, expect, it } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import {
  createRendererFeatureView,
  restoreTransportedRendererFeatureViewOwnership,
} from "./audioFeaturePacketCodec.js";
import { isRendererFeatureUploadContract } from "../../contracts/audioFeatureProtocol.js";

describe("v3 renderer views", () => {
  it("retains full immutable packet ownership without another normalization or legacy phase projection", () => {
    const f = createAudioFeaturePacketFixture(),
      model = f.model();
    const view = createRendererFeatureView(model);
    expect(view.topology).toBe(model.topology);
    expect(view.observation).toBe(model.observation);
    expect(view.observation.pressureMoments).toBe(
      model.observation.pressureMoments,
    );
    expect(Object.isFrozen(view)).toBe(true);
    expect(createRendererFeatureView(model)).toBe(view);
    expect(isRendererFeatureUploadContract(view)).toBe(true);
    expect(view).not.toHaveProperty("modalFieldPhaseSlots");
    expect(view).not.toHaveProperty("drive");
  });
  it("uses one renderer view for one immutable packet pair across history wrappers", () => {
    const fixture = createAudioFeaturePacketFixture();
    const model = fixture.model(),
      view = createRendererFeatureView(model);
    expect(createRendererFeatureView({ ...model })).toBe(view);
    expect(createRendererFeatureView(view)).toBe(view);
    const next = fixture.model();
    expect(createRendererFeatureView(next)).not.toBe(view);
    expect(createRendererFeatureView(model)).toBe(view);
    expect(fixture.state.acceptedBlocks).toBe(2);
  });

  it("revalidates mutable imported models rather than returning a stale projection", () => {
    const fixture = createAudioFeaturePacketFixture();
    const model = structuredClone(fixture.model());
    const running = createRendererFeatureView(model);
    model.observation.sourcePhase = "paused";
    model.observation.startSample = model.observation.endSample;
    const paused = createRendererFeatureView(model);
    expect(paused).not.toBe(running);
    expect(paused.audioMotionAuthority).toBe(false);
    model.observation.normalizationEnergy = -1;
    expect(() => createRendererFeatureView(model)).toThrow(/Invalid/);
  });

  it("local view provenance cannot authorize another topology, a spread, or a transported malformed packet", () => {
    const fixture = createAudioFeaturePacketFixture(),
      model = fixture.model();
    const view = createRendererFeatureView(model);
    expect(isRendererFeatureUploadContract(view, model.topology)).toBe(true);
    expect(isRendererFeatureUploadContract(view, { ...model.topology })).toBe(
      false,
    );
    for (const copy of [{ ...view }, structuredClone(view)]) {
      const malformed = {
        ...copy,
        observation: { ...copy.observation, normalizationEnergy: -1 },
      };
      Object.freeze(malformed);
      expect(isRendererFeatureUploadContract(malformed)).toBe(false);
      expect(() => createRendererFeatureView(malformed)).toThrow(/Invalid/);
    }
  });

  it("validates transported packet dimensions and preserves explicit authority revocation", () => {
    const f = createAudioFeaturePacketFixture(),
      view = createRendererFeatureView(f.model());
    const transferred = structuredClone(view);
    expect(
      isRendererFeatureUploadContract(
        restoreTransportedRendererFeatureViewOwnership(transferred),
      ),
    ).toBe(true);
    expect(
      restoreTransportedRendererFeatureViewOwnership({
        ...transferred,
        renderAuthority: false,
      }).renderAuthority,
    ).toBe(false);
    transferred.observation.pressureMoments = new Float64Array(1);
    expect(() =>
      restoreTransportedRendererFeatureViewOwnership(transferred),
    ).toThrow(/Invalid/);
  });
  it("holds paused state with motion disabled and rejects malformed complete models", () => {
    const f = createAudioFeaturePacketFixture(),
      model = f.model();
    const view = createRendererFeatureView({
      ...model,
      observation: {
        ...model.observation,
        sourcePhase: "paused",
        startSample: model.observation.endSample,
      },
    });
    expect(view.audioMotionAuthority).toBe(false);
    expect(view.renderAuthority).toBe(true);
    expect(() =>
      createRendererFeatureView({
        ...model,
        observation: { ...model.observation, normalizationEnergy: 123 },
      }),
    ).toThrow(/Invalid/);
    expect(createRendererFeatureView(null)).toBe(null);
  });
});
