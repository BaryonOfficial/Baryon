export const BROWSER_SUPPORT_STATUS = {
  checking: "checking",
  supported: "supported",
  unsupported: "unsupported",
};

export const BROWSER_FAILURE_CODES = {
  mobileUnsupported: "mobile-unsupported",
  gpuMissing: "gpu-missing",
  requestAdapterMissing: "request-adapter-missing",
  adapterNull: "adapter-null",
  adapterBlocklisted: "adapter-blocklisted",
  adapterError: "adapter-error",
  rendererInitError: "renderer-init-error",
};

export const BROWSER_PLATFORM = {
  android: "android",
  ios: "ios",
  linux: "linux",
  macos: "macos",
  windows: "windows",
  unknown: "unknown",
};

export const BROWSER_FAMILY = {
  chromium: "chromium",
  firefox: "firefox",
  safari: "safari",
  unknown: "unknown",
};

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getUserAgent(navigatorObject = globalThis.navigator) {
  return String(navigatorObject?.userAgent ?? "");
}

export function isMobileDevice(navigatorObject = globalThis.navigator) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(getUserAgent(navigatorObject));
}

export function detectPlatform(navigatorObject = globalThis.navigator) {
  const userAgent = getUserAgent(navigatorObject);

  if (/Android/i.test(userAgent)) {
    return BROWSER_PLATFORM.android;
  }

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return BROWSER_PLATFORM.ios;
  }

  if (/Linux/i.test(userAgent)) {
    return BROWSER_PLATFORM.linux;
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return BROWSER_PLATFORM.macos;
  }

  if (/Windows/i.test(userAgent)) {
    return BROWSER_PLATFORM.windows;
  }

  return BROWSER_PLATFORM.unknown;
}

export function detectBrowserFamily(navigatorObject = globalThis.navigator) {
  const userAgent = getUserAgent(navigatorObject);

  if (/Firefox\//i.test(userAgent)) {
    return BROWSER_FAMILY.firefox;
  }

  if (/Edg\//i.test(userAgent) || /Chrome\//i.test(userAgent)) {
    return BROWSER_FAMILY.chromium;
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) {
    return BROWSER_FAMILY.safari;
  }

  return BROWSER_FAMILY.unknown;
}

function isLinuxDesktop(platform) {
  return platform === BROWSER_PLATFORM.linux;
}

function isFirefoxFamily(browserFamily) {
  return browserFamily === BROWSER_FAMILY.firefox;
}

function isChromiumFamily(browserFamily) {
  return browserFamily === BROWSER_FAMILY.chromium;
}

function isBlocklistErrorMessage(message) {
  return /blocklist/i.test(message);
}

function buildGenericDesktopGuidance() {
  return {
    summary:
      "Baryon needs a working WebGPU stack in this desktop browser before the visualizer can start.",
    steps: [
      "Update to a current desktop browser build.",
      "If WebGPU is behind experimental settings, enable them and restart the browser.",
      "If the issue persists, try a recent Chromium-based browser or Firefox Nightly.",
    ],
    caveat:
      "WebGPU support still depends on your browser version, GPU, and graphics drivers.",
  };
}

function buildLinuxChromiumGuidance() {
  return {
    summary:
      "On Linux, Chromium-based browsers sometimes need WebGPU and Vulkan enabled manually before Baryon can start.",
    steps: [
      "Open `chrome://flags/#enable-unsafe-webgpu` and enable it.",
      "Open `chrome://flags/#enable-vulkan` and enable it.",
      "Restart the browser after changing the flags.",
    ],
    caveat:
      "Even with those flags enabled, WebGPU support still depends on your GPU, drivers, and browser version.",
  };
}

function buildLinuxFirefoxGuidance() {
  return {
    summary:
      "On Linux, Firefox may expose WebGPU APIs but still refuse to create a usable adapter for Baryon.",
    steps: [
      "Try Firefox Nightly instead of release.",
      "In `about:config`, set `dom.webgpu.enabled` to `true`.",
      "Restart Firefox after changing the pref.",
    ],
    caveat:
      "Linux WebGPU may still be blocked by Firefox or your GPU/driver combination even after enabling the pref.",
  };
}

function buildMobileGuidance() {
  return {
    summary:
      "Baryon runs best on desktop. Mobile browser support is currently degraded.",
    steps: ["Open the app on a desktop browser instead of a phone or tablet."],
    caveat: null,
  };
}

export function buildBrowserGuidance({ failureCode, platform, browserFamily }) {
  if (!failureCode) {
    return null;
  }

  if (failureCode === BROWSER_FAILURE_CODES.mobileUnsupported) {
    return buildMobileGuidance();
  }

  if (isLinuxDesktop(platform) && isFirefoxFamily(browserFamily)) {
    return buildLinuxFirefoxGuidance();
  }

  if (isLinuxDesktop(platform) && isChromiumFamily(browserFamily)) {
    return buildLinuxChromiumGuidance();
  }

  return buildGenericDesktopGuidance();
}

