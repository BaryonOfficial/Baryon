import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Experience from './Experience';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';

export default function Scene() {
  return (
    <FullscreenContainer>
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
          <Experience />
        </Suspense>
      </Canvas>
      <AudioControls />
    </FullscreenContainer>
  );
}
