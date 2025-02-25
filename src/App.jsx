import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useRef, Suspense, useState } from 'react';
import { shaderMaterial, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './App.css';
import { useControls, folder, Leva, button } from 'leva';

import vertexShader from './shaders/raymarch/vertex.glsl';
import fragmentShader from './shaders/raymarch/fragment.glsl';
import { useWaveComponents } from './hooks/useWaveComponents';
import PostProcessing from './components/PostProcessing';

// Define default values as constants to ensure consistency
const DEFAULT_VALUES = {
  stepSize: 0.05,
  threshold: 0.24,
  lightSamples: 8,
  densityScale: 0.4,
  emptySpaceThreshold: 0.03,
  adaptiveStepStrength: 25.0,
  emptySpaceFactor: 4.0,
  baseColor: '#ffffff',
  highlightColor: '#fff27b',
  radius: 3.2,
};

// Create custom shader material
const ChladniMaterial = shaderMaterial(
  {
    uTime: 0,
    uResolution: new THREE.Vector2(),
    uCameraPosition: new THREE.Vector3(), // Camera position for ray origin
    uCameraQuaternion: new THREE.Quaternion(), // Camera rotation as quaternion
    uThreshold: DEFAULT_VALUES.threshold,
    uRadius: DEFAULT_VALUES.radius,
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
  const { viewport, size, camera } = useThree();
  const planeRef = useRef();
  const controlsRef = useRef();

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

  // Auto-generate new patterns over time
  const [autoGenerate, setAutoGenerate] = useState(false);
  const lastGenerateTime = useRef(0);
  const [generateInterval, setGenerateInterval] = useState(1); // seconds (faster default)

  // Add auto-generate control
  useControls({
    'Auto Generate Sound Waves': folder({
      enabled: {
        value: autoGenerate,
        label: 'Auto Generate',
        onChange: (value) => setAutoGenerate(value),
      },
      interval: {
        value: generateInterval,
        min: 0.001, // Much faster minimum
        max: 5, // Reduced maximum
        step: 0.001, // Finer control
        label: 'Interval (s)',
        onChange: (value) => setGenerateInterval(value),
      },
      transition: {
        value: 1.0,
        min: 0.001,
        max: 5.0,
        step: 0.001,
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

  // Add camera controls
  useControls({
    'Camera Controls': folder({
      resetCamera: button(() => {
        if (controlsRef.current) {
          controlsRef.current.reset();
        }
      }),
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

      // Update camera position and rotation for raymarching
      materialRef.current.uniforms.uCameraPosition.value.copy(camera.position);
      materialRef.current.uniforms.uCameraQuaternion.value.copy(camera.quaternion);

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

    // Update the plane position to follow camera
    if (planeRef.current && camera) {
      // Calculate position in front of camera
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(camera.quaternion);
      const position = camera.position.clone().addScaledVector(direction, camera.near + 0.01);

      // Position and rotate the plane to face the camera
      planeRef.current.position.copy(position);
      planeRef.current.quaternion.copy(camera.quaternion);

      // Scale the plane to cover the entire frustum
      const distance = camera.near + 0.01;
      const height = 2 * Math.tan((camera.fov * (Math.PI / 180)) / 2) * distance;
      const width = height * camera.aspect;
      planeRef.current.scale.set(width, height, 1);
    }
  });

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        minDistance={1}
        maxDistance={10}
        enableDamping
        dampingFactor={0.1}
      />
      <mesh ref={planeRef}>
        <planeGeometry />
        <chladniMaterial
          ref={materialRef}
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          glslVersion={THREE.GLSL3}
          toneMapped={false}
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
          },
        }}
      />

      <Canvas gl={{ alpha: true }}>
        <color args={['#000000']} attach="background" />
        <Suspense fallback={null}>
          <Raymarching />
          <PostProcessing preset="extreme" />
        </Suspense>
      </Canvas>
    </>
  );
};

export default Scene;
