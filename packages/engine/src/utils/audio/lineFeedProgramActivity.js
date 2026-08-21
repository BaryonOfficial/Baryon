import { clamp01, smoothstep } from "../math.js";
import { computeEmaAlpha } from "./analysisTiming.js";

/**
 * Line-feed upstream program activity: separates virtual-device meter floor
 * (BlackHole idle) from fresh program excitation (Apple Music / OS mix bus).
 */

const LINE_FEED_PROGRAM_FLOOR_SMOOTHING_MS = 2400;
const LINE_FEED_PROGRAM_EXCITATION_OPEN = 0.28;
const LINE_FEED_PROGRAM_EXCITATION_HOLD = 0.08;
const LINE_FEED_PROGRAM_BRIDGE_HOLD_MS = 1180;
const LINE_FEED_PROGRAM_PAUSE_CLOSE_MS = 240;
const LINE_FEED_PROGRAM_METER_IDLE_MIN_AVG = 1.05;
const LINE_FEED_PROGRAM_METER_IDLE_MAX_AVG = 1.35;
const LINE_FEED_PROGRAM_METER_IDLE_MAX_RMS = 0.028;
const LINE_FEED_PROGRAM_BRIDGE_MAX_AVG = 0.08;
const LINE_FEED_PROGRAM_FLOOR_UPDATE_MAX_EXCITATION = 0.14;
const LINE_FEED_PROGRAM_MIN_FLOOR_RMS = 0.0008;
const LINE_FEED_PROGRAM_EXCESS_RMS_SCALE = 0.14;
const LINE_FEED_PROGRAM_TIME_DOMAIN_SIGNAL_PEAK = 1e-5;

/**
 * @param {any} bandState
 * @param {string} [analysisSessionKey]
 */
export function resetLineFeedProgramActivityState(
  bandState,
  analysisSessionKey = "",
) {
  bandState.lineFeedProgramSessionKey = analysisSessionKey;
  bandState.lineFeedProgramActive = false;
  bandState.lineFeedProgramExcitation = 0;
  bandState.lineFeedProgramQuietHoldMs = 0;
  bandState.lineFeedProgramPauseIdleHoldMs = 0;
  bandState.lineFeedProgramPreviousFrameAtMs = 0;
  bandState.lineFeedDeviceFloorRms = 0;
}

/**
 * @param {{
 *   avgAmplitude?: number,
 *   rms?: number,
 *   credibleSpectralPeakCount?: number,
 *   transportSpectrumSilent?: boolean,
 *   timeDomainPeakAmplitude?: number,
 * }} metrics
 * @param {{
 *   deviceFloorRms?: number,
 * }} floors
 */
export function deriveLineFeedProgramExcitation(metrics, floors) {
  const rms = metrics?.rms ?? 0;
  const floorRms = Math.max(
    LINE_FEED_PROGRAM_MIN_FLOOR_RMS,
    floors?.deviceFloorRms ?? 0,
  );

  const excessRms = Math.max(0, rms - floorRms * 0.85);

  const rmsDrive = smoothstep(0, LINE_FEED_PROGRAM_EXCESS_RMS_SCALE, excessRms);
  const coherentSpectrumDrive =
    (metrics?.credibleSpectralPeakCount ?? 0) > 0 ? 1 : 0;
  return clamp01(Math.max(rmsDrive, coherentSpectrumDrive));
}

export function isLineFeedMeterIdlePauseSignature(metrics) {
  const avg = metrics?.avgAmplitude ?? 0;
  const rms = metrics?.rms ?? 0;

  const transportSilent = metrics?.transportSpectrumSilent === true;
  const timeDomainSilent =
    (metrics?.timeDomainPeakAmplitude ?? 0) <=
    LINE_FEED_PROGRAM_TIME_DOMAIN_SIGNAL_PEAK;

  return (
    avg >= LINE_FEED_PROGRAM_METER_IDLE_MIN_AVG &&
    avg <= LINE_FEED_PROGRAM_METER_IDLE_MAX_AVG &&
    rms <= LINE_FEED_PROGRAM_METER_IDLE_MAX_RMS &&
    transportSilent &&
    timeDomainSilent
  );
}

function hasLineFeedTimeDomainSignalEvidence(metrics) {
  return (
    (metrics?.timeDomainPeakAmplitude ?? 0) >
    LINE_FEED_PROGRAM_TIME_DOMAIN_SIGNAL_PEAK
  );
}

