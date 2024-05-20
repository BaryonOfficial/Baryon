// Screen Recording Logic

import RecordRTC from 'recordrtc';

export const toggleRecordingButton = document.getElementById('toggleRecording');
export const recordedVideo = document.getElementById('recordedVideo');

let recorder;
let isRecording = false;

export function toggleRecording(canvas, audioCtx, gain) {
  if (!isRecording) {
    startRecording(canvas, audioCtx, gain);
  } else {
    stopRecording();
  }
}

async function startRecording(canvas, audioCtx, gain) {
  const canvasStream = canvas.captureStream(60);
  const audioStreamDestination = audioCtx.createMediaStreamDestination();
  gain.connect(audioStreamDestination);
  const audioStream = audioStreamDestination.stream;
  const combinedStream = new MediaStream([...canvasStream.getTracks(), ...audioStream.getTracks()]);

  recorder = new RecordRTC(combinedStream, {
    type: 'video',
    mimeType: 'video/webm;codecs=vp9', // RecordRTC will handle codec compatibility
    bitsPerSecond: 10000000,
    timeSlice: 1000,
  });

  recorder.setRecordingDuration(30000).onRecordingStopped(stopRecording);
  recorder.startRecording();

  toggleRecordingButton.classList.add('recording');
  toggleRecordingButton.textContent = 'Stop Recording';
  isRecording = true;
}

async function stopRecording() {
  recorder.stopRecording(() => {
    const recordedBlob = recorder.getBlob();
    invokeSaveAsDialog(recordedBlob); // This function will handle the download prompt
  });

  toggleRecordingButton.classList.remove('recording');
  toggleRecordingButton.textContent = 'Start Recording';
  isRecording = false;
}

function invokeSaveAsDialog(blob, filename = 'recording.webm') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
