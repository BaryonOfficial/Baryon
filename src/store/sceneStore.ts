import { create } from 'zustand'
import type { SceneStore } from '@/types/scene.types'

export const useSceneStore = create<SceneStore>((set) => ({
  showStats: false,
  setShowStats: (show) => set({ showStats: show })
})) 