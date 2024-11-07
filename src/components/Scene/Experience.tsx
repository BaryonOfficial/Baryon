import { Effects, OrbitControls } from "@react-three/drei";
import Particles from "./Particles";
import { useRef } from "react";
import { ParticlesRef } from "@/types/particles";

export default function Experience() {
  const particlesRef = useRef<ParticlesRef>(null)

    return (
      <>
        <OrbitControls enableDamping dampingFactor={0.05} />
        <Particles
          ref={particlesRef}
          gpgpu={gpgpu}
          geometries={geometries}
          parameters={parameters}
          audioObject={audioObject}
        />
        <Effects />
      </>
    );
  }