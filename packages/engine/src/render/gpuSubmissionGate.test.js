import { describe, expect, it, vi } from "vitest";
import { createGpuSubmissionGate } from "./gpuSubmissionGate.js";

describe("GPU presentation capacity", () => {
  it("bounds work while incoming observations continue replacing the cached model", async () => {
    let finish;
    const completeSubmittedWork = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const gate = createGpuSubmissionGate({ completeSubmittedWork });
    let latest = 1;
    const rendered = [];
    const tick = () => {
      if (!gate.canSubmit()) return;
      rendered.push(latest);
      gate.markSubmitted();
    };
    tick();
    for (latest = 2; latest <= 100; latest++) tick();
    expect(rendered).toEqual([1]);
    expect(completeSubmittedWork).toHaveBeenCalledOnce();
    expect(() => gate.markSubmitted()).toThrow("capacity");
    finish();
    await Promise.resolve();
    // Completion releases capacity but never bootstraps or submits a frame.
    expect(rendered).toEqual([1]);
    tick();
    expect(rendered).toEqual([1, 101]);
    expect(completeSubmittedWork).toHaveBeenCalledTimes(2);
    finish();
    await gate.drain();
    expect(gate.canSubmit()).toBe(false);
  });

  it("closes admission before awaiting the last submitted frame", async () => {
    let finish;
    const gate = createGpuSubmissionGate({
      completeSubmittedWork: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    gate.markSubmitted();
    const drain = gate.drain();
    expect(gate.canSubmit()).toBe(false);
    finish();
    await drain;
    expect(gate.canSubmit()).toBe(false);
    expect(() => gate.markSubmitted()).toThrow("capacity");
  });

  it("reports device failure to the render owner", async () => {
    const gate = createGpuSubmissionGate({
      completeSubmittedWork: () => Promise.reject(new Error("device lost")),
    });
    const completion = gate.markSubmitted();
    await expect(completion).rejects.toThrow("device lost");
    expect(() => gate.canSubmit()).toThrow("device lost");
    await expect(gate.drain()).rejects.toThrow("device lost");
  });
});
