export const BROWSER_SUPPORT_STATUS = {
  checking: "checking",
  supported: "supported",
  unsupported: "unsupported",
};

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

export async function getBrowserSupportStatus(
  forceWebGLFallbackTest,
  navigatorObject = globalThis.navigator,
) {
  if (forceWebGLFallbackTest) {
    return BROWSER_SUPPORT_STATUS.supported;
  }

  if (isMobileDevice(navigatorObject)) {
    return BROWSER_SUPPORT_STATUS.unsupported;
  }

  if (!navigatorObject?.gpu?.requestAdapter) {
    return BROWSER_SUPPORT_STATUS.unsupported;
  }

  try {
    const adapter = await navigatorObject.gpu.requestAdapter();
    return adapter
      ? BROWSER_SUPPORT_STATUS.supported
      : BROWSER_SUPPORT_STATUS.unsupported;
  } catch {
    return BROWSER_SUPPORT_STATUS.unsupported;
  }
}
