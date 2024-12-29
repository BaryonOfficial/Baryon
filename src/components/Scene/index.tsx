import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Suspense } from 'react';
import { SceneContent } from './SceneContent';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';
import { LoadingFallback } from './LoadingFallback';
import { Perf } from 'r3f-perf';
import { useControls } from 'leva';

export function Scene() {
  const cameraControls = useControls(
    'Camera',
    {
      fov: {
        value: 75,
        min: 20,
        max: 120,
        label: 'Field of View',
        hint: 'Controls how wide your view angle is (in degrees)',
      },
      position: {
        value: 15,
        min: 1,
        max: 50,
        label: 'Distance',
        hint: 'How far the camera is from the center',
      },
      near: {
        value: 0.1,
        min: 0.1,
        max: 50,
        label: 'Near Clipping',
        hint: 'Closest point that will be rendered',
      },
      far: {
        value: 1000,
        min: 100,
        max: 5000,
        label: 'Far Clipping',
        hint: 'Farthest point that will be rendered',
      },
    },
    { collapsed: true }
  );

  return (
    <FullscreenContainer>
      <Canvas
        gl={{
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}
      >
        <PerspectiveCamera
          makeDefault
          position={[0, 0, cameraControls.position]}
          fov={cameraControls.fov}
          near={cameraControls.near}
          far={cameraControls.far}
        />
        <color attach="background" args={['#000000']} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
        <Perf position="bottom-left" />
      </Canvas>
      <AudioControls />
    </FullscreenContainer>
  );
}
