export interface SceneState {
  showStats: boolean;
}

export interface SceneActions {
  setShowStats: (show: boolean) => void;
}

export type SceneStore = SceneState & SceneActions;
