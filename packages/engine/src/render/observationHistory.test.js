import { describe, expect, it } from "vitest";
import { createObservationHistory } from "./observationHistory.js";

const generation = {
  sourceGeneration: 1,
  timelineRevision: 0,
  processingRevision: 0,
};
const frame = (sample, revisions = generation) => ({
  ...revisions,
  endSample: sample,
});

describe("bounded presentation observation history", () => {
  it("reuses released slots without reordering retained observations", () => {
    const history = createObservationHistory({ generation, capacity: 2 });
    history.offer(frame(512));
    history.offer(frame(1024));
    expect(history.take().endSample).toBe(512);
    history.offer(frame(1536));
    expect(history.take().endSample).toBe(1024);
    expect(history.take().endSample).toBe(1536);
    history.offer(frame(2048));
    expect(history.take().endSample).toBe(2048);
    expect(history.read()).toMatchObject({
      queued: 0,
      accepted: 4,
      consumed: 4,
      highWaterMark: 2,
    });
  });
  it("retains every accepted endpoint in order across delayed presentation", () => {
    const history = createObservationHistory({ generation, capacity: 4 });
    const frames = [0, 512, 1024, 1536].map((sample) => frame(sample));
    frames.forEach((value) => expect(history.offer(value)).toBe(true));
    expect(history.read()).toMatchObject({
      queued: 4,
      consumed: 0,
      highWaterMark: 4,
    });
    expect(frames.map(() => history.take())).toEqual(frames);
    expect(history.take()).toBeNull();
    expect(history.read()).toMatchObject({
      queued: 0,
      accepted: 4,
      consumed: 4,
    });
  });

  it("does not let cached reads, duplicate endpoints or stale generations republish history", () => {
    const history = createObservationHistory({ generation, capacity: 2 });
    const first = frame(512);
    history.offer(first);
    expect(history.offer(first)).toBe(false);
    expect(history.offer(frame(0))).toBe(false);
    expect(
      history.offer(frame(1024, { ...generation, sourceGeneration: 2 })),
    ).toBe(false);
    expect(history.read()).toEqual(history.read());
    expect(history.take()).toBe(first);
    expect(history.take()).toBeNull();
    // A duplicate cannot re-enter even after the queue has been drained.
    expect(history.offer(first)).toBe(false);
  });

  it("fails explicitly on overflow without replacing an intermediate observation", () => {
    const history = createObservationHistory({ generation, capacity: 2 });
    history.offer(frame(512));
    history.offer(frame(1024));
    expect(() => history.offer(frame(1536))).toThrow(
      "observation history capacity",
    );
    expect(() => history.take()).toThrow("observation history capacity");
    expect(() => history.offer(frame(2048))).toThrow(
      "observation history capacity",
    );
    expect(history.read()).toMatchObject({
      queued: 2,
      accepted: 2,
      consumed: 0,
    });
  });

  it("replacing the presentation generation cannot release or consume new history through the old owner", () => {
    const old = createObservationHistory({ generation, capacity: 2 });
    old.offer(frame(512));
    const nextGeneration = { ...generation, timelineRevision: 1 };
    const next = createObservationHistory({
      generation: nextGeneration,
      capacity: 2,
    });
    expect(next.offer(frame(1024))).toBe(false);
    const current = frame(0, nextGeneration);
    next.offer(current);
    old.take();
    expect(next.take()).toBe(current);
    expect(next.read()).toMatchObject({ accepted: 1, consumed: 1 });
  });

  it("rejects invalid capacity, generation and observation cursors", () => {
    for (const capacity of [0, -1, 1.5, Infinity])
      expect(() =>
        createObservationHistory({ generation, capacity }),
      ).toThrow();
    expect(() =>
      createObservationHistory({ generation: {}, capacity: 2 }),
    ).toThrow();
    const history = createObservationHistory({ generation, capacity: 2 });
    for (const sample of [-1, NaN, Infinity, 0.5])
      expect(() => history.offer(frame(sample))).toThrow("observation cursor");
    expect(history.read()).toMatchObject({ queued: 0, accepted: 0 });
  });
});
