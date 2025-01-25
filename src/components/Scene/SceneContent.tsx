import { OrbitControls } from '@react-three/drei';
import { AudioInitializer } from './AudioInitializer';
import { ParticleSettingsProvider } from '@/contexts/ParticleSettingsContext';
import { ParticleSystem } from './ParticleSystem';
import { PostProcessingEffects } from './PostProcessingEffects';
import { Suspense } from 'react';
import { LoadingFallback } from './LoadingFallback';

export function SceneContent() {
  return (
    <ParticleSettingsProvider>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <AudioInitializer />
      <Suspense fallback={<LoadingFallback />}>
        <ParticleSystem />
        <PostProcessingEffects />
      </Suspense>
    </ParticleSettingsProvider>
  );
}
