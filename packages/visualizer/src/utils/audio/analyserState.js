import { computeRms, sampleAnalyser } from '../../core/audio/analyserSampler.js';

function toLegacyShape(snapshot) {
  if (!snapshot) return null;

  return {
    avgAmplitude: snapshot.avgAmplitude,
    freqData: snapshot.fftMagnitudes,
    timeData: snapshot.timeData,
    rms: snapshot.rms,
  };
}

function getAnalyserState(analyser) {
  return toLegacyShape(sampleAnalyser(analyser));
}

function getActiveAnalyserState(audioState) {
  if (audioState.audioInputMode === 'file') {
    return audioState.sound?.isPlaying ? getAnalyserState(audioState.analyser) : null;
  }
  if (audioState.audioInputMode === 'mic') {
    return audioState.gumStream?.active ? getAnalyserState(audioState.micAnalyser) : null;
  }
  return null;
}

export function getCombinedAnalyserState(audioState) {
  if (audioState?.readAnalysisSnapshot) {
    return toLegacyShape(audioState.readAnalysisSnapshot());
  }
  return getActiveAnalyserState(audioState);
}

export {
  computeRms,
  getActiveAnalyserState,
};
