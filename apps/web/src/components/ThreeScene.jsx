import { useEffect, useRef, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import { BaryonScene } from "./BaryonScene";
import AudioControls from "./AudioControls";
import ParticleDebugOverlay from "./ParticleDebugOverlay.jsx";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useAudio } from "../context/AudioContext";

const ThreeScene = () => {
  const containerRef = useRef(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // fullscreen targets the outer container div
  useFullscreen(containerRef);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const { setIsPlaying, setIsAudioLoaded, setIsEngineReady } = useAudio();

  useEffect(() => {
    const isUnsupportedEnv = () =>
      !navigator.gpu ||
      /Android|iPhone|iPad/i.test(navigator.userAgent) ||
      navigator.userAgent.includes("Firefox") ||
      /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setIsUnsupported(isUnsupportedEnv());
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        position: "absolute",
        zIndex: 1,
        background: "#000000",
      }}
    >
      <Canvas
        style={{ position: "absolute", top: 0, left: 0, zIndex: 10 }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 12], fov: 35, near: 0.1, far: 100 }}
        // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
        gl={async (glDefaults) => {
          // @ts-ignore — glDefaults is { canvas, powerPreference, antialias, alpha }
          const renderer = new WebGPURenderer({
            canvas: /** @type {HTMLCanvasElement} */ (glDefaults.canvas),
            antialias: true,
          });
          await renderer.init();
          return renderer;
        }}
      >
        <Suspense fallback={null}>
          <BaryonScene
            setIsPlaying={setIsPlaying}
            setIsAudioLoaded={setIsAudioLoaded}
            setIsEngineReady={setIsEngineReady}
          />
        </Suspense>
      </Canvas>

      {!isUnsupported && !isFullscreen && <AudioControls />}
      <ParticleDebugOverlay />

      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};

export default ThreeScene;
