import { computeEmaAlpha } from "./analysisTiming.js";
import { clamp01 } from "../math.js";

export const BEAT_HISTORY_SIZE = 8;

const ONSET_DENSITY_WINDOW_MS = 4000;
const ONSET_DENSITY_MAX_BEATS = BEAT_HISTORY_SIZE;
const ONSET_DENSITY_SMOOTHING_MS = 8000;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const MIN_INTER_BEAT_INTERVAL_MS = 60000 / MAX_TEMPO_BPM;
const MAX_INTER_BEAT_INTERVAL_MS = 60000 / MIN_TEMPO_BPM;
const TEMPO_EMA_FAST = 0.35;
const TEMPO_EMA_SLOW = 0.1;

export function resetTempoTrackingTransientState(bandState) {
  bandState.previousBeatAtMs = Number.NEGATIVE_INFINITY;
  bandState.onsetDensityEma = 0;
}

export function recordBeatForTempoTracking(bandState, currentFrameAtMs) {
  bandState.previousBeatAtMs = currentFrameAtMs;
  const index = bandState.beatTimestampWriteIdx % BEAT_HISTORY_SIZE;
  bandState.beatTimestamps[index] = currentFrameAtMs;
  bandState.beatTimestampWriteIdx += 1;
  bandState.beatTimestampCount = Math.min(
    bandState.beatTimestampCount + 1,
    BEAT_HISTORY_SIZE,
  );
}

function updateTempoEstimate(bandState, beatConfidence, currentFrameAtMs) {
  if (bandState.beatTimestampCount >= 2) {
    const intervals = [];
    const count = Math.min(bandState.beatTimestampCount, BEAT_HISTORY_SIZE);
    for (let index = 1; index < count; index += 1) {
      const writeIndex = bandState.beatTimestampWriteIdx;
      const previousTimestamp =
        bandState.beatTimestamps[
          (writeIndex - index - 1 + BEAT_HISTORY_SIZE) % BEAT_HISTORY_SIZE
        ];
      const currentTimestamp =
        bandState.beatTimestamps[
          (writeIndex - index + BEAT_HISTORY_SIZE) % BEAT_HISTORY_SIZE
        ];
      const interval = currentTimestamp - previousTimestamp;
      if (
        interval >= MIN_INTER_BEAT_INTERVAL_MS &&
        interval <= MAX_INTER_BEAT_INTERVAL_MS
      ) {
        intervals.push(interval);
      }
    }

    if (intervals.length > 0) {
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];
      const estimatedTempo = 60000 / medianInterval;
      const alpha =
        TEMPO_EMA_SLOW +
        (TEMPO_EMA_FAST - TEMPO_EMA_SLOW) * clamp01(beatConfidence);
      bandState.tempoEma =
        bandState.tempoEma === 0
          ? estimatedTempo
          : bandState.tempoEma + (estimatedTempo - bandState.tempoEma) * alpha;
      bandState.estimatedTempo = bandState.tempoEma;
      bandState.tempoConfidence = clamp01(
        intervals.length / (BEAT_HISTORY_SIZE - 1),
      );
    }
  }

  if (
    bandState.estimatedTempo > 0 &&
    Number.isFinite(bandState.previousBeatAtMs)
  ) {
    const elapsedMs = Math.max(
      0,
      currentFrameAtMs - bandState.previousBeatAtMs,
    );
    const periodMs = 60000 / bandState.estimatedTempo;
    bandState.beatPhase = clamp01(elapsedMs / periodMs);
  }

  return {
    estimatedTempo: bandState.estimatedTempo,
    tempoConfidence: bandState.tempoConfidence,
    beatPhase: bandState.beatPhase,
  };
}

function updateRhythmicDensity(bandState, deltaMs, currentFrameAtMs) {
  const count = Math.min(bandState.beatTimestampCount, BEAT_HISTORY_SIZE);
  let beatsInWindow = 0;
  const windowStart = currentFrameAtMs - ONSET_DENSITY_WINDOW_MS;
  for (let index = 0; index < count; index += 1) {
    const timestampIndex =
      (bandState.beatTimestampWriteIdx - 1 - index + BEAT_HISTORY_SIZE) %
      BEAT_HISTORY_SIZE;
    if (bandState.beatTimestamps[timestampIndex] >= windowStart) {
      beatsInWindow += 1;
    }
  }

  const rawDensity = beatsInWindow / ONSET_DENSITY_MAX_BEATS;
  const alpha = computeEmaAlpha(deltaMs, ONSET_DENSITY_SMOOTHING_MS);
  bandState.onsetDensityEma += (rawDensity - bandState.onsetDensityEma) * alpha;
  return clamp01(bandState.onsetDensityEma);
}

export function updateAudioFeatureTempoState({
  bandState,
  beatConfidence,
  currentFrameAtMs,
  deltaMs,
}) {
  return {
    ...updateTempoEstimate(bandState, beatConfidence, currentFrameAtMs),
    rhythmicDensity: updateRhythmicDensity(
      bandState,
      deltaMs,
      currentFrameAtMs,
    ),
  };
}
