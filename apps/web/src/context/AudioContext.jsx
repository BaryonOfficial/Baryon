import { createContext, useContext } from "react";

export const AudioContext = createContext(null);
export const AudioSceneContext = createContext(null);

export function useAudio() {
  return useContext(AudioContext);
}

export function useAudioScene() {
  return useContext(AudioSceneContext);
}
