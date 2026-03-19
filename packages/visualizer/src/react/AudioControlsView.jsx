import React from "react";

export function AudioControlsView({
  fileName,
  isPlaying,
  isLiveInputActive,
  micStatusLabel,
  isAudioLoaded,
  showDeviceMenu,
  audioDevices,
  selectedDevice,
  handleFileChange,
  handlePlayPause,
  handleStop,
  handleLiveInputToggle,
  setShowDeviceMenu,
  setSelectedDevice,
}) {
  void micStatusLabel;

  return (
    <div className="baryon-audio-controls">
      <div className="baryon-audio-controls__stack">
        <div className="baryon-audio-controls__stack">
          <label className="baryon-audio-controls__file-label">
            <span className="baryon-audio-controls__file-name">{fileName}</span>
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={handleFileChange}
            />
          </label>
        </div>

        <div className="baryon-audio-controls__row">
          <button
            onClick={handlePlayPause}
            className="baryon-audio-controls__button"
            disabled={!isAudioLoaded}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={handleStop}
            className="baryon-audio-controls__button"
            disabled={!isAudioLoaded}
          >
            Stop
          </button>
        </div>

        <div className="baryon-audio-controls__row">
          <div className="baryon-audio-controls__menu-anchor">
            <button
              onClick={async () => {
                if (!isLiveInputActive) {
                  setShowDeviceMenu(!showDeviceMenu);
                } else {
                  await handleLiveInputToggle();
                }
              }}
              className="baryon-audio-controls__button baryon-audio-controls__select-button"
            >
              {isLiveInputActive ? "Stop Input" : "Select Input"}
              {!isLiveInputActive && (
                <svg
                  className={`baryon-audio-controls__chevron${
                    showDeviceMenu
                      ? " baryon-audio-controls__chevron--open"
                      : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
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
              <div className="baryon-audio-controls__menu">
                <div>
                  {audioDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={async () => {
                        setSelectedDevice(device.deviceId);
                        setShowDeviceMenu(false);
                        await handleLiveInputToggle();
                      }}
                      className={`baryon-audio-controls__menu-item${
                        selectedDevice === device.deviceId
                          ? " baryon-audio-controls__menu-item--selected"
                          : ""
                      }`}
                    >
                      {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {audioDevices.length === 0 && (
          <div className="baryon-audio-controls__helper-text">
            No audio input devices found. Make sure your device is connected and
            try clicking &quot;Select Input&quot; first.
          </div>
        )}
      </div>
    </div>
  );
}
