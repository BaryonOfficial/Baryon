import { expect, test, vi } from "vitest";
import {
  BROWSER_FAILURE_CODES,
  BROWSER_FAMILY,
  BROWSER_PLATFORM,
  BROWSER_SUPPORT_STATUS,
  buildBrowserGuidance,
  createFailureProbe,
  createRendererInitFailureProbe,
  detectBrowserFamily,
  detectPlatform,
  formatSupportProbeForClipboard,
  getBrowserSupportStatus,
  getInitialBrowserSupportStatus,
  getSupportProbeTechnicalDetails,
  isLockdownModeSuspected,
  isMobileDevice,
  probeBrowserSupport,
} from "./browserSupport.js";

test("starts in checking mode for normal WebGPU boot", () => {
  expect(
    getInitialBrowserSupportStatus(false, {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    }),
  ).toBe(BROWSER_SUPPORT_STATUS.checking);
});

test("detects mobile browsers", () => {
  expect(
    isMobileDevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    }),
  ).toBe(true);
});

test("detects Linux platform and Chromium browser family", () => {
  const navigatorObject = {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  };

  expect(detectPlatform(navigatorObject)).toBe(BROWSER_PLATFORM.linux);
  expect(detectBrowserFamily(navigatorObject)).toBe(BROWSER_FAMILY.chromium);
});

test("maps Chromium-token browsers to the chromium browser family", () => {
  expect(
    detectBrowserFamily({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chromium/145.0.0.0 Safari/537.36",
    }),
  ).toBe(BROWSER_FAMILY.chromium);
});

test("uses Chromium Client Hints to identify Chromium-family browsers", () => {
  expect(
    detectBrowserFamily({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Safari/537.36",
      userAgentData: {
        brands: [
          { brand: "Not A(Brand", version: "99" },
          { brand: "Chromium", version: "145" },
        ],
      },
    }),
  ).toBe(BROWSER_FAMILY.chromium);
});

test("maps Firefox user agents to the firefox browser family", () => {
  expect(
    detectBrowserFamily({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
    }),
  ).toBe(BROWSER_FAMILY.firefox);
});

test("treats mobile browsers as unsupported even with a WebGPU adapter", async () => {
  await expect(
    getBrowserSupportStatus(false, {
      gpu: {
        requestAdapter: async () => ({}),
      },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    }),
  ).resolves.toBe(BROWSER_SUPPORT_STATUS.unsupported);
});

test("reports missing navigator.gpu with Linux Chromium guidance", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.gpuMissing);
  expect(result.platform).toBe(BROWSER_PLATFORM.linux);
  expect(result.browserFamily).toBe(BROWSER_FAMILY.chromium);
  expect(result.guidance.summary).toMatch(/Chromium-based browsers/i);
  expect(result.diagnostics).toStrictEqual([
    "`navigator.gpu` is not available in this browser.",
  ]);
});

test("reports insecure-context detail when navigator.gpu is missing", async () => {
  const originalSecureContext = globalThis.isSecureContext;
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: false,
  });

  try {
    const result = await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 26_5) AppleWebKit/605.1.15 Version/26.5 Safari/605.1.15",
    });

    expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.gpuMissing);
    expect(result.platform).toBe(BROWSER_PLATFORM.macos);
    expect(result.browserFamily).toBe(BROWSER_FAMILY.safari);
    expect(result.diagnostics).toContain("Secure context: no.");
    expect(result.diagnostics).toContain(
      "WebGPU is only exposed in secure contexts such as HTTPS or localhost.",
    );
  } finally {
    if (typeof originalSecureContext === "undefined") {
      delete globalThis.isSecureContext;
    } else {
      Object.defineProperty(globalThis, "isSecureContext", {
        configurable: true,
        value: originalSecureContext,
      });
    }
  }
});

test("reports missing requestAdapter with Linux Chromium guidance", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {},
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.requestAdapterMissing);
  expect(result.guidance.steps.join(" ")).toMatch(/graphics acceleration/i);
  expect(result.guidance.steps.join(" ")).toMatch(/enable-unsafe-webgpu/i);
});

test("maps a null adapter to the adapter-null failure code", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {
      requestAdapter: async () => null,
    },
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.adapterNull);
});

test.each([
  [
    "Windows",
    BROWSER_PLATFORM.windows,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  ],
  [
    "macOS",
    BROWSER_PLATFORM.macos,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  ],
])(
  "reports %s Chromium adapter failures with graphics guidance",
  async (_label, expectedPlatform, userAgent) => {
    const result = await probeBrowserSupport(false, {
      userAgent,
      gpu: {
        requestAdapter: async () => null,
      },
    });

    expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.adapterNull);
    expect(result.platform).toBe(expectedPlatform);
    expect(result.browserFamily).toBe(BROWSER_FAMILY.chromium);
    expect(result.guidance.summary).toMatch(/Chromium-based browser/i);
    expect(result.guidance.steps[0]).toBe(
      "Turn on the browser's graphics acceleration setting, then relaunch.",
    );
    expect(result.guidance.steps[0]).not.toMatch(/Chrome|chrome:\/\//i);
  },
);

