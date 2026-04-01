import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useBaryonPipeline } from "./hooks/useBaryonPipeline";
import { useBaryonVisualizer } from "./hooks/useBaryonVisualizer";
import { useDefaultBaryonGeometry } from "./hooks/useDefaultBaryonGeometry";
import {
  CAMERA_VIEW_PRESETS,
  applyCameraViewPreset,
} from "./cameraViewPresets.js";
import {
  augmentFrameStateWithCameraSync,
  CAMERA_CONTROL_MODES,
  resolveAppliedCameraState,
  shouldMountOrbitControls,
} from "./baryonSceneCameraSync.js";
export { CAMERA_CONTROL_MODES } from "./baryonSceneCameraSync.js";
import { RENDER_CONTEXTS } from "@baryon/visualizer/render/outputPipeline";
import {
  resolveSceneRenderQualityProfile,
  sanitizeRenderProfileOverrides,
  shouldAllowLocalRenderProfileCommands,
} from "./baryonSceneRenderProfile.js";

const RENDER_PROFILE_COMMAND_EVENT = "__baryon-render-profile-command";

export function BaryonScene({
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  liveInputUiState,
  liveInputErrorCode,
  controlsRef,
  visualizationMethod,
  renderQualityPreset: performanceProfile,
  renderProfileOverrides: renderProfileOverridesProp = null,
  resolvedRenderProfile = null,
  onPerformanceHudSnapshotChange,
  onAuditSnapshotChange = null,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  externalFrameRef = null,
  controlVersion = 0,
  adaptiveResetNonce = 0,
  basePixelRatio = null,
  onStageRender = null,
  suppressRender = false,
  enableControlEventSync = true,
  cameraViewPreset = /** @type {"top-down" | "side"} */ (
    CAMERA_VIEW_PRESETS.topDown
  ),
  cameraDistance = null,
  cameraResetNonce = 0,
  cameraControlMode = /** @type {"preview-local" | "external-synced"} */ (
    CAMERA_CONTROL_MODES.previewLocal
  ),
  renderContext = /** @type {"preview" | "external-output"} */ (
    RENDER_CONTEXTS.preview
  ),
}) {
  const { camera, gl, scene, size } = useThree();
  const orbitControlsRef = useRef(null);
  const [renderProfileOverrides, setRenderProfileOverrides] = useState(null);
  const renderProfile = useMemo(
    () =>
      resolveSceneRenderQualityProfile({
        performanceProfile,
        renderContext,
        outputWidth: size.width,
        outputHeight: size.height,
        resolvedRenderProfile,
        syncedRenderProfileOverrides: renderProfileOverridesProp,
        localRenderProfileOverrides: renderProfileOverrides,
      }),
    [
      performanceProfile,
      renderContext,
      renderProfileOverrides,
      renderProfileOverridesProp,
      resolvedRenderProfile,
      size.height,
      size.width,
    ],
  );
  const { ensurePipeline, postNodesRef, disposePipeline } = useBaryonPipeline(
    gl,
    scene,
    camera,
    renderProfile,
  );

  // Free TRAANode's two HalfFloat render targets (history + resolve) on unmount.
  useEffect(() => disposePipeline, [disposePipeline]);
  const baryonGeometry = useDefaultBaryonGeometry();

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!shouldAllowLocalRenderProfileCommands(renderContext)) {
      setRenderProfileOverrides(null);
      return undefined;
    }

    const handleRenderProfileCommand = (event) => {
      const action = event?.detail?.action;
      if (action === "clear") {
        setRenderProfileOverrides(null);
        return;
      }
      if (action === "set") {
        setRenderProfileOverrides(
          sanitizeRenderProfileOverrides(event?.detail?.overrides),
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
          visualizationMethod,
          cameraViewPreset,
          orbitControls: orbitControlsRef.current,
          camera,
        }),
      );
    },
    [camera, cameraViewPreset, onFrameState, visualizationMethod],
  );

  useEffect(() => {
    const { preset, distance } = resolveAppliedCameraState({
      visualizationMethod,
      cameraControlMode,
      cameraViewPreset,
      cameraDistance,
    });

    applyCameraViewPreset(camera, orbitControlsRef.current, preset, distance);
  }, [
    camera,
    cameraControlMode,
    cameraDistance,
    cameraResetNonce,
    cameraViewPreset,
    visualizationMethod,
  ]);

  const points = useBaryonVisualizer({
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
    controlVersion,
    adaptiveResetNonce,
    renderProfile,
    basePixelRatio,
    onStageRender,
    suppressRender,
    enableControlEventSync,
  });

  return (
    <>
      {shouldMountOrbitControls(visualizationMethod, cameraControlMode) ? (
        <OrbitControls ref={orbitControlsRef} enableDamping />
      ) : null}
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
