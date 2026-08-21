import { expect, test } from "vitest";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_SIGNAL_STATES,
  LIVE_INPUT_UI_STATES,
  buildLiveInputRuntimeStatus,
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

function createLineFeedFeatureFrame(sourceEvidenceOverrides = {}) {
  return {
    sourceEvidence: {
      sourceBoundaryState: "live",
      currentSourceEvidence: true,
      sourceEnergy: 0.3,
      ...sourceEvidenceOverrides,
    },
    debug: {
      liveInputCalibrationActive: true,
      liveInputNoiseGateActive: true,
      liveInputHardSilenceActive: false,
      liveInputCalibrationInvalid: false,
      liveInputCalibrationInvalidReason: "none",
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
  expect(calibrating.phase).toBe(LIVE_INPUT_PHASES.calibrating);
  expect(calibrating.liveInputDeviceKind).toBe("live");
  expect(calibrating.liveInputKind).toBe("live");
  expect(calibrating.calibrationActive).toBe(true);
  expect(calibrating.gateOpen).toBe(false);
  expect(calibrating.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.ok);

  const listening = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: false,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  expect(listening.phase).toBe(LIVE_INPUT_PHASES.listening);
  expect(listening.gateOpen).toBe(true);

  const weak = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: true,
      liveInputHardSilenceActive: false,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  expect(weak.phase).toBe(LIVE_INPUT_PHASES.weakSignal);
  expect(weak.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.weak);

  const silent = buildLiveInputRuntimeStatus({
    status: createStatus({ isLiveInputActive: true }),
    featureFrame: createFeatureFrame({
      liveInputCalibrationActive: false,
      liveInputNoiseGateActive: true,
      liveInputHardSilenceActive: true,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });
  expect(silent.phase).toBe(LIVE_INPUT_PHASES.weakSignal);
  expect(silent.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.silent);
});

test("treats line feed input as listening without mic calibration states", () => {
  const runtimeStatus = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: true,
      liveInputKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
      selectedLiveInputDeviceLabel: "Loopback Device",
    }),
    featureFrame: createLineFeedFeatureFrame(),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });

  expect(runtimeStatus.phase).toBe(LIVE_INPUT_PHASES.listening);
  expect(runtimeStatus.liveInputDeviceKind).toBe("system");
  expect(runtimeStatus.liveInputKind).toBe("system");
  expect(runtimeStatus.calibrationActive).toBe(false);
  expect(runtimeStatus.gateOpen).toBe(true);
  expect(runtimeStatus.sourceBoundaryState).toBe("live");
});

test("treats line feed live boundary as listening when source energy is zero", () => {
  const runtimeStatus = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: true,
      liveInputKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
      selectedLiveInputDeviceLabel: "BlackHole 2ch",
    }),
    featureFrame: createLineFeedFeatureFrame({
      sourceEnergy: 0,
      metrics: {
        avgAmplitude: 0,
        analyserRms: 0,
        fftPeakAmplitude: 0,
        timeDomainPeakAmplitude: 0.002,
        spectralEffectiveBinCount: 0,
      },
      transport: {
        lineFeedProgramActive: true,
      },
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });

  expect(runtimeStatus.phase).toBe(LIVE_INPUT_PHASES.listening);
  expect(runtimeStatus.gateOpen).toBe(true);
  expect(runtimeStatus.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.ok);
  expect(runtimeStatus.sourceBoundaryState).toBe("live");
});

test("treats active line feed with muted source evidence as silent", () => {
  const runtimeStatus = buildLiveInputRuntimeStatus({
    status: createStatus({
      isLiveInputActive: true,
      liveInputKind: "system",
      resolvedLiveInputAnalysisClass: "line-feed",
      selectedLiveInputDeviceLabel: "BlackHole 2ch",
    }),
    featureFrame: createLineFeedFeatureFrame({
      sourceBoundaryState: "muted",
      currentSourceEvidence: false,
      sourceEnergy: 0,
    }),
    liveInputUiState: LIVE_INPUT_UI_STATES.active,
  });

  expect(runtimeStatus.phase).toBe(LIVE_INPUT_PHASES.weakSignal);
  expect(runtimeStatus.gateOpen).toBe(false);
  expect(runtimeStatus.hardSilence).toBe(true);
  expect(runtimeStatus.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.silent);
  expect(runtimeStatus.sourceBoundaryState).toBe("muted");
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

  expect(runtimeStatus.phase).toBe(LIVE_INPUT_PHASES.error);
  expect(runtimeStatus.calibrationInvalid).toBe(true);
  expect(runtimeStatus.errorCode).toBe(
    LIVE_INPUT_ERROR_CODES.calibrationInvalid,
  );
  expect(runtimeStatus.signalState).toBe(LIVE_INPUT_SIGNAL_STATES.clipped);
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
