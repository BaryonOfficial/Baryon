import React, { useCallback, useEffect, useRef, useState } from "react";
import useThreeScene from "@baryon/visualizer/hooks/useThreeScene";
import AudioControls from "./AudioControls";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useAudio } from "../context/AudioContext";
import { initGUI } from "../debug/initGui";
import { guiSetup } from "../debug/guiSetup";

const ThreeScene = () => {
  // Refs for canvas and GUI container
  const canvasRef = useRef(null);
  const guiContainerRef = useRef(null);
  const guiRef = useRef(null);

  // Custom hook to toggle fullscreen mode (handles 'f' key press)
  useFullscreen(canvasRef);

  const [isUnsupported, setIsUnsupported] = useState(false);

  // Audio state callbacks come from AudioProvider context
  const { setIsPlaying, setIsAudioLoaded } = useAudio();

  // Called by useThreeScene once the async model/GPGPU setup resolves
  const handleSetupComplete = useCallback((params) => {
    if (!guiContainerRef.current) return;
    guiRef.current = initGUI(guiContainerRef);
    guiSetup(
      guiRef.current,
      params.unrealBloomPass,
      params.renderer,
      params.particles,
      params.gpgpu,
      params.debugObject,
      params.materialParameters,
      params.parameters
    );
  }, []);

  // Hook to initialize and run the Three.js + GPGPU scene
  useThreeScene(canvasRef, setIsPlaying, setIsAudioLoaded, handleSetupComplete);

  // Destroy GUI on unmount
  useEffect(() => () => guiRef.current?.destroy(), []);

  // Detect unsupported environments (e.g., mobile, Firefox, Safari)
  useEffect(() => {
    const isUnsupportedEnv = () =>
      /Android|iPhone|iPad/i.test(navigator.userAgent) ||
      navigator.userAgent.includes("Firefox") ||
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    setIsUnsupported(isUnsupportedEnv());
  }, []);

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

      {/* If browser is supported, show GUI + controls */}
      {!isUnsupported && (
        <>
          {/* GUI container for lil-gui */}
          <div
            ref={guiContainerRef}
            className="fixed top-20 right-0 z-50"
          ></div>

          {/* Audio controls — reads all state from AudioContext */}
          <AudioControls />
        </>
      )}

      {/* Show a warning if the environment is unsupported */}
      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};

export default ThreeScene;
