import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_SIGNAL_STATES,
  LIVE_INPUT_UI_STATES,
  buildLiveInputRuntimeStatus,
  getLiveInputStatusLabel,
  isLiveInputTransitionLocked,
  mapLiveInputStartError,
} from "./liveInputRuntimeStatus.js";

function createStatus(overrides = {}) {
  return {
    isLiveInputActive: false,
    liveInputKind: "live",
    liveInputAnalysisClass: "auto",
    resolvedLiveInputAnalysisClass: "acoustic-mic",
    selectedLiveInputDeviceId: "device-1",
    selectedLiveInputDeviceLabel: "Built-in Mic",
    ...overrides,
  };
}

function createFeatureFrame(debug = {}) {
  return {
    debug: {
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: false,
      liveInputHardSilenceActive: false,
      liveInputCalibrationInvalid: false,
      liveInputCalibrationInvalidReason: "none",
      ...debug,
    },
  };
}

test("maps acoustic mic runtime phases from calibration to listening to weak signal", () => {
  const calibrating = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: true,
      liveInputNoiseGateActive: true,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  assert.equal(calibrating.phase, LIVE_INPUT_PHASES.calibrating);
  assert.equal(calibrating.calibrationActive, true);
  assert.equal(calibrating.gateOpen, false);
  assert.equal(calibrating.signalState, LIVE_INPUT_SIGNAL_STATES.ok);

  const listening = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: false,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  assert.equal(listening.phase, LIVE_INPUT_PHASES.listening);
  assert.equal(listening.gateOpen, true);
  assert.equal(getLiveInputStatusLabel(listening), "Auto: using acoustic mic");

  const weak = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: true,
      liveInputHardSilenceActive: false,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  assert.equal(weak.phase, LIVE_INPUT_PHASES.weakSignal);
  assert.equal(weak.signalState, LIVE_INPUT_SIGNAL_STATES.weak);
  assert.equal(getLiveInputStatusLabel(weak), "Input too weak");

  const silent = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: true,
      liveInputHardSilenceActive: true,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  assert.equal(silent.phase, LIVE_INPUT_PHASES.weakSignal);
  assert.equal(silent.signalState, LIVE_INPUT_SIGNAL_STATES.silent);
});

test("treats line feed input as listening without mic calibration states", () => {
  const runtimeStatus = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: true,
      liveInputKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
      selectedLiveInputDeviceLabel: "Loopback Device",
    }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: true,
      liveInputNoiseGateActive: true,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });

  assert.equal(runtimeStatus.phase, LIVE_INPUT_PHASES.listening);
  assert.equal(runtimeStatus.calibrationActive, false);
  assert.equal(runtimeStatus.gateOpen, true);
  assert.equal(
    getLiveInputStatusLabel(runtimeStatus),
    "Auto: detected line feed",
  );
});

test("maps invalid calibration to clipped error status", () => {
  const runtimeStatus = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationInvalid: true,
      liveInputCalibrationInvalidReason: "compressed-baseline",
      liveInputNoiseGateActive: true,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });

  assert.equal(runtimeStatus.phase, LIVE_INPUT_PHASES.error);
  assert.equal(runtimeStatus.calibrationInvalid, true);
  assert.equal(
    runtimeStatus.errorCode,
    LIVE_INPUT_ERROR_CODES.calibrationInvalid,
  );
  assert.equal(runtimeStatus.signalState, LIVE_INPUT_SIGNAL_STATES.clipped);
  assert.equal(
    getLiveInputStatusLabel(runtimeStatus),
    "Mic signal looks clipped",
  );
});

test("maps provider start errors and transition locking", () => {
  assert.equal(
    mapLiveInputStartError({
      name: "NotAllowedError",
    }),
    LIVE_INPUT_ERROR_CODES.permissionDenied,
  );
  assert.equal(
    mapLiveInputStartError({
      name: "NotFoundError",
    }),
    LIVE_INPUT_ERROR_CODES.deviceMissing,
  );
  assert.equal(
    mapLiveInputStartError({
      message: "unexpected failure",
    }),
    LIVE_INPUT_ERROR_CODES.startFailed,
  );

  assert.equal(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.starting,
    }),
    true,
  );
  assert.equal(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.stopping,
    }),
    true,
  );
  assert.equal(
    isLiveInputTransitionLocked({
      phase: LIVE_INPUT_PHASES.listening,
    }),
    false,
  );
});

test("keeps auto classification labels available while idle", () => {
  const idleAutoMic = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: false,
      resolvedLiveInputAnalysisClass: "acoustic-mic",
    }),
  });
  assert.equal(
    getLiveInputStatusLabel(idleAutoMic),
    "Auto: using acoustic mic",
  );

  const idleAutoLine = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: false,
      resolvedLiveInputAnalysisClass: "line-feed",
    }),
  });
  assert.equal(
    getLiveInputStatusLabel(idleAutoLine),
    "Auto: detected line feed",
  );
});
