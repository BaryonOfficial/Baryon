import { Effects, OrbitControls } from "@react-three/drei";
import Particles from "./Particles";

export default function Experience() {
    return (
      <>
        <OrbitControls enableDamping dampingFactor={0.05} />
        <Particles />
        <Effects />
      </>
    );
  }