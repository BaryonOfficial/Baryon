import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getDefaultAudioSession } from "@baryon/visualizer/audio";
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
} from "@baryon/visualizer/audio/liveInputAnalysis";
import { AudioContext, AudioSceneContext } from "./AudioContext";
import {
  LIVE_INPUT_ERROR_CODES,
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
import {
  SOUNDCLOUD_ENABLED,
  canUseNativeStreamPlayback,
  isHlsStream,
  resolveSoundCloudQueue,
  resolveSoundCloudStream,
} from "../utils/soundcloud";

const DEFAULT_FILE_NAME = "Upload Audio";
const DEFAULT_SOUNDCLOUD_LABEL = "SoundCloud";
const SOUNDCLOUD_READY_MESSAGE =
  "Paste a public SoundCloud track or playlist to drive the live cymatic view.";
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
  writeStoredJson(storage, SETTINGS_KEY, {
    ...currentSettings,
    [LIVE_INPUT_ANALYSIS_OVERRIDES_KEY]:
      normalizeLiveInputAnalysisOverrides(overrides),
  });
}

function loadLiveInputAcousticIntent(storage) {
  return normalizeLiveInputAcousticIntent(
    readStoredJson(storage, SETTINGS_KEY)?.[LIVE_INPUT_ACOUSTIC_INTENT_KEY],
  );
}

function persistLiveInputAcousticIntent(storage, acousticIntent) {
  const currentSettings = readStoredJson(storage, SETTINGS_KEY) ?? {};
  writeStoredJson(storage, SETTINGS_KEY, {
    ...currentSettings,
    [LIVE_INPUT_ACOUSTIC_INTENT_KEY]:
      normalizeLiveInputAcousticIntent(acousticIntent),
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

let hlsModulePromise = null;

async function loadHlsModule() {
  if (!hlsModulePromise) {
    hlsModulePromise = import("hls.js").then(
      (module) => module.default ?? module,
    );
  }
  return hlsModulePromise;
}

function formatQueueInfo(track, index, queueLength, prefix = "Ready") {
  const position =
    queueLength > 1 ? `${index + 1} of ${queueLength}` : "Single track";
  const artist = track?.artistName ? ` by ${track.artistName}` : "";
  return `${prefix}: ${track?.title || DEFAULT_SOUNDCLOUD_LABEL}${artist} (${position})`;
}

function clearAudioElementSource(audioElement) {
  if (!audioElement) return;
  audioElement.pause();
  audioElement.removeAttribute("src");
  audioElement.load?.();
  try {
    audioElement.currentTime = 0;
  } catch {
    // Some browsers throw while resetting detached media.
  }
}

function waitForPlayableMedia(audioElement, timeoutMs = 15000) {
  if (!audioElement) {
    return Promise.reject(
      new Error("SoundCloud audio element is unavailable."),
    );
  }

  if (audioElement.readyState >= 1) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("SoundCloud stream took too long to become playable."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      audioElement.removeEventListener("loadedmetadata", handleReady);
      audioElement.removeEventListener("canplay", handleReady);
      audioElement.removeEventListener("error", handleError);
    };

    const handleReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("SoundCloud stream failed to load."));
    };

    audioElement.addEventListener("loadedmetadata", handleReady);
    audioElement.addEventListener("canplay", handleReady);
    audioElement.addEventListener("error", handleError);
  });
}

async function attachStreamToAudioElement(audioElement, stream) {
  if (!audioElement) {
    throw new Error("SoundCloud audio element is unavailable.");
  }

  if (
    canUseNativeStreamPlayback(audioElement, stream.mimeType) ||
    !isHlsStream(stream)
  ) {
    audioElement.src = stream.streamUrl;
    audioElement.load?.();
    await waitForPlayableMedia(audioElement);
    return null;
  }

  const Hls = await loadHlsModule();
  if (!Hls?.isSupported?.()) {
    throw new Error(
      "This browser cannot play SoundCloud's stream format natively.",
    );
  }

  const hls = new Hls({
    enableWorker: true,
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("SoundCloud stream took too long to load."));
    }, 15000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      hls.off(Hls.Events.ERROR, handleError);
      hls.off(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);
      hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
      audioElement.removeEventListener("loadedmetadata", handleManifestParsed);
    };

    const handleManifestParsed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const handleMediaAttached = () => {
      hls.loadSource(stream.streamUrl);
    };

    const handleError = (_event, data) => {
      if (!data?.fatal || settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("SoundCloud stream failed to load."));
    };

    hls.on(Hls.Events.ERROR, handleError);
    hls.on(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);
    hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
    audioElement.addEventListener("loadedmetadata", handleManifestParsed);
    hls.attachMedia(audioElement);
  });

  return hls;
}

