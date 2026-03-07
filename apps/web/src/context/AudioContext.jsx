import { createContext, useContext } from "react";

export const AudioContext = createContext(null);

export function useAudio() {
  return useContext(AudioContext);
}
