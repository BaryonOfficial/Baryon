import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Sphere } from '@react-three/drei';
import { Suspense } from 'react';
import Experience from './Experience';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';

function LoadingSphere() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <Sphere args={[0.5, 32, 32]}>
        <meshStandardMaterial color="#ff0000" wireframe />
      </Sphere>
    </>
  );
}

export default function Scene() {
  return (
    <FullscreenContainer>
      <Canvas
        gl={{
          antialias: true,
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}>
        <PerspectiveCamera makeDefault position={[0, 0, 1]} fov={75} near={0.1} far={1000} />

        <color attach="background" args={['#000000']} />
        <Suspense fallback={<LoadingSphere />}>
          <Experience />
        </Suspense>
      </Canvas>
      <AudioControls />
    </FullscreenContainer>
  );
}
