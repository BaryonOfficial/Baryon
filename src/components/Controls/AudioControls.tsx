import { useAudioStore } from '@/store/audioStore';
import { cn } from '@/lib/utils';
import { Play, Pause, Square, Mic, MicOff } from 'lucide-react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Label } from '@/components/ui/label';
import { forwardRef } from 'react';

interface ControlButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  children: React.ReactNode;
}

// Create a proper forwardRef component for the button
const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  ({ onClick, disabled, variant = 'default', children, className, style, ...props }, ref) => {
    const buttonStyle = {
      ...style,
    };

    return (
      <motion.button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        style={buttonStyle}
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          'bg-gradient-to-br transition-all duration-200',
          'shadow-lg hover:shadow-xl active:scale-95',
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
      </motion.button>
    );
  }
);
ControlButton.displayName = 'ControlButton';

// No need for additional motion wrapper since we're using motion.button
const MotionButton = ControlButton;

export function AudioControls() {
  const {
    fileName,
    isPlaying,
    isMicActive,
    isAudioLoaded,
    loadFile,
    togglePlayPause,
    stop,
    toggleMic,
  } = useAudioStore();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
  };

  const buttonVariants = {
    tap: { scale: 0.95 },
    hover: {
      scale: 1.05,
      transition: { duration: 0.2 },
    },
  };

  return (
    <div className="fixed top-20 left-12 z-50 p-4 flex flex-col gap-4">
      {/* File Upload Button - Width matches exactly 3 buttons + 2 gaps (168px) */}
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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
      </motion.div>

      {/* Control Buttons */}
      <div className="flex gap-3 justify-center">
        <motion.div whileHover="hover" whileTap="tap" variants={buttonVariants}>
          <MotionButton
            onClick={togglePlayPause}
            disabled={!isAudioLoaded}
            className="backdrop-blur-sm">
            {isPlaying ? (
              <Pause className="h-5 w-5 text-slate-800" />
            ) : (
              <Play className="h-5 w-5 text-slate-800" />
            )}
          </MotionButton>
        </motion.div>

        <motion.div whileHover="hover" whileTap="tap" variants={buttonVariants}>
          <MotionButton onClick={stop} disabled={!isAudioLoaded} className="backdrop-blur-sm">
            <Square className="h-5 w-5 text-slate-800" />
          </MotionButton>
        </motion.div>

        <motion.div whileHover="hover" whileTap="tap" variants={buttonVariants}>
          <MotionButton
            onClick={toggleMic}
            variant={isMicActive ? 'destructive' : 'default'}
            className="backdrop-blur-sm">
            {isMicActive ? (
              <MicOff className="h-5 w-5 text-red-700" />
            ) : (
              <Mic className="h-5 w-5 text-slate-800" />
            )}
          </MotionButton>
        </motion.div>
      </div>
    </div>
  );
}
