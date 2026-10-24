/**
 * Presentation-owned, ordered immutable snapshots for one source configuration.
 * Audio owns the samples; taking a snapshot only transfers a retained reference
 * to the observer consumer. Reads and GPU completion cannot publish or reset it.
 * Overflow is an explicit presentation discontinuity, never silent coalescing.
 * The lifecycle owner must replace this history and reset the observer together.
 */
export function createObservationHistory({ generation, capacity }) {
  const keys = ["sourceGeneration", "timelineRevision", "processingRevision"];
  if (
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    keys.some(
      (key, i) =>
        !Number.isSafeInteger(generation?.[key]) ||
        generation[key] < (i === 0 ? 1 : 0),
    )
  )
    throw new RangeError(
      "observation history requires a generation and bounded capacity",
    );
  const revisions = keys.map((key) => generation[key]);
  const storage = new Array(capacity);
  let head = 0,
    queued = 0,
    accepted = 0,
    consumed = 0,
    highWaterMark = 0;
  let lastSample = -1;
  let fault = null;
  function assertHealthy() {
    if (fault) throw fault;
  }
  return {
    offer(observation) {
      assertHealthy();
      if (keys.some((key, i) => observation?.[key] !== revisions[i]))
        return false;
      const sample = observation?.endSample;
      if (!Number.isSafeInteger(sample) || sample < 0)
        throw new RangeError("invalid observation cursor");
      if (sample <= lastSample) return false;
      if (queued === capacity) {
        fault = new Error("observation history capacity exceeded");
        throw fault;
      }
      storage[(head + queued) % capacity] = observation;
      queued++;
      accepted++;
      highWaterMark = Math.max(highWaterMark, queued);
      lastSample = sample;
      return true;
    },
    take() {
      assertHealthy();
      if (queued === 0) return null;
      const observation = storage[head];
      storage[head] = undefined;
      head = (head + 1) % capacity;
      queued--;
      consumed++;
      return observation;
    },
    read() {
      return {
        capacity,
        queued,
        accepted,
        consumed,
        highWaterMark,
        fault: fault?.message ?? null,
      };
    },
  };
}
