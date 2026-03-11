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
      // Don't fire when the user is typing in an input, textarea, or contenteditable
      const tag = document.activeElement?.tagName;
      const isEditing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        document.activeElement?.isContentEditable;
      if (event.key === 'f' && elementRef.current && !isEditing) {
        toggleFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [elementRef, toggleFullscreen]);

  return toggleFullscreen;
}
