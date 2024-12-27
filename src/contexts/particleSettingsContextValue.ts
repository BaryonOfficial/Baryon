import type { ParticleConfig } from '@/types/particle.types';
import { createContext } from 'react';

// Creates a React context to hold the settings
export const ParticleSettingsContext = createContext<ParticleConfig | null>(null);
