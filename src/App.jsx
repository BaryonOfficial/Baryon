import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense, useState } from 'react';
import { shaderMaterial, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';
import { useControls, folder, Leva, button } from 'leva';

import vertexShader from './shaders/raymarch/vertex.glsl';
import fragmentShader from './shaders/raymarch/fragment.glsl';
import { useRaymarchControls } from './hooks/useRaymarchControls';
import { useWaveComponents } from './hooks/useWaveComponents';

// Define default values as constants to ensure consistency
const DEFAULT_VALUES = {
  stepSize: 0.09,
  threshold: 0.8,
  lightSamples: 12,
  densityScale: 0.5,
  emptySpaceThreshold: 0.05,
  adaptiveStepStrength: 20.0,
  emptySpaceFactor: 5.0,
  baseColor: '#0060fb',
  highlightColor: '#ffffff',
  radius: 3.0,
};

// Create custom shader material
const ChladniMaterial = shaderMaterial(
  {
    uTime: 0,
    uResolution: new THREE.Vector2(),
    uPointer: new THREE.Vector2(),
    uThreshold: DEFAULT_VALUES.threshold,
    uIsClicked: 0, // 0 for not clicked, 1 for clicked
    uRadius: DEFAULT_VALUES.radius,
    uZoom: 1.0, // Add zoom uniform
    N: 12,
    waveComponents: new Float32Array(48), // 12 components * 4 values each
    waveComponentsTarget: new Float32Array(48), // Target wave components
    uBlendFactor: 0.0, // Blend factor for interpolation (0.0 to 1.0)
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

  // Use our custom hook for wave components
  const waveComponents = useWaveComponents({
    numComponents: 12,
    minAmplitude: 1.0,
    maxAmplitude: 4.0,
    minFrequency: 1,
    maxFrequency: 10,
    transitionDuration: 1.0, // 1 second transition duration
  });

  // Use Leva for controls
  const {
    stepSize,
    threshold,
    lightSamples,
    densityScale,
    emptySpaceThreshold,
    adaptiveStepStrength,
    emptySpaceFactor,
    radius,
  } = useControls({
    'Volumetric Rendering': folder(
      {
        radius: {
          value: DEFAULT_VALUES.radius,
          min: 1.0,
          max: 5.0,
          step: 0.1,
          label: 'Sphere Radius',
        },
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
          label: 'Adaptive Step',
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

  // Auto-generate new patterns over time
  const [autoGenerate, setAutoGenerate] = useState(false);
  const lastGenerateTime = useRef(0);
  const [generateInterval, setGenerateInterval] = useState(1); // seconds (faster default)

  // Add auto-generate control
  useControls({
    'Auto Generate Patterns': folder({
      enabled: {
        value: autoGenerate,
        label: 'Auto Generate',
        onChange: (value) => setAutoGenerate(value),
      },
      interval: {
        value: generateInterval,
        min: 0.2, // Much faster minimum
        max: 5, // Reduced maximum
        step: 0.1, // Finer control
        label: 'Interval (s)',
        onChange: (value) => setGenerateInterval(value),
      },
      transition: {
        value: 1.0,
        min: 0.1,
        max: 2.0,
        step: 0.1,
        label: 'Transition (s)',
        onChange: (value) => {
          waveComponents.setTransitionDuration(value);
        },
      },
    }),
  });

  // Add wave component controls
  useControls({
    'Wave Components': folder({
      generateNew: button(() => waveComponents.generateNewComponents()),
    }),
  });

  useFrame((state) => {
    const currentTime = state.clock.getElapsedTime();

    // Update transition blend factor
    const currentBlendFactor = waveComponents.updateTransition(currentTime);

    // Auto-generate new patterns if enabled, interval has passed, and not currently transitioning
    if (
      autoGenerate &&
      currentTime - lastGenerateTime.current > generateInterval &&
      !waveComponents.isTransitioning
    ) {
      waveComponents.generateNewComponents();
      lastGenerateTime.current = currentTime;
    }

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

      // Update wave components with shader-based interpolation
      materialRef.current.uniforms.N.value = waveComponents.numComponents;
      materialRef.current.uniforms.uRadius.value = radius;
      materialRef.current.uniforms.waveComponents.value =
        waveComponents.getCurrentComponentsArray();
      materialRef.current.uniforms.waveComponentsTarget.value =
        waveComponents.getTargetComponentsArray();
      materialRef.current.uniforms.uBlendFactor.value = currentBlendFactor;

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
      {/* Add the Leva component with custom configuration */}
      <Leva
        theme={{
          sizes: {
            rootWidth: '360px', // Increase default width even more
            labelWidth: '50%', // Allocate more space for labels
            controlWidth: '50%', // Allocate space for control inputs
          },
        }}
      />

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
