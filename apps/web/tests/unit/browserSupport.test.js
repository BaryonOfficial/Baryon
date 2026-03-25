import test from "node:test";
import assert from "node:assert/strict";
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
} from "../../../../packages/app-shell/src/components/browserSupport.js";

test("starts in checking mode for normal WebGPU boot", () => {
  assert.equal(
    getInitialBrowserSupportStatus(false, {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    }),
    BROWSER_SUPPORT_STATUS.checking,
  );
});

test("detects mobile browsers", () => {
  assert.equal(
    isMobileDevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    }),
    true,
  );
});

test("detects Linux platform and Chromium browser family", () => {
  const navigatorObject = {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  };

  assert.equal(detectPlatform(navigatorObject), BROWSER_PLATFORM.linux);
  assert.equal(detectBrowserFamily(navigatorObject), BROWSER_FAMILY.chromium);
});

test("maps Firefox user agents to the firefox browser family", () => {
  assert.equal(
    detectBrowserFamily({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0",
    }),
    BROWSER_FAMILY.firefox,
  );
});

test("treats mobile browsers as unsupported even with a WebGPU adapter", async () => {
  assert.equal(
    await getBrowserSupportStatus(false, {
      gpu: {
        requestAdapter: async () => ({}),
      },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
    }),
    BROWSER_SUPPORT_STATUS.unsupported,
  );
});

test("reports missing navigator.gpu with Linux Chromium guidance", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
  });

  assert.equal(result.failureCode, BROWSER_FAILURE_CODES.gpuMissing);
  assert.equal(result.platform, BROWSER_PLATFORM.linux);
  assert.equal(result.browserFamily, BROWSER_FAMILY.chromium);
  assert.match(result.guidance.summary, /Chromium-based browsers/i);
  assert.deepEqual(result.diagnostics, [
    "`navigator.gpu` is not available in this browser.",
  ]);
});

test("reports missing requestAdapter with Linux Chromium guidance", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {},
  });

  assert.equal(result.failureCode, BROWSER_FAILURE_CODES.requestAdapterMissing);
  assert.match(result.guidance.steps[0], /enable-unsafe-webgpu/i);
});

test("maps a null adapter to the adapter-null failure code", async () => {
  const result = await probeBrowserSupport(false, {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    gpu: {
      requestAdapter: async () => null,
    },
  });

  assert.equal(result.failureCode, BROWSER_FAILURE_CODES.adapterNull);
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

  assert.equal(result.failureCode, BROWSER_FAILURE_CODES.adapterBlocklisted);
  assert.equal(result.browserFamily, BROWSER_FAMILY.firefox);
  assert.match(result.guidance.summary, /Firefox/i);
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

  assert.equal(result.failureCode, BROWSER_FAILURE_CODES.adapterError);
  assert.equal(result.rawError, "adapter probe failed");
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

  assert.equal(probe.failureCode, BROWSER_FAILURE_CODES.rendererInitError);
  assert.equal(probe.rawError, "device lost");
  assert.match(probe.diagnostics[0], /WebGPURenderer\.init\(\) failed/i);
});

test("builds Firefox Linux guidance with a Nightly recommendation", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.adapterBlocklisted,
    platform: BROWSER_PLATFORM.linux,
    browserFamily: BROWSER_FAMILY.firefox,
  });

  assert.match(guidance.summary, /Firefox/i);
  assert.match(guidance.steps[0], /Nightly/i);
});

test("builds mobile guidance when the failure code is mobile-unsupported", () => {
  const guidance = buildBrowserGuidance({
    failureCode: BROWSER_FAILURE_CODES.mobileUnsupported,
    platform: BROWSER_PLATFORM.ios,
    browserFamily: BROWSER_FAMILY.safari,
  });

  assert.match(guidance.summary, /desktop/i);
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

  assert.deepEqual(getSupportProbeTechnicalDetails(probe), [
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

  assert.match(clipboardText, /Baryon WebGPU diagnostics/);
  assert.match(clipboardText, /Failure code: request-adapter-missing/);
  assert.match(clipboardText, /Suggested next steps:/);
});

test("allows the forced WebGL fallback test path", async () => {
  assert.equal(
    getInitialBrowserSupportStatus(true),
    BROWSER_SUPPORT_STATUS.supported,
  );
  assert.equal(
    await getBrowserSupportStatus(true, {}),
    BROWSER_SUPPORT_STATUS.supported,
  );
});
