/**
 * Device classification: determines whether an audio input device is a
 * physical microphone ("live") or a virtual/loopback device ("system").
 *
 * Heuristic: name-match against known virtual-cable keywords.
 * User overrides are stored in localStorage and take precedence.
 */

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
export function heuristicClassify(device) {
  const label = (device.label || "").toLowerCase();
  return SYSTEM_KEYWORDS.some((k) => label.includes(k)) ? "system" : "live";
}

/**
 * Resolve the effective classification bucket for a device.
 * Manual overrides in localStorage take precedence over heuristics.
 * @param {MediaDeviceInfo | null | undefined} device
 * @returns {"live" | "system"}
 */
export function getDeviceBucket(device) {
  if (!device) {
    return "live";
  }
  const overrides = loadOverrides();
  return overrides[device.deviceId] ?? heuristicClassify(device);
}

/**
 * Resolve a device bucket from a device id and device list.
 * Falls back to mic semantics when the device is unknown.
 * @param {MediaDeviceInfo[]} devices
 * @param {string | null | undefined} deviceId
 * @returns {"live" | "system"}
 */
export function getDeviceBucketById(devices, deviceId) {
  if (!deviceId) {
    return "live";
  }
  const device = devices.find((entry) => entry.deviceId === deviceId);
  return getDeviceBucket(device);
}

/**
 * Classify a list of audioinput devices into mic and system buckets.
 * @param {MediaDeviceInfo[]} devices
 * @returns {{ live: MediaDeviceInfo[], system: MediaDeviceInfo[] }}
 */
export function classifyDevices(devices) {
  const live = [];
  const system = [];
  for (const device of devices) {
    const bucket = getDeviceBucket(device);
    if (bucket === "system") {
      system.push(device);
    } else {
      live.push(device);
    }
  }
  return { live, system };
}

/**
 * Manually assign a device to a bucket, persisted to localStorage.
 * @param {string} deviceId
 * @param {"live"|"system"} bucket
 */
export function saveDeviceOverride(deviceId, bucket) {
  const overrides = loadOverrides();
  overrides[deviceId] = bucket;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
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
