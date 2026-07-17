import { useEffect, useRef, useState } from "react";
import { clearRendererDiagnostics } from "../rendererDiagnostics.js";
import { subscribeControlsChanged } from "../../controls/controlsEvents.js";

const CANVAS_SWAP_DELAY_MS = 650;

/**
 * Keeps renderer-mode toggles and canvas remounts in one place so ThreeScene
 * only describes layout and wiring.
 */
export function useRendererModeState({
  initialRendererFallback,
  resetAudioSession,
  setIsEngineReady,
}) {
  const rendererModeRef = useRef(null);
  const hasMountedCanvasRef = useRef(false);
  const [forceWebGLFallbackTest, setForceWebGLFallbackTest] = useState(
    initialRendererFallback,
  );
  const [activeRendererFallback, setActiveRendererFallback] = useState(
    initialRendererFallback,
  );
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [showCanvas, setShowCanvas] = useState(true);

  useEffect(() => {
    const handleControlsChange = (event) => {
      setForceWebGLFallbackTest(
        Boolean(event.detail?.forceWebGLFallbackTest ?? false),
      );
    };

    return subscribeControlsChanged(handleControlsChange);
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

  return {
    forceWebGLFallbackTest,
    activeRendererFallback,
    canvasEpoch,
    showCanvas,
    setShowCanvas,
  };
}
