import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { Suspense } from 'react';
import { SceneContent } from './SceneContent';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';
import { LoadingFallback } from './LoadingFallback';

export function Scene() {
  return (
    <FullscreenContainer>
      <Canvas
        gl={{
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}>
        <PerspectiveCamera makeDefault position={[0, 0, 1]} fov={75} near={0.1} far={1000} />
        <color attach="background" args={['#000000']} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <AudioControls />
    </FullscreenContainer>
  );
}
