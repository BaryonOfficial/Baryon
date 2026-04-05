import { beforeEach, expect, test, vi } from "vitest";
import {
  classifyLiveInputDeviceKind,
  clearDeviceOverride,
  getDeviceKindOverride,
  getLiveInputDeviceKind,
  getLiveInputDeviceKindById,
  saveLiveInputDeviceKindOverride,
} from "./deviceClassification.js";

/** @returns {Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">} */
function createLocalStorageMock() {
  const store = new Map();
  return {
    /** @param {string} key */
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    /** @param {string} key
     *  @param {string} value
     */
    setItem(key, value) {
      store.set(key, String(value));
    },
    /** @param {string} key */
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

/** @returns {MediaDeviceInfo} */
function createDevice(overrides = {}) {
  return {
    deviceId: "device-1",
    label: "Built-in Microphone",
    kind: /** @type {MediaDeviceKind} */ ("audioinput"),
    groupId: "group-1",
    toJSON() {
      return this;
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  localStorage.clear();
});

test("classifies loopback labels and applies manual override lookups", () => {
  const builtInMic = createDevice();
  const loopback = createDevice({
    deviceId: "device-2",
    label: "BlackHole 2ch",
  });

  expect(classifyLiveInputDeviceKind(builtInMic)).toBe("live");
  expect(classifyLiveInputDeviceKind(loopback)).toBe("system");
  expect(getLiveInputDeviceKind(loopback)).toBe("system");

  saveLiveInputDeviceKindOverride(loopback.deviceId, "live");

  expect(getDeviceKindOverride(loopback.deviceId)).toBe("live");
  expect(getLiveInputDeviceKind(loopback)).toBe("live");
  expect(
    getLiveInputDeviceKindById([builtInMic, loopback], loopback.deviceId),
  ).toBe("live");

  clearDeviceOverride(loopback.deviceId);

  expect(getDeviceKindOverride(loopback.deviceId)).toBeNull();
  expect(getLiveInputDeviceKind(loopback)).toBe("system");
});
