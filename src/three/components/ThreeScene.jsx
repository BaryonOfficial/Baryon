import React, { useEffect, useRef, useState } from "react";
import useThreeScene from "../scene/useThreeScene";
import AudioControls from "../../components/AudioControls";
import UnsupportedWarning from "../../components/UnsupportedWarning.jsx";
import { useFullscreen } from "../../components/hooks/useFullScreenToggle.jsx";
import { useAudioLogic } from "../../components/hooks/useAudioLogic";

const ThreeScene = () => {
  // Refs for canvas and GUI container
  const canvasRef = useRef(null);
  const guiContainerRef = useRef(null);

  // Custom hook to toggle fullscreen mode
  const toggleFullscreen = useFullscreen(canvasRef);

  // UI state variables
  const [fileName, setFileName] = useState("Upload Audio");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  const [isUnsupported, setIsUnsupported] = useState(false);

  // Audio input device management
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  // Hook to initialize and run the Three.js + GPGPU scene
  useThreeScene(canvasRef, guiContainerRef, setIsPlaying, setIsAudioLoaded);

  // Detect unsupported environments (e.g., mobile, Firefox, Safari)
  useEffect(() => {
    const isUnsupportedEnv = () =>
      /Android|iPhone|iPad/i.test(navigator.userAgent) ||
      navigator.userAgent.includes("Firefox") ||
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    setIsUnsupported(isUnsupportedEnv());
  }, []);

  // Audio logic handlers (file input, play/pause, mic toggle, etc.)
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

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        zIndex: 1,
      }}
    >
      {/* WebGL canvas rendered by Three.js */}
      <canvas ref={canvasRef} className="webgl absolute z-10" />

      {/* Fullscreen toggle button */}
      <button onClick={toggleFullscreen}>Toggle Fullscreen</button>

      {/* If browser is supported, show GUI + controls */}
      {!isUnsupported && (
        <>
          {/* GUI container for lil-gui or dat.GUI */}
          <div
            ref={guiContainerRef}
            className="fixed top-20 right-0 z-50"
          ></div>

          {/* Audio controls component */}
          <AudioControls
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
        </>
      )}

      {/* Show a warning if the environment is unsupported */}
      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};

export default ThreeScene;
