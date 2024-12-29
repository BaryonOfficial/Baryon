import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { SceneContent } from './SceneContent';
import { AudioControls } from '../Controls/AudioControls';
import { FullscreenContainer } from '../FullscreenContainer';
import { LoadingFallback } from './LoadingFallback';
import { Perf } from 'r3f-perf';
import { useControls, folder } from 'leva';

export function Scene() {
  const { perfMonitor, minimalPerfMonitor } = useControls(
    'Debug Views',
    {
      'Performance Monitor': folder({
        perfMonitor: {
          value: true,
          label: 'Show Monitor',
        },
        minimalPerfMonitor: {
          value: false,
          label: 'Minimal View',
        },
      }),
    },
    {
      collapsed: true,
    }
  );

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
          <Suspense fallback={<LoadingFallback />}>
            <SceneContent />
          </Suspense>
          {perfMonitor && <Perf position="bottom-left" minimal={minimalPerfMonitor} />}
        </Canvas>
      </FullscreenContainer>
      <AudioControls />
    </>
  );
}
