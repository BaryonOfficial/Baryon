import { useEffect, useCallback } from 'react';

export function useFullscreen(elementRef) {
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      elementRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [elementRef]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'f' && elementRef.current) {
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [elementRef, toggleFullscreen]);

  return toggleFullscreen;
}
