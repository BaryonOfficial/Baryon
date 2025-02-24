import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense } from 'react';
import { shaderMaterial, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';
import { useControls, folder, Leva } from 'leva'; // Import just what we need

import vertexShader from './shaders/raymarch/vertex.glsl';
import fragmentShader from './shaders/raymarch/fragment.glsl';
import { useRaymarchControls } from './hooks/useRaymarchControls';

// Define default values as constants to ensure consistency
const DEFAULT_VALUES = {
  stepSize: 0.03,
  threshold: 0.32,
  lightSamples: 12,
  densityScale: 0.22,
  emptySpaceThreshold: 0.005,
  adaptiveStepStrength: 15.0,
  emptySpaceFactor: 3.0,
  baseColor: '#0060fb',
  highlightColor: '#ffffff',
};

let parameters = {
  N: 12,
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
    uThreshold: DEFAULT_VALUES.threshold,
    uIsClicked: 0, // 0 for not clicked, 1 for clicked
    uRadius: parameters.radius,
    uZoom: 1.0, // Add zoom uniform
    N: parameters.N,
    waveComponents: new Float32Array(waveComponentsArray),
    uStepSize: DEFAULT_VALUES.stepSize,
    uLightSamples: DEFAULT_VALUES.lightSamples,
    uDensityScale: DEFAULT_VALUES.densityScale,
    uEmptySpaceThreshold: DEFAULT_VALUES.emptySpaceThreshold,
    uBaseColor: new THREE.Color(DEFAULT_VALUES.baseColor),
    uHighlightColor: new THREE.Color(DEFAULT_VALUES.highlightColor),
    uAdaptiveStepStrength: DEFAULT_VALUES.adaptiveStepStrength,
    uEmptySpaceFactor: DEFAULT_VALUES.emptySpaceFactor,
  },
  vertexShader,
  fragmentShader
);

// Extend Three.js with our custom material
extend({ ChladniMaterial });

const Raymarching = () => {
  const materialRef = useRef();
  const { viewport, size } = useThree();

  // Use Leva for controls
  const {
    stepSize,
    threshold,
    lightSamples,
    densityScale,
    emptySpaceThreshold,
    adaptiveStepStrength,
    emptySpaceFactor,
  } = useControls({
    'Volumetric Rendering': folder(
      {
        stepSize: {
          value: DEFAULT_VALUES.stepSize,
          min: 0.01,
          max: 0.1,
          step: 0.005,
          label: 'Step Size',
        },
        threshold: {
          value: DEFAULT_VALUES.threshold,
          min: 0.1,
          max: 2.0,
          step: 0.05,
          label: 'Pattern Threshold',
        },
        lightSamples: {
          value: DEFAULT_VALUES.lightSamples,
          min: 4,
          max: 16,
          step: 1,
          label: 'Light Samples',
        },
        densityScale: {
          value: DEFAULT_VALUES.densityScale,
          min: 0.05,
          max: 0.5,
          step: 0.01,
          label: 'Density Scale',
        },
        emptySpaceThreshold: {
          value: DEFAULT_VALUES.emptySpaceThreshold,
          min: 0.001,
          max: 0.1,
          step: 0.001,
          label: 'Empty Space Threshold',
        },
        adaptiveStepStrength: {
          value: DEFAULT_VALUES.adaptiveStepStrength,
          min: 0.0,
          max: 30.0,
          step: 0.5,
          label: 'Adaptive Step Strength',
        },
        emptySpaceFactor: {
          value: DEFAULT_VALUES.emptySpaceFactor,
          min: 1.0,
          max: 5.0,
          step: 0.1,
          label: 'Empty Space Factor',
        },
      },
      { collapsed: false }
    ),
  });

  // Add color controls in a separate folder
  const { baseColor, highlightColor } = useControls({
    'Color Settings': folder({
      baseColor: {
        value: DEFAULT_VALUES.baseColor,
        label: 'Base Color',
      },
      highlightColor: {
        value: DEFAULT_VALUES.highlightColor,
        label: 'Highlight Color',
      },
    }),
  });

  // Convert hex colors to RGB for shader
  const baseColorRGB = new THREE.Color(baseColor);
  const highlightColorRGB = new THREE.Color(highlightColor);

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

      // Update values from Leva controls
      materialRef.current.uniforms.uStepSize.value = stepSize;
      materialRef.current.uniforms.uThreshold.value = threshold;
      materialRef.current.uniforms.uLightSamples.value = lightSamples;
      materialRef.current.uniforms.uDensityScale.value = densityScale;
      materialRef.current.uniforms.uEmptySpaceThreshold.value = emptySpaceThreshold;
      materialRef.current.uniforms.uAdaptiveStepStrength.value = adaptiveStepStrength;
      materialRef.current.uniforms.uEmptySpaceFactor.value = emptySpaceFactor;

      // Update color values
      materialRef.current.uniforms.uBaseColor.value.set(
        baseColorRGB.r,
        baseColorRGB.g,
        baseColorRGB.b
      );
      materialRef.current.uniforms.uHighlightColor.value.set(
        highlightColorRGB.r,
        highlightColorRGB.g,
        highlightColorRGB.b
      );
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
        <chladniMaterial
          ref={materialRef}
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          glslVersion={THREE.GLSL3}
        />
      </mesh>
    </>
  );
};

const Scene = () => {
  return (
    <>
      {/* Add the Leva component */}
      <Leva />

      <Canvas gl={{ alpha: true }}>
        <color args={['#000000']} attach="background" />
        <Suspense fallback={null}>
          <Raymarching />
        </Suspense>
      </Canvas>
    </>
  );
};

export default Scene;
