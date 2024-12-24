import type { ParticleParameters, ParticleSettings } from '@/types/particle.types';
import { createContext } from 'react';

export type SettingsContextType = {
  parameters: ParticleParameters;
  settings: ParticleSettings;
};

// Creates a React context to hold the settings
export const ParticleSettingsContext = createContext<SettingsContextType | null>(null);
