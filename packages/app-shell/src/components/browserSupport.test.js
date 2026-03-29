import { expect, test } from "vitest";
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

test("reports missing requestAdapter with Linux Chromium guidance", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {},
  });

  expect(result.failureCode).toBe(BROWSER_FAILURE_CODES.requestAdapterMissing);
  expect(result.guidance.steps[0]).toMatch(/enable-unsafe-webgpu/i);
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
