/**
 * Device classification: determines whether an audio input device is a
 * physical microphone (`"live"`) or a virtual/loopback device (`"system"`).
 *
 * The string values are kept for compatibility with existing UI/session state,
 * but semantically they mean:
 * - `"live"`: acoustic microphone device semantics
 * - `"system"`: loopback / virtual / line-feed device semantics
 *
 * Heuristic: name-match against known virtual-cable keywords.
 * User overrides are stored in localStorage and take precedence.
 */

import {
  LIVE_INPUT_DEVICE_KINDS,
  normalizeLiveInputDeviceKind,
} from "@baryon/visualizer/audio/liveInputAnalysis";

const SYSTEM_KEYWORDS = [
  "blackhole",
  "loopback",
  "vb-cable",
  "soundflower",
  "virtual",
  "cable",
  "aggregate",
];

const STORAGE_KEY = "baryon:deviceClassification";

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** @param {MediaDeviceInfo} device */
export function classifyLiveInputDeviceKind(device) {
  const label = (device.label || "").toLowerCase();
  return SYSTEM_KEYWORDS.some((k) => label.includes(k))
    ? LIVE_INPUT_DEVICE_KINDS.loopback
    : LIVE_INPUT_DEVICE_KINDS.acousticMic;
}

/** @deprecated Prefer `classifyLiveInputDeviceKind`. */
export const heuristicClassify = classifyLiveInputDeviceKind;

/**
 * Resolve the effective classification bucket for a device.
 * Manual overrides in localStorage take precedence over heuristics.
 * @param {MediaDeviceInfo | null | undefined} device
 * @returns {import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputDeviceKind}
 */
export function getLiveInputDeviceKind(device) {
  if (!device) {
    return LIVE_INPUT_DEVICE_KINDS.acousticMic;
  }
  const overrides = loadOverrides();
  return normalizeLiveInputDeviceKind(
    overrides[device.deviceId] ?? classifyLiveInputDeviceKind(device),
  );
}

/** @deprecated Prefer `getLiveInputDeviceKind`. */
export const getDeviceBucket = getLiveInputDeviceKind;

/**
 * Resolve a device bucket from a device id and device list.
 * Falls back to mic semantics when the device is unknown.
 * @param {MediaDeviceInfo[]} devices
 * @param {string | null | undefined} deviceId
 * @returns {import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputDeviceKind}
 */
export function getLiveInputDeviceKindById(devices, deviceId) {
  if (!deviceId) {
    return LIVE_INPUT_DEVICE_KINDS.acousticMic;
  }
  const device = devices.find((entry) => entry.deviceId === deviceId);
  return getLiveInputDeviceKind(device);
}

/** @deprecated Prefer `getLiveInputDeviceKindById`. */
export const getDeviceBucketById = getLiveInputDeviceKindById;

/**
 * Classify a list of audioinput devices into mic and system buckets.
 * @param {MediaDeviceInfo[]} devices
 * @returns {{ live: MediaDeviceInfo[], system: MediaDeviceInfo[] }}
 */
export function classifyLiveInputDevices(devices) {
  const live = [];
  const system = [];
  for (const device of devices) {
    const bucket = getLiveInputDeviceKind(device);
    if (bucket === LIVE_INPUT_DEVICE_KINDS.loopback) {
      system.push(device);
    } else {
      live.push(device);
    }
  }
  return { live, system };
}

/** @deprecated Prefer `classifyLiveInputDevices`. */
export const classifyDevices = classifyLiveInputDevices;

/**
 * Manually assign a device to a bucket, persisted to localStorage.
 * @param {string} deviceId
 * @param {import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputDeviceKind} bucket
 */
export function saveLiveInputDeviceKindOverride(deviceId, bucket) {
  const overrides = loadOverrides();
  overrides[deviceId] = normalizeLiveInputDeviceKind(bucket);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** @deprecated Prefer `saveLiveInputDeviceKindOverride`. */
export const saveDeviceOverride = saveLiveInputDeviceKindOverride;

/**
 * Get the manual override kind for a device, or null if none is set.
 * @param {string | null | undefined} deviceId
 * @returns {import("@baryon/visualizer/audio/liveInputAnalysis").LiveInputDeviceKind | null}
 */
export function getDeviceKindOverride(deviceId) {
  if (!deviceId) return null;
  const overrides = loadOverrides();
  const value = overrides[deviceId];
  return value != null ? normalizeLiveInputDeviceKind(value) : null;
}

/**
 * Remove a manual override for a device, reverting to heuristic classification.
 * @param {string} deviceId
 */
export function clearDeviceOverride(deviceId) {
  const overrides = loadOverrides();
  delete overrides[deviceId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
