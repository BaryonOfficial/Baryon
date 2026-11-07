// Diagnostic-only ownership of the installed Three.js timestamp initializer.
// Its cached pass descriptors retain timestampWrites when tracking is disabled,
// and its shared writes object can be overwritten by another pass. Detach each
// descriptor and keep render/compute intervals in one resolved query set.
const timestampOwners = new WeakMap();
const passTypesByPool = new WeakMap();

export function installGpuProbeTiming(renderer) {
  const backend = renderer.backend;
  if (timestampOwners.has(backend))
    throw new Error("GPU timestamp owner already installed");
  if (typeof backend.initTimestampQuery !== "function")
    throw new Error("native timestamp initializer is unavailable");
  if (
    Object.entries(backend.timestampQueryPool ?? {}).some(
      ([type, pool]) => type !== "render" && pool != null,
    )
  )
    throw new Error(
      "existing mixed timestamp pools cannot form one measurement window",
    );
  const initialize = backend.initTimestampQuery;
  const descriptors = new Map();
  function initializeOwned(type, uid, descriptor) {
    if (!backend.trackTimestamp) {
      delete descriptor.timestampWrites;
      return;
    }
    initialize.call(backend, "render", `${type}:${uid}`, descriptor);
    const writes = { ...descriptor.timestampWrites };
    if (
      !writes.querySet ||
      !Number.isSafeInteger(writes.beginningOfPassWriteIndex)
    )
      throw new Error("native timestamp allocation failed");
    descriptor.timestampWrites = writes;
    descriptors.set(descriptor, writes);
    const pool = backend.timestampQueryPool.render;
    let types = passTypesByPool.get(pool);
    if (!types) passTypesByPool.set(pool, (types = new Map()));
    types.set(writes.beginningOfPassWriteIndex, type);
  }
  backend.initTimestampQuery = initializeOwned;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    if (backend.initTimestampQuery === initializeOwned)
      backend.initTimestampQuery = initialize;
    for (const [descriptor, writes] of descriptors)
      if (descriptor.timestampWrites === writes)
        delete descriptor.timestampWrites;
    descriptors.clear();
    timestampOwners.delete(backend);
  };
  timestampOwners.set(backend, restore);
  return restore;
}

// Diagnostic access to the installed r185 timestamp pool, isolated from
// production. Some native backends report overlapping pass intervals; summing
// them is not elapsed time for a multi-pass frame. Preserve both measurements.
export async function resolveGpuProbeTiming(renderer, startedAtMs) {
  const pools = Object.entries(
    renderer.backend.timestampQueryPool ?? {},
  ).filter(([, pool]) => pool?.currentQueryIndex > 0);
  if (pools.length === 0)
    throw new Error("a complete native timestamp query interval is required");
  /** @type {Array<[bigint, bigint, string]>} */
  const intervals = [];
  let reportedPassSumMs = 0;
  for (const [type, pool] of pools) {
    const queryCount = pool.currentQueryIndex;
    const types = passTypesByPool.get(pool);
    passTypesByPool.delete(pool);
    if (queryCount % 2 !== 0)
      throw new Error("a complete native timestamp query interval is required");
    // Resolve the pool directly: the renderer's wrapper refuses reads when
    // insertion is disabled between sampled frames. The pool owns the snapshot.
    reportedPassSumMs += await pool.resolveQueriesAsync();
    const bytes = queryCount * 8;
    const readMode = /** @type {any} */ (globalThis).GPUMapMode.READ;
    await pool.resultBuffer.mapAsync(readMode, 0, bytes);
    try {
      const times = new BigUint64Array(
        pool.resultBuffer.getMappedRange(0, bytes),
      );
      for (let i = 0; i < queryCount / 2; i++)
        intervals.push([
          times[2 * i],
          times[2 * i + 1],
          types?.get(2 * i) ?? type,
        ]);
    } finally {
      pool.resultBuffer.unmap();
    }
  }
  if (intervals.some(([start, end]) => start === 0n || end < start))
    throw new Error("invalid GPU pass timestamps");
  intervals.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const first = intervals[0][0];
  let last = intervals[0][1];
  let unionStart = first;
  let unionEnd = last;
  let unionNanoseconds = 0n;
  let sumNanoseconds = 0n;
  for (const [start, end] of intervals) {
    sumNanoseconds += end - start;
    if (end > last) last = end;
    if (start > unionEnd) {
      unionNanoseconds += unionEnd - unionStart;
      unionStart = start;
      unionEnd = end;
    } else if (end > unionEnd) unionEnd = end;
  }
  unionNanoseconds += unionEnd - unionStart;
  const elapsedMs = Number(last - first) / 1e6;
  if (startedAtMs !== undefined) {
    // Independent CPU interval encloses submission and query readback. Allow
    // 1 ms only for wall-clock quantization, never for a performance budget.
    const wallMs = performance.now() - startedAtMs;
    if (!Number.isFinite(wallMs) || wallMs < 0 || elapsedMs > wallMs + 1)
      throw new Error(
        "GPU timestamp interval exceeds its observed wall window",
      );
  }
  return {
    elapsedMs,
    unionMs: Number(unionNanoseconds) / 1e6,
    rawPassSumMs: Number(sumNanoseconds) / 1e6,
    reportedPassSumMs,
    passCount: intervals.length,
    passTypes: intervals.map(([, , type]) => type),
    passRangesMs: intervals.map(([a, b]) => [
      Number(a - first) / 1e6,
      Number(b - first) / 1e6,
    ]),
  };
}

