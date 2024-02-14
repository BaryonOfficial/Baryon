import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, Suspense } from "react";
import { v4 as uuidv4 } from "uuid";
import * as THREE from "three";
import "./App.css";

import vertexShader from "./shaders/shader.vert";
import fragmentShader from "./shaders/shader.frag";

const DPR = 2;

let parameters = {
  N: 12,
  vel: 0.05,
  num: 30000,
  waveComponents: [],
  rotationSpeed: 0.01,
  radius: 3.0, // Radius of the sphere
};

// Populate initial wave component values
for (let i = 0; i < parameters.N; i++) {
  parameters.waveComponents.push({
    [`A${i}`]: Math.random() * 3 + 1,
    [`u${i}`]: Math.floor(Math.random() * 10) + 1,
    [`v${i}`]: Math.floor(Math.random() * 10) + 1,
    [`w${i}`]: Math.floor(Math.random() * 10) + 1,
  });
}

const waveComponentsArray = [];
for (let i = 0; i < parameters.N; i++) {
  waveComponentsArray.push(parameters.waveComponents[i][`A${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`u${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`v${i}`]);
  waveComponentsArray.push(parameters.waveComponents[i][`w${i}`]);
}

console.log(parameters.waveComponents);

const Raymarching = () => {
  const mesh = useRef();
  const { viewport, camera } = useThree();

  const uniforms = {
    N: { value: parameters.N },
    waveComponents: { value: new Float32Array(waveComponentsArray) },
    uTime: new THREE.Uniform(0.0),
    uResolution: new THREE.Uniform(new THREE.Vector2()),
    uRadius: { value: parameters.radius },
    uCameraPos: { value: new THREE.Vector3() }, // Add camera position uniform
  };

  useFrame((state) => {
    const { clock } = state;
    mesh.current.material.uniforms.uTime.value = clock.getElapsedTime();
    mesh.current.material.uniforms.uResolution.value = new THREE.Vector2(
      window.innerWidth * DPR,
      window.innerHeight * DPR
    );
    mesh.current.material.uniforms.uCameraPos.value.copy(camera.position); // Update camera position each frame
  });

  return (
    <mesh ref={mesh} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        key={uuidv4()}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
        glslVersion={THREE.GLSL3}
      />
    </mesh>
  );
};

const Scene = () => {
  return (
    <Canvas camera={{ position: [0, 0, 6] }} dpr={DPR}>
      <Suspense fallback={null}>
        <Raymarching />
      </Suspense>
    </Canvas>
  );
};

export default Scene;
