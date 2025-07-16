import { Canvas, useFrame, useThree, extend } from "@react-three/fiber";
import { useRef, Suspense } from "react";
import { shaderMaterial, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import "./App.css";
import { useControls, folder, Leva, button } from "leva";
import { Perf } from "r3f-perf";

import vertexShader from "./shaders/raymarch/vertex.glsl";
import fragmentShader from "./shaders/raymarch/fragment.glsl";
import { useWaveComponents } from "./hooks/useWaveComponents";
import PostProcessing from "./components/PostProcessing";
import PitchDetectionPanel from "./components/PitchDetectionPanel";

// Define default values as constants to ensure consistency
const DEFAULT_VALUES = {
  stepSize: 0.04,
  threshold: 0.12,
  lightSamples: 12,
  densityScale: 0.72,
  emptySpaceThreshold: 0.25,
  adaptiveStepStrength: 24.0,
  emptySpaceFactor: 3.0,
  baseColor: "#ffffff",
  highlightColor: "#fff27b",
  radius: 3.6,
  performanceMode: 0.2, // Default is balanced (0=highest quality, 1=highest performance)
  numComponents: 12,
  frameInterval: 60,
  generationEnabled: true,
  transitionDuration: 15, // Default transition duration in frames
  primitiveType: 0,
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
    N: DEFAULT_VALUES.numComponents,
    waveComponents: new Float32Array(DEFAULT_VALUES.numComponents * 4), // Current wave components
    prevWaveComponents: new Float32Array(DEFAULT_VALUES.numComponents * 4), // Previous wave components
    uTransitionProgress: 1.0, // Transition progress (0.0 - 1.0)
    uStepSize: DEFAULT_VALUES.stepSize,
    uDensityScale: DEFAULT_VALUES.densityScale,
    uEmptySpaceThreshold: DEFAULT_VALUES.emptySpaceThreshold,
    uBaseColor: new THREE.Color(DEFAULT_VALUES.baseColor),
    uHighlightColor: new THREE.Color(DEFAULT_VALUES.highlightColor),
    uAdaptiveStepStrength: DEFAULT_VALUES.adaptiveStepStrength,
    uEmptySpaceFactor: DEFAULT_VALUES.emptySpaceFactor,
    uPerformanceMode: DEFAULT_VALUES.performanceMode, // Performance mode uniform
    uPrimitiveType: DEFAULT_VALUES.primitiveType,
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

  // Use Leva for wave component controls
  const { numComponents, frameInterval, generationEnabled, transitionDuration } = useControls({
    "Wave Components": folder(
      {
        numComponents: {
          value: DEFAULT_VALUES.numComponents,
          min: 4,
          max: 24,
          step: 1,
          label: "Number of Components",
        },
        frameInterval: {
          value: DEFAULT_VALUES.frameInterval,
          min: 1,
          max: 120,
          step: 1,
          label: "Frames Between Updates",
        },
        generationEnabled: {
          value: DEFAULT_VALUES.generationEnabled,
          label: "Auto-Generate Patterns",
        },
        transitionDuration: {
          value: DEFAULT_VALUES.transitionDuration,
          min: 5,
          max: 60,
          step: 1,
          label: "Transition Duration (frames)",
        },
        generateNew: button(() => {
          // This will be connected to the hook's generateNew function
          if (waveComponentsRef.current) {
            waveComponentsRef.current.generateNew();
          }
        }),
      },
      { collapsed: true }
    ),
  });

  // Use our custom hook for wave components with current settings
  const waveComponentsRef = useRef(null);
  const waveComponents = useWaveComponents({
    numComponents,
    frameInterval,
    minAmplitude: 1.0,
    maxAmplitude: 4.0,
    minFrequency: 1,
    maxFrequency: 10,
    enabled: generationEnabled,
    transitionDuration,
  });

  // Store the hook result in a ref for the button to access
  waveComponentsRef.current = waveComponents;

  // Use Leva for rendering controls
  const {
    stepSize,
    threshold,
    densityScale,
    emptySpaceThreshold,
    adaptiveStepStrength,
    emptySpaceFactor,
    radius,
    performanceMode,
    primitiveType,
  } = useControls({
    "Volumetric Rendering": folder(
      {
        radius: {
          value: DEFAULT_VALUES.radius,
          min: 1.0,
          max: 5.0,
          step: 0.1,
          label: "Sphere Radius",
        },
        performanceMode: {
          value: DEFAULT_VALUES.performanceMode,
          min: 0.0,
          max: 1.0,
          step: 0.01,
          label: "Performance Mode",
        },
        primitiveType: {
          value: DEFAULT_VALUES.primitiveType,
          min: 0,
          max: 10,
          step: 1,
          label: "Shapes",
        },
        stepSize: {
          value: DEFAULT_VALUES.stepSize,
          min: 0.01,
          max: 0.1,
          step: 0.001,
          label: "Step Size",
        },
        threshold: {
          value: DEFAULT_VALUES.threshold,
          min: 0.01,
          max: 2.0,
          step: 0.001,
          label: "Pattern Threshold",
        },
        densityScale: {
          value: DEFAULT_VALUES.densityScale,
          min: 0.01,
          max: 1.0,
          step: 0.01,
          label: "Density Scale",
        },
        emptySpaceThreshold: {
          value: DEFAULT_VALUES.emptySpaceThreshold,
          min: 0.001,
          max: 0.5,
          step: 0.001,
          label: "Empty Space Threshold",
        },
        adaptiveStepStrength: {
          value: DEFAULT_VALUES.adaptiveStepStrength,
          min: 0.0,
          max: 30.0,
          step: 0.5,
          label: "Adaptive Step",
        },
        emptySpaceFactor: {
          value: DEFAULT_VALUES.emptySpaceFactor,
          min: 1.0,
          max: 5.0,
          step: 0.1,
          label: "Empty Space Factor",
        },
      },
      { collapsed: true }
    ),
  });

  // Add color controls in a separate folder
  const { baseColor, highlightColor } = useControls({
    "Color Settings": folder(
      {
        baseColor: {
          value: DEFAULT_VALUES.baseColor,
          label: "Base Color",
        },
        highlightColor: {
          value: DEFAULT_VALUES.highlightColor,
          label: "Highlight Color",
        },
      },
      { collapsed: true }
    ),
  });

  // Add camera controls
  useControls({
    "Camera Controls": folder(
      {
        resetCamera: button(() => {
          if (controlsRef.current) {
            controlsRef.current.reset();
          }
        }),
      },
      { collapsed: true }
    ),
  });

  // Convert hex colors to RGB for shader
  const baseColorRGB = new THREE.Color(baseColor);
  const highlightColorRGB = new THREE.Color(highlightColor);

  useFrame((state) => {
    const currentTime = state.clock.getElapsedTime();

    // Get updated wave components with transition data
    const { current, previous, progress } = waveComponents.update();

    if (materialRef.current?.uniforms) {
      materialRef.current.uniforms.uTime.value = currentTime;
      materialRef.current.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);

      // Update camera position and rotation for raymarching
      materialRef.current.uniforms.uCameraPosition.value.copy(camera.position);
      materialRef.current.uniforms.uCameraQuaternion.value.copy(camera.quaternion);

      // Update values from Leva controls
      materialRef.current.uniforms.uStepSize.value = stepSize;
      materialRef.current.uniforms.uThreshold.value = threshold;
      materialRef.current.uniforms.uDensityScale.value = densityScale;
      materialRef.current.uniforms.uEmptySpaceThreshold.value = emptySpaceThreshold;
      materialRef.current.uniforms.uAdaptiveStepStrength.value = adaptiveStepStrength;
      materialRef.current.uniforms.uEmptySpaceFactor.value = emptySpaceFactor;
      materialRef.current.uniforms.uPerformanceMode.value = performanceMode;
      materialRef.current.uniforms.uPrimitiveType.value = primitiveType;

      // Update wave components with the latest values
      materialRef.current.uniforms.N.value = numComponents;
      materialRef.current.uniforms.uRadius.value = radius;
      materialRef.current.uniforms.waveComponents.value = current;
      materialRef.current.uniforms.prevWaveComponents.value = previous;
      materialRef.current.uniforms.uTransitionProgress.value = progress;

      // Update color values
      materialRef.current.uniforms.uBaseColor.value.set(baseColorRGB.r, baseColorRGB.g, baseColorRGB.b);
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
      <OrbitControls ref={controlsRef} minDistance={1} maxDistance={20} enableDamping dampingFactor={0.1} />
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

export default function App() {
  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100vh" }}>
      <div style={{ flex: "0 0 auto" }}>
        <PitchDetectionPanel />
      </div>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {/* Add the Leva component with custom configuration */}
        <Leva
          collapsed={true}
          theme={{
            sizes: {
              rootWidth: "360px", // Increase default width even more
              labelWidth: "50%", // Allocate more space for labels
            },
          }}
        />

        <Canvas gl={{ alpha: true }} camera={{ position: [0, 0, 10], fov: 50 }}>
          <Perf position="bottom-left" />
          <color args={["#000000"]} attach="background" />
          <Suspense fallback={null}>
            <Raymarching />
            <PostProcessing preset="intense" />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
