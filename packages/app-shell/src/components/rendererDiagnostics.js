import { WebGPURenderer } from "three/webgpu";
import { HalfFloatType } from "three";
import {
  BROWSER_FAMILY,
  BROWSER_PLATFORM,
  detectBrowserFamily,
  detectPlatform,
} from "./browserSupport.js";

export const WEBGPU_RENDERER_INIT_ERROR = "WebGPURendererInitError";
export const WEBGPU_RENDERER_RUNTIME_LOSS_ERROR =
  "WebGPURendererRuntimeLossError";
const CANVAS_CLEAR_COLOR = 0x000000;
const GPU_POWER_PREFERENCE = "high-performance";
const MAX_RENDERER_GPU_ERRORS = 8;
const guardedWebGpuDevices = new WeakSet();
const TERMINAL_WEBGPU_ERROR_SCOPE_PATTERNS = [
  /instance dropped in poperrorscope/i,
  /device lost during poperrorscope/i,
  /valid external instance reference no longer exists/i,
];

function shouldRequestHighPerformanceWebGpu(
  navigatorObject = globalThis.navigator,
) {
  return !(
    detectPlatform(navigatorObject) === BROWSER_PLATFORM.windows &&
    detectBrowserFamily(navigatorObject) === BROWSER_FAMILY.chromium
  );
}

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

function isTerminalWebGpuErrorScopeFailure(error) {
  const message = normalizeRendererErrorMessage(error, "");
  return TERMINAL_WEBGPU_ERROR_SCOPE_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

function createRuntimeLossReporter(onRuntimeFailure) {
  let reported = false;

  return (gpuError, cause = null) => {
    if (reported) {
      return;
    }
    reported = true;

    const runtimeError = new Error(
      `WebGPU renderer runtime lost: ${gpuError.message}`,
      cause ? { cause } : undefined,
    );
    runtimeError.name = WEBGPU_RENDERER_RUNTIME_LOSS_ERROR;
    onRuntimeFailure?.(runtimeError, gpuError);
  };
}

function installRendererRuntimeDiagnostics(
  renderer,
  forceWebGLFallbackTest,
  reportRuntimeLoss,
) {
  const onError = renderer.onError?.bind(renderer);
  renderer.onError = (info) => {
    const kind =
      info?.kind === "error-scope-rejected"
        ? "error-scope-rejected"
        : "uncaptured-error";
    appendRendererGpuError(
      renderer,
      forceWebGLFallbackTest,
      buildRendererGpuError(kind, info),
    );
    onError?.(info);
  };

  const onDeviceLost = renderer.onDeviceLost?.bind(renderer);
  renderer.onDeviceLost = (info) => {
    const gpuError = buildRendererGpuError("device-lost", info);
    appendRendererGpuError(renderer, forceWebGLFallbackTest, gpuError);
    onDeviceLost?.(info);
    reportRuntimeLoss(gpuError, info?.originalEvent ?? null);
  };
}

function installWebGpuErrorScopeGuard(renderer, reportRuntimeLoss) {
  const backend = /** @type {any} */ (renderer.backend);
  const device = backend?.device;
  if (
    backend?.isWebGLBackend === true ||
    !device ||
    guardedWebGpuDevices.has(device) ||
    typeof device.popErrorScope !== "function"
  ) {
    return;
  }
  guardedWebGpuDevices.add(device);

  const originalPopErrorScope = device.popErrorScope.bind(device);

  device.popErrorScope = (...args) => {
    const handleRejectedScope = (error) => {
      const info = {
        api: "WebGPU",
        kind: "error-scope-rejected",
        message: normalizeRendererErrorMessage(error),
        originalEvent: error,
        reason: "error-scope-rejected",
        type: error?.name || error?.constructor?.name || "Error",
      };
      renderer.onError(info);
      if (isTerminalWebGpuErrorScopeFailure(error)) {
        reportRuntimeLoss(
          buildRendererGpuError("error-scope-rejected", info),
          error,
        );
      }
      return null;
    };

    try {
      return Promise.resolve(originalPopErrorScope(...args)).catch(
        handleRejectedScope,
      );
    } catch (error) {
      return Promise.resolve(handleRejectedScope(error));
    }
  };
}

export async function createBaryonRenderer(
  glDefaults,
  forceWebGLFallbackTest,
  {
    initialPixelRatio = null,
    xrMode = false,
    alpha = true,
    halfFloatOutput = false,
    onRuntimeFailure = null,
  } = {},
) {
  const canvas = /** @type {HTMLCanvasElement} */ (glDefaults.canvas);
  const transparentCanvas = alpha !== false;
  // Chromium ignores WebGPU's powerPreference on Windows and emits a warning
  // for every adapter request. WebGL2 has a separate, supported context hint.
  const requestHighPerformanceGpu =
    forceWebGLFallbackTest || shouldRequestHighPerformanceWebGpu();
  const context = forceWebGLFallbackTest
    ? canvas.getContext("webgl2", {
        antialias: true,
        alpha: transparentCanvas,
        // This is a browser/OS hint, not an adapter guarantee. Request the
        // discrete GPU where one is available while preserving normal fallback.
        powerPreference: GPU_POWER_PREFERENCE,
      })
    : undefined;
  const rendererParameters = /** @type {any} */ ({
    canvas,
    alpha: transparentCanvas,
    antialias: !!forceWebGLFallbackTest,
    forceWebGL: forceWebGLFallbackTest,
    ...(requestHighPerformanceGpu
      ? { powerPreference: GPU_POWER_PREFERENCE }
      : {}),
    ...(halfFloatOutput && !forceWebGLFallbackTest
      ? { outputType: HalfFloatType }
      : {}),
    ...(context ? { context } : {}),
  });
  const renderer = new WebGPURenderer(rendererParameters);
  const reportRuntimeLoss = createRuntimeLossReporter(onRuntimeFailure);
  installRendererRuntimeDiagnostics(
    renderer,
    forceWebGLFallbackTest,
    reportRuntimeLoss,
  );

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

  installWebGpuErrorScopeGuard(renderer, reportRuntimeLoss);
  syncInitialRendererSize(renderer, canvas, initialPixelRatio);
  renderer.setClearColor(CANVAS_CLEAR_COLOR, transparentCanvas ? 0 : 1);
  setRendererInfo(renderer, forceWebGLFallbackTest, null);
  return renderer;
}
