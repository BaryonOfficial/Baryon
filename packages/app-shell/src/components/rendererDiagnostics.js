import { WebGPURenderer } from "three/webgpu";

export const WEBGPU_RENDERER_INIT_ERROR = "WebGPURendererInitError";
const TRANSPARENT_CLEAR_COLOR = 0x000000;
const TRANSPARENT_CLEAR_ALPHA = 0;
const MAX_RENDERER_GPU_ERRORS = 8;

/**
 * @typedef {NonNullable<Window["__baryonRendererInfo"]>} RendererInfoSnapshot
 */

export function clearRendererDiagnostics() {
  if (typeof window === "undefined") {
    return;
  }

  delete window.__baryonRendererInfo;
  window.dispatchEvent(
    new CustomEvent("__baryon-renderer-info-change", {
      detail: null,
    }),
  );
  delete window.__baryonAuditSnapshot;
  delete window.__baryonSupportProbe;
}

function syncInitialRendererSize(renderer, canvas, initialPixelRatio = null) {
  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const { width, height } = parent.getBoundingClientRect();
  if (width <= 0 || height <= 0) {
    return;
  }

  const dpr = initialPixelRatio ?? Math.max(1, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
}

function publishRendererInfoSnapshot(snapshot) {
  window.__baryonRendererInfo = snapshot;
  window.dispatchEvent(
    new CustomEvent("__baryon-renderer-info-change", {
      detail: snapshot,
    }),
  );
}

function getRendererGpuErrors() {
  const gpuErrors = window.__baryonRendererInfo?.gpuErrors;
  return Array.isArray(gpuErrors) ? gpuErrors : [];
}

function normalizeRendererErrorMessage(value, fallback = "Unknown GPU error") {
  if (value instanceof Error) {
    return value.message || fallback;
  }
  if (typeof value === "string") {
    return value || fallback;
  }
  if (value == null) {
    return fallback;
  }
  return String(value);
}

function buildRendererGpuError(kind, info) {
  const eventInfo = /** @type {any} */ (info ?? {});
  const gpuError = /** @type {any} */ (eventInfo.error ?? eventInfo);
  const inferredType =
    eventInfo.error || gpuError instanceof Error
      ? gpuError?.constructor?.name || null
      : null;
  const type =
    typeof eventInfo.type === "string" && eventInfo.type
      ? eventInfo.type
      : inferredType;
  const reason =
    typeof eventInfo.reason === "string" && eventInfo.reason
      ? eventInfo.reason
      : null;

  return {
    kind,
    api: typeof eventInfo.api === "string" ? eventInfo.api : null,
    type,
    message: normalizeRendererErrorMessage(gpuError?.message ?? eventInfo),
    reason,
  };
}

function createRendererInfoSnapshot(
  renderer,
  forceWebGLFallbackTest,
  error,
  gpuErrors = getRendererGpuErrors(),
) {
  if (error) {
    /** @type {RendererInfoSnapshot} */
    return {
      forceWebGLFallbackTest,
      backendType: null,
      backend: null,
      isFallback: forceWebGLFallbackTest,
      error: String(error),
      gpuErrors,
    };
  }

  const backend = /** @type {any} */ (renderer.backend);
  /** @type {RendererInfoSnapshot} */
  return {
    forceWebGLFallbackTest,
    backendType: backend?.isWebGLBackend === true ? "webgl" : "webgpu",
    backend: backend?.constructor?.name ?? null,
    isFallback: backend?.isWebGLBackend === true,
    error: null,
    gpuErrors,
  };
}

function setRendererInfo(renderer, forceWebGLFallbackTest, error) {
  if (typeof window === "undefined") {
    return;
  }

  const snapshot = createRendererInfoSnapshot(
    renderer,
    forceWebGLFallbackTest,
    error,
  );
  publishRendererInfoSnapshot(snapshot);
}

function appendRendererGpuError(renderer, forceWebGLFallbackTest, gpuError) {
  if (typeof window === "undefined") {
    return;
  }

  const gpuErrors = [...getRendererGpuErrors(), gpuError].slice(
    -MAX_RENDERER_GPU_ERRORS,
  );
  const existingSnapshot = window.__baryonRendererInfo;
  const snapshot = existingSnapshot
    ? { ...existingSnapshot, gpuErrors }
    : createRendererInfoSnapshot(
        renderer,
        forceWebGLFallbackTest,
        null,
        gpuErrors,
      );
  publishRendererInfoSnapshot(snapshot);
}

function installRendererRuntimeDiagnostics(renderer, forceWebGLFallbackTest) {
  const onError = renderer.onError?.bind(renderer);
  renderer.onError = (info) => {
    appendRendererGpuError(
      renderer,
      forceWebGLFallbackTest,
      buildRendererGpuError("uncaptured-error", info),
    );
    onError?.(info);
  };

  const onDeviceLost = renderer.onDeviceLost?.bind(renderer);
  renderer.onDeviceLost = (info) => {
    appendRendererGpuError(
      renderer,
      forceWebGLFallbackTest,
      buildRendererGpuError("device-lost", info),
    );
    onDeviceLost?.(info);
  };
}

export async function createBaryonRenderer(
  glDefaults,
  forceWebGLFallbackTest,
  { initialPixelRatio = null, xrMode = false, alpha = true } = {},
) {
  const canvas = /** @type {HTMLCanvasElement} */ (glDefaults.canvas);
  const transparentCanvas = alpha !== false;
  const context = forceWebGLFallbackTest
    ? canvas.getContext("webgl2", {
        antialias: true,
        alpha: transparentCanvas,
      })
    : undefined;
  const rendererParameters = /** @type {any} */ ({
    canvas,
    alpha: transparentCanvas,
    antialias: !!forceWebGLFallbackTest,
    forceWebGL: forceWebGLFallbackTest,
    ...(context ? { context } : {}),
  });
  const renderer = new WebGPURenderer(rendererParameters);
  installRendererRuntimeDiagnostics(renderer, forceWebGLFallbackTest);

  // Keep the renderer's internal size bookkeeping aligned with the canvas
  // before WebGPU allocates its MSAA/resolve attachments.
  syncInitialRendererSize(renderer, canvas, initialPixelRatio);

  try {
    await renderer.init();
  } catch (error) {
    setRendererInfo(null, forceWebGLFallbackTest, error);

    const rendererInitError = new Error(
      "WebGPU renderer initialization failed",
      { cause: error },
    );
    rendererInitError.name = WEBGPU_RENDERER_INIT_ERROR;
    throw rendererInitError;
  }

  const backend = /** @type {any} */ (renderer.backend);
  if (xrMode && backend?.isWebGLBackend === true) {
    // XR mode is a WebGPU proof surface; a silent WebGL fallback would
    // invalidate the proof, so reject it instead of rendering through it.
    const backendError = new Error(
      "WebGPU renderer initialized with a WebGL backend; XR mode requires a WebGPU backend",
    );
    setRendererInfo(null, forceWebGLFallbackTest, backendError);

    const rendererInitError = new Error(
      "WebGPU renderer initialization failed",
      { cause: backendError },
    );
    rendererInitError.name = WEBGPU_RENDERER_INIT_ERROR;
    throw rendererInitError;
  }

  syncInitialRendererSize(renderer, canvas, initialPixelRatio);
  renderer.setClearColor(TRANSPARENT_CLEAR_COLOR, TRANSPARENT_CLEAR_ALPHA);
  setRendererInfo(renderer, forceWebGLFallbackTest, null);
  return renderer;
}
