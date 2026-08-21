import { transferOutputCompositorFrame } from "./outputCompositorFrame.js";

/**
 * Owns the one live program-frame sequence. Callers may render only from an
 * authoritative clock/control trigger. Bitmap completion and stage
 * acknowledgement finish publication and never request another render.
 */
export function createProgramFrameProducer({
  transferFrame = transferOutputCompositorFrame,
} = {}) {
  let rendererOwner = null;
  let transferInFlight = false;

  function bindRenderer(nextRendererOwner) {
    rendererOwner = nextRendererOwner ?? null;
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
    if (!rendererOwner || typeof render !== "function") {
      return Promise.resolve(false);
    }
    if (
      transferRequired === true &&
      (typeof onFrame !== "function" || transferInFlight)
    ) {
      return Promise.resolve(false);
    }

    render();

    if (transferRequired !== true) {
      onStageRender?.(receipt ?? {});
      return Promise.resolve(true);
    }
    transferInFlight = true;
    return Promise.resolve(transferFrame(renderCanvas, onFrame))
      .then((transferred) => {
        const transferSucceeded = transferred === true;
        if (transferSucceeded) {
          onStageRender?.(receipt ?? {});
        }
        return transferSucceeded;
      })
      .catch((error) => {
        onError?.(error);
        return false;
      })
      .finally(() => {
        transferInFlight = false;
      });
  }

  function detach() {
    rendererOwner = null;
  }

  return {
    bindRenderer,
    detach,
    produce,
  };
}
