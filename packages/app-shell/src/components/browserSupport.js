export const BROWSER_SUPPORT_STATUS = {
  checking: "checking",
  supported: "supported",
  unsupported: "unsupported",
};

export const BROWSER_FAILURE_CODES = {
  mobileUnsupported: "mobile-unsupported",
  webgl2Missing: "webgl2-missing",
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

function getUserAgentBrands(navigatorObject = globalThis.navigator) {
  const navigatorWithUserAgentData =
    /** @type {{ userAgentData?: { brands?: Array<{ brand?: string }> } } | undefined} */ (
      navigatorObject
    );
  const brands = navigatorWithUserAgentData?.userAgentData?.brands;

  if (!Array.isArray(brands)) {
    return [];
  }

  return brands.map((brand) => String(brand?.brand ?? "")).filter(Boolean);
}

export function isMobileDevice(navigatorObject = globalThis.navigator) {
  const navigatorWithMobileHints =
    /** @type {{ maxTouchPoints?: number, userAgentData?: { mobile?: boolean } } | undefined} */ (
      navigatorObject
    );
  const userAgent = getUserAgent(navigatorObject);
  const isIpadDesktopMode =
    /Macintosh/i.test(userAgent) &&
    Number(navigatorWithMobileHints?.maxTouchPoints) > 1;

  return (
    navigatorWithMobileHints?.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    isIpadDesktopMode
  );
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
  const brands = getUserAgentBrands(navigatorObject);

  if (/Firefox\//i.test(userAgent)) {
    return BROWSER_FAMILY.firefox;
  }

  if (
    brands.some((brand) => /^Chromium$/i.test(brand)) ||
    /(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent)
  ) {
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

export function isLockdownModeSuspected(globalScope = globalThis) {
  // Safari's Lockdown Mode removes WebAssembly along with WebGPU, while every
  // browser that could otherwise run Baryon ships WebAssembly unconditionally.
  return typeof globalScope.WebAssembly === "undefined";
}

function getLockdownModeDiagnostic() {
  if (!isLockdownModeSuspected()) {
    return [];
  }

  return [
    "`WebAssembly` is also missing; Safari's Lockdown Mode removes both WebGPU and WebAssembly.",
  ];
}

/**
 * The WebGL renderer path is the only renderer mobile ever gets, so its
 * availability has to be measured rather than assumed: Safari's Lockdown Mode
 * removes WebGL and WebGL2 outright, and a canvas that can never acquire a
 * context leaves the demo stuck on a black frame with no explanation.
 */
function canCreateWebGL2Context(documentObject = globalThis.document) {
  const canvas = documentObject?.createElement?.("canvas");
  if (typeof canvas?.getContext !== "function") {
    return false;
  }

  let context = null;
  try {
    context = canvas.getContext("webgl2");
  } catch {
    return false;
  }

  if (!context) {
    return false;
  }

  // Probing burns a real GPU context; hand it back before the renderer asks
  // for its own.
  context.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  return true;
}

function getWebAudioDiagnostic(globalScope = globalThis) {
  if (
    typeof globalScope.AudioContext === "function" ||
    typeof globalScope.webkitAudioContext === "function"
  ) {
    return [];
  }

  return [
    "The Web Audio API is also missing, so the demo has no analysis source.",
  ];
}

function getSecureContextDiagnostic() {
  if (typeof globalThis.isSecureContext !== "boolean") {
    return [];
  }

  const diagnostics = [
    `Secure context: ${globalThis.isSecureContext ? "yes" : "no"}.`,
  ];

  if (!globalThis.isSecureContext) {
    diagnostics.push(
      "WebGPU is only exposed in secure contexts such as HTTPS or localhost.",
    );
  }

  return diagnostics;
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
      "Turn on the browser's graphics acceleration setting, then relaunch.",
      "Open `chrome://flags/#enable-unsafe-webgpu` and enable it.",
      "Open `chrome://flags/#enable-vulkan` and enable it.",
      "Restart the browser after changing the flags.",
    ],
    caveat:
      "Even with those flags enabled, WebGPU support still depends on your GPU, drivers, and browser version.",
  };
}

function buildDesktopChromiumGuidance() {
  return {
    summary:
      "This Chromium-based browser is open, but it is not exposing a usable WebGPU adapter to Baryon.",
    steps: [
      "Turn on the browser's graphics acceleration setting, then relaunch.",
      "Open the browser's GPU diagnostics page and confirm WebGPU is enabled without a driver, blocklist, or software-rendering warning.",
      "Update the operating system and graphics driver, then restart the browser.",
      "If this is a Remote Desktop, virtual machine, or managed browser session, test in a normal local browser window.",
    ],
    caveat:
      "A powerful GPU is not enough by itself; the browser must expose a hardware WebGPU adapter to the page.",
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

function buildMacSafariGuidance() {
  return {
    summary: "Safari is not exposing WebGPU to Baryon.",
    steps: [
      "Check Safari's WebGPU feature settings and restart Safari after changing them.",
      "Use Chrome or Edge for Baryon's primary tested browser path.",
    ],
    caveat:
      "`navigator.gpu` can be hidden by Safari settings, site policy, or platform support.",
  };
}

function buildMacSafariLockdownGuidance() {
  return {
    summary:
      "Safari's Lockdown Mode is enabled for this site, which removes WebGPU and other APIs Baryon needs.",
    steps: [
      'With Baryon open, choose Safari ▸ Settings for This Website… and uncheck "Enable Lockdown Mode", then reload the page.',
      "Alternatively, open Safari ▸ Settings ▸ Websites ▸ Lockdown Mode and turn it off for this site.",
      "To turn Lockdown Mode off everywhere, use System Settings ▸ Privacy & Security ▸ Lockdown Mode.",
    ],
    caveat:
      "Lockdown Mode also removes WebAssembly, AudioWorklet, and WebGL2, so Baryon cannot run until this site is excluded from it.",
  };
}

function buildIosLockdownGuidance() {
  return {
    summary:
      "Lockdown Mode is on for this site, and it blocks the WebGL and Web Audio APIs the demo runs on.",
    steps: [
      'Tap the "AA" button at the left of Safari\'s address bar.',
      'Choose "Website Settings", turn off "Lockdown Mode", then tap Done.',
      "Reload this page — the demo starts on its own.",
    ],
    caveat:
      "This excludes only this site. Lockdown Mode stays on everywhere else.",
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

export function buildBrowserGuidance({
  failureCode,
  platform,
  browserFamily,
  lockdownSuspected = false,
}) {
  if (!failureCode) {
    return null;
  }

  // Lockdown Mode is the one mobile failure the visitor can actually fix, so it
  // outranks the generic "use a desktop" advice.
  if (lockdownSuspected && platform === BROWSER_PLATFORM.ios) {
    return buildIosLockdownGuidance();
  }

  if (
    failureCode === BROWSER_FAILURE_CODES.mobileUnsupported ||
    failureCode === BROWSER_FAILURE_CODES.webgl2Missing
  ) {
    return buildMobileGuidance();
  }

  if (isLinuxDesktop(platform) && isFirefoxFamily(browserFamily)) {
    return buildLinuxFirefoxGuidance();
  }

  if (isLinuxDesktop(platform) && isChromiumFamily(browserFamily)) {
    return buildLinuxChromiumGuidance();
  }

  if (isChromiumFamily(browserFamily)) {
    return buildDesktopChromiumGuidance();
  }

  if (
    platform === BROWSER_PLATFORM.macos &&
    browserFamily === BROWSER_FAMILY.safari
  ) {
    return lockdownSuspected
      ? buildMacSafariLockdownGuidance()
      : buildMacSafariGuidance();
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
      lockdownSuspected: isLockdownModeSuspected(),
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
  useWebGLRenderer,
  navigatorObject = globalThis.navigator,
) {
  if (useWebGLRenderer) {
    return BROWSER_SUPPORT_STATUS.checking;
  }

  if (isMobileDevice(navigatorObject)) {
    return BROWSER_SUPPORT_STATUS.unsupported;
  }

  return BROWSER_SUPPORT_STATUS.checking;
}

export async function probeBrowserSupport(
  useWebGLRenderer,
  navigatorObject = globalThis.navigator,
) {
  const runtimeNavigator = /** @type {Navigator & {
   *   gpu?: {
   *     requestAdapter?: () => Promise<any>,
   *   },
   * }} */ (navigatorObject ?? {});
  if (useWebGLRenderer) {
    if (!canCreateWebGL2Context()) {
      return createFailureProbe({
        failureCode: BROWSER_FAILURE_CODES.webgl2Missing,
        navigatorObject: runtimeNavigator,
        diagnostics: [
          '`canvas.getContext("webgl2")` returned no context.',
          ...getWebAudioDiagnostic(),
          ...getLockdownModeDiagnostic(),
        ],
      });
    }

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
      diagnostics: [
        "`navigator.gpu` is not available in this browser.",
        ...getSecureContextDiagnostic(),
        ...getLockdownModeDiagnostic(),
      ],
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
  useWebGLRenderer,
  navigatorObject = globalThis.navigator,
) {
  const probe = await probeBrowserSupport(useWebGLRenderer, navigatorObject);
  return probe.status;
}
