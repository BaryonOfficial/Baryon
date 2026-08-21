import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AUDIO_SOURCE_KINDS,
  getDefaultAudioSession,
} from "@baryon/engine/audio";
import {
  deserializeControlSettings,
  isDefaultControlSettingValue,
  normalizeControlSettingValue,
  serializeControlSettings,
} from "@baryon/engine/controls/persistence";
import { CONTROL_DEFINITIONS } from "@baryon/engine/controls/schema";
import {
  DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT,
  DEFAULT_LIVE_INPUT_ANALYSIS_CLASS,
  LIVE_INPUT_ANALYSIS_CLASSES,
  normalizeLiveInputAcousticIntent,
  normalizeLiveInputAnalysisClass,
  normalizeLiveInputDeviceKind,
  normalizeResolvedLiveInputAnalysisClass,
  normalizeLiveInputAnalysisOverrides,
  resolveLiveInputAnalysisClass,
} from "@baryon/engine/audio/liveInputAnalysis";
import { AudioContext, AudioSceneContext } from "./AudioContext";
import {
  LIVE_INPUT_ERROR_CODES,
  LIVE_INPUT_PHASES,
  LIVE_INPUT_UI_STATES,
  buildLiveInputRuntimeStatus,
  createLiveInputRuntimeStatus,
  mapLiveInputStartError,
} from "./liveInputRuntimeStatus.js";
import { useAudioLogic } from "../components/hooks/useAudioLogic";
import {
  getLiveInputDeviceKind,
  getLiveInputDeviceKindById,
  getDeviceKindOverride,
  saveLiveInputDeviceKindOverride,
  clearDeviceOverride,
} from "../components/controls/deviceClassification.js";
import {
  SETTINGS_KEY,
  readStoredJson,
  writeStoredJson,
} from "../components/hooks/baryonControlsState.js";
import {
  publishAudioTransportClock,
  resetAudioTransportClock,
} from "./audioTransportClock.js";
import { subscribeControlsChanged } from "../controls/controlsEvents.js";

const DEFAULT_FILE_NAME = "Upload Audio";
const PRELOADED_DEMO_AUDIO = Object.freeze({
  name: "baryon-demo.mp3",
  webUrl: "/audio/baryon-demo.mp3",
});
/**
 * @typedef {Readonly<{
 *   durationSeconds: number,
 *   canSeek: boolean,
 * }>} TransportSeekState
 */
/** @type {TransportSeekState} */
const DEFAULT_TRANSPORT_SEEK_STATE = Object.freeze({
  durationSeconds: 0,
  canSeek: false,
});
const PREVIOUS_TRACK_ZERO_THRESHOLD_SECONDS = 0.05;
const RECENT_UPLOAD_LIMIT = 4;
const LIVE_INPUT_ANALYSIS_OVERRIDES_KEY = "liveInputAnalysisOverrides";
const LIVE_INPUT_ACOUSTIC_INTENT_KEY = "liveInputAcousticIntent";
const LIVE_INPUT_PERMISSION_STATES = Object.freeze({
  unknown: "unknown",
  requesting: "requesting",
  granted: "granted",
  denied: "denied",
  unsupported: "unsupported",
});

/**
 * @typedef {"unknown" | "requesting" | "granted" | "denied" | "unsupported"} LiveInputPermissionState
 */

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getRecentUploadId(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createLocalFileEntry(file) {
  return {
    id: getRecentUploadId(file),
    file,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
}

function clampTransportTime(value, durationSeconds) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue < 0) {
    return 0;
  }
  if (durationSeconds > 0) {
    return Math.min(nextValue, durationSeconds);
  }
  return nextValue;
}

/** @returns {TransportSeekState} */
function createTransportSeekState(transportState) {
  return {
    durationSeconds: Number(transportState?.durationSeconds) || 0,
    canSeek: transportState?.canSeek === true,
  };
}

function loadLiveInputAnalysisOverrides(storage) {
  return normalizeLiveInputAnalysisOverrides(
    readStoredJson(storage, SETTINGS_KEY)?.[LIVE_INPUT_ANALYSIS_OVERRIDES_KEY],
  );
}

function persistLiveInputAnalysisOverrides(storage, overrides) {
  const currentSettings = readStoredJson(storage, SETTINGS_KEY) ?? {};
  const savedControlSettings = deserializeControlSettings(
    currentSettings,
    CONTROL_DEFINITIONS,
  );
  writeStoredJson(storage, SETTINGS_KEY, {
    ...retainAudioSettingsCompanions(currentSettings),
    [LIVE_INPUT_ANALYSIS_OVERRIDES_KEY]:
      normalizeLiveInputAnalysisOverrides(overrides),
    ...serializeControlSettings(
      savedControlSettings.controls,
      CONTROL_DEFINITIONS,
      { explicitKeys: savedControlSettings.explicitKeys },
    ),
  });
}

function retainAudioSettingsCompanions(currentSettings) {
  if (
    currentSettings == null ||
    typeof currentSettings !== "object" ||
    Array.isArray(currentSettings) ||
    !Object.prototype.hasOwnProperty.call(
      currentSettings,
      LIVE_INPUT_ANALYSIS_OVERRIDES_KEY,
    )
  ) {
    return {};
  }

  return {
    [LIVE_INPUT_ANALYSIS_OVERRIDES_KEY]: normalizeLiveInputAnalysisOverrides(
      currentSettings[LIVE_INPUT_ANALYSIS_OVERRIDES_KEY],
    ),
  };
}

function loadLiveInputAcousticIntent(storage) {
  const currentSettings = readStoredJson(storage, SETTINGS_KEY);
  const savedControlSettings = deserializeControlSettings(
    currentSettings,
    CONTROL_DEFINITIONS,
  );
  if (
    Object.prototype.hasOwnProperty.call(
      savedControlSettings.controls,
      LIVE_INPUT_ACOUSTIC_INTENT_KEY,
    )
  ) {
    return normalizeLiveInputAcousticIntent(
      savedControlSettings.controls[LIVE_INPUT_ACOUSTIC_INTENT_KEY],
    );
  }

  return normalizeLiveInputAcousticIntent(
    currentSettings?.[LIVE_INPUT_ACOUSTIC_INTENT_KEY],
  );
}

function persistLiveInputAcousticIntent(storage, acousticIntent) {
  const currentSettings = readStoredJson(storage, SETTINGS_KEY) ?? {};
  const savedControlSettings = deserializeControlSettings(
    currentSettings,
    CONTROL_DEFINITIONS,
  );
  const explicitKeys = new Set(savedControlSettings.explicitKeys);
  const normalizedAcousticIntent = normalizeControlSettingValue(
    LIVE_INPUT_ACOUSTIC_INTENT_KEY,
    acousticIntent,
    CONTROL_DEFINITIONS,
  );
  if (
    isDefaultControlSettingValue(
      LIVE_INPUT_ACOUSTIC_INTENT_KEY,
      normalizedAcousticIntent,
      CONTROL_DEFINITIONS,
    )
  ) {
    explicitKeys.delete(LIVE_INPUT_ACOUSTIC_INTENT_KEY);
  } else {
    explicitKeys.add(LIVE_INPUT_ACOUSTIC_INTENT_KEY);
  }

  writeStoredJson(storage, SETTINGS_KEY, {
    ...retainAudioSettingsCompanions(currentSettings),
    ...serializeControlSettings(
      {
        ...savedControlSettings.controls,
        [LIVE_INPUT_ACOUSTIC_INTENT_KEY]: normalizedAcousticIntent,
      },
      CONTROL_DEFINITIONS,
      { explicitKeys },
    ),
  });
}

function normalizeProviderLiveInputUiState(value) {
  return value === LIVE_INPUT_UI_STATES.starting ||
    value === LIVE_INPUT_UI_STATES.active ||
    value === LIVE_INPUT_UI_STATES.stopping ||
    value === LIVE_INPUT_UI_STATES.error
    ? value
    : LIVE_INPUT_UI_STATES.idle;
}

function normalizeProviderLiveInputErrorCode(value) {
  return value === LIVE_INPUT_ERROR_CODES.permissionDenied ||
    value === LIVE_INPUT_ERROR_CODES.deviceMissing ||
    value === LIVE_INPUT_ERROR_CODES.deviceUnavailable ||
    value === LIVE_INPUT_ERROR_CODES.deviceDisconnected ||
    value === LIVE_INPUT_ERROR_CODES.startFailed ||
    value === LIVE_INPUT_ERROR_CODES.calibrationInvalid
    ? value
    : LIVE_INPUT_ERROR_CODES.none;
}

