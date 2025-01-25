import { Canvas } from '@react-three/fiber';
import { SceneContent } from './SceneContent';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';
import { Perf } from 'r3f-perf';

export function Scene() {
  return (
    <>
      <FullscreenContainer>
        <Canvas
          gl={{
            antialias: true,
            pixelRatio: Math.min(window.devicePixelRatio, 2),
          }}
          camera={{
            position: [0, 0, 10],
            fov: 75,
            near: 0.1,
            far: 1000,
          }}
        >
          <color attach="background" args={['#000000']} />
          <SceneContent />
          <Perf position="bottom-left" minimal={false} />
        </Canvas>
      </FullscreenContainer>
      <AudioControls />
    </>
  );
}
