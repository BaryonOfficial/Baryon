function stopMediaStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop?.();
  }
}

function createAudioConstraints(deviceId) {
  const baseConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (!deviceId) {
    return baseConstraints;
  }
  return {
    ...baseConstraints,
    deviceId: { exact: deviceId },
  };
}

/**
 * Opens the selected live input as a recorder-owned audio stream. This is not
 * arbitrary OS audio capture; loopback/system audio is included only when the
 * user selected a loopback audio input such as BlackHole or Loopback.
 *
 * @param {string | null | undefined} deviceId
 * @returns {Promise<{ stream: MediaStream, stop: () => void } | null>}
 */
export async function createLiveInputRecordingCaptureStream(deviceId) {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (typeof mediaDevices?.getUserMedia !== "function") {
    return null;
  }

  const stream = await mediaDevices.getUserMedia({
    audio: createAudioConstraints(deviceId),
    video: false,
  });
  if (stream.getAudioTracks().length === 0) {
    stopMediaStream(stream);
    return null;
  }

  return {
    stream,
    stop: () => stopMediaStream(stream),
  };
}
