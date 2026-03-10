import React from "react";
import { AudioControlsView } from "@baryon/visualizer";
import "@baryon/visualizer/styles.css";
import { useAudio } from "../context/AudioContext";

function AudioControls() {
  const {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    showDeviceMenu,
    audioDevices,
    selectedDevice,
    handleFileChange,
    handlePlayPause,
    handleStop,
    handleMicToggle,
    setShowDeviceMenu,
    setSelectedDevice,
  } = useAudio();

  return (
    <AudioControlsView
      fileName={fileName}
      isPlaying={isPlaying}
      isMicActive={isMicActive}
      isAudioLoaded={isAudioLoaded}
      showDeviceMenu={showDeviceMenu}
      audioDevices={audioDevices}
      selectedDevice={selectedDevice}
      handleFileChange={handleFileChange}
      handlePlayPause={handlePlayPause}
      handleStop={handleStop}
      handleMicToggle={handleMicToggle}
      setShowDeviceMenu={setShowDeviceMenu}
      setSelectedDevice={setSelectedDevice}
    />
  );
}

export default AudioControls;
