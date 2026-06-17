import { clamp01, smoothstep } from "../math.js";

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
export const LINE_FEED_PROGRAM_BRIDGE_MAX_AVG = 0.08;
const LINE_FEED_PROGRAM_FLOOR_UPDATE_MAX_EXCITATION = 0.14;
const LINE_FEED_PROGRAM_MIN_FLOOR_AVG = 0.08;
const LINE_FEED_PROGRAM_MIN_FLOOR_RMS = 0.0008;
const LINE_FEED_PROGRAM_EXCESS_AVG_SCALE = 18;
const LINE_FEED_PROGRAM_EXCESS_RMS_SCALE = 0.14;
const LINE_FEED_PROGRAM_PEAK_SCALE = 0.22;
const LINE_FEED_PROGRAM_TIME_DOMAIN_SIGNAL_PEAK = 1e-5;

function computeEmaAlpha(deltaMs, smoothingMs) {
  if (!(deltaMs > 0) || !(smoothingMs > 0)) {
    return 1;
  }

  return 1 - Math.exp(-deltaMs / smoothingMs);
}

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
  bandState.lineFeedDeviceFloorAvg = 0;
  bandState.lineFeedDeviceFloorRms = 0;
  bandState.lineFeedDeviceFloorPeak = 0;
}

/**
 * @param {{
 *   avgAmplitude?: number,
 *   rms?: number,
 *   peakAmplitude?: number,
 *   transportSpectrumSilent?: boolean,
 *   timeDomainPeakAmplitude?: number,
 * }} metrics
 * @param {{
 *   deviceFloorAvg?: number,
 *   deviceFloorRms?: number,
 *   deviceFloorPeak?: number,
 * }} floors
 */
export function deriveLineFeedProgramExcitation(metrics, floors) {
  const avg = metrics?.avgAmplitude ?? 0;
  const rms = metrics?.rms ?? 0;
  const peak = metrics?.peakAmplitude ?? 0;
  const floorAvg = Math.max(
    LINE_FEED_PROGRAM_MIN_FLOOR_AVG,
    floors?.deviceFloorAvg ?? 0,
  );
  const floorRms = Math.max(
    LINE_FEED_PROGRAM_MIN_FLOOR_RMS,
    floors?.deviceFloorRms ?? 0,
  );
  const floorPeak = floors?.deviceFloorPeak ?? 0;

  const excessAvg = Math.max(0, avg - floorAvg * 0.92);
  const excessRms = Math.max(0, rms - floorRms * 0.85);
  const excessPeak = Math.max(0, peak - floorPeak * 0.9);

  const avgDrive = smoothstep(0, LINE_FEED_PROGRAM_EXCESS_AVG_SCALE, excessAvg);
  const rmsDrive = smoothstep(0, LINE_FEED_PROGRAM_EXCESS_RMS_SCALE, excessRms);
  const peakDrive = smoothstep(0, LINE_FEED_PROGRAM_PEAK_SCALE, excessPeak);
  const coupledDrive = Math.max(avgDrive, rmsDrive);

  return clamp01(
    Math.max(coupledDrive, peakDrive * smoothstep(0.06, 0.22, coupledDrive)),
  );
}

