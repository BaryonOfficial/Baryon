import { describe, expect, it, vi } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "../../utils/audio/audioFeaturePacketCodec.js";
import { createBroadbandFieldSource } from "./broadbandFieldSource.js";

function harness() {
  const bundles = [];
  const radius = { current: 3 };
  const create = vi.fn((_topology, initialRadius) => {
    let currentRadius = initialRadius;
    const bundle = {
      update: vi.fn(),
      compile: vi.fn(async () => {}),
      prepare: vi.fn(),
      evaluateAperture: vi.fn(() => "aperture"),
      setApertureRadius: vi.fn((nextRadius) => {
        if (currentRadius === nextRadius) return false;
        currentRadius = nextRadius;
        return true;
      }),
      dispose: vi.fn(),
      textureBytes: 123,
    };
    bundles.push(bundle);
    return bundle;
  });
  return {
    source: createBroadbandFieldSource({
      create,
      getApertureRadius: () => radius.current,
    }),
    create,
    bundles,
    radius,
  };
}
function frame(f) {
  return createRendererFeatureView(f.model());
}
function otherBasisFixture() {
  return createAudioFeaturePacketFixture({
    configuration: { processingRevision: 1, boundaryMode: "dirichlet" },
  });
}

describe("v3 full-basis GPU resource ownership", () => {
  it("compiles one basis for ten observations; repeated reads/replay and preparation cannot bootstrap audio", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    for (let i = 0; i < 10; i++) {
      const value = frame(f);
      expect(h.source.upload(value).accepted).toBe(true);
      expect(h.source.upload(value).accepted).toBe(false);
      expect(h.source.upload(structuredClone(value)).accepted).toBe(false);
      h.source.prepare({});
      h.source.prepare({});
      h.source.read();
      h.source.evaluateAperture({});
    }
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.bundles[0].update).toHaveBeenCalledTimes(10);
    expect(h.bundles[0].prepare).toHaveBeenCalledTimes(10);
    expect(h.source.read()).toMatchObject({
      basisCompileCount: 1,
      observationUploadCount: 10,
      textureBytes: 123,
    });
    expect(f.state.acceptedBlocks).toBe(10);
  });
  it("refreshes a continuous spatial radius without creating a topology, acoustic upload or extra draw on repeated reads", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    h.source.upload(frame(f));
    expect(h.create.mock.calls[0][1]).toBe(3);
    h.source.prepare({});
    const before = h.source.read();
    h.radius.current = 2.173;
    expect(h.source.prepare({})).toBe(true);
    expect(h.source.prepare({})).toBe(false);
    expect(h.bundles[0].prepare).toHaveBeenCalledTimes(2);
    expect(h.bundles[0].setApertureRadius).toHaveBeenLastCalledWith(2.173);
    expect(h.source.read()).toEqual(before);
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.bundles[0].update).toHaveBeenCalledOnce();
    expect(f.state.acceptedBlocks).toBe(1);
  });
  it("retains a failed radius-only refresh for retry without another upload or radius change", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    h.source.upload(frame(f));
    h.source.prepare({});
    h.radius.current = 1.5;
    h.bundles[0].prepare.mockImplementationOnce(() => {
      throw new Error("GPU submission failed");
    });
    expect(() => h.source.prepare({})).toThrow("GPU submission failed");
    expect(h.source.prepare({})).toBe(true);
    expect(h.source.prepare({})).toBe(false);
    expect(h.bundles[0].update).toHaveBeenCalledOnce();
    expect(h.create).toHaveBeenCalledOnce();
  });
  it("a newer source on the same basis restarts its timeline on the compiled resources and rejects stale old-source replay", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    h.source.upload(frame(f));
    const old = frame(f);
    h.source.upload(old);
    const next = frame(
      createAudioFeaturePacketFixture({ sourceGeneration: 2 }),
    );
    expect(next.observation.endSample).toBeLessThan(old.observation.endSample);
    expect(h.source.hasBasis(next.topology)).toBe(true);
    expect(h.source.upload(next)).toMatchObject({
      accepted: true,
      epochChanged: true,
      revision: 1,
    });
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.bundles[0].dispose).not.toHaveBeenCalled();
    expect(h.bundles[0].update).toHaveBeenLastCalledWith(next.observation, {
      restartTimeline: true,
    });
    expect(h.source.upload(old)).toEqual({
      accepted: false,
      reason: "stale-topology",
    });
    expect(h.source.read()).toMatchObject({
      topology: next.topology,
      frameId: next.observation.frameId,
      basisCompileCount: 1,
    });
  });
  it("allocates a basis from topology alone; the first observation uploads into it", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    const first = frame(f);
    expect(h.source.ensureBasis(first.topology)).toBe(true);
    expect(h.source.ensureBasis(first.topology)).toBe(false);
    expect(h.bundles[0].update).not.toHaveBeenCalled();
    expect(h.source.read()).toMatchObject({
      basisCompileCount: 1,
      observationUploadCount: 0,
      revision: 1,
    });
    expect(h.source.upload(first)).toMatchObject({
      accepted: true,
      epochChanged: true,
      revision: 1,
    });
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.bundles[0].update).toHaveBeenCalledWith(first.observation, {
      restartTimeline: true,
    });
    expect(h.source.ensureBasis(otherBasisFixture().topology)).toBe(true);
    expect(h.bundles[0].dispose).toHaveBeenCalledOnce();
    expect(() => h.source.ensureBasis({})).toThrow(/complete static apparatus/);
  });
  it("replaces resources only for a different basis", () => {
    const h = harness(),
      next = frame(otherBasisFixture());
    h.source.upload(frame(createAudioFeaturePacketFixture()));
    expect(h.source.hasBasis(next.topology)).toBe(false);
    expect(h.source.upload(next)).toMatchObject({
      accepted: true,
      revision: 2,
    });
    expect(h.bundles[0].dispose).toHaveBeenCalledOnce();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.source.read().basisCompileCount).toBe(2);
  });
  it("detects changed static physics under reused revision ids", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    h.source.upload(frame(f));
    const changed = structuredClone(frame(f));
    changed.topology.qualityFactors[0] += 1;
    expect(() => h.source.upload(changed)).toThrow(/without a new revision/);
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.source.read().frameId).toBe(1);
  });
  it("rejects malformed observations before creating GPU resources", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness(),
      bad = structuredClone(frame(f));
    bad.observation.pressureMoments = new Float64Array(1);
    expect(() => h.source.upload(bad)).toThrow(/contract/);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("never retains validation authority for a mutable boundary frame", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    const transported = structuredClone(frame(f));
    h.source.upload(transported);
    transported.observation.frameId++;
    transported.frameId++;
    transported.observation.normalizationEnergy = -1;
    expect(() => h.source.upload(transported)).toThrow(/contract/);
    expect(h.bundles[0].update).toHaveBeenCalledOnce();
    expect(h.source.read().frameId).toBe(1);
  });

  it("does not dispose the current basis if replacement fails and disposes the failed candidate", () => {
    const f = createAudioFeaturePacketFixture(),
      next = otherBasisFixture(),
      h = harness();
    h.source.upload(frame(f));
    const previous = h.source.read();
    const failed = {
      update: () => {
        throw new Error("upload failed");
      },
      dispose: vi.fn(),
    };
    h.create.mockReturnValueOnce(failed);
    expect(() => h.source.upload(frame(next))).toThrow(/upload failed/);
    expect(failed.dispose).toHaveBeenCalledOnce();
    expect(h.bundles[0].dispose).not.toHaveBeenCalled();
    expect(h.source.read()).toEqual(previous);
  });
  it("disposes resources once and cannot be restarted by a cached frame", () => {
    const f = createAudioFeaturePacketFixture(),
      h = harness();
    h.source.upload(frame(f));
    h.source.dispose();
    h.source.dispose();
    expect(h.bundles[0].dispose).toHaveBeenCalledOnce();
    expect(() => h.source.upload(frame(f))).toThrow(/disposed/);
  });
});
