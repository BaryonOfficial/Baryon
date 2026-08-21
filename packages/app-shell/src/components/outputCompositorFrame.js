const OUTPUT_COMPOSITOR_FRAME_ERROR = "OutputCompositorFrameError";

function createOutputCompositorFrameError(message, cause = null) {
  const error = new Error(message, cause == null ? undefined : { cause });
  error.name = OUTPUT_COMPOSITOR_FRAME_ERROR;
  return error;
}

function normalizeCanvasDimension(value) {
  const dimension = Math.round(Number(value) || 0);
  return Math.max(1, dimension);
}

export async function transferOutputCompositorFrame(renderCanvas, onFrame) {
  if (typeof onFrame !== "function") {
    return false;
  }
  if (typeof globalThis.createImageBitmap !== "function") {
    throw createOutputCompositorFrameError(
      "ImageBitmap canvas snapshots are unavailable for GPU compositor frame transfer.",
    );
  }

  let bitmap;
  try {
    bitmap = await globalThis.createImageBitmap(renderCanvas, {
      colorSpaceConversion: "none",
      premultiplyAlpha: "premultiply",
    });
  } catch (error) {
    throw createOutputCompositorFrameError(
      "The output renderer canvas could not be transferred to an ImageBitmap.",
      error,
    );
  }
  if (!bitmap) {
    throw createOutputCompositorFrameError(
      "The output renderer did not produce an ImageBitmap.",
    );
  }

  try {
    onFrame({
      bitmap,
      width: normalizeCanvasDimension(bitmap.width),
      height: normalizeCanvasDimension(bitmap.height),
    });
  } catch (error) {
    bitmap.close?.();
    throw error;
  }

  return true;
}
