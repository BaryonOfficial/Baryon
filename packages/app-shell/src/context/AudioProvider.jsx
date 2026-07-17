import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDefaultAudioSession } from "@baryon/engine/audio";
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
  bundledPath: "audio/baryon-demo.mp3",
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

function resolvePreloadedDemoAudioUrl(audioPlatform) {
  if (audioPlatform !== "desktop") {
    return PRELOADED_DEMO_AUDIO.webUrl;
  }

  const baseUrl = globalThis.document?.baseURI ?? globalThis.location?.href;
  if (!baseUrl) {
    return PRELOADED_DEMO_AUDIO.bundledPath;
  }

  try {
    return new URL(PRELOADED_DEMO_AUDIO.bundledPath, baseUrl).toString();
  } catch {
    return PRELOADED_DEMO_AUDIO.bundledPath;
  }
}
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

function createLiveReturnLocalFile(file, resumeTimeSeconds = 0) {
  return {
    ...createLocalFileEntry(file),
    resumeTimeSeconds: clampTransportTime(resumeTimeSeconds, 0),
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
  const [liveReturnLocalFile, setLiveReturnLocalFile] = useState(null);
  const [queuedNextLocalFile, setQueuedNextLocalFile] = useState(null);
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
  const [selectedSource, setSelectedSource] = useState("file");
  const [selectedSystemDevice, setSelectedSystemDevice] = useState(null);
  const [liveInputPermissionState, setLiveInputPermissionState] = useState(
    /** @returns {LiveInputPermissionState} */ () =>
      isWebPlatform
        ? LIVE_INPUT_PERMISSION_STATES.unknown
        : LIVE_INPUT_PERMISSION_STATES.granted,
  );
  const [liveInputDeviceKind, setLiveInputDeviceKind] = useState(null);
  const liveInputKind = liveInputDeviceKind;
  const setLiveInputKind = setLiveInputDeviceKind;
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
  const liveInputStartRequestIdRef = useRef(0);
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
    handleFileChange: handleLocalFileChange,
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
    setLiveInputKind,
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

  const clearLiveLocalFileState = useCallback(() => {
    setLiveReturnLocalFile(null);
    setQueuedNextLocalFile(null);
  }, []);

  const queueNextLocalFile = useCallback(
    (file) => {
      if (!file) {
        return;
      }
      registerRecentUpload(file);
      setQueuedNextLocalFile(createLocalFileEntry(file));
    },
    [registerRecentUpload],
  );

  const createLiveReturnSnapshot = useCallback(() => {
    if (isLiveInputActive || !isAudioLoaded || !currentLoadedLocalFile?.file) {
      return null;
    }

    return createLiveReturnLocalFile(
      currentLoadedLocalFile.file,
      getDefaultAudioSession().getTransportState().currentTimeSeconds,
    );
  }, [currentLoadedLocalFile, isAudioLoaded, isLiveInputActive]);

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

    if (selectedSource === "system") {
      applyLiveInputUiState(LIVE_INPUT_UI_STATES.error, nextErrorCode);
    }
  }, [
    applyLiveInputUiState,
    audioDevices,
    isLiveInputActive,
    selectedSource,
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
    async (file, { seekTimeSeconds = null, clearQueuedNext = true } = {}) => {
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
      setSelectedSource("file");
      setShowDeviceMenu(false);
      setLiveReturnLocalFile(null);
      if (clearQueuedNext) {
        setQueuedNextLocalFile(null);
      }
      return true;
    },
    [handleLocalRecentFileSelect, syncSessionStatus, syncTransportState],
  );

  const loadImmediateAudioUrl = useCallback(
    async ({ sourceUrl, sourceName }) => {
      const audioSession = getDefaultAudioSession();
      if (isLiveInputActive) {
        audioSession.stopLiveInputStream();
      }

      setFileName(sourceName);
      await audioSession.loadAudio(sourceUrl);
      setCurrentLoadedLocalFile(null);
      setSelectedSource("file");
      setShowDeviceMenu(false);
      setLiveReturnLocalFile(null);
      setQueuedNextLocalFile(null);
      syncSessionStatus();
      syncTransportState();
      return audioSession;
    },
    [isLiveInputActive, syncSessionStatus, syncTransportState],
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
          await loadImmediateAudioUrl({ sourceUrl, sourceName });
          loaded = true;
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
    async ({ autoPlay = true } = {}) => {
      clearScrubState();

      try {
        let audioSession = null;
        if (typeof demoAudioFileLoader === "function") {
          try {
            const demoFile = await demoAudioFileLoader();
            const loaded = await loadImmediateLocalFile(demoFile);
            if (loaded) {
              audioSession = getDefaultAudioSession();
            }
          } catch (error) {
            console.warn("Desktop demo audio bridge failed:", error);
          }
        }
        if (!audioSession) {
          audioSession = await loadImmediateAudioUrl({
            sourceUrl: resolvePreloadedDemoAudioUrl(audioPlatform),
            sourceName: PRELOADED_DEMO_AUDIO.name,
          });
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
        setIsAudioLoaded(false);
        syncSessionStatus();
        syncTransportState();
        return {
          ok: false,
          error: "Demo audio failed to load.",
        };
      }
    },
    [
      clearScrubState,
      audioPlatform,
      demoAudioFileLoader,
      loadImmediateAudioUrl,
      loadImmediateLocalFile,
      setIsAudioLoaded,
      syncSessionStatus,
      syncTransportState,
    ],
  );

  useEffect(() => {
    if (!isWebPlatform || hasAutoLoadedDemoAudioRef.current) {
      return;
    }

    hasAutoLoadedDemoAudioRef.current = true;
    void loadDemoAudioFile({ autoPlay: false });
  }, [isWebPlatform, loadDemoAudioFile]);

  const restoreAfterLiveStop = useCallback(async () => {
    if (liveReturnLocalFile?.file) {
      return loadImmediateLocalFile(liveReturnLocalFile.file, {
        seekTimeSeconds: liveReturnLocalFile.resumeTimeSeconds,
        clearQueuedNext: false,
      });
    }

    if (!queuedNextLocalFile?.file) {
      return false;
    }

    return loadImmediateLocalFile(queuedNextLocalFile.file, {
      clearQueuedNext: true,
    });
  }, [liveReturnLocalFile, loadImmediateLocalFile, queuedNextLocalFile]);

  useEffect(() => {
    const audioSession = getDefaultAudioSession();
    audioSession.setAudioEndedCallback(async () => {
      if (queuedNextLocalFile?.file) {
        await loadImmediateLocalFile(queuedNextLocalFile.file, {
          clearQueuedNext: true,
        });
        return;
      }

      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    return () => {
      audioSession.setAudioEndedCallback(null);
    };
  }, [loadImmediateLocalFile, queuedNextLocalFile]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      clearScrubState();
      setShowDeviceMenu(false);
      if (isLiveInputActive) {
        queueNextLocalFile(file);
      } else {
        clearLiveLocalFileState();
        setSelectedSource("file");
        const loaded = await handleLocalFileChange(event);
        if (loaded) {
          setCurrentLoadedLocalFile(createLocalFileEntry(file));
        }
      }
      event.target.value = "";
    },
    [
      clearLiveLocalFileState,
      clearScrubState,
      handleLocalFileChange,
      isLiveInputActive,
      queueNextLocalFile,
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
      if (isLiveInputActive) {
        queueNextLocalFile(recentUpload.file);
        return;
      }

      clearLiveLocalFileState();
      setSelectedSource("file");
      const loaded = await handleLocalRecentFileSelect(recentUpload.file);
      if (loaded) {
        setCurrentLoadedLocalFile(createLocalFileEntry(recentUpload.file));
      }
    },
    [
      clearLiveLocalFileState,
      clearScrubState,
      handleLocalRecentFileSelect,
      isLiveInputActive,
      queueNextLocalFile,
      recentUploads,
    ],
  );

  const handlePlayPause = useCallback(async () => {
    if (selectedSource === "system") {
      return;
    }

    await handleLocalPlayPause();
    syncTransportState();
  }, [handleLocalPlayPause, selectedSource, syncTransportState]);

  const handleStop = useCallback(() => {
    if (selectedSource === "system") {
      return;
    }

    clearScrubState();
    handleLocalStop();
    syncTransportState();
  }, [clearScrubState, handleLocalStop, selectedSource, syncTransportState]);

  const handleLiveInputToggle = useCallback(async () => {
    clearScrubState();
    const liveReturnSnapshot = createLiveReturnSnapshot();

    if (!isLiveInputActive) {
      setLiveReturnLocalFile(liveReturnSnapshot);
    }
    if (isLiveInputActive) {
      const status = stopLiveInputSession();
      await restoreAfterLiveStop();
      if (status.isLiveInputActive) {
        applyLiveInputUiState(
          LIVE_INPUT_UI_STATES.error,
          LIVE_INPUT_ERROR_CODES.startFailed,
          status,
        );
      }
      return;
    }

    const started = await startLiveInputSession({
      deviceId: selectedDevice,
      liveInputKind: "live",
    });
    if (!started && liveReturnSnapshot?.file) {
      await loadImmediateLocalFile(liveReturnSnapshot.file, {
        seekTimeSeconds: liveReturnSnapshot.resumeTimeSeconds,
        clearQueuedNext: false,
      });
    }
  }, [
    applyLiveInputUiState,
    clearScrubState,
    createLiveReturnSnapshot,
    isLiveInputActive,
    loadImmediateLocalFile,
    restoreAfterLiveStop,
    selectedDevice,
    startLiveInputSession,
    stopLiveInputSession,
  ]);

  const handleSourceChange = useCallback(
    async (next) => {
      if (next === selectedSource) return;

      if (next === "system") {
        clearScrubState();
        if (isAudioLoaded) {
          handleLocalStop();
          syncTransportState();
        }
      }

      if (next === "file") {
        stopLiveInputSession();
        if (isLiveInputActive) {
          await restoreAfterLiveStop();
        }
      }
      if (next !== "system") {
        applyLiveInputUiState(LIVE_INPUT_UI_STATES.idle);
      }
      setSelectedSource(next);
      if (
        next === "system" &&
        isWebPlatform &&
        liveInputPermissionState === LIVE_INPUT_PERMISSION_STATES.unknown
      ) {
        await requestLiveInputPermission();
      }
    },
    [
      applyLiveInputUiState,
      clearScrubState,
      handleLocalStop,
      isAudioLoaded,
      isLiveInputActive,
      isWebPlatform,
      liveInputPermissionState,
      requestLiveInputPermission,
      restoreAfterLiveStop,
      selectedSource,
      syncTransportState,
      stopLiveInputSession,
    ],
  );

  const startSelectedSystemLiveInput = useCallback(
    async (liveReturnSnapshot) => {
      setLiveReturnLocalFile(liveReturnSnapshot);
      const started = await startLiveInputSession({
        deviceId: selectedLiveDeviceId,
        deviceLabel: selectedLiveDevice?.label ?? "",
        liveInputKind: selectedLiveInputDeviceKind,
      });
      if (started) {
        setFileName(DEFAULT_FILE_NAME);
      }
      return started;
    },
    [
      selectedLiveDeviceId,
      selectedLiveDevice,
      selectedLiveInputDeviceKind,
      startLiveInputSession,
    ],
  );

  const handleSystemToggle = useCallback(async () => {
    clearScrubState();
    const liveReturnSnapshot = createLiveReturnSnapshot();
    try {
      if (isLiveInputActive) {
        // Stop live input but stay in System mode — do not restore the
        // previous local file, which would switch the source back to File.
        stopLiveInputSession();
      } else {
        await startSelectedSystemLiveInput(liveReturnSnapshot);
      }
    } catch (error) {
      console.error("Error toggling system audio:", error);
      const status = syncSessionStatus();
      applyLiveInputUiState(
        LIVE_INPUT_UI_STATES.error,
        mapLiveInputStartError(error),
        status,
      );
      if (!status.isLiveInputActive && liveReturnSnapshot?.file) {
        await loadImmediateLocalFile(liveReturnSnapshot.file, {
          seekTimeSeconds: liveReturnSnapshot.resumeTimeSeconds,
          clearQueuedNext: false,
        });
      }
    }
  }, [
    applyLiveInputUiState,
    clearScrubState,
    createLiveReturnSnapshot,
    isLiveInputActive,
    loadImmediateLocalFile,
    startSelectedSystemLiveInput,
    stopLiveInputSession,
    syncSessionStatus,
  ]);

  const handleLiveInputAction = useCallback(async () => {
    clearScrubState();
    const liveReturnSnapshot = createLiveReturnSnapshot();
    try {
      if (isLiveInputActive) {
        stopLiveInputSession();
        return;
      }

      if (selectedSource !== "system") {
        if (isAudioLoaded) {
          handleLocalStop();
          syncTransportState();
        }
        setSelectedSource("system");
      }

      if (!selectedSystemDevice && selectedLiveDeviceId) {
        setSelectedSystemDevice(selectedLiveDeviceId);
      }

      await startSelectedSystemLiveInput(liveReturnSnapshot);
    } catch (error) {
      console.error("Error toggling live input:", error);
      const status = syncSessionStatus();
      applyLiveInputUiState(
        LIVE_INPUT_UI_STATES.error,
        mapLiveInputStartError(error),
        status,
      );
      if (!status.isLiveInputActive && liveReturnSnapshot?.file) {
        await loadImmediateLocalFile(liveReturnSnapshot.file, {
          seekTimeSeconds: liveReturnSnapshot.resumeTimeSeconds,
          clearQueuedNext: false,
        });
      }
    }
  }, [
    applyLiveInputUiState,
    clearScrubState,
    createLiveReturnSnapshot,
    handleLocalStop,
    isAudioLoaded,
    isLiveInputActive,
    loadImmediateLocalFile,
    selectedLiveDeviceId,
    selectedSource,
    selectedSystemDevice,
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
  const hasQueuedNextLocalFile = Boolean(queuedNextLocalFile?.file);

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
    setLiveReturnLocalFile(null);
    setQueuedNextLocalFile(null);
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
    setSelectedSource("file");
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
  }, [clearScrubState, isWebPlatform, storage]);

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
      selectedSource,
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
      liveReturnLocalFile,
      queuedNextLocalFile,
      hasQueuedNextLocalFile,
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
      cancelScrub,
    }),
    [
      audioDevices,
      audioPlatform,
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
      hasQueuedNextLocalFile,
      isAudioLoaded,
      isEngineReady,
      isLiveInputActive,
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
      liveReturnLocalFile,
      loadDemoAudioFile,
      loadProbeAudioFile,
      previewScrub,
      queuedNextLocalFile,
      recentUploads,
      requestLiveInputPermission,
      resetAudioSession,
      resolvedLiveInputAnalysisClass,
      scrubPreviewSeconds,
      selectedDevice,
      selectedLiveDeviceId,
      selectedLiveInputAnalysisOverride,
      selectedLiveInputDeviceKind,
      selectedLiveInputDeviceKindOverride,
      selectedResolvedLiveInputAnalysisClass,
      selectedSource,
      selectedSystemDevice,
      setSelectedDevice,
      setSelectedLiveInputAnalysisClass,
      setLiveInputAcousticIntent,
      setShowDeviceMenu,
      showDeviceMenu,
      stopProbeAudio,
      volume,
    ],
  );

  return (
    <AudioSceneContext.Provider value={sceneValue}>
      <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
    </AudioSceneContext.Provider>
  );
}
