import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useBaryonControls } from "./hooks/useBaryonControls";
import { useBaryonPipeline } from "./hooks/useBaryonPipeline";
import { useBaryonVisualizer } from "./hooks/useBaryonVisualizer";

export function BaryonScene({ setIsPlaying, setIsAudioLoaded }) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useBaryonControls();
  const { ensurePipeline, syncBloom } = useBaryonPipeline(gl, scene, camera);
  const points = useBaryonVisualizer({
    camera,
    gl,
    setIsPlaying,
    setIsAudioLoaded,
    controlsRef,
    ensurePipeline,
    syncBloom,
  });

  return (
    <>
      <OrbitControls enableDamping />
      {/* eslint-disable-next-line react/no-unknown-property */}
      {points && <primitive object={points} />}
    </>
  );
}
