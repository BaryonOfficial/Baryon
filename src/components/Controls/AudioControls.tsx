import { useAudioStore } from '@/store/audioStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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

  return (
    <div className="fixed top-20 left-12 z-50 p-4 flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 w-full">
        <Label
          htmlFor="audio-file"
          className={cn(
            'w-full px-4 py-2 rounded-md border border-input bg-background',
            'hover:bg-accent hover:text-accent-foreground',
            'cursor-pointer truncate text-sm flex items-center justify-center'
          )}>
          <span className="truncate">{fileName}</span>
          <input
            id="audio-file"
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </Label>
      </div>

      <div className="flex gap-2 w-full">
        <Button
          variant="outline"
          size="sm"
          disabled={!isAudioLoaded}
          onClick={togglePlayPause}
          className="flex-1">
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!isAudioLoaded}
          onClick={stop}
          className="flex-1">
          Stop
        </Button>
      </div>

      <Button
        variant={isMicActive ? 'destructive' : 'outline'}
        size="sm"
        onClick={toggleMic}
        className="w-full">
        {isMicActive ? 'Stop Mic' : 'Mic Mode'}
      </Button>
    </div>
  );
}
