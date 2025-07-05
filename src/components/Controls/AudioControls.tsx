import { useAudioStore } from '@/store/audioStore';
import { cn } from '@/lib/utils';
import { Play, Pause, Square, StopCircle, ChevronDown } from 'lucide-react';
import { animate } from 'motion';
import { Label } from '@/components/ui/label';
import { forwardRef, useEffect, useState } from 'react';
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
        {...props}
      >
        {children}
      </button>
    );
  }
);
ControlButton.displayName = 'ControlButton';

export function AudioControls() {
  const {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    loadFile,
    togglePlayPause,
    stop,
    availableInputDevices,
    selectedInputDeviceId,
    fetchAvailableInputDevices,
    setSelectedInputDeviceId,
    toggleInputDevice,
  } = useAudioStore();

  useEffect(() => {
    fetchAvailableInputDevices();
  }, [fetchAvailableInputDevices]);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDeviceSelect = async (deviceId: string) => {
    setSelectedInputDeviceId(deviceId);
    setDropdownOpen(false);
    if (isMicActive) {
      await toggleInputDevice(); // Stop current
    }
    await toggleInputDevice(); // Start new
  };

  const handleStopInput = async () => {
    if (isMicActive) {
      await toggleInputDevice();
    }
  };

  return (
    <div className="fixed top-20 left-12 z-50 p-4 flex flex-col gap-4">
      <div
        onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.02 }, { duration: 0.2 })}
        onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}
      >
        <Label
          htmlFor="audio-file"
          className={cn(
            'w-[168px] px-4 py-3 rounded-xl',
            'bg-gradient-to-br from-slate-50/90 to-white/80',
            'hover:from-white hover:to-slate-50/90',
            'border border-white/50 shadow-lg shadow-white/10',
            'cursor-pointer text-sm flex items-center justify-center',
            'transition-all duration-200'
          )}
        >
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

      <div className="relative">
        {!isMicActive ? (
          <button
            onClick={() => setDropdownOpen((open) => !open)}
            className={cn(
              'w-[168px] px-4 py-3 rounded-xl',
              'bg-gradient-to-br from-slate-50/90 to-white/80',
              'hover:from-white hover:to-slate-50/90',
              'border border-white/50 shadow-lg shadow-white/10',
              'cursor-pointer text-sm flex items-center justify-center',
              'transition-all duration-200',
              'font-medium text-slate-800 gap-2'
            )}
            style={{ marginTop: 0 }}
          >
            <span>Select Input</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
        ) : (
          <button
            onClick={handleStopInput}
            className={cn(
              'w-[168px] px-4 py-3 rounded-xl',
              'bg-gradient-to-br from-red-100/90 to-red-200/80',
              'hover:from-red-200/90 hover:to-red-300/80',
              'border border-red-300/50 shadow-lg shadow-white/10',
              'cursor-pointer text-sm flex items-center justify-center',
              'transition-all duration-200',
              'font-medium text-red-700 gap-2'
            )}
            style={{ marginTop: 0 }}
          >
            <StopCircle className="h-5 w-5 text-red-700" />
            <span>Stop Input</span>
          </button>
        )}
        {!isMicActive && dropdownOpen && (
          <div className="absolute left-0 mt-2 w-[168px] bg-white rounded-xl shadow-lg z-50 border border-slate-200">
            <div className="p-2">
              <div className="font-semibold text-xs text-slate-500 mb-2">
                Select Audio Input Device
              </div>
              {availableInputDevices.length === 0 && (
                <div className="text-xs text-slate-400">No input devices found</div>
              )}
              {availableInputDevices.map((device) => (
                <button
                  key={device.deviceId}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded hover:bg-slate-100',
                    device.deviceId === selectedInputDeviceId && 'bg-slate-200 font-bold'
                  )}
                  onClick={() => handleDeviceSelect(device.deviceId)}
                >
                  {device.label || `Input Device (${device.deviceId.slice(-4)})`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-row gap-3">
        <div
          onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.05 }, { duration: 0.2 })}
          onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}
        >
          <ControlButton
            onClick={togglePlayPause}
            disabled={!isAudioLoaded}
            className="backdrop-blur-sm"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-slate-800" />
            ) : (
              <Play className="h-5 w-5 text-slate-800" />
            )}
          </ControlButton>
        </div>

        <div
          onMouseEnter={(e) => animate(e.currentTarget, { scale: 1.05 }, { duration: 0.2 })}
          onMouseLeave={(e) => animate(e.currentTarget, { scale: 1 }, { duration: 0.2 })}
        >
          <ControlButton onClick={stop} disabled={!isAudioLoaded} className="backdrop-blur-sm">
            <Square className="h-5 w-5 text-slate-800" />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
