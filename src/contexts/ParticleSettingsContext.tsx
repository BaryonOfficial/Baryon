import { createContext, useContext } from 'react';
import { useParticleSettings } from '@/hooks/particles/useParticleSettings';
import type { ParticleParameters, ParticleSettings } from '@/types/particle.types';

type SettingsContextType = {
  parameters: ParticleParameters;
  settings: ParticleSettings;
};

// Creates a React context to hold the settings
const ParticleSettingsContext = createContext<SettingsContextType | null>(null);

// The provider wraps the scene and makes settings available to all children
export function ParticleSettingsProvider({ children }: { children: React.ReactNode }) {
  const settings = useParticleSettings();
  return (
    <ParticleSettingsContext.Provider value={settings}>{children}</ParticleSettingsContext.Provider>
  );
}

export function useParticleSettingsContext() {
  const context = useContext(ParticleSettingsContext);
  if (!context) throw new Error('useParticleSettings must be used within ParticleSettingsProvider');
  return context;
}
