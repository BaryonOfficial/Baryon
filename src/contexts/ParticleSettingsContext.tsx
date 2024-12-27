import { useParticleSettings } from '@/hooks/particles/useParticleSettings';
import { ParticleSettingsContext } from './particleSettingsContextValue';

// The provider wraps the scene and makes settings available to all children
export function ParticleSettingsProvider({ children }: { children: React.ReactNode }) {
  const particleConfig = useParticleSettings();
  return (
    <ParticleSettingsContext.Provider value={particleConfig}>
      {children}
    </ParticleSettingsContext.Provider>
  );
}
