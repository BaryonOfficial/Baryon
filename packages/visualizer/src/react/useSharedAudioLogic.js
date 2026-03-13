import { useCallback, useEffect, useRef } from "react";
import { getDefaultAudioSession } from "../core/audio/audioSetup.js";

export function useSharedAudioLogic({
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
}) {
  const audioSession = getDefaultAudioSession();
  const activeFileUrlRef = useRef(null);

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
      if (activeFileUrlRef.current) {
        URL.revokeObjectURL(activeFileUrlRef.current);
        activeFileUrlRef.current = null;
      }
    };
  }, []);

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files[0];
      if (!file) return;

      if (isMicActive) {
        audioSession.stopMicRecordStream();
      }

      setFileName(file.name);
      const fileURL = URL.createObjectURL(file);
      const previousFileUrl = activeFileUrlRef.current;
      audioSession
        .loadAudio(fileURL)
        .then(() => {
          if (previousFileUrl && previousFileUrl !== fileURL) {
            URL.revokeObjectURL(previousFileUrl);
          }
          activeFileUrlRef.current = fileURL;
          syncStatus();
        })
        .catch((error) => {
          URL.revokeObjectURL(fileURL);
          console.error("Error loading audio:", error);
          setIsAudioLoaded(false);
        });
    },
    [audioSession, isMicActive, setFileName, setIsAudioLoaded, syncStatus],
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
        audioSession.stopAudio();
        await audioSession.startMicRecordStream(selectedDevice);
      }
      syncStatus();
    } catch (error) {
      console.error("Error toggling microphone:", error);
    }
  }, [audioSession, isMicActive, selectedDevice, syncStatus]);

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

  return {
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
  };
}