function updateLineFeedDeviceFloor(
  bandState,
  metrics,
  deltaMs,
  programExcitation,
  programActive,
) {
  const rms = metrics?.rms ?? 0;

  // An active program is signal, not a measurement of the device floor.
  // In particular, the first frame after a reset must not seed the floor from
  // a loud strike and suppress the quieter sustain that follows it.
  if (programExcitation > LINE_FEED_PROGRAM_FLOOR_UPDATE_MAX_EXCITATION) {
    return;
  }

  if (!(bandState.lineFeedDeviceFloorRms > 0)) {
    bandState.lineFeedDeviceFloorRms = rms;
    return;
  }

  const inIdleMeterBand =
    metrics?.transportSpectrumSilent === true &&
    rms <= LINE_FEED_PROGRAM_METER_IDLE_MAX_RMS;

  if (inIdleMeterBand && bandState.lineFeedDeviceFloorRms > rms) {
    bandState.lineFeedDeviceFloorRms = rms;
    return;
  }

  const pauseSignature = isLineFeedMeterIdlePauseSignature(metrics);
  if (programActive && !pauseSignature && !inIdleMeterBand) {
    return;
  }

  const alpha = computeEmaAlpha(
    deltaMs,
    inIdleMeterBand ? 720 : LINE_FEED_PROGRAM_FLOOR_SMOOTHING_MS,
  );

  bandState.lineFeedDeviceFloorRms +=
    (rms - bandState.lineFeedDeviceFloorRms) * alpha;
}

/**
 * @param {{
 *   bandState: any,
 *   metrics: {
 *     avgAmplitude?: number,
 *     rms?: number,
 *     credibleSpectralPeakCount?: number,
 *     transportSpectrumSilent?: boolean,
 *     timeDomainPeakAmplitude?: number,
 *   },
 *   deltaMs?: number,
 *   currentFrameAtMs?: number,
 *   enabled?: boolean,
 *   analysisSessionKey?: string,
 * }} params
 */
export function resolveLineFeedProgramActivity({
  bandState,
  metrics,
  deltaMs = 33,
  currentFrameAtMs = 0,
  enabled = true,
  analysisSessionKey = "",
}) {
  if (!enabled) {
    return {
      programActive: true,
      programExcitation: 1,
      deviceFloorRms: 0,
    };
  }

  if (bandState.lineFeedProgramSessionKey !== analysisSessionKey) {
    resetLineFeedProgramActivityState(bandState, analysisSessionKey);
  }

  const programExcitation = deriveLineFeedProgramExcitation(metrics, {
    deviceFloorRms: bandState.lineFeedDeviceFloorRms,
  });

  let programActive = bandState.lineFeedProgramActive === true;
  let quietHoldMs = bandState.lineFeedProgramQuietHoldMs ?? 0;
  let pauseIdleHoldMs = bandState.lineFeedProgramPauseIdleHoldMs ?? 0;

  if (programExcitation >= LINE_FEED_PROGRAM_EXCITATION_OPEN) {
    programActive = true;
    quietHoldMs = 0;
    pauseIdleHoldMs = 0;
  } else if (programActive) {
    if (programExcitation >= LINE_FEED_PROGRAM_EXCITATION_HOLD) {
      quietHoldMs = 0;
      pauseIdleHoldMs = 0;
    } else if (isLineFeedMeterIdlePauseSignature(metrics)) {
      quietHoldMs = 0;
      if (metrics?.transportSpectrumSilent === true) {
        pauseIdleHoldMs = LINE_FEED_PROGRAM_PAUSE_CLOSE_MS;
        programActive = false;
      } else {
        pauseIdleHoldMs = Math.min(
          LINE_FEED_PROGRAM_PAUSE_CLOSE_MS,
          pauseIdleHoldMs + Math.max(0, deltaMs),
        );
        programActive = pauseIdleHoldMs < LINE_FEED_PROGRAM_PAUSE_CLOSE_MS;
      }
    } else if (
      (metrics?.avgAmplitude ?? 0) <= LINE_FEED_PROGRAM_BRIDGE_MAX_AVG
    ) {
      pauseIdleHoldMs = 0;
      quietHoldMs = Math.min(
        LINE_FEED_PROGRAM_BRIDGE_HOLD_MS,
        quietHoldMs + Math.max(0, deltaMs),
      );
      programActive = quietHoldMs < LINE_FEED_PROGRAM_BRIDGE_HOLD_MS;
    } else if (
      metrics?.transportSpectrumSilent === true &&
      !hasLineFeedTimeDomainSignalEvidence(metrics)
    ) {
      quietHoldMs = 0;
      pauseIdleHoldMs = LINE_FEED_PROGRAM_PAUSE_CLOSE_MS;
      programActive = false;
    } else {
      quietHoldMs = 0;
      pauseIdleHoldMs = 0;
    }
  }

  updateLineFeedDeviceFloor(
    bandState,
    metrics,
    deltaMs,
    programExcitation,
    programActive,
  );

  bandState.lineFeedProgramActive = programActive;
  bandState.lineFeedProgramExcitation = programExcitation;
  bandState.lineFeedProgramQuietHoldMs = quietHoldMs;
  bandState.lineFeedProgramPauseIdleHoldMs = pauseIdleHoldMs;
  if (Number.isFinite(currentFrameAtMs) && currentFrameAtMs > 0) {
    bandState.lineFeedProgramPreviousFrameAtMs = currentFrameAtMs;
  }

  return {
    programActive,
    programExcitation,
    deviceFloorRms: bandState.lineFeedDeviceFloorRms,
    quietHoldMs,
  };
}