// Native profiling only. Each armed window ends at one actual program-frame
// completion. Query resolution never requests a frame or releases its GPU gate.
export function createGpuFrameTimestampSampler({
  renderer,
  onTiming,
  resolveTiming = resolveGpuProbeTiming,
}) {
  const backend = renderer.backend;
  if (backend.device?.features?.has("timestamp-query") !== true)
    throw new Error("native timestamp-query feature is unavailable");
  if (backend.trackTimestamp === true)
    throw new Error("timestamp tracking already has an owner");
  const restoreTiming =
    resolveTiming === resolveGpuProbeTiming
      ? installGpuProbeTiming(renderer)
      : () => {};
  const seen = new WeakSet();
  let armedAtMs;
  let armed = false,
    pending = null,
    closed = false,
    failure = null;
  let completed = 0,
    requested = 0,
    sampled = 0,
    skipped = 0,
    discarded = 0;
  function arm() {
    if (closed || failure || pending) return;
    armedAtMs = performance.now();
    backend.trackTimestamp = true;
    armed = true;
  }
  function assertHealthy() {
    if (failure) throw failure;
  }
  return {
    observeCompletion(receipt) {
      if (closed || failure) return false;
      if (!receipt || typeof receipt !== "object")
        throw new Error("a completed program-frame receipt is required");
      if (seen.has(receipt)) return false;
      seen.add(receipt);
      completed++;
      if (pending) {
        skipped++;
        return false;
      }
      if (!armed) {
        arm();
        return false;
      }
      backend.trackTimestamp = false;
      armed = false;
      requested++;
      // Invoke synchronously while tracking is disabled for subsequent frames.
      // The installed backend snapshots/reset queries before awaiting mapping.
      try {
        pending = Promise.resolve(resolveTiming(renderer, armedAtMs))
          .then((timing) => {
            onTiming(timing, receipt);
            sampled++;
          })
          .catch((error) => {
            failure = error;
          })
          .finally(() => {
            pending = null;
          });
      } catch (error) {
        failure = error;
      }
      return true;
    },
    assertHealthy,
    async drain() {
      closed = true;
      if (armed) {
        backend.trackTimestamp = false;
        armed = false;
        discarded++;
      }
      try {
        if (pending) await pending;
        assertHealthy();
      } finally {
        restoreTiming();
      }
    },
    read() {
      return {
        completed,
        requested,
        sampled,
        skippedWhileResolving: skipped,
        discardedArmedWindows: discarded,
        armed,
        pending: pending !== null,
        closed,
        failure: failure ? String(failure) : null,
      };
    },
  };
}

