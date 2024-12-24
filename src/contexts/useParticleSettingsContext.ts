import { useContext } from 'react';
import { ParticleSettingsContext } from './particleSettingsContextValue';

export function useParticleSettingsContext() {
  const context = useContext(ParticleSettingsContext);
  if (!context) {
    throw new Error('useParticleSettingsContext must be used within ParticleSettingsProvider');
  }
  return context;
}