export function AudioProvider({ children, platform = "web" }) {
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
  const [playbackSource, setPlaybackSource] = useState("local-file");
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
    /** @type {import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputAnalysisClass} */ (
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
  const [showSoundCloudPanel, setShowSoundCloudPanel] = useState(false);
  const [soundCloudInput, setSoundCloudInput] = useState("");
  const [soundCloudCollectionTitle, setSoundCloudCollectionTitle] = useState(
    DEFAULT_SOUNDCLOUD_LABEL,
  );
  const [soundCloudTrackTitle, setSoundCloudTrackTitle] = useState(
    DEFAULT_SOUNDCLOUD_LABEL,
  );
  const [soundCloudError, setSoundCloudError] = useState("");
  const [soundCloudInfo, setSoundCloudInfo] = useState(
    SOUNDCLOUD_READY_MESSAGE,
  );
  const [soundCloudQueue, setSoundCloudQueue] = useState([]);
  const [soundCloudCurrentIndex, setSoundCloudCurrentIndex] = useState(-1);
  const [isSoundCloudLoading, setIsSoundCloudLoading] = useState(false);
  const [transportSeekState, setTransportSeekState] = useState(
    DEFAULT_TRANSPORT_SEEK_STATE,
  );
  const [scrubPreviewSeconds, setScrubPreviewSeconds] = useState(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const soundCloudAudioRef = useRef(null);
  const soundCloudHlsRef = useRef(null);
  const soundCloudTokenRef = useRef(0);
  const soundCloudQueueRef = useRef([]);
  const soundCloudCurrentIndexRef = useRef(-1);
  const playbackSourceRef = useRef("local-file");
  const lastNonZeroVolumeRef = useRef(1);
  const transportFrameRef = useRef(0);
  const resumeAfterScrubRef = useRef(false);
  const isScrubbingRef = useRef(false);
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

  useEffect(() => {
    soundCloudQueueRef.current = soundCloudQueue;
  }, [soundCloudQueue]);

  useEffect(() => {
    soundCloudCurrentIndexRef.current = soundCloudCurrentIndex;
  }, [soundCloudCurrentIndex]);

  useEffect(() => {
    playbackSourceRef.current = playbackSource;
  }, [playbackSource]);

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
    if (
      isLiveInputActive ||
      !isAudioLoaded ||
      playbackSource === "soundcloud" ||
      !currentLoadedLocalFile?.file
    ) {
      return null;
    }

    return createLiveReturnLocalFile(
      currentLoadedLocalFile.file,
      getDefaultAudioSession().getTransportState().currentTimeSeconds,
    );
  }, [
    playbackSource,
    currentLoadedLocalFile,
    isAudioLoaded,
    isLiveInputActive,
  ]);

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
      setLiveInputRuntimeStatus(
        buildLiveInputRuntimeStatus({
          status: statusOverride ?? getDefaultAudioSession().getStatus(),
          liveInputUiState: normalizedUiState,
          liveInputErrorCode: normalizedErrorCode,
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
    setLiveInputRuntimeStatus(
      buildLiveInputRuntimeStatus({
        status,
        liveInputUiState: nextUiState,
        liveInputErrorCode: liveInputErrorCodeRef.current,
      }),
    );
    publishAudioTransportClock(nextTransportState);
    setTransportSeekState(createTransportSeekState(nextTransportState));
    if ((status.volume ?? 0) > 0.001) {
      lastNonZeroVolumeRef.current = status.volume;
    }
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
      let resolvedDeviceId = deviceId;

      if (isWebPlatform) {
        if (
          liveInputPermissionState !== LIVE_INPUT_PERMISSION_STATES.granted &&
          !(await requestLiveInputPermission())
        ) {
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
        await audioSession.startLiveInputStream(
          resolvedDeviceId,
          nextLiveInputDeviceKind,
          deviceLabel,
        );
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

    window.addEventListener("__baryon-controls-change", handleControlsChanged);
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        handleControlsChanged,
      );
    };
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

  const ensureSoundCloudAudioElement = useCallback(() => {
    const audioElement = soundCloudAudioRef.current;
    if (!audioElement) {
      throw new Error("SoundCloud audio element is not initialized.");
    }
    return audioElement;
  }, []);

  const destroySoundCloudHls = useCallback(() => {
    soundCloudHlsRef.current?.destroy?.();
    soundCloudHlsRef.current = null;
  }, []);

  const resetSoundCloudTransport = useCallback(
    ({ clearSource = true, clearQueue = false } = {}) => {
      soundCloudTokenRef.current += 1;
      destroySoundCloudHls();

      const audioElement = soundCloudAudioRef.current;
      if (audioElement) {
        audioElement.pause();
        if (clearSource) {
          clearAudioElementSource(audioElement);
        }
      }

      setIsSoundCloudLoading(false);
      setSoundCloudError("");
      setSoundCloudInfo(SOUNDCLOUD_READY_MESSAGE);
      setSoundCloudTrackTitle(DEFAULT_SOUNDCLOUD_LABEL);
      setSoundCloudCurrentIndex(-1);
      clearScrubState();
      resetAudioTransportClock();
      setTransportSeekState(DEFAULT_TRANSPORT_SEEK_STATE);

      if (clearQueue) {
        soundCloudQueueRef.current = [];
        soundCloudCurrentIndexRef.current = -1;
        setSoundCloudQueue([]);
        setSoundCloudCollectionTitle(DEFAULT_SOUNDCLOUD_LABEL);
      }
    },
    [clearScrubState, destroySoundCloudHls],
  );

  const loadSoundCloudQueueIndex = useCallback(
    async (nextIndex, { autoPlay = false, reuseToken = false } = {}) => {
      const queue = soundCloudQueueRef.current;
      const track = queue[nextIndex];

      if (!track) {
        throw new Error("SoundCloud track is unavailable.");
      }

      const token = reuseToken
        ? soundCloudTokenRef.current
        : ++soundCloudTokenRef.current;
      const audioSession = getDefaultAudioSession();

      setIsSoundCloudLoading(true);
      setShowDeviceMenu(false);
      setPlaybackSource("soundcloud");
      setSoundCloudError("");
      setSoundCloudTrackTitle(track.title);
      setSoundCloudCurrentIndex(nextIndex);
      setSoundCloudInfo(
        formatQueueInfo(track, nextIndex, queue.length, "Buffering"),
      );

      audioSession.stopLiveInputStream();

      try {
        const stream = await resolveSoundCloudStream(track);
        if (token !== soundCloudTokenRef.current) {
          return;
        }

        const audioElement = ensureSoundCloudAudioElement();
        destroySoundCloudHls();
        clearAudioElementSource(audioElement);

        const hlsInstance = await attachStreamToAudioElement(
          audioElement,
          stream,
        );
        if (token !== soundCloudTokenRef.current) {
          hlsInstance?.destroy?.();
          return;
        }

        soundCloudHlsRef.current = hlsInstance;
        await audioSession.loadStream({
          element: audioElement,
          label: track.title,
          duration: track.durationSeconds,
          sourceKind: "soundcloud",
        });

        if (token !== soundCloudTokenRef.current) {
          return;
        }

        syncSessionStatus();
        setSoundCloudInfo(
          formatQueueInfo(
            track,
            nextIndex,
            queue.length,
            autoPlay ? "Playing" : "Ready",
          ),
        );

        if (autoPlay) {
          await audioSession.playPauseAudio();
          if (token !== soundCloudTokenRef.current) {
            return;
          }
          syncSessionStatus();
        }
      } catch (error) {
        if (token !== soundCloudTokenRef.current) {
          return;
        }
        setSoundCloudError(
          error?.message || "SoundCloud could not load that public stream.",
        );
        syncSessionStatus();
      } finally {
        if (token === soundCloudTokenRef.current) {
          setIsSoundCloudLoading(false);
        }
      }
    },
    [destroySoundCloudHls, ensureSoundCloudAudioElement, syncSessionStatus],
  );

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

  useEffect(() => {
    if (typeof Audio === "undefined") {
      return undefined;
    }

    const audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "");
    soundCloudAudioRef.current = audioElement;

    const handlePlaybackStateChange = () => {
      if (playbackSourceRef.current === "soundcloud") {
        syncSessionStatus();
      }
    };

    const handleEnded = () => {
      if (playbackSourceRef.current !== "soundcloud") {
        return;
      }

      const nextIndex = soundCloudCurrentIndexRef.current + 1;
      const queue = soundCloudQueueRef.current;
      if (nextIndex < queue.length) {
        void loadSoundCloudQueueIndex(nextIndex, {
          autoPlay: true,
        });
        return;
      }

      setSoundCloudInfo(
        formatQueueInfo(
          queue.at(-1),
          Math.max(0, soundCloudCurrentIndexRef.current),
          queue.length || 1,
          "Finished",
        ),
      );
      syncSessionStatus();
    };

    const handleError = () => {
      if (playbackSourceRef.current !== "soundcloud") {
        return;
      }
      setSoundCloudError("SoundCloud playback failed for this stream.");
      setIsSoundCloudLoading(false);
      syncSessionStatus();
    };

    audioElement.addEventListener("play", handlePlaybackStateChange);
    audioElement.addEventListener("pause", handlePlaybackStateChange);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);

    return () => {
      audioElement.removeEventListener("play", handlePlaybackStateChange);
      audioElement.removeEventListener("pause", handlePlaybackStateChange);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
      destroySoundCloudHls();
      clearAudioElementSource(audioElement);
      soundCloudAudioRef.current = null;
    };
  }, [destroySoundCloudHls, loadSoundCloudQueueIndex, syncSessionStatus]);

  const loadSoundCloudTrack = useCallback(async () => {
    if (!SOUNDCLOUD_ENABLED) {
      setIsSoundCloudLoading(false);
      setSoundCloudError("SoundCloud support is temporarily disabled.");
      return;
    }

    const nextUrl = soundCloudInput.trim();
    const requestToken = ++soundCloudTokenRef.current;

    setIsSoundCloudLoading(true);
    setShowDeviceMenu(false);
    setPlaybackSource("soundcloud");
    setCurrentLoadedLocalFile(null);
    clearLiveLocalFileState();
    setSoundCloudError("");

    try {
      const queueData = await resolveSoundCloudQueue(nextUrl);
      if (requestToken !== soundCloudTokenRef.current) {
        return;
      }

      soundCloudQueueRef.current = queueData.queue;
      soundCloudCurrentIndexRef.current = 0;
      setSoundCloudQueue(queueData.queue);
      setSoundCloudCurrentIndex(0);
      setSoundCloudCollectionTitle(queueData.title || DEFAULT_SOUNDCLOUD_LABEL);
      setSoundCloudTrackTitle(
        queueData.queue[0]?.title || DEFAULT_SOUNDCLOUD_LABEL,
      );
      setSoundCloudInput(queueData.canonicalUrl || nextUrl);
      setSoundCloudInfo(
        queueData.kind === "playlist"
          ? `${queueData.queue.length} public tracks loaded from ${queueData.title}.`
          : `Public track loaded from ${queueData.title}.`,
      );

      await loadSoundCloudQueueIndex(0, {
        autoPlay: false,
        reuseToken: true,
      });
    } catch (error) {
      if (requestToken !== soundCloudTokenRef.current) {
        return;
      }
      setIsSoundCloudLoading(false);
      setSoundCloudError(
        error?.message || "SoundCloud could not load that public link.",
      );
    }
  }, [clearLiveLocalFileState, loadSoundCloudQueueIndex, soundCloudInput]);

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
      setPlaybackSource("local-file");
      setSelectedSource("file");
      setShowDeviceMenu(false);
      setShowSoundCloudPanel(false);
      setLiveReturnLocalFile(null);
      if (clearQueuedNext) {
        setQueuedNextLocalFile(null);
      }
      return true;
    },
    [handleLocalRecentFileSelect, syncSessionStatus, syncTransportState],
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
      resetSoundCloudTransport();
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
          const audioSession = getDefaultAudioSession();
          if (isLiveInputActive) {
            audioSession.stopLiveInputStream();
          }
          setFileName(sourceName);
          await audioSession.loadAudio(sourceUrl);
          setCurrentLoadedLocalFile(null);
          setPlaybackSource("local-file");
          setSelectedSource("file");
          setShowDeviceMenu(false);
          setShowSoundCloudPanel(false);
          setLiveReturnLocalFile(null);
          setQueuedNextLocalFile(null);
          syncSessionStatus();
          syncTransportState();
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
      isLiveInputActive,
      loadImmediateLocalFile,
      resetSoundCloudTransport,
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
      if (playbackSourceRef.current === "soundcloud") {
        return;
      }

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
      resetSoundCloudTransport();
      setPlaybackSource("local-file");
      setShowDeviceMenu(false);
      setShowSoundCloudPanel(false);
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
      resetSoundCloudTransport,
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
      resetSoundCloudTransport();
      setPlaybackSource("local-file");
      setShowDeviceMenu(false);
      setShowSoundCloudPanel(false);
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
      resetSoundCloudTransport,
    ],
  );

  const handlePlayPause = useCallback(async () => {
    if (selectedSource === "system") {
      return;
    }

    if (playbackSource === "soundcloud") {
      if (!soundCloudQueueRef.current.length) {
        return;
      }

      const audioSession = getDefaultAudioSession();
      await audioSession.playPauseAudio();
      const status = syncSessionStatus();
      const currentTrack =
        soundCloudQueueRef.current[soundCloudCurrentIndexRef.current] || null;
      if (currentTrack) {
        setSoundCloudInfo(
          formatQueueInfo(
            currentTrack,
            Math.max(0, soundCloudCurrentIndexRef.current),
            soundCloudQueueRef.current.length,
            status.isPlaying ? "Playing" : "Paused",
          ),
        );
      }
      return;
    }

    await handleLocalPlayPause();
    syncTransportState();
  }, [
    playbackSource,
    handleLocalPlayPause,
    selectedSource,
    syncSessionStatus,
    syncTransportState,
  ]);

  const handleStop = useCallback(() => {
    if (selectedSource === "system") {
      return;
    }

    clearScrubState();
    if (playbackSource === "soundcloud") {
      getDefaultAudioSession().stopAudio();
      syncSessionStatus();

      const currentTrack =
        soundCloudQueueRef.current[soundCloudCurrentIndexRef.current] || null;
      if (currentTrack) {
        setSoundCloudInfo(
          formatQueueInfo(
            currentTrack,
            Math.max(0, soundCloudCurrentIndexRef.current),
            soundCloudQueueRef.current.length,
            "Stopped",
          ),
        );
      }
      return;
    }

    handleLocalStop();
    syncTransportState();
  }, [
    playbackSource,
    clearScrubState,
    handleLocalStop,
    selectedSource,
    syncSessionStatus,
    syncTransportState,
  ]);

  const handleLiveInputToggle = useCallback(async () => {
    clearScrubState();
    const liveReturnSnapshot = createLiveReturnSnapshot();

    if (!isLiveInputActive) {
      setLiveReturnLocalFile(liveReturnSnapshot);
      resetSoundCloudTransport();
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
    resetSoundCloudTransport,
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
        if (playbackSource === "soundcloud") {
          getDefaultAudioSession().stopAudio();
          syncSessionStatus();
        } else if (isAudioLoaded) {
          handleLocalStop();
          syncTransportState();
        }
      }

      if (isLiveInputActive && next === "file") {
        stopLiveInputSession();
        await restoreAfterLiveStop();
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
      playbackSource,
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
      syncSessionStatus,
      syncTransportState,
      stopLiveInputSession,
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
        setLiveReturnLocalFile(liveReturnSnapshot);
        resetSoundCloudTransport();
        const started = await startLiveInputSession({
          deviceId: selectedLiveDeviceId,
          deviceLabel: selectedLiveDevice?.label ?? "",
          liveInputKind: selectedLiveInputDeviceKind,
        });
        if (started) {
          setPlaybackSource("local-file");
          setFileName(DEFAULT_FILE_NAME);
        }
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
    resetSoundCloudTransport,
    selectedLiveDeviceId,
    selectedLiveDevice,
    selectedLiveInputDeviceKind,
    startLiveInputSession,
    stopLiveInputSession,
    syncSessionStatus,
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
      /** @type {Record<string, import("@baryon/visualizer/audio/liveInputAnalysis").ResolvedLiveInputAnalysisClass>} */
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
      if (nextVolume > 0.001) {
        lastNonZeroVolumeRef.current = nextVolume;
      }
    },
    [handleLocalVolumeChange],
  );

  const handleMuteToggle = useCallback(() => {
    if (playbackSource === "soundcloud") {
      const nextVolume =
        isMuted || volume <= 0.001
          ? Math.max(lastNonZeroVolumeRef.current, 0.35)
          : 0;
      handleVolumeChange(nextVolume);
      return;
    }

    handleLocalMuteToggle();
  }, [
    playbackSource,
    handleLocalMuteToggle,
    handleVolumeChange,
    isMuted,
    volume,
  ]);

  const displayName =
    playbackSource === "soundcloud" ? soundCloudTrackTitle : fileName;
  const hasQueuedNextLocalFile = Boolean(queuedNextLocalFile?.file);
  const soundCloudCurrentTrack =
    soundCloudQueue[soundCloudCurrentIndex] ?? soundCloudQueue[0] ?? null;

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
    resetSoundCloudTransport({
      clearQueue: true,
    });
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
    setPlaybackSource("local-file");
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
    setShowSoundCloudPanel(false);
    setSoundCloudInput("");
    setSoundCloudCollectionTitle(DEFAULT_SOUNDCLOUD_LABEL);
    setSoundCloudTrackTitle(DEFAULT_SOUNDCLOUD_LABEL);
    setSoundCloudError("");
    setSoundCloudInfo(SOUNDCLOUD_READY_MESSAGE);
    resetAudioTransportClock();
    setTransportSeekState(DEFAULT_TRANSPORT_SEEK_STATE);

    return audioSession.dispose();
  }, [clearScrubState, isWebPlatform, resetSoundCloudTransport, storage]);

  useEffect(() => {
    return () => {
      void resetAudioSession();
    };
  }, [resetAudioSession]);

  const sceneValue = useMemo(
    () => ({
      setIsPlaying,
      setIsAudioLoaded,
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
      setIsAudioLoaded,
      setIsEngineReady,
      setIsPlaying,
      setLiveInputRuntimeStatus,
    ],
  );

  const value = useMemo(
    () => ({
      soundCloudEnabled: SOUNDCLOUD_ENABLED,
      platform: audioPlatform,
      playbackSource,
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
      showSoundCloudPanel,
      soundCloudInput,
      soundCloudError,
      soundCloudInfo,
      soundCloudQueue,
      soundCloudCollectionTitle,
      soundCloudCurrentTrack,
      soundCloudCurrentIndex,
      isSoundCloudLoading,
      scrubPreviewSeconds,
      isScrubbing,
      setIsPlaying,
      setIsAudioLoaded,
      setIsEngineReady,
      setVolume,
      setIsMuted,
      setShowDeviceMenu,
      setSelectedDevice,
      setLiveInputRuntimeStatus,
      setShowSoundCloudPanel,
      setSoundCloudInput,
      setSelectedSource,
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
      handleSourceChange,
      handleVolumeChange,
      handleMuteToggle,
      loadProbeAudioFile,
      stopProbeAudio,
      loadSoundCloudTrack,
      beginScrub,
      previewScrub,
      commitScrub,
      cancelScrub,
    }),
    [
      playbackSource,
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
      isSoundCloudLoading,
      liveInputAnalysisClass,
      liveInputAcousticIntent,
      liveInputDeviceKind,
      liveInputErrorCode,
      liveInputKind,
      liveInputPermissionState,
      liveInputRuntimeStatus,
      liveInputUiState,
      liveReturnLocalFile,
      loadProbeAudioFile,
      loadSoundCloudTrack,
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
      setIsAudioLoaded,
      setIsEngineReady,
      setIsMuted,
      setIsPlaying,
      setLiveInputRuntimeStatus,
      setSelectedDevice,
      setSelectedLiveInputAnalysisClass,
      setLiveInputAcousticIntent,
      setSelectedSource,
      setShowDeviceMenu,
      setShowSoundCloudPanel,
      setSoundCloudInput,
      setVolume,
      showDeviceMenu,
      showSoundCloudPanel,
      soundCloudCollectionTitle,
      soundCloudCurrentIndex,
      soundCloudCurrentTrack,
      soundCloudError,
      soundCloudInfo,
      soundCloudInput,
      soundCloudQueue,
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