// Installed Three.js backend access stays in this native diagnostic module.
// Renderer.waitForGPU is a removed API in r185 despite its legacy type entry.
export function waitForGpuProbeCompletion(renderer) {
  const queue = renderer.backend.device?.queue;
  if (typeof queue?.onSubmittedWorkDone !== "function")
    throw new Error("native GPU queue completion is unavailable");
  return queue.onSubmittedWorkDone();
}

// Harness-only wall-clock diagnostics. One pending queue fence bounds overhead;
// skipped samples remain absent. Completion is an upper bound, not GPU elapsed
// time or physical display presentation. No callback owns acoustic state.
export function createGpuCompletionSampler({
  completeSubmittedWork,
  audioTime,
  now = () => performance.now(),
}) {
  let submitted = 0;
  let sampled = 0;
  let skippedWhilePending = 0;
  let terminalDrainSamples = 0;
  let coveredSubmission = 0;
  let latest = null;
  let pending = null;
  let failure = null;
  let closed = false;
  let drained = false;

  function assertHealthy() {
    if (failure) throw failure;
  }

  function measure(entry, method) {
    const { record, timing, id } = entry;
    // Call synchronously at the submission boundary, not in a later microtask.
    let fence;
    try {
      // A presentation owner can share its fence. The diagnostic sampler does
      // not control that owner's capacity or issue a second GPU request.
      fence = entry.completion ?? completeSubmittedWork();
    } catch (error) {
      failure = error;
      throw error;
    }
    coveredSubmission = id;
    pending = Promise.resolve(fence).then(
      () => {
        const completedAtMs = now();
        const completedAtContextSeconds = audioTime();
        record.submissionAndCompletionMs = completedAtMs - timing.startedAtMs;
        record.queueCompletionMs = completedAtMs - timing.submittedAtMs;
        record.completionAgeSeconds =
          completedAtContextSeconds - timing.availableAtContextSeconds;
        record.responseAgeSeconds =
          completedAtContextSeconds - timing.responseAtContextSeconds;
        record.completionSampling = method;
        sampled++;
        if (method === "terminal-drain") terminalDrainSamples++;
        pending = null;
      },
      (error) => {
        failure = error;
        pending = null;
      },
    );
  }

  return {
    assertHealthy,
    observe(record, timing, completion = null) {
      assertHealthy();
      if (closed) throw new Error("GPU completion sampler is closed");
      const submittedAtContextSeconds = audioTime();
      Object.assign(record, {
        submittedAtMs: timing.submittedAtMs,
        submitCpuMs: timing.submittedAtMs - timing.startedAtMs,
        submissionAgeSeconds:
          submittedAtContextSeconds - timing.availableAtContextSeconds,
        responseSubmissionAgeSeconds:
          submittedAtContextSeconds - timing.responseAtContextSeconds,
        submissionAndCompletionMs: null,
        queueCompletionMs: null,
        gpuMs: null,
        gpuTiming: null,
        completionAgeSeconds: null,
        responseAgeSeconds: null,
        completionSampling: null,
      });
      latest = { record, timing, completion, id: ++submitted };
      if (pending) skippedWhilePending++;
      else measure(latest, "submission-fence");
    },
    async drain() {
      closed = true;
      if (pending) await pending;
      assertHealthy();
      // Work submitted after the pending fence also needs completion before
      // resource disposal. This late sample is excluded from steady percentiles.
      if (coveredSubmission < submitted) {
        measure(latest, "terminal-drain");
        await pending;
        assertHealthy();
      }
      drained = true;
    },
    read() {
      return {
        submitted,
        sampled,
        unsampled: submitted - sampled,
        skippedWhilePending,
        terminalDrainSamples,
        pending: pending !== null,
        drained,
      };
    },
  };
}
