import React, { useState } from "react";
import { AudioContext } from "./AudioContext";
import { useAudioLogic } from "../components/hooks/useAudioLogic";

export function AudioProvider({ children }) {
  const [fileName, setFileName] = useState("Upload Audio");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  const { handleFileChange, handlePlayPause, handleStop, handleMicToggle } =
    useAudioLogic({
      setFileName,
      setIsAudioLoaded,
      setIsPlaying,
      setIsMicActive,
      setAudioDevices,
      setSelectedDevice,
      isAudioLoaded,
      isMicActive,
      selectedDevice,
    });

  const value = {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    audioDevices,
    selectedDevice,
    showDeviceMenu,
    setIsPlaying,
    setIsAudioLoaded,
    setShowDeviceMenu,
    setSelectedDevice,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
