import * as THREE from 'three'
import { Effects, OrbitControls } from "@react-three/drei";
import Particles from "./Particles";
import { useRef } from "react";
import { ParticlesRef } from "@/types/particles";
import useGPGPU from "@/hooks/useGPGPU";
import { AudioInitializer } from "./AudioInitializer";
import { useAudioStore } from "@/store/audioStore";

// Define default parameters and geometries
const defaultParameters = {
  count: 100000,
  radius: 5,
  threshold: 0.5,
  surfaceThreshold: 0.1,
  surfaceRatio: 0.5
}

const defaultGeometries = {
  base: {
    count: 100000,
    positions: new Float32Array(300000),
    instance: new THREE.BufferGeometry()
  },
  secondary: {
    count: 10000,
    instance: new THREE.BufferGeometry()
  }
}

export default function Experience() {
  const particlesRef = useRef<ParticlesRef>(null)
  const { isAudioContextRunning } = useAudioStore()
  
  const { gpgpu } = useGPGPU(
    defaultParameters,
    defaultGeometries,
    { isReady: isAudioContextRunning }
  )

  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />
      {gpgpu && (
        <>
          <AudioInitializer 
            gpgpu={gpgpu} 
            particles={particlesRef.current!} 
          />
          <Particles
            ref={particlesRef}
            gpgpu={gpgpu}
            geometries={defaultGeometries}
            parameters={defaultParameters}
          />
        </>
      )}
      <Effects />
    </>
  )
}