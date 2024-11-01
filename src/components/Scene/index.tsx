import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { useFullscreen } from '../../hooks/useFullScreenToggle';

export default function Scene() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'absolute', zIndex: 1 }}>
      <Canvas
        gl={{
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}
        camera={{
          fov: 35,
          near: 0.1,
          far: 100,
          position: [0, 3, 20],
        }}>
        <color attach="background" args={['#000000']} />
        <Suspense fallback={null}>
          <Scene3D />
        </Suspense>
      </Canvas>
      <UI />
    </div>
  );
}

// Separate component for the 3D scene contents
function Scene3D() {
  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} />

      {/* Will add Particles component here next */}
      <mesh visible={false}>
        <boxGeometry />
        <meshBasicMaterial />
      </mesh>
    </>
  );
}

// Separate component for UI elements
function UI() {
  return (
    <div className="fixed top-20 left-12 z-50 p-4">
      {/* Will move controls here next */}
      <div className="controls-container">{/* Placeholder for audio controls */}</div>
    </div>
  );
}
