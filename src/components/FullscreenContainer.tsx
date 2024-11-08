import { ReactNode, useCallback, useEffect, useRef } from 'react';

interface FullscreenContainerProps {
  children: ReactNode;
  className?: string;
}

export function FullscreenContainer({ children, className = '' }: FullscreenContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'f') toggleFullscreen();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen]);

  return (
    <div ref={containerRef} className={`w-screen h-screen absolute z-10 ${className}`}>
      {children}
    </div>
  );
}
