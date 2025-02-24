import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense } from 'react';
import { shaderMaterial, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';

import vertexShader from './shaders/raymarch/vertex.glsl';
import fragmentShader from './shaders/raymarch/fragment.glsl';
import { useRaymarchControls } from './hooks/useRaymarchControls';

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
    uThreshold: 1,
    uIsClicked: 0, // 0 for not clicked, 1 for clicked
    uRadius: parameters.radius,
    uZoom: 1.0, // Add zoom uniform
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
  const { viewport, size } = useThree();

  // Use our custom hook for controls
  const controls = useRaymarchControls({
    minZoom: 0.1,
    maxZoom: 5.0,
    initialZoom: 1.0,
    zoomSpeed: 0.001,
    rotationDamping: 0.95,
  });

  useFrame((state) => {
    const currentTime = state.clock.getElapsedTime();

    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = currentTime;
      materialRef.current.uniforms.uResolution.value.set(
        size.width * viewport.dpr,
        size.height * viewport.dpr
      );
      materialRef.current.uniforms.uZoom.value = controls.zoom;
      materialRef.current.uniforms.uPointer.value.set(controls.rotation.x, controls.rotation.y);
      materialRef.current.uniforms.uIsClicked.value = controls.isPointerDown ? 1 : 0;
    }

    // Update controls (apply damping, etc.)
    controls.updateControls();
  });

  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} near={0.1} far={1000} />
      <mesh
        scale={[viewport.width, viewport.height, 1]}
        onPointerDown={controls.handlePointerDown}
        onPointerUp={controls.handlePointerUp}
        onPointerLeave={controls.handlePointerUp}
        onPointerMove={controls.handlePointerMove}>
        <planeGeometry />
        <chladniMaterial ref={materialRef} glslVersion={THREE.GLSL3} />
      </mesh>
    </>
  );
};

const Scene = () => {
  return (
    <Canvas gl={{ alpha: true }}>
      <color args={['#ffffff']} attach="background" />
      <Suspense fallback={null}>
        <Raymarching />
      </Suspense>
    </Canvas>
  );
};

export default Scene;