export function createFailureProbe({
  failureCode,
  navigatorObject = globalThis.navigator,
  rawError = null,
  diagnostics = [],
}) {
  return createProbe({
    status: BROWSER_SUPPORT_STATUS.unsupported,
    failureCode,
    navigatorObject,
    rawError,
    diagnostics,
  });
}

function createProbe({
  status,
  failureCode = null,
  navigatorObject = globalThis.navigator,
  rawError = null,
  diagnostics = [],
}) {
  const platform = detectPlatform(navigatorObject);
  const browserFamily = detectBrowserFamily(navigatorObject);

  return {
    status,
    failureCode,
    platform,
    browserFamily,
    rawError,
    diagnostics,
    guidance: buildBrowserGuidance({
      failureCode,
      platform,
      browserFamily,
    }),
  };
}

export function getSupportProbeTechnicalDetails(probe) {
  if (!probe) {
    return [];
  }

  const details = [
    `Status: ${probe.status}`,
    `Failure code: ${probe.failureCode ?? "none"}`,
    `Platform: ${probe.platform}`,
    `Browser family: ${probe.browserFamily}`,
  ];

  if (probe.rawError) {
    details.push(`Raw error: ${probe.rawError}`);
  }

  if (Array.isArray(probe.diagnostics) && probe.diagnostics.length > 0) {
    details.push(...probe.diagnostics);
  }

  return details;
}

export function formatSupportProbeForClipboard(probe) {
  if (!probe) {
    return "Baryon WebGPU diagnostics are unavailable.";
  }

  const lines = ["Baryon WebGPU diagnostics", ""];
  const guidance = probe.guidance;

  if (guidance?.summary) {
    lines.push(`Summary: ${guidance.summary}`);
  }

  lines.push(...getSupportProbeTechnicalDetails(probe));

  if (guidance?.steps?.length) {
    lines.push("", "Suggested next steps:");
    guidance.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  if (guidance?.caveat) {
    lines.push("", `Note: ${guidance.caveat}`);
  }

  return `${lines.join("\n")}\n`;
}

export function createRendererInitFailureProbe(
  error,
  navigatorObject = globalThis.navigator,
) {
  const rawError = normalizeErrorMessage(error?.cause ?? error);
  return createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.rendererInitError,
    navigatorObject,
    rawError,
    diagnostics: [`WebGPURenderer.init() failed: ${rawError}`],
  });
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
  const runtimeNavigator = /** @type {Navigator & {
   *   gpu?: {
   *     requestAdapter?: () => Promise<any>,
   *   },
   * }} */ (navigatorObject ?? {});
  if (forceWebGLFallbackTest) {
    return createProbe({
      status: BROWSER_SUPPORT_STATUS.supported,
      navigatorObject: runtimeNavigator,
    });
  }

  if (isMobileDevice(runtimeNavigator)) {
    return createFailureProbe({
      failureCode: BROWSER_FAILURE_CODES.mobileUnsupported,
      navigatorObject: runtimeNavigator,
      diagnostics: ["Mobile browsers are currently treated as unsupported."],
    });
  }

  if (!runtimeNavigator.gpu) {
    return createFailureProbe({
      failureCode: BROWSER_FAILURE_CODES.gpuMissing,
      navigatorObject: runtimeNavigator,
      diagnostics: ["`navigator.gpu` is not available in this browser."],
    });
  }

  if (typeof runtimeNavigator.gpu.requestAdapter !== "function") {
    return createFailureProbe({
      failureCode: BROWSER_FAILURE_CODES.requestAdapterMissing,
      navigatorObject: runtimeNavigator,
      diagnostics: [
        "`navigator.gpu.requestAdapter` is not available in this browser.",
      ],
    });
  }

  try {
    const adapter = await runtimeNavigator.gpu.requestAdapter();

    if (!adapter) {
      return createFailureProbe({
        failureCode: BROWSER_FAILURE_CODES.adapterNull,
        navigatorObject: runtimeNavigator,
        diagnostics: ["`navigator.gpu.requestAdapter()` returned `null`."],
      });
    }

    return createProbe({
      status: BROWSER_SUPPORT_STATUS.supported,
      navigatorObject,
    });
  } catch (error) {
    const rawError = normalizeErrorMessage(error);
    const failureCode = isBlocklistErrorMessage(rawError)
      ? BROWSER_FAILURE_CODES.adapterBlocklisted
      : BROWSER_FAILURE_CODES.adapterError;

    return createFailureProbe({
      failureCode,
      navigatorObject,
      rawError,
      diagnostics: [`\`navigator.gpu.requestAdapter()\` failed: ${rawError}`],
    });
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
