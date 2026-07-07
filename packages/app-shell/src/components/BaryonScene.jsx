import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useBaryonPipeline } from "./hooks/useBaryonPipeline";
import { useBaryonEngine } from "./hooks/useBaryonEngine";
import { useDefaultBaryonGeometry } from "./hooks/useDefaultBaryonGeometry";
import {
  augmentFrameStateWithCameraSync,
  applyExternalCameraPose,
  CAMERA_CONTROL_MODES,
  shouldMirrorCameraPose,
  shouldMountOrbitControls,
} from "./baryonSceneCameraSync.js";
export { CAMERA_CONTROL_MODES } from "./baryonSceneCameraSync.js";
import {
  RENDER_CONTEXTS,
  markRenderOutputCameraCut,
} from "@baryon/engine/render/outputPipeline";
import { resolveTemporalReprojectionPolicy } from "@baryon/engine/render/temporalReprojectionPolicy";
import {
  resolveSceneRenderPerformanceProfile,
  sanitizeLocalPostProcessOverrides,
  shouldAllowLocalPostProcessOverrides,
} from "./baryonSceneRenderProfile.js";

// Devtools boundary: the event name is historical; payloads map to local
// post-process overrides only.
const RENDER_PROFILE_COMMAND_EVENT = "__baryon-render-profile-command";

function createCameraRenderKey(cameraPose, cameraResetNonce) {
  if (!cameraPose) {
    return `none:${cameraResetNonce}`;
  }

  return [
    cameraResetNonce,
    cameraPose.position?.x ?? 0,
    cameraPose.position?.y ?? 0,
    cameraPose.position?.z ?? 0,
    cameraPose.target?.x ?? 0,
    cameraPose.target?.y ?? 0,
    cameraPose.target?.z ?? 0,
    cameraPose.up?.x ?? 0,
    cameraPose.up?.y ?? 1,
    cameraPose.up?.z ?? 0,
    cameraPose.fov ?? 65,
  ].join(":");
}

function createCameraPoseMirrorKey(cameraPose) {
  return createCameraRenderKey(cameraPose, 0);
}

function bumpLocalCameraRenderSignal(signalRef, phase) {
  signalRef.current.version += 1;
  signalRef.current.phase = phase;
}

