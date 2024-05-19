export const toggleRecordingButton = document.getElementById('toggleRecording');
export const downloadRecordingButton = document.getElementById('downloadRecording');
export const recordedVideo = document.getElementById('recordedVideo');

export let isRecording = false; // Export if needed elsewhere
export let mediaRecorder;
let recordedChunks = [];

export function toggleRecording(canvas, audioCtx, gain) {
  if (!isRecording) {
    startRecording(canvas, audioCtx, gain);
  } else {
    stopRecording();
  }
}

function startRecording(canvas, audioCtx, gain) {
  const canvasStream = canvas.captureStream(60);
  const audioStreamDestination = audioCtx.createMediaStreamDestination();
  gain.connect(audioStreamDestination);
  const audioStream = audioStreamDestination.stream;
  const combinedStream = new MediaStream([...canvasStream.getTracks(), ...audioStream.getTracks()]);

  recordedChunks = [];
  if (MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E"')) {
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/mp4; codecs="avc1.42E01E"',
      videoBitsPerSecond: 50000000,
    });
  } else {
    mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm; codecs=vp9',
      videoBitsPerSecond: 50000000,
    });
  }
  mediaRecorder.addEventListener('dataavailable', handleDataAvailable);
  mediaRecorder.start();

  toggleRecordingButton.classList.add('recording');
  toggleRecordingButton.textContent = 'Stop Recording';
  isRecording = true;
  downloadRecordingButton.disabled = true;
}

function stopRecording() {
  mediaRecorder.stop();
  toggleRecordingButton.classList.remove('recording');
  toggleRecordingButton.textContent = 'Start Recording';
  isRecording = false;
  downloadRecordingButton.disabled = false;
}

function handleDataAvailable(event) {
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
  }
}

export function downloadRecording() {
  const recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(recordedBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.webm';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
