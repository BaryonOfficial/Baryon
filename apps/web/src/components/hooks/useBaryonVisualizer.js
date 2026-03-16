import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  applyAudioControls,
  applyAuditControls,
  applyBloomControls,
  applyOutputControls,
  applyVisualizationControls,
  applySharedControls,
  applySceneControls,
  buildControlInspectionSnapshot,
} from "@baryon/visualizer/controls/runtime";
import { createVisualizationRuntime } from "@baryon/visualizer/visualization/runtime";
import { DEFAULT_VISUALIZATION_METHOD } from "@baryon/visualizer/visualization/types";
import { getDefaultAudioSession } from "@baryon/visualizer/audio";
import {
  createAudioFeatureState,
  buildAudioFeatureFrame,
} from "@baryon/visualizer/audio-features";
import {
  RENDER_DEFAULTS,
  SIMULATION_DEFAULTS,
} from "@baryon/visualizer/defaults";
import { DEVTOOLS_ENABLED } from "../../devtools/config.js";
import {
  markBaryonTestRuntimeReady,
  resetBaryonTestReady,
} from "../../devtools/testReady.js";
import { shouldSkipChromesthesiaStaticColorInvalidation } from "./controlInvalidation.js";

const LONG_FRAME_THRESHOLD_MS = 34;

function snapshotFeatureFrame(featureFrame) {
  return {
    ...featureFrame,
    backboneSlots:
      featureFrame.backboneSlots instanceof Float32Array
        ? new Float32Array(featureFrame.backboneSlots)
        : featureFrame.backboneSlots,
    detailSlots:
      featureFrame.detailSlots instanceof Float32Array
        ? new Float32Array(featureFrame.detailSlots)
        : featureFrame.detailSlots,
    bandEnergies:
      featureFrame.bandEnergies instanceof Float32Array
        ? new Float32Array(featureFrame.bandEnergies)
        : featureFrame.bandEnergies,
    modeSlots:
      featureFrame.modeSlots instanceof Float32Array
        ? new Float32Array(featureFrame.modeSlots)
        : featureFrame.modeSlots,
    fftMagnitudes:
      featureFrame.fftMagnitudes instanceof Float32Array
        ? new Float32Array(featureFrame.fftMagnitudes)
        : featureFrame.fftMagnitudes,
  };
}

function shouldReuseIdleFrame(status, controls) {
  return !status.isPlaying && !status.isMicActive && !controls.injectTestTone;
}

function getPlaybackDiagnosticDpr() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
}

function createRuntimeDiagnostics() {
  return {
    activeFrameCount: 0,
    averageFrameTimeMs: 0,
    worstFrameTimeMs: 0,
    longFrameCount: 0,
    lastLongFrame: null,
    lastVisibilityChange: null,
    rendererMode: null,
    lastRendererModeChange: null,
    lastPlaybackIssue: null,
  };
}

function snapshotRuntimeDiagnostics(runtimeDiagnostics) {
  return {
    ...runtimeDiagnostics,
    lastLongFrame: runtimeDiagnostics.lastLongFrame
      ? { ...runtimeDiagnostics.lastLongFrame }
      : null,
    lastVisibilityChange: runtimeDiagnostics.lastVisibilityChange
      ? { ...runtimeDiagnostics.lastVisibilityChange }
      : null,
    lastRendererModeChange: runtimeDiagnostics.lastRendererModeChange
      ? { ...runtimeDiagnostics.lastRendererModeChange }
      : null,
    lastPlaybackIssue: runtimeDiagnostics.lastPlaybackIssue
      ? { ...runtimeDiagnostics.lastPlaybackIssue }
      : null,
  };
}

function shouldPreservePausedFrameOnControlsChange(
  previousControls,
  nextControls,
) {
  if (!previousControls || !nextControls) {
    return false;
  }

  return (
    previousControls.outputMode !== nextControls.outputMode ||
    previousControls.outputBackgroundColor !==
      nextControls.outputBackgroundColor
  );
}

