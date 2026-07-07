export const AR_SUPPORT_STATUS = Object.freeze({
  checking: "checking",
  supported: "supported",
  preview: "preview",
  unsupported: "unsupported",
});

export const AR_SUPPORT_FAILURE_CODES = Object.freeze({
  insecureContext: "insecure-context",
  webgpuMissing: "webgpu-missing",
  webgpuAdapterUnavailable: "webgpu-adapter-unavailable",
  webxrMissing: "webxr-missing",
  immersiveArUnsupported: "immersive-ar-unsupported",
});

function createProbeResult(status, failureCode, diagnostics) {
  return { status, failureCode, diagnostics };
}

function createFailure(failureCode, diagnostics) {
  return createProbeResult(
    AR_SUPPORT_STATUS.unsupported,
    failureCode,
    diagnostics,
  );
}

function createPreview(failureCode, diagnostics) {
  return createProbeResult(AR_SUPPORT_STATUS.preview, failureCode, diagnostics);
}

/**
 * AR-lab-specific capability probe. Unlike the main web support probe this
 * deliberately applies no mobile blocking: headsets identify as mobile
 * browsers and are exactly the devices this lab targets.
 *
 * WebGPU is required for both the desktop preview and the real AR session.
 * WebXR `immersive-ar` support only owns the ability to enter a live AR
 * session; desktop browsers without it can still render the lab preview.
 *
 * @param {{
 *   navigatorObject?: Navigator & { gpu?: any, xr?: any },
 *   isSecureContext?: boolean,
 * }} [options]
 * @returns {Promise<{
 *   status: "checking" | "supported" | "preview" | "unsupported",
 *   failureCode: string | null,
 *   diagnostics: string[],
 * }>}
 */
export async function probeArLabSupport({
  navigatorObject = globalThis.navigator,
  isSecureContext = globalThis.isSecureContext,
} = {}) {
  if (isSecureContext === false) {
    return createFailure(AR_SUPPORT_FAILURE_CODES.insecureContext, [
      "WebGPU and WebXR are only exposed in secure contexts such as HTTPS or localhost.",
    ]);
  }

  const gpu = navigatorObject?.gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return createFailure(AR_SUPPORT_FAILURE_CODES.webgpuMissing, [
      "`navigator.gpu` is not available in this browser.",
    ]);
  }

  let adapter = null;
  try {
    adapter = await gpu.requestAdapter();
  } catch (error) {
    return createFailure(AR_SUPPORT_FAILURE_CODES.webgpuAdapterUnavailable, [
      `\`navigator.gpu.requestAdapter()\` failed: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  if (!adapter) {
    return createFailure(AR_SUPPORT_FAILURE_CODES.webgpuAdapterUnavailable, [
      "`navigator.gpu.requestAdapter()` returned `null`.",
    ]);
  }

  const xr = navigatorObject?.xr;
  if (!xr || typeof xr.isSessionSupported !== "function") {
    return createPreview(AR_SUPPORT_FAILURE_CODES.webxrMissing, [
      "`navigator.xr` is not available in this browser.",
    ]);
  }

  let immersiveArSupported = false;
  try {
    immersiveArSupported = await xr.isSessionSupported("immersive-ar");
  } catch (error) {
    return createPreview(AR_SUPPORT_FAILURE_CODES.immersiveArUnsupported, [
      `\`navigator.xr.isSessionSupported("immersive-ar")\` failed: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
  if (!immersiveArSupported) {
    return createPreview(AR_SUPPORT_FAILURE_CODES.immersiveArUnsupported, [
      "This device does not support `immersive-ar` WebXR sessions.",
    ]);
  }

  return createProbeResult(AR_SUPPORT_STATUS.supported, null, []);
}
