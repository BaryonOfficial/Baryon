import { useCallback, useEffect, useState } from "react";

function isEditingElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function readFullscreenState() {
  if (typeof window !== "undefined") {
    const desktopFullscreenState =
      window.electronAPI?.windowControls?.getFullscreenState?.();
    if (desktopFullscreenState) {
      return desktopFullscreenState.fullscreen === true;
    }
  }

  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(readFullscreenState);
  const toggleFullscreen = useCallback(() => {
    const desktopWindowControls = window.electronAPI?.windowControls;
    if (desktopWindowControls?.toggleFullscreen) {
      void desktopWindowControls.toggleFullscreen();
      return;
    }

    if (!document.fullscreenElement) {
      elementRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [elementRef]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleKeyDown = (event) => {
      const activeElement = document.activeElement;
      if (
        event.key === "f" &&
        elementRef.current &&
        !isEditingElement(activeElement)
      ) {
        event.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [elementRef, toggleFullscreen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const desktopWindowControls = window.electronAPI?.windowControls;
    setIsFullscreen(readFullscreenState());
    if (!desktopWindowControls?.subscribeFullscreenState) {
      return undefined;
    }

    return desktopWindowControls.subscribeFullscreenState((nextState) => {
      setIsFullscreen(nextState?.fullscreen === true);
    });
  }, []);

  return { isFullscreen, toggleFullscreen };
}