export function useBaryonVisualizer({
  baryonGeometry,
  camera,
  gl,
  setIsPlaying,
  setIsAudioLoaded,
  setIsEngineReady,
  setMicRuntimeStatus,
  micProfile,
  controlsRef,
  ensurePipeline,
  postNodesRef,
}) {
  const audioRef = useRef(null);
  const audioFeatureRef = useRef(null);
  const runtimeRef = useRef(
    createVisualizationRuntime(DEFAULT_VISUALIZATION_METHOD),
  );
  const runtimeStateRef = useRef(null);
  const lastLiveFrameRef = useRef(null);
  const lastActiveFrameRef = useRef(null);
  const lastIdleFrameRef = useRef(null);
  const lastMicRuntimeStatusRef = useRef(null);
  const controlVersionRef = useRef(0);
  const appliedControlVersionRef = useRef(-1);
  const runtimeDiagnosticsRef = useRef(createRuntimeDiagnostics());
  const pixelRatioRef = useRef(null);
  const lastAudioIssueSignatureRef = useRef(null);
  const cachedControlSnapshotsRef = useRef({
    shared: null,
    output: null,
    visualization: null,
    bloom: null,
    audit: null,
    hasBloomPass: false,
    controlsSnapshot: controlsRef?.current ? { ...controlsRef.current } : null,
  });
  const [points, setPoints] = useState(null);

  useEffect(() => {
    const audio = getDefaultAudioSession();
    const runtime = runtimeRef.current;
    audioRef.current = audio;

    audio.attach(camera);
    gl.setClearColor(new THREE.Color(0x000000), 0);
    if (gl.shadowMap) {
      gl.shadowMap.enabled = true;
    }

    audio.setAudioEndedCallback(() => {
      setIsPlaying(false);
      setIsAudioLoaded(true);
    });

    return () => {
      setIsEngineReady?.(false);
      setPoints(null);
      audio.setAudioEndedCallback(null);
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
      lastIdleFrameRef.current = null;
      const lastMicProfile =
        lastMicRuntimeStatusRef.current?.profile ?? "voice-tone";
      lastMicRuntimeStatusRef.current = null;
      runtimeDiagnosticsRef.current = createRuntimeDiagnostics();
      lastAudioIssueSignatureRef.current = null;
      cachedControlSnapshotsRef.current.controlsSnapshot = null;
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: lastMicProfile,
      });
      const defaultDpr = getPlaybackDiagnosticDpr();
      gl.setPixelRatio(defaultDpr);
      pixelRatioRef.current = defaultDpr;
      if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
        delete window.__baryonAuditSnapshot;
        delete window.__baryonControlState;
      }
      resetBaryonTestReady();
    };
  }, [
    camera,
    gl,
    setIsAudioLoaded,
    setIsEngineReady,
    setIsPlaying,
    setMicRuntimeStatus,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleVisibilityChange = () => {
      runtimeDiagnosticsRef.current.lastVisibilityChange = {
        state: document.visibilityState,
        atWallTimeMs:
          typeof globalThis.performance?.now === "function"
            ? globalThis.performance.now()
            : 0,
      };
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controlsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const audio = audioRef.current ?? getDefaultAudioSession();
    const syncAudioControls = (event) => {
      const nextControls = event?.detail ?? controlsRef.current;
      void applyAudioControls(audio, nextControls).catch((error) => {
        console.error("[Baryon audio] Failed to apply mic settings:", error);
      });
    };

    syncAudioControls();
    window.addEventListener("__baryon-controls-change", syncAudioControls);
    return () => {
      window.removeEventListener("__baryon-controls-change", syncAudioControls);
    };
  }, [controlsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleControlsChange = (event) => {
      const nextControls = event?.detail ?? controlsRef.current;
      const previousControls =
        cachedControlSnapshotsRef.current.controlsSnapshot;
      const shouldSkipInvalidation =
        shouldSkipChromesthesiaStaticColorInvalidation(
          previousControls,
          nextControls,
        );
      cachedControlSnapshotsRef.current.controlsSnapshot = nextControls
        ? { ...nextControls }
        : null;

      if (shouldSkipInvalidation) {
        return;
      }

      const preservePausedFrame = shouldPreservePausedFrameOnControlsChange(
        previousControls,
        nextControls,
      );

      controlVersionRef.current += 1;
      appliedControlVersionRef.current = -1;
      if (!preservePausedFrame) {
        lastActiveFrameRef.current = null;
        lastIdleFrameRef.current = null;
      }
    };

    window.addEventListener("__baryon-controls-change", handleControlsChange);
    return () => {
      window.removeEventListener(
        "__baryon-controls-change",
        handleControlsChange,
      );
    };
  }, [controlsRef]);

  useEffect(() => {
    const audio = audioRef.current;
    const runtime = runtimeRef.current;
    const initialControlsSnapshot = controlsRef?.current
      ? { ...controlsRef.current }
      : null;

    if (!audio || !baryonGeometry) {
      setIsEngineReady?.(false);
      setPoints(null);
      return undefined;
    }

    setIsEngineReady?.(false);
    setPoints(null);

    try {
      const audioStatus = audio.getStatus();
      const parameters = {
        radius: SIMULATION_DEFAULTS.radius,
      };
      const audioConfig = {
        capacity: audioStatus.capacity,
        fftSize: audioStatus.fftSize,
        sampleRate: audioStatus.sampleRate,
      };

      audioFeatureRef.current = createAudioFeatureState(audioConfig.capacity);
      const runtimeState = runtime.setup({
        baryonGeometry,
        parameters,
        audioConfig,
      });
      runtimeState.method = runtime.method;
      runtimeStateRef.current = runtimeState;
      cachedControlSnapshotsRef.current = {
        shared: null,
        output: null,
        visualization: null,
        bloom: null,
        audit: null,
        hasBloomPass: false,
        controlsSnapshot: initialControlsSnapshot,
      };
      appliedControlVersionRef.current = -1;
      setPoints(runtimeState.points);
      setIsEngineReady?.(true);
    } catch (error) {
      console.error("[BaryonScene] Setup failed:", error);
    }

    return () => {
      setIsEngineReady?.(false);
      setPoints(null);
      if (runtimeStateRef.current) {
        runtime.dispose(runtimeStateRef.current);
        runtimeStateRef.current = null;
      }
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
      lastIdleFrameRef.current = null;
      audioFeatureRef.current = null;
      lastMicRuntimeStatusRef.current = null;
      cachedControlSnapshotsRef.current.controlsSnapshot = null;
      setMicRuntimeStatus?.({
        active: false,
        calibrating: false,
        profile: micProfile ?? "voice-tone",
      });
    };
  }, [
    baryonGeometry,
    controlsRef,
    micProfile,
    setIsEngineReady,
    setMicRuntimeStatus,
  ]);

  useFrame((state) => {
    const pipeline = ensurePipeline();
    const runtimeState = runtimeStateRef.current;
    const featureState = audioFeatureRef.current;

    if (!runtimeState || !featureState) {
      return;
    }

    const controls = controlsRef.current;
    const audio = audioRef.current;
    const status = audio.getStatus();
    const { clockMode, time, deltaTime } = audio.readClockSnapshot(
      state.clock.getElapsedTime(),
    );
    const runtimeDiagnostics = runtimeDiagnosticsRef.current;
    const rendererMode =
      gl?.backend?.isWebGLBackend === true ? "webgl" : "webgpu";
    if (runtimeDiagnostics.rendererMode !== rendererMode) {
      runtimeDiagnostics.rendererMode = rendererMode;
      runtimeDiagnostics.lastRendererModeChange = {
        mode: rendererMode,
        atElapsedTimeSeconds: time,
        atWallTimeMs:
          typeof globalThis.performance?.now === "function"
            ? globalThis.performance.now()
            : 0,
      };
    }
    const lowLoadActive = Boolean(
      controls.lowLoadPlaybackDiagnostics && status.isPlaying,
    );
    const targetPixelRatio = lowLoadActive ? 1 : getPlaybackDiagnosticDpr();
    if (pixelRatioRef.current !== targetPixelRatio) {
      gl.setPixelRatio(targetPixelRatio);
      gl.setSize(state.size.width, state.size.height, false);
      pixelRatioRef.current = targetPixelRatio;
    }
    if (status.isPlaying) {
      runtimeDiagnostics.activeFrameCount += 1;
      runtimeDiagnostics.averageFrameTimeMs +=
        (deltaTime * 1000 - runtimeDiagnostics.averageFrameTimeMs) /
        runtimeDiagnostics.activeFrameCount;
      runtimeDiagnostics.worstFrameTimeMs = Math.max(
        runtimeDiagnostics.worstFrameTimeMs,
        deltaTime * 1000,
      );
      if (deltaTime * 1000 >= LONG_FRAME_THRESHOLD_MS) {
        runtimeDiagnostics.longFrameCount += 1;
        runtimeDiagnostics.lastLongFrame = {
          durationMs: deltaTime * 1000,
          atElapsedTimeSeconds: time,
          playbackSessionId: status.playbackSessionId ?? null,
        };
      }
    }
    const playbackIssueSignature =
      status.lastPlaybackEndReason &&
      status.lastPlaybackDiagnostics?.playbackSessionId != null
        ? `${status.lastPlaybackEndReason}:${status.lastPlaybackDiagnostics.playbackSessionId}:${status.lastPlaybackDiagnostics.endedAtContextTimeSeconds ?? "na"}`
        : null;
    if (
      playbackIssueSignature &&
      playbackIssueSignature !== lastAudioIssueSignatureRef.current &&
      (status.lastPlaybackEndReason === "premature" ||
        status.lastPlaybackEndReason === "interrupted")
    ) {
      lastAudioIssueSignatureRef.current = playbackIssueSignature;
      runtimeDiagnostics.lastPlaybackIssue = {
        reason: status.lastPlaybackEndReason,
        playbackSessionId: status.lastPlaybackDiagnostics?.playbackSessionId,
        atElapsedTimeSeconds: time,
        averageFrameTimeMs: runtimeDiagnostics.averageFrameTimeMs,
        worstFrameTimeMs: runtimeDiagnostics.worstFrameTimeMs,
        longFrameCount: runtimeDiagnostics.longFrameCount,
        lastLongFrame: runtimeDiagnostics.lastLongFrame,
        lastVisibilityChange: runtimeDiagnostics.lastVisibilityChange,
        rendererMode,
        lastRendererModeChange: runtimeDiagnostics.lastRendererModeChange,
      };
    }
    const chromesthesiaEnabled =
      controls.colorMode === "chromesthesia" &&
      (controls.chromesthesiaMix ?? RENDER_DEFAULTS.chromesthesiaMix) > 0;
    const hasBloomPass = Boolean(postNodesRef.current?.bloomPass);
    const controlsChanged =
      appliedControlVersionRef.current !== controlVersionRef.current ||
      cachedControlSnapshotsRef.current.hasBloomPass !== hasBloomPass;

    if (controlsChanged) {
      cachedControlSnapshotsRef.current = {
        shared: applySharedControls(gl, controls),
        output: applyOutputControls({ ensurePipeline, postNodesRef }, controls),
        visualization: applyVisualizationControls(
          runtimeRef.current.method,
          runtimeState,
          controls,
        ),
        bloom: applyBloomControls(
          { ensurePipeline, postNodesRef, runtimeState },
          controls,
        ),
        audit: applyAuditControls(featureState, controls),
        hasBloomPass: Boolean(postNodesRef.current?.bloomPass),
        controlsSnapshot: cachedControlSnapshotsRef.current.controlsSnapshot,
      };
      appliedControlVersionRef.current = controlVersionRef.current;
    }

    const { shared, output, visualization, bloom, audit } =
      cachedControlSnapshotsRef.current;

    if (clockMode === "paused-playback" && !lastActiveFrameRef.current) {
      const liveFrame = lastLiveFrameRef.current;
      if (liveFrame) {
        lastActiveFrameRef.current = snapshotFeatureFrame(liveFrame);
      }
    }

    const shouldReusePausedFrame =
      clockMode === "paused-playback" && lastActiveFrameRef.current;
    const shouldReuseStaticIdleFrame =
      shouldReuseIdleFrame(status, controls) && lastIdleFrameRef.current;

    let featureFrame = lastActiveFrameRef.current;
    if (!shouldReusePausedFrame && !shouldReuseStaticIdleFrame) {
      featureFrame = buildAudioFeatureFrame({
        analysisSnapshot: audio.readAnalysisSnapshot(),
        featureState,
        radius: runtimeState.uniforms.uRadius.value,
        status,
        frameTimeMs: time * 1000,
        micAnalysisSettings: {
          profile: micProfile,
        },
        includeChromesthesia: chromesthesiaEnabled,
      });

      if (shouldReuseIdleFrame(status, controls)) {
        lastIdleFrameRef.current = featureFrame;
      } else {
        lastIdleFrameRef.current = null;
      }
    } else if (shouldReuseStaticIdleFrame) {
      featureFrame = lastIdleFrameRef.current;
    }

    const nextMicRuntimeStatus = status.isMicActive
      ? {
          active: true,
          calibrating: Boolean(featureFrame.debug?.micCalibrationActive),
          profile: featureFrame.debug?.micProfile ?? micProfile ?? "voice-tone",
        }
      : {
          active: false,
          calibrating: false,
          profile: micProfile ?? "voice-tone",
        };
    const previousMicRuntimeStatus = lastMicRuntimeStatusRef.current;
    if (
      !previousMicRuntimeStatus ||
      previousMicRuntimeStatus.active !== nextMicRuntimeStatus.active ||
      previousMicRuntimeStatus.calibrating !==
        nextMicRuntimeStatus.calibrating ||
      previousMicRuntimeStatus.profile !== nextMicRuntimeStatus.profile
    ) {
      lastMicRuntimeStatusRef.current = nextMicRuntimeStatus;
      setMicRuntimeStatus?.(nextMicRuntimeStatus);
    }

    if (status.isPlaying || status.isMicActive) {
      lastLiveFrameRef.current = featureFrame;
      lastActiveFrameRef.current = null;
      lastIdleFrameRef.current = null;
    } else if (clockMode !== "paused-playback") {
      lastLiveFrameRef.current = null;
      lastActiveFrameRef.current = null;
    }
    const effectiveFrame =
      clockMode === "paused-playback" && lastActiveFrameRef.current
        ? lastActiveFrameRef.current
        : featureFrame;

    runtimeRef.current.tick({
      renderer: gl,
      runtimeState,
      featureFrame: effectiveFrame,
      time,
      deltaTime,
    });

    if (controls.bloomEnabled && postNodesRef.current?.bloomPass) {
      postNodesRef.current.bloomPass.strength.value =
        bloom.strength * (1 + (runtimeState.bloomResponseSignal ?? 0) * 0.16);
    }

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      if (controls.auditEnabled && runtimeState.debugSnapshot) {
        window.__baryonAuditSnapshot = {
          visualizationMethod: runtimeRef.current.method,
          renderer: window.__baryonRendererInfo ?? null,
          audioDiagnostics: {
            playbackSessionId: status.playbackSessionId,
            lastPlaybackEndReason: status.lastPlaybackEndReason,
            lastPlaybackDiagnostics: status.lastPlaybackDiagnostics,
            runtime: snapshotRuntimeDiagnostics(runtimeDiagnostics),
          },
          ...runtimeState.debugSnapshot,
        };

        const frame = featureState.audit?.frame ?? 0;
        const interval = Math.max(1, Math.floor(controls.logEveryFrames));
        if (!lowLoadActive && frame % interval === 0) {
          console.log("[Baryon audit]", {
            visualizationMethod: runtimeRef.current.method,
            renderer: window.__baryonRendererInfo ?? null,
            audioDiagnostics: {
              playbackSessionId: status.playbackSessionId,
              lastPlaybackEndReason: status.lastPlaybackEndReason,
              lastPlaybackDiagnostics: status.lastPlaybackDiagnostics,
              runtime: snapshotRuntimeDiagnostics(runtimeDiagnostics),
            },
            ...runtimeState.debugSnapshot,
          });
        }
      } else {
        delete window.__baryonAuditSnapshot;
      }
    }

    const sceneSnapshot = applySceneControls(
      runtimeState,
      controls,
      deltaTime,
      featureFrame,
      status,
    );

    if (DEVTOOLS_ENABLED && typeof window !== "undefined") {
      const audioSnapshot = audio.getMicSettings();
      if (!lowLoadActive) {
        window.__baryonControlState = buildControlInspectionSnapshot({
          method: runtimeRef.current.method,
          audio: audioSnapshot,
          shared,
          output,
          raymarch: visualization,
          bloom,
          audit,
          scene: sceneSnapshot,
        });
      }
      markBaryonTestRuntimeReady();
    }

    if (pipeline) {
      pipeline.render();
    } else {
      gl.render(state.scene, state.camera);
    }
  }, 1);

  return points;
}