function isSteadyFrameDerivedLiveInputPhase(phase) {
  return (
    phase === LIVE_INPUT_PHASES.calibrating ||
    phase === LIVE_INPUT_PHASES.listening ||
    phase === LIVE_INPUT_PHASES.weakSignal
  );
}

function shouldPreserveFrameDerivedLiveInputRuntimeStatus({
  previousRuntimeStatus,
  nextRuntimeStatus,
  liveInputUiState,
  liveInputErrorCode,
}) {
  if (
    normalizeProviderLiveInputUiState(liveInputUiState) !==
    LIVE_INPUT_UI_STATES.active
  ) {
    return false;
  }
  if (
    normalizeProviderLiveInputErrorCode(liveInputErrorCode) !==
    LIVE_INPUT_ERROR_CODES.none
  ) {
    return false;
  }

  const previousStatus = createLiveInputRuntimeStatus(previousRuntimeStatus);
  const nextStatus = createLiveInputRuntimeStatus(nextRuntimeStatus);
  return (
    previousStatus.active === true &&
    nextStatus.active === true &&
    previousStatus.errorCode === LIVE_INPUT_ERROR_CODES.none &&
    nextStatus.errorCode === LIVE_INPUT_ERROR_CODES.none &&
    previousStatus.resolvedAnalysisClass === nextStatus.resolvedAnalysisClass &&
    previousStatus.liveInputDeviceKind === nextStatus.liveInputDeviceKind &&
    nextStatus.sourceBoundaryState === "unknown" &&
    isSteadyFrameDerivedLiveInputPhase(previousStatus.phase)
  );
}

function buildProviderLiveInputRuntimeStatus({
  status,
  liveInputUiState,
  liveInputErrorCode,
  previousRuntimeStatus = null,
}) {
  const nextRuntimeStatus = buildLiveInputRuntimeStatus({
    status,
    liveInputUiState,
    liveInputErrorCode,
  });

  if (
    !shouldPreserveFrameDerivedLiveInputRuntimeStatus({
      previousRuntimeStatus,
      nextRuntimeStatus,
      liveInputUiState,
      liveInputErrorCode,
    })
  ) {
    return nextRuntimeStatus;
  }

  const previousStatus = createLiveInputRuntimeStatus(previousRuntimeStatus);
  return createLiveInputRuntimeStatus({
    ...nextRuntimeStatus,
    phase: previousStatus.phase,
    calibrationActive: previousStatus.calibrationActive,
    gateOpen: previousStatus.gateOpen,
    hardSilence: previousStatus.hardSilence,
    calibrationInvalid: previousStatus.calibrationInvalid,
    calibrationInvalidReason: previousStatus.calibrationInvalidReason,
    sourceBoundaryState: previousStatus.sourceBoundaryState,
    signalState: previousStatus.signalState,
  });
}

function normalizeAudioPlatform(value) {
  return value === "desktop" ? "desktop" : "web";
}

