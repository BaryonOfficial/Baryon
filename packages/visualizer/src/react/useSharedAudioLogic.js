import { useCallback, useEffect, useRef } from "react";
import { getDefaultAudioSession } from "../core/audio/audioSetup.js";
import { DEFAULT_MIC_ANALYSIS_SETTINGS } from "../utils/audioFeatures.js";

export function useSharedAudioLogic({
  setFileName,
  resetFileName,
  registerRecentFile,
  setIsAudioLoaded,
  setIsPlaying,
  setIsMicActive,
  setVolume,
  setIsMuted,
  setAudioDevices,
  setSelectedDevice,
  setSelectedMicProfile,
  isAudioLoaded,
  isMicActive,
  selectedDevice,
  selectedMicProfile,
}) {
  const audioSession = getDefaultAudioSession();
  const activeFileUrlRef = useRef(null);
  void selectedMicProfile;

  const clearLoadedFileState = useCallback(
    ({ resetLabel = true } = {}) => {
      if (activeFileUrlRef.current) {
        URL.revokeObjectURL(activeFileUrlRef.current);
        activeFileUrlRef.current = null;
      }
      if (resetLabel) {
        resetFileName?.();
      }
    },
    [resetFileName],
  );

  const syncStatus = useCallback(() => {
    const status = audioSession.getStatus();
    setIsAudioLoaded(status.isAudioLoaded);
    setIsPlaying(status.isPlaying);
    setIsMicActive(status.isMicActive);
    setVolume?.(status.volume ?? 1);
    setIsMuted?.(status.muted ?? false);
    return status;
  }, [
    audioSession,
    setIsAudioLoaded,
    setIsMicActive,
    setIsPlaying,
    setVolume,
    setIsMuted,
  ]);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput",
        );
        setAudioDevices(audioInputs);
        if (audioInputs.length > 0) {
          setSelectedDevice(audioInputs[0].deviceId);
        }
      } catch (error) {
        console.error("Error loading audio devices:", error);
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, [setAudioDevices, setSelectedDevice]);

  useEffect(() => {
    return () => {
      clearLoadedFileState({ resetLabel: false });
    };
  }, [clearLoadedFileState]);

  const loadLocalFile = useCallback(
    async (file) => {
      if (!file) {
        return false;
      }

      if (isMicActive) {
        audioSession.stopMicRecordStream();
      }

      setFileName(file.name);
      const fileURL = URL.createObjectURL(file);
      const previousFileUrl = activeFileUrlRef.current;

      try {
        await audioSession.loadAudio(fileURL);
        if (previousFileUrl && previousFileUrl !== fileURL) {
          URL.revokeObjectURL(previousFileUrl);
        }
        activeFileUrlRef.current = fileURL;
        registerRecentFile?.(file);
        syncStatus();
        return true;
      } catch (error) {
        URL.revokeObjectURL(fileURL);
        console.error("Error loading audio:", error);
        setIsAudioLoaded(false);
        return false;
      }
    },
    [
      audioSession,
      isMicActive,
      registerRecentFile,
      setFileName,
      setIsAudioLoaded,
      syncStatus,
    ],
  );

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files[0];
      if (!file) return;
      void loadLocalFile(file);
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

  const handleMicToggle = useCallback(async () => {
    try {
      if (isMicActive) {
        audioSession.stopMicRecordStream();
      } else {
        clearLoadedFileState();
        audioSession.stopAudio();
        await audioSession.startMicRecordStream(selectedDevice);
      }
      syncStatus();
    } catch (error) {
      console.error("Error toggling microphone:", error);
      syncStatus();
    }
  }, [
    audioSession,
    clearLoadedFileState,
    isMicActive,
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

  const handleMicProfileChange = useCallback(
    (profile) => {
      setSelectedMicProfile?.(profile ?? DEFAULT_MIC_ANALYSIS_SETTINGS.profile);
    },
    [setSelectedMicProfile],
  );

  const handleRecentFileSelect = useCallback(
    async (file) => {
      await loadLocalFile(file);
    },
    [loadLocalFile],
  );

  return {
    handleFileChange,
    handleRecentFileSelect,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
    handleMicProfileChange,
  };
}
