import { WebGPURenderer } from "three/webgpu";

export const WEBGPU_RENDERER_INIT_ERROR = "WebGPURendererInitError";

export function clearRendererDiagnostics() {
  if (typeof window === "undefined") {
    return;
  }

  delete window.__baryonRendererInfo;
  delete window.__baryonAuditSnapshot;
  delete window.__baryonSupportProbe;
}

function syncInitialRendererSize(renderer, canvas) {
  const parent = canvas.parentElement;
  if (!parent) {
    return;
  }

  const { width, height } = parent.getBoundingClientRect();
  if (width <= 0 || height <= 0) {
    return;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
}

function setRendererInfo(renderer, forceWebGLFallbackTest, error) {
  if (typeof window === "undefined") {
    return;
  }

  if (error) {
    window.__baryonRendererInfo = {
      forceWebGLFallbackTest,
      backendType: null,
      backend: null,
      isFallback: forceWebGLFallbackTest,
      error: String(error),
    };
    return;
  }

  const backend = /** @type {any} */ (renderer.backend);
  window.__baryonRendererInfo = {
    forceWebGLFallbackTest,
    backendType: backend?.isWebGLBackend === true ? "webgl" : "webgpu",
    backend: backend?.constructor?.name ?? null,
    isFallback: backend?.isWebGLBackend === true,
    error: null,
  };
}

export async function createBaryonRenderer(glDefaults, forceWebGLFallbackTest) {
  const canvas = /** @type {HTMLCanvasElement} */ (glDefaults.canvas);
  const context = forceWebGLFallbackTest
    ? canvas.getContext("webgl2", {
        antialias: true,
        alpha: true,
      })
    : undefined;
  const rendererParameters = /** @type {any} */ ({
    canvas,
    alpha: true,
    antialias: !!forceWebGLFallbackTest,
    forceWebGL: forceWebGLFallbackTest,
    ...(context ? { context } : {}),
  });
  const renderer = new WebGPURenderer(rendererParameters);

  // Keep the renderer's internal size bookkeeping aligned with the canvas
  // before WebGPU allocates its MSAA/resolve attachments.
  syncInitialRendererSize(renderer, canvas);

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

  syncInitialRendererSize(renderer, canvas);
  setRendererInfo(renderer, forceWebGLFallbackTest, null);
  return renderer;
}