export function BaryonScene({
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  liveInputUiState,
  liveInputErrorCode,
  controlsRef,
  visualizationMethod,
  performanceProfile,
  customTargetFps = null,
  traaEnabled = true,
  resolvedRenderProfile = null,
  onPerformanceHudSnapshotChange,
  onAuditSnapshotChange = null,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  onCameraPoseChange = null,
  externalFrameRef = null,
  cameraPose = null,
  structuralControlVersion = 0,
  liveControlSignalRef = null,
  adaptiveResetNonce = 0,
  framePacingFps = null,
  basePixelRatio = null,
  onStageRender = null,
  suppressRender = false,
  enableControlEventSync = true,
  cameraResetNonce = 0,
  cameraLocked = false,
  cameraControlMode = /** @type {import("./baryonSceneCameraSync.js").CameraControlMode} */ (
    CAMERA_CONTROL_MODES.previewLocal
  ),
  renderContext = /** @type {"preview" | "external-output"} */ (
    RENDER_CONTEXTS.preview
  ),
}) {
  const { camera, gl, scene, size, invalidate } = useThree();
  const orbitControlsRef = useRef(null);
  const warnedMissingExternalCameraPoseRef = useRef(false);
  const lastPreviewLocalCameraPoseEventKeyRef = useRef(null);
  const lastPreviewLocalAppliedResetNonceRef = useRef(null);
  const localCameraRenderSignalRef = useRef({ version: 0, phase: null });
  const [localPostProcessOverrides, setLocalPostProcessOverrides] =
    useState(null);
  const temporalReprojectionPolicy = resolveTemporalReprojectionPolicy({
    visualizationMethod,
    traaRequested: traaEnabled,
  });
  const renderProfile = useMemo(
    () =>
      resolveSceneRenderPerformanceProfile({
        performanceProfile,
        renderContext,
        targetFps: customTargetFps,
        outputWidth: size.width,
        outputHeight: size.height,
        resolvedRenderProfile,
        localPostProcessOverrides,
        traaEnabled: temporalReprojectionPolicy.traaEnabled,
      }),
    [
      performanceProfile,
      customTargetFps,
      localPostProcessOverrides,
      renderContext,
      resolvedRenderProfile,
      size.height,
      size.width,
      temporalReprojectionPolicy.traaEnabled,
    ],
  );
  const { ensurePipeline, postNodesRef, disposePipeline } = useBaryonPipeline(
    gl,
    scene,
    camera,
    renderProfile,
  );
  const cameraRenderKey = useMemo(
    () => createCameraRenderKey(cameraPose, cameraResetNonce),
    [cameraPose, cameraResetNonce],
  );

  // Free TRAANode's two HalfFloat render targets (history + resolve) on unmount.
  useEffect(() => disposePipeline, [disposePipeline]);
  const baryonGeometry = useDefaultBaryonGeometry();

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!shouldAllowLocalPostProcessOverrides(renderContext)) {
      setLocalPostProcessOverrides(null);
      return undefined;
    }

    const handleRenderProfileCommand = (event) => {
      const action = event?.detail?.action;
      if (action === "clear") {
        setLocalPostProcessOverrides(null);
        return;
      }
      if (action === "set") {
        setLocalPostProcessOverrides(
          sanitizeLocalPostProcessOverrides(event?.detail?.overrides),
        );
      }
    };

    window.addEventListener(
      RENDER_PROFILE_COMMAND_EVENT,
      handleRenderProfileCommand,
    );
    return () => {
      window.removeEventListener(
        RENDER_PROFILE_COMMAND_EVENT,
        handleRenderProfileCommand,
      );
    };
  }, [renderContext]);

  const handleFrameState = useCallback(
    (frameState) => {
      if (!onFrameState) {
        return;
      }

      onFrameState(
        augmentFrameStateWithCameraSync(frameState, {
          orbitControls: orbitControlsRef.current,
          camera,
          cameraControlMode,
        }),
      );
    },
    [camera, cameraControlMode, onFrameState],
  );

  const emitCameraPoseChange = useCallback(
    (phase) => {
      if (
        typeof onCameraPoseChange !== "function" ||
        !shouldMirrorCameraPose(cameraControlMode)
      ) {
        return;
      }

      const nextCameraPose = augmentFrameStateWithCameraSync(
        {},
        {
          orbitControls: orbitControlsRef.current,
          camera,
          cameraControlMode,
        },
      ).cameraPose;
      lastPreviewLocalCameraPoseEventKeyRef.current =
        createCameraPoseMirrorKey(nextCameraPose);

      onCameraPoseChange({
        phase,
        cameraPose: nextCameraPose,
      });
    },
    [camera, cameraControlMode, onCameraPoseChange],
  );
  const handleOrbitControlsChange = useCallback(() => {
    bumpLocalCameraRenderSignal(localCameraRenderSignalRef, "change");
    invalidate();
    emitCameraPoseChange("change");
  }, [emitCameraPoseChange, invalidate]);
  const handleOrbitControlsEnd = useCallback(() => {
    bumpLocalCameraRenderSignal(localCameraRenderSignalRef, "end");
    invalidate();
    emitCameraPoseChange("end");
  }, [emitCameraPoseChange, invalidate]);

  useLayoutEffect(() => {
    if (cameraControlMode !== CAMERA_CONTROL_MODES.previewLocal) {
      return;
    }
    if (!cameraPose) {
      return;
    }

    const nextCameraPoseKey = createCameraPoseMirrorKey(cameraPose);
    const resetNonceChanged =
      lastPreviewLocalAppliedResetNonceRef.current !== cameraResetNonce;
    if (
      !resetNonceChanged &&
      lastPreviewLocalCameraPoseEventKeyRef.current === nextCameraPoseKey
    ) {
      return;
    }

    if (applyExternalCameraPose(cameraPose, camera, orbitControlsRef.current)) {
      lastPreviewLocalAppliedResetNonceRef.current = cameraResetNonce;
      lastPreviewLocalCameraPoseEventKeyRef.current = null;
      markRenderOutputCameraCut(postNodesRef.current);
      invalidate();
    }
  }, [
    camera,
    cameraControlMode,
    cameraPose,
    cameraResetNonce,
    invalidate,
    postNodesRef,
  ]);

  useLayoutEffect(() => {
    if (cameraControlMode !== CAMERA_CONTROL_MODES.externalSynced) {
      return;
    }

    if (!cameraPose) {
      if (
        warnedMissingExternalCameraPoseRef.current === false &&
        typeof console !== "undefined" &&
        typeof console.warn === "function"
      ) {
        warnedMissingExternalCameraPoseRef.current = true;
        console.warn(
          "BaryonScene external-synced mode mounted without cameraPose; preserving current camera",
        );
      }
      return;
    }
    warnedMissingExternalCameraPoseRef.current = false;
    if (applyExternalCameraPose(cameraPose, camera)) {
      markRenderOutputCameraCut(postNodesRef.current);
      invalidate();
    }
  }, [camera, cameraControlMode, cameraPose, invalidate, postNodesRef]);

  const points = useBaryonEngine({
    baryonGeometry,
    camera,
    gl,
    setIsEngineReady,
    setLiveInputRuntimeStatus,
    liveInputUiState,
    liveInputErrorCode,
    controlsRef,
    visualizationMethod,
    scene,
    ensurePipeline,
    postNodesRef,
    onPerformanceHudSnapshotChange,
    onAuditSnapshotChange,
    outputFrameConfig,
    onOutputFrame,
    onFrameState: handleFrameState,
    externalFrameRef,
    structuralControlVersion,
    liveControlSignalRef,
    localCameraRenderSignalRef,
    adaptiveResetNonce,
    framePacingFps,
    renderProfile,
    cameraRenderKey,
    basePixelRatio,
    onStageRender,
    suppressRender,
    enableControlEventSync,
  });

  return (
    <>
      {shouldMountOrbitControls(cameraControlMode) ? (
        <OrbitControls
          ref={orbitControlsRef}
          enableDamping
          enabled={!cameraLocked}
          onChange={handleOrbitControlsChange}
          onEnd={handleOrbitControlsEnd}
        />
      ) : null}
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
