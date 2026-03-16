import React from "react";
import { MIC_PROFILE_OPTIONS } from "../utils/audioFeatures.js";

export function AudioControlsView({
  fileName,
  isPlaying,
  isMicActive,
  micStatusLabel,
  isAudioLoaded,
  showDeviceMenu,
  audioDevices,
  selectedDevice,
  selectedMicProfile,
  handleFileChange,
  handlePlayPause,
  handleStop,
  handleMicToggle,
  handleMicProfileChange,
  setShowDeviceMenu,
  setSelectedDevice,
}) {
  void micStatusLabel;

  const selectedMicProfileOption =
    MIC_PROFILE_OPTIONS.find(
      (profile) => profile.value === selectedMicProfile,
    ) ?? MIC_PROFILE_OPTIONS[0];

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
                if (!isMicActive) {
                  setShowDeviceMenu(!showDeviceMenu);
                } else {
                  await handleMicToggle();
                }
              }}
              className="baryon-audio-controls__button baryon-audio-controls__select-button"
            >
              {isMicActive ? "Stop Input" : "Select Input"}
              {!isMicActive && (
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
            <div className="baryon-audio-controls__profile-select-wrap">
              <select
                className="baryon-audio-controls__profile-select"
                data-testid="mic-profile-select"
                value={selectedMicProfile}
                aria-label="Mic input profile"
                title={
                  selectedMicProfileOption
                    ? `Mic input profile: ${selectedMicProfileOption.label}. ${selectedMicProfileOption.description}`
                    : "Mic input profile"
                }
                onFocus={() => {
                  setShowDeviceMenu(false);
                }}
                onChange={(event) => {
                  setShowDeviceMenu(false);
                  handleMicProfileChange?.(event.target.value);
                }}
              >
                {MIC_PROFILE_OPTIONS.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
            {showDeviceMenu && audioDevices.length > 0 && (
              <div className="baryon-audio-controls__menu">
                <div>
                  {audioDevices.map((device) => (
                    <button
                      key={device.deviceId}
                      onClick={async () => {
                        setSelectedDevice(device.deviceId);
                        setShowDeviceMenu(false);
                        await handleMicToggle();
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
