import { OrbitControls } from '@react-three/drei';
import { AudioInitializer } from './AudioInitializer';
import { ParticleSettingsProvider } from '@/contexts/ParticleSettingsContext';
import { ParticleSystem } from './ParticleSystem';

export function SceneContent() {
  return (
    <ParticleSettingsProvider>
      <OrbitControls enableDamping dampingFactor={0.05} />
      <AudioInitializer />
      <ParticleSystem />
    </ParticleSettingsProvider>
  );
}
