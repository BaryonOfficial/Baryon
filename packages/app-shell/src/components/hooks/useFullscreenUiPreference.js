import { useCallback, useMemo, useState } from "react";

export const FULLSCREEN_UI_STORAGE_KEY = "baryon.ui.showUiInFullscreen.v1";

function readShowUiInFullscreen() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage?.getItem(FULLSCREEN_UI_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShowUiInFullscreen(nextValue) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage?.setItem(
      FULLSCREEN_UI_STORAGE_KEY,
      nextValue ? "1" : "0",
    );
  } catch {
    // The runtime preference remains usable when browser storage is unavailable.
  }
}

export function useFullscreenUiPreference() {
  const [showUiInFullscreen, setShowUiInFullscreenState] = useState(
    readShowUiInFullscreen,
  );
  const setShowUiInFullscreen = useCallback((nextValue) => {
    const normalizedValue = nextValue === true;
    setShowUiInFullscreenState(normalizedValue);
    writeShowUiInFullscreen(normalizedValue);
  }, []);

  return useMemo(
    () => ({ showUiInFullscreen, setShowUiInFullscreen }),
    [showUiInFullscreen, setShowUiInFullscreen],
  );
}