test("classifies blocklisted Firefox adapters distinctly", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
    gpu: {
      requestAdapter: async () => {
        throw new Error("WebGPU is disabled by blocklist.");
      },
    },
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.adapterBlocklisted);
  expect(result.browserFamily).toBe(BROWSER_FAMILY.firefox);
  expect(result.guidance.summary).toMatch(/Firefox/i);
});

test("uses the generic adapter-error failure code for non-blocklist errors", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {
      requestAdapter: async () => {
        throw new Error("adapter probe failed");
      },
    },
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.adapterError);
  expect(result.rawError).toBe("adapter probe failed");
});

test("maps renderer init failures to renderer-init-error", () => {
  const probe = createRendererInitFailureProbe(
    new Error("WebGPU renderer initialization failed", {
      cause: new Error("device lost"),
    }),
    {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    },
  );

  expect(probe.failureCode).toBe(BROWSER_FAILURE_CODES.rendererInitError);
  expect(probe.rawError).toBe("device lost");
  expect(probe.diagnostics[0]).toMatch(/WebGPURenderer\.init\(\) failed/i);
});

test("builds Firefox Linux guidance with a Nightly recommendation", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.adapterBlocklisted,
    platform: BROWSER_PLATFORM.linux,
    browserFamily: BROWSER_FAMILY.firefox,
  });

  expect(guidance.summary).toMatch(/Firefox/i);
  expect(guidance.steps[0]).toMatch(/Nightly/i);
});

test("builds mobile guidance when the failure code is mobile-unsupported", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.mobileUnsupported,
    platform: BROWSER_PLATFORM.ios,
    browserFamily: BROWSER_FAMILY.safari,
  });

  expect(guidance.summary).toMatch(/desktop/i);
});

test("builds short macOS Safari guidance without version-specific detours", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.gpuMissing,
    platform: BROWSER_PLATFORM.macos,
    browserFamily: BROWSER_FAMILY.safari,
  });

  expect(guidance.summary).toMatch(/Safari/i);
  expect(guidance.steps.join(" ")).not.toMatch(/Tahoe|Safari 26\.5/i);
  expect(guidance.steps[1]).toMatch(/Chrome or Edge/i);
});

test("suspects Lockdown Mode only when WebAssembly is missing", () => {
  expect(isLockdownModeSuspected({})).toBe(true);
  expect(isLockdownModeSuspected({ WebAssembly: {} })).toBe(false);
});

test("builds macOS Safari Lockdown Mode guidance when lockdown is suspected", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.gpuMissing,
    platform: BROWSER_PLATFORM.macos,
    browserFamily: BROWSER_FAMILY.safari,
    lockdownSuspected: true,
  });

  expect(guidance.summary).toMatch(/Lockdown Mode/i);
  expect(guidance.steps[0]).toMatch(/Settings for This Website/i);
});

test("reports Lockdown Mode when Safari hides both WebGPU and WebAssembly", async () => {
  vi.stubGlobal("WebAssembly", undefined);

  try {
    const result = await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
    });

    expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.gpuMissing);
    expect(result.platform).toBe(BROWSER_PLATFORM.macos);
    expect(result.browserFamily).toBe(BROWSER_FAMILY.safari);
    expect(result.diagnostics).toContain(
      "`WebAssembly` is also missing; Safari's Lockdown Mode removes both WebGPU and WebAssembly.",
    );
    expect(result.guidance.summary).toMatch(/Lockdown Mode/i);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("formats support probes into stable technical detail lines", () => {
  const probe = createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.gpuMissing,
    navigatorObject: {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    },
    diagnostics: ["`navigator.gpu` is not available in this browser."],
  });

  expect(getSupportProbeTechnicalDetails(probe)).toStrictEqual([
    "Status: unsupported",
    "Failure code: gpu-missing",
    "Platform: linux",
    "Browser family: chromium",
    "`navigator.gpu` is not available in this browser.",
  ]);
});

test("formats clipboard diagnostics with guidance and steps", () => {
  const probe = createFailureProbe({
    failureCode: BROWSER_FAILURE_CODES.requestAdapterMissing,
    navigatorObject: {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    },
    diagnostics: [
      "`navigator.gpu.requestAdapter` is not available in this browser.",
    ],
  });

  const clipboardText = formatSupportProbeForClipboard(probe);

  expect(clipboardText).toMatch(/Baryon WebGPU diagnostics/);
  expect(clipboardText).toMatch(/Failure code: request-adapter-missing/);
  expect(clipboardText).toMatch(/Suggested next steps:/);
});

test("allows the forced WebGL fallback test path", async () => {
  expect(getInitialBrowserSupportStatus(true)).toBe(
    BROWSER_SUPPORT_STATUS.supported,
  );
  await expect(getBrowserSupportStatus(true, {})).resolves.toBe(
    BROWSER_SUPPORT_STATUS.supported,
  );
});
