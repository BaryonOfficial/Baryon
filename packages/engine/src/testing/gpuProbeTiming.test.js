import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGpuCompletionSampler,
  createGpuFrameTimestampSampler,
  resolveGpuProbeTiming,
  installGpuProbeTiming,
} from "./gpuProbeTiming.js";

function rendererWithIntervals(intervals) {
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  const data = BigUint64Array.from(intervals.flat());
  const resultBuffer = {
    mapAsync: vi.fn(async () => {}),
    getMappedRange: vi.fn(() => data.buffer),
    unmap: vi.fn(),
  };
  return {
    backend: {
      timestampQueryPool: {
        render: {
          currentQueryIndex: data.length,
          resultBuffer,
          resolveQueriesAsync: vi.fn(async () => 99),
        },
      },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("bounded production-frame GPU timestamp profiling", () => {
  function harness() {
    const reads = [];
    const renderer = {
      backend: {
        trackTimestamp: false,
        device: { features: new Set(["timestamp-query"]) },
      },
    };
    const onTiming = vi.fn();
    const resolveTiming = vi.fn(
      () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
    );
    const sampler = createGpuFrameTimestampSampler({
      renderer,
      onTiming,
      resolveTiming,
    });
    return { renderer, onTiming, resolveTiming, sampler, reads };
  }
  it("samples one armed frame, disables tracking before resolving and bounds pending reads", async () => {
    const h = harness(),
      first = {},
      sampled = {};
    expect(h.sampler.observeCompletion(first)).toBe(false);
    expect(h.renderer.backend.trackTimestamp).toBe(true);
    expect(h.sampler.observeCompletion(first)).toBe(false);
    h.resolveTiming.mockImplementationOnce(() => {
      expect(h.renderer.backend.trackTimestamp).toBe(false);
      return new Promise((resolve, reject) =>
        h.reads.push({ resolve, reject }),
      );
    });
    expect(h.sampler.observeCompletion(sampled)).toBe(true);
    for (let i = 0; i < 100; i++) h.sampler.observeCompletion({});
    expect(h.resolveTiming).toHaveBeenCalledOnce();
    expect(h.sampler.read()).toMatchObject({
      completed: 102,
      requested: 1,
      skippedWhileResolving: 100,
      pending: true,
      armed: false,
    });
    const timing = { elapsedMs: 20 };
    h.reads[0].resolve(timing);
    await h.sampler.drain();
    expect(h.onTiming).toHaveBeenCalledExactlyOnceWith(timing, sampled);
    expect(h.renderer.backend.trackTimestamp).toBe(false);
    expect(h.sampler.read()).toMatchObject({
      sampled: 1,
      closed: true,
      pending: false,
      armed: false,
    });
    expect(h.sampler.observeCompletion({})).toBe(false);
  });
  it("waits for a completion boundary before rearming after a read", async () => {
    const h = harness();
    h.sampler.observeCompletion({});
    h.sampler.observeCompletion({});
    h.reads[0].resolve({ elapsedMs: 1 });
    await vi.waitFor(() => expect(h.sampler.read().pending).toBe(false), {
      interval: 1,
    });
    expect(h.renderer.backend.trackTimestamp).toBe(false);
    // A frame submitted while readback was pending may still be in flight.
    // Its completion has no timestamp evidence and only arms the next frame.
    expect(h.sampler.observeCompletion({})).toBe(false);
    expect(h.renderer.backend.trackTimestamp).toBe(true);
    expect(h.resolveTiming).toHaveBeenCalledOnce();
    await h.sampler.drain();
    expect(h.sampler.read().discardedArmedWindows).toBe(1);
  });
  it("reports a failed read and never rearms or fabricates a timing", async () => {
    const h = harness();
    h.sampler.observeCompletion({});
    h.sampler.observeCompletion({});
    h.reads[0].reject(new Error("query unavailable"));
    await expect(h.sampler.drain()).rejects.toThrow("query unavailable");
    expect(h.onTiming).not.toHaveBeenCalled();
    expect(h.renderer.backend.trackTimestamp).toBe(false);
    expect(h.sampler.observeCompletion({})).toBe(false);
  });
  it("rejects unsupported queries and an existing tracking owner", () => {
    expect(() =>
      createGpuFrameTimestampSampler({
        renderer: { backend: { device: { features: new Set() } } },
        onTiming: () => {},
      }),
    ).toThrow("unavailable");
    expect(() =>
      createGpuFrameTimestampSampler({
        renderer: {
          backend: {
            device: { features: new Set(["timestamp-query"]) },
            trackTimestamp: true,
          },
        },
        onTiming: () => {},
      }),
    ).toThrow("owner");
  });
  it.each(["sync-read", "record"])(
    "keeps %s failures visible without rearming",
    async (mode) => {
      const h = harness();
      if (mode === "sync-read")
        h.resolveTiming.mockImplementationOnce(() => {
          throw new Error("read failed");
        });
      else
        h.onTiming.mockImplementationOnce(() => {
          throw new Error("record failed");
        });
      h.sampler.observeCompletion({});
      h.sampler.observeCompletion({});
      if (mode === "record") h.reads[0].resolve({ elapsedMs: 1 });
      await expect(h.sampler.drain()).rejects.toThrow("failed");
      expect(h.sampler.read()).toMatchObject({
        requested: 1,
        sampled: 0,
        armed: false,
        pending: false,
      });
      expect(h.renderer.backend.trackTimestamp).toBe(false);
    },
  );
});

describe("native GPU timing measurement", () => {
  it("rejects stale GPU intervals outside the enclosing wall window", async () => {
    const renderer = rendererWithIntervals([[1000000000n, 14000000000n]]);
    await expect(
      resolveGpuProbeTiming(renderer, performance.now()),
    ).rejects.toThrow("wall window");
  });

  it("includes overlapping compute and render intervals in one elapsed GPU span", async () => {
    const renderer = rendererWithIntervals([[1000000000n, 1010000000n]]);
    renderer.backend.timestampQueryPool.compute = rendererWithIntervals([
      [1005000000n, 1020000000n],
    ]).backend.timestampQueryPool.render;
    const timing = await resolveGpuProbeTiming(renderer);
    expect(timing.elapsedMs).toBe(20);
    expect(timing.unionMs).toBe(20);
    expect(timing.rawPassSumMs).toBe(25);
    expect(timing.passCount).toBe(2);
    expect(timing.passTypes).toEqual(["render", "compute"]);
    expect(timing.passRangesMs).toEqual([
      [0, 10],
      [5, 20],
    ]);
    expect(
      renderer.backend.timestampQueryPool.render.resolveQueriesAsync,
    ).toHaveBeenCalledOnce();
    expect(
      renderer.backend.timestampQueryPool.compute.resolveQueriesAsync,
    ).toHaveBeenCalledOnce();
  });

  it("measures compute-only work without inventing a render interval", async () => {
    const renderer = rendererWithIntervals([]);
    renderer.backend.timestampQueryPool.compute = rendererWithIntervals([
      [1000000000n, 1002000000n],
    ]).backend.timestampQueryPool.render;
    const timing = await resolveGpuProbeTiming(renderer);
    expect(timing.elapsedMs).toBe(2);
    expect(timing.passCount).toBe(1);
    expect(
      renderer.backend.timestampQueryPool.render.resolveQueriesAsync,
    ).not.toHaveBeenCalled();
    expect(
      renderer.backend.timestampQueryPool.compute.resolveQueriesAsync,
    ).toHaveBeenCalledOnce();
  });
  it("distinguishes elapsed, occupied and summed time for nested passes and gaps", async () => {
    const origin = 1000000000000000000n;
    const intervals = [
      [12n, 16n],
      [0n, 10n],
      [2n, 5n],
      [4n, 11n],
    ].map((range) => range.map((t) => origin + t * 1000000n));
    const renderer = rendererWithIntervals(intervals);
    const timing = await resolveGpuProbeTiming(renderer);
    expect(timing).toEqual({
      elapsedMs: 16,
      unionMs: 15,
      rawPassSumMs: 24,
      reportedPassSumMs: 99,
      passCount: 4,
      passTypes: ["render", "render", "render", "render"],
      passRangesMs: [
        [0, 10],
        [2, 5],
        [4, 11],
        [12, 16],
      ],
    });
    expect(
      renderer.backend.timestampQueryPool.render.resultBuffer.unmap,
    ).toHaveBeenCalledOnce();
  });

  it.each([
    { intervals: [] },
    { intervals: [[0n, 1n]] },
    { intervals: [[4n, 3n]] },
  ])(
    "rejects absent or invalid timestamp evidence ($intervals)",
    async ({ intervals }) => {
      const renderer = rendererWithIntervals(intervals);
      await expect(resolveGpuProbeTiming(renderer)).rejects.toThrow();
    },
  );

  it("unmaps when reading the copied query data fails", async () => {
    const renderer = rendererWithIntervals([[1n, 2n]]);
    const buffer = renderer.backend.timestampQueryPool.render.resultBuffer;
    buffer.getMappedRange.mockImplementation(() => {
      throw new Error("unavailable timestamp data");
    });
    await expect(resolveGpuProbeTiming(renderer)).rejects.toThrow(
      "unavailable",
    );
    expect(buffer.unmap).toHaveBeenCalledOnce();
  });
});

function completionHarness() {
  const fences = [];
  const clock = { wall: 100, audio: 1 };
  const completeSubmittedWork = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        fences.push({ resolve, reject });
      }),
  );
  const sampler = createGpuCompletionSampler({
    completeSubmittedWork,
    now: () => clock.wall,
    audioTime: () => clock.audio,
  });
  const submit = () => {
    const record = { sourceTimeSeconds: 0.8 };
    sampler.observe(record, {
      startedAtMs: clock.wall - 2,
      submittedAtMs: clock.wall,
      availableAtContextSeconds: 0.9,
      responseAtContextSeconds: 0.8,
    });
    return record;
  };
  return { sampler, submit, fences, clock, completeSubmittedWork };
}

