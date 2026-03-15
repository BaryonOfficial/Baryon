import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMessages,
  classifyPageError,
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
