import { useCallback, useEffect, useReducer, useState } from "react";
import { clearRendererDiagnostics } from "../rendererDiagnostics.js";
import { subscribeControlsChanged } from "../../controls/controlsEvents.js";
import {
  RUNTIME_RENDERER_BACKENDS,
  RUNTIME_SESSION_EVENTS,
  RUNTIME_SESSION_PHASES,
  createRuntimeSessionState,
  reduceRuntimeSession,
  resolveRuntimeRendererBackend,
} from "./runtimeSessionController.js";

// R3F defers GPU disposal to avoid blocking the render thread. Keep the wait
// inside the one lifecycle owner so no consumer can independently re-bootstrap.
const RUNTIME_DISPOSAL_SETTLE_MS = 650;

function readControls(event) {
  return event?.detail && typeof event.detail === "object" ? event.detail : {};
}

export function useRuntimeSessionController({
  initialRendererFallback,
  preferWebGLRenderer = false,
  setIsEngineReady,
  disposalSettleMs = RUNTIME_DISPOSAL_SETTLE_MS,
}) {
  const [forceWebGLFallbackTest, setForceWebGLFallbackTest] = useState(
    initialRendererFallback,
  );
  const requestedBackend = resolveRuntimeRendererBackend(
    preferWebGLRenderer || forceWebGLFallbackTest,
  );
  const [session, dispatch] = useReducer(
    reduceRuntimeSession,
    requestedBackend,
    createRuntimeSessionState,
  );

  useEffect(() => {
    const handleControlsChange = (event) => {
      const controls = readControls(event);
      setForceWebGLFallbackTest(
        Boolean(controls.forceWebGLFallbackTest ?? false),
      );
    };

    return subscribeControlsChanged(handleControlsChange);
  }, []);

  useEffect(() => {
    dispatch({
      type: RUNTIME_SESSION_EVENTS.requestBackend,
      backend: requestedBackend,
    });
  }, [requestedBackend]);

  useEffect(() => {
    if (session.phase !== RUNTIME_SESSION_PHASES.disposing) {
      return undefined;
    }

    setIsEngineReady(false);
    clearRendererDiagnostics();
    const timeout = window.setTimeout(() => {
      dispatch({ type: RUNTIME_SESSION_EVENTS.disposalCompleted });
    }, disposalSettleMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [disposalSettleMs, session.generation, session.phase, setIsEngineReady]);

  const markRendererReady = useCallback((generation, backend) => {
    dispatch({
      type: RUNTIME_SESSION_EVENTS.rendererReady,
      generation,
      backend,
    });
  }, []);

  const markRendererFailed = useCallback((generation, backend) => {
    dispatch({
      type: RUNTIME_SESSION_EVENTS.rendererFailed,
      generation,
      backend,
    });
  }, []);

  return {
    ...session,
    forceWebGLFallbackTest,
    rendererRequiredWebGL: preferWebGLRenderer,
    activeRendererFallback:
      session.activeBackend === RUNTIME_RENDERER_BACKENDS.webgl2,
    showCanvas:
      session.phase === RUNTIME_SESSION_PHASES.starting ||
      session.phase === RUNTIME_SESSION_PHASES.ready,
    markRendererReady,
    markRendererFailed,
  };
}
