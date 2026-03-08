import { useCallback, useEffect } from "react";
import {
  loadAudio,
  startMicRecordStream,
  stopMicRecordStream,
  playPauseAudio,
  stopAudio,
  setAudioInputMode,
} from "../core/audio/audioSetup.js";

export function useSharedAudioLogic({
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === "audioinput");
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

  const handleFileChange = useCallback(
    (event) => {
      const file = event.target.files[0];
      if (!file) return;

      if (isMicActive) {
        stopMicRecordStream();
        setIsMicActive(false);
      }

      setAudioInputMode("file");
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
    },
    [isMicActive, setFileName, setIsAudioLoaded, setIsMicActive, setIsPlaying]
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
    setAudioInputMode("idle");
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleMicToggle = useCallback(async () => {
    try {
      if (isMicActive) {
        stopMicRecordStream();
        setAudioInputMode("idle");
      } else {
        stopAudio();
        setIsPlaying(false);
        await startMicRecordStream(selectedDevice);
        setAudioInputMode("mic");
      }
      setIsMicActive((prev) => !prev);
    } catch (error) {
      console.error("Error toggling microphone:", error);
    }
  }, [isMicActive, selectedDevice, setIsMicActive, setIsPlaying]);

  return {
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
  };
}
