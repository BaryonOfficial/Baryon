import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_SUPPORT_STATUS,
  getBrowserSupportStatus,
  getInitialBrowserSupportStatus,
  isMobileDevice,
  probeBrowserSupport,
} from "../../src/components/browserSupport.js";

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

test("treats browsers without WebGPU as unsupported", async () => {
  assert.equal(
    await getBrowserSupportStatus(false, {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    }),
    BROWSER_SUPPORT_STATUS.unsupported,
  );
});

test("reports missing navigator.gpu in probe diagnostics", async () => {
  assert.deepEqual(
    await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
    }),
    {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: ["`navigator.gpu` is not available in this browser."],
    },
  );
});

test("reports missing requestAdapter in probe diagnostics", async () => {
  assert.deepEqual(
    await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
      gpu: {},
    }),
    {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: [
        "`navigator.gpu.requestAdapter` is not available in this browser.",
      ],
    },
  );
});

test("treats browsers without a usable WebGPU adapter as unsupported", async () => {
  assert.equal(
    await getBrowserSupportStatus(false, {
      gpu: {
        requestAdapter: async () => null,
      },
    }),
    BROWSER_SUPPORT_STATUS.unsupported,
  );
});

test("reports null adapter results in probe diagnostics", async () => {
  assert.deepEqual(
    await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
      gpu: {
        requestAdapter: async () => null,
      },
    }),
    {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: ["`navigator.gpu.requestAdapter()` returned `null`."],
    },
  );
});

test("treats adapter probe failures as unsupported", async () => {
  assert.equal(
    await getBrowserSupportStatus(false, {
      gpu: {
        requestAdapter: async () => {
          throw new Error("adapter probe failed");
        },
      },
    }),
    BROWSER_SUPPORT_STATUS.unsupported,
  );
});

test("reports thrown adapter probe failures in diagnostics", async () => {
  assert.deepEqual(
    await probeBrowserSupport(false, {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
      gpu: {
        requestAdapter: async () => {
          throw new Error("adapter probe failed");
        },
      },
    }),
    {
      status: BROWSER_SUPPORT_STATUS.unsupported,
      reason: "browser",
      diagnostics: [
        "`navigator.gpu.requestAdapter()` failed: adapter probe failed",
      ],
    },
  );
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
