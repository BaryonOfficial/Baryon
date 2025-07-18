import React from "react";

function AudioControls ({
  fileName,
  isPlaying,
  isMicActive,
  isAudioLoaded,
  showDeviceMenu,
  audioDevices,
  selectedDevice,
  handleFileChange,
  handlePlayPause,
  handleStop,
  handleMicToggle,
  setShowDeviceMenu,
  setSelectedDevice,
}){
  return (
          <div className="controls-container fixed top-20 left-12 z-50 p-4">
            <div className="flex flex-col items-start space-y-2">
              <div className="file-input flex flex-col items-start space-y-2">
                <label className="file-btn-standard max-w-[131.06px] truncate cursor-pointer">
                  <span className="truncate">{fileName}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <div className="playback-controls flex flex-row items-center space-x-2">
                <button
                  onClick={handlePlayPause}
                  className="btn-standard"
                  disabled={!isAudioLoaded}>
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button onClick={handleStop} className="btn-standard" disabled={!isAudioLoaded}>
                  Stop
                </button>
              </div>

              <div className="modes flex flex-row items-center space-x-0">
                <div className="relative">
                  <button
                    onClick={async () => {
                      if (!isMicActive) {
                        setShowDeviceMenu(!showDeviceMenu);
                      } else {
                        await handleMicToggle();
                      }
                    }}
                    className="btn-standard flex items-center gap-1">
                    {isMicActive ? 'Stop Input' : 'Select Input'}
                    {!isMicActive && (
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          showDeviceMenu ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </button>
                  {showDeviceMenu && audioDevices.length > 0 && (
                    <div className="absolute left-0 mt-1 w-48 bg-white rounded-md shadow-lg z-50">
                      <div className="py-1">
                        {audioDevices.map((device) => (
                          <button
                            key={device.deviceId}
                            onClick={async () => {
                              setSelectedDevice(device.deviceId);
                              setShowDeviceMenu(false);
                              await handleMicToggle();
                            }}
                            className={`block w-full text-left px-4 py-2 text-sm ${
                              selectedDevice === device.deviceId
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}>
                            {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {audioDevices.length === 0 && (
                <div className="text-sm text-gray-500 mt-1">
                  No audio input devices found. Make sure your device is connected and try clicking
                  &quot;Mic Mode&quot; first.
                </div>
              )}
            </div>
          </div>
  );
};

export default AudioControls;
