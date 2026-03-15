import { Component, Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import { BaryonScene } from "./BaryonScene";
import AudioControls from "./AudioControls";
import ParticleDebugOverlay from "./ParticleDebugOverlay.jsx";
import UnsupportedWarning from "./UnsupportedWarning.jsx";
import { useFullscreen } from "./hooks/useFullScreenToggle.jsx";
import { useBaryonControls } from "./hooks/useBaryonControls";
import { useAudioScene } from "../context/AudioContext";
import {
  BROWSER_SUPPORT_STATUS,
  getInitialBrowserSupportStatus,
  isMobileDevice,
  probeBrowserSupport,
} from "./browserSupport.js";

const CANVAS_SWAP_DELAY_MS = 650;
const WEBGPU_RENDERER_INIT_ERROR = "WebGPURendererInitError";

function formatRendererInitError(error) {
  const cause = error?.cause;
  if (cause instanceof Error) {
    return cause.message;
  }
  if (cause != null) {
    return String(cause);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function clearRendererDiagnostics() {
  if (typeof window === "undefined") {
    return;
  }

  delete window.__baryonRendererInfo;
  delete window.__baryonAuditSnapshot;
}

class RendererErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

const ThreeScene = () => {
  const containerRef = useRef(null);
  const rendererModeRef = useRef(null);
  const hasMountedCanvasRef = useRef(false);
  const controlsRef = useBaryonControls();
  const initialRendererFallback = Boolean(
    /** @type {any} */ (controlsRef.current).forceWebGLFallbackTest,
  );
  const [browserSupportStatus, setBrowserSupportStatus] = useState(() =>
    getInitialBrowserSupportStatus(initialRendererFallback),
  );
  const [unsupportedReason, setUnsupportedReason] = useState(() =>
    !initialRendererFallback && isMobileDevice() ? "mobile" : "browser",
  );
  const [unsupportedDetails, setUnsupportedDetails] = useState([]);
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
    setMicRuntimeStatus,
    micProfile,
    resetAudioSession,
  } = useAudioScene();

  useEffect(() => {
    let isCancelled = false;

    if (forceWebGLFallbackTest) {
      setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.supported);
      setUnsupportedReason("browser");
      setUnsupportedDetails([]);
      return undefined;
    }

    if (isMobileDevice()) {
      setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.unsupported);
      setUnsupportedReason("mobile");
      setUnsupportedDetails([
        "Mobile browsers are currently treated as unsupported.",
      ]);
      return undefined;
    }

    setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.checking);
    setUnsupportedReason("browser");
    setUnsupportedDetails([]);

    void (async () => {
      const probe = await probeBrowserSupport(forceWebGLFallbackTest);
      if (!isCancelled) {
        setBrowserSupportStatus(probe.status);
        setUnsupportedReason(probe.reason);
        setUnsupportedDetails(probe.diagnostics);
      }
    })();

    return () => {
      isCancelled = true;
    };
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

  const isUnsupported =
    browserSupportStatus === BROWSER_SUPPORT_STATUS.unsupported;
  const isSupportReady =
    browserSupportStatus === BROWSER_SUPPORT_STATUS.supported;

  const handleCanvasError = (error) => {
    if (error?.name !== WEBGPU_RENDERER_INIT_ERROR) {
      return;
    }

    void resetAudioSession();
    setIsEngineReady(false);
    setShowCanvas(false);
    setBrowserSupportStatus(BROWSER_SUPPORT_STATUS.unsupported);
    setUnsupportedReason("browser");
    setUnsupportedDetails([
      `\`WebGPURenderer.init()\` failed: ${formatRendererInitError(error)}`,
    ]);
  };

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
      {showCanvas && isSupportReady && (
        <RendererErrorBoundary
          resetKey={`${activeRendererFallback ? "force-webgl-fallback" : "webgpu-default"}-${canvasEpoch}`}
          onError={handleCanvasError}
        >
          <Canvas
            key={`${activeRendererFallback ? "force-webgl-fallback" : "webgpu-default"}-${canvasEpoch}`}
            style={{ position: "absolute", top: 0, left: 0, zIndex: 10 }}
            dpr={[1, 2]}
            camera={{ position: [0, 0, 9], fov: 65, near: 0.1, far: 100 }}
            // @ts-ignore — WebGPURenderer is runtime-compatible; R3F types predate WebGPU
            gl={async (glDefaults) => {
              const canvas = /** @type {HTMLCanvasElement} */ (
                glDefaults.canvas
              );
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

                const rendererInitError = new Error(
                  "WebGPU renderer initialization failed",
                  { cause: error },
                );
                rendererInitError.name = WEBGPU_RENDERER_INIT_ERROR;
                throw rendererInitError;
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
                setMicRuntimeStatus={setMicRuntimeStatus}
                micProfile={micProfile}
                controlsRef={controlsRef}
              />
            </Suspense>
          </Canvas>
        </RendererErrorBoundary>
      )}

      {isSupportReady && !isFullscreen && <AudioControls />}
      <ParticleDebugOverlay />

      {isUnsupported && (
        <UnsupportedWarning
          reason={unsupportedReason}
          details={unsupportedDetails}
        />
      )}
    </div>
  );
};

export default ThreeScene;
