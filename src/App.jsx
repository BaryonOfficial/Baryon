import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense, useState, useCallback } from 'react';
import { shaderMaterial, OrthographicCamera } from '@react-three/drei';
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
    uThreshold: 0.5,
    uIsClicked: 0, // 0 for not clicked, 1 for clicked
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
  const { viewport, size } = useThree();
  const [isClicked, setIsClicked] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const lastPointer = useRef({ x: 0, y: 0 });

  const handlePointerMove = useCallback(
    (event) => {
      if (isClicked) {
        const newPointer = {
          x: (event.point.x / size.width) * 2,
          y: (event.point.y / size.height) * 2,
        };

        // Calculate rotation delta
        const deltaX = newPointer.x - lastPointer.current.x;
        const deltaY = newPointer.y - lastPointer.current.y;

        // Update accumulated rotation
        setRotation((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));

        // Update last pointer position
        lastPointer.current = newPointer;
      }
    },
    [isClicked, size]
  );

  useFrame((state) => {
    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
      materialRef.current.uniforms.uResolution.value.set(
        size.width * viewport.dpr,
        size.height * viewport.dpr
      );
      materialRef.current.uniforms.uPointer.value.set(rotation.x, rotation.y);
      materialRef.current.uniforms.uIsClicked.value = isClicked ? 1 : 0;
    }
  });

  const handlePointerDown = useCallback(
    (event) => {
      setIsClicked(true);
      lastPointer.current = {
        x: (event.point.x / size.width) * 2,
        y: (event.point.y / size.height) * 2,
      };
    },
    [size]
  );

  return (
    <>
      <OrthographicCamera makeDefault position={[0, 0, 1]} zoom={1} near={0.1} far={1000} />
      <mesh
        scale={[viewport.width, viewport.height, 1]}
        onPointerDown={handlePointerDown}
        onPointerUp={() => setIsClicked(false)}
        onPointerLeave={() => setIsClicked(false)}
        onPointerMove={handlePointerMove}>
        <planeGeometry />
        <chladniMaterial ref={materialRef} glslVersion={THREE.GLSL3} />
      </mesh>
    </>
  );
};

const Scene = () => {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Raymarching />
      </Suspense>
    </Canvas>
  );
};

export default Scene;
