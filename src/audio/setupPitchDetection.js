// src/audio/setupPitchDetection.js
// Utility to set up pitch detection with device selection and callback for results

export async function listAudioInputDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "audioinput");
}

export async function setupPitchDetection({
  onPitchData,
  deviceId = null,
  workletUrl = "/src/audio/PitchDetectProcessor.js",
  fftSize = 1024,
} = {}) {
  try {
    // 1. Create AudioContext
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // 2. Add the AudioWorklet
    await audioCtx.audioWorklet.addModule(workletUrl);

    // 3. Get user media with selected device
    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // 4. Create MediaStreamSource
    const source = audioCtx.createMediaStreamSource(stream);

    // 5. Create the AudioWorkletNode with options
    const workletNode = new AudioWorkletNode(audioCtx, "pitch-detect-processor", {
      processorOptions: {
        sampleRate: audioCtx.sampleRate,
        fftSize,
      },
    });

    // 6. Connect nodes
    source.connect(workletNode);
    // Optionally connect to destination for monitoring
    // workletNode.connect(audioCtx.destination);

    // 7. Listen for pitch data
    workletNode.port.onmessage = (event) => {
      if (onPitchData) {
        onPitchData(event.data); // { pitches, amplitudes }
      }
    };

    return {
      audioCtx,
      workletNode,
      source,
      stream,
      setDevice: async (newDeviceId) => {
        // Stop old stream
        stream.getTracks().forEach((track) => track.stop());
        // Re-setup with new device
        return setupPitchDetection({ onPitchData, deviceId: newDeviceId, workletUrl, fftSize });
      },
    };
  } catch (error) {
    console.error("Error setting up pitch detection:", error);
    throw error;
  }
}
