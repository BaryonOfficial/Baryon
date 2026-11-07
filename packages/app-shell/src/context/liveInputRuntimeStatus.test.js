import { expect, test, vi } from "vitest";
import { syncLiveInputRuntimeStatus } from "../components/hooks/liveInputRuntimeSync.js";
import { createAudioFeaturePacketFixture } from "../../../engine/src/testing/audioFeaturePacketFixture.js";
import { createRendererFeatureView } from "@baryon/engine/audio-features";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
  buildLiveInputRuntimeStatus,
  createLiveInputRuntimeStatus,
  isLiveInputTransitionLocked,
  mapLiveInputStartError,
} from "./liveInputRuntimeStatus.js";

test("revoked external status projects idle without inventing local source activity", () => {
  const lastLiveInputRuntimeStatusRef = { current: null },
    setStatus = vi.fn();
  const options = {
    status: null,
    featureFrame: null,
    featureRuntimeStatus: { revoked: true },
    liveInputUiState: "idle",
    liveInputErrorCode: "none",
    setLiveInputRuntimeStatus: setStatus,
    renderLoopRefs: { lastLiveInputRuntimeStatusRef },
  };
  expect(syncLiveInputRuntimeStatus(options)).toMatchObject({
    active: false,
    phase: "idle",
    observationAvailable: false,
  });
  syncLiveInputRuntimeStatus(options);
  expect(setStatus).toHaveBeenCalledOnce();
});
const frame = createRendererFeatureView(
  createAudioFeaturePacketFixture().model(),
);
const status = {
  isLiveInputActive: true,
  sourceSession: { kind: "system", sessionId: 7 },
  liveInputDeviceKind: "system",
  resolvedLiveInputAnalysisClass: "line-feed",
  selectedLiveInputDeviceId: "device-1",
  selectedLiveInputDeviceLabel: "DJ mixer",
};
test.each(["acoustic-mic", "line-feed"])(
  "a valid quiet %s stream is listening without calibration or energy gating",
  (resolvedLiveInputAnalysisClass) => {
    const result = buildLiveInputRuntimeStatus({
      status: { ...status, resolvedLiveInputAnalysisClass },
      featureFrame: frame,
    });
    expect(result).toMatchObject({
      active: true,
      phase: "listening",
      observationAvailable: true,
      sourceSessionId: 7,
      sourceGeneration: frame.observation.sourceGeneration,
    });
    expect(result).not.toHaveProperty("gateOpen");
    expect(result).not.toHaveProperty("signalState");
  },
);
test("device connection and retired diagnostic fields cannot synthesize observation readiness", () => {
  const result = buildLiveInputRuntimeStatus({
    status,
    featureFrame: {
      renderAuthority: true,
      sourceEvidence: {
        currentSourceEvidence: true,
        sourceBoundaryState: "live",
      },
      debug: { liveInputNoiseGateActive: false },
    },
  });
  expect(result).toMatchObject({
    phase: "listening",
    observationAvailable: false,
  });
  expect(
    createLiveInputRuntimeStatus({
      calibrationActive: true,
      sourceEvidence: { live: true },
    }),
  ).not.toHaveProperty("calibrationActive");
});
test("worker failure and sample-clock staleness surface as processing errors even while the device remains connected", () => {
  for (const featureRuntimeStatus of [
    { state: "failed" },
    { latestObservationStale: true },
  ]) {
    expect(
      buildLiveInputRuntimeStatus({
        status,
        featureFrame: frame,
        featureRuntimeStatus,
      }),
    ).toMatchObject({
      phase: "error",
      errorCode: "processing-failed",
      observationAvailable: false,
    });
  }
});
test("provider transitions and errors remain authoritative over cached valid observations", () => {
  expect(
    buildLiveInputRuntimeStatus({
      status,
      featureFrame: frame,
      liveInputUiState: "stopping",
    }).phase,
  ).toBe("stopping");
  expect(
    buildLiveInputRuntimeStatus({
      status,
      featureFrame: frame,
      liveInputUiState: "starting",
    }).phase,
  ).toBe("starting");
  expect(
    buildLiveInputRuntimeStatus({
      status: { ...status, isLiveInputActive: false },
      featureFrame: frame,
    }).phase,
  ).toBe("idle");
  expect(
    buildLiveInputRuntimeStatus({
      status,
      featureFrame: frame,
      liveInputErrorCode: "device-disconnected",
    }),
  ).toMatchObject({ phase: "error", errorCode: "device-disconnected" });
});
test("maps provider start errors and transition locking", () => {
  expect(
    mapLiveInputStartError({
      name: "NotAllowedError",
    }),
  ).toBe(LIVE_INPUT_ERROR_CODES.permissionDenied);
  expect(
    mapLiveInputStartError({
      name: "NotFoundError",
    }),
  ).toBe(LIVE_INPUT_ERROR_CODES.deviceMissing);
  expect(
    mapLiveInputStartError({
      name: "NotReadableError",
      message: "Could not start audio source",
    }),
  ).toBe(LIVE_INPUT_ERROR_CODES.deviceUnavailable);
  expect(
    mapLiveInputStartError({
      name: "TrackStartError",
    }),
  ).toBe(LIVE_INPUT_ERROR_CODES.deviceUnavailable);
  expect(
    mapLiveInputStartError({
      message: "unexpected failure",
    }),
  ).toBe(LIVE_INPUT_ERROR_CODES.startFailed);

  expect(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.starting,
    }),
  ).toBe(true);
  expect(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.stopping,
    }),
  ).toBe(true);
  expect(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.listening,
    }),
  ).toBe(false);
});
