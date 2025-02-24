import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense } from 'react';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';

import vertexShader from './shaders/raymarch/vertex.glsl';
import fragmentShader from './shaders/raymarch/fragment.glsl';

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

// Create custom shader material
const ChladniMaterial = shaderMaterial(
  {
    uTime: 0,
    uResolution: new THREE.Vector2(),
    uPointer: new THREE.Vector2(),
    uThreshold: 0,
    uRadius: parameters.radius,
    N: parameters.N,
    waveComponents: new Float32Array(waveComponentsArray),
  },
  vertexShader,
  fragmentShader
);

// Extend Three.js with our custom material
extend({ ChladniMaterial });

const Raymarching = () => {
  const materialRef = useRef();
  const { viewport, pointer, size } = useThree();

  useFrame((state) => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uResolution.value.set(
        size.width * viewport.dpr,
        size.height * viewport.dpr
      );
      materialRef.current.uniforms.uPointer.value.set(pointer.x, pointer.y);
    }
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <chladniMaterial ref={materialRef} glslVersion={THREE.GLSL3} />
    </mesh>
  );
};

const Scene = () => {
  return (
    <Canvas camera={{ position: [0, 0, 6] }}>
      <Suspense fallback={null}>
        <Raymarching />
      </Suspense>
    </Canvas>
  );
};

export default Scene;