export function isLineFeedMeterIdlePauseSignature(metrics, floors = {}) {
  const avg = metrics?.avgAmplitude ?? 0;
  const rms = metrics?.rms ?? 0;
  const floorAvg = Math.max(
    LINE_FEED_PROGRAM_MIN_FLOOR_AVG,
    floors?.deviceFloorAvg ?? 0,
  );

  const peak = metrics?.peakAmplitude ?? 0;
  const transportSilent =
    metrics?.transportSpectrumSilent === true || peak <= 0.004;
  const timeDomainSilent =
    (metrics?.timeDomainPeakAmplitude ?? 0) <=
    LINE_FEED_PROGRAM_TIME_DOMAIN_SIGNAL_PEAK;

  return (
    avg >= LINE_FEED_PROGRAM_METER_IDLE_MIN_AVG &&
    avg <= LINE_FEED_PROGRAM_METER_IDLE_MAX_AVG &&
    rms <= LINE_FEED_PROGRAM_METER_IDLE_MAX_RMS &&
    Math.abs(avg - floorAvg) <= 0.22 &&
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
  const avg = metrics?.avgAmplitude ?? 0;
  const rms = metrics?.rms ?? 0;
  const peak = metrics?.peakAmplitude ?? 0;

  if (
    !(bandState.lineFeedDeviceFloorAvg > 0) &&
    !(bandState.lineFeedDeviceFloorRms > 0)
  ) {
    bandState.lineFeedDeviceFloorAvg = avg;
    bandState.lineFeedDeviceFloorRms = rms;
    bandState.lineFeedDeviceFloorPeak = peak;
    return;
  }

  const inIdleMeterBand =
    avg >= LINE_FEED_PROGRAM_METER_IDLE_MIN_AVG &&
    avg <= LINE_FEED_PROGRAM_METER_IDLE_MAX_AVG &&
    (metrics?.rms ?? 0) <= LINE_FEED_PROGRAM_METER_IDLE_MAX_RMS;

  if (
    inIdleMeterBand &&
    metrics?.transportSpectrumSilent === true &&
    bandState.lineFeedDeviceFloorAvg > LINE_FEED_PROGRAM_METER_IDLE_MAX_AVG
  ) {
    bandState.lineFeedDeviceFloorAvg = avg;
    bandState.lineFeedDeviceFloorRms = rms;
    bandState.lineFeedDeviceFloorPeak = peak;
    return;
  }

  if (programExcitation > LINE_FEED_PROGRAM_FLOOR_UPDATE_MAX_EXCITATION) {
    return;
  }

  const pauseSignature = isLineFeedMeterIdlePauseSignature(metrics, {
    deviceFloorAvg: bandState.lineFeedDeviceFloorAvg,
    deviceFloorRms: bandState.lineFeedDeviceFloorRms,
  });
  if (programActive && !pauseSignature && !inIdleMeterBand) {
    return;
  }

  const alpha = computeEmaAlpha(
    deltaMs,
    inIdleMeterBand ? 720 : LINE_FEED_PROGRAM_FLOOR_SMOOTHING_MS,
  );

  bandState.lineFeedDeviceFloorAvg +=
    (avg - bandState.lineFeedDeviceFloorAvg) * alpha;
  bandState.lineFeedDeviceFloorRms +=
    (rms - bandState.lineFeedDeviceFloorRms) * alpha;
  bandState.lineFeedDeviceFloorPeak +=
    (peak - bandState.lineFeedDeviceFloorPeak) * alpha;
}

/**
 * @param {{
 *   bandState: any,
 *   metrics: {
 *     avgAmplitude?: number,
 *     rms?: number,
 *     peakAmplitude?: number,
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
      deviceFloorAvg: 0,
      deviceFloorRms: 0,
      deviceFloorPeak: 0,
    };
  }

  if (bandState.lineFeedProgramSessionKey !== analysisSessionKey) {
    resetLineFeedProgramActivityState(bandState, analysisSessionKey);
  }

  const programExcitation = deriveLineFeedProgramExcitation(metrics, {
    deviceFloorAvg: bandState.lineFeedDeviceFloorAvg,
    deviceFloorRms: bandState.lineFeedDeviceFloorRms,
    deviceFloorPeak: bandState.lineFeedDeviceFloorPeak,
  });

  let programActive = bandState.lineFeedProgramActive === true;
  let quietHoldMs = bandState.lineFeedProgramQuietHoldMs ?? 0;
  let pauseIdleHoldMs = bandState.lineFeedProgramPauseIdleHoldMs ?? 0;

  if (programExcitation >= LINE_FEED_PROGRAM_EXCITATION_OPEN) {
    programActive = true;
    quietHoldMs = 0;
    pauseIdleHoldMs = 0;
  } else if (programActive) {
    const avg = metrics?.avgAmplitude ?? 0;
    if (programExcitation >= LINE_FEED_PROGRAM_EXCITATION_HOLD) {
      quietHoldMs = 0;
      pauseIdleHoldMs = 0;
    } else if (
      isLineFeedMeterIdlePauseSignature(metrics, {
        deviceFloorAvg: bandState.lineFeedDeviceFloorAvg,
        deviceFloorRms: bandState.lineFeedDeviceFloorRms,
      })
    ) {
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
    } else if (avg <= LINE_FEED_PROGRAM_BRIDGE_MAX_AVG) {
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
    deviceFloorAvg: bandState.lineFeedDeviceFloorAvg,
    deviceFloorRms: bandState.lineFeedDeviceFloorRms,
    deviceFloorPeak: bandState.lineFeedDeviceFloorPeak,
    quietHoldMs,
  };
}
