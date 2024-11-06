import { useState, useCallback } from 'react';
import { useControls } from 'leva';
import { 
  playPauseAudio, 
  stopAudio, 
  startMicRecordStream, 
  stopMicRecordStream,
  getIsAudioLoaded 
} from '@/audio/audioSetup';

export default function Controls() {
  const [isMicActive, setIsMicActive] = useState(false);
  
  const handlePlayPause = useCallback(async () => {
    if (!getIsAudioLoaded()) {
      console.log('Audio not loaded yet');
      return;
    }
    try {
      const isPlaying = await playPauseAudio();
      console.log('Audio playing:', isPlaying);
    } catch (error) {
      console.error('Error playing/pausing audio:', error);
    }
  }, []);

  const handleStop = useCallback(() => {
    stopAudio();
  }, []);

  const handleMicToggle = useCallback(async () => {
    if (!isMicActive) {
      try {
        await startMicRecordStream();
        setIsMicActive(true);
      } catch (error) {
        console.error('Error starting mic:', error);
      }
    } else {
      stopMicRecordStream();
      setIsMicActive(false);
    }
  }, [isMicActive]);


  return (
    <div className="fixed top-20 left-12 z-50 p-4 bg-black/50 rounded-lg backdrop-blur-sm">
      <div className="controls-container flex flex-col gap-4">
        <div className="audio-controls flex gap-2">
          <button 
            onClick={handlePlayPause}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-md text-white"
          >
            {getIsAudioLoaded() ? 'Play/Pause' : 'Loading...'}
          </button>
          
          <button 
            onClick={handleStop}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-md text-white"
            disabled={!getIsAudioLoaded()}
          >
            Stop
          </button>
          
          <button 
            onClick={handleMicToggle}
            className={`px-4 py-2 rounded-md text-white ${
              isMicActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {isMicActive ? 'Stop Mic' : 'Start Mic'}
          </button>
        </div>
      </div>
    </div>
  );
}