describe("asynchronous GPU completion sampling", () => {
  it("reuses a presentation fence without issuing another GPU request", async () => {
    const h = completionHarness();
    let finish;
    const completion = new Promise((resolve) => {
      finish = resolve;
    });
    const record = {};
    h.sampler.observe(
      record,
      {
        startedAtMs: 98,
        submittedAtMs: 100,
        availableAtContextSeconds: 0.9,
        responseAtContextSeconds: 0.8,
      },
      completion,
    );
    expect(h.completeSubmittedWork).not.toHaveBeenCalled();
    finish();
    await h.sampler.drain();
    expect(h.completeSubmittedWork).not.toHaveBeenCalled();
    expect(record.completionSampling).toBe("submission-fence");
    expect(h.sampler.read().sampled).toBe(1);
  });

  it("bounds outstanding fences and leaves skipped measurements explicitly absent", async () => {
    const h = completionHarness();
    const first = h.submit();
    const second = h.submit();
    expect(h.completeSubmittedWork).toHaveBeenCalledOnce();
    expect(first.completionAgeSeconds).toBeNull();
    expect(second.completionAgeSeconds).toBeNull();
    expect(first.submitCpuMs).toBe(2);
    expect(first.submissionAgeSeconds).toBeCloseTo(0.1);
    h.clock.wall = 115;
    h.clock.audio = 1.02;
    h.fences[0].resolve();
    await Promise.resolve();
    expect(first.completionAgeSeconds).toBeCloseTo(0.12);
    expect(first.responseAgeSeconds).toBeCloseTo(0.22);
    expect(first.submissionAndCompletionMs).toBe(17);
    expect(first.queueCompletionMs).toBe(15);
    expect(first.completionSampling).toBe("submission-fence");
    expect(first.gpuMs).toBeNull();
    expect(second.completionAgeSeconds).toBeNull();
    expect(h.sampler.read()).toMatchObject({
      submitted: 2,
      sampled: 1,
      unsampled: 1,
      skippedWhilePending: 1,
      pending: false,
    });
  });

  it("drains submissions after a pending fence without queuing one callback per frame", async () => {
    const h = completionHarness();
    h.submit();
    const skipped = Array.from({ length: 100 }, h.submit);
    const draining = h.sampler.drain();
    expect(() => h.submit()).toThrow("closed");
    expect(h.completeSubmittedWork).toHaveBeenCalledOnce();
    h.fences[0].resolve();
    // drain resumes only after the first completion handler has settled.
    await Promise.resolve();
    await Promise.resolve();
    expect(h.completeSubmittedWork).toHaveBeenCalledTimes(2);
    h.clock.wall = 180;
    h.fences[1].resolve();
    await draining;
    await h.sampler.drain();
    expect(h.completeSubmittedWork).toHaveBeenCalledTimes(2);
    expect(skipped[0].completionSampling).toBeNull();
    expect(skipped.at(-1).completionSampling).toBe("terminal-drain");
    expect(h.sampler.read()).toEqual({
      submitted: 101,
      sampled: 2,
      unsampled: 99,
      skippedWhilePending: 100,
      terminalDrainSamples: 1,
      pending: false,
      drained: true,
    });
  });

  it("does not add a terminal fence when the last submission was already covered", async () => {
    const h = completionHarness();
    h.submit();
    h.fences[0].resolve();
    await h.sampler.drain();
    expect(h.completeSubmittedWork).toHaveBeenCalledOnce();
    expect(h.sampler.read().drained).toBe(true);
  });

  it("propagates an asynchronous device failure without an unhandled rejection", async () => {
    const h = completionHarness();
    h.submit();
    h.fences[0].reject(new Error("device lost"));
    await Promise.resolve();
    expect(() => h.sampler.assertHealthy()).toThrow("device lost");
    expect(() => h.submit()).toThrow("device lost");
    await expect(h.sampler.drain()).rejects.toThrow("device lost");
    expect(h.sampler.read().sampled).toBe(0);
  });

  it("records measurements without altering acoustic or observer state", async () => {
    const h = completionHarness();
    const record = {
      sample: 1024,
      observerSteps: 2,
      observerReset: false,
      sourceGeneration: 7,
    };
    h.sampler.observe(record, {
      startedAtMs: 98,
      submittedAtMs: 100,
      availableAtContextSeconds: 0.9,
      responseAtContextSeconds: 0.8,
    });
    h.fences[0].resolve();
    await h.sampler.drain();
    expect(record).toMatchObject({
      sample: 1024,
      observerSteps: 2,
      observerReset: false,
      sourceGeneration: 7,
    });
    expect(h.sampler.read().submitted).toBe(1);
  });
});

