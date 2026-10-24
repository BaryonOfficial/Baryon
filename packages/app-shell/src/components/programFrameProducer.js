import { createGpuSubmissionGate } from "@baryon/engine/render/gpuSubmissionGate";
import { transferOutputCompositorFrame } from "./outputCompositorFrame.js";

/**
 * One renderer owns one outstanding native GPU submission and bitmap transfer.
 * Clock/control commands request frames; completion only releases capacity.
 * Detach/replacement revokes old publication callbacks without restarting audio.
 */
export function createProgramFrameProducer({
  transferFrame = transferOutputCompositorFrame,
} = {}) {
  let rendererOwner = null,
    generation = 0,
    gate = null,
    transfer = null;
  function bindRenderer(owner, { completeSubmittedWork = null } = {}) {
    if (owner === rendererOwner) return false;
    rendererOwner = owner ?? null;
    generation++;
    // A new renderer has a new queue. Old completion cannot free its capacity
    // or publish a receipt to the replacement surface.
    gate?.drain().catch(() => {});
    gate =
      owner && completeSubmittedWork
        ? createGpuSubmissionGate({ completeSubmittedWork })
        : null;
    transfer = null;
    return true;
  }
  function canProduce() {
    return (
      rendererOwner !== null && transfer === null && (!gate || gate.canSubmit())
    );
  }
  function produce({
    render,
    renderCanvas = null,
    transferRequired = false,
    onFrame = null,
    onStageRender = null,
    onError = null,
    receipt = null,
  }) {
    if (
      typeof render !== "function" ||
      !canProduce() ||
      (transferRequired && typeof onFrame !== "function")
    )
      return Promise.resolve(false);
    const epoch = generation;
    const current = () => epoch === generation && rendererOwner !== null;
    render(); // Preserve the synchronous renderer-error boundary.
    const completion = gate?.markSubmitted() ?? Promise.resolve();
    // Request the bitmap immediately while this canvas generation is current;
    // awaiting the queue before requesting it can cross a browser presentation.
    const token = {};
    let bitmap;
    if (transferRequired) {
      transfer = token;
      try {
        bitmap = Promise.resolve(
          transferFrame(renderCanvas, (frame) => {
            if (current()) onFrame(frame);
            else frame?.bitmap?.close?.();
          }),
        );
      } catch (error) {
        bitmap = Promise.reject(error);
      }
    } else bitmap = Promise.resolve(true);
    return Promise.all([completion, bitmap])
      .then(([, transferred]) => {
        if (!current() || transferred !== true) return false;
        onStageRender?.(receipt ?? {});
        return true;
      })
      .catch((error) => {
        if (current()) onError?.(error);
        return false;
      })
      .finally(() => {
        if (transfer === token) transfer = null;
      });
  }
  return {
    bindRenderer,
    canProduce,
    produce,
    detach: () => bindRenderer(null),
  };
}
