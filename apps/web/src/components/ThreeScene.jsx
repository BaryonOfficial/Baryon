import { useEffect, useRef, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import { BaryonScene } from "./BaryonScene";
import AudioControls from "./AudioControls";
import ParticleDebugOverlay from "./ParticleDebugOverlay.jsx";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useBaryonControls } from "./hooks/useBaryonControls";
import { useAudio } from "../context/AudioContext";

const CANVAS_SWAP_DELAY_MS = 650;

function clearRendererDiagnostics() {
  if (typeof window === "undefined") {
    return;
  }

  delete window.__baryonRendererInfo;
  delete window.__baryonAuditSnapshot;
}

function isUnsupportedEnv(forceWebGLFallbackTest) {
  if (forceWebGLFallbackTest) {
    return false;
  }

  return (
    !navigator.gpu ||
    /Android|iPhone|iPad/i.test(navigator.userAgent) ||
    navigator.userAgent.includes("Firefox") ||
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  );
}

const ThreeScene = () => {
  const containerRef = useRef(null);
  const rendererModeRef = useRef(null);
  const hasMountedCanvasRef = useRef(false);
  const controlsRef = useBaryonControls();
  const initialRendererFallback = Boolean(
    /** @type {any} */ (controlsRef.current).forceWebGLFallbackTest,
  );
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceWebGLFallbackTest, setForceWebGLFallbackTest] = useState(
    initialRendererFallback,
  );
  const [activeRendererFallback, setActiveRendererFallback] = useState(
    initialRendererFallback,
  );
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [showCanvas, setShowCanvas] = useState(true);

  // fullscreen targets the outer container div
  useFullscreen(containerRef);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const {
    setIsPlaying,
    setIsAudioLoaded,
    setIsEngineReady,
    resetAudioSession,
  } = useAudio();

  useEffect(() => {
    setIsUnsupported(isUnsupportedEnv(forceWebGLFallbackTest));
  }, [forceWebGLFallbackTest]);

  useEffect(() => {
    const handleControlsChange = (event) => {
      setForceWebGLFallbackTest(
        Boolean(event.detail?.forceWebGLFallbackTest ?? false),
      );
    };

    window.addEventListener("__baryon-controls-change", handleControlsChange);
    return () =>
      window.removeEventListener(
        "__baryon-controls-change",
        handleControlsChange,
      );
  }, []);

  useEffect(() => {
    if (!hasMountedCanvasRef.current) {
      hasMountedCanvasRef.current = true;
      rendererModeRef.current = forceWebGLFallbackTest;
      return;
    }

    if (rendererModeRef.current === forceWebGLFallbackTest) {
      return;
    }

    rendererModeRef.current = forceWebGLFallbackTest;
    void resetAudioSession();
    setIsEngineReady(false);
    setShowCanvas(false);
    clearRendererDiagnostics();

    const timeout = window.setTimeout(() => {
      setActiveRendererFallback(forceWebGLFallbackTest);
      setCanvasEpoch((value) => value + 1);
      setShowCanvas(true);
    }, CANVAS_SWAP_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [forceWebGLFallbackTest, resetAudioSession, setIsEngineReady]);

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
      {showCanvas && (
        <Canvas
          key={`${activeRendererFallback ? "force-webgl-fallback" : "webgpu-default"}-${canvasEpoch}`}
          style={{ position: "absolute", top: 0, left: 0, zIndex: 10 }}
          dpr={[1, 2]}
          camera={{ position: [0, 0, 14], fov: 35, near: 0.1, far: 100 }}
          // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
          gl={async (glDefaults) => {
            const canvas = /** @type {HTMLCanvasElement} */ (glDefaults.canvas);
            const context = activeRendererFallback
              ? canvas.getContext("webgl2", {
                  antialias: true,
                  alpha: true,
                })
              : undefined;
            const rendererParameters = /** @type {any} */ ({
              canvas,
              antialias: true,
              forceWebGL: activeRendererFallback,
              ...(context ? { context } : {}),
            });
            const renderer = new WebGPURenderer(rendererParameters);

            const syncInitialRendererSize = () => {
              const parent = canvas.parentElement;
              if (!parent) {
                return;
              }

              const { width, height } = parent.getBoundingClientRect();
              if (width <= 0 || height <= 0) {
                return;
              }

              const dpr = Math.min(window.devicePixelRatio || 1, 2);
              renderer.setPixelRatio(dpr);
              renderer.setSize(width, height, false);
            };

            // Keep the renderer's internal size bookkeeping aligned with the
            // canvas before WebGPU allocates its MSAA/resolve attachments.
            syncInitialRendererSize();
            try {
              await renderer.init();
            } catch (error) {
              if (typeof window !== "undefined") {
                window.__baryonRendererInfo = {
                  forceWebGLFallbackTest: activeRendererFallback,
                  backend: null,
                  isFallback: activeRendererFallback,
                  error: String(error),
                };
              }
              throw error;
            }
            syncInitialRendererSize();
            if (typeof window !== "undefined") {
              const backend = /** @type {any} */ (renderer.backend);
              window.__baryonRendererInfo = {
                forceWebGLFallbackTest: activeRendererFallback,
                backend: backend?.constructor?.name ?? null,
                isFallback: backend?.isWebGLBackend === true,
                error: null,
              };
            }
            return renderer;
          }}
        >
          <Suspense fallback={null}>
            <BaryonScene
              setIsPlaying={setIsPlaying}
              setIsAudioLoaded={setIsAudioLoaded}
              setIsEngineReady={setIsEngineReady}
              controlsRef={controlsRef}
            />
          </Suspense>
        </Canvas>
      )}

      {!isUnsupported && !isFullscreen && <AudioControls />}
      <ParticleDebugOverlay />

      {isUnsupported && <UnsupportedWarning />}
    </div>
  );
};

export default ThreeScene;