function isLiveInputPermissionUnsupported(error) {
  const candidate =
    /** @type {{ name?: unknown, message?: unknown } | null | undefined } */ (
      error
    );
  const name = String(candidate?.name ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();
  return (
    name === "SecurityError" ||
    name === "NotSupportedError" ||
    message.includes("secure context") ||
    message.includes("https")
  );
}

function normalizeAudioInputDeviceLabel(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getPreferredAudioInputDevice(
  audioInputs,
  { preferredDeviceId = null, preferredDeviceLabel = "" } = {},
) {
  if (preferredDeviceId) {
    const matchingId = audioInputs.find(
      (device) => device.deviceId === preferredDeviceId,
    );
    if (matchingId) {
      return matchingId;
    }
  }

  const preferredLabelKey =
    normalizeAudioInputDeviceLabel(preferredDeviceLabel);
  if (preferredLabelKey) {
    const matchingLabel = audioInputs.find(
      (device) =>
        normalizeAudioInputDeviceLabel(device?.label) === preferredLabelKey,
    );
    if (matchingLabel) {
      return matchingLabel;
    }
  }

  return audioInputs[0] ?? null;
}

function getAudioInputDeviceLabelById(audioInputs, deviceId) {
  if (!deviceId) {
    return "";
  }
  return (
    audioInputs
      .find((device) => device.deviceId === deviceId)
      ?.label?.trim?.() ?? ""
  );
}

export function AudioProvider({
  children,
  platform = "web",
  demoAudioFileLoader = null,
}) {
  const audioPlatform = normalizeAudioPlatform(platform);
  const isWebPlatform = audioPlatform === "web";
  const storage = getBrowserStorage();
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME);
  const [recentUploads, setRecentUploads] = useState([]);
  const [currentLoadedLocalFile, setCurrentLoadedLocalFile] = useState(null);
  const [localFileQueueSnapshot, setLocalFileQueueSnapshot] = useState(() => ({
    entries: [],
    activeIndex: -1,
  }));
  const localFileQueue = localFileQueueSnapshot.entries;
  const activeLocalFileQueueIndex = localFileQueueSnapshot.activeIndex;
  const [isLocalFileQueueAutoplayEnabled, setIsLocalFileQueueAutoplayEnabled] =
    useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiveInputActive, setIsLiveInputActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [, setDeviceClassificationVersion] = useState(0);
  const [liveInputRuntimeStatus, setLiveInputRuntimeStatus] = useState(() =>
    createLiveInputRuntimeStatus(),
  );
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [sourceSession, setSourceSession] = useState(
    () => getDefaultAudioSession().getStatus().sourceSession,
  );
  const [selectedSystemDevice, setSelectedSystemDevice] = useState(null);
  const [liveInputPermissionState, setLiveInputPermissionState] = useState(
    /** @returns {LiveInputPermissionState} */ () =>
      isWebPlatform
        ? LIVE_INPUT_PERMISSION_STATES.unknown
        : LIVE_INPUT_PERMISSION_STATES.granted,
  );
  const [liveInputDeviceKind, setLiveInputDeviceKind] = useState(null);
  const liveInputKind = liveInputDeviceKind;
  const [liveInputUiState, setLiveInputUiState] = useState(
    /** @type {import("./liveInputRuntimeStatus.js").LiveInputUiState} */ (
      LIVE_INPUT_UI_STATES.idle
    ),
  );
  const [liveInputErrorCode, setLiveInputErrorCode] = useState(
    /** @type {import("./liveInputRuntimeStatus.js").LiveInputErrorCode} */ (
      LIVE_INPUT_ERROR_CODES.none
    ),
  );
  const [liveInputAnalysisClass, setLiveInputAnalysisClass] = useState(
    /** @type {import("@baryon/engine/audio/liveInputAnalysis").LiveInputAnalysisClass} */ (
      DEFAULT_LIVE_INPUT_ANALYSIS_CLASS
    ),
  );
  const [liveInputAcousticIntent, setLiveInputAcousticIntentState] = useState(
    () => loadLiveInputAcousticIntent(storage),
  );
  const [resolvedLiveInputAnalysisClass, setResolvedLiveInputAnalysisClass] =
    useState(null);
  const [liveInputAnalysisOverrides, setLiveInputAnalysisOverrides] = useState(
    () => loadLiveInputAnalysisOverrides(storage),
  );
  const [transportSeekState, setTransportSeekState] = useState(
    DEFAULT_TRANSPORT_SEEK_STATE,
  );
  const [scrubPreviewSeconds, setScrubPreviewSeconds] = useState(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const transportFrameRef = useRef(0);
  const resumeAfterScrubRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const hasAutoLoadedDemoAudioRef = useRef(false);
  const demoAudioLoadPromiseRef = useRef(null);
  const demoFileSessionIdRef = useRef(null);
  const demoPreloadGenerationRef = useRef(0);
  const liveInputStartRequestIdRef = useRef(0);
  const localFileQueueStateRef = useRef({
    entries: [],
    activeIndex: -1,
  });
  const queueAdvanceInFlightRef = useRef(false);
  const liveInputUiStateRef = useRef(
    /** @type {import("./liveInputRuntimeStatus.js").LiveInputUiState} */ (
      LIVE_INPUT_UI_STATES.idle
    ),
  );
  const liveInputErrorCodeRef = useRef(
    /** @type {import("./liveInputRuntimeStatus.js").LiveInputErrorCode} */ (
      LIVE_INPUT_ERROR_CODES.none
    ),
  );

  const registerRecentUpload = useCallback((file) => {
    setRecentUploads((currentUploads) => {
      const nextUpload = {
        ...createLocalFileEntry(file),
      };
      return [
        nextUpload,
        ...currentUploads.filter((upload) => upload.id !== nextUpload.id),
      ].slice(0, RECENT_UPLOAD_LIMIT);
    });
  }, []);

  const {
    handleRecentFileSelect: handleLocalRecentFileSelect,
    handlePlayPause: handleLocalPlayPause,
    handleStop: handleLocalStop,
    handleVolumeChange: handleLocalVolumeChange,
    handleMuteToggle: handleLocalMuteToggle,
    refreshAudioInputs,
  } = useAudioLogic({
    setFileName,
    resetFileName: () => setFileName(DEFAULT_FILE_NAME),
    registerRecentFile: registerRecentUpload,
    setIsAudioLoaded,
    setIsPlaying,
    setIsLiveInputActive,
    setLiveInputDeviceKind,
    setVolume,
    setIsMuted,
    setAudioDevices,
    setSelectedDevice,
    isAudioLoaded,
    isLiveInputActive,
    selectedDevice,
  });

  useEffect(() => {
    if (!isWebPlatform) {
      return;
    }
    if (liveInputPermissionState !== LIVE_INPUT_PERMISSION_STATES.unknown) {
      return;
    }

    const hasNamedAudioInput = audioDevices.some((device) =>
      Boolean(device?.label?.trim?.()),
    );
    if (hasNamedAudioInput) {
      setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.granted);
    }
  }, [audioDevices, isWebPlatform, liveInputPermissionState]);

  const clearScrubState = useCallback(() => {
    isScrubbingRef.current = false;
    resumeAfterScrubRef.current = false;
    setIsScrubbing(false);
    setScrubPreviewSeconds(null);
  }, []);

  const commitLocalFileQueue = useCallback(
    (
      nextEntries,
      nextActiveIndex = localFileQueueStateRef.current.activeIndex,
    ) => {
      const nextState = {
        entries: nextEntries,
        activeIndex: nextActiveIndex,
      };
      localFileQueueStateRef.current = nextState;
      setLocalFileQueueSnapshot(nextState);
    },
    [],
  );

  const clearLocalFileQueue = useCallback(() => {
    commitLocalFileQueue([], -1);
  }, [commitLocalFileQueue]);

  const appendLocalFilesToQueue = useCallback(
    (files) => {
      const entries = files.filter(Boolean).map(createLocalFileEntry);
      if (entries.length === 0) {
        return;
      }

      for (const entry of entries) {
        registerRecentUpload(entry.file);
      }

      const nextQueue = [...localFileQueueStateRef.current.entries, ...entries];
      commitLocalFileQueue(nextQueue);
    },
    [commitLocalFileQueue, registerRecentUpload],
  );

  const syncTransportState = useCallback((options = {}) => {
    const { includeSeekState = true } = options;
    const nextTransportState = getDefaultAudioSession().getTransportState();
    publishAudioTransportClock(nextTransportState);
    if (includeSeekState) {
      setTransportSeekState(createTransportSeekState(nextTransportState));
    }
    return nextTransportState;
  }, []);

  const applyLiveInputUiState = useCallback(
    /**
     * @param {import("./liveInputRuntimeStatus.js").LiveInputUiState | unknown} nextUiState
     * @param {import("./liveInputRuntimeStatus.js").LiveInputErrorCode | unknown} [nextErrorCode]
     * @param {any} [statusOverride]
     */
    (
      nextUiState,
      nextErrorCode = LIVE_INPUT_ERROR_CODES.none,
      statusOverride = undefined,
    ) => {
      /** @type {import("./liveInputRuntimeStatus.js").LiveInputUiState} */
      const normalizedUiState = normalizeProviderLiveInputUiState(nextUiState);
      /** @type {import("./liveInputRuntimeStatus.js").LiveInputErrorCode} */
      const normalizedErrorCode =
        normalizeProviderLiveInputErrorCode(nextErrorCode);
      liveInputUiStateRef.current = normalizedUiState;
      liveInputErrorCodeRef.current = normalizedErrorCode;
      setLiveInputUiState(normalizedUiState);
      setLiveInputErrorCode(normalizedErrorCode);
      const status = statusOverride ?? getDefaultAudioSession().getStatus();
      setLiveInputRuntimeStatus((currentStatus) =>
        buildProviderLiveInputRuntimeStatus({
          status,
          liveInputUiState: normalizedUiState,
          liveInputErrorCode: normalizedErrorCode,
          previousRuntimeStatus: currentStatus,
        }),
      );
    },
    [],
  );

  const syncSessionStatus = useCallback(() => {
    const audioSession = getDefaultAudioSession();
    const status = audioSession.getStatus();
    const nextTransportState = audioSession.getTransportState();
    setSourceSession(status.sourceSession);
    setIsAudioLoaded(status.isAudioLoaded);
    setIsPlaying(status.isPlaying);
    setIsLiveInputActive(status.isLiveInputActive);
    setLiveInputDeviceKind(
      status.liveInputDeviceKind ?? status.liveInputKind ?? null,
    );
    setLiveInputAnalysisClass(
      normalizeLiveInputAnalysisClass(status.liveInputAnalysisClass),
    );
    setLiveInputAcousticIntentState(
      normalizeLiveInputAcousticIntent(status.liveInputAcousticIntent),
    );
    setResolvedLiveInputAnalysisClass(
      status.resolvedLiveInputAnalysisClass
        ? normalizeResolvedLiveInputAnalysisClass(
            status.resolvedLiveInputAnalysisClass,
          )
        : null,
    );
    /** @type {import("./liveInputRuntimeStatus.js").LiveInputUiState} */
    const nextUiState =
      liveInputUiStateRef.current === LIVE_INPUT_UI_STATES.starting ||
      liveInputUiStateRef.current === LIVE_INPUT_UI_STATES.stopping ||
      liveInputUiStateRef.current === LIVE_INPUT_UI_STATES.error
        ? liveInputUiStateRef.current
        : status.isLiveInputActive
          ? LIVE_INPUT_UI_STATES.active
          : LIVE_INPUT_UI_STATES.idle;
    liveInputUiStateRef.current = nextUiState;
    setLiveInputUiState(nextUiState);
    setVolume(status.volume ?? 1);
    setIsMuted(status.muted ?? false);
    setLiveInputRuntimeStatus((currentStatus) =>
      buildProviderLiveInputRuntimeStatus({
        status,
        liveInputUiState: nextUiState,
        liveInputErrorCode: liveInputErrorCodeRef.current,
        previousRuntimeStatus: currentStatus,
      }),
    );
    publishAudioTransportClock(nextTransportState);
    setTransportSeekState(createTransportSeekState(nextTransportState));
    if (!nextTransportState.canSeek) {
      clearScrubState();
    }
    return status;
  }, [clearScrubState]);

  const selectedLocalLiveDeviceId =
    selectedSystemDevice ?? selectedDevice ?? null;
  const runtimeSelectedLiveDeviceId =
    liveInputRuntimeStatus.selectedDeviceId ?? null;
  const runtimeSelectedLiveDeviceLabel =
    liveInputRuntimeStatus.selectedDeviceLabel ?? "";
  const runtimeSelectedLiveInputDeviceKind =
    liveInputRuntimeStatus.liveInputDeviceKind != null ||
    liveInputRuntimeStatus.liveInputKind != null
      ? normalizeLiveInputDeviceKind(
          liveInputRuntimeStatus.liveInputDeviceKind ??
            liveInputRuntimeStatus.liveInputKind,
        )
      : null;
  const selectedLiveDeviceId =
    selectedLocalLiveDeviceId ?? runtimeSelectedLiveDeviceId ?? null;
  const selectedLocalLiveDevice =
    audioDevices.find((device) => device.deviceId === selectedLiveDeviceId) ??
    null;
  const selectedRuntimeLiveDevice =
    selectedLiveDeviceId != null &&
    selectedLiveDeviceId === runtimeSelectedLiveDeviceId
      ? {
          deviceId: selectedLiveDeviceId,
          label: runtimeSelectedLiveDeviceLabel,
        }
      : null;
  const selectedLiveDevice =
    selectedLocalLiveDevice ?? selectedRuntimeLiveDevice ?? null;
  const selectedLiveInputDeviceKindOverride =
    selectedLiveDeviceId != null
      ? getDeviceKindOverride(selectedLiveDeviceId)
      : null;
  const selectedLiveInputDeviceKind =
    selectedLiveInputDeviceKindOverride ??
    (selectedLocalLiveDevice
      ? getLiveInputDeviceKind(selectedLocalLiveDevice)
      : (runtimeSelectedLiveInputDeviceKind ??
        (selectedRuntimeLiveDevice
          ? getLiveInputDeviceKind(selectedRuntimeLiveDevice)
          : getLiveInputDeviceKindById(audioDevices, selectedLiveDeviceId))));
  const selectedLiveInputAnalysisOverride =
    selectedLiveDeviceId != null
      ? normalizeLiveInputAnalysisClass(
          liveInputAnalysisOverrides[selectedLiveDeviceId],
        )
      : DEFAULT_LIVE_INPUT_ANALYSIS_CLASS;
  const selectedResolvedLiveInputAnalysisClass = resolveLiveInputAnalysisClass({
    liveInputDeviceKind: selectedLiveInputDeviceKind,
    selectedDeviceId: selectedLiveDeviceId,
    selectedDeviceLabel: selectedLiveDevice?.label ?? "",
    analysisClass: liveInputAnalysisClass,
    overrides: liveInputAnalysisOverrides,
  });

  const refreshPreferredLiveInputDeviceId = useCallback(
    async ({
      preferredDeviceId = selectedSystemDevice ?? selectedDevice,
      preferredDeviceLabel = getAudioInputDeviceLabelById(
        audioDevices,
        preferredDeviceId,
      ),
    } = {}) => {
      const audioInputs = await refreshAudioInputs();
      const nextDevice = getPreferredAudioInputDevice(audioInputs, {
        preferredDeviceId,
        preferredDeviceLabel,
      });
      const nextDeviceId = nextDevice?.deviceId ?? null;
      setSelectedSystemDevice(nextDeviceId);
      return nextDeviceId;
    },
    [audioDevices, refreshAudioInputs, selectedDevice, selectedSystemDevice],
  );

  const requestLiveInputPermission = useCallback(async () => {
    if (!isWebPlatform) {
      return true;
    }

    if (typeof window === "undefined" || !window.isSecureContext) {
      setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.unsupported);
      return false;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia || !mediaDevices.enumerateDevices) {
      setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.unsupported);
      return false;
    }

    setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.requesting);
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      await refreshPreferredLiveInputDeviceId({
        preferredDeviceId: selectedSystemDevice,
      });

      setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.granted);
      return true;
    } catch (error) {
      if (isLiveInputPermissionUnsupported(error)) {
        setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.unsupported);
        return false;
      }

      if (
        mapLiveInputStartError(error) ===
        LIVE_INPUT_ERROR_CODES.permissionDenied
      ) {
        setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.denied);
        return false;
      }

      await refreshPreferredLiveInputDeviceId({
        preferredDeviceId: selectedSystemDevice,
      });
      setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.granted);
      return true;
    }
  }, [isWebPlatform, refreshPreferredLiveInputDeviceId, selectedSystemDevice]);

  const startLiveInputSession = useCallback(
    async ({
      deviceId = selectedLiveDeviceId,
      deviceLabel = getAudioInputDeviceLabelById(audioDevices, deviceId),
      liveInputKind: nextLiveInputDeviceKind = selectedLiveInputDeviceKind,
    } = {}) => {
      const audioSession = getDefaultAudioSession();
      const requestId = ++liveInputStartRequestIdRef.current;
      let resolvedDeviceId = deviceId;

      if (isWebPlatform) {
        if (
          liveInputPermissionState !== LIVE_INPUT_PERMISSION_STATES.granted &&
          !(await requestLiveInputPermission())
        ) {
          if (requestId !== liveInputStartRequestIdRef.current) {
            return false;
          }
          applyLiveInputUiState(
            LIVE_INPUT_UI_STATES.error,
            LIVE_INPUT_ERROR_CODES.permissionDenied,
          );
          return false;
        }

        // Re-enumerate immediately before start so hardware interfaces use the
        // browser's post-permission device list instead of any stale preflight
        // entry the user may have selected earlier.
        resolvedDeviceId = await refreshPreferredLiveInputDeviceId({
          preferredDeviceId: deviceId,
          preferredDeviceLabel: deviceLabel,
        });
        if (requestId !== liveInputStartRequestIdRef.current) {
          return false;
        }
      }

      if (!resolvedDeviceId) {
        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.error,
          LIVE_INPUT_ERROR_CODES.deviceMissing,
        );
        return false;
      }

      applyLiveInputUiState(LIVE_INPUT_UI_STATES.starting);
      try {
        const started = await audioSession.startLiveInputStream(
          resolvedDeviceId,
          nextLiveInputDeviceKind,
          deviceLabel,
        );
        if (
          requestId !== liveInputStartRequestIdRef.current ||
          started === false
        ) {
          return false;
        }
        if (isWebPlatform) {
          setLiveInputPermissionState(LIVE_INPUT_PERMISSION_STATES.granted);
        }
        const status = syncSessionStatus();
        if (!status.isLiveInputActive) {
          applyLiveInputUiState(
            LIVE_INPUT_UI_STATES.error,
            LIVE_INPUT_ERROR_CODES.startFailed,
            status,
          );
          return false;
        }

        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.active,
          LIVE_INPUT_ERROR_CODES.none,
          status,
        );
        return true;
      } catch (error) {
        if (requestId !== liveInputStartRequestIdRef.current) {
          return false;
        }
        console.error("Error starting live input:", error);
        const status = syncSessionStatus();
        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.error,
          mapLiveInputStartError(error),
          status,
        );
        return false;
      }
    },
    [
      applyLiveInputUiState,
      audioDevices,
      isWebPlatform,
      liveInputPermissionState,
      refreshPreferredLiveInputDeviceId,
      requestLiveInputPermission,
      selectedLiveDeviceId,
      selectedLiveInputDeviceKind,
      syncSessionStatus,
    ],
  );

  const stopLiveInputSession = useCallback(
    /**
     * @param {{
     *   nextUiState?: import("./liveInputRuntimeStatus.js").LiveInputUiState,
     *   nextErrorCode?: import("./liveInputRuntimeStatus.js").LiveInputErrorCode,
     * }=} options
     */
    ({
      nextUiState = LIVE_INPUT_UI_STATES.idle,
      nextErrorCode = LIVE_INPUT_ERROR_CODES.none,
    } = {}) => {
      const audioSession = getDefaultAudioSession();
      liveInputStartRequestIdRef.current += 1;
      applyLiveInputUiState(LIVE_INPUT_UI_STATES.stopping);
      audioSession.stopLiveInputStream();
      const status = syncSessionStatus();
      applyLiveInputUiState(nextUiState, nextErrorCode, status);
      return status;
    },
    [applyLiveInputUiState, syncSessionStatus],
  );

  const handleSelectedSystemDeviceChange = useCallback(
    async (nextDeviceId) => {
      const normalizedDeviceId = nextDeviceId || null;
      if (normalizedDeviceId === selectedSystemDevice) {
        return;
      }

      setSelectedSystemDevice(normalizedDeviceId);
      applyLiveInputUiState(
        liveInputUiStateRef.current === LIVE_INPUT_UI_STATES.error
          ? LIVE_INPUT_UI_STATES.idle
          : liveInputUiStateRef.current,
        LIVE_INPUT_ERROR_CODES.none,
      );

      if (!normalizedDeviceId) {
        if (isLiveInputActive) {
          stopLiveInputSession({
            nextUiState: LIVE_INPUT_UI_STATES.error,
            nextErrorCode: LIVE_INPUT_ERROR_CODES.deviceMissing,
          });
        }
        return;
      }

      if (!isLiveInputActive) {
        return;
      }

      stopLiveInputSession();
      await startLiveInputSession({
        deviceId: normalizedDeviceId,
        deviceLabel: getAudioInputDeviceLabelById(
          audioDevices,
          normalizedDeviceId,
        ),
        liveInputKind: getLiveInputDeviceKindById(
          audioDevices,
          normalizedDeviceId,
        ),
      });
    },
    [
      applyLiveInputUiState,
      audioDevices,
      isLiveInputActive,
      selectedSystemDevice,
      startLiveInputSession,
      stopLiveInputSession,
    ],
  );

  useEffect(() => {
    getDefaultAudioSession().setLiveInputAnalysisSettings({
      acousticIntent: liveInputAcousticIntent,
      overrides: liveInputAnalysisOverrides,
    });
  }, [liveInputAcousticIntent, liveInputAnalysisOverrides]);

  useEffect(() => {
    if (!selectedSystemDevice) {
      return;
    }

    const deviceStillAvailable = audioDevices.some(
      (device) => device.deviceId === selectedSystemDevice,
    );
    if (deviceStillAvailable) {
      return;
    }

    setSelectedSystemDevice(null);
    const nextErrorCode = isLiveInputActive
      ? LIVE_INPUT_ERROR_CODES.deviceDisconnected
      : LIVE_INPUT_ERROR_CODES.deviceMissing;
    if (isLiveInputActive) {
      getDefaultAudioSession().stopLiveInputStream();
      const status = syncSessionStatus();
      applyLiveInputUiState(LIVE_INPUT_UI_STATES.error, nextErrorCode, status);
      return;
    }

    if (sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
      applyLiveInputUiState(LIVE_INPUT_UI_STATES.error, nextErrorCode);
    }
  }, [
    applyLiveInputUiState,
    audioDevices,
    isLiveInputActive,
    sourceSession.kind,
    selectedSystemDevice,
    syncSessionStatus,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChanged = () => {
      syncSessionStatus();
    };

    return subscribeControlsChanged(handleControlsChanged);
  }, [syncSessionStatus]);

  useEffect(() => {
    if (isAudioLoaded && !isLiveInputActive) {
      syncTransportState();
      return;
    }

    clearScrubState();
    resetAudioTransportClock();
    setTransportSeekState(DEFAULT_TRANSPORT_SEEK_STATE);
  }, [clearScrubState, isAudioLoaded, isLiveInputActive, syncTransportState]);

  useEffect(() => {
    if (!isAudioLoaded || !transportSeekState.canSeek || isScrubbing) {
      if (transportFrameRef.current) {
        window.cancelAnimationFrame(transportFrameRef.current);
        transportFrameRef.current = 0;
      }
      return undefined;
    }

    const tick = () => {
      syncTransportState({ includeSeekState: false });
      transportFrameRef.current = window.requestAnimationFrame(tick);
    };

    transportFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (transportFrameRef.current) {
        window.cancelAnimationFrame(transportFrameRef.current);
        transportFrameRef.current = 0;
      }
    };
  }, [
    isAudioLoaded,
    isScrubbing,
    syncTransportState,
    transportSeekState.canSeek,
  ]);

  const loadImmediateLocalFile = useCallback(
    async (file, { seekTimeSeconds = null } = {}) => {
      if (!file) {
        return false;
      }

      const loaded = await handleLocalRecentFileSelect(file);
      if (!loaded) {
        return false;
      }

      if (seekTimeSeconds != null) {
        await getDefaultAudioSession().seekTo(seekTimeSeconds);
        syncSessionStatus();
        syncTransportState();
      }

      setCurrentLoadedLocalFile(createLocalFileEntry(file));
      setShowDeviceMenu(false);
      syncSessionStatus();
      return true;
    },
    [handleLocalRecentFileSelect, syncSessionStatus, syncTransportState],
  );

  const loadQueuedLocalFileAtIndex = useCallback(
    async (queueIndex, { autoPlay = false } = {}) => {
      const queueEntries = localFileQueueStateRef.current.entries;
      const queueEntry = queueEntries[queueIndex];
      if (!queueEntry?.file) {
        return false;
      }

      commitLocalFileQueue(queueEntries, queueIndex);
      const loaded = await loadImmediateLocalFile(queueEntry.file);
      if (!loaded) {
        return false;
      }

      const currentQueueState = localFileQueueStateRef.current;
      if (
        currentQueueState.activeIndex !== queueIndex ||
        currentQueueState.entries[queueIndex]?.file !== queueEntry.file
      ) {
        return false;
      }

      if (autoPlay) {
        const audioSession = getDefaultAudioSession();
        if (!audioSession.getStatus().isPlaying) {
          await audioSession.playPauseAudio();
        }
        syncSessionStatus();
        syncTransportState();
      }
      return true;
    },
    [
      commitLocalFileQueue,
      loadImmediateLocalFile,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const playNextLocalFile = useCallback(async () => {
    if (queueAdvanceInFlightRef.current) {
      return false;
    }

    const nextQueueIndex = localFileQueueStateRef.current.activeIndex + 1;
    if (!localFileQueueStateRef.current.entries[nextQueueIndex]?.file) {
      return false;
    }

    queueAdvanceInFlightRef.current = true;
    try {
      return await loadQueuedLocalFileAtIndex(nextQueueIndex, {
        autoPlay: true,
      });
    } finally {
      queueAdvanceInFlightRef.current = false;
    }
  }, [loadQueuedLocalFileAtIndex]);

  const toggleLocalFileQueueAutoplay = useCallback(() => {
    setIsLocalFileQueueAutoplayEnabled((isEnabled) => !isEnabled);
  }, []);

  const playLocalFileAtQueueIndex = useCallback(
    async (queueIndex) => {
      if (isLiveInputActive) {
        return false;
      }

      const queueState = localFileQueueStateRef.current;
      const queueEntry = queueState.entries[queueIndex];
      if (!queueEntry?.file) {
        return false;
      }

      const audioSession = getDefaultAudioSession();
      const status = audioSession.getStatus();
      const isCurrentLoadedFile =
        queueState.activeIndex === queueIndex &&
        currentLoadedLocalFile?.file === queueEntry.file &&
        status.isAudioLoaded;

      if (!isCurrentLoadedFile) {
        return loadQueuedLocalFileAtIndex(queueIndex, { autoPlay: true });
      }

      if (!status.isPlaying) {
        await audioSession.playPauseAudio();
      }
      setFileName(queueEntry.name);
      syncSessionStatus();
      syncTransportState();
      return true;
    },
    [
      currentLoadedLocalFile,
      isLiveInputActive,
      loadQueuedLocalFileAtIndex,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const loadImmediateAudioUrl = useCallback(
    async ({ sourceUrl, sourceName }) => {
      const audioSession = getDefaultAudioSession();
      if (isLiveInputActive) {
        audioSession.stopLiveInputStream();
      }

      const loaded = await audioSession.loadAudio(sourceUrl);
      if (loaded === false) {
        return null;
      }

      setFileName(sourceName);
      setCurrentLoadedLocalFile(null);
      setShowDeviceMenu(false);
      clearLocalFileQueue();
      syncSessionStatus();
      syncTransportState();
      return audioSession;
    },
    [
      clearLocalFileQueue,
      isLiveInputActive,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const loadProbeAudioFile = useCallback(
    async (source) => {
      if (!source) {
        return {
          ok: false,
          error: "Probe audio file is required.",
        };
      }

      clearScrubState();
      const selectedProbeFile =
        source?.useSelectedFile === true ? currentLoadedLocalFile?.file : null;
      const sourceUrl =
        typeof source?.fileUrl === "string" && source.fileUrl
          ? source.fileUrl
          : null;
      const sourceName =
        selectedProbeFile?.name ||
        (typeof source?.name === "string" && source.name
          ? source.name
          : "probe-audio.mp3");
      let loaded = false;
      if (source?.useSelectedFile === true) {
        if (!selectedProbeFile) {
          return {
            ok: false,
            error: "No selected local probe audio file is loaded.",
          };
        }
        loaded = await loadImmediateLocalFile(selectedProbeFile);
      } else if (sourceUrl) {
        try {
          loaded =
            (await loadImmediateAudioUrl({ sourceUrl, sourceName })) != null;
        } catch (error) {
          console.error("Error loading probe audio:", error);
          setIsAudioLoaded(false);
        }
      } else {
        loaded = await loadImmediateLocalFile(source);
      }

      if (!loaded) {
        return {
          ok: false,
          error: "Probe audio file failed to load.",
        };
      }

      const audioSession = getDefaultAudioSession();
      if (!audioSession.getStatus().isPlaying) {
        await audioSession.playPauseAudio();
      }
      const status = syncSessionStatus();
      syncTransportState();
      return {
        ok: true,
        fileName: sourceName,
        isAudioLoaded: status.isAudioLoaded,
        isPlaying: status.isPlaying,
      };
    },
    [
      clearScrubState,
      currentLoadedLocalFile,
      loadImmediateAudioUrl,
      loadImmediateLocalFile,
      setIsAudioLoaded,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const stopProbeAudio = useCallback(() => {
    clearScrubState();
    getDefaultAudioSession().stopAudio();
    const status = syncSessionStatus();
    syncTransportState();
    return {
      ok: true,
      isAudioLoaded: status.isAudioLoaded,
      isPlaying: status.isPlaying,
    };
  }, [clearScrubState, syncSessionStatus, syncTransportState]);

  const loadDemoAudioFile = useCallback(
    async ({ autoPlay = true, preloadGeneration = null } = {}) => {
      clearScrubState();
      clearLocalFileQueue();

      try {
        let audioSession = getDefaultAudioSession();
        const currentStatus = audioSession.getStatus();
        const currentDemoSourceIsLoaded =
          currentStatus.isAudioLoaded === true &&
          currentStatus.sourceSession.kind === AUDIO_SOURCE_KINDS.file &&
          demoFileSessionIdRef.current != null &&
          currentStatus.sourceSession.sessionId ===
            demoFileSessionIdRef.current;

        if (!currentDemoSourceIsLoaded) {
          if (!demoAudioLoadPromiseRef.current) {
            demoAudioLoadPromiseRef.current = (async () => {
              let loadedSession = null;
              if (typeof demoAudioFileLoader === "function") {
                const demoFile = await demoAudioFileLoader();
                if (!demoFile) {
                  throw new Error(
                    "Desktop demo audio bridge did not return a file.",
                  );
                }
                if (
                  preloadGeneration != null &&
                  preloadGeneration !== demoPreloadGenerationRef.current
                ) {
                  return null;
                }
                const loaded = await loadImmediateLocalFile(demoFile);
                if (!loaded) {
                  return null;
                }
                loadedSession = getDefaultAudioSession();
              } else if (isWebPlatform) {
                loadedSession = await loadImmediateAudioUrl({
                  sourceUrl: PRELOADED_DEMO_AUDIO.webUrl,
                  sourceName: PRELOADED_DEMO_AUDIO.name,
                });
              } else {
                throw new Error("Desktop demo audio loader is required.");
              }
              if (!loadedSession) {
                return null;
              }
              demoFileSessionIdRef.current =
                loadedSession.getStatus().sourceSession.sessionId;
              return loadedSession;
            })();
          }
          const loadPromise = demoAudioLoadPromiseRef.current;
          try {
            audioSession = await loadPromise;
          } finally {
            if (demoAudioLoadPromiseRef.current === loadPromise) {
              demoAudioLoadPromiseRef.current = null;
            }
          }
          if (!audioSession) {
            const status = syncSessionStatus();
            syncTransportState();
            return {
              ok: false,
              error: "Demo audio load was superseded.",
              isAudioLoaded: status.isAudioLoaded,
              isPlaying: status.isPlaying,
            };
          }
        } else {
          setFileName(PRELOADED_DEMO_AUDIO.name);
          setShowDeviceMenu(false);
        }

        if (autoPlay && !audioSession.getStatus().isPlaying) {
          await audioSession.playPauseAudio();
        }

        const status = syncSessionStatus();
        syncTransportState();
        return {
          ok: true,
          fileName: PRELOADED_DEMO_AUDIO.name,
          isAudioLoaded: status.isAudioLoaded,
          isPlaying: status.isPlaying,
        };
      } catch (error) {
        console.error("Error loading demo audio:", error);
        const status = syncSessionStatus();
        syncTransportState();
        return {
          ok: false,
          error: "Demo audio failed to load.",
          isAudioLoaded: status.isAudioLoaded,
          isPlaying: status.isPlaying,
        };
      }
    },
    [
      clearScrubState,
      clearLocalFileQueue,
      demoAudioFileLoader,
      isWebPlatform,
      loadImmediateAudioUrl,
      loadImmediateLocalFile,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  useEffect(() => {
    const canPreloadDemo =
      isWebPlatform || typeof demoAudioFileLoader === "function";
    if (!canPreloadDemo || hasAutoLoadedDemoAudioRef.current) {
      return;
    }

    hasAutoLoadedDemoAudioRef.current = true;
    void loadDemoAudioFile({
      autoPlay: false,
      preloadGeneration: demoPreloadGenerationRef.current,
    });
  }, [demoAudioFileLoader, isWebPlatform, loadDemoAudioFile]);

  useEffect(() => {
    const audioSession = getDefaultAudioSession();
    audioSession.setAudioEndedCallback(async () => {
      if (queueAdvanceInFlightRef.current) {
        return;
      }
      if (isLocalFileQueueAutoplayEnabled && (await playNextLocalFile())) {
        return;
      }

      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    return () => {
      audioSession.setAudioEndedCallback(null);
    };
  }, [isLocalFileQueueAutoplayEnabled, playNextLocalFile]);

  const handleFileChange = useCallback(
    async (event) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) {
        return;
      }

      clearScrubState();
      setShowDeviceMenu(false);
      const currentQueueState = localFileQueueStateRef.current;
      const hadActiveQueueFile =
        currentQueueState.activeIndex >= 0 &&
        Boolean(currentQueueState.entries[currentQueueState.activeIndex]?.file);
      appendLocalFilesToQueue(files);

      if (sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
        event.target.value = "";
        return;
      }

      if (!hadActiveQueueFile) {
        await loadQueuedLocalFileAtIndex(0);
      }
      event.target.value = "";
    },
    [
      appendLocalFilesToQueue,
      clearScrubState,
      loadQueuedLocalFileAtIndex,
      sourceSession.kind,
    ],
  );

  const handleRecentUploadSelect = useCallback(
    async (uploadId) => {
      const recentUpload = recentUploads.find(
        (upload) => upload.id === uploadId,
      );
      if (!recentUpload?.file) {
        return;
      }

      clearScrubState();
      setShowDeviceMenu(false);
      if (sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
        appendLocalFilesToQueue([recentUpload.file]);
        return;
      }

      commitLocalFileQueue([createLocalFileEntry(recentUpload.file)], -1);
      await loadQueuedLocalFileAtIndex(0, { autoPlay: true });
    },
    [
      appendLocalFilesToQueue,
      clearScrubState,
      commitLocalFileQueue,
      loadQueuedLocalFileAtIndex,
      recentUploads,
      sourceSession.kind,
    ],
  );

  const handlePlayPause = useCallback(async () => {
    if (sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
      return;
    }

    await handleLocalPlayPause();
    syncTransportState();
  }, [handleLocalPlayPause, sourceSession.kind, syncTransportState]);

  const handleStop = useCallback(() => {
    if (sourceSession.kind === AUDIO_SOURCE_KINDS.system) {
      return;
    }

    clearScrubState();
    handleLocalStop();
    syncTransportState();
  }, [
    clearScrubState,
    handleLocalStop,
    sourceSession.kind,
    syncTransportState,
  ]);

  const handleLiveInputToggle = useCallback(async () => {
    clearScrubState();
    if (isLiveInputActive) {
      const status = stopLiveInputSession();
      if (status.isLiveInputActive) {
        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.error,
          LIVE_INPUT_ERROR_CODES.startFailed,
          status,
        );
      }
      return;
    }

    await startLiveInputSession({
      deviceId: selectedDevice,
      liveInputKind: "live",
    });
  }, [
    applyLiveInputUiState,
    clearScrubState,
    isLiveInputActive,
    selectedDevice,
    startLiveInputSession,
    stopLiveInputSession,
  ]);

  const handleSourceChange = useCallback(
    async (next) => {
      const nextKind =
        next === AUDIO_SOURCE_KINDS.system
          ? AUDIO_SOURCE_KINDS.system
          : AUDIO_SOURCE_KINDS.file;
      if (nextKind === sourceSession.kind) {
        return sourceSession;
      }

      clearScrubState();
      const audioSession = getDefaultAudioSession();
      audioSession.selectSource(nextKind);
      const status = syncSessionStatus();
      syncTransportState();
      if (nextKind === AUDIO_SOURCE_KINDS.file) {
        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.idle,
          LIVE_INPUT_ERROR_CODES.none,
          status,
        );
      }
      if (
        nextKind === AUDIO_SOURCE_KINDS.system &&
        isWebPlatform &&
        liveInputPermissionState === LIVE_INPUT_PERMISSION_STATES.unknown
      ) {
        await requestLiveInputPermission();
      }
      return status.sourceSession;
    },
    [
      applyLiveInputUiState,
      clearScrubState,
      isWebPlatform,
      liveInputPermissionState,
      requestLiveInputPermission,
      sourceSession,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const startSelectedSystemLiveInput = useCallback(async () => {
    demoPreloadGenerationRef.current += 1;
    const started = await startLiveInputSession({
      deviceId: selectedLiveDeviceId,
      deviceLabel: selectedLiveDevice?.label ?? "",
      liveInputKind: selectedLiveInputDeviceKind,
    });
    if (started) {
      setFileName(DEFAULT_FILE_NAME);
    }
    return started;
  }, [
    selectedLiveDeviceId,
    selectedLiveDevice,
    selectedLiveInputDeviceKind,
    startLiveInputSession,
  ]);

  const handleSystemToggle = useCallback(async () => {
    clearScrubState();
    try {
      if (isLiveInputActive) {
        stopLiveInputSession();
      } else {
        await startSelectedSystemLiveInput();
      }
    } catch (error) {
      console.error("Error toggling system audio:", error);
      const status = syncSessionStatus();
      applyLiveInputUiState(
        LIVE_INPUT_UI_STATES.error,
        mapLiveInputStartError(error),
        status,
      );
    }
  }, [
    applyLiveInputUiState,
    clearScrubState,
    isLiveInputActive,
    startSelectedSystemLiveInput,
    stopLiveInputSession,
    syncSessionStatus,
  ]);

  const handleLiveInputAction = useCallback(async () => {
    clearScrubState();
    try {
      if (isLiveInputActive) {
        stopLiveInputSession();
        return;
      }

      if (sourceSession.kind !== AUDIO_SOURCE_KINDS.system) {
        getDefaultAudioSession().selectSource(AUDIO_SOURCE_KINDS.system);
        syncSessionStatus();
        syncTransportState();
      }

      if (!selectedSystemDevice && selectedLiveDeviceId) {
        setSelectedSystemDevice(selectedLiveDeviceId);
      }

      await startSelectedSystemLiveInput();
    } catch (error) {
      console.error("Error toggling live input:", error);
      const status = syncSessionStatus();
      applyLiveInputUiState(
        LIVE_INPUT_UI_STATES.error,
        mapLiveInputStartError(error),
        status,
      );
    }
  }, [
    applyLiveInputUiState,
    clearScrubState,
    isLiveInputActive,
    selectedLiveDeviceId,
    selectedSystemDevice,
    sourceSession.kind,
    startSelectedSystemLiveInput,
    stopLiveInputSession,
    syncSessionStatus,
    syncTransportState,
  ]);

  const setSelectedLiveInputAnalysisClass = useCallback(
    (nextAnalysisClass) => {
      const normalizedAnalysisClass =
        normalizeLiveInputAnalysisClass(nextAnalysisClass);
      if (!selectedLiveDeviceId) {
        return;
      }

      setLiveInputAnalysisOverrides((currentOverrides) => {
        const nextOverrides = {
          ...currentOverrides,
        };
        if (normalizedAnalysisClass === LIVE_INPUT_ANALYSIS_CLASSES.auto) {
          delete nextOverrides[selectedLiveDeviceId];
        } else {
          nextOverrides[selectedLiveDeviceId] = normalizedAnalysisClass;
        }
        persistLiveInputAnalysisOverrides(storage, nextOverrides);
        getDefaultAudioSession().setLiveInputAnalysisSettings({
          overrides: nextOverrides,
        });
        return nextOverrides;
      });
      applyLiveInputUiState(
        isLiveInputActive
          ? LIVE_INPUT_UI_STATES.active
          : LIVE_INPUT_UI_STATES.idle,
        LIVE_INPUT_ERROR_CODES.none,
      );
      syncSessionStatus();
    },
    [
      applyLiveInputUiState,
      isLiveInputActive,
      selectedLiveDeviceId,
      storage,
      syncSessionStatus,
    ],
  );

  const handleLiveInputAnalysisClassChange = useCallback(
    (nextAnalysisClass) => {
      const normalizedAnalysisClass =
        normalizeLiveInputAnalysisClass(nextAnalysisClass);
      /** @type {Record<string, import("@baryon/engine/audio/liveInputAnalysis").ResolvedLiveInputAnalysisClass>} */
      const clearedOverrides = {};

      setLiveInputAnalysisClass(normalizedAnalysisClass);
      setLiveInputAnalysisOverrides(clearedOverrides);
      persistLiveInputAnalysisOverrides(storage, clearedOverrides);
      getDefaultAudioSession().setLiveInputAnalysisSettings({
        analysisClass: normalizedAnalysisClass,
        acousticIntent: liveInputAcousticIntent,
        overrides: clearedOverrides,
      });
      applyLiveInputUiState(
        isLiveInputActive
          ? LIVE_INPUT_UI_STATES.active
          : LIVE_INPUT_UI_STATES.idle,
        LIVE_INPUT_ERROR_CODES.none,
      );
      syncSessionStatus();
    },
    [
      applyLiveInputUiState,
      isLiveInputActive,
      liveInputAcousticIntent,
      storage,
      syncSessionStatus,
    ],
  );

  const handleLiveInputAcousticIntentChange = useCallback(
    (nextAcousticIntent) => {
      const normalizedAcousticIntent =
        normalizeLiveInputAcousticIntent(nextAcousticIntent);
      setLiveInputAcousticIntentState(normalizedAcousticIntent);
      persistLiveInputAcousticIntent(storage, normalizedAcousticIntent);
      getDefaultAudioSession().setLiveInputAnalysisSettings({
        acousticIntent: normalizedAcousticIntent,
      });
      applyLiveInputUiState(
        isLiveInputActive
          ? LIVE_INPUT_UI_STATES.active
          : LIVE_INPUT_UI_STATES.idle,
        LIVE_INPUT_ERROR_CODES.none,
      );
      syncSessionStatus();
    },
    [applyLiveInputUiState, isLiveInputActive, storage, syncSessionStatus],
  );

  const setLiveInputAcousticIntent = handleLiveInputAcousticIntentChange;

  const handleSaveDeviceKindOverride = useCallback((deviceId, kind) => {
    saveLiveInputDeviceKindOverride(deviceId, kind);
    setDeviceClassificationVersion((v) => v + 1);
  }, []);

  const handleClearDeviceKindOverride = useCallback((deviceId) => {
    clearDeviceOverride(deviceId);
    setDeviceClassificationVersion((v) => v + 1);
  }, []);

  const handleVolumeChange = useCallback(
    (value) => {
      const nextVolume = Math.max(0, Math.min(1, Number(value) || 0));
      handleLocalVolumeChange(nextVolume);
    },
    [handleLocalVolumeChange],
  );

  const handleMuteToggle = useCallback(() => {
    handleLocalMuteToggle();
  }, [handleLocalMuteToggle]);

  const displayName = fileName;
  const hasPreviousLocalFile =
    activeLocalFileQueueIndex > 0 &&
    activeLocalFileQueueIndex < localFileQueue.length;
  const hasNextLocalFile =
    activeLocalFileQueueIndex >= 0 &&
    activeLocalFileQueueIndex < localFileQueue.length - 1;

  const beginScrub = useCallback(
    async (nextPreviewSeconds = null) => {
      if (isScrubbingRef.current) {
        if (nextPreviewSeconds != null) {
          setScrubPreviewSeconds(
            clampTransportTime(
              nextPreviewSeconds,
              transportSeekState.durationSeconds,
            ),
          );
        }
        return;
      }

      const audioSession = getDefaultAudioSession();
      const nextTransportState = audioSession.getTransportState();
      if (!nextTransportState.canSeek) {
        return;
      }

      isScrubbingRef.current = true;
      setIsScrubbing(true);
      setTransportSeekState(createTransportSeekState(nextTransportState));
      setScrubPreviewSeconds(
        clampTransportTime(
          nextPreviewSeconds ?? nextTransportState.currentTimeSeconds,
          nextTransportState.durationSeconds,
        ),
      );

      const status = audioSession.getStatus();
      resumeAfterScrubRef.current = status.isPlaying;

      if (status.isPlaying) {
        await audioSession.playPauseAudio();
        syncSessionStatus();
        syncTransportState();
      }
    },
    [syncSessionStatus, syncTransportState, transportSeekState.durationSeconds],
  );

  const previewScrub = useCallback(
    (nextPreviewSeconds) => {
      const durationSeconds = transportSeekState.durationSeconds;
      setScrubPreviewSeconds(
        clampTransportTime(nextPreviewSeconds, durationSeconds),
      );
    },
    [transportSeekState.durationSeconds],
  );

  const commitScrub = useCallback(
    async (nextTimeSeconds = null) => {
      const audioSession = getDefaultAudioSession();
      const currentTransportState = audioSession.getTransportState();
      if (!currentTransportState.canSeek) {
        clearScrubState();
        setTransportSeekState(createTransportSeekState(currentTransportState));
        return;
      }

      const targetTimeSeconds = clampTransportTime(
        nextTimeSeconds ??
          scrubPreviewSeconds ??
          currentTransportState.currentTimeSeconds,
        currentTransportState.durationSeconds,
      );
      const shouldResume = resumeAfterScrubRef.current;

      clearScrubState();
      await audioSession.seekTo(targetTimeSeconds);
      syncSessionStatus();
      syncTransportState();

      if (shouldResume) {
        await audioSession.playPauseAudio();
        syncSessionStatus();
        syncTransportState();
      }
    },
    [
      clearScrubState,
      scrubPreviewSeconds,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  const restartOrLoadPreviousLocalFile = useCallback(async () => {
    if (sourceSession.kind !== AUDIO_SOURCE_KINDS.file) {
      return false;
    }

    const audioSession = getDefaultAudioSession();
    const currentTransportState = audioSession.getTransportState();
    const queueState = localFileQueueStateRef.current;
    const previousQueueIndex = queueState.activeIndex - 1;
    const hasPreviousQueueEntry = Boolean(
      queueState.entries[previousQueueIndex]?.file,
    );
    const currentTimeSeconds = Number.isFinite(
      currentTransportState.currentTimeSeconds,
    )
      ? Math.max(0, currentTransportState.currentTimeSeconds)
      : 0;

    if (
      currentTimeSeconds <= PREVIOUS_TRACK_ZERO_THRESHOLD_SECONDS &&
      hasPreviousQueueEntry
    ) {
      clearScrubState();
      return loadQueuedLocalFileAtIndex(previousQueueIndex);
    }

    if (!isAudioLoaded) {
      return false;
    }

    clearScrubState();
    audioSession.stopAudio();
    syncSessionStatus();
    syncTransportState();
    return true;
  }, [
    clearScrubState,
    isAudioLoaded,
    loadQueuedLocalFileAtIndex,
    sourceSession.kind,
    syncSessionStatus,
    syncTransportState,
  ]);

  const cancelScrub = useCallback(async () => {
    if (!isScrubbingRef.current) {
      return;
    }

    const audioSession = getDefaultAudioSession();
    const shouldResume = resumeAfterScrubRef.current;

    clearScrubState();
    syncTransportState();

    if (shouldResume) {
      await audioSession.playPauseAudio();
      syncSessionStatus();
      syncTransportState();
    }
  }, [clearScrubState, syncSessionStatus, syncTransportState]);

  const resetAudioSession = useCallback(() => {
    const audioSession = getDefaultAudioSession();

    clearScrubState();
    setFileName(DEFAULT_FILE_NAME);
    setCurrentLoadedLocalFile(null);
    clearLocalFileQueue();
    setIsPlaying(false);
    setIsLiveInputActive(false);
    setIsAudioLoaded(false);
    liveInputUiStateRef.current = LIVE_INPUT_UI_STATES.idle;
    liveInputErrorCodeRef.current = LIVE_INPUT_ERROR_CODES.none;
    setLiveInputUiState(LIVE_INPUT_UI_STATES.idle);
    setLiveInputErrorCode(LIVE_INPUT_ERROR_CODES.none);
    setLiveInputRuntimeStatus(createLiveInputRuntimeStatus());
    setShowDeviceMenu(false);
    setIsEngineReady(false);
    setSelectedSystemDevice(null);
    setLiveInputPermissionState(
      isWebPlatform
        ? LIVE_INPUT_PERMISSION_STATES.unknown
        : LIVE_INPUT_PERMISSION_STATES.granted,
    );
    setLiveInputAnalysisClass(DEFAULT_LIVE_INPUT_ANALYSIS_CLASS);
    setLiveInputAcousticIntentState(DEFAULT_LIVE_INPUT_ACOUSTIC_INTENT);
    setResolvedLiveInputAnalysisClass(null);
    setLiveInputAnalysisOverrides(loadLiveInputAnalysisOverrides(storage));
    resetAudioTransportClock();
    setTransportSeekState(DEFAULT_TRANSPORT_SEEK_STATE);

    return audioSession.dispose();
  }, [clearLocalFileQueue, clearScrubState, isWebPlatform, storage]);

  useEffect(() => {
    return () => {
      void resetAudioSession();
    };
  }, [resetAudioSession]);

  const sceneValue = useMemo(
    () => ({
      setIsEngineReady,
      liveInputUiState,
      liveInputErrorCode,
      liveInputRuntimeStatus,
      setLiveInputRuntimeStatus,
      resetAudioSession,
    }),
    [
      liveInputErrorCode,
      liveInputRuntimeStatus,
      liveInputUiState,
      resetAudioSession,
      setIsEngineReady,
      setLiveInputRuntimeStatus,
    ],
  );

  const value = useMemo(
    () => ({
      platform: audioPlatform,
      liveInputDeviceKind,
      liveInputKind,
      liveInputPermissionState,
      sourceSession,
      selectedSystemDevice,
      selectedLiveDeviceId,
      selectedLiveInputDeviceKind,
      selectedLiveInputDeviceKindOverride,
      selectedLiveInputKind: selectedLiveInputDeviceKind,
      liveInputAnalysisClass,
      liveInputAcousticIntent,
      resolvedLiveInputAnalysisClass,
      liveInputUiState,
      liveInputErrorCode,
      selectedLiveInputAnalysisOverride,
      selectedResolvedLiveInputAnalysisClass,
      fileName,
      displayName,
      currentLoadedLocalFile,
      localFileQueue,
      activeLocalFileQueueIndex,
      hasPreviousLocalFile,
      hasNextLocalFile,
      isLocalFileQueueAutoplayEnabled,
      recentUploads,
      isPlaying,
      isLiveInputActive,
      isAudioLoaded,
      volume,
      isMuted,
      isEngineReady,
      audioDevices,
      selectedDevice,
      liveInputRuntimeStatus,
      showDeviceMenu,
      scrubPreviewSeconds,
      isScrubbing,
      setShowDeviceMenu,
      setSelectedDevice,
      setSelectedSystemDevice: handleSelectedSystemDeviceChange,
      setSelectedLiveInputAnalysisClass,
      setLiveInputAnalysisClass: handleLiveInputAnalysisClassChange,
      setLiveInputAcousticIntent,
      saveDeviceKindOverride: handleSaveDeviceKindOverride,
      clearDeviceKindOverride: handleClearDeviceKindOverride,
      requestLiveInputPermission,
      resetAudioSession,
      handleFileChange,
      handleRecentUploadSelect,
      handlePlayPause,
      handleStop,
      handleLiveInputToggle,
      handleSystemToggle,
      handleLiveInputAction,
      handleSourceChange,
      handleVolumeChange,
      handleMuteToggle,
      loadDemoAudioFile,
      loadProbeAudioFile,
      stopProbeAudio,
      beginScrub,
      previewScrub,
      commitScrub,
      restartOrLoadPreviousLocalFile,
      playLocalFileAtQueueIndex,
      playNextLocalFile,
      toggleLocalFileQueueAutoplay,
      cancelScrub,
    }),
    [
      audioDevices,
      audioPlatform,
      activeLocalFileQueueIndex,
      beginScrub,
      cancelScrub,
      commitScrub,
      currentLoadedLocalFile,
      displayName,
      fileName,
      handleClearDeviceKindOverride,
      handleFileChange,
      handleLiveInputAnalysisClassChange,
      handleLiveInputAction,
      handleLiveInputToggle,
      handleMuteToggle,
      handlePlayPause,
      handleRecentUploadSelect,
      handleSaveDeviceKindOverride,
      handleSelectedSystemDeviceChange,
      handleSourceChange,
      handleStop,
      handleSystemToggle,
      handleVolumeChange,
      hasPreviousLocalFile,
      hasNextLocalFile,
      isAudioLoaded,
      isEngineReady,
      isLiveInputActive,
      isLocalFileQueueAutoplayEnabled,
      isMuted,
      isPlaying,
      isScrubbing,
      liveInputAnalysisClass,
      liveInputAcousticIntent,
      liveInputDeviceKind,
      liveInputErrorCode,
      liveInputKind,
      liveInputPermissionState,
      liveInputRuntimeStatus,
      liveInputUiState,
      localFileQueue,
      loadDemoAudioFile,
      loadProbeAudioFile,
      playLocalFileAtQueueIndex,
      playNextLocalFile,
      previewScrub,
      recentUploads,
      requestLiveInputPermission,
      resetAudioSession,
      restartOrLoadPreviousLocalFile,
      resolvedLiveInputAnalysisClass,
      scrubPreviewSeconds,
      selectedDevice,
      selectedLiveDeviceId,
      selectedLiveInputAnalysisOverride,
      selectedLiveInputDeviceKind,
      selectedLiveInputDeviceKindOverride,
      selectedResolvedLiveInputAnalysisClass,
      selectedSystemDevice,
      sourceSession,
      setSelectedDevice,
      setSelectedLiveInputAnalysisClass,
      setLiveInputAcousticIntent,
      setShowDeviceMenu,
      showDeviceMenu,
      stopProbeAudio,
      toggleLocalFileQueueAutoplay,
      volume,
    ],
  );

  return (
    <AudioSceneContext.Provider value={sceneValue}>
      <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
    </AudioSceneContext.Provider>
  );
}
