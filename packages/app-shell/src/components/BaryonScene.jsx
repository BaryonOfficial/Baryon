import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useBaryonPipeline } from "./hooks/useBaryonPipeline";
import { useBaryonVisualizer } from "./hooks/useBaryonVisualizer";
import { useDefaultBaryonGeometry } from "./hooks/useDefaultBaryonGeometry";
import {
  CAMERA_VIEW_PRESETS,
  applyCameraViewPreset,
} from "./cameraViewPresets.js";
import { VISUALIZATION_METHODS } from "@baryon/visualizer/visualization/types";
import { resolveRenderQualityProfile } from "@baryon/visualizer/render/outputPipeline";

const RENDER_PROFILE_COMMAND_EVENT = "__baryon-render-profile-command";

function sanitizeRenderProfileOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") {
    return null;
  }

  const nextOverrides = {};
  if (Number.isFinite(overrides.renderScale) && overrides.renderScale > 0) {
    nextOverrides.renderScale = overrides.renderScale;
  }
  if (typeof overrides.traaEnabled === "boolean") {
    nextOverrides.traaEnabled = overrides.traaEnabled;
  }
  if (typeof overrides.bloomAllowed === "boolean") {
    nextOverrides.bloomAllowed = overrides.bloomAllowed;
  }

  return Object.keys(nextOverrides).length > 0 ? nextOverrides : null;
}

export function BaryonScene({
  setIsEngineReady,
  setLiveInputRuntimeStatus,
  liveInputUiState,
  liveInputErrorCode,
  controlsRef,
  visualizationMethod,
  renderQualityPreset: performanceProfile,
  onPerformanceHudSnapshotChange,
  outputFrameConfig = null,
  onOutputFrame = null,
  onFrameState = null,
  externalFrameRef = null,
  basePixelRatio = null,
  onStageRender = null,
  cameraViewPreset = /** @type {"top-down" | "side"} */ (
    CAMERA_VIEW_PRESETS.topDown
  ),
  cameraResetNonce = 0,
}) {
  const { camera, gl, scene, size } = useThree();
  const orbitControlsRef = useRef(null);
  const [renderProfileOverrides, setRenderProfileOverrides] = useState(null);
  const renderProfile = useMemo(
    () =>
      resolveRenderQualityProfile({
        qualityPreset: performanceProfile,
        outputWidth: size.width,
        outputHeight: size.height,
        overrides: renderProfileOverrides,
      }),
    [performanceProfile, renderProfileOverrides, size.height, size.width],
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
  const isFullscreen2d =
    visualizationMethod === VISUALIZATION_METHODS.cymatics2d;

  useEffect(() => {
    if (typeof window === "undefined") {
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
  }, []);

  useEffect(() => {
    if (!isFullscreen2d) {
      return;
    }

    applyCameraViewPreset(
      camera,
      orbitControlsRef.current,
      CAMERA_VIEW_PRESETS.side,
    );
  }, [camera, isFullscreen2d]);

  useEffect(() => {
    if (isFullscreen2d) {
      return;
    }

    applyCameraViewPreset(camera, orbitControlsRef.current, cameraViewPreset);
  }, [camera, cameraResetNonce, cameraViewPreset, isFullscreen2d]);

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
    outputFrameConfig,
    onOutputFrame,
    onFrameState,
    externalFrameRef,
    renderProfile,
    basePixelRatio,
    onStageRender,
  });

  return (
    <>
      {!isFullscreen2d ? (
        <OrbitControls ref={orbitControlsRef} enableDamping />
      ) : null}
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
