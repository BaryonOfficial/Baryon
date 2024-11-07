import { create } from 'zustand'

interface SceneState {
  showStats: boolean
  setShowStats: (show: boolean) => void
}

export const useSceneStore = create<SceneState>((set) => ({
  showStats: false,
  setShowStats: (show) => set({ showStats: show })
})) 