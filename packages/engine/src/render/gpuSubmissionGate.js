/**
 * Bound presentation work to one submitted frame without blocking the frame
 * callback or the audio timeline. Completion only releases capacity; the next
 * presentation tick decides whether to submit the latest available observation.
 */
export function createGpuSubmissionGate({ completeSubmittedWork }) {
  let pending = null;
  let failure = null;
  let closed = false;

  function assertHealthy() {
    if (failure) throw failure;
  }

  return {
    canSubmit() {
      assertHealthy();
      return !closed && pending === null;
    },
    markSubmitted() {
      assertHealthy();
      if (closed || pending)
        throw new Error("GPU submission capacity is unavailable");
      const completion = Promise.resolve(completeSubmittedWork());
      pending = completion.then(
        () => {
          pending = null;
        },
        (error) => {
          failure = error;
          pending = null;
        },
      );
      return completion;
    },
    async drain() {
      closed = true;
      if (pending) await pending;
      assertHealthy();
    },
  };
}
