export const BROWSER_SUPPORT_STATUS = {
  checking: "checking",
  supported: "supported",
  unsupported: "unsupported",
};

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isMobileDevice(navigatorObject = globalThis.navigator) {
  const userAgent = navigatorObject?.userAgent ?? "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function getInitialBrowserSupportStatus(
  forceWebGLFallbackTest,
  navigatorObject = globalThis.navigator,
) {
  if (forceWebGLFallbackTest) {
    return BROWSER_SUPPORT_STATUS.supported;
  }

  if (isMobileDevice(navigatorObject)) {
    return BROWSER_SUPPORT_STATUS.unsupported;
  }

  return BROWSER_SUPPORT_STATUS.checking;
}

export async function probeBrowserSupport(
  forceWebGLFallbackTest,
  navigatorObject = globalThis.navigator,
) {
  if (forceWebGLFallbackTest) {
    return {
      status: BROWSER_SUPPORT_STATUS.supported,
      reason: "browser",
      diagnostics: [],
    };
  }

  if (isMobileDevice(navigatorObject)) {
    return {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "mobile",
      diagnostics: ["Mobile browsers are currently treated as unsupported."],
    };
  }

  if (!navigatorObject?.gpu) {
    return {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: ["`navigator.gpu` is not available in this browser."],
    };
  }

  if (typeof navigatorObject.gpu.requestAdapter !== "function") {
    return {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: [
        "`navigator.gpu.requestAdapter` is not available in this browser.",
      ],
    };
  }

  try {
    const adapter = await navigatorObject.gpu.requestAdapter();

    if (!adapter) {
      return {
        status: BROWSER_SUPPORT_STATUS.unsupported,
        reason: "browser",
        diagnostics: ["`navigator.gpu.requestAdapter()` returned `null`."],
      };
    }

    return {
      status: BROWSER_SUPPORT_STATUS.supported,
      reason: "browser",
      diagnostics: [],
    };
  } catch (error) {
    return {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: [
        `\`navigator.gpu.requestAdapter()\` failed: ${normalizeErrorMessage(error)}`,
      ],
    };
  }
}

export async function getBrowserSupportStatus(
  forceWebGLFallbackTest,
  navigatorObject = globalThis.navigator,
) {
  const probe = await probeBrowserSupport(
    forceWebGLFallbackTest,
    navigatorObject,
  );
  return probe.status;
}
