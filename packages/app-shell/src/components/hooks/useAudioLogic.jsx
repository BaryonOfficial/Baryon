import { useCallback, useEffect, useRef } from "react";
import { getDefaultAudioSession } from "@baryon/engine/audio";

export function useAudioLogic({
  setFileName,
  resetFileName,
  registerRecentFile,
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
}) {
  const audioSession = getDefaultAudioSession();
  const activeFileUrlRef = useRef(null);
  const fileLoadRequestIdRef = useRef(0);

  const releaseLoadedFileResource = useCallback(() => {
    fileLoadRequestIdRef.current += 1;
    if (activeFileUrlRef.current) {
      URL.revokeObjectURL(activeFileUrlRef.current);
      activeFileUrlRef.current = null;
    }
  }, []);

  const refreshAudioInputs = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      setAudioDevices([]);
      return [];
    }

    try {
      const devices = await mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput",
      );
      setAudioDevices(audioInputs);
      if (audioInputs.length === 0) {
        return audioInputs;
      }

      const hasSelectedDevice = audioInputs.some(
        (device) => device.deviceId === selectedDevice,
      );
      if (!hasSelectedDevice) {
        setSelectedDevice(audioInputs[0].deviceId);
      }
      return audioInputs;
    } catch (error) {
      console.error("Error loading audio devices:", error);
      return [];
    }
  }, [selectedDevice, setAudioDevices, setSelectedDevice]);

  const clearLoadedFileState = useCallback(
    ({ resetLabel = true } = {}) => {
      releaseLoadedFileResource();
      if (resetLabel) {
        resetFileName?.();
      }
    },
    [releaseLoadedFileResource, resetFileName],
  );

  const syncStatus = useCallback(() => {
    const status = audioSession.getStatus();
    setIsAudioLoaded(status.isAudioLoaded);
    setIsPlaying(status.isPlaying);
    setIsLiveInputActive(status.isLiveInputActive);
    setLiveInputDeviceKind?.(status.liveInputDeviceKind ?? null);
    setVolume?.(status.volume ?? 1);
    setIsMuted?.(status.muted ?? false);
    return status;
  }, [
    audioSession,
    setIsAudioLoaded,
    setIsLiveInputActive,
    setIsPlaying,
    setLiveInputDeviceKind,
    setVolume,
    setIsMuted,
  ]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    refreshAudioInputs();
    mediaDevices?.addEventListener?.("devicechange", refreshAudioInputs);
    return () => {
      mediaDevices?.removeEventListener?.("devicechange", refreshAudioInputs);
    };
  }, [refreshAudioInputs]);

  useEffect(() => {
    return () => {
      releaseLoadedFileResource();
    };
  }, [releaseLoadedFileResource]);

  const loadLocalFile = useCallback(
    async (file) => {
      if (!file) {
        return false;
      }

      if (isLiveInputActive) {
        audioSession.stopLiveInputStream();
      }

      setFileName(file.name);
      const fileURL = URL.createObjectURL(file);
      const previousFileUrl = activeFileUrlRef.current;
      const requestId = ++fileLoadRequestIdRef.current;

      try {
        const loaded = await audioSession.loadAudio(fileURL);
        if (requestId !== fileLoadRequestIdRef.current || loaded === false) {
          URL.revokeObjectURL(fileURL);
          return false;
        }
        if (previousFileUrl && previousFileUrl !== fileURL) {
          URL.revokeObjectURL(previousFileUrl);
        }
        activeFileUrlRef.current = fileURL;
        registerRecentFile?.(file);
        syncStatus();
        return true;
      } catch (error) {
        URL.revokeObjectURL(fileURL);
        if (requestId !== fileLoadRequestIdRef.current) {
          return false;
        }
        console.error("Error loading audio:", error);
        setIsAudioLoaded(false);
        return false;
      }
    },
    [
      audioSession,
      isLiveInputActive,
      registerRecentFile,
      setFileName,
      setIsAudioLoaded,
      syncStatus,
    ],
  );

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files[0];
      if (!file) return false;
      return loadLocalFile(file);
    },
    [loadLocalFile],
  );

  const handlePlayPause = useCallback(async () => {
    if (!isAudioLoaded) return;
    try {
      await audioSession.playPauseAudio();
      syncStatus();
    } catch (error) {
      console.error("Error in play/pause:", error);
    }
  }, [audioSession, isAudioLoaded, syncStatus]);

  const handleStop = useCallback(() => {
    audioSession.stopAudio();
    syncStatus();
  }, [audioSession, syncStatus]);

  const handleLiveInputToggle = useCallback(async () => {
    try {
      if (isLiveInputActive) {
        audioSession.stopLiveInputStream();
      } else {
        clearLoadedFileState();
        audioSession.stopAudio();
        await audioSession.startLiveInputStream(selectedDevice);
      }
      syncStatus();
    } catch (error) {
      console.error("Error toggling live input:", error);
      syncStatus();
    }
  }, [
    audioSession,
    clearLoadedFileState,
    isLiveInputActive,
    selectedDevice,
    syncStatus,
  ]);

  const handleVolumeChange = useCallback(
    (value) => {
      audioSession.setVolume(value);
      syncStatus();
    },
    [audioSession, syncStatus],
  );

  const handleMuteToggle = useCallback(() => {
    const { muted } = audioSession.getStatus();
    audioSession.setMuted(!muted);
    syncStatus();
  }, [audioSession, syncStatus]);

  const handleRecentFileSelect = useCallback(
    async (file) => {
      return loadLocalFile(file);
    },
    [loadLocalFile],
  );

  return {
    handleFileChange,
    handleRecentFileSelect,
    handlePlayPause,
    handleStop,
    handleLiveInputToggle,
    handleVolumeChange,
    handleMuteToggle,
    refreshAudioInputs,
  };
}