describe("native timestamp descriptor ownership", () => {
  function backendFixture() {
    const shared = {};
    const backend = {
      trackTimestamp: true,
      timestampQueryPool: { render: null, compute: null },
      initTimestampQuery: vi.fn((type, uid, descriptor) => {
        const pool = (backend.timestampQueryPool[type] ??= {
          querySet: {},
          currentQueryIndex: 0,
        });
        shared.querySet = pool.querySet;
        shared.beginningOfPassWriteIndex = pool.currentQueryIndex;
        shared.endOfPassWriteIndex = pool.currentQueryIndex + 1;
        pool.currentQueryIndex += 2;
        descriptor.timestampWrites = shared;
      }),
    };
    return { backend };
  }
  it("gives every actual render/compute pass an immutable descriptor in one query set", () => {
    const renderer = backendFixture(),
      original = renderer.backend.initTimestampQuery;
    const restore = installGpuProbeTiming(renderer),
      render = {},
      compute = {};
    renderer.backend.initTimestampQuery("render", "1:f1", render);
    renderer.backend.initTimestampQuery("compute", "1:f1", compute);
    expect(render.timestampWrites).not.toBe(compute.timestampWrites);
    expect(render.timestampWrites.querySet).toBe(
      compute.timestampWrites.querySet,
    );
    expect(render.timestampWrites.beginningOfPassWriteIndex).toBe(0);
    expect(compute.timestampWrites.beginningOfPassWriteIndex).toBe(2);
    expect(original.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      ["render", "render:1:f1"],
      ["render", "compute:1:f1"],
    ]);
    restore();
    expect(renderer.backend.initTimestampQuery).toBe(original);
    expect(render.timestampWrites).toBeUndefined();
    expect(compute.timestampWrites).toBeUndefined();
  });
  it("removes cached timestamp writes while disarmed without allocating queries", () => {
    const renderer = backendFixture(),
      original = renderer.backend.initTimestampQuery;
    const restore = installGpuProbeTiming(renderer),
      descriptor = {};
    renderer.backend.initTimestampQuery("render", "1:f1", descriptor);
    renderer.backend.trackTimestamp = false;
    renderer.backend.initTimestampQuery("render", "1:f2", descriptor);
    expect(descriptor.timestampWrites).toBeUndefined();
    expect(original).toHaveBeenCalledOnce();
    restore();
  });
  it("rejects a competing owner or existing mixed query pools", () => {
    const renderer = backendFixture(),
      restore = installGpuProbeTiming(renderer);
    expect(() => installGpuProbeTiming(renderer)).toThrow("owner");
    restore();
    const nextRestore = installGpuProbeTiming(renderer);
    restore(); // An old cleanup must not release a newer owner's lease.
    expect(() => installGpuProbeTiming(renderer)).toThrow("owner");
    nextRestore();
    renderer.backend.timestampQueryPool.compute = {};
    expect(() => installGpuProbeTiming(renderer)).toThrow("mixed");
  });
});
