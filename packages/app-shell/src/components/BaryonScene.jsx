import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useBaryonPipeline } from "./hooks/useBaryonPipeline";
import { useBaryonVisualizer } from "./hooks/useBaryonVisualizer";
import { useDefaultBaryonGeometry } from "./hooks/useDefaultBaryonGeometry";
import { VISUALIZATION_METHODS } from "@baryon/visualizer/visualization/types";

export function BaryonScene({
  setIsPlaying,
  setIsAudioLoaded,
  setIsEngineReady,
  setMicRuntimeStatus,
  micProfile,
  controlsRef,
  visualizationMethod,
  onPerformanceHudSnapshotChange,
}) {
  const { camera, gl, scene } = useThree();
  const { ensurePipeline, postNodesRef, disposePipeline } = useBaryonPipeline(
    gl,
    scene,
    camera,
  );

  // Free TRAANode's two HalfFloat render targets (history + resolve) on unmount.
  useEffect(() => disposePipeline, [disposePipeline]);
  const baryonGeometry = useDefaultBaryonGeometry();
  const isFullscreen2d =
    visualizationMethod === VISUALIZATION_METHODS.cymatics2d;

  useEffect(() => {
    if (!isFullscreen2d) {
      return;
    }

    camera.position.set(0, 0, 9);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, isFullscreen2d]);

  const points = useBaryonVisualizer({
    baryonGeometry,
    camera,
    gl,
    setIsPlaying,
    setIsAudioLoaded,
    setIsEngineReady,
    setMicRuntimeStatus,
    micProfile,
    controlsRef,
    visualizationMethod,
    ensurePipeline,
    postNodesRef,
    onPerformanceHudSnapshotChange,
  });

  return (
    <>
      {!isFullscreen2d ? <OrbitControls enableDamping /> : null}
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
