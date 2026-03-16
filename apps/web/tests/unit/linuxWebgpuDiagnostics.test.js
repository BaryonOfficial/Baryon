import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMessages,
  classifyPageError,
  formatResultSummary,
  getDiagnosticsResult,
  isSoftwareAdapter,
  summarizeClassification,
  shouldFailBrowserDiagnostics,
} from "../../scripts/linux-webgpu-diagnostics.mjs";

test("classifies severe runtime page errors", () => {
  assert.equal(
    classifyPageError(
      "RangeError: Failed to execute 'createBuffer' on 'GPUDevice': createBuffer failed",
      {
        adapterAvailable: true,
      },
    ),
    "runtime-severe",
  );
});

test("classifies unsupported adapter failures as expected unsupported", () => {
  assert.equal(
    classifyPageError("OperationError: requestAdapter failed", {
      adapterAvailable: false,
      adapterError: "WebGPU is disabled by blocklist.",
    }),
    "expected-unsupported",
  );
});

test("aggregates duplicate messages with counts and classifications", () => {
  assert.deepEqual(
    aggregateMessages(
      [
        "OperationError: Instance dropped in popErrorScope",
        "OperationError: Instance dropped in popErrorScope",
        "Error loading audio devices: NotSupportedError: Not supported",
      ],
      {
        adapterAvailable: true,
      },
    ),
    [
      {
        message: "OperationError: Instance dropped in popErrorScope",
        count: 2,
        classification: "runtime-severe",
      },
      {
        message:
          "Error loading audio devices: NotSupportedError: Not supported",
        count: 1,
        classification: "runtime-warning",
      },
    ],
  );
});

test("fails diagnostics when a usable adapter hits severe runtime errors", () => {
  assert.equal(
    shouldFailBrowserDiagnostics({
      infrastructureError: null,
      info: {
        adapterAvailable: true,
        adapterInfo: {
          info: {
            vendor: "nvidia",
            architecture: "turing",
            device: "rtx",
            description: "hardware gpu",
          },
        },
      },
      pageErrorSummary: [
        {
          message:
            "RangeError: Failed to execute 'createBuffer' on 'GPUDevice': createBuffer failed",
          count: 3,
          classification: "runtime-severe",
        },
      ],
    }),
    true,
  );
});

test("detects SwiftShader as a software adapter", () => {
  assert.equal(
    isSoftwareAdapter({
      adapterInfo: {
        info: {
          vendor: "google",
          architecture: "swiftshader",
          device: null,
          description: null,
        },
      },
    }),
    true,
  );
});

test("downgrades severe runtime errors on software adapters to environment-limited", () => {
  const result = {
    infrastructureError: null,
    info: {
      adapterAvailable: true,
      adapterInfo: {
        info: {
          vendor: "google",
          architecture: "swiftshader",
          device: null,
          description: null,
        },
      },
    },
    pageErrorSummary: [
      {
        message:
          "RangeError: Failed to execute 'createBuffer' on 'GPUDevice': createBuffer failed",
        count: 3,
        classification: "runtime-severe",
      },
    ],
  };

  assert.equal(getDiagnosticsResult(result), "environment-limited");
  assert.equal(shouldFailBrowserDiagnostics(result), false);
});

test("does not fail diagnostics for expected unsupported Firefox blocklist findings", () => {
  assert.equal(
    shouldFailBrowserDiagnostics({
      infrastructureError: null,
      info: {
        adapterAvailable: false,
      },
      pageErrorSummary: [
        {
          message: "OperationError: requestAdapter failed",
          count: 1,
          classification: "expected-unsupported",
        },
      ],
    }),
    false,
  );
});

test("summarizes classifications without mutating the source list", () => {
  const pageErrorSummary = [
    {
      message: "createBuffer failed",
      count: 2,
      classification: "runtime-severe",
    },
    {
      message: "Not supported",
      count: 1,
      classification: "runtime-warning",
    },
  ];

  assert.deepEqual(
    summarizeClassification(pageErrorSummary, "runtime-severe"),
    [pageErrorSummary[0]],
  );
  assert.equal(pageErrorSummary.length, 2);
});

test("formats result summaries with diagnostics, adapter details, and warnings", () => {
  const summary = formatResultSummary({
    browserName: "chromium-linux-webgpu",
    ok: true,
    infrastructureError: null,
    screenshotPath: "test-results/linux-webgpu-screenshots/chromium.png",
    info: {
      hasGpu: true,
      hasRequestAdapter: true,
      adapterAvailable: true,
      adapterError: null,
      adapterInfo: {
        info: {
          vendor: "google",
          architecture: "swiftshader",
          device: "swiftshader-device",
          description: "software adapter",
        },
        limits: {
          maxBufferSize: 1024,
        },
        features: ["timestamp-query"],
      },
      supportProbe: {
        failureCode: "adapter-blocklisted",
        diagnostics: ["WebGPU is blocklisted."],
      },
      rendererInfo: {
        backendType: "webgpu",
        backend: "WebGPUBackend",
        error: null,
      },
      canvasPresent: true,
      canvasVisible: true,
      visuallyReady: true,
    },
    pageErrorSummary: [
      {
        message: "createBuffer failed",
        count: 2,
        classification: "runtime-severe",
      },
      {
        message: "Not supported",
        count: 1,
        classification: "runtime-warning",
      },
    ],
    consoleMessages: [
      { type: "warning", text: "first warning" },
      { type: "debug", text: "hidden debug" },
    ],
  });

  assert.match(summary, /Diagnostics result: environment-limited/);
  assert.match(
    summary,
    /Adapter info: vendor=google, architecture=swiftshader/,
  );
  assert.match(summary, /Software adapter: yes/);
  assert.match(summary, /Severe runtime errors:/);
  assert.match(summary, /Runtime warnings:/);
  assert.match(summary, /Console messages:/);
  assert.doesNotMatch(summary, /hidden debug/);
});
