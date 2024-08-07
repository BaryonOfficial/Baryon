import React, { useState, useCallback } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

const ffmpeg = createFFmpeg({ log: true });

const ScreenRecorder = ({ canvasRef }) => {
  const [conversionProgress, setConversionProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [mp4Url, setMp4Url] = useState(null);

  const { status, startRecording, stopRecording, mediaBlobUrl, mediaBlob } = useReactMediaRecorder({
    screen: true,
    audio: true,
    video: { mediaSource: 'canvas', element: canvasRef.current },
    blobPropertyBag: { type: 'video/webm' },
  });

  const convertWebMtoMP4 = useCallback(async (webmBlob) => {
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    const inputName = 'input.webm';
    const outputName = 'output.mp4';

    ffmpeg.FS('writeFile', inputName, await fetchFile(webmBlob));

    ffmpeg.setProgress(({ ratio }) => {
      setConversionProgress(Math.round(ratio * 100));
    });

    await ffmpeg.run('-i', inputName, '-c:v', 'libx264', outputName);

    const data = ffmpeg.FS('readFile', outputName);
    const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Clean up
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', outputName);

    return mp4Blob;
  }, []);

  const handleConvert = useCallback(async () => {
    if (mediaBlob) {
      setIsConverting(true);
      setConversionProgress(0);
      try {
        const mp4Blob = await convertWebMtoMP4(mediaBlob);
        const url = URL.createObjectURL(mp4Blob);
        setMp4Url(url);
      } catch (error) {
        console.error('Conversion failed:', error);
      } finally {
        setIsConverting(false);
        setConversionProgress(0);
      }
    }
  }, [mediaBlob, convertWebMtoMP4]);

  const handleCancelConversion = useCallback(() => {
    if (ffmpeg.isLoaded()) {
      ffmpeg.exit();
    }
    setIsConverting(false);
    setConversionProgress(0);
  }, []);

  const isRecordingDisabled = status === 'recording' || isConverting;

  return (
    <div>
      <button
        onClick={status === 'recording' ? stopRecording : startRecording}
        disabled={isRecordingDisabled}>
        {status === 'recording' ? 'Stop Recording' : 'Start Recording'}
      </button>

      {mediaBlobUrl && !isConverting && (
        <>
          <video src={mediaBlobUrl} controls autoPlay loop />
          <button onClick={handleConvert}>Convert to MP4</button>
        </>
      )}

      {isConverting && (
        <div>
          <progress value={conversionProgress} max="100" />
          <span>{conversionProgress}%</span>
          <button onClick={handleCancelConversion}>Cancel Conversion</button>
        </div>
      )}

      {mp4Url && (
        <div>
          <video src={mp4Url} controls />
          <a href={mp4Url} download="recording.mp4">
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
};

export default ScreenRecorder;
