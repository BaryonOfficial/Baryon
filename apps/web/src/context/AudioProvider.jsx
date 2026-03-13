import React, { useCallback, useEffect, useState } from "react";
import { getDefaultAudioSession } from "@baryon/visualizer";
import { AudioContext } from "./AudioContext";
import { useAudioLogic } from "../components/hooks/useAudioLogic";

const DEFAULT_FILE_NAME = "Upload Audio";

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

  const {
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
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

  const resetAudioSession = useCallback(() => {
    const audioSession = getDefaultAudioSession();

    setFileName(DEFAULT_FILE_NAME);
    setIsPlaying(false);
    setIsMicActive(false);
    setIsAudioLoaded(false);
    setShowDeviceMenu(false);
    setIsEngineReady(false);

    return audioSession.dispose();
  }, []);

  useEffect(() => {
    return () => {
      void resetAudioSession();
    };
  }, [resetAudioSession]);

  const value = {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    volume,
    isMuted,
    isEngineReady,
    audioDevices,
    selectedDevice,
    showDeviceMenu,
    setIsPlaying,
    setIsAudioLoaded,
    setIsEngineReady,
    setVolume,
    setIsMuted,
    setShowDeviceMenu,
    setSelectedDevice,
    resetAudioSession,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    handleVolumeChange,
    handleMuteToggle,
  };

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}
