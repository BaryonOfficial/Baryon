import { describe, expect, it } from "vitest";
import {
  createAppliedDiagnosticControlState,
  deriveDiagnosticControlStatuses,
} from "./diagnosticControlStatus.js";

function createRuntimeSession(overrides = {}) {
  return {
    generation: 4,
    phase: "ready",
    observedBackend: "webgpu",
    rendererRequiredWebGL: false,
    ...overrides,
  };
}

function createControls(overrides = {}) {
  return {
    auditEnabled: false,
    freezeModeSlots: false,
    forceWebGLFallbackTest: false,
    injectTestTone: false,
    suppressPlaybackTelemetry: false,
    ...overrides,
  };
}

it("derives applied diagnostics only from a generation-tagged runtime frame", () => {
  expect(
    createAppliedDiagnosticControlState({
      runtimeGeneration: 4,
      controls: {
        auditEnabled: true,
        suppressPlaybackTelemetry: true,
      },
      status: { isPlaying: true },
      featureFrame: {
        diagnosticControlState: {
          auditEnabled: true,
          freezeModeSlots: true,
          injectTestTone: true,
          suppressPlaybackTelemetry: true,
        },
      },
    }),
  ).toEqual({
    generation: 4,
    auditEnabled: true,
    freezeModeSlots: true,
    injectTestTone: true,
    suppressPlaybackTelemetry: true,
    suppressPlaybackTelemetryActive: true,
  });
});

it("requires worker and renderer evidence before audit capture is applied", () => {
  expect(
    createAppliedDiagnosticControlState({
      runtimeGeneration: 4,
      controls: {
        auditEnabled: false,
        suppressPlaybackTelemetry: false,
      },
      status: { isPlaying: false },
      featureFrame: {
        diagnosticControlState: {
          auditEnabled: true,
          freezeModeSlots: false,
          injectTestTone: false,
          suppressPlaybackTelemetry: false,
        },
      },
    })?.auditEnabled,
  ).toBe(false);
});

describe("deriveDiagnosticControlStatuses", () => {
  it("marks live diagnostics active only when current-generation evidence matches", () => {
    const statuses = deriveDiagnosticControlStatuses({
      controlsState: createControls({
        auditEnabled: true,
        freezeModeSlots: true,
        injectTestTone: true,
        suppressPlaybackTelemetry: true,
      }),
      appliedState: {
        generation: 4,
        auditEnabled: true,
        freezeModeSlots: true,
        injectTestTone: true,
        suppressPlaybackTelemetry: true,
        suppressPlaybackTelemetryActive: false,
      },
      runtimeSession: createRuntimeSession(),
    });

    expect(statuses.auditEnabled.state).toBe("active");
    expect(statuses.freezeModeSlots.state).toBe("active");
    expect(statuses.injectTestTone.state).toBe("active");
    expect(statuses.suppressPlaybackTelemetry).toMatchObject({
      state: "armed",
      label: "Armed",
    });
  });

  it("rejects stale generation evidence without restarting the session", () => {
    const runtimeSession = createRuntimeSession();
    const statuses = deriveDiagnosticControlStatuses({
      controlsState: createControls({ injectTestTone: true }),
      appliedState: {
        generation: 3,
        auditEnabled: false,
        freezeModeSlots: false,
        injectTestTone: true,
        suppressPlaybackTelemetry: false,
        suppressPlaybackTelemetryActive: false,
      },
      runtimeSession,
    });

    expect(statuses.injectTestTone.state).toBe("applying");
    expect(runtimeSession).toEqual(createRuntimeSession());
  });

  it("reports backend readiness from observed renderer state", () => {
    expect(
      deriveDiagnosticControlStatuses({
        controlsState: createControls({ forceWebGLFallbackTest: true }),
        appliedState: null,
        runtimeSession: createRuntimeSession({
          observedBackend: "webgl2",
        }),
      }).forceWebGLFallbackTest,
    ).toMatchObject({
      requested: true,
      applied: true,
      state: "active",
    });
  });
});
