import {
  loadAudio,
  startMicRecordStream,
  stopMicRecordStream,
  playPauseAudio,
  stopAudio,
} from "../../core/audio/audioSetup";
import { useEffect, useCallback } from "react";

export function useAudioLogic({
  setFileName,
  setIsAudioLoaded,
  setIsPlaying,
  setIsMicActive,
  setAudioDevices,
  setSelectedDevice,
  isAudioLoaded,
  isMicActive,
  selectedDevice,
}) {
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");

        setAudioDevices(audioInputs);
        if (audioInputs.length > 0) setSelectedDevice(audioInputs[0].deviceId);
      } catch (err) {
        console.error("Error loading audio devices:", err);
      }
    };

    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
    };
  }, []);

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files[0];
      if (file) {
        setFileName(file.name);
        const fileURL = URL.createObjectURL(file);
        loadAudio(fileURL)
          .then(() => {
            setIsAudioLoaded(true);
            setIsPlaying(false);
          })
          .catch((error) => {
            console.error("Error loading audio:", error);
            setIsAudioLoaded(false);
          });
      }
    },
    [setFileName, setIsAudioLoaded, setIsPlaying]
  );

  const handlePlayPause = useCallback(async () => {
    if (!isAudioLoaded) return;
    try {
      const isNowPlaying = await playPauseAudio();
      setIsPlaying(isNowPlaying);
    } catch (error) {
      console.error("Error in play/pause:", error);
    }
  }, [isAudioLoaded, setIsPlaying]);

  const handleStop = useCallback(() => {
    stopAudio();
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleMicToggle = useCallback(async () => {
    try {
      if (isMicActive) {
        stopMicRecordStream();
      } else {
        await startMicRecordStream(selectedDevice);
      }
      setIsMicActive((prev) => !prev);
    } catch (error) {
      console.error("Error toggling microphone:", error);
    }
  }, [isMicActive, selectedDevice, setIsMicActive]);

  return {
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
  };
}
