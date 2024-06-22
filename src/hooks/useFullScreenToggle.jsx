import { useEffect } from 'react';
import { toggleFullscreen } from '../utils/fullscreenUtils';

export function useFullscreenToggle(elementRef) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'f' && elementRef.current) {
        toggleFullscreen(elementRef.current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [elementRef]);
}
