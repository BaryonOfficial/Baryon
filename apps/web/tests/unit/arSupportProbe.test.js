import test from "node:test";
import assert from "node:assert/strict";
import {
  AR_SUPPORT_FAILURE_CODES,
  AR_SUPPORT_STATUS,
  probeArLabSupport,
} from "../../src/ar-lab/arSupportProbe.js";

function createNavigator({
  adapter = {},
  adapterError = null,
  xrSupported = true,
  xrError = null,
  includeGpu = true,
  includeXr = true,
} = {}) {
  return {
    // Deliberately mobile-looking: the AR probe must not mobile-block.
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) OculusBrowser Mobile VR",
    ...(includeGpu
      ? {
          gpu: {
            requestAdapter: async () => {
              if (adapterError) {
                throw adapterError;
              }
              return adapter;
            },
          },
        }
      : {}),
    ...(includeXr
      ? {
          xr: {
            isSessionSupported: async (mode) => {
              if (xrError) {
                throw xrError;
              }
              return mode === "immersive-ar" && xrSupported;
            },
          },
        }
      : {}),
  };
}

test("supports headset-style browsers without mobile blocking", async () => {
  const probe = await probeArLabSupport({
    navigatorObject: createNavigator(),
    isSecureContext: true,
  });

  assert.equal(probe.status, AR_SUPPORT_STATUS.supported);
  assert.equal(probe.failureCode, null);
});

test("fails closed on insecure contexts", async () => {
  const probe = await probeArLabSupport({
    navigatorObject: createNavigator(),
    isSecureContext: false,
  });

  assert.equal(probe.status, AR_SUPPORT_STATUS.unsupported);
  assert.equal(probe.failureCode, AR_SUPPORT_FAILURE_CODES.insecureContext);
});

test("reports missing WebGPU", async () => {
  const probe = await probeArLabSupport({
    navigatorObject: createNavigator({ includeGpu: false }),
    isSecureContext: true,
  });

  assert.equal(probe.failureCode, AR_SUPPORT_FAILURE_CODES.webgpuMissing);
});

test("reports null and throwing WebGPU adapters", async () => {
  const nullAdapterProbe = await probeArLabSupport({
    navigatorObject: createNavigator({ adapter: null }),
    isSecureContext: true,
  });
  assert.equal(
    nullAdapterProbe.failureCode,
    AR_SUPPORT_FAILURE_CODES.webgpuAdapterUnavailable,
  );

  const throwingAdapterProbe = await probeArLabSupport({
    navigatorObject: createNavigator({
      adapterError: new Error("blocklisted"),
    }),
    isSecureContext: true,
  });
  assert.equal(
    throwingAdapterProbe.failureCode,
    AR_SUPPORT_FAILURE_CODES.webgpuAdapterUnavailable,
  );
  assert.match(throwingAdapterProbe.diagnostics[0], /blocklisted/);
});

test("reports missing WebXR", async () => {
  const probe = await probeArLabSupport({
    navigatorObject: createNavigator({ includeXr: false }),
    isSecureContext: true,
  });

  assert.equal(probe.status, AR_SUPPORT_STATUS.preview);
  assert.equal(probe.failureCode, AR_SUPPORT_FAILURE_CODES.webxrMissing);
});

test("reports unsupported immersive-ar sessions", async () => {
  const unsupportedProbe = await probeArLabSupport({
    navigatorObject: createNavigator({ xrSupported: false }),
    isSecureContext: true,
  });
  assert.equal(unsupportedProbe.status, AR_SUPPORT_STATUS.preview);
  assert.equal(
    unsupportedProbe.failureCode,
    AR_SUPPORT_FAILURE_CODES.immersiveArUnsupported,
  );

  const throwingProbe = await probeArLabSupport({
    navigatorObject: createNavigator({ xrError: new Error("denied") }),
    isSecureContext: true,
  });
  assert.equal(throwingProbe.status, AR_SUPPORT_STATUS.preview);
  assert.equal(
    throwingProbe.failureCode,
    AR_SUPPORT_FAILURE_CODES.immersiveArUnsupported,
  );
});
