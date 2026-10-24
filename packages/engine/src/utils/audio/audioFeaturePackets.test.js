import { describe, expect, it } from "vitest";
import { createAudioFeaturePacketFixture } from "../../testing/audioFeaturePacketFixture.js";
import { createAudioFeaturePacketJoiner } from "./audioFeaturePackets.js";

function joiner(fixture) {
  return createAudioFeaturePacketJoiner(fixture.topology);
}
describe("v3 complete model joining", () => {
  it("joins either arrival order and only retains the newest future observation", () => {
    const f = createAudioFeaturePacketFixture();
    const first = f.advance(),
      second = f.advance();
    for (const order of ["topology", "observation"]) {
      const j = joiner(f);
      if (order === "topology") j.acceptTopology(f.topology);
      expect(j.acceptObservation(first).accepted).toBe(true);
      expect(j.acceptObservation(second).accepted).toBe(true);
      if (order === "observation") {
        expect(j.readLatestModel()).toBe(null);
        expect(j.acceptObservation(first).accepted).toBe(false);
        j.acceptTopology(f.topology);
      }
      expect(j.readLatestModel()).toEqual({
        topology: f.topology,
        observation: second,
      });
      expect(j.acceptObservation(second).accepted).toBe(false);
    }
  });
  it("rejects stale epochs and cannot reactivate a revoked epoch", () => {
    const f = createAudioFeaturePacketFixture(),
      model = f.model(),
      j = joiner(f);
    j.acceptTopology(model.topology);
    j.acceptObservation(model.observation);
    for (const key of [
      "sourceGeneration",
      "workerGeneration",
      "timelineRevision",
      "processingRevision",
    ])
      expect(
        j.acceptObservation({
          ...model.observation,
          [key]: model.observation[key] + 1,
        }).accepted,
      ).toBe(false);
    j.clear();
    expect(j.setEpoch(f.topology)).toBe(false);
    expect(j.acceptTopology(f.topology).accepted).toBe(false);
    expect(j.acceptObservation(model.observation).accepted).toBe(false);
    expect(j.readLatestModel()).toBe(null);
    const next = createAudioFeaturePacketFixture({ workerGeneration: 2 });
    expect(j.setEpoch(next.topology)).toBe(true);
    expect(j.acceptTopology(next.topology).accepted).toBe(true);
    expect(j.acceptObservation(next.advance()).published).toBe(true);
    expect(() => j.setEpoch(f.topology)).toThrow(/backward/);
  });
  it("invalidates the old complete model when a newer topology is known", () => {
    const f = createAudioFeaturePacketFixture(),
      j = joiner(f),
      first = f.advance();
    j.acceptTopology(f.topology);
    j.acceptObservation(first);
    const next = { ...f.topology, topologyRevision: 2 };
    expect(j.acceptTopology(next).accepted).toBe(true);
    expect(j.readLatestModel()).toBe(null);
    expect(j.acceptObservation(f.advance()).accepted).toBe(false);
    expect(
      j.acceptObservation({ ...f.advance(), topologyRevision: 2 }).published,
    ).toBe(true);
  });
  it("rejects corrupt held moments when topology arrives without publishing them", () => {
    const f = createAudioFeaturePacketFixture(),
      j = joiner(f);
    const observation = { ...f.advance(), normalizationEnergy: 123 };
    expect(j.acceptObservation(observation).accepted).toBe(true);
    expect(j.acceptTopology(f.topology).published).toBe(false);
    expect(j.readLatestModel()).toBe(null);
  });
});
