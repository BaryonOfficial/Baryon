import React, { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultAudioSession } from "@baryon/visualizer";
import { AudioContext } from "./AudioContext";
import { useAudioLogic } from "../components/hooks/useAudioLogic";
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

export function AudioProvider({ children }) {
  const [fileName, setFileName] = useState(DEFAULT_FILE_NAME);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [activeSource, setActiveSource] = useState("upload");
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

  const soundCloudAudioRef = useRef(null);
  const soundCloudHlsRef = useRef(null);
  const soundCloudTokenRef = useRef(0);
  const soundCloudQueueRef = useRef([]);
  const soundCloudCurrentIndexRef = useRef(-1);
  const activeSourceRef = useRef("upload");
  const lastNonZeroVolumeRef = useRef(1);

  const {
    handleFileChange: handleLocalFileChange,
    handlePlayPause: handleLocalPlayPause,
    handleStop: handleLocalStop,
    handleMicToggle: handleLocalMicToggle,
    handleVolumeChange: handleLocalVolumeChange,
    handleMuteToggle: handleLocalMuteToggle,
  } = useAudioLogic({
    setFileName,
    setIsAudioLoaded,
    setIsPlaying,
    setIsMicActive,
    setVolume,
    setIsMuted,
    setAudioDevices,
    setSelectedDevice,
    isAudioLoaded,
    isMicActive,
    selectedDevice,
  });

  useEffect(() => {
    soundCloudQueueRef.current = soundCloudQueue;
  }, [soundCloudQueue]);

  useEffect(() => {
    soundCloudCurrentIndexRef.current = soundCloudCurrentIndex;
  }, [soundCloudCurrentIndex]);

  useEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  const syncSessionStatus = useCallback(() => {
    const status = getDefaultAudioSession().getStatus();
    setIsAudioLoaded(status.isAudioLoaded);
    setIsPlaying(status.isPlaying);
    setIsMicActive(status.isMicActive);
    setVolume(status.volume ?? 1);
    setIsMuted(status.muted ?? false);
    if ((status.volume ?? 0) > 0.001) {
      lastNonZeroVolumeRef.current = status.volume;
    }
    return status;
  }, []);

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

      if (clearQueue) {
        soundCloudQueueRef.current = [];
        soundCloudCurrentIndexRef.current = -1;
        setSoundCloudQueue([]);
        setSoundCloudCollectionTitle(DEFAULT_SOUNDCLOUD_LABEL);
      }
    },
    [destroySoundCloudHls],
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
      setActiveSource("soundcloud");
      setSoundCloudError("");
      setSoundCloudTrackTitle(track.title);
      setSoundCloudCurrentIndex(nextIndex);
      setSoundCloudInfo(
        formatQueueInfo(track, nextIndex, queue.length, "Buffering"),
      );

      audioSession.stopMicRecordStream();

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
    if (typeof Audio === "undefined") {
      return undefined;
    }

    const audioElement = new Audio();
    audioElement.crossOrigin = "anonymous";
    audioElement.preload = "auto";
    audioElement.setAttribute("playsinline", "");
    soundCloudAudioRef.current = audioElement;

    const handlePlaybackStateChange = () => {
      if (activeSourceRef.current === "soundcloud") {
        syncSessionStatus();
      }
    };

    const handleEnded = () => {
      if (activeSourceRef.current !== "soundcloud") {
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
      if (activeSourceRef.current !== "soundcloud") {
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
    setActiveSource("soundcloud");
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
  }, [loadSoundCloudQueueIndex, soundCloudInput]);

  const handleFileChange = useCallback(
    (event) => {
      resetSoundCloudTransport();
      setActiveSource("upload");
      setShowSoundCloudPanel(false);
      handleLocalFileChange(event);
    },
    [handleLocalFileChange, resetSoundCloudTransport],
  );

  const handlePlayPause = useCallback(async () => {
    if (activeSource === "soundcloud") {
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
  }, [activeSource, handleLocalPlayPause, syncSessionStatus]);

  const handleStop = useCallback(() => {
    if (activeSource === "soundcloud") {
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
  }, [activeSource, handleLocalStop, syncSessionStatus]);

  const handleMicToggle = useCallback(async () => {
    if (!isMicActive) {
      resetSoundCloudTransport();
      setActiveSource("mic");
    }
    await handleLocalMicToggle();
    if (isMicActive) {
      setActiveSource("upload");
    }
  }, [handleLocalMicToggle, isMicActive, resetSoundCloudTransport]);

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
    if (activeSource === "soundcloud") {
      const nextVolume =
        isMuted || volume <= 0.001
          ? Math.max(lastNonZeroVolumeRef.current, 0.35)
          : 0;
      handleVolumeChange(nextVolume);
      return;
    }

    handleLocalMuteToggle();
  }, [
    activeSource,
    handleLocalMuteToggle,
    handleVolumeChange,
    isMuted,
    volume,
  ]);

  const displayName =
    activeSource === "soundcloud" ? soundCloudTrackTitle : fileName;
  const soundCloudCurrentTrack =
    soundCloudQueue[soundCloudCurrentIndex] ?? soundCloudQueue[0] ?? null;

  const resetAudioSession = useCallback(() => {
    const audioSession = getDefaultAudioSession();

    resetSoundCloudTransport({
      clearQueue: true,
    });
    setFileName(DEFAULT_FILE_NAME);
    setIsPlaying(false);
    setIsMicActive(false);
    setIsAudioLoaded(false);
    setShowDeviceMenu(false);
    setIsEngineReady(false);
    setActiveSource("upload");
    setShowSoundCloudPanel(false);
    setSoundCloudInput("");
    setSoundCloudCollectionTitle(DEFAULT_SOUNDCLOUD_LABEL);
    setSoundCloudTrackTitle(DEFAULT_SOUNDCLOUD_LABEL);
    setSoundCloudError("");
    setSoundCloudInfo(SOUNDCLOUD_READY_MESSAGE);

    return audioSession.dispose();
  }, [resetSoundCloudTransport]);

  useEffect(() => {
    return () => {
      void resetAudioSession();
    };
  }, [resetAudioSession]);

  const value = {
    soundCloudEnabled: SOUNDCLOUD_ENABLED,
    activeSource,
    fileName,
    displayName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    audioDevices,
    selectedDevice,
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
    setIsPlaying,
    setIsAudioLoaded,
    setIsEngineReady,
    setVolume,
    setIsMuted,
    setShowDeviceMenu,
    setSelectedDevice,
    setShowSoundCloudPanel,
    setSoundCloudInput,
    resetAudioSession,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
    loadSoundCloudTrack,
  };

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}
