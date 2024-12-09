import { useAudioStore } from '@/store/audioStore';
import { cn } from '@/lib/utils';
import { Play, Pause, Square, Mic, MicOff } from 'lucide-react';
import { animate } from 'motion';
import { Label } from '@/components/ui/label';
import { forwardRef, useCallback } from 'react';
import { type HTMLAttributes } from 'react';

interface ControlButtonProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  children: React.ReactNode;
}

const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ onClick, disabled, variant = 'default', children, className, style, ...props }, ref) => {
    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      const target = e.currentTarget;
      await animate(target, { scale: 0.95 }, { duration: 0.1 });
      await animate(target, { scale: 1 }, { duration: 0.1 });
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        onClick={handleClick}
        disabled={disabled}
        style={{ ...style, transform: 'scale(1)' }}
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          'bg-gradient-to-br transition-all duration-200',
          'shadow-lg hover:shadow-xl',
          'backdrop-blur-md',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variant === 'default'
            ? 'from-slate-50/90 to-white/80 hover:from-white hover:to-slate-50/90 border-white/50'
            : 'from-red-100/90 to-red-200/80 hover:from-red-200/90 hover:to-red-300/80 border-red-300/50',
          'border shadow-white/10',
          className
        )}
        {...props}>
        {children}
      </button>
    );
  }
);
ControlButton.displayName = 'ControlButton';

export function AudioControls() {
  const { fileName, isPlaying, isMicActive, isAudioLoaded, loadFile, togglePlayPause, stop } =
    useAudioStore();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleMicToggle = useCallback(async () => {
    const { toggleMic } = useAudioStore.getState();

    if (isMicActive) {
      await toggleMic();
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('Microphone access is not supported on this browser/device.');
        return;
      }

      await toggleMic();
    } catch (error: any) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert(
          isMobile
            ? 'Please enable microphone access in your device settings.'
            : 'Please allow microphone access and try again.'
        );
      } else {
        alert('Unable to access microphone. Please check your device settings.');
        console.error('Microphone error:', error);
      }
    }
  }, [isMicActive]);

  return (
    <div className="fixed top-20 left-12 z-50 p-4 flex flex-col gap-4">
      <div
        onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.02 }, { duration: 0.2 })}
        onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}>
        <Label
          htmlFor="audio-file"
          className={cn(
            'w-[168px] px-4 py-3 rounded-xl', // Exact width to match buttons + gaps
            'bg-gradient-to-br from-slate-50/90 to-white/80',
            'hover:from-white hover:to-slate-50/90',
            'border border-white/50 shadow-lg shadow-white/10',
            'cursor-pointer text-sm flex items-center justify-center',
            'transition-all duration-200'
          )}>
          <span className="truncate font-medium text-slate-800 w-full text-center">{fileName}</span>
          <input
            id="audio-file"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </Label>
      </div>

      <div className="flex gap-3 justify-center">
        <div
          onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.05 }, { duration: 0.2 })}
          onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}>
          <ControlButton
            onClick={togglePlayPause}
            disabled={!isAudioLoaded}
            className="backdrop-blur-sm">
            {isPlaying ? (
              <Pause className="h-5 w-5 text-slate-800" />
            ) : (
              <Play className="h-5 w-5 text-slate-800" />
            )}
          </ControlButton>
        </div>

        <div
          onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.05 }, { duration: 0.2 })}
          onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}>
          <ControlButton onClick={stop} disabled={!isAudioLoaded} className="backdrop-blur-sm">
            <Square className="h-5 w-5 text-slate-800" />
          </ControlButton>
        </div>

        <div
          onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.05 }, { duration: 0.2 })}
          onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}>
          <ControlButton
            onClick={handleMicToggle}
            variant={isMicActive ? 'destructive' : 'default'}
            className="backdrop-blur-sm">
            {isMicActive ? (
              <MicOff className="h-5 w-5 text-red-700" />
            ) : (
              <Mic className="h-5 w-5 text-slate-800" />
            )}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
